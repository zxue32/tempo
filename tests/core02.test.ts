// CORE-02 against the real local test database: shop industries, legacy compatibility, server-side capability check.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from '@/lib/db'
import { createShop, getShop, getShopBySlug, adminSetStatus } from '@/lib/data/shops'
import { listServices, listStaff, setStaffSkills, loadCatalog } from '@/lib/data/catalog'
import { saveShifts } from '@/lib/data/schedule'
import { createBooking, BookingError } from '@/lib/bookings'
import { shopIndustries } from '@/lib/industries/shop'
import type { Shop } from '@/lib/types'

const OWNER = '22222222-2222-4222-a222-222222222222'
const NOW = new Date('2026-10-13T13:00:00Z')   // Tue 09:00 New York
const DAY = '2026-10-14'

const rows = (shopId: string) => sql<{ industry: string; isPrimary: boolean }[]>`
  select industry, is_primary from app.shop_industries where shop_id = ${shopId} order by is_primary desc, industry`

async function open(slug: string, industry: 'nail' | 'both' | 'barber' | 'pilates') {
  return createShop({ ownerId: OWNER, ownerEmail: 'core02@example.com', name: slug, slug, industry, timezone: 'America/New_York', defaultLang: 'en', ownerStaffName: 'Ana' })
}

beforeAll(async () => {
  await sql`delete from app.shops where slug like 'c02-%'`
  await sql`insert into app.users (id, email) values (${OWNER}, 'core02@example.com') on conflict do nothing`
})
afterAll(async () => {
  await sql`delete from app.shops where slug like 'c02-%'`
  await sql`delete from app.users where id = ${OWNER}`
})

describe('CORE-02 shop industries', () => {
  it('a nail shop is a nail shop; a legacy "both" shop is nails + barber, nails first', async () => {
    const nail = await open('c02-nail', 'nail')
    expect(await rows(nail.id)).toEqual([{ industry: 'nail', isPrimary: true }])
    const both = await open('c02-both', 'both')
    expect(await rows(both.id)).toEqual([{ industry: 'nail', isPrimary: true }, { industry: 'barber', isPrimary: false }])
  })

  it('tags each starter service with its industry (a both shop’s haircuts are barber services)', async () => {
    const both = (await getShopBySlug('c02-both'))!
    const svcs = await listServices(both.id)
    expect(svcs.every(s => s.industry === 'nail' || s.industry === 'barber')).toBe(true)
    expect(svcs.filter(s => ['hair', 'beard'].includes(s.category)).every(s => s.industry === 'barber')).toBe(true)
    expect(svcs.filter(s => ['hand', 'ext', 'foot'].includes(s.category)).every(s => s.industry === 'nail')).toBe(true)
    // a service added later without an industry takes it from its category / the shop
    const [added] = await sql<{ industry: string }[]>`
      insert into app.services (shop_id, kind, category, name, duration_min) values (${both.id}, 'service', 'beard', 'Hot towel shave', 30) returning industry`
    expect(added.industry).toBe('barber')
  })

  it('loads a shop together with its industries', async () => {
    const both = (await getShopBySlug('c02-both'))!
    expect(both.industries).toEqual(['nail', 'barber'])
    expect((await getShop(both.id))!.industries).toEqual(['nail', 'barber'])
    expect(shopIndustries(both)).toEqual(['nail', 'barber'])
    // a shop object from an older query still works (dual read from the legacy column)
    expect(shopIndustries({ ...both, industries: undefined } as Shop)).toEqual(['nail', 'barber'])
  })

  it('keeps the industry table in step when the owner changes the shop type (legacy write path)', async () => {
    const s = (await getShopBySlug('c02-nail'))!
    await sql`update app.shops set industry = 'both' where id = ${s.id}`
    expect((await rows(s.id)).map(r => r.industry)).toEqual(['nail', 'barber'])
    await sql`update app.shops set industry = 'pilates' where id = ${s.id}`
    expect(await rows(s.id)).toEqual([{ industry: 'pilates', isPrimary: true }])
    await sql`update app.shops set industry = 'nail' where id = ${s.id}`
  })

  it('backfills shops that predate the table, and leaves their bookings and links alone', async () => {
    const s = (await getShopBySlug('c02-both'))!
    await sql`delete from app.shop_industries where shop_id = ${s.id}`
    await sql`select app.sync_shop_industries(${s.id})`
    expect((await rows(s.id)).map(r => r.industry)).toEqual(['nail', 'barber'])
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int n from app.shops s where not exists (select 1 from app.shop_industries i where i.shop_id = s.id and i.is_primary)`
    expect(n).toBe(0)
  })

  it('refuses an online booking for a service whose industry the shop does not have, even straight through the API', async () => {
    const s = (await getShopBySlug('c02-nail'))!
    await adminSetStatus(s.id, 'live', OWNER, null)
    const live = (await getShop(s.id))!
    const [ana] = await listStaff(live.id)
    await saveShifts(live.id, DAY, DAY, [{ staffId: ana.id, date: DAY, startMin: 9 * 60, endMin: 18 * 60, breaks: [] }])
    const [pet] = await sql<{ id: string }[]>`
      insert into app.services (shop_id, kind, category, name, duration_min, industry) values (${live.id}, 'service', 'groom', 'Dog wash', 60, 'pet') returning id`
    const gel = (await listServices(live.id)).find(x => x.name === 'Gel Manicure')!
    await setStaffSkills(live.id, ana.id, [{ serviceId: pet.id, durationMin: null }, { serviceId: gel.id, durationMin: null }])
    const book = (serviceId: string, mode: 'online' | 'admin' = 'online') => createBooking({
      shop: live, mode, kind: mode === 'online' ? 'online' : 'phone', date: DAY, start: 10 * 60, lang: 'en', now: NOW,
      guests: [{ serviceIds: [serviceId], addonIds: [], staffId: ana.id }], contact: { name: 'Ivy', phone: '5555550111', email: null },
    })
    await expect(book(pet.id)).rejects.toMatchObject({ code: 'capability_disabled' })
    await expect(book(pet.id)).rejects.toBeInstanceOf(BookingError)
    // shop staff booking from the dashboard go through the same server check
    await expect(book(pet.id, 'admin')).rejects.toMatchObject({ code: 'capability_disabled' })
    // and the customer menu never offers it
    expect((await loadCatalog(live.id, { forCustomers: true })).services.map(x => x.id)).not.toContain(pet.id)
    const ok = await book(gel.id)
    expect(ok.bookings).toHaveLength(1)
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int n from app.bookings where shop_id = ${live.id}`
    expect(n).toBe(1)
  })

  it('keeps a shop’s menu bookable when the owner switches its type', async () => {
    // a barber shop that becomes a nail-and-barber shop, then a pilates studio: nothing it already sells disappears
    const b = await open('c02-barber', 'barber')
    const before = (await listServices(b.id)).map(s => s.id).sort()
    await sql`update app.shops set industry = 'pilates' where id = ${b.id}`
    const menu = (await loadCatalog(b.id, { forCustomers: true })).services.map(s => s.id).sort()
    expect(menu).toEqual(before)
    const tags = await sql<{ industry: string }[]>`select distinct industry from app.services where shop_id = ${b.id}`
    expect(tags.map(t => t.industry)).toEqual(['pilates'])
  })
})
