import 'server-only'
import { sql, type Q } from './db'
import type { Shop, Break } from './types'
import type { Catalog } from './data/catalog'
import { hoursOn, type SpecialDay } from './data/schedule'
import { findSlots, type EngineDay, type EngineStaff, type EngineService, type EngineResource, type GuestRequest } from './engine'
import { nowInZone, diffDays, addDays } from './tz'

export type DayOptions = {
  /** customers: lead time, booking window and online-only staff/services apply */
  forCustomers: boolean
  now?: Date
}

/** Build the engine's view of each date from the database. */
export async function buildDays(q: Q, shop: Shop, catalog: Catalog, dates: string[], opts: DayOptions): Promise<EngineDay[]> {
  if (!dates.length) return []
  const sorted = [...dates].sort()
  const from = sorted[0], to = sorted[sorted.length - 1]
  const [shifts, busy, specials, resources] = await Promise.all([
    q<{ staffId: string; date: string; startMin: number; endMin: number; breaks: Break[] }[]>`
      select staff_id, date, start_min, end_min, breaks from app.shifts
      where shop_id = ${shop.id} and date between ${from} and ${to}
    `,
    q<{ id: string; staffId: string; date: string; startMin: number; busyMin: number; kind: string; anyStaff: boolean; resourceIds: string[] }[]>`
      select id, staff_id, date, start_min, kind, any_staff, resource_ids,
        start_min + round(extract(epoch from (busy_until - starts_at)) / 60)::int as busy_min
      from app.bookings
      where shop_id = ${shop.id} and date between ${addDays(from, -1)} and ${to} and status in ('confirmed', 'completed')
    `,
    // read through the same connection: inside a transaction, borrowing a second pooled connection can deadlock the pool
    q<SpecialDay[]>`select date::text, closed, open_min, close_min, note from app.special_days where shop_id = ${shop.id} and date >= ${from} order by date`,
    q<{ id: string; quantity: number }[]>`select id, quantity from app.resources where shop_id = ${shop.id}`,
  ])
  const specialMap = new Map<string, SpecialDay>(specials.map(s => [s.date, s]))
  const services = new Map<string, EngineService>()
  for (const s of catalog.services) {
    if (!s.active || (opts.forCustomers && !s.online)) continue
    services.set(s.id, { id: s.id, kind: s.kind, category: s.category, duration: s.durationMin, resourceId: s.resourceId ?? null })
  }
  const now = nowInZone(shop.timezone, opts.now)

  return dates.map(date => {
    const todays = busy.filter(b => b.date === date)
    const resMap = new Map<string, EngineResource>()
    for (const r of resources) {
      resMap.set(r.id, { id: r.id, quantity: r.quantity, busy: todays.filter(b => b.resourceIds?.includes(r.id)).map(b => [b.startMin, b.busyMin, b.id] as [number, number, string]) })
    }
    const staff: EngineStaff[] = catalog.staff
      .filter(st => st.active)
      .map(st => {
        const skills = new Map<string, number | null>()
        for (const sk of catalog.skills) if (sk.staffId === st.id && services.has(sk.serviceId)) skills.set(sk.serviceId, sk.durationMin)
        const sh = shifts.find(x => x.staffId === st.id && x.date === date)
        return {
          id: st.id,
          sort: st.sort,
          online: st.bookableOnline,
          skills,
          shift: sh ? { start: sh.startMin, end: sh.endMin, breaks: (sh.breaks ?? []) as [number, number][] } : null,
          busy: todays.filter(b => b.staffId === st.id).map(b => [b.startMin, b.busyMin, b.id] as [number, number, string]),
          // turn sheet: count today's visits (optionally only the ones where the client didn't ask for this person)
          load: shop.assignMode === 'turns'
            ? todays.filter(b => b.staffId === st.id && b.kind !== 'block' && (shop.turnsCountRequests || b.anyStaff)).length
            : undefined,
        }
      })
    let earliest = -Infinity
    if (opts.forCustomers) {
      const dd = diffDays(date, now.date)
      if (dd < 0 || dd > shop.maxDays) earliest = Infinity
      else earliest = now.min + shop.leadMinutes - dd * 1440
    }
    return {
      date,
      hours: hoursOn(shop.hours, specialMap, date),
      slot: shop.slotMinutes,
      buffer: shop.bufferMinutes,
      earliest,
      staff,
      services,
      resources: resMap,
      reserve: opts.forCustomers ? shop.walkinReserve ?? 0 : 0,
      minGap: opts.forCustomers ? shop.minGap ?? 0 : 0,
    }
  })
}

export type DaySummary = { date: string; closed: boolean; count: number }

/** Slot counts for a range of dates plus the slots of one selected date. */
export async function availability(shop: Shop, catalog: Catalog, guests: GuestRequest[], from: string, days: number, selected: string | null, opts: DayOptions & { ignore?: string[] }) {
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i))
  if (selected && !dates.includes(selected)) dates.push(selected)
  const built = await buildDays(sql, shop, catalog, dates, opts)
  const summaries: DaySummary[] = []
  let selectedSlots: ReturnType<typeof findSlots> = []
  for (const d of built) {
    const slots = findSlots(d, guests, { ignore: opts.ignore, includeOffline: !opts.forCustomers })
    if (d.date === selected) selectedSlots = slots
    if (d.date >= from && d.date <= addDays(from, days - 1)) summaries.push({ date: d.date, closed: !d.hours, count: slots.length })
  }
  return { days: summaries, slots: selectedSlots }
}

/** First date (from `from`, up to `limit` days ahead) with at least one slot. */
export async function nextAvailable(shop: Shop, catalog: Catalog, guests: GuestRequest[], from: string, limit: number, opts: DayOptions & { ignore?: string[] }): Promise<string | null> {
  for (let off = 0; off < limit; off += 14) {
    const dates = Array.from({ length: Math.min(14, limit - off) }, (_, i) => addDays(from, off + i))
    const built = await buildDays(sql, shop, catalog, dates, opts)
    for (const d of built) {
      if (findSlots(d, guests, { ignore: opts.ignore, includeOffline: !opts.forCustomers }).length) return d.date
    }
  }
  return null
}
