import 'server-only'
import { sql } from '../db'

// ---------------------------------------------------------------- measured durations

export type MeasuredDuration = { staffId: string; serviceId: string; n: number; p50: number; p80: number; current: number; hasOverride: boolean }

/**
 * Real service times from staff tapping start / finish. Only visits with exactly one service
 * and no add-ons count, so each number belongs to one technician doing one service.
 */
export async function measuredDurations(shopId: string, days = 90): Promise<MeasuredDuration[]> {
  const rows = await sql<MeasuredDuration[]>`
    with single as (
      select b.id, b.staff_id, (array_agg(i.service_id))[1] as service_id,
        extract(epoch from (b.actual_end - b.actual_start)) / 60 as mins
      from app.bookings b join app.booking_items i on i.booking_id = b.id
      where b.shop_id = ${shopId} and b.status = 'completed' and b.actual_start is not null and b.actual_end is not null
        and b.starts_at > now() - make_interval(days => ${days})
      group by b.id
      having count(*) = 1 and bool_and(i.kind = 'service')
    )
    select s.staff_id, s.service_id, count(*)::int as n,
      round(percentile_cont(0.5) within group (order by s.mins))::int as p50,
      round(percentile_cont(0.8) within group (order by s.mins))::int as p80,
      coalesce(ss.duration_min, sv.duration_min) as current, ss.duration_min is not null as has_override
    from single s
    join app.services sv on sv.id = s.service_id
    join app.staff_services ss on ss.staff_id = s.staff_id and ss.service_id = s.service_id
    where s.mins between 5 and 600
    group by s.staff_id, s.service_id, ss.duration_min, sv.duration_min
    order by count(*) desc
  `
  return rows
}

// ---------------------------------------------------------------- funnel

export const FUNNEL_STEPS = ['store', 'start', 'time', 'details', 'booked'] as const
export type FunnelStep = (typeof FUNNEL_STEPS)[number]

export async function recordFunnel(shopId: string, session: string, step: FunnelStep) {
  await sql`insert into app.funnel_events (shop_id, session, step) values (${shopId}, ${session}, ${step}) on conflict do nothing`
}

export async function funnel(shopId: string, days = 30): Promise<Record<FunnelStep, number>> {
  const rows = await sql<{ step: FunnelStep; n: number }[]>`
    select step, count(*)::int as n from app.funnel_events
    where shop_id = ${shopId} and at > now() - make_interval(days => ${days}) group by step
  `
  const out = Object.fromEntries(FUNNEL_STEPS.map(s => [s, 0])) as Record<FunnelStep, number>
  for (const r of rows) out[r.step] = r.n
  return out
}

// ---------------------------------------------------------------- current numbers, to compare with the baseline

export async function currentMetrics(shopId: string, from: string, to: string) {
  const [m] = await sql<{ settled: number; noShows: number; nonBlock: number; online: number; days: number; shiftMin: number; bookedMin: number; confirmedAsked: number; confirmedYes: number }[]>`
    with b as (
      select * from app.bookings where shop_id = ${shopId} and date between ${from} and ${to} and kind <> 'block'
    ), s as (
      select coalesce(sum(end_min - start_min), 0)::int as shift_min, count(distinct date)::int as days
      from app.shifts where shop_id = ${shopId} and date between ${from} and ${to}
    )
    select
      (select count(*) from b where status in ('completed', 'no_show'))::int as settled,
      (select count(*) from b where status = 'no_show')::int as no_shows,
      (select count(*) from b where status <> 'cancelled')::int as non_block,
      (select count(*) from b where status <> 'cancelled' and kind = 'online')::int as online,
      (select days from s) as days,
      (select shift_min from s) as shift_min,
      (select coalesce(sum(duration_min), 0) from b where status in ('confirmed', 'completed'))::int as booked_min,
      (select count(*) from b where status in ('completed', 'no_show') and reminder_sent_at is not null)::int as confirmed_asked,
      (select count(*) from b where status in ('completed', 'no_show') and client_confirmed_at is not null)::int as confirmed_yes
  `
  return {
    noShowPct: m.settled ? (m.noShows / m.settled) * 100 : null,
    onlinePct: m.nonBlock ? (m.online / m.nonBlock) * 100 : null,
    idleHoursPerDay: m.days ? Math.max(0, m.shiftMin - m.bookedMin) / 60 / m.days : null,
    settled: m.settled,
    bookings: m.nonBlock,
    confirmPct: m.confirmedAsked ? (m.confirmedYes / m.confirmedAsked) * 100 : null,
  }
}

// ---------------------------------------------------------------- integrity check

export type Issue = { level: 'error' | 'warn'; code: 'overlap' | 'resource' | 'outside_roster' | 'unclosed'; count: number; sample: Array<{ id: string; date: string; start: number }> }

/**
 * Independent re-check of the booking rules straight from the stored data. Errors should be impossible
 * (the booking code and database refuse them); warnings need a human to look.
 */
export async function integrityCheck(shopId: string): Promise<{ ok: boolean; issues: Issue[] }> {
  const recent = sql`b.date >= current_date - 30`
  const [overlaps, resources, outside, unclosed] = await Promise.all([
    sql<{ id: string; date: string; startMin: number }[]>`
      select b.id, b.date::text, b.start_min from app.bookings b join app.bookings o
        on o.staff_id = b.staff_id and o.id <> b.id and o.status in ('confirmed', 'completed')
        and tstzrange(o.starts_at, o.busy_until, '[)') && tstzrange(b.starts_at, b.busy_until, '[)')
      where b.shop_id = ${shopId} and b.status in ('confirmed', 'completed') and ${recent}
      group by b.id order by b.date, b.start_min
    `,
    sql<{ id: string; date: string; startMin: number }[]>`
      select b.id, b.date::text, b.start_min from app.resources r
      join app.bookings b on r.id = any(b.resource_ids) and b.status in ('confirmed', 'completed')
      join app.bookings o on r.id = any(o.resource_ids) and o.status in ('confirmed', 'completed')
        and o.starts_at <= b.starts_at and o.busy_until > b.starts_at
      where r.shop_id = ${shopId} and ${recent}
      group by b.id, r.id, r.quantity having count(o.id) > r.quantity
      order by b.date, b.start_min
    `,
    sql<{ id: string; date: string; startMin: number }[]>`
      select b.id, b.date::text, b.start_min from app.bookings b
      where b.shop_id = ${shopId} and b.status = 'confirmed' and b.date >= current_date and b.kind <> 'block'
        and not exists (select 1 from app.shifts s where s.staff_id = b.staff_id and s.date = b.date and s.start_min <= b.start_min and s.end_min >= b.end_min)
      order by b.date, b.start_min
    `,
    sql<{ id: string; date: string; startMin: number }[]>`
      select b.id, b.date::text, b.start_min from app.bookings b
      where b.shop_id = ${shopId} and b.status = 'confirmed' and b.kind <> 'block' and b.ends_at < now() - interval '12 hours'
      order by b.date desc, b.start_min
    `,
  ])
  const issue = (level: Issue['level'], code: Issue['code'], rows: Array<{ id: string; date: string; startMin: number }>): Issue[] =>
    rows.length ? [{ level, code, count: rows.length, sample: rows.slice(0, 5).map(r => ({ id: r.id, date: r.date, start: r.startMin })) }] : []
  const issues = [
    ...issue('error', 'overlap', overlaps),
    ...issue('error', 'resource', resources),
    ...issue('warn', 'outside_roster', outside),
    ...issue('warn', 'unclosed', unclosed),
  ]
  const ok = !issues.some(i => i.level === 'error')
  await sql`insert into app.integrity_runs (shop_id, ok, issues) values (${shopId}, ${ok}, ${sql.json(issues as never)})`
  return { ok, issues }
}

export async function lastIntegrityRun(shopId: string) {
  const [row] = await sql<{ at: Date; ok: boolean; issues: Issue[] }[]>`
    select at, ok, issues from app.integrity_runs where shop_id = ${shopId} order by at desc limit 1
  `
  return row ?? null
}
