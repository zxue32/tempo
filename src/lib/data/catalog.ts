import 'server-only'
import { sql } from '../db'
import type { Service, Staff, Skill, Break } from '../types'
import { unbookableReason, type IndustryKey } from '../industries/registry'
import { shopIndustries } from '../industries/shop'

export async function listStaff(shopId: string, opts: { activeOnly?: boolean } = {}): Promise<Staff[]> {
  const rows = await sql<Staff[]>`
    select * from app.staff where shop_id = ${shopId} ${opts.activeOnly ? sql`and active` : sql``}
    order by sort, created_at
  `
  return rows.map(r => ({ ...r, commissionPct: Number(r.commissionPct) }))
}

export async function listServices(shopId: string, opts: { activeOnly?: boolean; onlineOnly?: boolean } = {}): Promise<Service[]> {
  return sql<Service[]>`
    select * from app.services where shop_id = ${shopId}
      ${opts.activeOnly ? sql`and active` : sql``}
      ${opts.onlineOnly ? sql`and online` : sql``}
    order by kind desc, sort, created_at
  `
}

export async function listSkills(shopId: string): Promise<Skill[]> {
  return sql<Skill[]>`
    select ss.staff_id, ss.service_id, ss.duration_min from app.staff_services ss
    join app.staff st on st.id = ss.staff_id where st.shop_id = ${shopId}
  `
}

export type StaffInput = {
  name: string
  nameZh?: string | null
  bioEn?: string | null
  bioZh?: string | null
  color: string
  photoUrl?: string | null
  active: boolean
  bookableOnline: boolean
  commissionPct: number
  defaultWeek?: Record<string, { start: number; end: number; breaks: Break[] }>
  publicPage?: boolean
  specialties?: string[]
  specialtiesZh?: string[]
}

export async function createStaff(shopId: string, input: StaffInput): Promise<string> {
  const [{ n }] = await sql<{ n: number }[]>`select coalesce(max(sort), -1)::int + 1 as n from app.staff where shop_id = ${shopId}`
  const [row] = await sql<{ id: string }[]>`
    insert into app.staff (shop_id, name, name_zh, bio_en, bio_zh, color, photo_url, active, bookable_online, commission_pct, sort, default_week, public_page, specialties, specialties_zh)
    values (${shopId}, ${input.name}, ${input.nameZh ?? null}, ${input.bioEn ?? null}, ${input.bioZh ?? null}, ${input.color},
            ${input.photoUrl ?? null}, ${input.active}, ${input.bookableOnline}, ${input.commissionPct}, ${n},
            ${sql.json(input.defaultWeek ?? {})}, ${input.publicPage ?? true}, ${input.specialties ?? []}, ${input.specialtiesZh ?? []})
    returning id
  `
  return row.id
}

export async function updateStaff(shopId: string, staffId: string, input: Partial<StaffInput>) {
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) if (v !== undefined) patch[k] = k === 'defaultWeek' ? sql.json(v as never) : v
  if (!Object.keys(patch).length) return
  await sql`update app.staff set ${sql(patch)} where id = ${staffId} and shop_id = ${shopId}`
}

/** Removes a staff member; if they have booking history they are deactivated instead. */
export async function deleteStaff(shopId: string, staffId: string): Promise<'deleted' | 'deactivated' | 'not_found'> {
  // everything below is scoped to this shop: a staff id from another shop changes nothing (CORE-04)
  const [own] = await sql`select 1 from app.staff where id = ${staffId} and shop_id = ${shopId}`
  if (!own) return 'not_found'
  const used = await sql`select 1 from app.bookings where staff_id = ${staffId} and shop_id = ${shopId} and kind <> 'block' limit 1`
  if (used.length) {
    await sql`update app.staff set active = false, bookable_online = false where id = ${staffId} and shop_id = ${shopId}`
    await sql`delete from app.shifts where staff_id = ${staffId} and shop_id = ${shopId} and date >= current_date`
    return 'deactivated'
  }
  await sql`delete from app.staff where id = ${staffId} and shop_id = ${shopId}`
  return 'deleted'
}

export async function reorderStaff(shopId: string, ids: string[]) {
  await sql.begin(async tx => {
    for (let i = 0; i < ids.length; i++) await tx`update app.staff set sort = ${i} where id = ${ids[i]} and shop_id = ${shopId}`
  })
}

/** Replace the services a staff member does. */
export async function setStaffSkills(shopId: string, staffId: string, skills: Array<{ serviceId: string; durationMin: number | null }>) {
  await sql.begin(async tx => {
    const [own] = await tx`select 1 from app.staff where id = ${staffId} and shop_id = ${shopId}`
    if (!own) throw new Error('staff not in shop')
    await tx`delete from app.staff_services where staff_id = ${staffId}`
    if (!skills.length) return
    const valid = new Set(
      (await tx<{ id: string }[]>`select id from app.services where shop_id = ${shopId} and kind = 'service'`).map(r => r.id),
    )
    for (const s of skills) {
      if (!valid.has(s.serviceId)) continue
      await tx`insert into app.staff_services (staff_id, service_id, duration_min) values (${staffId}, ${s.serviceId}, ${s.durationMin})`
    }
  })
}

export type ServiceInput = {
  kind: 'service' | 'addon'
  category: string
  appliesTo: string[]
  name: string
  nameZh?: string | null
  descEn?: string | null
  descZh?: string | null
  durationMin: number
  priceCents: number | null
  priceFrom: boolean
  active: boolean
  online: boolean
  resourceId?: string | null
  questionEn?: string | null
  questionZh?: string | null
}

export async function createService(shopId: string, input: ServiceInput, giveToAllStaff = true): Promise<string> {
  return sql.begin(async tx => {
    const [{ n }] = await tx<{ n: number }[]>`select coalesce(max(sort), -1)::int + 1 as n from app.services where shop_id = ${shopId}`
    const [row] = await tx<{ id: string }[]>`
      insert into app.services (shop_id, kind, category, applies_to, name, name_zh, desc_en, desc_zh, duration_min, price_cents, price_from, active, online, sort,
                                resource_id, question_en, question_zh)
      values (${shopId}, ${input.kind}, ${input.category}, ${input.appliesTo}, ${input.name}, ${input.nameZh ?? null}, ${input.descEn ?? null},
              ${input.descZh ?? null}, ${input.durationMin}, ${input.priceCents}, ${input.priceFrom}, ${input.active}, ${input.online}, ${n},
              ${input.resourceId ?? null}, ${input.questionEn ?? null}, ${input.questionZh ?? null})
      returning id
    `
    if (giveToAllStaff && input.kind === 'service') {
      await tx`insert into app.staff_services (staff_id, service_id) select id, ${row.id} from app.staff where shop_id = ${shopId} and active`
    }
    return row.id
  })
}

export async function updateService(shopId: string, id: string, input: Partial<ServiceInput>) {
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) if (v !== undefined) patch[k] = v
  if (!Object.keys(patch).length) return
  await sql`update app.services set ${sql(patch)} where id = ${id} and shop_id = ${shopId}`
}

export async function deleteService(shopId: string, id: string) {
  await sql`delete from app.services where id = ${id} and shop_id = ${shopId}`
}

export async function reorderServices(shopId: string, ids: string[]) {
  await sql.begin(async tx => {
    for (let i = 0; i < ids.length; i++) await tx`update app.services set sort = ${i} where id = ${ids[i]} and shop_id = ${shopId}`
  })
}

/** Everything the booking pages need about a shop's menu and team. */
async function industriesOf(shopId: string): Promise<IndustryKey[]> {
  const [row] = await sql<{ industry: string; industries: IndustryKey[] }[]>`
    select s.industry, (select coalesce(array_agg(i.industry order by i.is_primary desc, i.industry), '{}') from app.shop_industries i where i.shop_id = s.id) as industries
    from app.shops s where s.id = ${shopId}
  `
  return row ? shopIndustries(row) : []
}

/**
 * The shop's menu, team and skills. For customers, services whose industry the shop can't take online bookings
 * for are left out (their ids are in `disabled`, so the booking engine can say why instead of "removed").
 */
export async function loadCatalog(shopId: string, opts: { forCustomers?: boolean } = {}) {
  const [all, staff, skills, industries] = await Promise.all([
    listServices(shopId, { activeOnly: true, onlineOnly: opts.forCustomers }),
    listStaff(shopId, { activeOnly: true }),
    listSkills(shopId),
    industriesOf(shopId),
  ])
  const disabled = new Set<string>()
  const services = opts.forCustomers ? all.filter(s => (unbookableReason(industries, s.industry) ? (disabled.add(s.id), false) : true)) : all
  return { services, staff, skills, industries, disabled }
}
export type Catalog = Awaited<ReturnType<typeof loadCatalog>>
