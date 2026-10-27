import 'server-only'
import { sql } from '@/lib/db'
import { bookingsWithItems, normPhone } from '@/lib/bookings'
import type { Booking, BookingKind, BookingStatus } from '@/lib/types'

// ---------------------------------------------------------------- bookings list

export type BookingFilter = { from: string; to: string; staffId?: string | null; status?: BookingStatus | null; kind?: BookingKind | null; q?: string | null }

export async function searchBookings(shopId: string, f: BookingFilter, limit = 500): Promise<Booking[]> {
  const q = f.q?.trim() || ''
  const digits = normPhone(q)
  const like = `%${q.replace(/[%_\\]/g, m => '\\' + m)}%`
  const rows = await sql<Booking[]>`
    select * from app.bookings
    where shop_id = ${shopId} and date between ${f.from} and ${f.to}
      ${f.staffId ? sql`and staff_id = ${f.staffId}` : sql``}
      ${f.status ? sql`and status = ${f.status}` : sql``}
      ${f.kind ? sql`and kind = ${f.kind}` : sql`and kind <> 'block'`}
      ${q ? sql`and (guest_name ilike ${like} or code = ${q.toUpperCase()} or guest_email ilike ${like}
              ${digits.length >= 3 ? sql`or regexp_replace(coalesce(guest_phone, ''), '\D', '', 'g') like ${'%' + digits + '%'}` : sql``})` : sql``}
    order by date, start_min, staff_id
    limit ${limit}
  `
  return bookingsWithItems(rows)
}

// ---------------------------------------------------------------- customers

export type CustomerRow = {
  id: string; name: string; phone: string | null; email: string | null; notes: string | null; blocked: boolean; createdAt: Date
  visits: number; noShows: number; cancels: number; lastVisit: string | null; nextVisit: string | null; spentCents: number
}

const customerStats = (shopId: string, today: string) => sql`
  select c.*,
    count(*) filter (where b.status = 'completed')::int as visits,
    count(*) filter (where b.status = 'no_show')::int as no_shows,
    count(*) filter (where b.status = 'cancelled')::int as cancels,
    max(b.date) filter (where b.status = 'completed')::text as last_visit,
    min(b.date) filter (where b.status = 'confirmed' and b.date >= ${today})::text as next_visit,
    coalesce(sum(b.est_price_cents) filter (where b.status = 'completed'), 0)::int as spent_cents
  from app.customers c
  left join app.bookings b on b.customer_id = c.id
  where c.shop_id = ${shopId}
`

export async function listCustomers(shopId: string, today: string, q: string, sort: 'recent' | 'visits' | 'name' = 'recent', limit = 300): Promise<CustomerRow[]> {
  const s = q.trim()
  const digits = normPhone(s)
  const like = `%${s.replace(/[%_\\]/g, m => '\\' + m)}%`
  return sql<CustomerRow[]>`
    ${customerStats(shopId, today)}
      ${s ? sql`and (c.name ilike ${like} or c.email ilike ${like} ${digits.length >= 3 ? sql`or c.phone_norm like ${'%' + digits + '%'}` : sql``})` : sql``}
    group by c.id
    order by ${sort === 'name' ? sql`c.name` : sort === 'visits' ? sql`visits desc, c.name` : sql`greatest(max(b.created_at), c.created_at) desc nulls last`}
    limit ${limit}
  `
}

export async function getCustomer(shopId: string, id: string, today: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [c] = await sql<CustomerRow[]>`${customerStats(shopId, today)} and c.id = ${id} group by c.id`
  if (!c) return null
  const history = await bookingsWithItems(await sql<Booking[]>`
    select * from app.bookings where shop_id = ${shopId} and customer_id = ${id} order by date desc, start_min desc limit 200
  `)
  return { customer: c, history }
}

// ---------------------------------------------------------------- reports

export type Report = Awaited<ReturnType<typeof buildReport>>

export async function buildReport(shopId: string, from: string, to: string) {
  const [totals] = await sql<{ total: number; completed: number; noShows: number; cancelled: number; upcoming: number; revenueCents: number; upcomingCents: number; guests: number }[]>`
    select count(*)::int as total,
      count(*) filter (where status = 'completed')::int as completed,
      count(*) filter (where status = 'no_show')::int as no_shows,
      count(*) filter (where status = 'cancelled')::int as cancelled,
      count(*) filter (where status = 'confirmed')::int as upcoming,
      coalesce(sum(est_price_cents) filter (where status = 'completed'), 0)::int as revenue_cents,
      coalesce(sum(est_price_cents) filter (where status = 'confirmed'), 0)::int as upcoming_cents,
      count(distinct coalesce(customer_id::text, id::text)) filter (where status in ('confirmed', 'completed'))::int as guests
    from app.bookings where shop_id = ${shopId} and kind <> 'block' and date between ${from} and ${to}
  `
  const staff = await sql<{ id: string; name: string; nameZh: string | null; color: string; commissionPct: number; completed: number; noShows: number; serviceMin: number; revenueCents: number; bookedMin: number; shiftMin: number }[]>`
    with b as (
      select staff_id,
        count(*) filter (where status = 'completed' and kind <> 'block')::int as completed,
        count(*) filter (where status = 'no_show')::int as no_shows,
        coalesce(sum(duration_min) filter (where status = 'completed' and kind <> 'block'), 0)::int as service_min,
        coalesce(sum(est_price_cents) filter (where status = 'completed' and kind <> 'block'), 0)::int as revenue_cents,
        coalesce(sum(duration_min) filter (where status in ('confirmed', 'completed') and kind <> 'block'), 0)::int as booked_min
      from app.bookings where shop_id = ${shopId} and date between ${from} and ${to} group by staff_id
    ), s as (
      select staff_id, coalesce(sum(end_min - start_min - coalesce((
        select sum(least((x->>1)::int, end_min) - greatest((x->>0)::int, start_min))
        from jsonb_array_elements(breaks) x where (x->>1)::int > start_min and (x->>0)::int < end_min), 0)), 0)::int as shift_min
      from app.shifts where shop_id = ${shopId} and date between ${from} and ${to} group by staff_id
    )
    select st.id, st.name, st.name_zh, st.color, st.commission_pct::float8 as commission_pct,
      coalesce(b.completed, 0) as completed, coalesce(b.no_shows, 0) as no_shows, coalesce(b.service_min, 0) as service_min,
      coalesce(b.revenue_cents, 0) as revenue_cents, coalesce(b.booked_min, 0) as booked_min, coalesce(s.shift_min, 0) as shift_min
    from app.staff st left join b on b.staff_id = st.id left join s on s.staff_id = st.id
    where st.shop_id = ${shopId} and (st.active or b.staff_id is not null)
    order by st.sort, st.name
  `
  const popular = await sql<{ name: string; nameZh: string | null; kind: string; count: number; revenueCents: number }[]>`
    select i.name, max(i.name_zh) as name_zh, i.kind, count(*)::int as count,
      coalesce(sum(i.price_cents) filter (where b.status = 'completed'), 0)::int as revenue_cents
    from app.booking_items i join app.bookings b on b.id = i.booking_id
    where b.shop_id = ${shopId} and b.date between ${from} and ${to} and b.status in ('confirmed', 'completed')
    group by i.name, i.kind order by count desc, i.name limit 10
  `
  const sources = await sql<{ kind: BookingKind; count: number }[]>`
    select kind, count(*)::int as count from app.bookings
    where shop_id = ${shopId} and date between ${from} and ${to} and kind <> 'block' and status <> 'cancelled'
    group by kind order by count desc
  `
  const [nr] = await sql<{ newCount: number; returningCount: number }[]>`
    with inrange as (
      select distinct customer_id from app.bookings
      where shop_id = ${shopId} and date between ${from} and ${to} and customer_id is not null and status in ('confirmed', 'completed')
    ), firsts as (
      select customer_id, min(date) as first_date from app.bookings
      where shop_id = ${shopId} and customer_id in (select customer_id from inrange) and status in ('confirmed', 'completed', 'no_show')
      group by customer_id
    )
    select count(*) filter (where first_date >= ${from})::int as new_count, count(*) filter (where first_date < ${from})::int as returning_count from firsts
  `
  const byDay = await sql<{ date: string; count: number }[]>`
    select date::text, count(*)::int as count from app.bookings
    where shop_id = ${shopId} and date between ${from} and ${to} and kind <> 'block' and status in ('confirmed', 'completed')
    group by date order by date
  `
  const shiftMin = staff.reduce((a, s) => a + s.shiftMin, 0)
  const bookedMin = staff.reduce((a, s) => a + s.bookedMin, 0)
  return { totals, staff, popular, sources, newReturning: nr, byDay, utilization: shiftMin ? bookedMin / shiftMin : null }
}
