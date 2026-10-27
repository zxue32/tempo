// Time-zone helpers built on Intl only (no dependency).
// A shop works in "local date" (YYYY-MM-DD) + "minutes since local midnight".

const dtfCache = new Map<string, Intl.DateTimeFormat>()
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'short',
    })
    dtfCache.set(tz, f)
  }
  return f
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

export function zonedParts(instant: Date, tz: string): ZonedParts {
  const p: Record<string, string> = {}
  for (const part of dtf(tz).formatToParts(instant)) p[part.type] = part.value
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour % 24, minute: +p.minute, second: +p.second,
  }
}

/** Offset of tz at this instant, in minutes (local - UTC). */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000)
}

export const pad2 = (n: number) => String(n).padStart(2, '0')

export function parseDate(d: string): { y: number; m: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) throw new Error('bad date ' + d)
  return { y: +m[1], m: +m[2], day: +m[3] }
}

export function isDateString(d: unknown): d is string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const { y, m, day } = parseDate(d)
  const t = new Date(Date.UTC(y, m - 1, day))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day
}

/** Local wall time (date + minutes) in tz -> the UTC instant. Times skipped by DST move forward. */
export function zonedToUtc(date: string, minutes: number, tz: string): Date {
  const { y, m, day } = parseDate(date)
  const guess = Date.UTC(y, m - 1, day, 0, 0) + minutes * 60000
  const off1 = tzOffsetMinutes(new Date(guess), tz)
  const t1 = guess - off1 * 60000
  const off2 = tzOffsetMinutes(new Date(t1), tz)
  if (off2 === off1) return new Date(t1)
  const t2 = guess - off2 * 60000
  const hits = (t: number) => {
    const z = utcToZoned(new Date(t), tz)
    return z.date === date && z.min === minutes
  }
  const ok1 = hits(t1), ok2 = hits(t2)
  if (ok1 && ok2) return new Date(Math.min(t1, t2)) // repeated hour: first occurrence
  if (ok1) return new Date(t1)
  if (ok2) return new Date(t2)
  return new Date(Math.max(t1, t2)) // skipped hour: move forward
}

/** UTC instant -> local date + minutes in tz. */
export function utcToZoned(instant: Date, tz: string): { date: string; min: number } {
  const p = zonedParts(instant, tz)
  return { date: `${p.year}-${pad2(p.month)}-${pad2(p.day)}`, min: p.hour * 60 + p.minute }
}

export function nowInZone(tz: string, now: Date = new Date()): { date: string; min: number } {
  return utcToZoned(now, tz)
}

export function dayIndex(d: string): number {
  const { y, m, day } = parseDate(d)
  return Math.round(Date.UTC(y, m - 1, day) / 86400000)
}
export function fromDayIndex(i: number): string {
  return new Date(i * 86400000).toISOString().slice(0, 10)
}
export const addDays = (d: string, n: number) => fromDayIndex(dayIndex(d) + n)
export const diffDays = (a: string, b: string) => dayIndex(a) - dayIndex(b)
/** 0 = Sunday … 6 = Saturday */
export function weekday(d: string): number {
  const { y, m, day } = parseDate(d)
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay()
}
/** Monday of the week containing d */
export const mondayOf = (d: string) => addDays(d, -((weekday(d) + 6) % 7))

export function hhmm(min: number): string {
  return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60)
}
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
  if (!m) return null
  const h = +m[1], mi = +m[2]
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null
  return h * 60 + mi
}

export function fmtTime(min: number, lang: 'zh' | 'en'): string {
  if (lang === 'zh') return hhmm(min)
  const h = Math.floor(min / 60) % 24
  const mm = min % 60
  return `${((h + 11) % 12) + 1}:${pad2(mm)} ${h >= 12 ? 'PM' : 'AM'}`
}
export function fmtTimeShort(min: number, lang: 'zh' | 'en'): string {
  if (lang === 'zh') return hhmm(min)
  const h = Math.floor(min / 60) % 24
  const mm = min % 60
  return `${((h + 11) % 12) + 1}${mm ? ':' + pad2(mm) : ''}${h >= 12 ? 'p' : 'a'}`
}

export function fmtDate(d: string, lang: 'zh' | 'en', opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
  const { y, m, day } = parseDate(d)
  return new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'UTC', ...opts })
}

export function fmtDuration(min: number, lang: 'zh' | 'en'): string {
  const h = Math.floor(min / 60), m = min % 60
  if (lang === 'zh') return (h ? `${h}小时` : '') + (m || !h ? `${m}分钟` : '')
  return [h ? `${h} h` : '', m || !h ? `${m} min` : ''].filter(Boolean).join(' ')
}
