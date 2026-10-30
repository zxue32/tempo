// CORE-03 against the real local test database: shop markets, phone storage, clock changes, language independence.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from '@/lib/db'
import { createShop, getShop, adminSetStatus } from '@/lib/data/shops'
import { listServices, listStaff } from '@/lib/data/catalog'
import { saveShifts } from '@/lib/data/schedule'
import { createBooking } from '@/lib/bookings'
import type { Shop } from '@/lib/types'

const OWNER = '44444444-4444-4444-a444-444444444444'
const NOW = new Date('2026-10-13T13:00:00Z')   // Tue 09:00 New York
const DAY = '2026-10-14'
let shop: Shop
let ana: string, gel: string

beforeAll(async () => {
  await sql`delete from app.shops where slug like 'c03-%'`
  await sql`insert into app.users (id, email) values (${OWNER}, 'core03@example.com') on conflict do nothing`
  const s = await createShop({ ownerId: OWNER, ownerEmail: 'core03@example.com', name: 'c03', slug: 'c03-nails', industry: 'nail', timezone: 'America/New_York', defaultLang: 'en', ownerStaffName: 'Ana' })
  await adminSetStatus(s.id, 'live', OWNER, null)
  shop = (await getShop(s.id))!
  ana = (await listStaff(shop.id))[0].id
  gel = (await listServices(shop.id)).find(x => x.name === 'Gel Manicure')!.id
  await saveShifts(shop.id, DAY, DAY, [{ staffId: ana, date: DAY, startMin: 9 * 60, endMin: 18 * 60, breaks: [] }])
})
afterAll(async () => {
  await sql`delete from app.shops where slug like 'c03-%'`
  await sql`delete from app.users where id = ${OWNER}`
})

const book = (s: Shop, o: { start?: number; phone?: string; lang?: 'en' | 'zh'; date?: string; mode?: 'online' | 'admin'; fold?: 'earlier' | 'later' } = {}) => createBooking({
  shop: s, mode: o.mode ?? 'online', kind: o.mode === 'admin' ? 'phone' : 'online', date: o.date ?? DAY, start: o.start ?? 10 * 60, lang: o.lang ?? 'en', now: NOW,
  guests: [{ serviceIds: [gel], addonIds: [], staffId: ana }], contact: { name: 'Ivy', phone: o.phone ?? '(555) 555-0142', email: null },
  force: o.mode === 'admin', fold: o.fold,
})

describe('CORE-03 markets on real data', () => {
  it('opens every shop, old and new, as a US dollar shop', async () => {
    expect(shop).toMatchObject({ marketKey: 'us', currency: 'USD' })
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int n from app.shops where market_key is null or currency is null`
    expect(n).toBe(0)
  })

  it('refuses a currency that doesn’t belong to the market', async () => {
    await expect(sql`update app.shops set currency = 'JPY' where id = ${shop.id}`).rejects.toThrow(/shops_market_currency/)
  })

  it('takes no bookings for a shop in a market that isn’t open', async () => {
    await sql`update app.shops set market_key = 'jp', currency = 'JPY' where id = ${shop.id}`
    try {
      await expect(book((await getShop(shop.id))!)).rejects.toMatchObject({ code: 'market_unsupported' })
    } finally {
      await sql`update app.shops set market_key = 'us', currency = 'USD' where id = ${shop.id}`
    }
  })

  it('stores the number as typed plus its international form, and finds the same customer either way', async () => {
    const a = await book(shop, { start: 10 * 60, phone: '(555) 555-0142' })
    const b = await book(shop, { start: 11 * 60, phone: '+1 555-555-0142' })
    expect(a.bookings[0].customerId).toBe(b.bookings[0].customerId)
    const [c] = await sql<{ phone: string; phoneNorm: string; phoneE164: string }[]>`select phone, phone_norm, phone_e164 from app.customers where id = ${a.bookings[0].customerId}`
    expect(c).toMatchObject({ phoneNorm: '5555550142', phoneE164: '+15555550142' })
  })

  it('never merges customers whose numbers differ only by country code', async () => {
    const us = await book(shop, { start: 12 * 60, phone: '(207) 946-0958' })
    const uk = await book(shop, { start: 13 * 60, phone: '+44 20 7946 0958' })
    expect(us.bookings[0].customerId).not.toBe(uk.bookings[0].customerId)
    const rows = await sql<{ phoneE164: string }[]>`select phone_e164 from app.customers where id in ${sql([us.bookings[0].customerId!, uk.bookings[0].customerId!])} order by phone_e164`
    expect(rows.map(r => r.phoneE164)).toEqual(['+12079460958', '+442079460958'])
  })

  it('books the same instant and price whatever language the customer uses', async () => {
    const en = await book(shop, { start: 14 * 60, lang: 'en', phone: '(555) 555-0143' })
    const zh = await book(shop, { start: 15 * 60, lang: 'zh', phone: '(555) 555-0144' })
    expect(en.bookings[0].startsAt.toISOString()).toBe('2026-10-14T18:00:00.000Z')
    expect(zh.bookings[0].startsAt.toISOString()).toBe('2026-10-14T19:00:00.000Z')
    expect(en.bookings[0].estPriceCents).toBe(zh.bookings[0].estPriceCents)
  })

  it('refuses a time the clocks skip and asks which one when the clocks repeat an hour', async () => {
    // shop staff booking by phone at 2:30 on the morning the clocks go forward
    await expect(book(shop, { mode: 'admin', date: '2026-03-08', start: 150 })).rejects.toMatchObject({ code: 'invalid', detail: 'dst_gap' })
    await expect(book(shop, { mode: 'admin', date: '2026-11-01', start: 90 })).rejects.toMatchObject({ code: 'invalid', detail: 'dst_ambiguous' })
    const later = await book(shop, { mode: 'admin', date: '2026-11-01', start: 90, fold: 'later', phone: '(555) 555-0145' })
    expect(later.bookings[0].startsAt.toISOString()).toBe('2026-11-01T06:30:00.000Z')
    // the engine plans in wall-clock minutes, so free that 1:30 again before booking the other one
    await sql`update app.bookings set status = 'cancelled' where id = ${later.bookings[0].id}`
    const earlier = await book(shop, { mode: 'admin', date: '2026-11-01', start: 90, fold: 'earlier', phone: '(555) 555-0146' })
    expect(earlier.bookings[0].startsAt.toISOString()).toBe('2026-11-01T05:30:00.000Z')
  })
})
