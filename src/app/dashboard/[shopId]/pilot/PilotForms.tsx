'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast } from '@/components/dash'
import type { PilotBaseline } from '@/lib/types'
import { savePilotAction, runIntegrityAction, applyDurationAction, removeWaitlistAction } from '../actions'

const toNum = (s: string) => (s.trim() === '' ? null : Number.isFinite(+s) ? +s : null)
const toStr = (n: number | null | undefined) => (n == null ? '' : String(n))

export function BaselineForm({ shopId, baseline }: { shopId: string; baseline: PilotBaseline }) {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(!baseline.noShowPct && !baseline.callsPerDay && !baseline.onlinePct)
  const [v, setV] = useState({ from: baseline.from ?? '', to: baseline.to ?? '', noShowPct: toStr(baseline.noShowPct), callsPerDay: toStr(baseline.callsPerDay), callsNow: toStr(baseline.callsNow), onlinePct: toStr(baseline.onlinePct), idleHoursPerDay: toStr(baseline.idleHoursPerDay), notes: baseline.notes ?? '' })
  const [pending, start] = useTransition()
  const [err, setErr] = useState(false)
  if (!open) return <button className="btn btn-sm self-start" onClick={() => setOpen(true)}>{t('pi.editBaseline')}</button>
  const save = () => start(async () => {
    setErr(false)
    const r = await savePilotAction(shopId, {
      ...baseline, from: v.from || undefined, to: v.to || undefined, noShowPct: toNum(v.noShowPct), callsPerDay: toNum(v.callsPerDay), callsNow: toNum(v.callsNow),
      onlinePct: toNum(v.onlinePct), idleHoursPerDay: toNum(v.idleHoursPerDay), notes: v.notes || null,
    })
    if (!r.ok) { setErr(true); return }
    toast.show(t('c.saved')); setOpen(false); router.refresh()
  })
  const F = ({ k, label, hint }: { k: keyof typeof v; label: string; hint?: string }) => (
    <div><label className="lbl" htmlFor={`pb-${k}`}>{label}</label><input id={`pb-${k}`} className="inp inp-sm tnum" inputMode="decimal" value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} />{hint && <p className="hint">{hint}</p>}</div>
  )
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-bg p-4">
      <b className="text-[14.5px]">{t('pi.baselineTitle')}</b>
      <p className="text-[13px] text-muted">{t('pi.baselineD')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="lbl" htmlFor="pb-from">{t('pi.bFrom')}</label><input id="pb-from" type="date" className="inp inp-sm tnum" value={v.from} onChange={e => setV({ ...v, from: e.target.value })} /></div>
        <div><label className="lbl" htmlFor="pb-to">{t('pi.bTo')}</label><input id="pb-to" type="date" className="inp inp-sm tnum" value={v.to} onChange={e => setV({ ...v, to: e.target.value })} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {F({ k: 'noShowPct', label: t('pi.bNoShow'), hint: t('pi.bNoShowH') })}
        {F({ k: 'onlinePct', label: t('pi.bOnline'), hint: t('pi.bOnlineH') })}
        {F({ k: 'idleHoursPerDay', label: t('pi.bIdle'), hint: t('pi.bIdleH') })}
        {F({ k: 'callsPerDay', label: t('pi.bCalls'), hint: t('pi.bCallsH') })}
        {F({ k: 'callsNow', label: t('pi.bCallsNow'), hint: t('pi.bCallsNowH') })}
      </div>
      <div><label className="lbl" htmlFor="pb-notes">{t('c.notes')}</label><textarea id="pb-notes" className="inp" rows={2} value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} /></div>
      {err && <p className="err">{t('c.error')}</p>}
      <div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending} onClick={save}>{t('c.save')}</button><button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>{t('c.cancel')}</button></div>
      {toast.node}
    </div>
  )
}

export function DoubleRunLog({ shopId, baseline, today }: { shopId: string; baseline: PilotBaseline; today: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [date, setDate] = useState(today)
  const [diffs, setDiffs] = useState('0')
  const [note, setNote] = useState('')
  const [pending, start] = useTransition()
  const checks = (baseline.checks ?? []).slice().sort((a, b) => b.date.localeCompare(a.date))
  const write = (next: NonNullable<PilotBaseline['checks']>) => start(async () => {
    await savePilotAction(shopId, { ...baseline, noShowPct: baseline.noShowPct ?? null, callsPerDay: baseline.callsPerDay ?? null, onlinePct: baseline.onlinePct ?? null, idleHoursPerDay: baseline.idleHoursPerDay ?? null, notes: baseline.notes ?? null, checks: next })
    router.refresh()
  })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="lbl" htmlFor="dr-date">{t('c.date')}</label><input id="dr-date" type="date" className="inp inp-sm tnum" value={date} max={today} onChange={e => setDate(e.target.value)} /></div>
        <div><label className="lbl" htmlFor="dr-diffs">{t('pi.diffs')}</label><input id="dr-diffs" type="number" min={0} className="inp inp-sm tnum !w-24" value={diffs} onChange={e => setDiffs(e.target.value)} /></div>
        <div className="min-w-[200px] flex-1"><label className="lbl" htmlFor="dr-note">{t('pi.diffNote')}</label><input id="dr-note" className="inp inp-sm" value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder={t('pi.diffNotePh')} /></div>
        <button className="btn btn-sm btn-primary" disabled={pending || !date} onClick={() => write([...checks.filter(c => c.date !== date), { date, diffs: Math.max(0, Math.round(+diffs || 0)), note: note || null }])}>{t('pi.record')}</button>
      </div>
      {checks.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13.5px]">
          {checks.slice(0, 21).map(c => (
            <li key={c.date} className="flex items-center gap-3">
              <span className="tnum w-24">{c.date}</span>
              <b className={c.diffs === 0 ? 'text-ok' : 'text-bad'}>{c.diffs === 0 ? '✓ ' + t('pi.match') : t('pi.diffCount', c.diffs)}</b>
              <span className="min-w-0 flex-1 truncate text-muted">{c.note}</span>
              <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => write(checks.filter(x => x.date !== c.date))}>{t('c.delete')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function RunCheck({ shopId }: { shopId: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()
  return <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => { await runIntegrityAction(shopId); router.refresh() })}>{pending ? '…' : t('pi.runNow')}</button>
}

export function ApplyDuration({ shopId, staffId, serviceId, minutes }: { shopId: string; staffId: string; serviceId: string; minutes: number }) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()
  return <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => { await applyDurationAction(shopId, staffId, serviceId, minutes); router.refresh() })}>{t('pi.apply', minutes)}</button>
}

export function RemoveWaiting({ shopId, id }: { shopId: string; id: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()
  return <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => start(async () => { await removeWaitlistAction(shopId, id); router.refresh() })}>{t('pi.remove')}</button>
}
