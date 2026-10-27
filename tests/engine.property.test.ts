// Property tests: the real engine vs. a deliberately dumb oracle that checks every minute.
// The oracle shares no code with the engine; if they disagree on any random day, one of them is wrong.
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { findSlots, type EngineDay, type EngineStaff, type EngineService, type EngineResource, type GuestRequest, type Assignment } from '@/lib/engine'

type Gen = { day: EngineDay; guests: GuestRequest[]; includeOffline: boolean }

// ---------------------------------------------------------------- oracle (minute by minute)

function onDuty(day: EngineDay, st: EngineStaff, m: number) {
  if (!day.hours || !st.shift) return false
  const s = Math.max(st.shift.start, day.hours.open), e = Math.min(st.shift.end, day.hours.close)
  if (m < s || m >= e) return false
  return !st.shift.breaks.some(([a, b]) => b > a && m >= a && m < b)
}
const busyAt = (st: EngineStaff, m: number) => st.busy.some(([a, b]) => m >= a && m < b)
function durationOf(day: EngineDay, st: EngineStaff, g: GuestRequest) {
  let d = 0
  for (const id of g.serviceIds) d += st.skills.get(id) ?? day.services.get(id)!.duration
  for (const id of g.addonIds) d += day.services.get(id)!.duration
  return d
}
function resourcesOf(day: EngineDay, g: GuestRequest) {
  return Array.from(new Set([...g.serviceIds, ...g.addonIds].map(id => day.services.get(id)?.resourceId).filter((r): r is string => !!r && !!day.resources?.has(r))))
}

/** Is starting everyone at t with these staff allowed? Every rule checked minute by minute. */
function oracleValid(day: EngineDay, guests: GuestRequest[], t: number, staffIds: string[], includeOffline: boolean): boolean {
  if (t < day.earliest) return false
  if (new Set(staffIds).size !== staffIds.length) return false
  const spans: Array<{ st: EngineStaff; d: number; end: number; res: string[] }> = []
  for (let i = 0; i < guests.length; i++) {
    const st = day.staff.find(s => s.id === staffIds[i])!
    const g = guests[i]
    if (!includeOffline && !st.online) return false
    if (g.staffId && g.staffId !== st.id) return false
    if (!g.serviceIds.every(id => st.skills.has(id))) return false
    const d = durationOf(day, st, g)
    for (let m = t; m < t + d; m++) if (!onDuty(day, st, m)) return false
    for (let m = t; m < t + d + day.buffer; m++) if (busyAt(st, m)) return false
    spans.push({ st, d, end: t + d + day.buffer, res: resourcesOf(day, g) })
  }
  // equipment: at every minute one of ours uses it, total use ≤ quantity
  for (const [rid, r] of day.resources ?? new Map<string, EngineResource>()) {
    const ours = spans.filter(s => s.res.includes(rid))
    if (!ours.length) continue
    const hi = Math.max(...ours.map(s => s.end))
    for (let m = t; m < hi; m++) {
      const n = ours.filter(s => m < s.end).length
      if (!n) continue
      if (r.busy.filter(([a, b]) => m >= a && m < b).length + n > r.quantity) return false
    }
  }
  // walk-in reserve: at every minute of the visits, enough on-duty staff stay free
  if ((day.reserve ?? 0) > 0) {
    const hi = Math.max(...spans.map(s => s.end))
    for (let m = t; m < hi; m++) {
      let free = 0
      for (const st of day.staff) {
        if (!onDuty(day, st, m) || busyAt(st, m)) continue
        if (spans.some(s => s.st.id === st.id && m < s.end)) continue
        free++
      }
      if (free < day.reserve!) return false
    }
  }
  // gaps: count free bookable minutes right before and right after each visit
  const g = day.minGap ?? 0
  if (g > 0) {
    const step = day.slot
    const cutoff = Number.isFinite(day.earliest) ? Math.ceil(day.earliest / step) * step : -Infinity
    for (const s of spans) {
      const free = (m: number) => onDuty(day, s.st, m) && !busyAt(s.st, m)
      let before = 0
      for (let m = t - 1; m >= cutoff && free(m); m--) before++
      let after = 0
      for (let m = s.end; free(m); m++) after++
      if ((before > 0 && before < g) || (after > 0 && after < g)) return false
    }
  }
  return true
}

function permutations(ids: string[], k: number): string[][] {
  if (k === 0) return [[]]
  const out: string[][] = []
  for (const id of ids) for (const rest of permutations(ids.filter(x => x !== id), k - 1)) out.push([id, ...rest])
  return out
}

function oracleStarts(gen: Gen): number[] {
  const { day, guests, includeOffline } = gen
  if (!day.hours) return []
  const out: number[] = []
  const combos = permutations(day.staff.map(s => s.id), guests.length)
  for (let t = Math.ceil(day.hours.open / day.slot) * day.slot; t < day.hours.close; t += day.slot) {
    if (combos.some(c => oracleValid(day, guests, t, c, includeOffline))) out.push(t)
  }
  return out
}

// ---------------------------------------------------------------- random days

const weighted = <T,>(...xs: Array<[T | fc.Arbitrary<T>, number]>) =>
  fc.oneof(...xs.map(([v, weight]) => ({ arbitrary: (v instanceof fc.Arbitrary ? v : fc.constant(v)) as fc.Arbitrary<T>, weight })))
const grid = (lo: number, hi: number, step: number) => fc.integer({ min: Math.ceil(lo / step), max: Math.floor(hi / step) }).map(n => n * step)

const dayArb: fc.Arbitrary<Gen> = fc.record({
  slot: fc.constantFrom(15, 30),
  buffer: fc.constantFrom(0, 0, 5, 10),
  open: grid(480, 660, 30),
  close: grid(1020, 1260, 30),
  durations: fc.array(fc.constantFrom(15, 30, 45, 60, 90), { minLength: 3, maxLength: 3 }),
  addon: fc.constantFrom(10, 15, 20),
  resQty: fc.integer({ min: 1, max: 2 }),
  resFor: fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
  staff: fc.array(fc.record({
    online: weighted<boolean>([true, 5], [false, 1]),
    working: weighted<boolean>([true, 6], [false, 1]),
    start: grid(480, 720, 15),
    len: grid(180, 600, 15),
    brk: fc.option(grid(0, 240, 15), { nil: null }),
    skills: fc.array(weighted<boolean>([true, 3], [false, 1]), { minLength: 3, maxLength: 3 }),
    override: fc.option(fc.constantFrom(20, 40, 75), { nil: null }),
    busy: fc.array(fc.record({ at: grid(480, 1200, 5), len: grid(15, 120, 5), res: fc.boolean() }), { maxLength: 3 }),
  }), { minLength: 1, maxLength: 4 }),
  earliest: weighted<number | null>([null, 3], [grid(400, 1000, 1), 1]),
  reserve: weighted<number>([0, 4], [1, 2], [2, 1]),
  minGap: fc.constantFrom(0, 0, 15, 30),
  guests: fc.array(fc.record({
    services: fc.uniqueArray(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 2 }),
    addon: fc.boolean(),
    who: weighted<number | null>([null, 3], [fc.integer({ min: 0, max: 3 }), 1]),
  }), { minLength: 1, maxLength: 2 }),
  includeOffline: fc.boolean(),
}).map(r => {
  const services = new Map<string, EngineService>()
  r.durations.forEach((d, i) => services.set(`s${i}`, { id: `s${i}`, kind: 'service', category: 'c', duration: d, resourceId: r.resFor[i] ? 'R' : null }))
  services.set('a0', { id: 'a0', kind: 'addon', category: 'addon', duration: r.addon, resourceId: r.resFor[3] ? 'R' : null })
  const resBusy: Array<[number, number, string]> = []
  const staff: EngineStaff[] = r.staff.map((s, i) => {
    const skills = new Map<string, number | null>()
    s.skills.forEach((on, j) => { if (on || j === 0) skills.set(`s${j}`, j === 0 ? s.override : null) })
    const end = Math.min(1440, s.start + s.len)
    const busy = s.busy.map((b, k) => [b.at, Math.min(1440, b.at + b.len), `b${i}-${k}`] as [number, number, string])
    s.busy.forEach((b, k) => { if (b.res) resBusy.push([busy[k][0], busy[k][1], busy[k][2]]) })
    return {
      id: `st${i}`, sort: i, online: s.online, skills, busy,
      shift: s.working ? { start: s.start, end, breaks: s.brk !== null && s.start + s.brk + 30 < end ? [[s.start + s.brk, s.start + s.brk + 30] as [number, number]] : [] } : null,
    }
  })
  const day: EngineDay = {
    date: '2026-11-03', hours: { open: r.open, close: r.close }, slot: r.slot, buffer: r.buffer,
    earliest: r.earliest ?? -Infinity, staff, services,
    resources: new Map([['R', { id: 'R', quantity: r.resQty, busy: resBusy }]]),
    reserve: r.reserve, minGap: r.minGap,
  }
  const guests: GuestRequest[] = r.guests.map(g => ({
    serviceIds: g.services.map(n => `s${n}`), addonIds: g.addon ? ['a0'] : [],
    staffId: g.who !== null && g.who < staff.length ? `st${g.who}` : null,
  }))
  return { day, guests, includeOffline: r.includeOffline }
})

const RUNS = Number(process.env.PROPERTY_RUNS || 1000)
export { dayArb, oracleStarts }

describe('availability engine vs. minute-by-minute oracle', () => {
  it('offers exactly the start times the rules allow (nothing extra, nothing missing)', () => {
    fc.assert(fc.property(dayArb, gen => {
      const engine = findSlots(gen.day, gen.guests, { includeOffline: gen.includeOffline }).map(s => s.start)
      expect(engine).toEqual(oracleStarts(gen))
    }), { numRuns: RUNS })
  })

  it('every offered slot comes with an assignment that obeys every rule', () => {
    fc.assert(fc.property(dayArb, gen => {
      for (const s of findSlots(gen.day, gen.guests, { includeOffline: gen.includeOffline })) {
        expect(oracleValid(gen.day, gen.guests, s.start, s.assign.map(a => a.staffId), gen.includeOffline)).toBe(true)
      }
    }), { numRuns: RUNS })
  })

  it('booking offered slots one after another never breaks a rule for the bookings made', () => {
    fc.assert(fc.property(dayArb, fc.array(fc.nat(), { minLength: 1, maxLength: 12 }), (gen, picks) => {
      const day = gen.day
      const made: Array<{ t: number; assign: Assignment[]; res: string[][] }> = []
      for (const p of picks) {
        const slots = findSlots(day, gen.guests, { includeOffline: gen.includeOffline })
        if (!slots.length) break
        const s = slots[p % slots.length]
        const res = gen.guests.map(g => Array.from(new Set([...g.serviceIds, ...g.addonIds].map(id => day.services.get(id)?.resourceId).filter((x): x is string => !!x))))
        // the oracle must accept it against the day as it is right now
        expect(oracleValid(day, gen.guests, s.start, s.assign.map(a => a.staffId), gen.includeOffline)).toBe(true)
        s.assign.forEach((a, i) => {
          const id = `n${made.length}-${i}`
          const span: [number, number, string] = [s.start, s.start + a.duration + day.buffer, id]
          day.staff.find(x => x.id === a.staffId)!.busy.push(span)
          if (res[i].includes('R')) day.resources!.get('R')!.busy.push(span)
        })
        made.push({ t: s.start, assign: s.assign, res })
      }
      // no person is ever double-booked by a booking we made
      for (const st of day.staff) {
        const mine = st.busy.filter(b => b[2].startsWith('n'))
        for (const a of mine) for (const b of st.busy) if (a !== b && a[0] < b[1] && b[0] < a[1]) throw new Error(`overlap on ${st.id}`)
      }
    }), { numRuns: Math.max(100, RUNS / 2) })
  })
})
