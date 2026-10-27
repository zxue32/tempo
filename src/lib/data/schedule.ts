import 'server-only'
import { sql } from '../db'
import type { Shift, Break, Hours, DayHours } from '../types'
import { weekday } from '../tz'

export async function shiftsInRange(shopId: string, from: string, to: string): Promise<Shift[]> {
  const rows = await sql<Shift[]>`
    select staff_id, date, start_min, end_min, breaks from app.shifts
    where shop_id = ${shopId} and date between ${from} and ${to}
  `
  return rows.map(r => ({ ...r, breaks: (r.breaks as Break[]) ?? [] }))
}

export function cleanBreaks(breaks: unknown, start: number, end: number): Break[] {
  if (!Array.isArray(breaks)) return []
  const out: Break[] = []
  for (const b of breaks) {
    if (!Array.isArray(b) || b.length !== 2) continue
    const s = Math.max(start, Math.round(Number(b[0])))
    const e = Math.min(end, Math.round(Number(b[1])))
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) out.push([s, e])
  }
  return out.sort((a, b) => a[0] - b[0])
}

/** Replace all shifts for the shop between from..to (inclusive) with `rows`. */
export async function saveShifts(shopId: string, from: string, to: string, rows: Shift[]) {
  await sql.begin(async tx => {
    const staffIds = new Set((await tx<{ id: string }[]>`select id from app.staff where shop_id = ${shopId}`).map(r => r.id))
    await tx`delete from app.shifts where shop_id = ${shopId} and date between ${from} and ${to}`
    for (const r of rows) {
      if (!staffIds.has(r.staffId) || r.date < from || r.date > to) continue
      if (!(r.endMin > r.startMin) || r.startMin < 0 || r.endMin > 1440) continue
      await tx`
        insert into app.shifts (shop_id, staff_id, date, start_min, end_min, breaks)
        values (${shopId}, ${r.staffId}, ${r.date}, ${r.startMin}, ${r.endMin}, ${sql.json(cleanBreaks(r.breaks, r.startMin, r.endMin))})
      `
    }
  })
}

export type SpecialDay = { date: string; closed: boolean; openMin: number | null; closeMin: number | null; note: string | null }

export async function listSpecialDays(shopId: string, from?: string): Promise<SpecialDay[]> {
  return sql<SpecialDay[]>`
    select date, closed, open_min, close_min, note from app.special_days
    where shop_id = ${shopId} ${from ? sql`and date >= ${from}` : sql``} order by date
  `
}

export async function upsertSpecialDay(shopId: string, d: SpecialDay) {
  await sql`
    insert into app.special_days (shop_id, date, closed, open_min, close_min, note)
    values (${shopId}, ${d.date}, ${d.closed}, ${d.closed ? null : d.openMin}, ${d.closed ? null : d.closeMin}, ${d.note})
    on conflict (shop_id, date) do update set closed = excluded.closed, open_min = excluded.open_min,
      close_min = excluded.close_min, note = excluded.note
  `
}

export async function deleteSpecialDay(shopId: string, date: string) {
  await sql`delete from app.special_days where shop_id = ${shopId} and date = ${date}`
}

/** Opening hours for one date: special day overrides the weekly hours. null = closed. */
export function hoursOn(hours: Hours, specials: Map<string, SpecialDay>, date: string): { open: number; close: number } | null {
  const sp = specials.get(date)
  if (sp) return sp.closed || sp.openMin == null || sp.closeMin == null ? null : { open: sp.openMin, close: sp.closeMin }
  const h: DayHours | undefined = hours[String(weekday(date))]
  if (!h || h.closed || !(h.close > h.open)) return null
  return { open: h.open, close: h.close }
}
