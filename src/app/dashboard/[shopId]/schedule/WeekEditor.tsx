'use client'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast, errText } from '@/components/dash'
import { addDays, fmtDate, fmtTime, hhmm, parseHHMM, weekday } from '@/lib/tz'
import { pick } from '@/lib/i18n'
import type { Booking, Hours, Shift, Staff } from '@/lib/types'
import type { SpecialDay } from '@/lib/data/schedule'
import { saveWeekAction } from '../actions'

type Cell = { start: number; end: number; breaks: [number, number][] }
type Draft = Record<string, Record<string, Cell>> // date -> staffId -> cell

function toDraft(days: string[], shifts: Shift[], shift = 0): Draft {
  const d: Draft = {}
  for (const day of days) d[day] = {}
  for (const s of shifts) {
    const day = addDays(s.date, shift)
    if (d[day]) d[day][s.staffId] = { start: s.startMin, end: s.endMin, breaks: s.breaks.map(b => [b[0], b[1]]) }
  }
  return d
}

export function WeekEditor({ shopId, week, today, hours, staff, shifts, prevShifts, specials }: {
  shopId: string; week: string; today: string; hours: Hours; staff: Staff[]; shifts: Shift[]; prevShifts: Shift[]; specials: SpecialDay[]
}) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week])
  const [draft, setDraft] = useState<Draft>(() => toDraft(days, shifts))
  const [dirty, setDirty] = useState(false)
  const [conflicts, setConflicts] = useState<Booking[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [view, setView] = useState<'overview' | 'table'>('overview')

  const dayHours = (d: string) => {
    const sp = specials.find(s => s.date === d)
    if (sp) return sp.closed ? null : { open: sp.openMin!, close: sp.closeMin! }
    const h = hours[String(weekday(d))]
    return h && !h.closed ? { open: h.open, close: h.close } : null
  }
  const set = (fn: (d: Draft) => void) => { setDraft(prev => { const next = structuredClone(prev); fn(next); return next }); setDirty(true) }
  const fillDefaults = () => set(d => {
    for (const day of days) {
      d[day] = {}
      for (const st of staff) {
        // no saved default week = the shop's opening hours, which is also what the staff form shows
        const open = dayHours(day)
        const hasDefault = st.defaultWeek && Object.keys(st.defaultWeek).length > 0
        const w = hasDefault ? st.defaultWeek?.[String(weekday(day))] : open ? { start: open.open, end: open.close, breaks: [] } : undefined
        if (w && open) d[day][st.id] = { start: w.start, end: w.end, breaks: (w.breaks ?? []).map(b => [b[0], b[1]]) }
      }
    }
  })
  const save = () => start(async () => {
    setErr(null)
    const rows = days.flatMap(day => Object.entries(draft[day]).map(([staffId, c]) => ({ staffId, date: day, startMin: c.start, endMin: c.end, breaks: c.breaks.filter(b => b[1] > b[0]) })))
    const bad = rows.find(r => !(r.endMin > r.startMin))
    if (bad) { setErr(t('sc.badTime', fmtDate(bad.date, lang))); return }
    const r = await saveWeekAction(shopId, days[0], days[6], rows)
    if (!r.ok) { setErr(errText(t, r.error, r.detail && fmtDate(r.detail, lang))); return }
    setConflicts(r.conflicts)
    setDirty(false)
    toast.show(t('sc.saved'))
    router.refresh()
  })
  const goWeek = (w: string) => {
    if (dirty && !window.confirm(t('sc.unsaved') + '?')) return
    router.push(`?week=${w}`)
  }
  const timeVal = (m: number | undefined) => (m == null ? '' : hhmm(m))

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => goWeek(addDays(week, -7))}>‹ {t('sc.prev')}</button>
        <h2 className="font-display text-[20px] font-extrabold">{t('sc.weekOf', fmtDate(week, lang, { month: 'long', day: 'numeric' }))}</h2>
        <button className="btn btn-sm" onClick={() => goWeek(addDays(week, 7))}>{t('sc.nextWeek')} ›</button>
        <button className="btn btn-sm btn-ghost" onClick={() => goWeek(addDays(today, -((weekday(today) + 6) % 7)))}>{t('sc.thisWeek')}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => set(d => { const p = toDraft(days, prevShifts, 7); for (const day of days) d[day] = p[day] })}>{t('sc.copyPrev')}</button>
        <button className="btn btn-sm" onClick={fillDefaults}>{t('sc.fillDefault')}</button>
        <button className="btn btn-sm btn-ghost" onClick={() => set(d => { for (const day of days) d[day] = {} })}>{t('sc.clear')}</button>
        <span className="flex-1" />
        <div className="seg" role="radiogroup" aria-label={t('sc.view')}>
          <button type="button" role="radio" aria-checked={view === 'overview'} onClick={() => setView('overview')}>{t('sc.overview')}</button>
          <button type="button" role="radio" aria-checked={view === 'table'} onClick={() => setView('table')}>{t('sc.table')}</button>
        </div>
        {dirty && <span className="chip chip-warn">{t('sc.unsaved')}</span>}
        <button className="btn btn-primary btn-sm" disabled={!dirty || pending} onClick={save}>{pending ? '…' : t('sc.saveWeek')}</button>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      {conflicts.length > 0 && (
        <div className="card flex flex-col gap-1 border-warn/40 bg-warn-soft p-3 text-[13.5px] text-warn">
          <b>{t('sc.conflicts', conflicts.length)}</b>
          {conflicts.map(b => <span key={b.id} className="tnum">{fmtDate(b.date, lang)} {fmtTime(b.startMin, lang)}–{fmtTime(b.endMin, lang)} · {pick(lang, staff.find(s => s.id === b.staffId)?.name, staff.find(s => s.id === b.staffId)?.nameZh)} · {b.guestName}</span>)}
        </div>
      )}
      {view === 'overview' && (
        <WeekOverview days={days} today={today} staff={staff} draft={draft} dayHours={dayHours}
          onCell={(d, staffId, cell) => set(x => { if (cell) x[d][staffId] = cell; else delete x[d][staffId] })}
          defaultCell={(d, st) => {
            const w = st.defaultWeek?.[String(weekday(d))]
            const h = dayHours(d) ?? { open: 600, close: 1140 }
            return { start: w?.start ?? h.open, end: w?.end ?? h.close, breaks: (w?.breaks ?? []).map(b => [b[0], b[1]] as [number, number]) }
          }} />
      )}
      {view === 'table' && <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] min-w-[120px] bg-bg">{t('d.staff')}</th>
              {days.map(d => {
                const h = dayHours(d)
                return (
                  <th key={d} className={d === today ? '!text-accent-deep' : ''}>
                    {fmtDate(d, lang)}
                    <div className="text-[11px] font-medium normal-case text-muted">{h ? `${fmtTime(h.open, lang)}–${fmtTime(h.close, lang)}` : t('sc.shopClosed')}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {staff.map(st => (
              <tr key={st.id}>
                <td className="sticky left-0 z-[1] bg-surface"><span className="flex items-center gap-2 font-bold"><span className="nail" style={{ ['--c' as string]: st.color }} />{pick(lang, st.name, st.nameZh)}</span></td>
                {days.map(d => {
                  const c = draft[d]?.[st.id]
                  const id = `${st.id}-${d}`
                  const br = c?.breaks[0]
                  return (
                    <td key={d} className="min-w-[150px] align-top">
                      <label className="chk text-[13px]"><input type="checkbox" id={`on-${id}`} checked={!!c} onChange={e => set(x => {
                        if (e.target.checked) {
                          const w = st.defaultWeek?.[String(weekday(d))]
                          const h = dayHours(d) ?? { open: 600, close: 1140 }
                          x[d][st.id] = { start: w?.start ?? h.open, end: w?.end ?? h.close, breaks: (w?.breaks ?? []).map(b => [b[0], b[1]]) }
                        } else delete x[d][st.id]
                      })} />{t('sc.working')}</label>
                      {c && (
                        <div className="mt-1.5 flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <input type="time" step={900} aria-label={t('c.start')} className="inp inp-sm tnum !px-1" value={timeVal(c.start)} onChange={e => { const m = parseHHMM(e.target.value); if (m != null) set(x => { x[d][st.id].start = m }) }} />
                            <span className="text-muted">–</span>
                            <input type="time" step={900} aria-label={t('c.end')} className="inp inp-sm tnum !px-1" value={timeVal(c.end)} onChange={e => { const m = parseHHMM(e.target.value); if (m != null) set(x => { x[d][st.id].end = m }) }} />
                          </div>
                          <div className="flex items-center gap-1 text-[11.5px] text-muted">
                            <span className="w-7 flex-none">{t('sc.break')}</span>
                            <input type="time" step={900} aria-label={t('sc.break') + ' ' + t('c.start')} className="inp inp-sm tnum !h-[30px] !px-1 !text-[12px]" value={timeVal(br?.[0])}
                              onChange={e => { const m = parseHHMM(e.target.value); set(x => { const cur = x[d][st.id]; const b = cur.breaks[0] ?? [m ?? 0, m ?? 0]; cur.breaks = m == null ? [] : [[m, Math.max(b[1], m)]] }) }} />
                            <span>–</span>
                            <input type="time" step={900} aria-label={t('sc.break') + ' ' + t('c.end')} className="inp inp-sm tnum !h-[30px] !px-1 !text-[12px]" value={timeVal(br?.[1])}
                              onChange={e => { const m = parseHHMM(e.target.value); set(x => { const cur = x[d][st.id]; const b = cur.breaks[0]; cur.breaks = m == null || !b ? [] : [[b[0], m]] }) }} />
                          </div>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {toast.node}
    </section>
  )
}

// ---------------------------------------------------------------- week overview: one band per day, a bar per person, drag the ends

const STEP = 15
function WeekOverview({ days, today, staff, draft, dayHours, onCell, defaultCell }: {
  days: string[]; today: string; staff: Staff[]; draft: Draft; dayHours: (d: string) => { open: number; close: number } | null
  onCell: (d: string, staffId: string, cell: Cell | null) => void; defaultCell: (d: string, st: Staff) => Cell
}) {
  const { t, lang } = useI18n()
  const axis = useMemo(() => {
    let lo = 1440, hi = 0
    for (const d of days) { const h = dayHours(d); if (h) { lo = Math.min(lo, h.open); hi = Math.max(hi, h.close) } for (const c of Object.values(draft[d] ?? {})) { lo = Math.min(lo, c.start); hi = Math.max(hi, c.end) } }
    if (lo >= hi) { lo = 540; hi = 1140 }
    return { start: Math.floor(lo / 60) * 60, end: Math.min(1440, Math.ceil(hi / 60) * 60 + 60) }
  }, [days, draft, dayHours])
  const span = axis.end - axis.start
  const pct = (m: number) => ((m - axis.start) / span) * 100
  const hours: number[] = []
  for (let m = axis.start; m <= axis.end; m += 60) hours.push(m)
  const laneRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<{ d: string; staffId: string; cell: Cell } | null>(null)

  const beginDrag = (e: React.PointerEvent, d: string, st: Staff, cell: Cell, mode: 'start' | 'end' | 'move') => {
    e.preventDefault()
    const row = (e.currentTarget as HTMLElement).closest('[data-lane]') as HTMLElement | null
    if (!row) return
    const rect = row.getBoundingClientRect()
    const perPx = span / rect.width
    const x0 = e.clientX
    const base = { ...cell, breaks: cell.breaks.map(b => [b[0], b[1]] as [number, number]) }
    let last: Cell = base
    const el = e.currentTarget as HTMLElement
    try { el.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    const onMove = (ev: PointerEvent) => {
      const delta = Math.round(((ev.clientX - x0) * perPx) / STEP) * STEP
      let next: Cell
      if (mode === 'start') next = { ...base, start: Math.max(axis.start, Math.min(base.end - STEP, base.start + delta)) }
      else if (mode === 'end') next = { ...base, end: Math.min(axis.end, Math.max(base.start + STEP, base.end + delta)) }
      else {
        const dur = base.end - base.start
        const start = Math.max(axis.start, Math.min(axis.end - dur, base.start + delta))
        next = { start, end: start + dur, breaks: base.breaks.map(b => [b[0] + (start - base.start), b[1] + (start - base.start)] as [number, number]) }
      }
      // keep breaks inside the shift
      next.breaks = next.breaks.filter(b => b[0] >= next.start && b[1] <= next.end)
      last = next
      setLive({ d, staffId: st.id, cell: next })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp)
      setLive(null)
      if (last.start !== base.start || last.end !== base.end) onCell(d, st.id, last)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <div className="card overflow-x-auto p-3">
      <p className="mb-2 text-[12.5px] text-muted">{t('sc.overviewHint')}</p>
      <div className="min-w-[640px]">
        <div className="relative ml-[88px] h-5">
          {hours.map(m => <span key={m} className="tnum absolute -translate-x-1/2 text-[10.5px] text-muted" style={{ left: `${pct(m)}%` }}>{fmtTime(m, lang).replace(/:00/, '')}</span>)}
        </div>
        {days.map(d => {
          const h = dayHours(d)
          return (
            <div key={d} className={`flex border-t border-line-soft py-1.5 ${d === today ? 'bg-accent-soft/40' : ''}`}>
              <div className="w-[88px] flex-none pr-2 text-[12.5px]">
                <b className={d === today ? 'text-accent-deep' : ''}>{fmtDate(d, lang, { weekday: 'short', day: 'numeric' })}</b>
                <div className="tnum text-[10.5px] text-muted">{h ? `${fmtTime(h.open, lang)}–${fmtTime(h.close, lang)}` : t('sc.shopClosed')}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1" ref={laneRef}>
                {staff.map(st => {
                  const stored = draft[d]?.[st.id]
                  const c = live && live.d === d && live.staffId === st.id ? live.cell : stored
                  return (
                    <div key={st.id} data-lane className="relative h-7 rounded-md" style={{ background: h ? 'var(--color-sunk)' : 'repeating-linear-gradient(135deg, #EBEDF1 0 6px, #fff 6px 12px)' }}
                      onClick={e => { if (!c && !(e.target as HTMLElement).closest('[data-bar]')) onCell(d, st.id, defaultCell(d, st)) }} role={c ? undefined : 'button'} aria-label={c ? undefined : `${pick(lang, st.name, st.nameZh)} ${fmtDate(d, lang)} ${t('sc.working')}`}>
                      {h && <span className="pointer-events-none absolute inset-y-0 rounded-md bg-surface" style={{ left: `${pct(h.open)}%`, width: `${pct(h.close) - pct(h.open)}%` }} />}
                      {hours.map(m => <span key={m} className="pointer-events-none absolute inset-y-0 border-l border-line-soft" style={{ left: `${pct(m)}%` }} />)}
                      {!c && <span className="pointer-events-none absolute inset-0 flex items-center pl-2 text-[11px] text-muted">{pick(lang, st.name, st.nameZh)} · {t('sc.tapToAdd')}</span>}
                      {c && (
                        <div data-bar className="absolute inset-y-0 flex select-none items-center rounded-md text-[11.5px] font-semibold text-white shadow-sm" style={{ left: `${pct(c.start)}%`, width: `${Math.max(2, pct(c.end) - pct(c.start))}%`, background: st.color, touchAction: 'none' }}>
                          <span className="absolute inset-y-0 left-0 w-3 cursor-ew-resize rounded-l-md bg-black/15" onPointerDown={e => beginDrag(e, d, st, c, 'start')} aria-label={t('c.start')} role="slider" aria-valuenow={c.start} tabIndex={0}
                            onKeyDown={e => { if (e.key === 'ArrowLeft') onCell(d, st.id, { ...c, start: Math.max(axis.start, c.start - STEP) }); if (e.key === 'ArrowRight') onCell(d, st.id, { ...c, start: Math.min(c.end - STEP, c.start + STEP) }) }} />
                          <span className="min-w-0 flex-1 cursor-grab truncate px-3.5 active:cursor-grabbing" onPointerDown={e => beginDrag(e, d, st, c, 'move')}>
                            {pick(lang, st.name, st.nameZh)} <span className="tnum font-normal opacity-90">{fmtTime(c.start, lang)}–{fmtTime(c.end, lang)}</span>
                          </span>
                          {c.breaks.map(b => <span key={b[0]} className="pointer-events-none absolute inset-y-1 rounded-sm bg-white/55" style={{ left: `${((b[0] - c.start) / (c.end - c.start)) * 100}%`, width: `${((b[1] - b[0]) / (c.end - c.start)) * 100}%` }} />)}
                          <button type="button" className="absolute right-3.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-[12px] leading-none group-hover:grid sm:grid" aria-label={t('c.delete')} onClick={e => { e.stopPropagation(); onCell(d, st.id, null) }}>×</button>
                          <span className="absolute inset-y-0 right-0 w-3 cursor-ew-resize rounded-r-md bg-black/15" onPointerDown={e => beginDrag(e, d, st, c, 'end')} aria-label={t('c.end')} role="slider" aria-valuenow={c.end} tabIndex={0}
                            onKeyDown={e => { if (e.key === 'ArrowLeft') onCell(d, st.id, { ...c, end: Math.max(c.start + STEP, c.end - STEP) }); if (e.key === 'ArrowRight') onCell(d, st.id, { ...c, end: Math.min(axis.end, c.end + STEP) }) }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
