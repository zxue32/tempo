import { describe, it, expect } from 'vitest'
import { findSlots, blocker, guestDuration, type EngineDay, type EngineStaff } from '@/lib/engine'
import { zonedToUtc, utcToZoned, addDays, weekday, mondayOf, isDateString, fmtTime, nowInZone } from '@/lib/tz'

const H = (h: number, m = 0) => h * 60 + m
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function staff(id: string, sort: number, shift: [number, number] | null, skills: Record<string, number | null>, busy: Array<[number, number, string]> = [], breaks: Array<[number, number]> = [], online = true): EngineStaff {
  return { id, sort, online, skills: new Map(Object.entries(skills)), shift: shift ? { start: shift[0], end: shift[1], breaks } : null, busy }
}

function day(staffList: EngineStaff[], extra: Partial<EngineDay> = {}): EngineDay {
  return {
    date: '2026-10-14',
    hours: { open: H(10), close: H(19) },
    slot: 15,
    buffer: 0,
    earliest: -Infinity,
    staff: staffList,
    services: new Map([
      ['gel', { id: 'gel', kind: 'service', category: 'hand', duration: 45 }],
      ['gelx', { id: 'gelx', kind: 'service', category: 'ext', duration: 90 }],
      ['pedi', { id: 'pedi', kind: 'service', category: 'foot', duration: 60 }],
      ['remove', { id: 'remove', kind: 'addon', category: 'addon', duration: 15 }],
      ['art', { id: 'art', kind: 'addon', category: 'addon', duration: 15 }],
    ]),
    ...extra,
  }
}

describe('availability engine', () => {
  it('the brief: a 3-5pm booking blocks every start that would overlap it', () => {
    const mia = staff('mia', 1, [H(10), H(18)], { gelx: null, gel: null }, [[H(15), H(17), 'b1']])
    const slots = findSlots(day([mia]), [{ serviceIds: ['gelx'], addonIds: [], staffId: 'mia' }])
    const starts = slots.map(s => fmt(s.start))
    expect(starts).toContain('13:30') // 13:30 + 90 = 15:00, fits exactly
    expect(starts).not.toContain('13:45')
    expect(starts).not.toContain('14:00')
    expect(starts).not.toContain('16:45')
    // 17:00 + 90 = 18:30 > shift end 18:00
    expect(starts).not.toContain('17:00')
    expect(starts.filter(s => s > '13:30' && s < '17:00')).toEqual([])
  })

  it('add-ons extend the duration', () => {
    const mia = staff('mia', 1, [H(10), H(18)], { gelx: null })
    const d = day([mia])
    expect(guestDuration(d, mia, { serviceIds: ['gelx'], addonIds: ['remove', 'art'], staffId: null })).toBe(120)
    const slots = findSlots(d, [{ serviceIds: ['gelx'], addonIds: ['remove', 'art'], staffId: null }])
    expect(fmt(slots[slots.length - 1].start)).toBe('16:00')
  })

  it('uses the staff member’s own duration override', () => {
    const fast = staff('fast', 1, [H(10), H(12)], { gelx: 60 })
    const slots = findSlots(day([fast]), [{ serviceIds: ['gelx'], addonIds: [], staffId: null }])
    expect(slots.map(s => fmt(s.start)).pop()).toBe('11:00')
    expect(slots[0].assign[0].duration).toBe(60)
  })

  it('respects skills, breaks, opening hours and days off', () => {
    const luna = staff('luna', 1, [H(9), H(20)], { gel: null }, [], [[H(13), H(13, 30)]])
    const ivy = staff('ivy', 2, null, { gel: null, pedi: null })
    const d = day([luna, ivy])
    // luna does not do pedicures, ivy is off
    expect(findSlots(d, [{ serviceIds: ['pedi'], addonIds: [], staffId: null }])).toEqual([])
    const starts = findSlots(d, [{ serviceIds: ['gel'], addonIds: [], staffId: 'luna' }]).map(s => fmt(s.start))
    expect(starts[0]).toBe('10:00') // clipped to opening hours
    expect(starts).toContain('12:15') // ends 13:00 exactly at break
    expect(starts).not.toContain('12:30')
    expect(starts).toContain('13:30')
    expect(starts[starts.length - 1]).toBe('18:15') // ends 19:00 close
    expect(blocker(d, luna, H(12, 45), 45)).toBe('break')
    expect(blocker(d, ivy, H(11), 45)).toBe('off')
  })

  it('applies the cleanup buffer after existing and new bookings', () => {
    const a = staff('a', 1, [H(10), H(14)], { gel: null }, [[H(11), H(11, 45) + 10, 'x']])
    const slots = findSlots(day([a], { buffer: 10 }), [{ serviceIds: ['gel'], addonIds: [], staffId: null }]).map(s => fmt(s.start))
    // new 45 min + 10 buffer must end by 11:00 -> latest morning start 10:00 (10:00-10:55)
    expect(slots).toContain('10:00')
    expect(slots).not.toContain('10:15')
    // existing busy until 11:55 -> next start 12:00
    expect(slots).toContain('12:00')
    expect(slots).not.toContain('11:45')
  })

  it('lead time hides early starts', () => {
    const a = staff('a', 1, [H(10), H(19)], { gel: null })
    const slots = findSlots(day([a], { earliest: H(14, 5) }), [{ serviceIds: ['gel'], addonIds: [], staffId: null }])
    expect(fmt(slots[0].start)).toBe('14:15')
  })

  it('groups start together with distinct staff', () => {
    const a = staff('a', 1, [H(10), H(12)], { gel: null, pedi: null })
    const b = staff('b', 2, [H(11), H(13)], { gel: null })
    const d = day([a, b])
    const slots = findSlots(d, [
      { serviceIds: ['pedi'], addonIds: [], staffId: null },
      { serviceIds: ['gel'], addonIds: [], staffId: null },
    ])
    // both must be free: a 11:00-12:00 (pedi), b 11:00-11:45
    expect(slots.map(s => fmt(s.start))).toEqual(['11:00'])
    expect(slots[0].assign.map(x => x.staffId)).toEqual(['a', 'b'])
  })

  it('ignores the booking being rescheduled and hides offline staff from customers', () => {
    const a = staff('a', 1, [H(10), H(11)], { gel: null }, [[H(10), H(10, 45), 'mine']])
    const hidden = staff('h', 2, [H(10), H(11)], { gel: null }, [], [], false)
    const d = day([a, hidden])
    expect(findSlots(d, [{ serviceIds: ['gel'], addonIds: [], staffId: null }])).toEqual([])
    expect(findSlots(d, [{ serviceIds: ['gel'], addonIds: [], staffId: null }], { ignore: ['mine'] }).length).toBeGreaterThan(0)
    expect(findSlots(d, [{ serviceIds: ['gel'], addonIds: [], staffId: null }], { includeOffline: true }).length).toBeGreaterThan(0)
  })

  it('spreads work to the least busy staff member', () => {
    const a = staff('a', 1, [H(10), H(19)], { gel: null }, [[H(15), H(18), 'x']])
    const b = staff('b', 2, [H(10), H(19)], { gel: null })
    const slots = findSlots(day([a, b]), [{ serviceIds: ['gel'], addonIds: [], staffId: null }])
    expect(slots[0].assign[0].staffId).toBe('b')
  })

  it('closed days have no slots', () => {
    const a = staff('a', 1, [H(10), H(19)], { gel: null })
    expect(findSlots(day([a], { hours: null }), [{ serviceIds: ['gel'], addonIds: [], staffId: null }])).toEqual([])
  })
})

describe('time zones', () => {
  it('converts local wall time to UTC across DST', () => {
    // New York: EDT (UTC-4) in October, EST (UTC-5) in December
    expect(zonedToUtc('2026-10-14', H(15), 'America/New_York').toISOString()).toBe('2026-10-14T19:00:00.000Z')
    expect(zonedToUtc('2026-12-14', H(15), 'America/New_York').toISOString()).toBe('2026-12-14T20:00:00.000Z')
    // DST ends 2026-11-01 at 2:00; 1:30 is ambiguous, 3:00 is EST
    expect(zonedToUtc('2026-11-01', H(3), 'America/New_York').toISOString()).toBe('2026-11-01T08:00:00.000Z')
    // DST starts 2027-03-14; 2:30 does not exist and moves forward
    const skipped = zonedToUtc('2027-03-14', H(2, 30), 'America/New_York')
    expect(utcToZoned(skipped, 'America/New_York').min).toBe(H(3, 30))
    expect(zonedToUtc('2026-07-01', H(9), 'America/Los_Angeles').toISOString()).toBe('2026-07-01T16:00:00.000Z')
  })

  it('round-trips and does date maths', () => {
    const t = zonedToUtc('2026-10-14', H(23, 45), 'America/Chicago')
    expect(utcToZoned(t, 'America/Chicago')).toEqual({ date: '2026-10-14', min: H(23, 45) })
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(weekday('2026-10-14')).toBe(3)
    expect(mondayOf('2026-10-18')).toBe('2026-10-12')
    expect(isDateString('2026-02-30')).toBe(false)
    expect(isDateString('2028-02-29')).toBe(true)
    expect(fmtTime(H(13, 5), 'en')).toBe('1:05 PM')
    expect(fmtTime(H(0, 5), 'en')).toBe('12:05 AM')
    expect(nowInZone('America/New_York', new Date('2026-10-16T06:04:00Z'))).toEqual({ date: '2026-10-16', min: H(2, 4) })
  })
})

describe('gap rule edge case found by the property test', () => {
  it('cleanup running into a break does not count as a leftover gap', async () => {
    const { findSlots } = await import('@/lib/engine')
    const day = {
      date: '2026-11-03', hours: { open: 480, close: 1020 }, slot: 15, buffer: 10, earliest: -Infinity,
      staff: [{ id: 'a', sort: 0, online: true, skills: new Map([['s', null]]), busy: [[825, 840, 'x']] as Array<[number, number, string]>, shift: { start: 690, end: 870, breaks: [[810, 840]] as Array<[number, number]> } }],
      services: new Map([['s', { id: 's', kind: 'service' as const, category: 'c', duration: 15 }]]),
      minGap: 15,
    }
    // 13:15–13:30 plus 10 min cleanup runs into the 13:30 break: nothing is left over, so 13:15 must be offered
    expect(findSlots(day, [{ serviceIds: ['s'], addonIds: [], staffId: null }]).map(s => s.start)).toContain(795)
  })
})
