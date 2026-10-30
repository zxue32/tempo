import 'server-only'
import { sql, type Tx } from '../db'
import type { Shop, ShopStatus, Industry, Lang, Hours } from '../types'
import { templateFor, defaultThemeFor } from '../templates'
import { STAFF_COLORS } from '../themes'
import { toMinor } from '../money'

/** The shop's industries from `app.shop_industries`, primary first (CORE-02). */
const industriesCol = () => sql`(select coalesce(array_agg(i.industry order by i.is_primary desc, i.industry), '{}') from app.shop_industries i where i.shop_id = s.id) as industries`

export async function getShopBySlug(slug: string): Promise<Shop | null> {
  const rows = await sql<Shop[]>`select s.*, ${industriesCol()} from app.shops s where s.slug = ${slug.toLowerCase()}`
  return rows[0] ?? null
}

export async function getShop(id: string): Promise<Shop | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const rows = await sql<Shop[]>`select s.*, ${industriesCol()} from app.shops s where s.id = ${id}`
  return rows[0] ?? null
}

export async function shopsForUser(userId: string) {
  return sql<(Shop & { role: 'owner' | 'manager' | 'staff' })[]>`
    select s.*, ${industriesCol()}, m.role from app.shop_members m join app.shops s on s.id = m.shop_id
    where m.user_id = ${userId} order by s.created_at
  `
}

export async function slugTaken(slug: string, exceptShopId?: string): Promise<boolean> {
  const rows = await sql`select 1 from app.shops where slug = ${slug} and id is distinct from ${exceptShopId ?? null} limit 1`
  return rows.length > 0
}

export type NewShop = {
  ownerId: string
  ownerEmail: string
  name: string
  nameZh?: string | null
  slug: string
  industry: Industry
  phone?: string | null
  address?: string | null
  city?: string | null
  timezone: string
  defaultLang: Lang
  inviteCode?: string | null
  ownerStaffName?: string | null
}

/** Creates a draft shop with the industry's starter menu and the owner as first staff member. */
export async function createShop(input: NewShop): Promise<Shop> {
  return sql.begin(async tx => {
    const [shop] = await tx<Shop[]>`
      insert into app.shops (slug, industry, name, name_zh, phone, email, address, city, timezone, default_lang,
                             theme, notify_emails, owner_id, invite_code)
      values (${input.slug}, ${input.industry}, ${input.name}, ${input.nameZh ?? null}, ${input.phone ?? null},
              ${input.ownerEmail}, ${input.address ?? null}, ${input.city ?? null}, ${input.timezone}, ${input.defaultLang},
              ${defaultThemeFor(input.industry)}, ${[input.ownerEmail]}, ${input.ownerId}, ${input.inviteCode ?? null})
      returning *
    `
    await tx`insert into app.shop_members (shop_id, user_id, role) values (${shop.id}, ${input.ownerId}, 'owner')`
    await seedServices(tx, shop.id, input.industry)
    if (input.ownerStaffName) {
      const [st] = await tx<{ id: string }[]>`
        insert into app.staff (shop_id, name, color, sort, default_week)
        values (${shop.id}, ${input.ownerStaffName}, ${STAFF_COLORS[0]}, 0, ${sql.json(defaultWeekFromHours(shop.hours))})
        returning id
      `
      await tx`
        insert into app.staff_services (staff_id, service_id)
        select ${st.id}, id from app.services where shop_id = ${shop.id} and kind = 'service'
      `
      await tx`update app.shop_members set staff_id = ${st.id} where shop_id = ${shop.id} and user_id = ${input.ownerId}`
    }
    return shop
  })
}

export function defaultWeekFromHours(hours: Hours) {
  const out: Record<string, { start: number; end: number; breaks: [number, number][] }> = {}
  for (const [wd, h] of Object.entries(hours)) {
    if (!h.closed && h.close > h.open) out[wd] = { start: h.open, end: h.close, breaks: [] }
  }
  return out
}

async function seedServices(tx: Tx, shopId: string, industry: Industry) {
  const list = templateFor(industry)
  let i = 0
  for (const s of list) {
    await tx`
      insert into app.services (shop_id, kind, category, applies_to, name, name_zh, desc_en, desc_zh, duration_min, price_cents, sort)
      values (${shopId}, ${s.kind}, ${s.category}, ${s.appliesTo ?? []}, ${s.name}, ${s.nameZh}, ${s.descEn ?? null},
              ${s.descZh ?? null}, ${s.min}, ${toMinor(String(s.price), 'USD')}, ${i++})
    `
  }
}

const EDITABLE = [
  'name', 'nameZh', 'aboutEn', 'aboutZh', 'theme', 'accent', 'logoUrl', 'coverUrl', 'phone', 'email', 'address', 'city',
  'mapUrl', 'instagram', 'timezone', 'defaultLang', 'hours', 'slotMinutes', 'leadMinutes', 'maxDays', 'cancelCutoffMinutes',
  'bufferMinutes', 'maxGuests', 'allowAnyStaff', 'showPrices', 'bookingNoteEn', 'bookingNoteZh', 'notifyEmails', 'notifyStaff',
  'industry', 'walkinReserve', 'assignMode', 'turnsCountRequests', 'minGap', 'noshowLimit', 'waitlistEnabled', 'pilotBaseline',
] as const
export type ShopPatch = Partial<Pick<Shop, (typeof EDITABLE)[number]>>

export async function updateShop(id: string, patch: ShopPatch): Promise<Shop> {
  const clean: Record<string, unknown> = {}
  for (const k of EDITABLE) if (k in patch) clean[k] = (patch as Record<string, unknown>)[k]
  if ('hours' in clean) clean.hours = sql.json(clean.hours as never)
  if ('pilotBaseline' in clean) clean.pilotBaseline = sql.json(clean.pilotBaseline as never)
  if (Object.keys(clean).length === 0) return (await getShop(id))!
  const [row] = await sql<Shop[]>`update app.shops set ${sql(clean)} where id = ${id} returning *`
  return row
}

export type ReadinessIssue = 'no_services' | 'no_staff' | 'no_skills' | 'no_roster' | 'no_hours' | 'no_contact'

/** What still blocks a shop from taking bookings. */
export async function readiness(shopId: string): Promise<ReadinessIssue[]> {
  const issues: ReadinessIssue[] = []
  const [shop] = await sql<Shop[]>`select * from app.shops where id = ${shopId}`
  if (!Object.values(shop.hours).some(h => !h.closed && h.close > h.open)) issues.push('no_hours')
  if (!shop.phone && !shop.address) issues.push('no_contact')
  const [c] = await sql<{ services: number; staff: number; skills: number; shifts: number }[]>`
    select
      (select count(*)::int from app.services where shop_id = ${shopId} and kind = 'service' and active and online) as services,
      (select count(*)::int from app.staff where shop_id = ${shopId} and active) as staff,
      (select count(*)::int from app.staff_services ss join app.staff st on st.id = ss.staff_id
         join app.services sv on sv.id = ss.service_id
         where st.shop_id = ${shopId} and st.active and sv.active) as skills,
      (select count(*)::int from app.shifts where shop_id = ${shopId} and date >= current_date) as shifts
  `
  if (!c.services) issues.push('no_services')
  if (!c.staff) issues.push('no_staff')
  else if (!c.skills) issues.push('no_skills')
  if (!c.shifts) issues.push('no_roster')
  return issues
}

/** Owner submits for review. A valid platform invite goes live immediately. */
export async function submitShop(shopId: string): Promise<{ status: ShopStatus; issues: ReadinessIssue[] }> {
  const issues = await readiness(shopId)
  if (issues.length) return { status: (await getShop(shopId))!.status, issues }
  return sql.begin(async tx => {
    const [shop] = await tx<Shop[]>`select * from app.shops where id = ${shopId} for update`
    if (!['draft', 'changes', 'rejected'].includes(shop.status)) return { status: shop.status, issues: [] }
    let live = false
    if (shop.inviteCode) {
      const used = await tx`
        update app.platform_invites set uses = uses + 1
        where code = ${shop.inviteCode} and uses < max_uses and (expires_at is null or expires_at > now())
        returning code
      `
      live = used.length > 0
      if (!live) await tx`update app.shops set invite_code = null where id = ${shopId}`
    }
    const status: ShopStatus = live ? 'live' : 'pending'
    await tx`
      update app.shops set status = ${status}, submitted_at = now(),
        live_at = case when ${live} then now() else live_at end,
        reviewed_at = case when ${live} then now() else reviewed_at end
      where id = ${shopId}
    `
    return { status, issues: [] }
  })
}

export async function inviteValid(code: string): Promise<boolean> {
  const rows = await sql`
    select 1 from app.platform_invites
    where code = ${code} and uses < max_uses and (expires_at is null or expires_at > now())
  `
  return rows.length > 0
}

// ---------------------------------------------------------------- platform admin

export async function adminListShops(status?: ShopStatus | 'all') {
  return sql<(Shop & { ownerEmail: string; staffCount: number; serviceCount: number; upcoming: number })[]>`
    select s.*, u.email as owner_email,
      (select count(*)::int from app.staff st where st.shop_id = s.id and st.active) as staff_count,
      (select count(*)::int from app.services sv where sv.shop_id = s.id and sv.kind = 'service' and sv.active) as service_count,
      (select count(*)::int from app.bookings b where b.shop_id = s.id and b.status = 'confirmed' and b.starts_at > now() and b.kind <> 'block') as upcoming
    from app.shops s join app.users u on u.id = s.owner_id
    where ${status && status !== 'all' ? sql`s.status = ${status}` : sql`true`}
    order by case s.status when 'pending' then 0 when 'changes' then 1 when 'draft' then 2 when 'live' then 3 else 4 end,
             s.submitted_at desc nulls last, s.created_at desc
  `
}

export async function adminCounts() {
  const rows = await sql<{ status: ShopStatus; n: number }[]>`select status, count(*)::int as n from app.shops group by status`
  const out: Record<string, number> = { all: 0 }
  for (const r of rows) { out[r.status] = r.n; out.all += r.n }
  return out
}

export async function adminSetStatus(shopId: string, status: ShopStatus, adminId: string, note: string | null) {
  const [row] = await sql<Shop[]>`
    update app.shops set status = ${status}, review_note = ${note}, reviewed_at = now(), reviewed_by = ${adminId},
      live_at = case when ${status} = 'live' and live_at is null then now() else live_at end
    where id = ${shopId} returning *
  `
  return row
}

export async function adminChangeSlug(shopId: string, slug: string) {
  await sql`update app.shops set slug = ${slug} where id = ${shopId}`
}

export async function listInvites() {
  return sql<{ code: string; note: string | null; maxUses: number; uses: number; expiresAt: Date | null; createdAt: Date }[]>`
    select code, note, max_uses, uses, expires_at, created_at from app.platform_invites order by created_at desc
  `
}

export async function createInvite(code: string, note: string | null, maxUses: number, expiresAt: Date | null, adminId: string) {
  await sql`
    insert into app.platform_invites (code, note, max_uses, expires_at, created_by)
    values (${code}, ${note}, ${maxUses}, ${expiresAt}, ${adminId})
  `
}

export async function deleteInvite(code: string) {
  await sql`delete from app.platform_invites where code = ${code}`
}
