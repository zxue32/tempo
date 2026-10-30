'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast, errText } from '@/components/dash'
import { BookingStatusChip, money } from '@/components/ui'
import { pick, type DictKey } from '@/lib/i18n'
import { fmtDate, fmtTime, addDays } from '@/lib/tz'
import type { TimelineEntry } from '@/lib/data/crm'
import type { Shop } from '@/lib/types'
import { addNoteAction, deleteNoteAction, scheduleFollowUpAction } from '../../actions'

type Serial<T> = T extends { at: Date } ? Omit<T, 'at'> & { at: string } : never
type Entry = Serial<TimelineEntry>
type Props = { shopId: string; customerId: string; entries: Entry[]; today: string; staffNames: Record<string, string>; showPrices: boolean; currency: Shop['currency']; rebookDays: number; openFollowUp: { due: string; reason: string } | null }

const KINDS = ['note', 'call', 'message', 'visit'] as const
const REASONS = ['rebook', 'lapsed', 'birthday', 'custom'] as const
const ICON: Record<string, string> = { note: '✎', call: '☎', message: '✉', visit: '●', follow_up: '↻' }

/** Bookings, notes, calls and follow-ups in one list, with the quick "log" box and "schedule a follow-up" above it. */
export function Timeline({ shopId, customerId, entries, today, staffNames, showPrices, currency, rebookDays, openFollowUp }: Props) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [kind, setKind] = useState<(typeof KINDS)[number]>('note')
  const [body, setBody] = useState('')
  const [fu, setFu] = useState(false)
  const [due, setDue] = useState(addDays(today, Math.max(1, rebookDays)))
  const [reason, setReason] = useState<(typeof REASONS)[number]>('rebook')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const log = () => start(async () => {
    setErr(null)
    const r = await addNoteAction(shopId, customerId, kind, body)
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    setBody(''); toast.show(t('c.saved')); router.refresh()
  })
  const schedule = () => start(async () => {
    setErr(null)
    const r = await scheduleFollowUpAction(shopId, customerId, { due, reason, note: note.trim() || null })
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    setFu(false); setNote(''); toast.show(t('cu.followUpScheduled')); router.refresh()
  })
  const remove = (id: string) => start(async () => {
    const r = await deleteNoteAction(shopId, id)
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    router.refresh()
  })
  const dateOf = (iso: string) => fmtDate(iso.slice(0, 10), lang, iso.slice(0, 4) === today.slice(0, 4) ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px] font-bold">{t('cu.timeline')}</h2>
        {openFollowUp
          ? <Link href={`/dashboard/${shopId}/customers/followups`} className="chip chip-accent h-7 text-[13px] no-underline">↻ {t('cu.followUpDue')} {fmtDate(openFollowUp.due, lang)} · {t(`cu.reason.${openFollowUp.reason}` as DictKey)}</Link>
          : <button type="button" className="btn btn-sm" onClick={() => setFu(v => !v)} aria-expanded={fu}>↻ {t('cu.followUp')}</button>}
      </div>
      {fu && !openFollowUp && (
        <div className="card flex flex-col gap-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="lbl" htmlFor="fu-due">{t('cu.followUpDue')}</label><input id="fu-due" type="date" className="inp tnum" min={today} value={due} onChange={e => setDue(e.target.value)} /></div>
            <div><label className="lbl" htmlFor="fu-reason">{t('cu.followUpReason')}</label>
              <select id="fu-reason" className="inp" value={reason} onChange={e => setReason(e.target.value as (typeof REASONS)[number])}>{REASONS.map(r => <option key={r} value={r}>{t(`cu.reason.${r}` as DictKey)}</option>)}</select></div>
          </div>
          <div><label className="lbl" htmlFor="fu-note">{t('cu.followUpNote')}</label><input id="fu-note" className="inp" value={note} maxLength={500} onChange={e => setNote(e.target.value)} /></div>
          <div className="flex gap-2"><button className="btn btn-primary" disabled={pending || !/^\d{4}-\d{2}-\d{2}$/.test(due)} onClick={schedule}>{t('cu.fu.schedule')}</button><button className="btn btn-ghost" onClick={() => setFu(false)}>{t('c.cancel')}</button></div>
        </div>
      )}
      <div className="card flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {KINDS.map(k => <button key={k} type="button" className={`chip h-7 text-[13px] ${kind === k ? 'bg-ink text-white' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{ICON[k]} {t(`cu.kind.${k}` as DictKey)}</button>)}
        </div>
        <textarea className="inp" rows={2} value={body} maxLength={2000} placeholder={t('cu.notePh')} onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && body.trim()) log() }} />
        <div className="flex justify-end"><button className="btn btn-sm btn-dark" disabled={pending || !body.trim()} onClick={log}>{t('cu.addNote')}</button></div>
      </div>
      {err && <p className="err">{err}</p>}
      {entries.length === 0 ? <div className="card p-6 text-muted">{t('bl.empty')}</div> : (
        <ol className="flex flex-col gap-2">
          {entries.map(e => {
            if (e.type === 'booking') {
              return (
                <li key={e.id}>
                  <Link href={`/dashboard/${shopId}?date=${e.date}&open=${e.id}`} className={`card flex flex-wrap items-center gap-3 p-3 text-ink no-underline ${e.status === 'cancelled' ? 'opacity-60' : ''}`}>
                    <span className="tnum w-28 flex-none text-[13.5px]"><b className="block">{dateOf(e.date)}</b><span className="text-muted">{fmtTime(e.startMin, lang)}</span></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px]">{e.items.map(i => (i.kind === 'addon' ? '+ ' : '') + pick(lang, i.name, i.nameZh)).join(', ')}</span>
                      <span className="block text-[12.5px] text-muted">{staffNames[e.staffId] ?? '—'} · {t(`bk.${e.kind}` as DictKey)}{e.cancelReason ? ` · ${e.cancelReason}` : ''}</span>
                      {e.notes && <span className="block text-[12.5px] text-muted">“{e.notes}”</span>}
                    </span>
                    <span className="flex flex-col items-end gap-1"><BookingStatusChip status={e.status as never} t={t} />{showPrices && <span className="tnum text-[13px]">{money(e.priceCents, currency)}</span>}</span>
                  </Link>
                </li>
              )
            }
            if (e.type === 'follow_up') {
              return (
                <li key={e.id} className="flex items-start gap-3 px-3 py-2 text-[13.5px] text-muted">
                  <span className="tnum w-28 flex-none">{dateOf(e.at)}</span>
                  <span className="min-w-0 flex-1">{ICON.follow_up} {t('cu.fu.closed', t(`cu.fu.${e.status === 'done' ? 'done' : 'dismiss'}` as DictKey), t(`cu.reason.${e.reason}` as DictKey))}{e.note ? ` · ${e.note}` : ''}</span>
                </li>
              )
            }
            return (
              <li key={e.id} className="card flex items-start gap-3 p-3">
                <span className="tnum w-28 flex-none text-[13.5px]"><b className="block">{dateOf(e.at)}</b><span className="text-muted">{ICON[e.type]} {t(`cu.kind.${e.type}` as DictKey)}</span></span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-[14px]">{e.body}</p>
                <button type="button" className="btn btn-sm btn-ghost text-muted" aria-label={t('c.delete')} disabled={pending} onClick={() => remove(e.id)}>×</button>
              </li>
            )
          })}
        </ol>
      )}
      {toast.node}
    </section>
  )
}
