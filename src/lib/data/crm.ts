import 'server-only'
import { sql } from '@/lib/db'
import { listCustomers as baseList, type CustomerRow as BaseRow } from './insights'
import { phoneKey, parsePhone } from '@/lib/phone'
import { marketOf } from '@/lib/markets'
import { addDays, diffDays } from '@/lib/tz'
import { env } from '@/lib/env'
import type { Shop } from '@/lib/types'

// The shop's client book (CRM): who they are beyond their bookings, who to call back, and who to write to.
// Marketing email goes only to clients who said yes, and every email carries a one-click unsubscribe.

export type CustomerRow = BaseRow & { tags: string[]; birthday: string | null; source: string; marketingConsent: boolean; marketingConsentAt: Date | null; lastContactedAt: Date | null }

import { SEGMENTS, isSegment, type Segment, type CampaignSegment } from '@/lib/segments'
export { SEGMENTS, isSegment, type Segment, type CampaignSegment }

const birthdayWithin = (birthday: string | null, today: string, days: number) => {
  if (!birthday) return false
  const [, m, d] = birthday.split('-')
  const y = Number(today.slice(0, 4))
  for (const yy of [y, y + 1]) {
    const next = `${yy}-${m}-${d}`
    const dd = diffDays(next, today)
    if (dd >= 0 && dd <= days) return true
  }
  return false
}

/** The one word a shop owner would use for this client. Order matters: the most useful label wins. */
export function segmentOf(c: CustomerRow, today: string, rebookDays: number): Exclude<Segment, 'all' | 'upcoming' | 'birthday' | 'consented'> {
  if (c.noShows >= 1 && c.visits <= 2) return 'no_show'
  if (c.visits >= 10 || (c.visits >= 5 && c.spentCents >= 50000)) return 'vip'
  if (c.visits >= 1 && c.lastVisit && !c.nextVisit && diffDays(today, c.lastVisit) > Math.max(60, rebookDays * 3)) return 'lapsed'
  if (c.visits >= 3) return 'regular'
  return 'new'
}

export function inSegment(c: CustomerRow, segment: Segment, today: string, rebookDays: number): boolean {
  switch (segment) {
    case 'all': return true
    case 'upcoming': return !!c.nextVisit
    case 'birthday': return birthdayWithin(c.birthday, today, 30)
    case 'consented': return c.marketingConsent && !!c.email
    default: return segmentOf(c, today, rebookDays) === segment
  }
}

export type ListFilter = { segment?: Segment; tag?: string }

export async function listCustomers(shopId: string, today: string, q: string, sort: 'recent' | 'visits' | 'name' = 'recent', limit = 300, filter: ListFilter = {}): Promise<CustomerRow[]> {
  const [rows, [shop]] = await Promise.all([
    baseList(shopId, today, q, sort, filter.segment && filter.segment !== 'all' ? 5000 : limit) as Promise<CustomerRow[]>,
    sql<{ rebookDays: number }[]>`select rebook_days from app.shops where id = ${shopId}`,
  ])
  const rebook = shop?.rebookDays ?? 21
  return rows
    .filter(c => (!filter.tag || c.tags.includes(filter.tag)) && (!filter.segment || inSegment(c, filter.segment, today, rebook)))
    .slice(0, limit)
}

export async function customerTags(shopId: string): Promise<Array<{ tag: string; n: number }>> {
  return sql<{ tag: string; n: number }[]>`
    select t as tag, count(*)::int as n from app.customers c, unnest(c.tags) t where c.shop_id = ${shopId}
    group by t order by n desc, t
  `
}

const cleanTag = (t: string) => t.trim().replace(/\s+/g, ' ').slice(0, 24)

/** Replace a client's tags; duplicates and blanks dropped, at most 20. */
export async function setTags(shopId: string, customerId: string, tags: string[]): Promise<boolean> {
  const clean = Array.from(new Set(tags.map(cleanTag).filter(Boolean)))
  if (clean.length > 20) throw new Error('too many tags')
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return false
  const rows = await sql`update app.customers set tags = ${sql.array(clean)} where id = ${customerId} and shop_id = ${shopId} returning id`
  return rows.length > 0
}

export type CrmPatch = { birthday?: string | null; source?: 'online' | 'walkin' | 'phone' | 'import' | 'manual'; marketingConsent?: boolean }

export async function updateCrm(shopId: string, customerId: string, patch: CrmPatch): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return false
  if (patch.birthday !== undefined && patch.birthday !== null && !/^\d{4}-\d{2}-\d{2}$/.test(patch.birthday)) throw new Error('bad birthday')
  const rows = await sql`
    update app.customers set
      birthday = ${patch.birthday === undefined ? sql`birthday` : patch.birthday},
      source = ${patch.source === undefined ? sql`source` : patch.source},
      marketing_consent = ${patch.marketingConsent === undefined ? sql`marketing_consent` : patch.marketingConsent},
      marketing_consent_at = ${patch.marketingConsent === undefined ? sql`marketing_consent_at` : patch.marketingConsent ? sql`coalesce(marketing_consent_at, now())` : null}
    where id = ${customerId} and shop_id = ${shopId} returning id
  `
  return rows.length > 0
}

export type NoteKind = 'note' | 'call' | 'message' | 'visit'

export async function addNote(shopId: string, customerId: string, userId: string | null, kind: NoteKind, body: string) {
  const text = body.trim().slice(0, 2000)
  if (!text) throw new Error('empty note')
  const [row] = await sql<{ id: string }[]>`
    insert into app.customer_notes (shop_id, customer_id, author_user, kind, body) values (${shopId}, ${customerId}, ${userId}, ${kind}, ${text}) returning id
  `
  if (kind !== 'note') await sql`update app.customers set last_contacted_at = now() where id = ${customerId} and shop_id = ${shopId}`
  return row.id
}

export async function deleteNote(shopId: string, noteId: string): Promise<boolean> {
  const rows = await sql`delete from app.customer_notes where id = ${noteId} and shop_id = ${shopId} returning id`
  return rows.length > 0
}

export type TimelineEntry =
  | { type: 'booking'; at: Date; id: string; date: string; startMin: number; status: string; kind: string; staffId: string; items: Array<{ name: string; nameZh: string | null; kind: string }>; priceCents: number | null; notes: string | null; cancelReason: string | null }
  | { type: NoteKind; at: Date; id: string; body: string }
  | { type: 'follow_up'; at: Date; id: string; reason: string; status: string; note: string | null; due: string }

/** Everything that happened with this client, newest first: bookings, notes, calls and follow-ups together. */
export async function timeline(shopId: string, customerId: string, limit = 200): Promise<TimelineEntry[]> {
  const [bookings, notes, follow] = await Promise.all([
    sql<{ id: string; at: Date; date: string; startMin: number; status: string; kind: string; staffId: string; items: Array<{ name: string; nameZh: string | null; kind: string }>; priceCents: number | null; notes: string | null; cancelReason: string | null }[]>`
      select b.id, b.starts_at as at, b.date::text, b.start_min, b.status, b.kind, b.staff_id, b.est_price_cents as price_cents, b.notes, b.cancel_reason,
        coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'nameZh', i.name_zh, 'kind', i.kind) order by i.sort) from app.booking_items i where i.booking_id = b.id), '[]'::jsonb) as items
      from app.bookings b where b.shop_id = ${shopId} and b.customer_id = ${customerId} order by b.starts_at desc limit ${limit}`,
    sql<{ id: string; at: Date; kind: NoteKind; body: string }[]>`
      select id, at, kind, body from app.customer_notes where shop_id = ${shopId} and customer_id = ${customerId} order by at desc limit ${limit}`,
    sql<{ id: string; at: Date; reason: string; status: string; note: string | null; due: string }[]>`
      select id, coalesce(done_at, created_at) as at, reason, status, note, due::text from app.follow_ups where shop_id = ${shopId} and customer_id = ${customerId} and status <> 'open' order by at desc limit ${limit}`,
  ])
  const all: TimelineEntry[] = [
    ...bookings.map(b => ({ type: 'booking' as const, ...b })),
    ...notes.map(n => ({ type: n.kind, at: n.at, id: n.id, body: n.body })),
    ...follow.map(f => ({ type: 'follow_up' as const, ...f })),
  ]
  return all.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit)
}

export type Suggestion = { customerId: string; name: string; phone: string | null; email: string | null; reason: 'rebook' | 'lapsed' | 'birthday'; lastVisit: string | null; birthday: string | null; dueSince: number }

/**
 * Who the shop should reach out to today. Computed, not stored: rebooks that fell due (last visit +
 * rebook days, no upcoming booking), lapsed clients, birthdays in the next two weeks. Clients with an open
 * follow-up, an upcoming booking or a contact in the last week are left alone.
 */
export async function suggestFollowUps(shopId: string, today: string): Promise<Suggestion[]> {
  const [shop] = await sql<{ rebookDays: number }[]>`select rebook_days from app.shops where id = ${shopId}`
  const rebook = shop?.rebookDays ?? 21
  const rows = await sql<{ id: string; name: string; phone: string | null; email: string | null; birthday: string | null; blocked: boolean; lastVisit: string | null; visits: number; hasNext: boolean; lastContactedAt: Date | null; open: boolean }[]>`
    select c.id, c.name, c.phone, c.email, c.birthday::text, c.blocked, c.last_contacted_at,
      max(b.date) filter (where b.status = 'completed')::text as last_visit,
      count(*) filter (where b.status = 'completed')::int as visits,
      bool_or(b.status = 'confirmed' and b.date >= ${today}) as has_next,
      exists (select 1 from app.follow_ups f where f.customer_id = c.id and f.status = 'open') as open
    from app.customers c left join app.bookings b on b.customer_id = c.id
    where c.shop_id = ${shopId} group by c.id
  `
  const out: Suggestion[] = []
  for (const c of rows) {
    if (c.blocked || c.hasNext || c.open) continue
    // a call or message in the last week counts as handled
    if (c.lastContactedAt && diffDays(today, c.lastContactedAt.toISOString().slice(0, 10)) < 7) continue
    const since = c.lastVisit ? diffDays(today, c.lastVisit) : null
    let reason: Suggestion['reason'] | null = null
    let dueSince = 0
    if (since != null && c.visits >= 1 && since > Math.max(60, rebook * 3)) { reason = 'lapsed'; dueSince = since - Math.max(60, rebook * 3) }
    else if (since != null && c.visits >= 1 && rebook > 0 && since >= rebook) { reason = 'rebook'; dueSince = since - rebook }
    else if (birthdayWithin(c.birthday, today, 14)) { reason = 'birthday'; dueSince = 0 }
    if (!reason) continue
    out.push({ customerId: c.id, name: c.name, phone: c.phone, email: c.email, reason, lastVisit: c.lastVisit, birthday: c.birthday, dueSince })
  }
  const rank = { rebook: 0, lapsed: 1, birthday: 2 }
  return out.sort((a, b) => rank[a.reason] - rank[b.reason] || b.dueSince - a.dueSince)
}

export type FollowUp = { id: string; customerId: string; name: string; phone: string | null; email: string | null; due: string; reason: string; note: string | null; status: string }

export async function scheduleFollowUp(shopId: string, customerId: string, userId: string | null, f: { due: string; reason: 'rebook' | 'birthday' | 'lapsed' | 'custom'; note: string | null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.due)) throw new Error('bad date')
  const [row] = await sql<{ id: string }[]>`
    insert into app.follow_ups (shop_id, customer_id, due, reason, note, created_by)
    values (${shopId}, ${customerId}, ${f.due}, ${f.reason}, ${f.note?.trim().slice(0, 500) || null}, ${userId}) returning id
  `
  return row
}

export async function openFollowUps(shopId: string, upTo: string): Promise<FollowUp[]> {
  return sql<FollowUp[]>`
    select f.id, f.customer_id, c.name, c.phone, c.email, f.due::text, f.reason, f.note, f.status
    from app.follow_ups f join app.customers c on c.id = f.customer_id
    where f.shop_id = ${shopId} and f.status = 'open' and f.due <= ${upTo} order by f.due, c.name
  `
}

export async function closeFollowUp(shopId: string, id: string, userId: string | null, how: 'done' | 'dismissed'): Promise<boolean> {
  const rows = await sql<{ customerId: string }[]>`
    update app.follow_ups set status = ${how}, done_at = now() where id = ${id} and shop_id = ${shopId} and status = 'open' returning customer_id
  `
  if (rows[0] && how === 'done') await sql`update app.customers set last_contacted_at = now() where id = ${rows[0].customerId}`
  return rows.length > 0
}

export type Campaign = { id: string; shopId: string; name: string; subject: string; body: string; segment: CampaignSegment; status: 'draft' | 'sent'; createdAt: Date; sentAt: Date | null; sentCount: number }

export async function listCampaigns(shopId: string): Promise<Campaign[]> {
  return sql<Campaign[]>`select * from app.campaigns where shop_id = ${shopId} order by created_at desc limit 100`
}

export async function createCampaign(shopId: string, userId: string | null, c: { name: string; subject: string; body: string; segment: CampaignSegment }): Promise<Campaign> {
  if (!isSegment(c.segment.segment)) throw new Error('bad segment')
  const seg: CampaignSegment = { segment: c.segment.segment, ...(c.segment.tag ? { tag: cleanTag(c.segment.tag) } : {}) }
  const [row] = await sql<Campaign[]>`
    insert into app.campaigns (shop_id, name, subject, body, segment, created_by)
    values (${shopId}, ${c.name.trim().slice(0, 80)}, ${c.subject.trim().slice(0, 120)}, ${c.body.trim().slice(0, 4000)}, ${sql.json(seg as never)}, ${userId}) returning *
  `
  return row
}

export async function deleteCampaign(shopId: string, id: string): Promise<boolean> {
  const rows = await sql`delete from app.campaigns where id = ${id} and shop_id = ${shopId} and status = 'draft' returning id`
  return rows.length > 0
}

/** Who a campaign would reach: the segment, narrowed to clients with an email who said yes and aren't blocked. */
export async function campaignAudience(shopId: string, segment: CampaignSegment, today: string) {
  const rows = await listCustomers(shopId, today, '', 'name', 5000, { segment: segment.segment, tag: segment.tag })
  return rows.filter(c => c.marketingConsent && !!c.email && !c.blocked)
}

const merge = (text: string, name: string) => text.replace(/\{name\}/g, name)

export type CampaignMail = { to: string; subject: string; text: string; html: string }

/**
 * Send a campaign once. `transport.send` returns 'sent' | 'failed'; the default goes through the shop's
 * normal email sender. Each mail is merged with the client's name and ends with their unsubscribe link.
 */
export async function sendCampaign(shop: Shop, campaignId: string, userId: string | null, today: string, transport: { send: (m: CampaignMail) => Promise<'sent' | 'failed'> }) {
  const [c] = await sql<Campaign[]>`select * from app.campaigns where id = ${campaignId} and shop_id = ${shop.id}`
  if (!c) throw new Error('campaign not found')
  const claimed = await sql`update app.campaigns set status = 'sent', sent_at = now() where id = ${c.id} and status = 'draft' returning id`
  if (!claimed.length) throw new Error('campaign already sent')
  const audience = await campaignAudience(shop.id, c.segment, today)
  const tokens = new Map((await sql<{ id: string; unsubscribeToken: string }[]>`select id, unsubscribe_token from app.customers where shop_id = ${shop.id} and id in ${sql(audience.length ? audience.map(a => a.id) : ['00000000-0000-4000-a000-000000000000'])}`).map(r => [r.id, r.unsubscribeToken]))
  let sent = 0, failed = 0, skipped = 0
  for (const a of audience) {
    const link = `${env.siteUrl}/unsubscribe/${encodeURIComponent(tokens.get(a.id) ?? '')}`
    const text = `${merge(c.body, a.name)}\n\n—\n${shop.name}\n退订 / Unsubscribe: ${link}`
    const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
    const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1d1a1f;line-height:1.6"><p style="white-space:pre-wrap">${esc(merge(c.body, a.name))}</p><p style="margin-top:28px;color:#6b6470;font-size:13px">${esc(shop.name)}<br><a href="${link}" style="color:#6b6470">退订 / Unsubscribe</a></p></div>`
    let status: 'sent' | 'failed' | 'skipped' = 'skipped'
    try { status = await transport.send({ to: a.email!, subject: merge(c.subject, a.name), text, html }) } catch { status = 'failed' }
    await sql`insert into app.campaign_sends (campaign_id, shop_id, customer_id, email, status) values (${c.id}, ${shop.id}, ${a.id}, ${a.email!}, ${status}) on conflict do nothing`
    if (status === 'sent') { sent++; await sql`update app.customers set last_contacted_at = now() where id = ${a.id}` } else if (status === 'failed') failed++; else skipped++
  }
  await sql`update app.campaigns set sent_count = ${sent} where id = ${c.id}`
  return { sent, failed, skipped }
}

/** The link in every marketing email. Idempotent; a wrong token changes nothing. */
export async function unsubscribe(raw: string): Promise<boolean> {
  let token = raw
  try { token = decodeURIComponent(raw) } catch { return false }
  if (!token || token.length > 64) return false
  // idempotent: a second visit (or a second render of the same page) still says "done"
  const rows = await sql`update app.customers set marketing_consent = false where unsubscribe_token = ${token} returning id`
  if (rows.length) return true
  const [c] = await sql`select 1 from app.customers where unsubscribe_token = ${token}`
  return !!c
}

export async function createCustomer(shopId: string, c: { name: string; phone: string; email: string; notes: string; source: 'walkin' | 'phone' | 'manual' | 'import' }): Promise<string | null> {
  const [shop] = await sql<{ marketKey: string }[]>`select market_key from app.shops where id = ${shopId}`
  const region = marketOf(shop ?? {}).phoneRegion
  const key = c.phone ? phoneKey(c.phone, region) : ''
  const email = c.email.trim().toLowerCase() || null
  if (!c.name.trim()) return null
  if (key) {
    const [row] = await sql<{ id: string }[]>`
      insert into app.customers (shop_id, name, phone, phone_norm, phone_e164, email, notes, source)
      values (${shopId}, ${c.name.trim().slice(0, 80)}, ${c.phone.trim()}, ${key}, ${parsePhone(c.phone, region)?.e164 ?? null}, ${email}, ${c.notes.trim().slice(0, 2000) || null}, ${c.source})
      on conflict (shop_id, phone_norm) where phone_norm <> '' do update set name = excluded.name, email = coalesce(excluded.email, app.customers.email), notes = coalesce(excluded.notes, app.customers.notes)
      returning id`
    return row.id
  }
  const [row] = await sql<{ id: string }[]>`
    insert into app.customers (shop_id, name, email, notes, source) values (${shopId}, ${c.name.trim().slice(0, 80)}, ${email}, ${c.notes.trim().slice(0, 2000) || null}, ${c.source}) returning id`
  return row.id
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false; else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim()))
}

/**
 * Import clients from a CSV with a header row (name, phone, email, tags, birthday, notes in any order).
 * Existing clients are matched by phone and updated (tags merged); rows without a name or phone are skipped.
 */
export async function importCustomers(shopId: string, csv: string): Promise<{ added: number; updated: number; skipped: number }> {
  const rows = parseCsv(csv.replace(/^﻿/, ''))
  if (rows.length < 2) return { added: 0, updated: 0, skipped: 0 }
  const header = rows[0].map(h => h.trim().toLowerCase())
  const col = (name: string, r: string[]) => { const i = header.indexOf(name); return i >= 0 ? (r[i] ?? '').trim() : '' }
  const [shop] = await sql<{ marketKey: string }[]>`select market_key from app.shops where id = ${shopId}`
  const region = marketOf(shop ?? {}).phoneRegion
  let added = 0, updated = 0, skipped = 0
  for (const r of rows.slice(1, 5001)) {
    const name = col('name', r).slice(0, 80), phone = col('phone', r), email = col('email', r).toLowerCase()
    const key = phone ? phoneKey(phone, region) : ''
    if (!name || !key) { skipped++; continue }
    const tags = Array.from(new Set(col('tags', r).split(/[,;，；]/).map(cleanTag).filter(Boolean))).slice(0, 20)
    const birthday = /^\d{4}-\d{2}-\d{2}$/.test(col('birthday', r)) ? col('birthday', r) : null
    const notes = col('notes', r).slice(0, 2000) || null
    const [row] = await sql<{ inserted: boolean }[]>`
      insert into app.customers (shop_id, name, phone, phone_norm, phone_e164, email, tags, birthday, notes, source)
      values (${shopId}, ${name}, ${phone}, ${key}, ${parsePhone(phone, region)?.e164 ?? null}, ${email || null}, ${sql.array(tags)}, ${birthday}, ${notes}, 'import')
      on conflict (shop_id, phone_norm) where phone_norm <> '' do update set
        email = coalesce(app.customers.email, excluded.email),
        tags = (select array_agg(distinct t) from unnest(app.customers.tags || excluded.tags) t),
        birthday = coalesce(app.customers.birthday, excluded.birthday),
        notes = coalesce(app.customers.notes, excluded.notes)
      returning (xmax = 0) as inserted`
    if (row.inserted) added++; else updated++
  }
  return { added, updated, skipped }
}
