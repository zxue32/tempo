// Booking questions (CORE-05) end to end on the seeded demo shop: the owner switches on the nail questions,
// a client who is "not sure" what's on her nails gets a request (not a confirmation), the owner confirms it.
// The owner's session is made directly in the local e2e database; the form is switched off again afterwards.
import { test, expect } from '@playwright/test'
import postgres from 'postgres'
import { createHash, randomBytes } from 'node:crypto'

const DB = process.env.E2E_DATABASE_URL ?? 'postgres://tempo:tempo@localhost:5432/tempo'
const SLUG = 'demo-nails'
const english = { name: 'lang', value: 'en', domain: 'localhost', path: '/' }
// E2E_SHOTS=<dir> saves screenshots of each step as evidence
const shot = async (p: import('@playwright/test').Page, name: string) => { if (process.env.E2E_SHOTS) await p.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png`, fullPage: false }) }

test('booking questions: “not sure” waits for the shop, the owner confirms it', async ({ page, browser }) => {
  const sql = postgres(DB, { max: 1 })
  const [shop] = await sql<{ id: string; ownerId: string }[]>`select id, owner_id as "ownerId" from app.shops where slug = ${SLUG}`.catch(() => [])
  test.skip(!shop, 'demo shop not seeded')
  const token = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(token).digest('hex')
  await sql`insert into app.sessions (token_hash, user_id, expires_at) values (${hash}, ${shop.ownerId}, now() + interval '1 hour')`
  const owner = await browser.newContext({ locale: 'en-US', timezoneId: 'America/New_York' })
  await owner.addCookies([english, { name: 'tempo_session', value: token, domain: 'localhost', path: '/' }])
  try {
    // 1 · the owner turns on the usual nail questions
    const op = await owner.newPage()
    await op.goto(`/dashboard/${shop.id}/rules`)
    // (a run that stopped halfway leaves a switched-off version: then the questions are already there)
    const nail = op.locator('[data-form="nail"]')
    const startBtn = nail.getByRole('button', { name: 'Start with the usual nail questions' })
    if (await startBtn.count()) await startBtn.click()
    await expect(op.locator('[data-field="currentNails"]')).toBeVisible()
    await nail.getByRole('button', { name: 'Turn on' }).click()
    await expect(nail.getByText(/^On · version \d+$/)).toBeVisible()
    await op.locator('#fm-h-nail').scrollIntoViewIfNeeded(); await shot(op, '1-owner-questions-on')

    // 2 · a client books and isn't sure what's on her nails
    await page.context().addCookies([english])
    await page.goto(`/${SLUG}/book`)
    await page.getByRole('button', { name: /Gel Manicure/ }).first().click()
    await expect(page.getByRole('heading', { name: 'A few questions before you book' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pick a time' })).toBeDisabled()
    await page.getByRole('radio', { name: 'Not sure' }).click()
    await expect(page.getByText('The shop will take a look before confirming')).toBeVisible()
    await page.getByRole('radio', { name: 'Yes, please remove it' }).click()
    await expect(page.getByText(/Adds Gel Removal/)).toBeVisible()
    await page.locator('#in-h').scrollIntoViewIfNeeded(); await shot(page, '2-client-questions')
    await page.getByRole('button', { name: 'Pick a time' }).click()
    const pills = page.locator('button.s-pill')
    await pills.first().waitFor({ timeout: 20_000 }).catch(() => {})
    test.skip(!(await pills.count()), 'no open times in the demo shop')
    await pills.first().click()
    await page.getByRole('button', { name: 'Your details' }).click()
    await page.locator('#bf-name').fill('Intake Tester')
    await page.locator('#bf-phone').fill(`(555) 555-${String(Date.now()).slice(-4)}`)
    await page.locator('#bf-email').fill('intake-tester@example.com')
    await page.getByRole('checkbox', { name: 'I’ve read the booking notes' }).check()
    await page.getByRole('button', { name: 'Confirm booking' }).click()
    await page.waitForURL(/\/b\/[A-Za-z0-9_-]+/)
    // a request, never shown as confirmed
    await expect(page.getByText('Request received')).toBeVisible()
    await expect(page.locator('[data-review="pending"]')).toBeVisible()
    await expect(page.getByText('You’re booked')).toHaveCount(0)
    await shot(page, '3-client-request-received')

    const [b] = await sql<{ id: string; date: string; reviewState: string; answers: Record<string, unknown>; items: string[] }[]>`
      select b.id, b.date::text as date, r.review_state as "reviewState", r.answers, array(select i.name from app.booking_items i where i.booking_id = b.id order by i.sort) as items
      from app.bookings b join app.intake_responses r on r.booking_id = b.id
      where b.shop_id = ${shop.id} and b.guest_name = 'Intake Tester' order by b.created_at desc limit 1`
    expect(b).toMatchObject({ reviewState: 'pending', answers: { currentNails: 'unsure', removal: 'yes' }, items: ['Gel Manicure', 'Gel Removal'] })

    // 3 · the owner sees it waiting, reads the answers and confirms
    await op.goto(`/dashboard/${shop.id}?date=${b.date}`)
    await expect(op.locator('[data-reviews]')).toContainText('Waiting for you to check')
    await op.goto(`/dashboard/${shop.id}?date=${b.date}&open=${b.id}`)
    await expect(op.locator('[data-review="pending"]')).toBeVisible()
    await expect(op.locator('[data-intake]')).toContainText('Not sure')
    await shot(op, '4-owner-review')
    await op.getByRole('button', { name: 'Confirm booking' }).click()
    await expect.poll(async () => (await sql<{ s: string }[]>`select review_state as s from app.intake_responses where booking_id = ${b.id}`)[0].s).toBe('approved')

    // 4 · now the client's page says booked
    await page.reload()
    await expect(page.getByText('Request received')).toHaveCount(0)
    await expect(page.locator('[data-review="pending"]')).toHaveCount(0)
    await shot(page, '5-client-confirmed')
  } finally {
    // switch the questions off again so other tests book the demo shop without them
    await sql`
      insert into app.intake_forms (shop_id, industry, version, schema, active)
      select shop_id, industry, version + 1, schema, false from app.intake_forms
      where shop_id = ${shop.id} and industry = 'nail' order by version desc limit 1`.catch(() => {})
    await sql`delete from app.sessions where token_hash = ${hash}`
    await owner.close()
    await sql.end()
  }
})
