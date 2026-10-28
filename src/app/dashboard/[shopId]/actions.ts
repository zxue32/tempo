'use server'
import { INDUSTRIES } from '@/lib/templates'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { requireShop } from '@/lib/auth'
import { sql } from '@/lib/db'
import { getShop, submitShop, updateShop, readiness, type ShopPatch } from '@/lib/data/shops'
import { createStaff, updateStaff, deleteStaff, setStaffSkills, reorderStaff, createService, updateService, deleteService, reorderServices, listStaff } from '@/lib/data/catalog'
import { saveShifts, upsertSpecialDay, deleteSpecialDay } from '@/lib/data/schedule'
import { createBooking, shopMove, shopSetStatus, shopSetItems, shopUpdateDetails, shopMarkStarted, getBooking, bookingEvents, BookingError } from '@/lib/bookings'
import { parsePhone, phoneKey } from '@/lib/phone'
import { marketOf } from '@/lib/markets'
import { publicImageFor } from '@/lib/media'
import { audit } from '@/lib/audit'
import { logError } from '@/lib/log'
import { saveResource, deleteResource, addGalleryItem, updateGalleryItem, deleteGalleryItem, reorderGallery, listPalette, saveSwatch, deleteSwatch, reorderPalette } from '@/lib/data/rules'
import { integrityCheck } from '@/lib/data/pilot'
import { savePreferences } from '@/lib/data/insights'
import { cleanPrefs } from '@/lib/prefs'
import { markWaitlist } from '@/lib/data/waitlist'
import { notifyWaitlist } from '@/lib/waitlistNotify'
import { replayPaperBook, type ReplayResult } from '@/lib/replay'
import { mailCustomer, mailAdminsNewApplication, mailStaffInvite, emailConfigured } from '@/lib/email'
import { env } from '@/lib/env'
import { storeImage, UploadError } from '@/lib/storage'
import { uuid, dateStr, minuteOfDay, guestsSchema, emailRe } from '@/lib/validate'
import { isValidTimeZone } from '@/lib/tz'
import { THEMES } from '@/lib/themes'
import type { Booking, BookingStatus, Lang, Preferences } from '@/lib/types'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; detail?: string }
const fail = (error: string, detail?: string): { ok: false; error: string; detail?: string } => ({ ok: false, error, detail })

function bookingFail(e: unknown) {
  if (e instanceof BookingError) return fail(e.code, e.detail)
  logError('action', e)
  return fail('server')
}

/** Phone numbers typed in the dashboard are read in the shop's own region (CORE-03). */
async function phoneRegionOf(shopId: string) {
  return marketOf((await getShop(shopId)) ?? {}).phoneRegion
}

// ---------------------------------------------------------------- review


export async function submitForReview(shopId: string): Promise<Result<{ status: string; issues: string[] }>> {
  const { user } = await requireShop(shopId, 'owner')
  const r = await submitShop(shopId)
  if (r.issues.length) return { ok: true, status: r.status, issues: r.issues }
  const shop = (await getShop(shopId))!
  if (r.status === 'pending') await mailAdminsNewApplication(shop, user.email)
  return { ok: true, status: r.status, issues: [] }
}

export async function checkReadiness(shopId: string) {
  await requireShop(shopId, 'manager')
  return readiness(shopId)
}

// ---------------------------------------------------------------- bookings

const contactSchema = z.object({ name: z.string().trim().max(80), phone: z.string().trim().max(30), email: z.string().trim().max(120) })

const createSchema = z.object({
  kind: z.enum(['walkin', 'phone', 'block']),
  date: dateStr,
  start: minuteOfDay,
  guests: z.array(z.object({ serviceIds: z.array(uuid).max(8), addonIds: z.array(uuid).max(8), staffId: uuid.nullable() })).max(10),
  block: z.object({ staffId: uuid, minutes: z.number().int().min(5).max(1440) }).optional(),
  contact: contactSchema.optional(),
  notes: z.string().max(1000).optional(),
  force: z.boolean().optional(),
})

export async function createBookingAction(shopId: string, input: z.input<typeof createSchema>): Promise<Result<{ id: string }>> {
  const { user } = await requireShop(shopId, 'manager')
  const p = createSchema.safeParse(input)
  if (!p.success) return fail('invalid')
  const d = p.data
  const shop = (await getShop(shopId))!
  const contact = d.kind === 'block' ? null : d.contact && (d.contact.name || d.contact.phone || d.contact.email)
    ? { name: d.contact.name || (d.kind === 'walkin' ? 'Walk-in' : '—'), phone: d.contact.phone || null, email: d.contact.email && emailRe.test(d.contact.email) ? d.contact.email.toLowerCase() : null }
    : { name: d.kind === 'walkin' ? 'Walk-in' : '—', phone: null, email: null }
  try {
    const res = await createBooking({
      shop, mode: 'admin', kind: d.kind, date: d.date, start: d.start, guests: d.kind === 'block' ? [] : d.guests,
      block: d.block, contact, notes: d.notes?.trim() || null, lang: shop.defaultLang, createdBy: user.id, force: d.force,
    })
    if (d.kind === 'phone' && contact?.email) await mailCustomer('confirmed', shop, res.bookings, await listStaff(shop.id))
    return { ok: true, id: res.bookings[0].id }
  } catch (e) {
    return bookingFail(e)
  }
}

export async function bookingDetail(shopId: string, bookingId: string) {
  const { member } = await requireShop(shopId, 'staff')
  const b = await getBooking(shopId, bookingId)
  if (!b) return null
  if (member.role === 'staff' && b.staffId !== member.staffId) return null
  const [events, group, stats, cust] = await Promise.all([
    bookingEvents(b.id),
    b.groupId ? sql<{ id: string; staffId: string }[]>`select id, staff_id from app.bookings where group_id = ${b.groupId}` : Promise.resolve([]),
    b.customerId
      ? sql<{ visits: number; noShows: number }[]>`
          select count(*) filter (where status = 'completed')::int as visits, count(*) filter (where status = 'no_show')::int as no_shows
          from app.bookings where customer_id = ${b.customerId}`
      : Promise.resolve([{ visits: 0, noShows: 0 }]),
    b.customerId ? sql<{ preferences: Preferences | null }[]>`select preferences from app.customers where id = ${b.customerId}` : Promise.resolve([]),
  ])
  return { booking: b, events, groupSize: group.length || 1, stats: stats[0], reminderSent: !!b.reminderSentAt, prefs: cust[0]?.preferences ?? null }
}

export async function setBookingStatusAction(shopId: string, bookingId: string, status: BookingStatus, opts: { reason?: string; notify?: boolean } = {}): Promise<Result> {
  const { user, member } = await requireShop(shopId, 'staff')
  if (!['confirmed', 'completed', 'no_show', 'cancelled'].includes(status)) return fail('invalid')
  const shop = (await getShop(shopId))!
  const b = await getBooking(shopId, bookingId)
  if (!b) return fail('not_found')
  if (member.role === 'staff' && (b.staffId !== member.staffId || !['completed', 'no_show'].includes(status))) return fail('not_allowed')
  try {
    const reason = opts.reason?.trim().slice(0, 500) || null
    const updated = await shopSetStatus(shop, bookingId, status, user.id, reason)
    if (status === 'cancelled' && opts.notify && updated.guestEmail && updated.kind !== 'block') {
      await mailCustomer('cancelled_by_shop', shop, [updated], await listStaff(shop.id), reason)
    }
    if (status === 'cancelled') await notifyWaitlist(shop, updated.date).catch(e => logError('waitlist', e))
    return { ok: true }
  } catch (e) {
    return bookingFail(e)
  }
}

export async function moveBookingAction(shopId: string, bookingId: string, input: { date: string; start: number; staffId: string; force?: boolean; notify?: boolean }): Promise<Result> {
  const { user } = await requireShop(shopId, 'manager')
  const p = z.object({ date: dateStr, start: minuteOfDay, staffId: uuid, force: z.boolean().optional(), notify: z.boolean().optional() }).safeParse(input)
  if (!p.success) return fail('invalid')
  const shop = (await getShop(shopId))!
  try {
    const moved = await shopMove(shop, bookingId, p.data.date, p.data.start, p.data.staffId, user.id, !!p.data.force)
    if (p.data.notify && moved[0]?.guestEmail && moved[0].kind !== 'block') await mailCustomer('rescheduled', shop, moved, await listStaff(shop.id))
    return { ok: true }
  } catch (e) {
    return bookingFail(e)
  }
}

export async function setItemsAction(shopId: string, bookingId: string, serviceIds: string[], addonIds: string[], force = false): Promise<Result> {
  const { user } = await requireShop(shopId, 'manager')
  const p = z.object({ s: z.array(uuid).min(1).max(8), a: z.array(uuid).max(8) }).safeParse({ s: serviceIds, a: addonIds })
  if (!p.success) return fail('invalid')
  const shop = (await getShop(shopId))!
  try {
    await shopSetItems(shop, bookingId, p.data.s, p.data.a, user.id, force)
    return { ok: true }
  } catch (e) {
    return bookingFail(e)
  }
}

export async function updateBookingDetailsAction(shopId: string, bookingId: string, d: { guestName?: string; guestPhone?: string; guestEmail?: string; notes?: string; internalNote?: string }): Promise<Result> {
  await requireShop(shopId, 'manager')
  const shop = (await getShop(shopId))!
  const clip = (v: string | undefined, n: number) => (v === undefined ? undefined : v.trim().slice(0, n) || null)
  await shopUpdateDetails(shop, bookingId, {
    guestName: clip(d.guestName, 80), guestPhone: clip(d.guestPhone, 30),
    guestEmail: d.guestEmail === undefined ? undefined : emailRe.test(d.guestEmail.trim()) ? d.guestEmail.trim().toLowerCase() : null,
    notes: clip(d.notes, 1000), internalNote: clip(d.internalNote, 2000),
  })
  return { ok: true }
}

export async function findCustomerByPhone(shopId: string, phone: string) {
  await requireShop(shopId, 'manager')
  const p = phoneKey(phone, await phoneRegionOf(shopId))
  if (p.length < 7) return null
  const [c] = await sql<{ id: string; name: string; email: string | null; visits: number; preferences: Preferences | null }[]>`
    select c.id, c.name, c.email, c.preferences, (select count(*)::int from app.bookings b where b.customer_id = c.id and b.status = 'completed') as visits
    from app.customers c where c.shop_id = ${shopId} and c.phone_norm = ${p}
  `
  return c ?? null
}

// ---------------------------------------------------------------- staff

const weekSchema = z.record(z.string().regex(/^[0-6]$/), z.object({
  start: minuteOfDay, end: minuteOfDay, breaks: z.array(z.tuple([minuteOfDay, minuteOfDay])).max(4),
}))
const staffSchema = z.object({
  name: z.string().trim().min(1).max(60),
  nameZh: z.string().trim().max(60).optional(),
  bioEn: z.string().trim().max(300).optional(),
  bioZh: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  photoUrl: z.string().max(500).nullable().optional(),
  active: z.boolean(),
  bookableOnline: z.boolean(),
  commissionPct: z.number().min(0).max(100),
  defaultWeek: weekSchema.optional(),
  publicPage: z.boolean().optional(),
  specialties: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
  specialtiesZh: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
})

export async function saveStaffAction(shopId: string, staffId: string | null, input: z.input<typeof staffSchema>): Promise<Result<{ id: string }>> {
  await requireShop(shopId, 'manager')
  const p = staffSchema.safeParse(input)
  if (!p.success) return fail('invalid', p.error.issues[0]?.path.join('.'))
  const d = { ...p.data, nameZh: p.data.nameZh || null, bioEn: p.data.bioEn || null, bioZh: p.data.bioZh || null }
  // a team photo is public: never a customer's private photo or another shop's upload (CORE-04)
  if (d.photoUrl && !publicImageFor(d.photoUrl, shopId)) return fail('invalid', 'photoUrl')
  if (d.defaultWeek) for (const v of Object.values(d.defaultWeek)) if (!(v.end > v.start)) return fail('invalid', 'defaultWeek')
  if (staffId) {
    await updateStaff(shopId, staffId, d)
    if (!d.active) await sql`update app.staff set bookable_online = false where id = ${staffId} and shop_id = ${shopId}`
    return { ok: true, id: staffId }
  }
  const id = await createStaff(shopId, d)
  await sql`insert into app.staff_services (staff_id, service_id) select ${id}, id from app.services where shop_id = ${shopId} and kind = 'service' and active`
  return { ok: true, id }
}

export async function deleteStaffAction(shopId: string, staffId: string): Promise<Result<{ result: string }>> {
  const { user } = await requireShop(shopId, 'manager')
  const result = await deleteStaff(shopId, staffId)
  if (result === 'not_found') return fail('not_found')
  await audit(sql, { shopId, actorUser: user.id, action: `staff.${result === 'deleted' ? 'delete' : 'deactivate'}`, targetType: 'staff', targetId: staffId })
  return { ok: true, result }
}

export async function reorderStaffAction(shopId: string, ids: string[]): Promise<Result> {
  await requireShop(shopId, 'manager')
  await reorderStaff(shopId, ids.filter(i => uuid.safeParse(i).success))
  return { ok: true }
}

export async function setSkillsAction(shopId: string, staffId: string, skills: Array<{ serviceId: string; durationMin: number | null }>): Promise<Result> {
  await requireShop(shopId, 'manager')
  const p = z.array(z.object({ serviceId: uuid, durationMin: z.number().int().min(5).max(600).nullable() })).max(200).safeParse(skills)
  if (!p.success) return fail('invalid')
  await setStaffSkills(shopId, staffId, p.data)
  return { ok: true }
}

/** Creates a join link for this staff member. Whoever opens it and signs in becomes this person's login (no email matching). */
export async function inviteStaffAction(shopId: string, staffId: string, email: string, role: 'staff' | 'manager' = 'staff'): Promise<Result<{ link: string; emailed: boolean }>> {
  const { user } = await requireShop(shopId, 'manager')
  const e = email.trim().toLowerCase()
  if (e && !emailRe.test(e)) return fail('invalid', 'email')
  const shop = (await getShop(shopId))!
  const [st] = await sql`select 1 from app.staff where id = ${staffId} and shop_id = ${shopId}`
  if (!st) return fail('not_found')
  await sql`delete from app.member_invites where shop_id = ${shopId} and staff_id = ${staffId} and accepted_at is null`
  const token = randomBytes(18).toString('base64url')
  await sql`
    insert into app.member_invites (shop_id, email, role, staff_id, token, invited_by)
    values (${shopId}, ${e || '-'}, ${role === 'manager' ? 'manager' : 'staff'}, ${staffId}, ${token}, ${user.id})
  `
  const link = `${env.siteUrl}/join/${token}`
  const emailed = !!e && emailConfigured()
  if (emailed) await mailStaffInvite(shop, e, shop.defaultLang, link)
  await audit(sql, { shopId, actorUser: user.id, action: 'member.invite', targetType: 'staff', targetId: staffId, detail: { role: role === 'manager' ? 'manager' : 'staff', emailed } })
  return { ok: true, link, emailed }
}

export async function removeMemberAction(shopId: string, userId: string): Promise<Result> {
  const { user } = await requireShop(shopId, 'manager')
  if (!uuid.safeParse(userId).success) return fail('invalid')
  const gone = await sql`delete from app.shop_members where shop_id = ${shopId} and user_id = ${userId} and role <> 'owner' returning user_id`
  if (gone.length) await audit(sql, { shopId, actorUser: user.id, action: 'member.remove', targetType: 'user', targetId: userId })
  return { ok: true }
}

// ---------------------------------------------------------------- services

const serviceSchema = z.object({
  kind: z.enum(['service', 'addon']),
  category: z.string().regex(/^[a-z]{2,12}$/),
  appliesTo: z.array(z.string().regex(/^[a-z]{2,12}$/)).max(10),
  name: z.string().trim().min(1).max(80),
  nameZh: z.string().trim().max(80).optional(),
  descEn: z.string().trim().max(300).optional(),
  descZh: z.string().trim().max(300).optional(),
  durationMin: z.number().int().min(5).max(600),
  priceCents: z.number().int().min(0).max(10000000).nullable(),
  priceFrom: z.boolean(),
  active: z.boolean(),
  online: z.boolean(),
  resourceId: uuid.nullable().optional(),
  questionEn: z.string().trim().max(160).optional(),
  questionZh: z.string().trim().max(160).optional(),
})

export async function saveServiceAction(shopId: string, id: string | null, input: z.input<typeof serviceSchema>): Promise<Result<{ id: string }>> {
  await requireShop(shopId, 'manager')
  const p = serviceSchema.safeParse(input)
  if (!p.success) return fail('invalid', p.error.issues[0]?.path.join('.'))
  const d = { ...p.data, nameZh: p.data.nameZh || null, descEn: p.data.descEn || null, descZh: p.data.descZh || null,
    questionEn: p.data.kind === 'addon' ? p.data.questionEn || null : null, questionZh: p.data.kind === 'addon' ? p.data.questionZh || null : null }
  if (d.kind === 'addon') d.category = 'addon'
  if (d.resourceId) {
    const [own] = await sql`select 1 from app.resources where id = ${d.resourceId} and shop_id = ${shopId}`
    if (!own) return fail('invalid', 'resourceId')
  }
  if (id) {
    await updateService(shopId, id, d)
    return { ok: true, id }
  }
  return { ok: true, id: await createService(shopId, d) }
}

export async function deleteServiceAction(shopId: string, id: string): Promise<Result> {
  await requireShop(shopId, 'manager')
  await deleteService(shopId, id)
  return { ok: true }
}

export async function reorderServicesAction(shopId: string, ids: string[]): Promise<Result> {
  await requireShop(shopId, 'manager')
  await reorderServices(shopId, ids.filter(i => uuid.safeParse(i).success))
  return { ok: true }
}

// ---------------------------------------------------------------- schedule

const shiftRow = z.object({ staffId: uuid, date: dateStr, startMin: minuteOfDay, endMin: minuteOfDay, breaks: z.array(z.tuple([minuteOfDay, minuteOfDay])).max(4) })

export async function saveWeekAction(shopId: string, from: string, to: string, rows: z.input<typeof shiftRow>[]): Promise<Result<{ conflicts: Booking[] }>> {
  await requireShop(shopId, 'manager')
  const p = z.object({ from: dateStr, to: dateStr, rows: z.array(shiftRow).max(700) }).safeParse({ from, to, rows })
  if (!p.success) return fail('invalid')
  for (const r of p.data.rows) if (!(r.endMin > r.startMin)) return fail('bad_time', r.date)
  await saveShifts(shopId, p.data.from, p.data.to, p.data.rows)
  // bookings that now fall outside someone's roster (kept, but the owner should know)
  const conflicts = await sql<Booking[]>`
    select b.* from app.bookings b
    left join app.shifts s on s.staff_id = b.staff_id and s.date = b.date
    where b.shop_id = ${shopId} and b.date between ${p.data.from} and ${p.data.to}
      and b.status = 'confirmed' and b.kind <> 'block'
      and (s.staff_id is null or b.start_min < s.start_min or b.end_min > s.end_min)
    order by b.date, b.start_min
  `
  return { ok: true, conflicts }
}

export async function saveSpecialDayAction(shopId: string, d: { date: string; closed: boolean; openMin: number | null; closeMin: number | null; note: string | null }): Promise<Result> {
  await requireShop(shopId, 'manager')
  const p = z.object({ date: dateStr, closed: z.boolean(), openMin: minuteOfDay.nullable(), closeMin: minuteOfDay.nullable(), note: z.string().max(120).nullable() }).safeParse(d)
  if (!p.success) return fail('invalid')
  if (!p.data.closed && !(p.data.openMin != null && p.data.closeMin != null && p.data.closeMin > p.data.openMin)) return fail('bad_time')
  await upsertSpecialDay(shopId, p.data)
  return { ok: true }
}

export async function deleteSpecialDayAction(shopId: string, date: string): Promise<Result> {
  await requireShop(shopId, 'manager')
  if (!dateStr.safeParse(date).success) return fail('invalid')
  await deleteSpecialDay(shopId, date)
  return { ok: true }
}

// ---------------------------------------------------------------- settings

const hoursSchema = z.record(z.string().regex(/^[0-6]$/), z.object({ closed: z.boolean(), open: minuteOfDay, close: minuteOfDay }))
const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nameZh: z.string().trim().max(80).nullable(),
  aboutEn: z.string().trim().max(2000).nullable(),
  aboutZh: z.string().trim().max(2000).nullable(),
  theme: z.string().refine(v => v in THEMES),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  logoUrl: z.string().max(500).nullable(),
  coverUrl: z.string().max(500).nullable(),
  phone: z.string().trim().max(30).nullable(),
  email: z.string().trim().max(120).nullable(),
  address: z.string().trim().max(200).nullable(),
  city: z.string().trim().max(80).nullable(),
  mapUrl: z.string().trim().max(500).nullable(),
  instagram: z.string().trim().max(80).nullable(),
  timezone: z.string().refine(isValidTimeZone),
  defaultLang: z.enum(['zh', 'en']),
  hours: hoursSchema,
  slotMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)]),
  leadMinutes: z.number().int().min(0).max(10080),
  maxDays: z.number().int().min(1).max(365),
  cancelCutoffMinutes: z.number().int().min(0).max(10080),
  bufferMinutes: z.number().int().min(0).max(120),
  maxGuests: z.number().int().min(1).max(10),
  allowAnyStaff: z.boolean(),
  showPrices: z.boolean(),
  bookingNoteEn: z.string().trim().max(1000).nullable(),
  bookingNoteZh: z.string().trim().max(1000).nullable(),
  notifyEmails: z.array(z.string().regex(emailRe)).max(10),
  notifyStaff: z.boolean(),
  industry: z.enum(INDUSTRIES),
  walkinReserve: z.number().int().min(0).max(50),
  assignMode: z.enum(['balanced', 'turns']),
  turnsCountRequests: z.boolean(),
  minGap: z.number().int().min(0).max(120),
  noshowLimit: z.number().int().min(0).max(20),
  waitlistEnabled: z.boolean(),
}).partial()

export async function saveSettingsAction(shopId: string, input: z.input<typeof settingsSchema>): Promise<Result> {
  await requireShop(shopId, 'manager')
  const p = settingsSchema.safeParse(input)
  if (!p.success) return fail('invalid', p.error.issues[0]?.path.join('.'))
  const d = p.data
  if (d.hours) for (const h of Object.values(d.hours)) if (!h.closed && !(h.close > h.open)) return fail('bad_time')
  if (d.mapUrl && !/^https?:\/\//.test(d.mapUrl)) return fail('invalid', 'mapUrl')
  if (d.email && !emailRe.test(d.email)) return fail('invalid', 'email')
  for (const k of ['logoUrl', 'coverUrl'] as const) if (d[k] && !publicImageFor(d[k], shopId)) return fail('invalid', k)
  const toNull = (v: string | null | undefined) => (v === undefined ? undefined : v || null)
  const patch: ShopPatch = { ...d } as ShopPatch
  for (const k of ['nameZh', 'aboutEn', 'aboutZh', 'phone', 'email', 'address', 'city', 'mapUrl', 'instagram', 'bookingNoteEn', 'bookingNoteZh'] as const) {
    if (k in d) (patch as Record<string, unknown>)[k] = toNull(d[k])
  }
  await updateShop(shopId, patch)
  return { ok: true }
}

export async function uploadImageAction(shopId: string, form: FormData): Promise<Result<{ url: string }>> {
  await requireShop(shopId, 'manager')
  const file = form.get('file')
  const kind = String(form.get('kind') || 'shop')
  if (!(file instanceof File)) return fail('invalid')
  try {
    const url = await storeImage(file, `${kind === 'staff' ? 'staff' : kind === 'gallery' ? 'gallery' : 'shop'}/${shopId}`)
    return { ok: true, url }
  } catch (e) {
    if (e instanceof UploadError) return fail('upload', e.message)
    logError('upload', e)
    return fail('server')
  }
}

// ---------------------------------------------------------------- customers

export async function saveCustomerAction(shopId: string, id: string, d: { name: string; phone: string; email: string; notes: string; blocked: boolean }): Promise<Result> {
  const { user } = await requireShop(shopId, 'manager')
  const p = z.object({ name: z.string().trim().min(1).max(80), phone: z.string().trim().max(30), email: z.string().trim().max(120), notes: z.string().max(2000), blocked: z.boolean() }).safeParse(d)
  if (!p.success) return fail('invalid')
  const email = p.data.email && emailRe.test(p.data.email) ? p.data.email.toLowerCase() : null
  const region = await phoneRegionOf(shopId)
  try {
    const [before] = await sql<{ name: string; phone: string | null; email: string | null; notes: string | null; blocked: boolean }[]>`
      select name, phone, email, notes, blocked from app.customers where id = ${id} and shop_id = ${shopId}`
    if (!before) return fail('not_found')
    await sql`
      update app.customers set name = ${p.data.name}, phone = ${p.data.phone || null}, phone_norm = ${phoneKey(p.data.phone, region)},
        phone_e164 = ${parsePhone(p.data.phone, region)?.e164 ?? null},
        email = ${email}, notes = ${p.data.notes || null}, blocked = ${p.data.blocked}
      where id = ${id} and shop_id = ${shopId}
    `
    // which fields changed, never their values
    const after = { name: p.data.name, phone: p.data.phone || null, email, notes: p.data.notes || null, blocked: p.data.blocked }
    const fields = (Object.keys(after) as (keyof typeof after)[]).filter(k => after[k] !== before[k])
    if (fields.length) await audit(sql, { shopId, actorUser: user.id, action: 'customer.update', targetType: 'customer', targetId: id, detail: { fields } })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return fail('duplicate_phone')
    throw e
  }
  return { ok: true }
}

const prefsSchema = z.object({
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(6).optional(),
  shape: z.enum(['round', 'square', 'squoval', 'almond', 'coffin', 'stiletto']).nullish(),
  length: z.enum(['short', 'medium', 'long']).nullish(),
  finish: z.enum(['glossy', 'matte', 'chrome', 'glitter']).nullish(),
  styles: z.array(z.string().regex(/^[a-z]{2,16}$/)).max(8).optional(),
  hairColor: z.string().trim().max(80).optional(),
  hairStyle: z.string().trim().max(80).optional(),
  staffId: uuid.nullish(),
  notes: z.string().trim().max(500).optional(),
})

/** The client's preference card: what they usually like, kept by the shop. */
export async function savePreferencesAction(shopId: string, customerId: string, input: unknown): Promise<Result> {
  const { user } = await requireShop(shopId, 'manager')
  const p = prefsSchema.safeParse(input)
  if (!p.success || !uuid.safeParse(customerId).success) return fail('invalid')
  const prefs = cleanPrefs({ ...p.data, shape: p.data.shape ?? undefined, length: p.data.length ?? undefined, finish: p.data.finish ?? undefined, staffId: p.data.staffId ?? null })
  if (prefs.staffId && !(await listStaff(shopId)).some(s => s.id === prefs.staffId)) return fail('invalid')
  if (!(await savePreferences(shopId, customerId, prefs))) return fail('not_found')
  await audit(sql, { shopId, actorUser: user.id, action: 'customer.preferences', targetType: 'customer', targetId: customerId, detail: { fields: Object.keys(prefs) } })
  revalidatePath(`/dashboard/${shopId}/customers/${customerId}`)
  return { ok: true }
}

// ---------------------------------------------------------------- equipment

const resourceSchema = z.object({ name: z.string().trim().min(1).max(60), nameZh: z.string().trim().max(60), quantity: z.number().int().min(1).max(100) })

export async function saveResourceAction(shopId: string, id: string | null, input: z.input<typeof resourceSchema>): Promise<Result<{ id: string }>> {
  await requireShop(shopId, 'manager')
  const p = resourceSchema.safeParse(input)
  if (!p.success || (id && !uuid.safeParse(id).success)) return fail('invalid')
  return { ok: true, id: await saveResource(shopId, id, { ...p.data, nameZh: p.data.nameZh || null }) }
}

export async function deleteResourceAction(shopId: string, id: string): Promise<Result> {
  await requireShop(shopId, 'manager')
  if (!uuid.safeParse(id).success) return fail('invalid')
  await deleteResource(shopId, id)
  return { ok: true }
}

// ---------------------------------------------------------------- gallery

export async function uploadGalleryAction(shopId: string, form: FormData): Promise<Result<{ id: string; url: string }>> {
  await requireShop(shopId, 'manager')
  const file = form.get('file')
  if (!(file instanceof File)) return fail('invalid')
  try {
    const url = await storeImage(file, `gallery/${shopId}`)
    const item = await addGalleryItem(shopId, url)
    if (!item) return fail('limit')
    return { ok: true, id: item.id, url }
  } catch (e) {
    if (e instanceof UploadError) return fail('upload', e.message)
    logError('action', e)
    return fail('server')
  }
}

const tagsSchema = z.object({
  length: z.enum(['short', 'medium', 'long']).optional(),
  style: z.array(z.string().regex(/^[a-z]{2,16}$/)).max(6).optional(),
  colorId: uuid.optional(),
}).strict()
const galleryPatch = z.object({ captionEn: z.string().trim().max(200), captionZh: z.string().trim().max(200), staffId: uuid.nullable(), serviceId: uuid.nullable(), tags: tagsSchema.optional() })

export async function updateGalleryAction(shopId: string, id: string, input: z.input<typeof galleryPatch>): Promise<Result> {
  await requireShop(shopId, 'manager')
  const p = galleryPatch.safeParse(input)
  if (!p.success || !uuid.safeParse(id).success) return fail('invalid')
  await updateGalleryItem(shopId, id, { ...p.data, captionEn: p.data.captionEn || null, captionZh: p.data.captionZh || null })
  return { ok: true }
}

export async function deleteGalleryAction(shopId: string, id: string): Promise<Result> {
  await requireShop(shopId, 'manager')
  if (!uuid.safeParse(id).success) return fail('invalid')
  await deleteGalleryItem(shopId, id)
  return { ok: true }
}

export async function reorderGalleryAction(shopId: string, ids: string[]): Promise<Result> {
  await requireShop(shopId, 'manager')
  await reorderGallery(shopId, ids.filter(i => uuid.safeParse(i).success))
  return { ok: true }
}

// ---------------------------------------------------------------- colour palette

const swatchSchema = z.object({
  kind: z.enum(['hair', 'nail']),
  name: z.string().trim().min(1).max(60),
  nameZh: z.string().trim().max(60),
  code: z.string().trim().max(40),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  hex2: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  active: z.boolean(),
})

export async function saveSwatchAction(shopId: string, id: string | null, input: z.input<typeof swatchSchema>, form?: FormData): Promise<Result<{ id: string }>> {
  await requireShop(shopId, 'manager')
  const p = swatchSchema.safeParse(input)
  if (!p.success || (id && !uuid.safeParse(id).success)) return fail('invalid')
  let photoUrl: string | null | undefined = undefined
  const file = form?.get('file')
  if (file instanceof File && file.size > 0) {
    try { photoUrl = await storeImage(file, `palette/${shopId}`) } catch (e) { return fail('upload', e instanceof UploadError ? e.message : 'server') }
  }
  const existing = id ? (await listPalette(shopId)).find(x => x.id === id) : null
  const row = await saveSwatch(shopId, id, { ...p.data, nameZh: p.data.nameZh || null, code: p.data.code || null, photoUrl: photoUrl ?? existing?.photoUrl ?? null })
  if (!row) return fail('limit')
  revalidatePath(`/dashboard/${shopId}/palette`)
  return { ok: true, id: row.id }
}

export async function deleteSwatchAction(shopId: string, id: string): Promise<Result> {
  await requireShop(shopId, 'manager')
  if (!uuid.safeParse(id).success) return fail('invalid')
  await deleteSwatch(shopId, id)
  return { ok: true }
}

export async function reorderPaletteAction(shopId: string, ids: string[]): Promise<Result> {
  await requireShop(shopId, 'manager')
  await reorderPalette(shopId, ids.filter(i => uuid.safeParse(i).success))
  return { ok: true }
}

// ---------------------------------------------------------------- measuring real durations

export async function markStartedAction(shopId: string, bookingId: string): Promise<Result> {
  const { user, member } = await requireShop(shopId, 'staff')
  const shop = (await getShop(shopId))!
  const b = await getBooking(shopId, bookingId)
  if (!b) return fail('not_found')
  if (member.role === 'staff' && b.staffId !== member.staffId) return fail('not_allowed')
  try {
    await shopMarkStarted(shop, bookingId, user.id)
    return { ok: true }
  } catch (e) {
    return bookingFail(e)
  }
}

/** Use the measured time as this technician's own duration for the service. */
export async function applyDurationAction(shopId: string, staffId: string, serviceId: string, minutes: number): Promise<Result> {
  await requireShop(shopId, 'manager')
  if (!uuid.safeParse(staffId).success || !uuid.safeParse(serviceId).success) return fail('invalid')
  const m = Math.round(minutes / 5) * 5
  if (!(m >= 5 && m <= 600)) return fail('invalid')
  const rows = await sql`
    update app.staff_services ss set duration_min = ${m}
    from app.staff st where st.id = ss.staff_id and st.shop_id = ${shopId} and ss.staff_id = ${staffId} and ss.service_id = ${serviceId}
    returning ss.staff_id
  `
  return rows.length ? { ok: true } : fail('not_found')
}

// ---------------------------------------------------------------- pilot

const numOrNull = z.number().min(0).max(100000).nullable()
const baselineSchema = z.object({
  from: dateStr.optional(), to: dateStr.optional(),
  noShowPct: numOrNull, callsPerDay: numOrNull, callsNow: numOrNull.optional(), onlinePct: numOrNull, idleHoursPerDay: numOrNull,
  notes: z.string().max(2000).nullable(),
  checks: z.array(z.object({ date: dateStr, diffs: z.number().int().min(0).max(999), note: z.string().max(300).nullable().optional() })).max(120).optional(),
})

export async function savePilotAction(shopId: string, input: z.input<typeof baselineSchema>): Promise<Result> {
  await requireShop(shopId, 'manager')
  const p = baselineSchema.safeParse(input)
  if (!p.success) return fail('invalid', p.error.issues[0]?.path.join('.'))
  await updateShop(shopId, { pilotBaseline: p.data })
  return { ok: true }
}

export async function runIntegrityAction(shopId: string): Promise<Result> {
  await requireShop(shopId, 'manager')
  await integrityCheck(shopId)
  return { ok: true }
}

export async function removeWaitlistAction(shopId: string, id: string): Promise<Result> {
  await requireShop(shopId, 'manager')
  if (!uuid.safeParse(id).success) return fail('invalid')
  await markWaitlist(shopId, id, 'removed')
  return { ok: true }
}

/** Check today's rules against real past visits typed from the paper book. Reads only; writes nothing. */
export async function replayAction(shopId: string, csv: string): Promise<Result<{ result: ReplayResult }>> {
  await requireShop(shopId, 'manager')
  if (typeof csv !== 'string' || csv.length > 400_000) return fail('invalid')
  const shop = (await getShop(shopId))!
  return { ok: true, result: await replayPaperBook(shop, csv) }
}
