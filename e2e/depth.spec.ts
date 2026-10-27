// End-to-end for the depth features: gallery → "book this look", intake question, equipment and gap rules,
// waitlist, client confirmation, start/finish timing, pilot page (replay, check, print) — with accessibility checks.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import postgres from 'postgres'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const DB = process.env.E2E_DATABASE_URL ?? 'postgres://tempo:tempo@localhost:5432/tempo'
const slug = `depth-${Date.now().toString(36)}`
const owner = `owner-${slug}@example.com`
const shots = process.env.E2E_SHOTS ?? 'test-results/shots'
// a tiny real PNG (the browser re-encodes it to JPEG before upload)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64')
const a11yReport: Array<{ page: string; id: string; impact: string | null | undefined; nodes: number; help: string; targets: string[]; summary: string[] }> = []

async function a11y(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  for (const v of r.violations) a11yReport.push({ page: name, id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, targets: v.nodes.map(n => n.target.join(' ')).slice(0, 5), summary: v.nodes.map(n => (n.failureSummary || '').slice(0, 200)).slice(0, 2) })
  const bad = r.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
  expect.soft(bad.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`), `accessibility on ${name}`).toEqual([])
}
const snap = (page: Page, name: string) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
function targetDate() {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  while (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

test.beforeAll(() => {
  execFileSync('node', ['scripts/seed-demo.mjs', slug, owner], { env: { ...process.env, DATABASE_URL: DB, OWNER_PASSWORD: 'depth-password-1' } })
})
test.afterAll(async () => {
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/a11y.json', JSON.stringify(a11yReport, null, 2))
  const sql = postgres(DB, { max: 1 })
  await sql`delete from app.shops where slug = ${slug}`
  await sql`delete from app.users where email in (${owner}, ${'luna-' + slug + '@example.com'})`
  await sql.end()
})

test('gallery, rules, intake question, waitlist, confirmation and pilot evidence', async ({ browser }) => {
  const date = targetDate()
  const sql = postgres(DB, { max: 1, transform: postgres.camel })
  const [{ id: shopId }] = await sql<{ id: string }[]>`select id from app.shops where slug = ${slug}`
  const base = `/dashboard/${shopId}`

  // ---------------------------------------------------------------- owner: gallery
  const ownerCtx = await browser.newContext()
  await ownerCtx.addCookies([{ name: 'lang', value: 'en', domain: 'localhost', path: '/' }])
  const o = await ownerCtx.newPage()
  await o.goto('/login')
  await o.locator('#email').fill(owner)
  await o.locator('#password').fill('depth-password-1')
  await o.getByRole('button', { name: 'Sign in' }).click()
  await o.waitForURL(u => !u.pathname.startsWith('/login'))
  await expect(o.getByText('Wrong email or password')).toHaveCount(0)

  // ---------------------------------------------------------------- staff join link (no email needed)
  await o.goto(`${base}/staff`)
  await expect(async () => {
    await o.locator('main .card').filter({ hasText: 'Luna' }).getByRole('button', { name: 'Edit' }).click()
    await expect(o.getByRole('button', { name: 'Make join link' })).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30_000 })
  const luna = o.locator('main .card').filter({ has: o.locator('input[value="Luna"]') })
  await luna.getByRole('button', { name: 'Make join link' }).click()
  await expect(luna.locator('code').first()).toBeVisible()
  const joinLink = (await luna.locator('code').first().innerText()).trim()
  expect(joinLink).toMatch(/\/join\/[A-Za-z0-9_-]+$/)
  const staffCtx = await browser.newContext()
  await staffCtx.addCookies([{ name: 'lang', value: 'en', domain: 'localhost', path: '/' }])
  const sp = await staffCtx.newPage()
  await sp.goto(new URL(joinLink).pathname)
  await sp.getByRole('link', { name: 'Create an account and join' }).click()
  await sp.locator('#email').fill(`luna-${slug}@example.com`)
  await sp.locator('#password').fill('luna-password-1')
  await sp.getByRole('button', { name: 'Sign up' }).click()
  await sp.getByRole('button', { name: 'Join', exact: true }).click()
  await sp.waitForURL(/\/me$/)
  await expect(sp.getByRole('heading', { name: 'My day' })).toBeVisible()
  await expect(sp.getByText(/Luna/).first()).toBeVisible()
  // the link is single-use
  const sp2 = await (await browser.newContext()).newPage()
  await sp2.goto(new URL(joinLink).pathname)
  await expect(sp2.getByText(/already used or has expired/)).toBeVisible()

  await o.goto(`${base}/gallery`)
  await expect(async () => {
    await o.locator('input[type=file]').setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: PNG },
      { name: 'b.png', mimeType: 'image/png', buffer: PNG },
    ])
    await expect(o.locator('main li img')).toHaveCount(2, { timeout: 8000 })
  }).toPass({ timeout: 40_000 })
  const card = o.locator('main li').first()
  await card.getByLabel('Who did it').selectOption({ label: 'Mia' })
  await card.getByLabel('Which service').selectOption({ label: 'Gel Manicure' })
  await card.getByLabel('Caption (English, optional)').fill('Milky nude chrome')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(o.getByText('Saved', { exact: true })).toBeVisible()
  await a11y(o, 'dashboard gallery')
  await snap(o, 'd01-gallery')

  // ---------------------------------------------------------------- owner: shop rules
  await o.goto(`${base}/rules`)
  await o.getByRole('button', { name: '+ Add equipment' }).click()
  await o.locator('#eq-new-n').fill('Pedicure chair')
  await o.locator('#eq-new-q').fill('1')
  await o.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(o.getByText('No services use it yet')).toBeVisible()
  await expect(o.getByText('No equipment yet.')).toHaveCount(0)
  await o.getByLabel('Hide times that leave a gap shorter than').selectOption('30')
  await o.getByRole('radio', { name: /Take turns/ }).click()
  await o.getByRole('button', { name: 'Save', exact: true }).last().click()
  await expect(o.getByText('Saved', { exact: true })).toBeVisible()
  await a11y(o, 'dashboard rules')
  await snap(o, 'd02-rules')
  await expect.poll(async () => (await sql`select min_gap, assign_mode from app.shops where id = ${shopId}`)[0]).toMatchObject({ minGap: 30, assignMode: 'turns' })

  // pedicures now need the chair
  await o.goto(`${base}/services`)
  const pedi = o.locator('main .card').filter({ has: o.locator('input[value="Gel Pedicure"]') })
  await pedi.getByLabel('Equipment needed').selectOption({ label: 'Pedicure chair × 1' })
  await pedi.getByRole('button', { name: 'Save' }).click()
  await expect.poll(async () => (await sql`select resource_id from app.services where shop_id = ${shopId} and name = 'Gel Pedicure'`)[0].resourceId).not.toBeNull()

  // ---------------------------------------------------------------- client: book this look
  const cctx = await browser.newContext()
  await cctx.addCookies([{ name: 'lang', value: 'en', domain: 'localhost', path: '/' }])
  const c = await cctx.newPage()
  await c.goto(`/${slug}`)
  await expect(c.getByRole('heading', { name: 'Our work' })).toBeVisible()
  await a11y(c, 'storefront')
  await snap(c, 'd03-storefront')
  await c.getByRole('button', { name: 'Milky nude chrome' }).click()
  await expect(c.getByRole('dialog')).toBeVisible()
  await snap(c, 'd04-lightbox')
  await c.getByRole('link', { name: 'Book this look' }).click()
  await c.waitForURL(/\/book\?/)
  await expect(c.getByRole('button', { name: /Gel Manicure/ })).toHaveAttribute('aria-pressed', 'true')
  // intake question instead of an add-on checkbox
  await expect(c.getByText('Do you have gel or acrylic on your nails now?')).toBeVisible()
  await expect(c.getByRole('button', { name: 'Pick a time' })).toBeDisabled()
  await c.getByRole('group', { name: 'Do you have gel or acrylic on your nails now?' }).getByRole('button', { name: 'Yes' }).click()
  await a11y(c, 'booking: services')
  await snap(c, 'd05-question')
  await c.getByRole('button', { name: 'Pick a time' }).click()
  await c.getByLabel('More dates').fill(date)
  await expect(c.locator('section[aria-busy="false"]')).toBeVisible()
  const pills = c.locator('button.s-pill:not([role])')
  await expect(pills.first()).toBeVisible()
  await a11y(c, 'booking: time')
  // join the waitlist for that day (it works even when times are still open)
  await c.getByRole('button', { name: 'None of these work? Join the waitlist' }).click()
  await c.locator('#wl-name').fill('Wanda Wait')
  await c.locator('#wl-email').fill('wanda@example.com')
  await c.getByRole('button', { name: 'Join waitlist' }).click()
  await expect(c.getByText(/You're on the waitlist/)).toBeVisible()
  const [w] = await sql`select count(*)::int as n from app.waitlist where shop_id = ${shopId} and email = 'wanda@example.com'`
  expect(w.n).toBe(1)
  await snap(c, 'd06-time-waitlist')
  await pills.first().click()
  await c.getByRole('button', { name: 'Your details' }).click()
  await expect(c.getByText('This is the look you picked from the gallery')).toBeVisible()
  await c.locator('#bf-name').fill('Lola Look')
  await c.locator('#bf-phone').fill('(555) 555-0177')
  await c.locator('#bf-email').fill('lola@example.com')
  await c.getByRole('checkbox').check()
  await a11y(c, 'booking: details')
  await c.getByRole('button', { name: 'Confirm booking' }).click()
  await c.waitForURL(/\/b\/[A-Za-z0-9_-]+/)
  await expect(c.getByText('You’re booked')).toBeVisible()
  await expect(c.getByText(/Gel Removal/)).toBeVisible()
  const manage = c.url().split('?')[0]
  const [bk] = await sql<{ id: string; staffId: string; photoUrl: string | null; durationMin: number }[]>`
    select b.id, b.staff_id, b.photo_url, b.duration_min from app.bookings b where b.shop_id = ${shopId} and b.guest_name = 'Lola Look'`
  const [mia] = await sql<{ id: string }[]>`select id from app.staff where shop_id = ${shopId} and name = 'Mia'`
  expect(bk.staffId).toBe(mia.id)
  expect(bk.photoUrl).toBeTruthy()
  expect(bk.durationMin).toBe(45 + 15) // gel manicure + removal from the yes-answer
  await a11y(c, 'manage booking')

  // ---------------------------------------------------------------- client confirms from the reminder link
  await c.goto(manage + '?confirm=1')
  await c.getByRole('button', { name: 'Yes, I’ll be there' }).click()
  await expect(c.getByText('Confirmed. See you then!')).toBeVisible()
  await snap(c, 'd07-confirmed')

  // ---------------------------------------------------------------- owner: calendar shows it; start + finish
  await o.goto(`${base}?date=${date}&open=${bk.id}`)
  await expect(o.getByText('Client confirmed').first()).toBeVisible()
  await a11y(o, 'calendar + detail')
  await o.getByRole('button', { name: '▶ Start' }).click()
  await expect(o.getByText(/Started/).first()).toBeVisible()
  await o.getByRole('button', { name: 'Complete', exact: true }).click()
  await expect.poll(async () => (await sql`select status, actual_start, actual_end from app.bookings where id = ${bk.id}`)[0]).toMatchObject({ status: 'completed' })
  const [timed] = await sql`select actual_start is not null as s, actual_end is not null as e from app.bookings where id = ${bk.id}`
  expect(timed).toEqual({ s: true, e: true })
  await snap(o, 'd08-calendar')

  // ---------------------------------------------------------------- owner: pilot page
  await o.goto(`${base}/pilot`)
  await expect(o.getByRole('heading', { name: 'Pilot data' })).toBeVisible()
  await o.getByLabel('Paste the sheet').fill(`date,start,end,staff,services\n${date},10:00,10:50,Mia,Gel Manicure\n${date},10:30,,Mia,Gel Pedicure`)
  await o.getByRole('button', { name: 'Run the replay' }).click()
  await expect(o.getByText('1 of 2 fit. These don\'t:')).toBeVisible()
  await expect(o.getByText(/Overlaps the previous visit/)).toBeVisible()
  await o.getByRole('button', { name: 'Check now' }).click()
  await expect(o.getByText('No errors found')).toBeVisible()
  await a11y(o, 'pilot')
  await snap(o, 'd09-pilot')
  await o.goto(`${base}/print?date=${date}`)
  await expect(o.getByText('Lola Look')).toBeVisible()
  await snap(o, 'd10-print')

  // ---------------------------------------------------------------- phone sized
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await phone.addCookies([{ name: 'lang', value: 'en', domain: 'localhost', path: '/' }])
  const m = await phone.newPage()
  for (const path of [`/${slug}`, `/${slug}/gallery`, `/${slug}/book?service=${(await sql`select id from app.services where shop_id = ${shopId} and name = 'Gel Manicure'`)[0].id}`]) {
    await m.goto(path)
    await m.waitForLoadState('networkidle')
    expect(await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(1)
  }
  await snap(m, 'd11-mobile-question')
  await sql.end()
})
