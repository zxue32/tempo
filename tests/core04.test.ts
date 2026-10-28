// CORE-04 against the real local test database: one shop can never read or write another shop's data,
// customer reference photos are private, and logs never carry what customers typed.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { sql } from '@/lib/db'
import { createShop, getShop, adminSetStatus } from '@/lib/data/shops'
import { listServices, listStaff, deleteStaff, updateService, deleteService, setStaffSkills } from '@/lib/data/catalog'
import { saveShifts } from '@/lib/data/schedule'
import { addGalleryItem, updateGalleryItem, deleteGalleryItem, saveResource } from '@/lib/data/rules'
import { getCustomer, savePreferences } from '@/lib/data/insights'
import { joinWaitlist, markWaitlist } from '@/lib/data/waitlist'
import { createBooking, getBooking, shopMove, shopSetStatus, byToken } from '@/lib/bookings'
import { storeImage } from '@/lib/storage'
import { mediaFor, refPhotoFor, publicImageFor } from '@/lib/media'
import { audit, listAudit } from '@/lib/audit'
import { logError } from '@/lib/log'
import { sendMail } from '@/lib/email'
import type { Shop } from '@/lib/types'

const OWNER_A = '55555555-5555-4555-a555-55555555555a'
const OWNER_B = '55555555-5555-4555-a555-55555555555b'
const STRANGER = '55555555-5555-4555-a555-55555555555c'
const NOW = new Date('2026-10-13T13:00:00Z')
const DAY = '2026-10-14'
type Side = { shop: Shop; staff: string; service: string; customer: string; booking: string; token: string }
let A: Side, B: Side

async function side(owner: string, slug: string): Promise<Side> {
  const s = await createShop({ ownerId: owner, ownerEmail: `${slug}@example.com`, name: slug, slug, industry: 'nail', timezone: 'America/New_York', defaultLang: 'en', ownerStaffName: 'Ana' })
  await adminSetStatus(s.id, 'live', owner, null)
  const shop = (await getShop(s.id))!
  const staff = (await listStaff(shop.id))[0].id
  const service = (await listServices(shop.id)).find(x => x.name === 'Gel Manicure')!.id
  await saveShifts(shop.id, DAY, DAY, [{ staffId: staff, date: DAY, startMin: 540, endMin: 1080, breaks: [] }])
  const r = await createBooking({ shop, mode: 'online', kind: 'online', date: DAY, start: 600, lang: 'en', now: NOW,
    guests: [{ serviceIds: [service], addonIds: [], staffId: staff }], contact: { name: 'Ivy', phone: '(555) 555-0177', email: 'ivy@example.com' }, notes: 'allergic to acetone' })
  return { shop, staff, service, customer: r.bookings[0].customerId!, booking: r.bookings[0].id, token: r.token! }
}

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])], 'ref.png', { type: 'image/png' })

beforeAll(async () => {
  await sql`delete from app.shops where slug like 'c04-%'`
  for (const [id, email] of [[OWNER_A, 'c04-a@example.com'], [OWNER_B, 'c04-b@example.com'], [STRANGER, 'c04-x@example.com']]) {
    await sql`insert into app.users (id, email) values (${id}, ${email}) on conflict do nothing`
  }
  A = await side(OWNER_A, 'c04-a')
  B = await side(OWNER_B, 'c04-b')
})
afterAll(async () => {
  await sql`delete from app.shops where slug like 'c04-%'`
  await sql`delete from app.users where id in ${sql([OWNER_A, OWNER_B, STRANGER])}`
})

describe('CORE-04 the database refuses references across shops', () => {
  const fails = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: '23503' })

  it('a booking can only name its own shop’s technician and customer', async () => {
    // (moved off B's own 10:00 so only the shop boundary can object)
    await fails(sql`update app.bookings set staff_id = ${B.staff}, starts_at = starts_at + interval '4 hours', ends_at = ends_at + interval '4 hours', busy_until = busy_until + interval '4 hours' where id = ${A.booking}`)
    await fails(sql`update app.bookings set customer_id = ${B.customer} where id = ${A.booking}`)
  })

  it('skills, booked items, rooms, shifts, gallery and waitlist stay inside one shop', async () => {
    await fails(sql`insert into app.staff_services (staff_id, service_id) values (${A.staff}, ${B.service})`)
    await fails(sql`insert into app.booking_items (booking_id, service_id, kind, name, duration_min, sort) values (${A.booking}, ${B.service}, 'service', 'x', 30, 9)`)
    const roomB = await saveResource(B.shop.id, null, { name: 'Pedicure chair', nameZh: null, quantity: 1 })
    await fails(sql`update app.services set resource_id = ${roomB} where id = ${A.service}`)
    await fails(sql`update app.bookings set resource_ids = ${sql.array([roomB])}::uuid[] where id = ${A.booking}`)
    await fails(sql`insert into app.shifts (shop_id, staff_id, date, start_min, end_min) values (${A.shop.id}, ${B.staff}, '2026-10-20', 600, 700)`)
    await fails(sql`insert into app.gallery (shop_id, url, staff_id) values (${A.shop.id}, '/x.jpg', ${B.staff})`)
    await fails(sql`insert into app.gallery (shop_id, url, service_id) values (${A.shop.id}, '/x.jpg', ${B.service})`)
    await fails(sql`insert into app.waitlist (shop_id, date, from_min, to_min, service_ids, name, email, lang) values (${A.shop.id}, ${DAY}, 600, 700, ${sql.array([B.service])}::uuid[], 'Ivy', 'ivy@example.com', 'en')`)
  })

  it('still lets a shop do all of that with its own things', async () => {
    const roomA = await saveResource(A.shop.id, null, { name: 'Pedicure chair', nameZh: null, quantity: 1 })
    await sql`update app.services set resource_id = ${roomA} where id = ${A.service}`
    await sql`update app.bookings set resource_ids = ${sql.array([roomA])}::uuid[] where id = ${A.booking}`
    await sql`update app.bookings set resource_ids = '{}' where id = ${A.booking}`
    await sql`update app.services set resource_id = null where id = ${A.service}`
    await sql`insert into app.gallery (shop_id, url, staff_id, service_id) values (${A.shop.id}, '/ok.jpg', ${A.staff}, ${A.service})`
  })
})

describe('CORE-04 shop A’s screens can’t read or change shop B', () => {
  it('can’t see B’s bookings or customers', async () => {
    expect(await getBooking(A.shop.id, B.booking)).toBeNull()
    expect(await getCustomer(A.shop.id, B.customer, DAY)).toBeNull()
  })

  it('can’t move, cancel or re-price B’s bookings', async () => {
    await expect(shopMove(A.shop, B.booking, DAY, 700, A.staff, OWNER_A, true)).rejects.toMatchObject({ code: 'not_found' })
    await expect(shopSetStatus(A.shop, B.booking, 'cancelled', OWNER_A, null)).rejects.toMatchObject({ code: 'not_found' })
    expect((await getBooking(B.shop.id, B.booking))!.status).toBe('confirmed')
  })

  it('can’t book B’s technician or B’s service', async () => {
    const tryBook = (staffId: string, serviceId: string) => createBooking({ shop: A.shop, mode: 'admin', kind: 'phone', date: DAY, start: 720, lang: 'en', now: NOW,
      guests: [{ serviceIds: [serviceId], addonIds: [], staffId }], contact: { name: 'Zed', phone: '(555) 555-0188', email: null }, force: true })
    await expect(tryBook(B.staff, A.service)).rejects.toMatchObject({ code: 'invalid', detail: 'staff' })
    await expect(tryBook(A.staff, B.service)).rejects.toMatchObject({ code: 'service_gone' })
  })

  it('can’t edit or delete B’s menu, team, gallery, waitlist or customer notes', async () => {
    await updateService(A.shop.id, B.service, { name: 'hacked' })
    await deleteService(A.shop.id, B.service)
    expect((await listServices(B.shop.id)).find(s => s.id === B.service)?.name).toBe('Gel Manicure')

    await expect(setStaffSkills(A.shop.id, B.staff, [])).rejects.toThrow(/not in shop/)
    // deleting "B's technician" from shop A must not touch B's roster (it used to clear B's future shifts)
    await sql`insert into app.shifts (shop_id, staff_id, date, start_min, end_min) values (${B.shop.id}, ${B.staff}, current_date + 30, 600, 900)`
    expect(await deleteStaff(A.shop.id, B.staff)).toBe('not_found')
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int n from app.shifts where staff_id = ${B.staff} and date >= current_date`
    expect(n).toBe(1)
    expect((await listStaff(B.shop.id)).find(s => s.id === B.staff)?.active).toBe(true)

    const g = await addGalleryItem(B.shop.id, '/media/gallery/b.jpg')
    await updateGalleryItem(A.shop.id, g!.id, { captionEn: 'hacked', captionZh: null, staffId: null, serviceId: null })
    await deleteGalleryItem(A.shop.id, g!.id)
    const [gal] = await sql<{ captionEn: string | null }[]>`select caption_en from app.gallery where id = ${g!.id}`
    expect(gal.captionEn).toBeNull()

    await joinWaitlist(B.shop, { date: DAY, fromMin: 600, toMin: 700, serviceIds: [B.service], addonIds: [], staffId: null, name: 'Wai', phone: null, email: 'wai@example.com', lang: 'en' })
    const [w] = await sql<{ id: string; status: string }[]>`select id, status from app.waitlist where shop_id = ${B.shop.id}`
    await markWaitlist(A.shop.id, w.id, 'removed')
    expect((await sql<{ status: string }[]>`select status from app.waitlist where id = ${w.id}`)[0].status).toBe(w.status)

    const [before] = await sql<{ preferences: unknown }[]>`select preferences from app.customers where id = ${B.customer}`
    expect(await savePreferences(A.shop.id, B.customer, { notes: 'hacked' })).toBe(false)
    const [after] = await sql<{ preferences: unknown }[]>`select preferences from app.customers where id = ${B.customer}`
    expect(after.preferences).toEqual(before.preferences)
  })

  it('a manage link only ever shows its own shop’s booking', async () => {
    const found = await byToken(A.token)
    expect(found!.shop.id).toBe(A.shop.id)
    expect(found!.group.every(b => b.shopId === A.shop.id)).toBe(true)
  })
})

describe('CORE-04 customer reference photos are private', () => {
  let path: string
  beforeAll(async () => {
    const url = await storeImage(png(), `ref/${A.shop.id}`, { visibility: 'private' })
    expect(url).toMatch(new RegExp(`^/media/ref/${A.shop.id}/[0-9a-f]{32}\\.png$`))
    path = url.slice('/media/'.length)
  })

  it('shows them only to people who work at that shop', async () => {
    expect(await mediaFor(path, null)).toBeNull()
    expect(await mediaFor(path, { id: STRANGER, isAdmin: false })).toBeNull()
    expect(await mediaFor(path, { id: OWNER_B, isAdmin: false })).toBeNull()
    const own = await mediaFor(path, { id: OWNER_A, isAdmin: false })
    expect(own).toMatchObject({ mime: 'image/png', private: true })
    expect(await mediaFor(path, { id: STRANGER, isAdmin: true })).toMatchObject({ private: true })
  })

  it('keeps shop pictures (gallery, team, logo) public as before', async () => {
    const url = await storeImage(png(), `gallery/${A.shop.id}`)
    expect(await mediaFor(url.slice('/media/'.length), null)).toMatchObject({ private: false })
  })

  it('accepts a booking photo only from the same shop’s own uploads', async () => {
    expect(refPhotoFor(`/media/${path}`, A.shop.id)).toBe(`/media/${path}`)
    expect(refPhotoFor(`/media/${path}`, B.shop.id)).toBeNull()
    expect(refPhotoFor('https://evil.example.com/x.jpg', A.shop.id)).toBeNull()
    expect(refPhotoFor(`/media/gallery/${A.shop.id}/${'a'.repeat(32)}.jpg`, A.shop.id)).toBeNull()
  })

  it('never lets a private photo become a public picture of the shop', () => {
    expect(publicImageFor(`/media/${path}`, A.shop.id)).toBeNull()
    expect(publicImageFor(`/media/staff/${B.shop.id}/${'b'.repeat(32)}.jpg`, A.shop.id)).toBeNull()
    expect(publicImageFor(`/media/staff/${A.shop.id}/${'b'.repeat(32)}.jpg`, A.shop.id)).toBe(`/media/staff/${A.shop.id}/${'b'.repeat(32)}.jpg`)
    expect(publicImageFor(null, A.shop.id)).toBeNull()
  })
})

describe('CORE-04 audit trail and logs', () => {
  it('records who did what, without the personal details themselves', async () => {
    await audit(sql, { shopId: A.shop.id, actorUser: OWNER_A, action: 'customer.update', targetType: 'customer', targetId: A.customer, detail: { fields: ['name', 'phone'] } })
    await audit(sql, { shopId: A.shop.id, actorUser: OWNER_A, action: 'bookings.export', detail: { rows: 1 } })
    const rows = await listAudit(A.shop.id)
    expect(rows.map(r => r.action)).toEqual(['bookings.export', 'customer.update'])
    expect(await listAudit(B.shop.id)).toEqual([])
    await expect(audit(sql, { shopId: A.shop.id, actorUser: OWNER_A, action: 'Customer Update!' })).rejects.toThrow()
  })

  it('never writes what a customer typed into the server log', async () => {
    const out: string[] = []
    const spy = (...a: unknown[]) => { out.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x) + String(x))).join(' ')) }
    const log = vi.spyOn(console, 'log').mockImplementation(spy)
    const err = vi.spyOn(console, 'error').mockImplementation(spy)
    const env = process.env.NODE_ENV
    try {
      ;(process.env as Record<string, string>).NODE_ENV = 'production'
      await sendMail({ to: 'ivy@example.com', subject: 'Booked', text: 'Notes: allergic to acetone. Manage: /b/SECRETTOKEN', html: '', template: 'confirmed', shopId: A.shop.id })
      try { await sql`insert into app.customers (shop_id, name, phone_norm) values (${A.shop.id}, 'Dup', '5555550177')` } catch (e) { logError('test', e) }
    } finally {
      ;(process.env as Record<string, string>).NODE_ENV = env!
      log.mockRestore(); err.mockRestore()
    }
    const text = out.join('\n')
    expect(text).toMatch(/confirmed/)
    expect(text).toMatch(/23505/)
    expect(text).not.toMatch(/acetone|SECRETTOKEN|ivy@example\.com|5555550177/)
  })
})
