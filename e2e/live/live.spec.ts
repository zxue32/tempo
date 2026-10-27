// Smoke test against the deployed site (no database access; test data is removed afterwards by SQL).
// LIVE_URL=https://… LIVE_ADMIN_EMAIL=… LIVE_SETUP_CODE=… npx playwright test -c e2e/live/live.config.ts
import { test, expect, type BrowserContext } from '@playwright/test'

const BASE = (process.env.LIVE_URL || '').replace(/\/$/, '')
const ADMIN = process.env.LIVE_ADMIN_EMAIL || ''
const SETUP = process.env.LIVE_SETUP_CODE || ''
const id = Date.now().toString(36)
const slug = `live-test-${id}`
const owner = `live-owner-${id}@example.com`
const PASSWORD = `Live-test-${id}-pw`
const shots = 'test-results/live'

async function english(ctx: BrowserContext) {
  await ctx.addCookies([{ name: 'lang', value: 'en', url: BASE }])
}

async function signUp(ctx: BrowserContext, email: string, setupCode?: string) {
  const page = await ctx.newPage()
  await page.goto('/signup?next=/dashboard')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  if (setupCode) {
    await page.getByText("I'm the platform admin").click()
    await page.locator('#setupCode').fill(setupCode)
  }
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.waitForURL(u => !u.pathname.startsWith('/signup'))
  return page
}

function targetDate() {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

test('live: sign up → open shop → admin approves → client books, reschedules, cancels', async ({ browser }) => {
  expect(BASE, 'LIVE_URL').not.toBe('')
  const date = targetDate()

  // home page and log-in page load
  const anon = await browser.newContext()
  await english(anon)
  const c = await anon.newPage()
  const home = await c.goto('/')
  expect(home?.status()).toBe(200)
  await c.screenshot({ path: `${shots}/00-home.png`, fullPage: true })

  // owner signs up and opens a shop
  const ownerCtx = await browser.newContext()
  await english(ownerCtx)
  const o = await signUp(ownerCtx, owner)
  await o.goto('/onboarding')
  await o.locator('#ob-name').fill('Live Test Nails')
  await o.locator('#ob-slug').fill(slug)
  await o.locator('#ob-phone').fill('(555) 555-0199')
  await o.locator('#ob-city').fill('Brooklyn, NY')
  await o.locator('#ob-address').fill('1 Test St')
  await o.locator('#ob-tz').selectOption('America/New_York')
  if (await o.locator('#ob-my').count()) await o.locator('#ob-my').fill('Mia')
  await o.getByRole('button', { name: 'Create shop' }).click()
  await o.waitForURL(/\/dashboard\/[0-9a-f-]+\/setup/)
  const shopId = o.url().match(/dashboard\/([0-9a-f-]+)/)![1]
  const base = `/dashboard/${shopId}`
  console.log('LIVE_SHOP', slug, shopId)

  await o.goto(`${base}/schedule`)
  for (let i = 0; i < 3; i++) {
    const save = o.getByRole('button', { name: 'Save this week' })
    await expect(async () => {
      await o.getByRole('button', { name: 'Fill from defaults' }).click()
      await expect(save).toBeEnabled({ timeout: 1500 })
    }).toPass({ timeout: 30_000 })
    await save.click()
    await expect(o.getByText('Roster saved')).toBeVisible()
    const before = o.url()
    await o.getByRole('button', { name: /Next week/ }).click()
    await o.waitForURL(u => u.toString() !== before)
  }
  await o.goto(`${base}/setup`)
  await o.getByRole('button', { name: 'Submit for review' }).click()
  await expect(o.getByText(/waiting for (platform )?review|Submitted/i).first()).toBeVisible()

  await c.goto(`/${slug}`)
  await expect(c.getByText(/coming soon/i).first()).toBeVisible()

  // platform admin signs up with the setup code and approves
  const adminCtx = await browser.newContext()
  await english(adminCtx)
  const a = await signUp(adminCtx, ADMIN, SETUP)
  await a.goto('/admin?status=pending')
  await a.getByRole('link', { name: 'Live Test Nails' }).click()
  await a.getByRole('button', { name: /Approve/ }).click()
  await expect(a.getByText(/owner has been emailed|Approved|live/i).first()).toBeVisible()
  await a.goto('/admin/accounts')
  await expect(a.getByText(owner)).toBeVisible()

  // client books
  await c.goto(`/${slug}`)
  await expect(c.getByRole('heading', { name: 'Live Test Nails' })).toBeVisible()
  await c.screenshot({ path: `${shots}/01-storefront.png`, fullPage: true })
  await c.getByRole('link', { name: 'Book now' }).first().click()
  await c.getByRole('button', { name: /Gel Manicure/ }).first().click()
  await c.getByRole('button', { name: 'Pick a time' }).click()
  await c.getByLabel('More dates').fill(date)
  await expect(c.locator('section[aria-busy="false"]')).toBeVisible()
  const pills = c.locator('button.s-pill')
  await expect(pills.first()).toBeVisible()
  const firstTime = (await pills.first().innerText()).trim()
  await pills.first().click()
  await c.getByRole('button', { name: 'Your details' }).click()
  await c.locator('#bf-name').fill('Live Test Client')
  await c.locator('#bf-phone').fill('(555) 555-0142')
  await c.locator('#bf-email').fill('live-client@example.com')
  await c.getByRole('checkbox').check()
  await c.getByRole('button', { name: 'Confirm booking' }).click()
  await c.waitForURL(/\/b\/[A-Za-z0-9_-]+/)
  await expect(c.getByText('You’re booked')).toBeVisible()
  await c.screenshot({ path: `${shots}/02-booked.png`, fullPage: true })
  const manageUrl = c.url().split('?')[0]

  // that start time is gone for the next client
  const c2 = await anon.newPage()
  await c2.goto(`/${slug}/book`)
  await c2.getByRole('button', { name: /Gel Manicure/ }).first().click()
  await c2.getByRole('button', { name: 'Pick a time' }).click()
  await c2.getByLabel('More dates').fill(date)
  await expect(c2.locator('section[aria-busy="false"]')).toBeVisible()
  await expect(c2.locator('button.s-pill').first()).toBeVisible()
  const esc = firstTime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await expect(c2.locator('button.s-pill', { hasText: new RegExp(`^${esc}$`) })).toHaveCount(0)
  await c2.close()

  // a reference photo is stored and served back
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const up = await c.request.post(`/api/public/${slug}/upload`, { multipart: { file: { name: 'ref.png', mimeType: 'image/png', buffer: png } } })
  expect(up.status(), await up.text()).toBe(200)
  const { url } = await up.json()
  const img = await c.request.get(url)
  expect(img.status()).toBe(200)
  expect(img.headers()['content-type']).toContain('image/png')

  // reschedule
  await c.goto(manageUrl)
  await c.getByRole('button', { name: 'Reschedule' }).click()
  const radios = c.getByRole('radiogroup', { name: 'Date' }).getByRole('radio')
  await radios.nth(1).click()
  const newPills = c.locator('button.s-pill')
  if (!(await newPills.first().isVisible().catch(() => false))) await radios.nth(2).click()
  await expect(newPills.first()).toBeVisible()
  await newPills.nth(Math.min(3, (await newPills.count()) - 1)).click()
  await c.getByRole('button', { name: /^Move to/ }).click()
  await expect(c.getByText(/Rescheduled/)).toBeVisible()

  // owner sees the booking; every dashboard page loads
  const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
  const to = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  await o.goto(`${base}/bookings?q=Live&from=${from}&to=${to}`)
  await expect(o.getByText('Live Test Client').first()).toBeVisible()
  for (const p of ['', '/customers', '/reports', '/share', '/settings', '/me', '/staff', '/services', '/schedule', '/rules', '/gallery', '/pilot']) {
    const r = await o.goto(base + p)
    expect(r?.status(), p).toBeLessThan(400)
    await expect(o.locator('main h1').first()).toBeVisible()
  }
  await o.goto(base)
  await o.screenshot({ path: `${shots}/03-dashboard.png`, fullPage: true })

  // client cancels
  await c.goto(manageUrl)
  await c.getByRole('button', { name: 'Cancel booking' }).click()
  await c.locator('#mg-reason').fill('Live test')
  await c.getByRole('button', { name: 'Yes, cancel' }).click()
  await expect(c.getByText('This booking is cancelled.')).toBeVisible()

  // signing out and back in works
  await o.goto('/dashboard')
  await o.getByRole('button', { name: 'Sign out' }).click()
  await o.waitForURL(u => !u.pathname.startsWith('/dashboard'))
  await o.goto('/login?next=/dashboard')
  await o.locator('#email').fill(owner)
  await o.locator('#password').fill(PASSWORD)
  await o.getByRole('button', { name: 'Sign in' }).click()
  await o.waitForURL(/\/dashboard/)

  // the cron endpoint refuses callers without the secret
  const cron = await c.request.get('/api/cron/reminders')
  expect(cron.status()).toBe(401)
})
