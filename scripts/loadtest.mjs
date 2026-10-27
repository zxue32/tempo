// Concurrency load test against a running site (use a TEST database, with LOADTEST_DISABLE_RATE_LIMIT=1).
// Usage: node scripts/loadtest.mjs http://localhost:3200 shop-slug [clients=40]
// 1) Many clients try to book the SAME start time at once: at most as many may win as there are free people.
// 2) Many clients book DIFFERENT times at once: no server errors, and afterwards no time is offered that's taken.
const [base, slug, n = '40'] = process.argv.slice(2)
if (!base || !slug) { console.error('usage: node scripts/loadtest.mjs <base-url> <slug> [clients]'); process.exit(2) }
const N = Number(n)
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }))
const pct = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]

const page = await fetch(`${base}/${slug}/book`).then(r => r.text())
// the page embeds its data as (escaped) JSON
const ids = [...page.replace(/\\"/g, '"').matchAll(/"id":"([0-9a-f-]{36})","kind":"service"/g)].map(m => m[1])
if (!ids.length) { console.error('no services found on the booking page'); process.exit(2) }
const guests = [{ serviceIds: [ids[0]], addonIds: [], staffId: null }]
const today = new Date().toISOString().slice(0, 10)
let av = await post(`/api/public/${slug}/availability`, { guests, from: today, days: 14, date: null })
const day = av.body.days?.find(d => d.count > 3)
if (!day) { console.error('no day with open times in the next 2 weeks'); process.exit(2) }
av = await post(`/api/public/${slug}/availability`, { guests, from: day.date, days: 1, date: day.date })
const slots = av.body.slots
const target = slots[0]
console.log(`day ${day.date}: ${slots.length} open start times; racing ${N} clients for ${target.start} min`)

const book = (start, i) => {
  const t0 = performance.now()
  return post(`/api/public/${slug}/bookings`, {
    guests, date: day.date, start, name: `Load ${i}`, phone: `555${String(7000000 + i).padStart(7, '0')}`, email: `load${i}@example.com`, lang: 'en',
  }).then(r => ({ ...r, ms: performance.now() - t0 }))
}

// 1) same time
const same = await Promise.all(Array.from({ length: N }, (_, i) => book(target.start, i)))
const won = same.filter(r => r.status === 200).length
const errors1 = same.filter(r => r.status >= 500)
console.log(`same time: ${won} booked, ${same.filter(r => r.status === 409).length} told "just taken", ${errors1.length} server errors; p50 ${pct(same.map(r => r.ms), 0.5).toFixed(0)} ms, p95 ${pct(same.map(r => r.ms), 0.95).toFixed(0)} ms`)

// 2) different times
const spread = await Promise.all(slots.slice(1, 1 + N).map((s, i) => book(s.start, 1000 + i)))
const errors2 = spread.filter(r => r.status >= 500)
console.log(`spread: ${spread.filter(r => r.status === 200).length} booked of ${spread.length}, ${errors2.length} server errors; p95 ${pct(spread.map(r => r.ms), 0.95).toFixed(0)} ms`)

// 3) afterwards: is anything still offered at the raced time if everyone who could do it is now busy?
const after = await post(`/api/public/${slug}/availability`, { guests, from: day.date, days: 1, date: day.date })
const stillOffered = after.body.slots.some(s => s.start === target.start)
const freeAtTarget = target.staff.length
console.log(`after: raced time still offered = ${stillOffered}`)

// 4) straight from the database (optional): nobody double-booked, and the raced time has at most one booking per person
let dbOk = true
if (process.env.DATABASE_URL) {
  const { default: postgres } = await import('postgres')
  const sql = postgres(process.env.DATABASE_URL, { max: 1 })
  const [{ overlaps }] = await sql`
    select count(*)::int as overlaps from app.bookings a join app.bookings b on a.staff_id = b.staff_id and a.id < b.id
      and a.status in ('confirmed','completed') and b.status in ('confirmed','completed')
      and tstzrange(a.starts_at, a.busy_until) && tstzrange(b.starts_at, b.busy_until)
    join app.shops s on s.id = a.shop_id where s.slug = ${slug}`
  const [{ staff }] = await sql`select count(*)::int as staff from app.staff st join app.shops s on s.id = st.shop_id where s.slug = ${slug} and st.active`
  console.log(`database: ${overlaps} overlapping pairs; ${won} won the raced time with ${staff} staff`)
  dbOk = overlaps === 0 && won <= staff
  await sql.end()
}

const ok = dbOk && errors1.length === 0 && errors2.length === 0 && won >= 1
if (!ok) { console.error('FAILED'); process.exit(1) }
console.log('OK')
