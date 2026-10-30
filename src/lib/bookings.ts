import 'server-only'
import { randomBytes, randomInt } from 'node:crypto'
import { sql, isOverlapViolation, type Tx } from './db'
import type { Shop, Booking, BookingItem, BookingKind, BookingStatus, Lang, Service, NailDesign } from './types'
import { loadCatalog, type Catalog } from './data/catalog'
import { buildDays } from './availability'
import { findSlots, blocker, guestDuration, qualifies, guestResources, resourceConflict, type GuestRequest, type Assignment } from './engine'
import { nowInZone, diffDays, resolveLocal } from './tz'
import { unbookableReason } from './industries/registry'
import { marketOf, marketOpen } from './markets'
import { parsePhone, phoneKey, legacyPhoneKey } from './phone'
import { checkAnswers, FormError, type Answers } from './forms'
import { activeForms } from './data/forms'
import { refPhotoFor } from './media'

export class BookingError extends Error {
  constructor(public code:
    | 'not_open' | 'invalid' | 'too_soon' | 'too_far' | 'taken' | 'limit' | 'blocked' | 'not_found'
    | 'cutoff' | 'not_allowed' | 'service_gone' | 'outside_shift' | 'closed' | 'busy'
    /** the service belongs to an industry this shop can't take bookings for (CORE-02) */
    | 'capability_disabled'
    /** the shop's market isn't open for trading (CORE-03) */
    | 'market_unsupported'
    /** the intake answers were missing, out of date or not acceptable; `detail` says which (CORE-05) */
    | 'intake',
    public detail?: string) {
    super(code)
  }
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')
const makeToken = () => randomBytes(18).toString('base64url')
/** Digits-only phone key used before CORE-03 (kept for partial-number search); matching uses `phoneKey`. */
export const normPhone = legacyPhoneKey

/**
 * The instant a local start time means (CORE-03). A time the clocks skip is refused; a time the clocks repeat
 * needs the caller to say which of the two it means.
 */
function startInstant(date: string, start: number, tz: string, fold?: 'earlier' | 'later'): Date {
  const r = resolveLocal(date, start, tz)
  if (r.kind === 'ok') return r.utc
  if (r.kind === 'gap') throw new BookingError('invalid', 'dst_gap')
  if (!fold) throw new BookingError('invalid', 'dst_ambiguous')
  return fold === 'earlier' ? r.earlier : r.later
}

export type Contact = { name: string; phone: string | null; email: string | null }

export type CreateInput = {
  shop: Shop
  mode: 'online' | 'admin'
  kind: BookingKind
  date: string
  start: number
  guests: GuestRequest[]
  /** block time: staff + minutes */
  block?: { staffId: string; minutes: number }
  contact: Contact | null
  notes?: string | null
  photoUrl?: string | null
  /** what the client made in "design your nails" (first booking of the group) */
  design?: NailDesign | null
  lang: Lang
  createdBy?: string | null
  /** shop staff may book outside the roster (never on top of another booking) */
  force?: boolean
  /** which of the two times is meant on the night the clocks go back (CORE-03) */
  fold?: 'earlier' | 'later'
  /** each guest's answers to the shop's intake form, in guest order (CORE-05) */
  intake?: Array<{ formId: string; answers: unknown } | null | undefined>
  now?: Date
}

/** `review`: some answers wait for the shop to look at them, so the booking is a request, not yet confirmed (CORE-05). */
export type CreateResult = { code: string; token: string | null; bookings: Booking[]; review: boolean }

function itemsFor(catalog: Catalog, guest: GuestRequest, staffId: string): BookingItem[] {
  const byId = new Map(catalog.services.map(s => [s.id, s]))
  const out: BookingItem[] = []
  let sort = 0
  for (const id of guest.serviceIds) {
    const s = byId.get(id)!
    const own = catalog.skills.find(k => k.staffId === staffId && k.serviceId === id)?.durationMin
    out.push({ serviceId: s.id, kind: 'service', name: s.name, nameZh: s.nameZh, durationMin: own ?? s.durationMin, priceCents: s.priceCents, sort: sort++, serviceVersionId: s.versionId ?? null })
  }
  for (const id of guest.addonIds) {
    const s = byId.get(id)!
    out.push({ serviceId: s.id, kind: 'addon', name: s.name, nameZh: s.nameZh, durationMin: s.durationMin, priceCents: s.priceCents, sort: sort++, serviceVersionId: s.versionId ?? null })
  }
  return out
}

/** Check a guest request against the shop's menu. */
function validateGuests(catalog: Catalog, guests: GuestRequest[], shop: Shop, mode: 'online' | 'admin') {
  if (!guests.length || guests.length > Math.max(1, shop.maxGuests)) throw new BookingError('invalid', 'guests')
  const byId = new Map<string, Service>(catalog.services.map(s => [s.id, s]))
  for (const g of guests) {
    if (!g.serviceIds.length) throw new BookingError('invalid', 'no_service')
    if (new Set(g.serviceIds).size !== g.serviceIds.length || new Set(g.addonIds).size !== g.addonIds.length) throw new BookingError('invalid', 'dupe')
    // the shop's industries decide what can be booked at all, whoever is booking (CORE-02)
    for (const id of [...g.serviceIds, ...g.addonIds]) {
      const s = byId.get(id)
      if (catalog.disabled.has(id) || (s && unbookableReason(catalog.industries, s.industry))) throw new BookingError('capability_disabled')
    }
    const cats = new Set<string>()
    for (const id of g.serviceIds) {
      const s = byId.get(id)
      if (!s || s.kind !== 'service' || !s.active || (mode === 'online' && !s.online)) throw new BookingError('service_gone')
      cats.add(s.category)
    }
    for (const id of g.addonIds) {
      const a = byId.get(id)
      if (!a || a.kind !== 'addon' || !a.active || (mode === 'online' && !a.online)) throw new BookingError('service_gone')
      if (a.appliesTo.length && !a.appliesTo.some(c => cats.has(c))) throw new BookingError('invalid', 'addon')
    }
    if (g.staffId) {
      const st = catalog.staff.find(s => s.id === g.staffId)
      if (!st || !st.active || (mode === 'online' && !st.bookableOnline)) throw new BookingError('invalid', 'staff')
    }
    if (mode === 'online' && g.staffId === null && !shop.allowAnyStaff) throw new BookingError('invalid', 'any_staff')
  }
  const picked = guests.map(g => g.staffId).filter(Boolean)
  if (new Set(picked).size !== picked.length) throw new BookingError('invalid', 'same_staff')
}

/**
 * Each guest's answers to the shop's intake form for the industry of what they booked (CORE-05). Customers booking
 * online must answer an active form; shop staff booking for someone may leave it empty. Answers are checked
 * against the form version they were given, on the server.
 */
async function checkIntake(shop: Shop, catalog: Catalog, input: CreateInput): Promise<Array<{ formId: string; answers: Answers; requiresReview: boolean } | null>> {
  const forms = await activeForms(shop.id)
  return input.guests.map((g, i) => {
    const given = input.intake?.[i] ?? null
    const industry = catalog.services.find(s => s.id === g.serviceIds[0])?.industry
    const form = industry ? forms.get(industry) : undefined
    if (!form) {
      if (given) throw new BookingError('intake', 'form_changed')
      return null
    }
    if (!given) {
      if (input.mode === 'online') throw new BookingError('intake', 'required')
      return null
    }
    if (given.formId !== form.id) throw new BookingError('intake', 'form_changed')
    try {
      const r = checkAnswers(form.schema, given.answers, { addonIds: g.addonIds, photoOk: url => !!refPhotoFor(url, shop.id) })
      if (r.missingAddons.length) throw new BookingError('intake', `addon_missing:${r.missingAddons[0]}`)
      return { formId: form.id, answers: r.answers, requiresReview: r.requiresReview }
    } catch (e) {
      if (e instanceof FormError) throw new BookingError('intake', e.field ? `${e.code}:${e.field}` : e.code)
      throw e
    }
  })
}

async function uniqueCode(q: Tx, shopId: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const c = makeCode()
    const taken = await q`select 1 from app.bookings where shop_id = ${shopId} and code = ${c} limit 1`
    if (!taken.length) return c
  }
  throw new Error('could not allocate a booking code')
}

async function upsertCustomer(q: Tx, shop: Shop, c: Contact): Promise<{ id: string; blocked: boolean } | null> {
  const shopId = shop.id
  // read the number in the shop's own region; its key is unchanged for US numbers, so returning customers still match
  const parsed = parsePhone(c.phone, marketOf(shop).phoneRegion)
  const phone = parsed?.key ?? normPhone(c.phone)
  if (!phone && !c.email) return null
  if (phone) {
    const [row] = await q<{ id: string; blocked: boolean }[]>`
      insert into app.customers (shop_id, name, phone, phone_norm, phone_e164, email)
      values (${shopId}, ${c.name}, ${c.phone}, ${phone}, ${parsed?.e164 ?? null}, ${c.email})
      on conflict (shop_id, phone_norm) where phone_norm <> '' do update set
        name = excluded.name, phone = excluded.phone, phone_e164 = coalesce(excluded.phone_e164, app.customers.phone_e164),
        email = coalesce(excluded.email, app.customers.email)
      returning id, blocked
    `
    return row
  }
  const [found] = await q<{ id: string; blocked: boolean }[]>`
    select id, blocked from app.customers where shop_id = ${shopId} and lower(email) = lower(${c.email}) order by created_at limit 1
  `
  if (found) return found
  const [row] = await q<{ id: string; blocked: boolean }[]>`
    insert into app.customers (shop_id, name, email) values (${shopId}, ${c.name}, ${c.email}) returning id, blocked
  `
  return row
}

/**
 * Booking writes for one shop run one at a time. The database already refuses overlapping
 * bookings for one person; this also makes shop-wide rules (equipment, walk-in reserve) race-free.
 */
async function lockShop(tx: Tx, shopId: string) {
  await tx`select pg_advisory_xact_lock(7241, hashtext(${shopId}))`
}

const busyMinutesOf = (b: Booking) => Math.round((b.busyUntil.getTime() - b.startsAt.getTime()) / 60000)

function windowCheck(shop: Shop, date: string, start: number, now?: Date) {
  const n = nowInZone(shop.timezone, now)
  const dd = diffDays(date, n.date)
  if (dd < 0 || (dd === 0 && start < n.min)) throw new BookingError('too_soon')
  if (dd > shop.maxDays) throw new BookingError('too_far')
  if (dd * 1440 + start < n.min + shop.leadMinutes) throw new BookingError('too_soon')
}

export async function createBooking(input: CreateInput): Promise<CreateResult> {
  const { shop, mode } = input
  if (!marketOpen(shop)) throw new BookingError('market_unsupported')
  if (mode === 'online' && shop.status !== 'live') throw new BookingError('not_open')
  if (!Number.isInteger(input.start) || input.start < 0 || input.start >= 1440) throw new BookingError('invalid', 'start')
  const startsAt = startInstant(input.date, input.start, shop.timezone, input.fold)
  if (mode === 'online') windowCheck(shop, input.date, input.start, input.now)
  const catalog = await loadCatalog(shop.id, { forCustomers: mode === 'online' })
  if (input.kind !== 'block') validateGuests(catalog, input.guests, shop, mode)
  const intake = input.kind === 'block' ? [] : await checkIntake(shop, catalog, input)

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await sql.begin(async tx => {
        await lockShop(tx, shop.id)
        const [day] = await buildDays(tx, shop, catalog, [input.date], { forCustomers: mode === 'online', now: input.now })
        let assign: Assignment[]
        if (input.kind === 'block') {
          const b = input.block
          const st = day.staff.find(s => s.id === b?.staffId)
          if (!b || !st || b.minutes < 5 || b.minutes > 1440) throw new BookingError('invalid', 'block')
          const why = blocker({ ...day, buffer: 0 }, st, input.start, b.minutes, new Set(), { ignoreShift: true })
          if (why) throw new BookingError('taken', why)
          assign = [{ staffId: st.id, duration: b.minutes }]
        } else {
          const slot = findSlots(day, input.guests, { includeOffline: mode === 'admin' }).find(s => s.start === input.start)
          if (slot) assign = slot.assign
          else if (mode === 'admin') {
            assign = forcedAssign(day, input.guests, input.start, !!input.force)
            const visits = assign.map((a, i) => ({ start: input.start, end: input.start + a.duration + day.buffer, resourceIds: guestResources(day, input.guests[i]) }))
            if (!input.force && resourceConflict(day, visits)) throw new BookingError('taken', 'resource')
          } else throw new BookingError('taken')
        }

        // abuse limits for customer bookings
        let customer: { id: string; blocked: boolean } | null = null
        if (input.contact) customer = await upsertCustomer(tx, shop, input.contact)
        if (mode === 'online') {
          if (customer?.blocked) throw new BookingError('blocked')
          if (customer) {
            const [{ n }] = await tx<{ n: number }[]>`
              select count(distinct coalesce(group_id, id))::int as n from app.bookings
              where customer_id = ${customer.id} and status = 'confirmed' and starts_at > ${input.now ?? new Date()}
            `
            if (n >= 3) throw new BookingError('limit')
            if (shop.noshowLimit > 0) {
              const [{ ns }] = await tx<{ ns: number }[]>`select count(*)::int as ns from app.bookings where customer_id = ${customer.id} and status = 'no_show'`
              if (ns >= shop.noshowLimit) throw new BookingError('blocked', 'noshow')
            }
          }
        }

        const code = await uniqueCode(tx, shop.id)
        const groupId = assign.length > 1 ? crypto.randomUUID() : null
        const wantsToken = input.kind !== 'block' && !!(input.contact?.email || input.contact?.phone)
        const created: Booking[] = []
        for (let i = 0; i < assign.length; i++) {
          const a = assign[i]
          const guest = input.guests[i]
          const items = input.kind === 'block' ? [] : itemsFor(catalog, guest, a.staffId)
          const endsAt = new Date(startsAt.getTime() + a.duration * 60000)
          const busyUntil = new Date(endsAt.getTime() + (input.kind === 'block' ? 0 : shop.bufferMinutes) * 60000)
          const est = items.reduce((t, it) => t + (it.priceCents ?? 0), 0)
          const name = input.kind === 'block' ? null : input.contact?.name ? (assign.length > 1 && i > 0 ? `${input.contact.name} +${i}` : input.contact.name) : null
          const [row] = await tx<Booking[]>`
            insert into app.bookings (shop_id, staff_id, customer_id, group_id, code, kind, status, date, start_min, end_min,
              starts_at, ends_at, busy_until, duration_min, guest_name, guest_phone, guest_email, notes, photo_url, any_staff,
              est_price_cents, lang, manage_token, created_by, resource_ids, design)
            values (${shop.id}, ${a.staffId}, ${customer?.id ?? null}, ${groupId}, ${code}, ${input.kind}, 'confirmed', ${input.date},
              ${input.start}, ${input.start + a.duration}, ${startsAt}, ${endsAt}, ${busyUntil}, ${a.duration},
              ${name}, ${input.contact?.phone ?? null}, ${input.contact?.email ?? null}, ${input.notes ?? null},
              ${i === 0 ? input.photoUrl ?? null : null}, ${input.kind !== 'block' && guest?.staffId === null},
              ${input.kind === 'block' ? null : est}, ${input.lang}, ${wantsToken && i === 0 ? makeToken() : null}, ${input.createdBy ?? null},
              ${tx.array(input.kind === 'block' ? [] : guestResources(day, guest))}::uuid[], ${i === 0 && input.design ? tx.json(input.design) : null})
            returning *
          `
          for (const it of items) {
            await tx`
              insert into app.booking_items (booking_id, service_id, kind, name, name_zh, duration_min, price_cents, sort, service_version_id)
              values (${row.id}, ${it.serviceId}, ${it.kind}, ${it.name}, ${it.nameZh}, ${it.durationMin}, ${it.priceCents}, ${it.sort}, ${it.serviceVersionId ?? null})
            `
          }
          await tx`
            insert into app.booking_events (booking_id, actor, actor_user, action, detail)
            values (${row.id}, ${mode === 'online' ? 'customer' : 'shop'}, ${input.createdBy ?? null}, 'created',
                    ${sql.json({ kind: input.kind, forced: !!input.force })})
          `
          const answered = intake[i]
          if (answered) {
            await tx`
              insert into app.intake_responses (booking_id, shop_id, form_id, answers, requires_review, review_state)
              values (${row.id}, ${shop.id}, ${answered.formId}, ${tx.json(answered.answers as never)}, ${answered.requiresReview},
                      ${answered.requiresReview ? 'pending' : 'not_needed'})
            `
          }
          created.push({ ...row, items })
        }
        return { code, token: created[0].manageToken, bookings: created, review: intake.some(x => x?.requiresReview) }
      })
    } catch (e) {
      if (isOverlapViolation(e)) {
        // someone booked the same time a moment ago: try again with fresh data (any-staff may get someone else)
        if (attempt < 2 && input.kind !== 'block' && input.guests.some(g => g.staffId === null)) continue
        throw new BookingError('taken')
      }
      throw e
    }
  }
  throw new BookingError('taken')
}

/** Admin booking outside the normal rules: requested staff, overlap still refused. */
function forcedAssign(day: Awaited<ReturnType<typeof buildDays>>[number], guests: GuestRequest[], start: number, force: boolean): Assignment[] {
  const used = new Set<string>()
  const out: Assignment[] = []
  for (const g of guests) {
    const options = (g.staffId ? day.staff.filter(s => s.id === g.staffId) : day.staff).filter(s => !used.has(s.id))
    let picked: Assignment | null = null
    let reason: string = 'taken'
    for (const st of options) {
      if (!qualifies(st, g) && !g.staffId) continue
      const d = guestDuration(day, st, g)
      if (!d) continue
      const why = blocker(day, st, start, d, new Set(), { ignoreShift: force })
      if (!why) { picked = { staffId: st.id, duration: d }; break }
      reason = why
    }
    if (!picked) throw new BookingError(reason === 'booked' || reason === 'taken' ? 'taken' : 'outside_shift', reason)
    used.add(picked.staffId)
    out.push(picked)
  }
  return out
}

// ---------------------------------------------------------------- reading

export async function bookingsWithItems(rows: Booking[]): Promise<Booking[]> {
  if (!rows.length) return rows
  const items = await sql<(BookingItem & { bookingId: string })[]>`
    select * from app.booking_items where booking_id in ${sql(rows.map(r => r.id))} order by sort
  `
  return rows.map(r => ({ ...r, items: items.filter(i => i.bookingId === r.id) }))
}

export async function dayBookings(shopId: string, date: string, staffId?: string): Promise<Booking[]> {
  const rows = await sql<Booking[]>`
    select b.*, exists (select 1 from app.intake_responses r where r.booking_id = b.id and r.review_state = 'pending') as review_pending
    from app.bookings b where b.shop_id = ${shopId} and b.date = ${date}
      ${staffId ? sql`and b.staff_id = ${staffId}` : sql``}
    order by b.start_min
  `
  return bookingsWithItems(rows)
}

export async function getBooking(shopId: string, id: string): Promise<Booking | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const rows = await sql<Booking[]>`select * from app.bookings where id = ${id} and shop_id = ${shopId}`
  return rows[0] ? (await bookingsWithItems(rows))[0] : null
}

/** The booking a manage link points at, with the rest of its group. */
export async function byToken(token: string): Promise<{ primary: Booking; group: Booking[]; shop: Shop } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const [primary] = await sql<Booking[]>`select * from app.bookings where manage_token = ${token}`
  if (!primary) return null
  const group = primary.groupId
    ? await sql<Booking[]>`select * from app.bookings where group_id = ${primary.groupId} and shop_id = ${primary.shopId} order by created_at, id`
    : [primary]
  const [shop] = await sql<Shop[]>`select * from app.shops where id = ${primary.shopId}`
  return { primary, group: await bookingsWithItems(group), shop }
}

export async function lookupByCode(shopId: string, code: string, phone: string): Promise<string | null> {
  const rows = await sql<{ manageToken: string | null; guestPhone: string | null; marketKey: string }[]>`
    select b.manage_token, b.guest_phone, s.market_key from app.bookings b join app.shops s on s.id = b.shop_id
    where b.shop_id = ${shopId} and b.code = ${code.toUpperCase()} and b.manage_token is not null
  `
  const region = marketOf({ marketKey: rows[0]?.marketKey }).phoneRegion
  const p = phoneKey(phone, region)
  const hit = rows.find(r => phoneKey(r.guestPhone, region) === p && p.length >= 7)
  return hit?.manageToken ?? null
}

export async function bookingEvents(bookingId: string) {
  return sql<{ at: Date; actor: string; action: string; detail: Record<string, unknown> }[]>`
    select at, actor, action, detail from app.booking_events where booking_id = ${bookingId} order by at
  `
}

// ---------------------------------------------------------------- customer changes

export function canCustomerChange(shop: Shop, b: Booking, now = new Date()): boolean {
  return b.status === 'confirmed' && b.startsAt.getTime() - now.getTime() >= shop.cancelCutoffMinutes * 60000
}

function guestsFromGroup(group: Booking[], keepStaff: boolean, catalog: Catalog): GuestRequest[] {
  return group.map(b => {
    const items = b.items ?? []
    if (items.some(i => !i.serviceId || !catalog.services.some(s => s.id === i.serviceId))) throw new BookingError('service_gone')
    return {
      serviceIds: items.filter(i => i.kind === 'service').map(i => i.serviceId!),
      addonIds: items.filter(i => i.kind === 'addon').map(i => i.serviceId!),
      staffId: keepStaff && !b.anyStaff ? b.staffId : null,
    }
  })
}

export async function rescheduleByToken(token: string, date: string, start: number, staffChoice?: string | null, now?: Date) {
  const found = await byToken(token)
  if (!found) throw new BookingError('not_found')
  const { shop, group } = found
  const active = group.filter(b => b.status === 'confirmed')
  if (!active.length) throw new BookingError('not_allowed')
  if (active.some(b => !canCustomerChange(shop, b, now))) throw new BookingError('cutoff')
  if (shop.status !== 'live') throw new BookingError('not_open')
  windowCheck(shop, date, start, now)
  const catalog = await loadCatalog(shop.id, { forCustomers: true })
  const guests = guestsFromGroup(active, true, catalog)
  if (active.length === 1 && staffChoice !== undefined) guests[0].staffId = staffChoice
  return moveGroup(shop, catalog, active, guests, date, start, { mode: 'online', actor: 'customer', now })
}

async function moveGroup(shop: Shop, catalog: Catalog, active: Booking[], guests: GuestRequest[], date: string, start: number,
  o: { mode: 'online' | 'admin'; actor: 'customer' | 'shop'; userId?: string | null; force?: boolean; now?: Date }) {
  const ignore = active.map(b => b.id)
  try {
    return await sql.begin(async tx => {
      await lockShop(tx, shop.id)
      const [day] = await buildDays(tx, shop, catalog, [date], { forCustomers: o.mode === 'online', now: o.now })
      const slot = findSlots(day, guests, { ignore, includeOffline: o.mode === 'admin' }).find(s => s.start === start)
      let assign: Assignment[]
      if (slot) assign = slot.assign
      else if (o.mode === 'admin') {
        const dayIgnoring = { ...day, staff: day.staff.map(s => ({ ...s, busy: s.busy.filter(b => !ignore.includes(b[2])) })) }
        assign = forcedAssign(dayIgnoring, guests, start, !!o.force)
        const visits = assign.map((a, i) => ({ start, end: start + a.duration + day.buffer, resourceIds: guestResources(day, guests[i]) }))
        if (!o.force && resourceConflict(day, visits, new Set(ignore))) throw new BookingError('taken', 'resource')
      } else throw new BookingError('taken')
      const startsAt = startInstant(date, start, shop.timezone)
      for (let i = 0; i < active.length; i++) {
        const b = active[i], a = assign[i]
        const items = itemsFor(catalog, guests[i], a.staffId)
        const endsAt = new Date(startsAt.getTime() + a.duration * 60000)
        const busyUntil = new Date(endsAt.getTime() + shop.bufferMinutes * 60000)
        await tx`
          update app.bookings set staff_id = ${a.staffId}, date = ${date}, start_min = ${start}, end_min = ${start + a.duration},
            starts_at = ${startsAt}, ends_at = ${endsAt}, busy_until = ${busyUntil}, duration_min = ${a.duration},
            reminder_sent_at = null, client_confirmed_at = null, resource_ids = ${tx.array(guestResources(day, guests[i]))}::uuid[]
          where id = ${b.id}
        `
        // durations can differ per staff member: refresh item times
        for (const it of items) {
          await tx`update app.booking_items set duration_min = ${it.durationMin} where booking_id = ${b.id} and service_id = ${it.serviceId}`
        }
        await tx`
          insert into app.booking_events (booking_id, actor, actor_user, action, detail)
          values (${b.id}, ${o.actor}, ${o.userId ?? null}, 'rescheduled',
            ${sql.json({ from: { date: b.date, start: b.startMin, staff: b.staffId }, to: { date, start, staff: a.staffId } })})
        `
      }
      const rows = await tx<Booking[]>`select * from app.bookings where id in ${tx(active.map(b => b.id))} order by created_at, id`
      return bookingsWithItems(rows)
    })
  } catch (e) {
    if (isOverlapViolation(e)) throw new BookingError('taken')
    throw e
  }
}

export async function cancelByToken(token: string, reason: string | null, now?: Date) {
  const found = await byToken(token)
  if (!found) throw new BookingError('not_found')
  const { shop, group } = found
  const active = group.filter(b => b.status === 'confirmed')
  if (!active.length) throw new BookingError('not_allowed')
  if (active.some(b => !canCustomerChange(shop, b, now))) throw new BookingError('cutoff')
  await setStatusMany(active.map(b => b.id), 'cancelled', 'customer', null, reason)
  return { shop, group: active }
}

async function setStatusMany(ids: string[], status: BookingStatus, actor: 'customer' | 'shop', userId: string | null, reason: string | null, before?: (tx: Tx) => Promise<void>) {
  await sql.begin(async tx => {
    if (before) await before(tx)
    for (const id of ids) {
      if (status === 'cancelled') {
        await tx`update app.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = ${actor}, cancel_reason = ${reason} where id = ${id}`
      } else if (status === 'completed') {
        // finishing time only counts as a measurement if someone tapped "start" earlier today
        await tx`update app.bookings set status = 'completed', cancelled_at = null, cancelled_by = null, cancel_reason = null,
          actual_end = case when actual_start is not null and actual_end is null and now() - actual_start < interval '8 hours' then now() else actual_end end
          where id = ${id}`
      } else {
        await tx`update app.bookings set status = ${status}, cancelled_at = null, cancelled_by = null, cancel_reason = null,
          actual_end = case when ${status} = 'confirmed' then null else actual_end end where id = ${id}`
      }
      await tx`
        insert into app.booking_events (booking_id, actor, actor_user, action, detail)
        values (${id}, ${actor}, ${userId}, ${'status:' + status}, ${sql.json(reason ? { reason } : {})})
      `
    }
  })
}

// ---------------------------------------------------------------- shop-side changes

export async function shopSetStatus(shop: Shop, bookingId: string, status: BookingStatus, userId: string, reason: string | null = null) {
  const b = await getBooking(shop.id, bookingId)
  if (!b) throw new BookingError('not_found')
  if (status === 'confirmed' || status === 'completed') {
    // re-activating must not collide with something booked meanwhile (people: database constraint; equipment: checked here)
    const reviving = b.status === 'cancelled' || b.status === 'no_show'
    const catalog = reviving && b.resourceIds?.length ? await loadCatalog(shop.id) : null
    try {
      await setStatusMany([b.id], status, 'shop', userId, null, async tx => {
        await lockShop(tx, shop.id)
        if (!catalog) return
        const [day] = await buildDays(tx, shop, catalog, [b.date], { forCustomers: false })
        if (resourceConflict(day, [{ start: b.startMin, end: b.startMin + busyMinutesOf(b), resourceIds: b.resourceIds }], new Set([b.id]))) {
          throw new BookingError('taken', 'resource')
        }
      })
    } catch (e) {
      if (isOverlapViolation(e)) throw new BookingError('taken')
      throw e
    }
  } else {
    await setStatusMany([b.id], status, 'shop', userId, reason)
  }
  return (await getBooking(shop.id, bookingId))!
}

export async function shopMove(shop: Shop, bookingId: string, date: string, start: number, staffId: string, userId: string, force: boolean) {
  const b = await getBooking(shop.id, bookingId)
  if (!b) throw new BookingError('not_found')
  if (b.status !== 'confirmed') throw new BookingError('not_allowed')
  if (b.kind === 'block') {
    const catalog = await loadCatalog(shop.id)
    try {
      return await sql.begin(async tx => {
        await lockShop(tx, shop.id)
        const [day] = await buildDays(tx, shop, catalog, [date], { forCustomers: false })
        const st = day.staff.find(s => s.id === staffId)
        if (!st) throw new BookingError('invalid', 'staff')
        const why = blocker({ ...day, buffer: 0 }, st, start, b.durationMin, new Set([b.id]), { ignoreShift: true })
        if (why) throw new BookingError('taken', why)
        const startsAt = startInstant(date, start, shop.timezone)
        const endsAt = new Date(startsAt.getTime() + b.durationMin * 60000)
        await tx`update app.bookings set staff_id = ${staffId}, date = ${date}, start_min = ${start}, end_min = ${start + b.durationMin},
          starts_at = ${startsAt}, ends_at = ${endsAt}, busy_until = ${endsAt} where id = ${b.id}`
        return [(await getBookingTx(tx, b.id))!]
      })
    } catch (e) {
      if (isOverlapViolation(e)) throw new BookingError('taken')
      throw e
    }
  }
  const catalog = await loadCatalog(shop.id)
  const guests = guestsFromGroup([b], false, catalog)
  guests[0].staffId = staffId
  return moveGroup(shop, catalog, [b], guests, date, start, { mode: 'admin', actor: 'shop', userId, force })
}

async function getBookingTx(tx: Tx, id: string) {
  const rows = await tx<Booking[]>`select * from app.bookings where id = ${id}`
  return rows[0] ?? null
}

/** Change what's being done (e.g. add nail art mid-visit). Re-checks the time still fits. */
export async function shopSetItems(shop: Shop, bookingId: string, serviceIds: string[], addonIds: string[], userId: string, force: boolean) {
  const b = await getBooking(shop.id, bookingId)
  if (!b) throw new BookingError('not_found')
  if (b.kind === 'block') throw new BookingError('not_allowed')
  const catalog = await loadCatalog(shop.id)
  const guest: GuestRequest = { serviceIds, addonIds, staffId: b.staffId }
  validateGuests(catalog, [guest], shop, 'admin')
  try {
    await sql.begin(async tx => {
      await lockShop(tx, shop.id)
      const [day] = await buildDays(tx, shop, catalog, [b.date], { forCustomers: false })
      const st = day.staff.find(s => s.id === b.staffId)
      if (!st) throw new BookingError('invalid', 'staff')
      const dur = guestDuration(day, st, guest)
      if (!dur) throw new BookingError('invalid')
      const why = blocker(day, st, b.startMin, dur, new Set([b.id]), { ignoreShift: force })
      if (why) throw new BookingError(why === 'booked' ? 'taken' : 'outside_shift', why)
      const resourceIds = guestResources(day, guest)
      if (!force && resourceConflict(day, [{ start: b.startMin, end: b.startMin + dur + day.buffer, resourceIds }], new Set([b.id]))) {
        throw new BookingError('taken', 'resource')
      }
      const items = itemsFor(catalog, guest, b.staffId)
      const endsAt = new Date(b.startsAt.getTime() + dur * 60000)
      const busyUntil = new Date(endsAt.getTime() + shop.bufferMinutes * 60000)
      await tx`update app.bookings set end_min = ${b.startMin + dur}, ends_at = ${endsAt}, busy_until = ${busyUntil}, duration_min = ${dur},
        est_price_cents = ${items.reduce((t, i) => t + (i.priceCents ?? 0), 0)}, resource_ids = ${tx.array(resourceIds)}::uuid[] where id = ${b.id}`
      await tx`delete from app.booking_items where booking_id = ${b.id}`
      for (const it of items) {
        await tx`insert into app.booking_items (booking_id, service_id, kind, name, name_zh, duration_min, price_cents, sort, service_version_id)
          values (${b.id}, ${it.serviceId}, ${it.kind}, ${it.name}, ${it.nameZh}, ${it.durationMin}, ${it.priceCents}, ${it.sort}, ${it.serviceVersionId ?? null})`
      }
      await tx`insert into app.booking_events (booking_id, actor, actor_user, action, detail)
        values (${b.id}, 'shop', ${userId}, 'items', ${sql.json({ duration: dur })})`
    })
  } catch (e) {
    if (isOverlapViolation(e)) throw new BookingError('taken')
    throw e
  }
  return (await getBooking(shop.id, bookingId))!
}

/** Staff tapped "start": the measured duration begins now. */
export async function shopMarkStarted(shop: Shop, bookingId: string, userId: string) {
  const rows = await sql<Booking[]>`
    update app.bookings set actual_start = coalesce(actual_start, now())
    where id = ${bookingId} and shop_id = ${shop.id} and status = 'confirmed' and kind <> 'block'
    returning *
  `
  if (!rows[0]) throw new BookingError('not_allowed')
  await sql`insert into app.booking_events (booking_id, actor, actor_user, action, detail) values (${bookingId}, 'shop', ${userId}, 'started', '{}'::jsonb)`
  return rows[0]
}

/** Client tapped "I'll be there". */
export async function confirmByToken(token: string) {
  const found = await byToken(token)
  if (!found) throw new BookingError('not_found')
  const ids = found.group.filter(b => b.status === 'confirmed').map(b => b.id)
  if (!ids.length) throw new BookingError('not_allowed')
  await sql`update app.bookings set client_confirmed_at = coalesce(client_confirmed_at, now()) where id in ${sql(ids)}`
  for (const id of ids) await sql`insert into app.booking_events (booking_id, actor, action, detail) values (${id}, 'customer', 'client_confirmed', '{}'::jsonb)`
  return found
}

/** One rating per visit, from the client's own booking page, once the visit is over. */
export async function rateByToken(token: string, rating: number, note: string | null) {
  const found = await byToken(token)
  if (!found) throw new BookingError('not_found')
  const first = found.group[0]
  const over = first.status === 'completed' || (first.status === 'confirmed' && first.endsAt.getTime() < Date.now())
  if (!over || first.rating != null) throw new BookingError('not_allowed')
  await sql`update app.bookings set rating = ${rating}, rating_note = ${note}, rated_at = now() where id = ${first.id} and rating is null`
  return found
}

export type StaffRating = { staffId: string; count: number; avg: number }
export async function staffRatings(shopId: string): Promise<StaffRating[]> {
  return sql<StaffRating[]>`
    select staff_id, count(*)::int as count, round(avg(rating)::numeric, 1)::float as avg
    from app.bookings where shop_id = ${shopId} and rating is not null group by staff_id
  `
}

export async function shopUpdateDetails(shop: Shop, bookingId: string, d: { guestName?: string | null; guestPhone?: string | null; guestEmail?: string | null; notes?: string | null; internalNote?: string | null }) {
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(d)) if (v !== undefined) patch[k] = v
  if (!Object.keys(patch).length) return
  await sql`update app.bookings set ${sql(patch)} where id = ${bookingId} and shop_id = ${shop.id}`
}

// ---------------------------------------------------------------- calendar file

function icsEscape(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}
const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function bookingIcs(shop: Shop, group: Booking[], lang: Lang, manageUrl: string): string {
  const start = new Date(Math.min(...group.map(b => b.startsAt.getTime())))
  const end = new Date(Math.max(...group.map(b => b.endsAt.getTime())))
  const what = group.flatMap(b => (b.items ?? []).map(i => (lang === 'zh' && i.nameZh) || i.name)).join(', ')
  const title = `${(lang === 'zh' && shop.nameZh) || shop.name}${what ? ' · ' + what : ''}`
  const loc = [shop.address, shop.city].filter(Boolean).join(', ')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tempo//Booking//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${group[0].id}@tempo`,
    `DTSTAMP:${icsTime(new Date())}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    loc ? `LOCATION:${icsEscape(loc)}` : '',
    `DESCRIPTION:${icsEscape((lang === 'zh' ? '预约编号 ' : 'Booking code ') + group[0].code + '\n' + manageUrl)}`,
    `URL:${manageUrl}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
}
