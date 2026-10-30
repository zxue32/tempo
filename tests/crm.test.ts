// CRM against the real local test database: segments, tags, contact log, follow-ups, campaigns with consent.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { sql } from '@/lib/db'
import { createShop, getShop, adminSetStatus } from '@/lib/data/shops'
import { listServices, listStaff } from '@/lib/data/catalog'
import { saveShifts } from '@/lib/data/schedule'
import { createBooking, shopSetStatus } from '@/lib/bookings'
import { listCustomers, SEGMENTS, segmentOf, customerTags, setTags, updateCrm, addNote, timeline, suggestFollowUps, scheduleFollowUp, closeFollowUp, openFollowUps, createCampaign, campaignAudience, sendCampaign, unsubscribe, importCustomers, createCustomer } from '@/lib/data/crm'
import type { Shop } from '@/lib/types'

const OWNER = '88888888-8888-4888-a888-888888888888'
const NOW = new Date('2026-10-13T13:00:00Z')
const TODAY = '2026-10-13'
let shop: Shop, ana: string, gel: string
const ids: Record<string, string> = {}

const book = async (date: string, start: number, name: string, phone: string, status?: 'completed' | 'no_show', email?: string) => {
  await saveShifts(shop.id, date, date, [{ staffId: ana, date, startMin: 540, endMin: 1080, breaks: [] }])
  const r = await createBooking({ shop, mode: 'admin', kind: 'phone', date, start, lang: 'en', now: NOW, force: true,
    guests: [{ serviceIds: [gel], addonIds: [], staffId: ana }], contact: { name, phone, email: email ?? null } })
  if (status) await shopSetStatus(shop, r.bookings[0].id, status, OWNER)
  ids[name] = r.bookings[0].customerId!
  return r.bookings[0]
}

beforeAll(async () => {
  await sql`delete from app.shops where slug like 'crm-%'`
  await sql`insert into app.users (id, email) values (${OWNER}, 'crm@example.com') on conflict do nothing`
  const s = await createShop({ ownerId: OWNER, ownerEmail: 'crm@example.com', name: 'crm', slug: 'crm-nails', industry: 'nail', timezone: 'America/New_York', defaultLang: 'en', ownerStaffName: 'Ana' })
  await adminSetStatus(s.id, 'live', OWNER, null)
  shop = (await getShop(s.id))!
  ana = (await listStaff(shop.id))[0].id
  gel = (await listServices(shop.id)).find(x => x.name === 'Gel Manicure')!.id
  // Regular: three visits, last one 3 weeks ago; Lapsed: one visit 4 months ago; New: booked, never visited; Flake: no-show
  await book('2026-08-04', 600, 'Regular', '(555) 555-0301', 'completed', 'regular@example.com')
  await book('2026-09-01', 600, 'Regular', '(555) 555-0301', 'completed', 'regular@example.com')
  await book('2026-09-22', 600, 'Regular', '(555) 555-0301', 'completed', 'regular@example.com')
  await book('2026-06-02', 600, 'Lapsed', '(555) 555-0302', 'completed', 'lapsed@example.com')
  await book('2026-10-20', 600, 'New', '(555) 555-0303', undefined, 'new@example.com')
  await book('2026-09-10', 600, 'Flake', '(555) 555-0304', 'no_show')
})
afterAll(async () => {
  await sql`delete from app.shops where slug like 'crm-%'`
  await sql`delete from app.users where id = ${OWNER}`
})

describe('CRM segments and tags', () => {
  it('puts each client in the segment a shop owner would', async () => {
    const rows = await listCustomers(shop.id, TODAY, '', 'recent')
    const seg = Object.fromEntries(rows.map(r => [r.name, segmentOf(r, TODAY, shop.rebookDays)]))
    expect(seg).toMatchObject({ Regular: 'regular', Lapsed: 'lapsed', New: 'new', Flake: 'no_show' })
    expect(SEGMENTS).toContain('vip')
    expect((await listCustomers(shop.id, TODAY, '', 'recent', 300, { segment: 'lapsed' })).map(r => r.name)).toEqual(['Lapsed'])
  })

  it('tags are free text per shop, tidy and bounded', async () => {
    await setTags(shop.id, ids.Regular, [' VIP ', 'loves red', 'VIP', ''])
    await setTags(shop.id, ids.Lapsed, ['loves red'])
    expect((await listCustomers(shop.id, TODAY, '', 'recent', 300, { tag: 'VIP' })).map(r => r.name)).toEqual(['Regular'])
    expect(await customerTags(shop.id)).toEqual([{ tag: 'loves red', n: 2 }, { tag: 'VIP', n: 1 }])
    await expect(setTags(shop.id, ids.Regular, Array.from({ length: 25 }, (_, i) => `t${i}`))).rejects.toThrow()
    // another shop's customer id changes nothing
    expect(await setTags(shop.id, '00000000-0000-4000-a000-000000000000', ['x'])).toBe(false)
  })

  it('records birthday, source and marketing consent, with the consent time', async () => {
    expect(await updateCrm(shop.id, ids.Regular, { birthday: '1995-10-20', marketingConsent: true })).toBe(true)
    const [c] = await sql<{ birthday: string; marketingConsent: boolean; marketingConsentAt: Date | null; source: string }[]>`
      select birthday::text, marketing_consent, marketing_consent_at, source from app.customers where id = ${ids.Regular}`
    expect(c).toMatchObject({ birthday: '1995-10-20', marketingConsent: true, source: 'phone' })
    expect(c.marketingConsentAt).toBeInstanceOf(Date)
    expect((await listCustomers(shop.id, TODAY, '', 'recent', 300, { segment: 'birthday' })).map(r => r.name)).toEqual(['Regular'])
  })
})

describe('CRM contact log and follow-ups', () => {
  it('keeps notes and calls in one timeline with the bookings', async () => {
    await addNote(shop.id, ids.Regular, OWNER, 'call', 'Called about the November slot')
    await addNote(shop.id, ids.Regular, OWNER, 'note', 'Prefers Ana, allergic to acetone')
    const tl = await timeline(shop.id, ids.Regular)
    expect(tl.map(e => e.type)).toEqual(['note', 'call', 'booking', 'booking', 'booking'])
    expect(tl[0]).toMatchObject({ type: 'note', body: 'Prefers Ana, allergic to acetone' })
    const [c] = await sql<{ lastContactedAt: Date | null }[]>`select last_contacted_at from app.customers where id = ${ids.Regular}`
    expect(c.lastContactedAt).toBeInstanceOf(Date)
  })

  it('suggests who to call back: due for a rebook, lapsed, birthday soon; not the ones already booked', async () => {
    // Regular was called a moment ago (previous test): no need to nag again this week
    expect((await suggestFollowUps(shop.id, TODAY)).map(x => x.name)).not.toContain('Regular')
    await sql`update app.customers set last_contacted_at = (${TODAY}::date - 10)::timestamptz where id = ${ids.Regular}`
    const s = await suggestFollowUps(shop.id, TODAY)
    const by = Object.fromEntries(s.map(x => [x.name, x.reason]))
    expect(by.Regular).toBe('rebook')     // last visit 9/22 + 21 days = 10/13, due today
    expect(by.Lapsed).toBe('lapsed')
    expect(by.New).toBeUndefined()        // has an upcoming booking
    expect(by.Flake).toBeUndefined()      // never completed a visit
    // birthday within two weeks shows too, but a client appears once with the most urgent reason
    expect(s.filter(x => x.name === 'Regular')).toHaveLength(1)
  })

  it('a scheduled follow-up is a task; done or dismissed, it leaves the list and logs the contact', async () => {
    const f = await scheduleFollowUp(shop.id, ids.Lapsed, OWNER, { due: '2026-10-15', reason: 'lapsed', note: 'offer 10% off' })
    expect((await openFollowUps(shop.id, '2026-10-15')).map(x => x.id)).toContain(f.id)
    expect((await openFollowUps(shop.id, '2026-10-14')).map(x => x.id)).not.toContain(f.id)
    await closeFollowUp(shop.id, f.id, OWNER, 'done')
    expect((await openFollowUps(shop.id, '2026-10-15')).map(x => x.id)).not.toContain(f.id)
    expect((await timeline(shop.id, ids.Lapsed)).some(e => e.type === 'follow_up')).toBe(true)
    // a snoozed suggestion stops being suggested until its date
    await scheduleFollowUp(shop.id, ids.Regular, OWNER, { due: '2026-10-20', reason: 'rebook', note: null })
    expect((await suggestFollowUps(shop.id, TODAY)).map(x => x.name)).not.toContain('Regular')
  })
})

describe('CRM campaigns', () => {
  it('only reaches clients with an email who said yes to marketing', async () => {
    await updateCrm(shop.id, ids.Lapsed, { marketingConsent: true })
    const c = await createCampaign(shop.id, OWNER, { name: 'Autumn', subject: 'Hi {name}, 10% off this month', body: 'Hello {name}!\nCome back for a gel refresh.', segment: { segment: 'all' } })
    const audience = await campaignAudience(shop.id, c.segment, TODAY)
    expect(audience.map(a => a.name).sort()).toEqual(['Lapsed', 'Regular'])   // New never consented; Flake has no email
    const sent: string[] = []
    const r = await sendCampaign(shop, c.id, OWNER, TODAY, { send: async m => { sent.push(m.to); return 'sent' } })
    expect(r).toEqual({ sent: 2, failed: 0, skipped: 0 })
    expect(sent.sort()).toEqual(['lapsed@example.com', 'regular@example.com'])
    const [row] = await sql<{ status: string; sentCount: number }[]>`select status, sent_count from app.campaigns where id = ${c.id}`
    expect(row).toEqual({ status: 'sent', sentCount: 2 })
    // sending twice does nothing
    await expect(sendCampaign(shop, c.id, OWNER, TODAY, { send: async () => 'sent' })).rejects.toThrow(/already/)
  })

  it('merges the name and adds an unsubscribe link that really unsubscribes', async () => {
    const c = await createCampaign(shop.id, OWNER, { name: 'Lapsed', subject: 'We miss you, {name}', body: 'Hi {name}', segment: { segment: 'lapsed' } })
    const mails: Array<{ to: string; subject: string; text: string }> = []
    await sendCampaign(shop, c.id, OWNER, TODAY, { send: async m => { mails.push(m); return 'sent' } })
    expect(mails).toHaveLength(1)
    expect(mails[0].subject).toBe('We miss you, Lapsed')
    const link = /https?:\/\/\S+\/unsubscribe\/\S+/.exec(mails[0].text)?.[0]
    expect(link).toBeTruthy()
    const token = link!.split('/unsubscribe/')[1]
    expect(await unsubscribe(token)).toBe(true)
    expect(await unsubscribe('nope')).toBe(false)
    expect((await campaignAudience(shop.id, { segment: 'all' }, TODAY)).map(a => a.name)).toEqual(['Regular'])
  })

  it('another shop can’t send to this shop’s clients', async () => {
    const o = await createShop({ ownerId: OWNER, ownerEmail: 'crm@example.com', name: 'o', slug: 'crm-other', industry: 'nail', timezone: 'America/New_York', defaultLang: 'en' })
    const c = await createCampaign(shop.id, OWNER, { name: 'X', subject: 'x', body: 'x', segment: { segment: 'all' } })
    await expect(sendCampaign((await getShop(o.id))!, c.id, OWNER, TODAY, { send: async () => 'sent' })).rejects.toThrow(/not found/)
  })
})

describe('CRM add and import', () => {
  it('adds a client by hand and imports a CSV, matching existing clients by phone', async () => {
    const id = await createCustomer(shop.id, { name: 'Walk In', phone: '(555) 555-0310', email: '', notes: '', source: 'walkin' })
    expect(id).toBeTruthy()
    const r = await importCustomers(shop.id, 'name,phone,email,tags,birthday\nRegular,(555) 555-0301,regular@example.com,imported,\nImported One,555-555-0311,one@example.com,"a, b",1990-05-06\nBad,,,,\n')
    expect(r).toEqual({ added: 1, updated: 1, skipped: 1 })
    const [reg] = await sql<{ tags: string[] }[]>`select tags from app.customers where id = ${ids.Regular}`
    expect(reg.tags).toEqual(expect.arrayContaining(['VIP', 'loves red', 'imported']))
    const [one] = await sql<{ source: string; birthday: string; tags: string[] }[]>`select source, birthday::text, tags from app.customers where shop_id = ${shop.id} and name = 'Imported One'`
    expect(one).toEqual({ source: 'import', birthday: '1990-05-06', tags: ['a', 'b'] })
  })
})
