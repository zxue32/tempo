'use client'
import { useMemo, useState, useTransition } from 'react'
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
        const w = st.defaultWeek?.[String(weekday(day))]
        if (w && dayHours(day)) d[day][st.id] = { start: w.start, end: w.end, breaks: (w.breaks ?? []).map(b => [b[0], b[1]]) }
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
      <div className="tbl-wrap">
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
      </div>
      {toast.node}
    </section>
  )
}
