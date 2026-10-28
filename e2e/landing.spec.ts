// The front page and the sign-in pages: links, the trade picker, the calendar that fills as you scroll,
// the still image where WebGL is missing, reduced motion, and the sign-in form's states.
import { test, expect, type Page } from '@playwright/test'

const english = (page: Page) => page.context().addCookies([{ name: 'lang', value: 'en', domain: 'localhost', path: '/' }])

test.beforeEach(async ({ page }) => { await english(page) })

test('front page: headline, the two ways in, and no sideways scroll on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clients book themselves. You do the work.')
  const hero = page.locator('section[aria-labelledby="hero-h"]')
  await expect(hero.getByRole('link', { name: 'Open your shop free' })).toHaveAttribute('href', '/signup')
  await expect(hero.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0)
})

test('trade picker: click and arrow keys choose one trade at a time', async ({ page }) => {
  await page.goto('/')
  const group = page.getByRole('radiogroup', { name: 'Your business' })
  const hair = group.getByRole('radio', { name: 'Hair salon' })
  await hair.click()
  await expect(hair).toHaveAttribute('aria-checked', 'true')
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(1)
  await page.keyboard.press('ArrowRight')
  const next = group.getByRole('radio', { checked: true })
  await expect(next).not.toHaveAccessibleName('Hair salon')
  await expect(next).toBeFocused()
  // once picked, the trades stop taking turns
  const name = await next.textContent()
  await page.waitForTimeout(6000)
  await expect(group.getByRole('radio', { checked: true })).toHaveText(name!)
})

test('the calendar fills with bookings as the page scrolls', async ({ page }) => {
  await page.goto('/')
  const cal = page.getByRole('figure')
  await expect(cal.locator('[data-booking]')).toHaveCount(0)
  await page.evaluate(() => { const el = document.querySelector('#live')!; window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + el.clientHeight * 0.55) })
  await expect.poll(() => cal.locator('[data-booking]').count()).toBeGreaterThan(3)
})

test('without WebGL the page shows the still image and still works', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      return /webgl/.test(kind) ? null : (get as (...a: unknown[]) => unknown).call(this, kind, ...rest)
    } as typeof get
  })
  await page.goto('/')
  await expect(page.locator('[data-scene]')).toHaveAttribute('data-scene', 'still')
  const poster = await page.locator('.ds-poster').evaluate(el => getComputedStyle(el).backgroundImage)
  expect(poster).toContain('/landing/poster.jpg')
  expect((await page.request.get('/landing/poster.jpg')).status()).toBe(200)
  await page.getByRole('radio', { name: 'Massage & spa' }).click()
  await expect(page.getByRole('radio', { name: 'Massage & spa' })).toHaveAttribute('aria-checked', 'true')
})

test('with reduced motion the trades hold still', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', locale: 'en-US' })
  await ctx.addCookies([{ name: 'lang', value: 'en', domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto('/')
  const group = page.getByRole('radiogroup', { name: 'Your business' })
  await expect(group.getByRole('radio', { name: 'Nail salon' })).toHaveAttribute('aria-checked', 'true')
  // everything is on screen at once, with no fade left half-way
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect.poll(() => page.locator('#steps li').first().evaluate(el => getComputedStyle(el).opacity), { timeout: 3000 }).toBe('1')
  expect(errors.filter(e => /hydrat/i.test(e))).toEqual([])
  await page.waitForTimeout(6000)
  await expect(group.getByRole('radio', { name: 'Nail salon' })).toHaveAttribute('aria-checked', 'true')
  await ctx.close()
})

test('sign-in: required fields, a wrong password, and the show-password toggle', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const pw = page.locator('#password')
  await pw.fill('not-the-password')
  const toggle = page.getByRole('button', { name: 'Show password' })
  await toggle.click()
  await expect(pw).toHaveAttribute('type', 'text')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(pw).toHaveAttribute('type', 'password')
  await page.locator('#email').fill(`nobody-${Date.now()}@example.com`)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Wrong email or password.')).toBeVisible()
  await expect(page.locator('#email')).toHaveValue(/nobody-/)
})
