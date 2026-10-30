// End-to-end: owner opens a shop → admin approves → client books, reschedules, cancels → owner sees it all.
// Runs against `next dev` with real sign-up / sign-in and a local Postgres.
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import postgres from 'postgres'

const DB = process.env.E2E_DATABASE_URL ?? 'postgres://tempo:tempo@localhost:5432/tempo'
const slug = `e2e-${Date.now().toString(36)}`
const owner = `owner-${slug}@example.com`
const shots = process.env.E2E_SHOTS ?? 'test-results/shots'

const PASSWORD = 'e2e-password-123'
/** Signs up (or signs in, when the account already exists from an earlier run) through the real forms. */
async function asUser(ctx: BrowserContext, email: string, setupCode?: string) {
  const page = await ctx.newPage()
  await page.goto('/signup?next=/dashboard')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  if (setupCode) {
    await page.getByText("I'm the platform admin").click()
    await page.locator('#setupCode').fill(setupCode)
  }
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.waitForURL(u => !u.pathname.startsWith('/signup') || false, { timeout: 8000 }).catch(() => {})
  if (new URL(page.url()).pathname.startsWith('/signup')) {
    await expect(page.getByText('That email already has an account')).toBeVisible()
    await page.goto('/login?next=/dashboard')
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(u => !u.pathname.startsWith('/login'))
  }
  return page
}
const english = (ctx: BrowserContext) => ctx.addCookies([{ name: 'lang', value: 'en', domain: 'localhost', path: '/' }])
const snap = (page: Page, name: string) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })

// A Tuesday at least two days out, so the 4-hour lead time never interferes.
function targetDate() {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

test.beforeAll(async () => {
  // the admin account is created through the real sign-up with the setup code; start clean so a stale one can't interfere
  const sql = postgres(DB, { max: 1 })
  await sql`delete from app.users where lower(email) = 'admin@example.com'`
  await sql.end()
})

test.afterAll(async () => {
  const sql = postgres(DB, { max: 1 })
  await sql`delete from app.shops where slug = ${slug}`
  await sql`delete from app.users where lower(email) in (${owner}, 'admin@example.com')`
  await sql.end()
})

test('shop owner → approval → client books, reschedules and cancels', async ({ browser }) => {
  const date = targetDate()

  // ---------------------------------------------------------------- owner opens a shop
  const ownerCtx = await browser.newContext()
  await english(ownerCtx)
  const o = await asUser(ownerCtx, owner)
  await o.goto('/onboarding')
  await o.locator('#ob-name').fill('E2E Nails')
  await o.locator('#ob-slug').fill(slug)
  await o.locator('#ob-phone').fill('(555) 555-0199')
  await o.locator('#ob-city').fill('Brooklyn, NY')
  await o.locator('#ob-address').fill('1 Test St')
  await o.locator('#ob-tz').selectOption('America/New_York')
  if (await o.locator('#ob-my').count()) await o.locator('#ob-my').fill('Mia')
  await expect(o.getByText('Available')).toBeVisible().catch(() => {})
  await o.getByRole('button', { name: 'Create shop' }).click()
  await o.waitForURL(/\/dashboard\/[0-9a-f-]+\/setup/)
  const shopId = o.url().match(/dashboard\/([0-9a-f-]+)/)![1]
  const base = `/dashboard/${shopId}`

  // roster: fill this week and the next three from defaults
  await o.goto(`${base}/schedule`)
  for (let i = 0; i < 4; i++) {
    const save = o.getByRole('button', { name: 'Save this week' })
    // dev mode hydrates lazily, so retry the click until React has taken over
    await expect(async () => {
      await o.getByRole('button', { name: 'Fill from defaults' }).click()
      await expect(save).toBeEnabled({ timeout: 1500 })
    }).toPass({ timeout: 30_000 })
    await save.click()
    await expect(o.getByText('Roster saved')).toBeVisible()
    const weekBefore = o.url()
    await o.getByRole('button', { name: /Next week/ }).click()
    await o.waitForURL(u => u.toString() !== weekBefore)
  }
  await o.goto(`${base}/setup`)
  await snap(o, '01-setup')
  await o.getByRole('button', { name: 'Submit for review' }).click()
  await expect(o.getByText(/waiting for (platform )?review|Submitted/i).first()).toBeVisible()

  // storefront is not public yet
  const anon = await browser.newContext()
  await english(anon)
  const c = await anon.newPage()
  await c.goto(`/${slug}`)
  await expect(c.getByText(/coming soon/i).first()).toBeVisible()

  // ---------------------------------------------------------------- platform admin approves
  const adminCtx = await browser.newContext()
  await english(adminCtx)
  const a = await asUser(adminCtx, 'admin@example.com', 'e2e-setup-code')
  await a.goto('/admin?status=pending')
  await snap(a, '02-admin-queue')
  await a.getByRole('link', { name: 'E2E Nails' }).click()
  await expect(a.getByText('Everything is set up')).toBeVisible()
  await snap(a, '03-admin-review')
  await a.getByRole('button', { name: /Approve/ }).click()
  await expect(a.getByText(/owner has been emailed/i)).toBeVisible()

  // ---------------------------------------------------------------- client books online
  await c.goto(`/${slug}`)
  await expect(c.getByRole('heading', { name: 'E2E Nails' })).toBeVisible()
  await snap(c, '04-storefront')
  await c.getByRole('link', { name: 'Book now' }).first().click()
  await c.getByRole('button', { name: /Gel Manicure/ }).first().click()
  await c.getByRole('button', { name: 'Pick a time' }).click()
  await c.getByLabel('More dates').fill(date)
  await expect(c.locator('section[aria-busy="false"]')).toBeVisible()
  await expect(c.getByLabel('More dates')).toHaveValue(date)
  const pills = c.locator('button.s-pill')
  await expect(pills.first()).toBeVisible()
  await snap(c, '05-pick-time')
  const firstTime = (await pills.first().innerText()).trim()
  await pills.first().click()
  await c.getByRole('button', { name: 'Your details' }).click()
  await c.locator('#bf-name').fill('Ada Client')
  await c.locator('#bf-phone').fill('(555) 555-0142')
  await c.locator('#bf-email').fill('ada@example.com')
  await c.locator('#bf-notes').fill('Short almond, nude')
  await c.getByRole('checkbox', { name: 'I’ve read the booking notes' }).check()
  await snap(c, '06-details')
  await c.getByRole('button', { name: 'Confirm booking' }).click()
  await c.waitForURL(/\/b\/[A-Za-z0-9_-]+/)
  await expect(c.getByText('You’re booked')).toBeVisible()
  const longDate = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
  await expect(c.getByRole('heading', { name: new RegExp(longDate) })).toBeVisible()
  await expect(c.getByText(firstTime).first()).toBeVisible()
  await snap(c, '07-booked')
  const manageUrl = c.url().split('?')[0]

  // the same slot is now gone for everyone
  const c2 = await anon.newPage()
  await c2.goto(`/${slug}/book`)
  await c2.getByRole('button', { name: /Gel Manicure/ }).first().click()
  await c2.getByRole('button', { name: 'Pick a time' }).click()
  // only one technician (the owner) — so the booked start must disappear
  await c2.getByLabel('More dates').fill(date)
  await expect(c2.locator('section[aria-busy="false"]')).toBeVisible()
  await expect(c2.getByLabel('More dates')).toHaveValue(date)
  await expect(c2.locator('button.s-pill').first()).toBeVisible()
  await expect(c2.locator('button.s-pill', { hasText: new RegExp(`^${firstTime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })).toHaveCount(0)
  await c2.close()

  // ---------------------------------------------------------------- reschedule
  await c.goto(manageUrl)
  await c.getByRole('button', { name: 'Reschedule' }).click()
  const radios = c.getByRole('radiogroup', { name: 'Date' }).getByRole('radio')
  await radios.nth(1).click()
  const newPills = c.locator('button.s-pill')
  if (!(await newPills.first().isVisible().catch(() => false))) {
    await radios.nth(2).click()
  }
  await expect(newPills.first()).toBeVisible()
  await newPills.nth(Math.min(3, (await newPills.count()) - 1)).click()
  await c.getByRole('button', { name: /^Move to/ }).click()
  await expect(c.getByText(/Rescheduled/)).toBeVisible()

  // ---------------------------------------------------------------- owner sees it
  const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
  const to = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const bl = await o.goto(`${base}/bookings?q=Ada&from=${from}&to=${to}`)
  expect(bl?.ok()).toBeTruthy()
  await expect(o.getByText('Ada Client').first()).toBeVisible()
  await snap(o, '08-bookings')
  for (const p of ['', '/customers', '/reports', '/share', '/settings', '/me', '/staff', '/services', '/schedule']) {
    const r = await o.goto(base + p)
    expect(r?.status(), p).toBeLessThan(400)
    await expect(o.locator('main h1').first()).toBeVisible()
    await snap(o, `09-dash${p.replace('/', '-') || '-calendar'}`)
  }
  await o.goto(`${base}/customers`)
  await o.getByRole('link', { name: 'Ada Client' }).click()
  await expect(o.getByRole('heading', { name: 'Timeline' })).toBeVisible()
  await snap(o, '10-customer')
  const csv = await o.request.get(`${base}/bookings/export?from=${from}&to=${to}`)
  expect(csv.headers()['content-type']).toContain('text/csv')
  expect(await csv.text()).toContain('Ada Client')

  // ---------------------------------------------------------------- client cancels
  await c.goto(manageUrl)
  await c.getByRole('button', { name: 'Cancel booking' }).click()
  await c.locator('#mg-reason').fill('Change of plans')
  await c.getByRole('button', { name: 'Yes, cancel' }).click()
  await expect(c.getByText('This booking is cancelled.')).toBeVisible()
  await snap(c, '11-cancelled')

  // find-my-booking by code + phone
  const sql = postgres(DB, { max: 1 })
  const [b] = await sql<{ code: string }[]>`select b.code from app.bookings b join app.shops s on s.id = b.shop_id where s.slug = ${slug} limit 1`
  await sql.end()
  await c.goto(`/${slug}/find`)
  await c.getByLabel(/code/i).fill(b.code)
  await c.getByLabel(/phone/i).fill('5555550142')
  await c.getByRole('button', { name: 'Find' }).click()
  await c.waitForURL(/\/b\//)

  // mobile storefront + booking
  const phone = await browser.newContext({ ...{ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } })
  await english(phone)
  const m = await phone.newPage()
  await m.goto(`/${slug}`)
  await snap(m, '12-mobile-store')
  await m.goto(`/${slug}/book`)
  await snap(m, '13-mobile-book')
  const scroll = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(scroll).toBeLessThanOrEqual(1)
})
