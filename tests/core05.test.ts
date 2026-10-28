// CORE-05 against the real local test database: immutable service versions, versioned intake forms, answers
// checked on the server, and bookings that wait for review are never shown as confirmed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from '@/lib/db'
import { createShop, getShop, adminSetStatus } from '@/lib/data/shops'
import { listServices, listStaff, updateService } from '@/lib/data/catalog'
import { saveShifts } from '@/lib/data/schedule'
import { createBooking, getBooking, shopMove, BookingError } from '@/lib/bookings'
import { activeForms, saveForm, intakeFor, reviewIntake, pendingReviews } from '@/lib/data/forms'
import { nailIntake } from '@/lib/forms'
import { storeImage } from '@/lib/storage'
import type { Shop } from '@/lib/types'

const OWNER = '66666666-6666-4666-a666-666666666666'
const OTHER = '66666666-6666-4666-a666-666666666667'
const NOW = new Date('2026-10-13T13:00:00Z')
const DAY = '2026-10-14'
let shop: Shop, other: Shop
let ana: string, gel: string, removal: string

beforeAll(async () => {
  await sql`delete from app.shops where slug like 'c05-%'`
  for (const id of [OWNER, OTHER]) await sql`insert into app.users (id, email) values (${id}, ${id + '@example.com'}) on conflict do nothing`
  const s = await createShop({ ownerId: OWNER, ownerEmail: 'c05@example.com', name: 'c05', slug: 'c05-nails', industry: 'nail', timezone: 'America/New_York', defaultLang: 'en', ownerStaffName: 'Ana' })
  await adminSetStatus(s.id, 'live', OWNER, null)
  shop = (await getShop(s.id))!
  ana = (await listStaff(shop.id))[0].id
  const menu = await listServices(shop.id)
  gel = menu.find(x => x.name === 'Gel Manicure')!.id
  removal = menu.find(x => x.name === 'Gel Removal')!.id
  await saveShifts(shop.id, DAY, DAY, [{ staffId: ana, date: DAY, startMin: 540, endMin: 1080, breaks: [] }])
  const o = await createShop({ ownerId: OTHER, ownerEmail: 'c05o@example.com', name: 'c05o', slug: 'c05-other', industry: 'nail', timezone: 'America/New_York', defaultLang: 'en', ownerStaffName: 'Bo' })
  other = (await getShop(o.id))!
})
afterAll(async () => {
  await sql`delete from app.shops where slug like 'c05-%'`
  await sql`delete from app.users where id in ${sql([OWNER, OTHER])}`
})

type Intake = { formId: string; answers: unknown } | null
const book = (start: number, o: { addonIds?: string[]; intake?: Intake; phone?: string; mode?: 'online' | 'admin' } = {}) => createBooking({
  shop, mode: o.mode ?? 'online', kind: o.mode === 'admin' ? 'phone' : 'online', date: DAY, start, lang: 'en', now: NOW,
  guests: [{ serviceIds: [gel], addonIds: o.addonIds ?? [], staffId: ana }], intake: o.intake === undefined ? undefined : [o.intake],
  contact: { name: 'Ivy', phone: o.phone ?? `(555) 555-0${start}`, email: null }, force: o.mode === 'admin',
})

describe('CORE-05 service versions', () => {
  it('starts every service at version 1 and keeps versions immutable', async () => {
    const [v] = await sql<{ version: number; name: string; priceCents: number; currency: string }[]>`
      select version, name, price_cents, currency from app.service_versions where service_id = ${gel}`
    expect(v).toMatchObject({ version: 1, name: 'Gel Manicure', priceCents: 4000, currency: 'USD' })
    await expect(sql`update app.service_versions set price_cents = 1 where service_id = ${gel}`).rejects.toThrow(/immutable/)
  })

  it('a confirmed booking keeps the name, time and price it was booked with when the menu changes', async () => {
    const r = await book(600)
    await updateService(shop.id, gel, { name: 'Gel Manicure Deluxe', priceCents: 5500, durationMin: 60 })
    const after = (await getBooking(shop.id, r.bookings[0].id))!
    expect(after.items![0]).toMatchObject({ name: 'Gel Manicure', priceCents: 4000, durationMin: 45 })
    expect(after.durationMin).toBe(45)
    expect(after.estPriceCents).toBe(4000)
    const [ver] = await sql<{ version: number; name: string; priceCents: number }[]>`
      select v.version, v.name, v.price_cents from app.booking_items i join app.service_versions v on v.id = i.service_version_id where i.booking_id = ${r.bookings[0].id}`
    expect(ver).toMatchObject({ version: 1, name: 'Gel Manicure', priceCents: 4000 })
    // the next booking is made with version 2
    const r2 = await book(720)
    const [v2] = await sql<{ version: number }[]>`select v.version from app.booking_items i join app.service_versions v on v.id = i.service_version_id where i.booking_id = ${r2.bookings[0].id}`
    expect(v2.version).toBe(2)
    expect(r2.bookings[0].estPriceCents).toBe(5500)
    await updateService(shop.id, gel, { name: 'Gel Manicure', priceCents: 4000, durationMin: 45 })
  })

  it('a version survives its service being deleted, so history still reads', async () => {
    const [{ id }] = await sql<{ id: string }[]>`insert into app.services (shop_id, kind, category, name, duration_min, price_cents) values (${shop.id}, 'service', 'hand', 'Temp', 30, 100) returning id`
    await sql`delete from app.services where id = ${id}`
    const [v] = await sql<{ serviceId: string | null; name: string }[]>`select service_id, name from app.service_versions where name = 'Temp' and shop_id = ${shop.id}`
    expect(v).toEqual({ serviceId: null, name: 'Temp' })
  })
})

describe('CORE-05 intake forms', () => {
  let formId: string
  it('saves each edit as a new version and refuses anything outside the whitelist', async () => {
    expect((await activeForms(shop.id)).size).toBe(0)
    const f1 = await saveForm(shop.id, 'nail', nailIntake(removal), true, OWNER)
    expect(f1).toMatchObject({ version: 1, active: true })
    await expect(saveForm(shop.id, 'nail', { fields: [{ key: 'x', type: 'eval', label: { en: 'x', zh: 'x' }, required: false }] }, true, OWNER)).rejects.toMatchObject({ code: 'schema' })
    // an add-on from another shop can't be linked
    const foreign = nailIntake((await listServices(other.id)).find(x => x.name === 'Gel Removal')!.id)
    await expect(saveForm(shop.id, 'nail', foreign, true, OWNER)).rejects.toMatchObject({ code: 'schema', field: 'addonId' })
    const f2 = await saveForm(shop.id, 'nail', nailIntake(removal), true, OWNER)
    expect(f2.version).toBe(2)
    await expect(sql`update app.intake_forms set active = false where id = ${f1.id}`).rejects.toThrow(/immutable/)
    formId = f2.id
    expect((await activeForms(shop.id)).get('nail')?.id).toBe(formId)
  })

  it('makes customers answer before booking online; shop staff may skip it on the phone', async () => {
    await expect(book(780)).rejects.toMatchObject({ code: 'intake', detail: 'required' })
    const byPhone = await book(780, { mode: 'admin' })
    expect(await intakeFor(shop.id, [byPhone.bookings[0].id])).toEqual(new Map())
  })

  it('refuses unknown fields, out-of-date forms and photos that aren’t this shop’s', async () => {
    const answers = { currentNails: 'none', extension: 'no' }
    await expect(book(840, { intake: { formId, answers: { ...answers, ssn: '123' } } })).rejects.toMatchObject({ code: 'intake', detail: 'unknown_field:ssn' })
    const [old] = await sql<{ id: string }[]>`select id from app.intake_forms where shop_id = ${shop.id} and version = 1`
    await expect(book(840, { intake: { formId: old.id, answers } })).rejects.toMatchObject({ code: 'intake', detail: 'form_changed' })
    await expect(book(840, { intake: { formId, answers: { ...answers, handsPhoto: ['/media/ref/' + other.id + '/' + 'a'.repeat(32) + '.jpg'] } } })).rejects.toMatchObject({ code: 'intake', detail: 'bad_photo:handsPhoto' })
    await expect(book(840, { intake: { formId, answers: { ...answers, repairCount: 'lots' } } })).rejects.toBeInstanceOf(BookingError)
  })

  it('asks for the removal add-on instead of quietly booking the basic service', async () => {
    const intake = { formId, answers: { currentNails: 'gel', removal: 'yes' } }
    await expect(book(840, { intake })).rejects.toMatchObject({ code: 'intake', detail: `addon_missing:${removal}` })
    const ok = await book(840, { intake, addonIds: [removal] })
    expect(ok.review).toBe(false)
    expect(ok.bookings[0].durationMin).toBe(60) // 45 + 15 for removal
    const saved = (await intakeFor(shop.id, [ok.bookings[0].id])).get(ok.bookings[0].id)!
    expect(saved).toMatchObject({ formId, reviewState: 'not_needed', answers: { currentNails: 'gel', removal: 'yes' } })
  })

  it('keeps “not sure” bookings in review: not confirmed until the shop approves', async () => {
    const photo = await storeImage(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], 'h.jpg', { type: 'image/jpeg' }), `ref/${shop.id}`, { visibility: 'private' })
    const r = await book(960, { intake: { formId, answers: { currentNails: 'unsure', removal: 'yes', handsPhoto: [photo] } }, addonIds: [removal] })
    expect(r.review).toBe(true)
    const id = r.bookings[0].id
    expect((await intakeFor(shop.id, [id])).get(id)!.reviewState).toBe('pending')
    expect((await pendingReviews(shop.id)).map(p => p.bookingId)).toContain(id)
    // the time is held while the shop looks
    await expect(book(960, { intake: { formId, answers: { currentNails: 'none' } }, phone: '(555) 555-0999' })).rejects.toMatchObject({ code: 'taken' })
    // another shop can't review it
    await expect(reviewIntake(other, id, 'approve', OTHER)).rejects.toMatchObject({ code: 'not_found' })
    await reviewIntake(shop, id, 'approve', OWNER)
    expect((await intakeFor(shop.id, [id])).get(id)!.reviewState).toBe('approved')
    await expect(reviewIntake(shop, id, 'approve', OWNER)).rejects.toMatchObject({ code: 'not_allowed' })
  })

  it('declining a review cancels the booking with the reason', async () => {
    const r = await book(1020, { intake: { formId, answers: { currentNails: 'unsure', removal: 'no' } } })
    await reviewIntake(shop, r.bookings[0].id, 'decline', OWNER, 'Please come in for a consultation first')
    const b = (await getBooking(shop.id, r.bookings[0].id))!
    expect(b).toMatchObject({ status: 'cancelled', cancelledBy: 'shop', cancelReason: 'Please come in for a consultation first' })
    expect((await intakeFor(shop.id, [b.id])).get(b.id)!.reviewState).toBe('declined')
  })

  it('a form switched off asks nothing, and its old answers stay readable', async () => {
    await saveForm(shop.id, 'nail', nailIntake(removal), false, OWNER)
    expect((await activeForms(shop.id)).size).toBe(0)
    const r = await book(1020, { phone: '(555) 555-0888' })
    expect(r.review).toBe(false)
    // and a move of an older booking keeps its answers
    const [anyAnswered] = await sql<{ bookingId: string }[]>`select booking_id from app.intake_responses where shop_id = ${shop.id} and review_state = 'approved'`
    const moved = await shopMove(shop, anyAnswered.bookingId, DAY, 645, ana, OWNER, true)
    expect(moved[0].startMin).toBe(645)
    expect((await intakeFor(shop.id, [anyAnswered.bookingId])).get(anyAnswered.bookingId)!.reviewState).toBe('approved')
  })
})
