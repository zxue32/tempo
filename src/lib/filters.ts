import { addDays, isDateString, diffDays } from '@/lib/tz'
import type { BookingKind, BookingStatus } from '@/lib/types'

type SP = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
const STATUSES: BookingStatus[] = ['confirmed', 'completed', 'no_show', 'cancelled']
const KINDS: BookingKind[] = ['online', 'walkin', 'phone', 'block']

/** Parse the booking-list filters from the URL, clamping the range to a sane size. */
export function bookingFilters(sp: SP, today: string) {
  let from = one(sp.from) && isDateString(one(sp.from)!) ? one(sp.from)! : today
  let to = one(sp.to) && isDateString(one(sp.to)!) ? one(sp.to)! : addDays(today, 6)
  if (to < from) [from, to] = [to, from]
  if (diffDays(to, from) > 366) to = addDays(from, 366)
  const staffId = one(sp.staff) && /^[0-9a-f-]{36}$/i.test(one(sp.staff)!) ? one(sp.staff)! : null
  const status = STATUSES.includes(one(sp.status) as BookingStatus) ? (one(sp.status) as BookingStatus) : null
  const kind = KINDS.includes(one(sp.kind) as BookingKind) ? (one(sp.kind) as BookingKind) : null
  const q = (one(sp.q) ?? '').slice(0, 80)
  return { from, to, staffId, status, kind, q }
}

export function monthRange(date: string, offset = 0) {
  const [y, m] = date.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + offset, 1))
  const last = new Date(Date.UTC(y, m + offset, 0))
  const f = (d: Date) => d.toISOString().slice(0, 10)
  return { from: f(first), to: f(last) }
}
