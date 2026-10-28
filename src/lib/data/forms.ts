import 'server-only'
import { sql, type Q } from '../db'
import { parseSchema, FormError, type FormSchema, type Answers } from '../forms'
import { isIndustryKey, type IndustryKey } from '../industries/registry'
import { BookingError, shopSetStatus } from '../bookings'
import type { Shop } from '../types'

// Intake forms and answers (CORE-05). Every save is a new immutable version; the newest version of a shop's form
// for an industry is the one in use, if it's switched on.

export type IntakeForm = { id: string; shopId: string; industry: IndustryKey; version: number; schema: FormSchema; active: boolean; createdAt: Date }
export type IntakeResponse = { bookingId: string; formId: string; answers: Answers; requiresReview: boolean; reviewState: 'not_needed' | 'pending' | 'approved' | 'declined'; reviewedAt: Date | null }

/** The newest version of each of the shop's forms, whether on or off. */
export async function latestForms(shopId: string, q: Q = sql): Promise<IntakeForm[]> {
  return q<IntakeForm[]>`
    select distinct on (industry) id, shop_id, industry, version, schema, active, created_at from app.intake_forms
    where shop_id = ${shopId} order by industry, version desc
  `
}

/** The forms customers answer right now, by industry. */
export async function activeForms(shopId: string, q: Q = sql): Promise<Map<IndustryKey, IntakeForm>> {
  return new Map((await latestForms(shopId, q)).filter(f => f.active).map(f => [f.industry, f]))
}

export async function formById(shopId: string, id: string): Promise<IntakeForm | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [f] = await sql<IntakeForm[]>`select id, shop_id, industry, version, schema, active, created_at from app.intake_forms where id = ${id} and shop_id = ${shopId}`
  return f ?? null
}

/**
 * Save a new version of the shop's form for an industry. The schema is checked against the whitelist, and every
 * add-on it links must be one of this shop's own add-ons.
 */
export async function saveForm(shopId: string, industry: string, raw: unknown, active: boolean, userId: string | null): Promise<IntakeForm> {
  if (!isIndustryKey(industry)) throw new FormError('schema', 'industry')
  const schema = parseSchema(raw)
  const linked = schema.fields.flatMap(f => (f.options ?? []).map(o => o.addonId).filter((x): x is string => !!x))
  if (linked.length) {
    const own = new Set((await sql<{ id: string }[]>`select id from app.services where shop_id = ${shopId} and kind = 'addon' and id in ${sql(linked)}`).map(r => r.id))
    if (!linked.every(id => own.has(id))) throw new FormError('schema', 'addonId')
  }
  const [row] = await sql<IntakeForm[]>`
    insert into app.intake_forms (shop_id, industry, version, schema, active, created_by)
    select ${shopId}, ${industry}, coalesce(max(version), 0) + 1, ${sql.json(schema as never)}, ${active}, ${userId}
    from app.intake_forms where shop_id = ${shopId} and industry = ${industry}
    returning id, shop_id, industry, version, schema, active, created_at
  `
  return row
}

export async function intakeFor(shopId: string, bookingIds: string[]): Promise<Map<string, IntakeResponse>> {
  if (!bookingIds.length) return new Map()
  const rows = await sql<IntakeResponse[]>`
    select booking_id, form_id, answers, requires_review, review_state, reviewed_at from app.intake_responses
    where shop_id = ${shopId} and booking_id in ${sql(bookingIds)}
  `
  return new Map(rows.map(r => [r.bookingId, r]))
}

/** Bookings whose answers the shop still has to look at, soonest first. */
export async function pendingReviews(shopId: string) {
  return sql<{ bookingId: string; date: string; startMin: number; guestName: string | null; staffId: string }[]>`
    select b.id as booking_id, b.date, b.start_min, b.guest_name, b.staff_id from app.intake_responses r
    join app.bookings b on b.id = r.booking_id and b.shop_id = r.shop_id
    where r.shop_id = ${shopId} and r.review_state = 'pending' and b.status = 'confirmed'
    order by b.starts_at
  `
}

/**
 * The shop looked at the answers. Approve: the booking now counts as confirmed for the customer. Decline: the
 * booking is cancelled by the shop with the reason given.
 */
export async function reviewIntake(shop: Shop, bookingId: string, decision: 'approve' | 'decline', userId: string, reason: string | null = null) {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) throw new BookingError('not_found')
  const [r] = await sql<{ reviewState: string }[]>`select review_state from app.intake_responses where booking_id = ${bookingId} and shop_id = ${shop.id}`
  if (!r) throw new BookingError('not_found')
  if (r.reviewState !== 'pending') throw new BookingError('not_allowed')
  if (decision === 'decline') await shopSetStatus(shop, bookingId, 'cancelled', userId, reason)
  const done = await sql`
    update app.intake_responses set review_state = ${decision === 'approve' ? 'approved' : 'declined'}, reviewed_by = ${userId}, reviewed_at = now()
    where booking_id = ${bookingId} and shop_id = ${shop.id} and review_state = 'pending' returning booking_id
  `
  if (!done.length) throw new BookingError('not_allowed')
}
