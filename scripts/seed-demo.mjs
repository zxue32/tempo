// Creates (or refreshes) a live demo shop with 3 technicians and a 3-week roster, for trying things out and load tests.
// Usage: DATABASE_URL=... OWNER_PASSWORD=... node scripts/seed-demo.mjs [slug=demo-nails] [owner-email=owner@example.com]
// OWNER_PASSWORD sets (or resets) the owner's password so you can sign in as them.
import postgres from 'postgres'
import { randomBytes, scryptSync } from 'node:crypto'

// same format as src/lib/password.ts
const hashPassword = pw => {
  const salt = randomBytes(16)
  const key = scryptSync(pw.normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return ['scrypt', 16384, 8, 1, salt.toString('base64url'), key.toString('base64url')].join('$')
}
const url = process.env.DATABASE_URL
if (!url) { console.error('Set DATABASE_URL'); process.exit(2) }
const [slug = 'demo-nails', ownerEmail = 'owner@example.com'] = process.argv.slice(2)
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
const sql = postgres(url, { max: 1, ssl: local ? false : 'require', onnotice: () => {} })
// step by calendar date (not by 24 hours, which repeats a date when daylight saving ends)
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const day = d => { const t = new Date(today + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10) }
try {
  await sql.begin(async tx => {
    // OWNER_ID lets a test seed the shop for an account it will sign in as
    const pw = process.env.OWNER_PASSWORD ? hashPassword(process.env.OWNER_PASSWORD) : null
    const [u] = await tx`insert into app.users (id, email, password_hash) values (coalesce(${process.env.OWNER_ID ?? null}::uuid, gen_random_uuid()), ${ownerEmail}, ${pw})
      on conflict (lower(email)) do update set email = excluded.email, password_hash = coalesce(excluded.password_hash, app.users.password_hash) returning id`
    await tx`delete from app.shops where slug = ${slug}`
    const [shop] = await tx`
      insert into app.shops (slug, industry, name, name_zh, phone, email, address, city, timezone, default_lang, theme, notify_emails, owner_id, status, live_at, submitted_at)
      values (${slug}, 'nail', 'Demo Nails', '示范美甲', '(555) 555-0100', ${ownerEmail}, '1 Demo St', 'Brooklyn, NY', 'America/New_York', 'en', 'lacquer', ${[ownerEmail]}, ${u.id}, 'live', now(), now())
      returning id`
    await tx`insert into app.shop_members (shop_id, user_id, role) values (${shop.id}, ${u.id}, 'owner')`
    const svc = [
      ['service', 'hand', 'Gel Manicure', '凝胶美甲', 45, 4000], ['service', 'hand', 'Classic Manicure', '基础美甲', 30, 2500],
      ['service', 'foot', 'Gel Pedicure', '凝胶修脚', 60, 5000], ['service', 'ext', 'Gel-X Extensions', 'Gel-X 延长', 90, 7500],
      ['addon', 'addon', 'Gel Removal', '卸甲', 15, 1000],
    ]
    const ids = []
    for (const [i, [kind, cat, name, zh, dur, price]] of svc.entries()) {
      const [r] = await tx`insert into app.services (shop_id, kind, category, applies_to, name, name_zh, duration_min, price_cents, sort, question_en, question_zh)
        values (${shop.id}, ${kind}, ${cat}, ${kind === 'addon' ? ['hand', 'ext'] : []}, ${name}, ${zh}, ${dur}, ${price}, ${i},
          ${kind === 'addon' ? 'Do you have gel or acrylic on your nails now?' : null}, ${kind === 'addon' ? '现在手上有没有甲胶或甲片？' : null}) returning id`
      ids.push([r.id, kind])
    }
    const staff = []
    for (const [i, [name, zh, color]] of [['Mia', '米娅', '#C2185B'], ['Luna', '露娜', '#7B5EA7'], ['Ivy', '艾薇', '#2E7D6B']].entries()) {
      const [st] = await tx`insert into app.staff (shop_id, name, name_zh, color, sort, commission_pct, default_week) values (${shop.id}, ${name}, ${zh}, ${color}, ${i}, 40, ${tx.json(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(wd => [String(wd), { start: 600 + i * 30, end: 1110 + i * 30, breaks: [[780 + i * 30, 810 + i * 30]] }])))}) returning id`
      staff.push(st.id)
      for (const [sid, kind] of ids) if (kind === 'service') await tx`insert into app.staff_services (staff_id, service_id) values (${st.id}, ${sid})`
    }
    for (let d = 0; d < 21; d++) for (const [i, st] of staff.entries()) {
      await tx`insert into app.shifts (shop_id, staff_id, date, start_min, end_min, breaks) values (${shop.id}, ${st}, ${day(d)}, ${600 + i * 30}, ${1110 + i * 30}, ${tx.json([[780 + i * 30, 810 + i * 30]])})`
    }
    console.log(`demo shop ready: /${slug} (owner ${ownerEmail})`)
  })
} finally {
  await sql.end()
}
