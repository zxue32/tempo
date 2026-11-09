// The client book (CRM) end to end on the seeded demo shop: a client books online and ticks "send me offers",
// the owner tags her, logs a call, schedules a follow-up, sees it fall due, drafts a campaign that would reach her,
// imports a CSV, exports one, and the client unsubscribes from the link a campaign would carry.
import { test, expect } from '@playwright/test'
import postgres from 'postgres'
import { createHash, randomBytes } from 'node:crypto'

const DB = process.env.E2E_DATABASE_URL ?? 'postgres://tempo:tempo@localhost:5432/tempo'
const SLUG = 'demo-nails'
const english = { name: 'lang', value: 'en', domain: 'localhost', path: '/' }
const shot = async (p: import('@playwright/test').Page, name: string) => { if (process.env.E2E_SHOTS) await p.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png`, fullPage: true }) }

test('client book: consent at booking, tags, log, follow-ups, campaign audience, import/export, unsubscribe', async ({ page, browser }) => {
  const sql = postgres(DB, { max: 1 })
  const [shop] = await sql<{ id: string; ownerId: string }[]>`select id, owner_id as "ownerId" from app.shops where slug = ${SLUG}`.catch(() => [])
  test.skip(!shop, 'demo shop not seeded')
  const stamp = String(Date.now()).slice(-4)
  const phone = `(555) 555-${stamp}`
  const name = `Crm Tester ${stamp}`
  const token = randomBytes(32).toString('base64url')
  await sql`insert into app.sessions (token_hash, user_id, expires_at) values (${createHash('sha256').update(token).digest('hex')}, ${shop.ownerId}, now() + interval '1 hour')`
  const owner = await browser.newContext({ locale: 'en-US', timezoneId: 'America/New_York' })
  await owner.addCookies([english, { name: 'tempo_session', value: token, domain: 'localhost', path: '/' }])
  try {
    // 1 · a client books and opts into offers
    await page.context().addCookies([english])
    await page.goto(`/${SLUG}/book`)
    await page.getByRole('button', { name: /Classic Manicure|Gel Manicure/ }).first().click()
    const pickTime = page.getByRole('button', { name: 'Pick a time' })
    // the shop's booking question, when it is switched on
    const q = page.getByRole('group', { name: /gel or acrylic/ })
    if (await q.count()) await q.getByRole('button', { name: 'No', exact: true }).click()
    await pickTime.click()
    const pills = page.locator('button.s-pill')
    await pills.first().waitFor({ timeout: 20_000 }).catch(() => {})
    test.skip(!(await pills.count()), 'no open times in the demo shop')
    await pills.first().click()
    await page.getByRole('button', { name: 'Your details' }).click()
    await page.locator('#bf-name').fill(name)
    await page.locator('#bf-phone').fill(phone)
    await page.locator('#bf-email').fill(`crm-${stamp}@example.com`)
    await page.getByRole('checkbox', { name: 'I’ve read the booking notes' }).check()
    await page.getByRole('checkbox', { name: /Send me offers/ }).check()
    await shot(page, 'crm-1-client-consent')
    await page.getByRole('button', { name: 'Confirm booking' }).click()
    await page.waitForURL(/\/b\/[A-Za-z0-9_-]+/)
    const [cust] = await sql<{ id: string; consent: boolean; source: string }[]>`select id, marketing_consent as consent, source from app.customers where shop_id = ${shop.id} and name = ${name}`
    expect(cust).toMatchObject({ consent: true, source: 'online' })

    // 2 · the owner opens her profile: tags, birthday, a call, a follow-up
    const op = await owner.newPage()
    await op.goto(`/dashboard/${shop.id}/customers/${cust.id}`)
    await expect(op.getByRole('heading', { name })).toBeVisible()
    await expect(op.getByRole('checkbox', { name: /Agreed to marketing emails/ })).toBeChecked()
    await op.locator('#crm-tag').fill('loves red')
    await op.locator('#crm-tag').press('Enter')
    await expect(op.getByRole('button', { name: 'Delete loves red' })).toBeVisible()
    // a birthday ten days from now, so she shows up under "Birthdays"
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(5, 10)
    const bday = `1995-${soon}`
    await op.locator('#crm-bday').fill(bday)
    await op.locator('#crm-bday').blur()
    await op.getByRole('button', { name: '☎ Call' }).click()
    await op.getByPlaceholder(/What was discussed/).fill('Called to confirm, wants a French tip next time')
    await op.getByRole('button', { name: 'Log' }).click()
    await expect(op.getByText('Called to confirm, wants a French tip next time')).toBeVisible()
    await op.getByRole('button', { name: /Schedule follow-up/ }).click()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
    await op.locator('#fu-due').fill(today)
    await op.locator('#fu-reason').selectOption('custom')
    await op.locator('#fu-note').fill('ask about the French tip')
    await op.getByRole('button', { name: 'Schedule', exact: true }).click()
    await expect(op.getByText(/Follow up on/)).toBeVisible()
    await shot(op, 'crm-2-owner-profile')
    await expect.poll(async () => (await sql<{ tags: string[]; birthday: string }[]>`select tags, birthday::text from app.customers where id = ${cust.id}`)[0]).toMatchObject({ tags: ['loves red'], birthday: bday })

    // 3 · the list filters by segment and tag; the follow-up is due today
    await op.goto(`/dashboard/${shop.id}/customers?seg=birthday`)
    await expect(op.getByRole('link', { name, exact: true })).toBeVisible()
    await op.goto(`/dashboard/${shop.id}/customers?tag=loves%20red`)
    await expect(op.getByRole('link', { name, exact: true })).toBeVisible()
    await shot(op, 'crm-3-list-tag')
    await op.goto(`/dashboard/${shop.id}/customers/followups`)
    const due = op.locator('li', { hasText: 'ask about the French tip' })
    await expect(due).toBeVisible()
    await shot(op, 'crm-4-followups')
    await due.getByRole('button', { name: 'Contacted' }).click()
    await expect(due).toHaveCount(0)

    // 4 · a campaign to everyone reaches her (consented + email); the preview shows the merged name
    await op.goto(`/dashboard/${shop.id}/customers/campaigns`)
    await op.getByRole('button', { name: 'New campaign' }).click()
    await op.locator('#cp-name').fill('Autumn offer')
    await op.locator('#cp-subject').fill('Hi {name}, 10% off this month')
    await op.locator('#cp-body').fill('Hello {name}!\nCome back for a gel refresh.')
    await expect(op.getByText(/Reaches \d+ clients/)).toBeVisible()
    await expect(op.getByText('Hello Ana!')).toBeVisible()
    await shot(op, 'crm-5-campaign-compose')
    await op.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(op.getByText('Autumn offer')).toBeVisible()
    const [camp] = await sql<{ id: string; status: string }[]>`select id, status from app.campaigns where shop_id = ${shop.id} and name = 'Autumn offer' order by created_at desc limit 1`
    expect(camp.status).toBe('draft')
    await shot(op, 'crm-6-campaign-list')

    // 5 · import a CSV (one new, one update by phone) and export
    await op.goto(`/dashboard/${shop.id}/customers/new`)
    await op.locator('#nc-file').setInputFiles({ name: 'clients.csv', mimeType: 'text/csv', buffer: Buffer.from(`name,phone,email,tags,birthday\n${name},${phone},,imported,\nImported ${stamp},555-555-9${stamp.slice(1)},imp-${stamp}@example.com,"a, b",1990-05-06\n`) })
    await op.getByRole('button', { name: /^Import/ }).click()
    await expect(op.getByText('1 added, 1 updated, 0 skipped')).toBeVisible()
    await shot(op, 'crm-7-import')
    const [reg] = await sql<{ tags: string[] }[]>`select tags from app.customers where id = ${cust.id}`
    expect(reg.tags.sort()).toEqual(['imported', 'loves red'])
    const csv = await op.request.get(`/dashboard/${shop.id}/customers/export?tag=imported`)
    expect(csv.status()).toBe(200)
    expect(await csv.text()).toContain(name)

    // 6 · the unsubscribe link in every campaign email really unsubscribes
    const [{ unsubscribeToken }] = await sql<{ unsubscribeToken: string }[]>`select unsubscribe_token as "unsubscribeToken" from app.customers where id = ${cust.id}`
    await page.goto(`/unsubscribe/${encodeURIComponent(unsubscribeToken)}`)
    await expect(page.getByRole('heading', { name: 'Unsubscribed' })).toBeVisible()
    await shot(page, 'crm-8-unsubscribed')
    expect((await sql<{ c: boolean }[]>`select marketing_consent as c from app.customers where id = ${cust.id}`)[0].c).toBe(false)
    await page.goto('/unsubscribe/nope')
    await expect(page.getByText('This link is invalid or has expired.')).toBeVisible()
  } finally {
    await sql`delete from app.campaigns where shop_id = ${shop.id} and name = 'Autumn offer'`
    await sql`delete from app.bookings where shop_id = ${shop.id} and guest_name = ${name}`
    await sql`delete from app.customers where shop_id = ${shop.id} and (name = ${name} or name = ${'Imported ' + stamp})`
    await sql`delete from app.sessions where token_hash = ${createHash('sha256').update(token).digest('hex')}`
    await owner.close()
    await sql.end()
  }
})
