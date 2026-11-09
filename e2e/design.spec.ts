// The 3D nail studio page and the hand-over of its design into a booking.
// Uses the seeded demo shop (scripts/seed-demo.mjs demo-nails …); skipped when it isn't there.
import { test, expect } from '@playwright/test'
import postgres from 'postgres'

const DB = process.env.E2E_DATABASE_URL ?? 'postgres://tempo:tempo@localhost:5432/tempo'
const SLUG = 'demo-nails'
const english = { name: 'lang', value: 'en', domain: 'localhost', path: '/' }

test('the studio page loads the 3D module and its hand model', async ({ page, request }) => {
  await page.context().addCookies([english])
  const res = await page.goto(`/${SLUG}/design`)
  test.skip(res?.status() === 404, 'demo shop not seeded')
  await expect(page.locator('lune-nail-studio')).toHaveCount(1, { timeout: 30_000 })
  const js = await request.get('/vendor/lune-nail-studio.js')
  expect(js.status()).toBe(200)
  const glb = await request.head('/models/tripo-hand.glb')
  expect(glb.status()).toBe(200)
  // the shop page opens it from a folded card
  await page.goto(`/${SLUG}`)
  await expect(page.getByRole('link', { name: /Open the 3D studio/ })).toHaveAttribute('href', `/${SLUG}/design`)
})

test('a design from the studio travels with the booking: note for the technician and the design itself', async ({ page }) => {
  await page.context().addCookies([english])
  const summary = 'Almond · medium · jelly nude · cat-eye silver · gloss top coat; ring finger: milky white + star'
  const design = { shape: 'almond', length: 'medium', color: '#d9b8a8', color2: '#f0e6dc', finish: 'chrome', art: 'accent', colorName: 'Moonlight cat-eye' }
  await page.addInitScript(([slug, d, s]) => {
    sessionStorage.setItem('tempo.lune', JSON.stringify({ slug, design: d, summary: s, name: 'Moonlight cat-eye', at: Date.now() }))
  }, [SLUG, design, summary] as const)
  const res = await page.goto(`/${SLUG}/book?from=design`)
  test.skip(res?.status() === 404, 'demo shop not seeded')
  await expect(page.getByText('Moonlight cat-eye').first()).toBeVisible()

  await page.getByRole('button', { name: /Gel Manicure/ }).first().click()
  const no = page.getByRole('button', { name: 'No', exact: true })
  if (await no.count()) await no.first().click()
  await page.getByRole('button', { name: 'Pick a time' }).click()
  const pills = page.locator('button.s-pill')
  await pills.first().waitFor({ timeout: 20_000 }).catch(() => {})
  test.skip(!(await pills.count()), 'no open times in the demo shop')
  await pills.first().click()
  await page.getByRole('button', { name: 'Your details' }).click()
  await expect(page.getByText('Design from the 3D studio · Moonlight cat-eye')).toBeVisible()
  await expect(page.getByText(summary)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Change' })).toHaveAttribute('href', new RegExp(`^/${SLUG}/design`))

  const phone = `(555) 555-${String(Date.now()).slice(-4)}`
  await page.locator('#bf-name').fill('Lune Tester')
  await page.locator('#bf-phone').fill(phone)
  await page.locator('#bf-email').fill('lune-tester@example.com')
  await page.getByRole('checkbox', { name: 'I’ve read the booking notes' }).check()
  await page.getByRole('button', { name: 'Confirm booking' }).click()
  await page.waitForURL(/\/b\/[A-Za-z0-9_-]+/)

  const sql = postgres(DB, { max: 1 })
  try {
    const [b] = await sql<{ id: string; notes: string; design: Record<string, unknown> | null; photo_url: string | null }[]>`
      select b.id, b.notes, b.design, b.photo_url from app.bookings b join app.shops s on s.id = b.shop_id
      where s.slug = ${SLUG} and b.guest_name = 'Lune Tester' order by b.created_at desc limit 1`
    expect(b.notes).toContain('Design from the 3D studio「Moonlight cat-eye」')
    expect(b.notes).toContain(summary)
    expect(b.design).toMatchObject({ shape: 'almond', art: 'accent', color: '#d9b8a8' })
    expect(b.photo_url).toBeTruthy()   // a picture of the design, for the technician
    const [{ customer_id }] = await sql<{ customer_id: string | null }[]>`select customer_id from app.bookings where id = ${b.id}`
    await sql`delete from app.bookings where id = ${b.id}`
    if (customer_id) await sql`delete from app.customers where id = ${customer_id}`
  } finally { await sql.end() }
  expect(await page.evaluate(() => sessionStorage.getItem('tempo.lune'))).toBeNull()
})
