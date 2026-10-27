import 'server-only'
import { sql } from './db'
import { loadCatalog } from './data/catalog'
import { buildDays } from './availability'
import { blocker, guestDuration, guestResources, qualifies, resourceConflict, type GuestRequest } from './engine'
import { isDateString, weekday } from './tz'
import type { Shop } from './types'

export type ReplayWhy = 'bad_row' | 'unknown_staff' | 'unknown_service' | 'skill' | 'closed' | 'off' | 'shift' | 'break' | 'booked' | 'resource' | 'invalid' | 'reserve' | 'gap'
export type ReplayResult = {
  total: number
  fit: number
  problems: Array<{ line: number; date: string; start: number; staff: string; services: string; why: ReplayWhy; detail?: string }>
  durations: Array<{ line: number; staff: string; service: string; booked: number; actual: number }>
  usedDefaultRoster: string[]
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

function parseTime(s: string): number | null {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/)
  if (!m) return null
  let h = +m[1]
  const min = m[2] ? +m[2] : 0
  if (m[3]?.startsWith('p') && h < 12) h += 12
  if (m[3]?.startsWith('a') && h === 12) h = 0
  return h < 24 && min < 60 ? h * 60 + min : null
}
function parseDate(s: string): string | null {
  const t: string = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return isDateString(t) ? t : null
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return isDateString(d) ? d : null
}
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true
    else if (c === ',' || c === '\t') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

/**
 * Replays a shop's real past visits (typed from the paper book) through today's rules, into empty days.
 * Every visit that actually happened should fit. Anything that doesn't points at a wrong setting.
 * CSV columns: date, start, end (optional), staff, services (joined with +)
 */
export async function replayPaperBook(shop: Shop, text: string): Promise<ReplayResult> {
  const catalog = await loadCatalog(shop.id)
  const lines = text.split(/\r?\n/).map((l, i) => ({ n: i + 1, cells: splitCsvLine(l) })).filter(l => l.cells.some(c => c.trim()))
  if (lines.length && !parseDate(lines[0].cells[0] ?? '')) lines.shift() // header
  const staffBy = new Map<string, string>()
  for (const s of catalog.staff) { staffBy.set(norm(s.name), s.id); if (s.nameZh) staffBy.set(norm(s.nameZh), s.id) }
  const svcBy = new Map<string, string>()
  for (const s of catalog.services) { svcBy.set(norm(s.name), s.id); if (s.nameZh) svcBy.set(norm(s.nameZh), s.id) }

  const result: ReplayResult = { total: 0, fit: 0, problems: [], durations: [], usedDefaultRoster: [] }
  type Row = { line: number; date: string; start: number; end: number | null; staffRaw: string; svcRaw: string; staffId?: string; ids: string[] }
  const rows: Row[] = []
  for (const l of lines.slice(0, 3000)) {
    const [d, st, en, who, what] = l.cells
    result.total++
    const date = parseDate(d ?? ''), start = parseTime(st ?? ''), end = en?.trim() ? parseTime(en) : null
    if (!date || start == null || !who?.trim() || !what?.trim()) { result.problems.push({ line: l.n, date: d ?? '', start: start ?? 0, staff: who ?? '', services: what ?? '', why: 'bad_row' }); continue }
    rows.push({ line: l.n, date, start, end, staffRaw: who.trim(), svcRaw: what.trim(), staffId: staffBy.get(norm(who)), ids: what.split('+').map(x => svcBy.get(norm(x)) ?? '') })
  }
  const dates = Array.from(new Set(rows.map(r => r.date))).sort()
  const days = dates.length ? await buildDays(sql, shop, catalog, dates, { forCustomers: false }) : []
  for (const day of days) {
    for (const st of day.staff) {
      st.busy = []
      if (!st.shift) {
        const w = catalog.staff.find(s => s.id === st.id)?.defaultWeek?.[String(weekday(day.date))]
        if (w) { st.shift = { start: w.start, end: w.end, breaks: (w.breaks ?? []) as Array<[number, number]> }; if (!result.usedDefaultRoster.includes(day.date)) result.usedDefaultRoster.push(day.date) }
      }
    }
    for (const r of day.resources?.values() ?? []) r.busy = []
    const todays = rows.filter(r => r.date === day.date).sort((a, b) => a.start - b.start)
    for (const r of todays) {
      const fail = (why: ReplayWhy, detail?: string) => result.problems.push({ line: r.line, date: r.date, start: r.start, staff: r.staffRaw, services: r.svcRaw, why, detail })
      const st = day.staff.find(s => s.id === r.staffId)
      if (!st) { fail('unknown_staff', r.staffRaw); continue }
      const missing = r.svcRaw.split('+').filter((_, i) => !r.ids[i])
      if (missing.length) { fail('unknown_service', missing.join(', ')); continue }
      const guest: GuestRequest = {
        serviceIds: r.ids.filter(id => day.services.get(id)?.kind === 'service'),
        addonIds: r.ids.filter(id => day.services.get(id)?.kind === 'addon'),
        staffId: st.id,
      }
      if (!guest.serviceIds.length) { fail('unknown_service', r.svcRaw); continue }
      if (!qualifies(st, guest)) { fail('skill'); continue }
      const dur = guestDuration(day, st, guest)!
      if (r.end != null && r.end > r.start && guest.serviceIds.length === 1 && !guest.addonIds.length && Math.abs(r.end - r.start - dur) >= 15) {
        result.durations.push({ line: r.line, staff: r.staffRaw, service: r.svcRaw, booked: dur, actual: r.end - r.start })
      }
      const why = blocker(day, st, r.start, dur)
      if (why) { fail(why); continue }
      const res = guestResources(day, guest)
      const end = r.start + dur + day.buffer
      if (resourceConflict(day, [{ start: r.start, end, resourceIds: res }])) { fail('resource'); continue }
      const id = `replay-${r.line}`
      st.busy.push([r.start, end, id])
      for (const rid of res) day.resources!.get(rid)!.busy.push([r.start, end, id])
      result.fit++
    }
  }
  return result
}
