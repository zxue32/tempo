'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { addDays, fmtDate, fmtTime, weekday } from '@/lib/tz'
import type { Industry } from '@/lib/types'

type DaySum = { date: string; closed: boolean; count: number }
type Choice = { id: string; name: string; color: string; photoUrl: string | null }

export function ManageActions({ token, today, maxDays, industry, single, currentStaff, anyAllowed, choices }: {
  token: string; today: string; maxDays: number; industry: Industry; single: boolean; currentStaff: string | null; anyAllowed: boolean; choices: Choice[]
}) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'resched' | 'cancel'>('idle')
  const [staffId, setStaffId] = useState<string | null | undefined>(single ? currentStaff : undefined)
  const [from, setFrom] = useState(today)
  const [date, setDate] = useState<string | null>(null)
  const [days, setDays] = useState<DaySum[]>([])
  const [slots, setSlots] = useState<number[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [start, setStart] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const word = t(`staffWord.${industry}`)

  const post = (body: object) => fetch(`/api/manage/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
  const reqSeq = useRef(0)
  const load = useCallback(async () => {
    const seq = ++reqSeq.current
    const r = await post({ action: 'availability', from, days: 14, date, staffId })
    if (seq !== reqSeq.current) return
    if (!r.ok) { setMsg(r.data.error === 'cutoff' ? t('mg.tooLateShort') : t('c.error')); return }
    setDays(r.data.days); setSlots(r.data.slots.map((s: { start: number }) => s.start)); setNext(r.data.next)
    if (!date) { const f = (r.data.days as DaySum[]).find(d => d.count > 0); setDate(f ? f.date : from) }
  }, [from, date, staffId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (mode === 'resched') load() }, [mode, load])

  const wd = t('c.weekdays').split(',')
  const last = addDays(today, maxDays)
  const strip = Array.from({ length: 14 }, (_, i) => addDays(from, i)).filter(d => d <= last)

  if (mode === 'idle') {
    return (
      <div className="flex flex-col gap-3">
        {done && <p className="s-card px-4 py-3 text-[14px] font-semibold" role="status">✓ {t('mg.rescheduled')}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="s-btn" onClick={() => { setMode('resched'); setMsg(null); setDone(false); setDate(null); setStart(null) }}>{t('mg.reschedule')}</button>
          <button type="button" className="s-btn s-btn-ghost" onClick={() => { setMode('cancel'); setMsg(null); setDone(false) }}>{t('mg.cancel')}</button>
        </div>
      </div>
    )
  }

  if (mode === 'cancel') {
    return (
      <div className="s-card flex flex-col gap-3 p-4">
        <label className="s-lbl" htmlFor="mg-reason">{t('mg.cancelReason')}</label>
        <textarea id="mg-reason" className="s-inp" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} />
        {msg && <p className="text-[14px] font-semibold" style={{ color: '#C2362B' }} role="alert">{msg}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="s-btn" disabled={busy} onClick={async () => {
            setBusy(true)
            const r = await post({ action: 'cancel', reason })
            setBusy(false)
            if (r.ok) router.refresh()
            else setMsg(r.data.error === 'cutoff' ? t('mg.tooLateShort') : t('c.error'))
          }}>{busy ? '…' : t('mg.confirmCancel')}</button>
          <button type="button" className="s-btn s-btn-ghost" onClick={() => setMode('idle')}>{t('mg.keep')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="s-card flex flex-col gap-4 p-4">
      <b>{t('mg.newTime')}</b>
      {single && choices.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={t('bf.who', word)}>
          {anyAllowed && <Chip on={staffId === null} label={t('bf.any', word)} onClick={() => { setStaffId(null); setStart(null); setDate(null) }} />}
          {choices.map(c => <Chip key={c.id} on={staffId === c.id} label={c.name} color={c.color} onClick={() => { setStaffId(c.id); setStart(null); setDate(null) }} />)}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" className="s-btn s-btn-ghost s-btn-sm" disabled={from <= today} onClick={() => { const f = addDays(from, -14); setFrom(f < today ? today : f); setDate(null); setStart(null) }} aria-label="Earlier">‹</button>
        <button type="button" className="s-btn s-btn-ghost s-btn-sm" disabled={addDays(from, 14) > last} onClick={() => { setFrom(addDays(from, 14)); setDate(null); setStart(null) }} aria-label="Later">›</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={t('c.date')}>
        {strip.map(d => {
          const s = days.find(x => x.date === d)
          const on = d === date
          return (
            <button key={d} type="button" role="radio" aria-checked={on} onClick={() => { setDate(d); setStart(null) }}
              className="flex w-[60px] flex-none flex-col items-center rounded-xl border py-2" style={on ? { background: 'var(--s-ink)', color: 'var(--s-bg)', borderColor: 'var(--s-ink)' } : { borderColor: 'var(--s-line)', opacity: s && !s.count ? 0.55 : 1 }}>
              <span className="text-[11px] font-bold uppercase opacity-80">{d === today ? t('c.today') : wd[weekday(d)]}</span>
              <span className="s-display text-[20px]">{+d.slice(8)}</span>
              <span className="h-4 text-[11px] opacity-80">{s ? (s.closed ? t('c.closed') : s.count ? t('bf.slotsN', s.count) : t('bf.full')) : ''}</span>
            </button>
          )
        })}
      </div>
      {slots.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map(s => <button key={s} type="button" className="s-pill" aria-pressed={start === s} onClick={() => setStart(s)}>{fmtTime(s, lang)}</button>)}
        </div>
      ) : date ? (
        <div className="flex flex-col items-start gap-2 text-[14px]">
          <p className="s-muted">{t('bf.noSlots', '')}</p>
          {next && <button type="button" className="s-btn s-btn-sm" onClick={() => { setFrom(next); setDate(next); setStart(null) }}>{t('bf.nextAvailable', fmtDate(next, lang))}</button>}
        </div>
      ) : null}
      {msg && <p className="text-[14px] font-semibold" style={{ color: '#C2362B' }} role="alert">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="s-btn" disabled={busy || start == null || !date} onClick={async () => {
          if (start == null || !date) return
          setBusy(true)
          const r = await post({ action: 'reschedule', date, start, staffId })
          setBusy(false)
          if (r.ok) { setMode('idle'); setDone(true); router.refresh() }
          else if (r.data.error === 'taken') { setMsg(t('bf.slotGone')); setStart(null); load() }
          else setMsg(t('c.error'))
        }}>{busy ? '…' : start != null && date ? t('mg.saveResched', `${fmtDate(date, lang)} ${fmtTime(start, lang)}`) : t('mg.reschedule')}</button>
        <button type="button" className="s-btn s-btn-ghost" onClick={() => setMode('idle')}>{t('c.back')}</button>
      </div>
    </div>
  )
}

function Chip({ on, label, color, onClick }: { on: boolean; label: string; color?: string; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className="flex h-10 flex-none items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-semibold"
      style={on ? { borderColor: 'var(--s-accent)', boxShadow: 'inset 0 0 0 1px var(--s-accent)', background: 'var(--s-soft)' } : { borderColor: 'var(--s-line)' }}>
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}{label}
    </button>
  )
}
