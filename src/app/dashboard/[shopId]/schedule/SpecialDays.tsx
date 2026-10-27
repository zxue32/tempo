'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { errText } from '@/components/dash'
import { fmtDate, fmtTime, hhmm, parseHHMM } from '@/lib/tz'
import type { SpecialDay } from '@/lib/data/schedule'
import { saveSpecialDayAction, deleteSpecialDayAction } from '../actions'

export function SpecialDays({ shopId, today, specials }: { shopId: string; today: string; specials: SpecialDay[] }) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const [date, setDate] = useState('')
  const [closed, setClosed] = useState(true)
  const [open, setOpen] = useState(600)
  const [close, setClose] = useState(1020)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-[20px] font-extrabold">{t('sc.special')}</h2>
        <p className="text-[13.5px] text-muted">{t('sc.specialHint')}</p>
      </div>
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div><label className="lbl" htmlFor="sp-date">{t('c.date')}</label><input id="sp-date" type="date" min={today} className="inp" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="seg" role="radiogroup">
          <button type="button" role="radio" aria-checked={closed} onClick={() => setClosed(true)}>{t('sc.specialClosed')}</button>
          <button type="button" role="radio" aria-checked={!closed} onClick={() => setClosed(false)}>{t('sc.specialHours')}</button>
        </div>
        {!closed && (
          <div className="flex items-center gap-1">
            <input type="time" step={900} aria-label={t('c.start')} className="inp !w-auto tnum" value={hhmm(open)} onChange={e => { const m = parseHHMM(e.target.value); if (m != null) setOpen(m) }} />
            <span>–</span>
            <input type="time" step={900} aria-label={t('c.end')} className="inp !w-auto tnum" value={hhmm(close)} onChange={e => { const m = parseHHMM(e.target.value); if (m != null) setClose(m) }} />
          </div>
        )}
        <div className="min-w-[200px] flex-1"><label className="lbl" htmlFor="sp-note">{t('sc.specialNote')}</label><input id="sp-note" className="inp" value={note} onChange={e => setNote(e.target.value)} maxLength={120} /></div>
        <button className="btn btn-primary" disabled={!date || pending} onClick={() => start(async () => {
          setErr(null)
          const r = await saveSpecialDayAction(shopId, { date, closed, openMin: closed ? null : open, closeMin: closed ? null : close, note: note || null })
          if (!r.ok) { setErr(errText(t, r.error, fmtDate(date, lang))); return }
          setDate(''); setNote(''); router.refresh()
        })}>{t('sc.addSpecial')}</button>
      </div>
      {err && <p className="err">{err}</p>}
      {specials.length === 0 ? <p className="text-[14px] text-muted">{t('sc.noSpecial')}</p> : (
        <ul className="flex flex-col gap-2">
          {specials.map(s => (
            <li key={s.date} className="card flex flex-wrap items-center gap-3 px-4 py-2.5 text-[14px]">
              <b className="tnum">{fmtDate(s.date, lang, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</b>
              <span className={s.closed ? 'chip chip-warn' : 'chip'}>{s.closed ? t('c.closed') : `${fmtTime(s.openMin!, lang)}–${fmtTime(s.closeMin!, lang)}`}</span>
              {s.note && <span className="text-muted">{s.note}</span>}
              <span className="flex-1" />
              <button className="btn btn-sm btn-ghost btn-danger" onClick={() => start(async () => { await deleteSpecialDayAction(shopId, s.date); router.refresh() })}>{t('c.delete')}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
