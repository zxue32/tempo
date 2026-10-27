// Pure availability engine. No I/O: callers load the day's data and pass it in.
// All times are minutes since the shop's local midnight on one date.

export type Interval = [number, number]

export type EngineService = {
  id: string
  kind: 'service' | 'addon'
  category: string
  duration: number
  /** equipment this service needs for the whole visit (e.g. a pedicure chair) */
  resourceId?: string | null
}

export type EngineResource = {
  id: string
  quantity: number
  /** existing use: [start, busyEnd, bookingId] */
  busy: Array<[number, number, string]>
}

export type EngineStaff = {
  id: string
  sort: number
  online: boolean
  /** service id -> duration override (null = use the service's own duration). Only main services. */
  skills: Map<string, number | null>
  shift: { start: number; end: number; breaks: Interval[] } | null
  /** existing busy time: [start, busyEnd, bookingId] */
  busy: Array<[number, number, string]>
  /** who gets "any technician" first: lower goes first. Defaults to booked minutes (balance the day). */
  load?: number
}

export type EngineDay = {
  date: string
  /** shop opening hours that day, null = closed */
  hours: { open: number; close: number } | null
  slot: number
  buffer: number
  /** earliest allowed start minute on this date (lead time). Use -Infinity for no limit, Infinity for none allowed. */
  earliest: number
  staff: EngineStaff[]
  services: Map<string, EngineService>
  /** equipment limits (empty or missing = unlimited) */
  resources?: Map<string, EngineResource>
  /** online only: keep at least this many on-shift staff free at every moment (for walk-ins) */
  reserve?: number
  /** online only: hide start times that leave a gap shorter than this next to other work (0 = off) */
  minGap?: number
}

export type GuestRequest = {
  serviceIds: string[]
  addonIds: string[]
  /** null = any qualified staff member */
  staffId: string | null
}

export type Assignment = { staffId: string; duration: number }
export type Slot = { start: number; assign: Assignment[] }

export type Blocker = 'closed' | 'off' | 'shift' | 'break' | 'booked' | 'skill' | 'invalid' | 'resource' | 'reserve' | 'gap'

export const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1

/** The shift a staff member can actually be booked in: their roster clipped to opening hours. */
export function workingWindow(day: EngineDay, st: EngineStaff): { start: number; end: number; breaks: Interval[] } | null {
  if (!day.hours || !st.shift) return null
  const start = Math.max(st.shift.start, day.hours.open)
  const end = Math.min(st.shift.end, day.hours.close)
  if (end <= start) return null
  return { start, end, breaks: st.shift.breaks.filter(b => b[1] > b[0]) }
}

export function qualifies(st: EngineStaff, guest: GuestRequest): boolean {
  return guest.serviceIds.length > 0 && guest.serviceIds.every(id => st.skills.has(id))
}

/** Total minutes this staff member needs for the guest, or null if the request is invalid. */
export function guestDuration(day: EngineDay, st: EngineStaff | null, guest: GuestRequest): number | null {
  let total = 0
  for (const id of guest.serviceIds) {
    const s = day.services.get(id)
    if (!s || s.kind !== 'service') return null
    const override = st ? st.skills.get(id) : null
    total += override ?? s.duration
  }
  for (const id of guest.addonIds) {
    const a = day.services.get(id)
    if (!a || a.kind !== 'addon') return null
    total += a.duration
  }
  return total > 0 ? total : null
}

/** Why this staff member can't start at `start` for `duration` minutes (null = free). */
export function blocker(day: EngineDay, st: EngineStaff, start: number, duration: number, ignore: ReadonlySet<string> = new Set(), opts: { ignoreShift?: boolean } = {}): Blocker | null {
  if (duration <= 0 || start < 0 || start + duration > 1440) return 'invalid'
  if (!opts.ignoreShift) {
    if (!day.hours) return 'closed'
    const w = workingWindow(day, st)
    if (!w) return 'off'
    if (start < w.start || start + duration > w.end) return 'shift'
    for (const b of w.breaks) if (overlaps(start, start + duration, b[0], b[1])) return 'break'
  }
  const end = start + duration + day.buffer
  for (const [s, e, id] of st.busy) {
    if (ignore.has(id)) continue
    if (overlaps(start, end, s, e)) return 'booked'
  }
  return null
}

/** Equipment a guest's visit needs (services and add-ons). */
export function guestResources(day: EngineDay, guest: GuestRequest): string[] {
  const out = new Set<string>()
  for (const id of [...guest.serviceIds, ...guest.addonIds]) {
    const r = day.services.get(id)?.resourceId
    if (r && day.resources?.has(r)) out.add(r)
  }
  return [...out]
}

/**
 * Would these new visits push any equipment over its quantity at any moment?
 * Returns the overloaded resource id, or null when everything fits.
 */
export function resourceConflict(day: EngineDay, visits: Array<{ start: number; end: number; resourceIds: string[] }>, ignore: ReadonlySet<string> = new Set()): string | null {
  if (!day.resources?.size) return null
  const wanted = new Set(visits.flatMap(v => v.resourceIds))
  for (const rid of wanted) {
    const r = day.resources.get(rid)
    if (!r) continue
    const mine = visits.filter(v => v.resourceIds.includes(rid))
    const existing = r.busy.filter(b => !ignore.has(b[2]))
    const lo = Math.min(...mine.map(v => v.start)), hi = Math.max(...mine.map(v => v.end))
    // usage only changes where something starts, so checking those points is enough
    const points = new Set<number>([...mine.map(v => v.start), ...existing.map(b => b[0]).filter(p => p >= lo && p < hi)])
    for (const p of points) {
      const ours = mine.filter(v => v.start <= p && p < v.end).length
      if (!ours) continue // an existing overload we're not part of isn't ours to refuse
      if (existing.filter(b => b[0] <= p && p < b[1]).length + ours > r.quantity) return rid
    }
  }
  return null
}

/** Is this staff member working (inside their window and not on a break) at minute p? */
function onDuty(day: EngineDay, st: EngineStaff, p: number): boolean {
  const w = workingWindow(day, st)
  if (!w || p < w.start || p >= w.end) return false
  return !w.breaks.some(b => b[0] <= p && p < b[1])
}

/**
 * Walk-in reserve: after adding `adds`, at least `day.reserve` on-duty staff must stay free
 * at every moment of the new visits. Only applies to online booking.
 */
export function reserveHolds(day: EngineDay, adds: Array<{ staffId: string; start: number; end: number }>, ignore: ReadonlySet<string> = new Set()): boolean {
  const need = day.reserve ?? 0
  if (need <= 0 || !adds.length) return true
  const lo = Math.min(...adds.map(a => a.start)), hi = Math.max(...adds.map(a => a.end))
  const points = new Set<number>([lo])
  for (const st of day.staff) {
    for (const [s, e, id] of st.busy) if (!ignore.has(id)) { if (s > lo && s < hi) points.add(s); if (e > lo && e < hi) points.add(e) }
    const w = workingWindow(day, st)
    if (w) {
      for (const x of [w.start, w.end, ...w.breaks.flat()]) if (x > lo && x < hi) points.add(x)
    }
  }
  for (const a of adds) if (a.end > lo && a.end < hi) points.add(a.end)
  for (const p of points) {
    let free = 0
    for (const st of day.staff) {
      if (!onDuty(day, st, p)) continue
      if (adds.some(a => a.staffId === st.id && a.start <= p && p < a.end)) continue
      if (st.busy.some(([s, e, id]) => !ignore.has(id) && s <= p && p < e)) continue
      free++
    }
    if (free < need) return false
  }
  return true
}

/** Would starting here leave a sliver of time (shorter than minGap) that nobody can book? */
export function leavesGap(day: EngineDay, st: EngineStaff, start: number, duration: number, ignore: ReadonlySet<string> = new Set()): boolean {
  const g = day.minGap ?? 0
  if (g <= 0) return false
  const w = workingWindow(day, st)
  if (!w) return false
  const end = start + duration + day.buffer
  const step = day.slot > 0 ? day.slot : 15
  // time before the lead-time cutoff can't be booked online anyway, so it counts as an edge
  const cutoff = Number.isFinite(day.earliest) ? Math.ceil(day.earliest / step) * step : -Infinity
  let prev = Math.max(w.start, cutoff), next = w.end
  const blocks: Interval[] = [...w.breaks, ...st.busy.filter(b => !ignore.has(b[2])).map(b => [b[0], b[1]] as Interval)]
  for (const [s, e] of blocks) {
    if (e <= start && e > prev) prev = e
    if (s >= end && s < next) next = s
    // cleanup running into a break or booking leaves no gap after it
    if (s < end && e > end) next = Math.min(next, end)
  }
  const before = start - prev, after = next - end
  return (before > 0 && before < g) || (after > 0 && after < g)
}

function bookedMinutes(st: EngineStaff, ignore: ReadonlySet<string>): number {
  let m = 0
  for (const [s, e, id] of st.busy) if (!ignore.has(id)) m += e - s
  return m
}

export type FindOptions = {
  ignore?: Iterable<string>
  /** shop staff creating a booking can use staff hidden from online booking */
  includeOffline?: boolean
}

/**
 * Every start time on the slot grid where all guests can start together,
 * each with a different staff member. Returns one assignment per slot.
 */
export function findSlots(day: EngineDay, guests: GuestRequest[], opts: FindOptions = {}): Slot[] {
  if (!day.hours || guests.length === 0) return []
  if (guests.some(g => g.serviceIds.length === 0)) return []
  const ignore = new Set(opts.ignore ?? [])
  const pool = day.staff.filter(s => (opts.includeOffline || s.online) && workingWindow(day, s))
  // lowest load first (booked minutes, or turns taken), then the shop's own order
  const load = (st: EngineStaff) => st.load ?? bookedMinutes(st, ignore)
  pool.sort((a, b) => load(a) - load(b) || a.sort - b.sort)

  // candidate staff + duration per guest
  const cands: Array<Array<{ st: EngineStaff; duration: number }>> = guests.map(g => {
    const list = g.staffId ? pool.filter(s => s.id === g.staffId) : pool
    const out: Array<{ st: EngineStaff; duration: number }> = []
    for (const st of list) {
      if (!qualifies(st, g)) continue
      const d = guestDuration(day, st, g)
      if (d) out.push({ st, duration: d })
    }
    return out
  })
  if (cands.some(c => c.length === 0)) return []

  const minDur = Math.min(...cands.flat().map(c => c.duration))
  const step = day.slot > 0 ? day.slot : 15
  const first = Math.ceil(day.hours.open / step) * step
  const res = guests.map(g => guestResources(day, g))
  const out: Slot[] = []
  for (let t = first; t + minDur <= day.hours.close; t += step) {
    if (t < day.earliest) continue
    const free = cands.map(list => list.filter(c => blocker(day, c.st, t, c.duration, ignore) === null && !leavesGap(day, c.st, t, c.duration, ignore)))
    if (free.some(f => f.length === 0)) continue
    // shop-wide rules that depend on the whole group: equipment and walk-in reserve
    const fits = (a: Assignment[]) =>
      resourceConflict(day, a.map((x, i) => ({ start: t, end: t + x.duration + day.buffer, resourceIds: res[i] })), ignore) === null &&
      reserveHolds(day, a.map(x => ({ staffId: x.staffId, start: t, end: t + x.duration + day.buffer })), ignore)
    const assign = assignDistinct(free, fits)
    if (assign) out.push({ start: t, assign })
  }
  return out
}

/** Pick one distinct staff member per guest (small backtracking; groups are at most ~10). */
function assignDistinct(free: Array<Array<{ st: EngineStaff; duration: number }>>, fits: (a: Assignment[]) => boolean = () => true): Assignment[] | null {
  const order = free.map((_, i) => i).sort((a, b) => free[a].length - free[b].length)
  const result: Assignment[] = new Array(free.length)
  const used = new Set<string>()
  let tries = 0
  const go = (k: number): boolean => {
    if (k === order.length) {
      if (fits(result)) return true
      tries++
      return false
    }
    // a big group in a crowded shop: stop searching rather than hang
    if (tries > 2000) return false
    const gi = order[k]
    for (const c of free[gi]) {
      if (used.has(c.st.id)) continue
      used.add(c.st.id)
      result[gi] = { staffId: c.st.id, duration: c.duration }
      if (go(k + 1)) return true
      used.delete(c.st.id)
    }
    return false
  }
  return go(0) ? [...result] : null
}

/** Merge busy time into plain intervals for display (staff timeline). */
export function busyIntervals(st: EngineStaff): Interval[] {
  return st.busy.map(([s, e]) => [s, e] as Interval).sort((a, b) => a[0] - b[0])
}
