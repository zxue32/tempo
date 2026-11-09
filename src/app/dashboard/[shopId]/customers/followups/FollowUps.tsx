'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast, errText } from '@/components/dash'
import type { DictKey } from '@/lib/i18n'
import { fmtDate, addDays, diffDays } from '@/lib/tz'
import type { FollowUp, Suggestion } from '@/lib/data/crm'
import { closeFollowUpAction, scheduleFollowUpAction, addNoteAction, saveRebookDaysAction } from '../../actions'

type Props = { shopId: string; today: string; due: FollowUp[]; suggestions: Suggestion[]; rebookDays: number }

const REASON_CHIP: Record<string, string> = { rebook: 'chip-accent', lapsed: 'chip-warn', birthday: 'chip-ok', custom: '' }

/** Two lists: follow-ups that fell due (tasks the shop chose), and clients the system thinks are worth a call. */
export function FollowUps({ shopId, today, due, suggestions, rebookDays }: Props) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [snooze, setSnooze] = useState<string | null>(null)   // customerId being scheduled
  const [snoozeDate, setSnoozeDate] = useState(addDays(today, 7))

  const run = (fn: () => Promise<{ ok: boolean; error?: string; detail?: string }>, msg?: string) => start(async () => {
    setErr(null)
    const r = await fn()
    if (!r.ok) { setErr(errText(t, r.error!, r.detail)); return }
    if (msg) toast.show(msg)
    router.refresh()
  })
  const contact = (customerId: string, name: string) => run(() => addNoteAction(shopId, customerId, 'call', `${t('cu.fu.done')} · ${name}`), t('cu.fu.done'))
  const contactLine = (phone: string | null, email: string | null) => (
    <span className="tnum text-[13px] text-muted">{phone ?? ''}{phone && email ? ' · ' : ''}{email ?? ''}</span>
  )

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="flex flex-col gap-3">
        <h2 className="text-[17px] font-bold">{t('cu.fu.due')} <span className="text-muted">({due.length})</span></h2>
        {due.length === 0 ? <div className="card p-6 text-muted">{t('cu.fu.dueEmpty')}</div> : (
          <ul className="flex flex-col gap-2">
            {due.map(f => {
              const late = diffDays(today, f.due)
              return (
                <li key={f.id} className="card flex flex-wrap items-center gap-3 p-3">
                  <span className="min-w-0 flex-1">
                    <Link href={`/dashboard/${shopId}/customers/${f.customerId}`} className="font-semibold">{f.name}</Link>
                    <span className={`chip ml-2 ${REASON_CHIP[f.reason] ?? ''}`}>{t(`cu.reason.${f.reason}` as DictKey)}</span>
                    {late > 0 && <span className="chip chip-bad ml-1">{t('cu.fu.overdue', late)}</span>}
                    <span className="block">{contactLine(f.phone, f.email)}</span>
                    {f.note && <span className="block text-[13px]">“{f.note}”</span>}
                  </span>
                  <span className="flex gap-1.5">
                    {f.phone && <a className="btn btn-sm" href={`tel:${f.phone}`} aria-label={t('c.phone')}>☎</a>}
                    <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => run(() => closeFollowUpAction(shopId, f.id, 'done'), t('cu.fu.done'))}>{t('cu.fu.done')}</button>
                    <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => run(() => closeFollowUpAction(shopId, f.id, 'dismissed'))}>{t('cu.fu.dismiss')}</button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[17px] font-bold">{t('cu.fu.suggest')} <span className="text-muted">({suggestions.length})</span></h2>
          <p className="text-[13px] text-muted">{t('cu.fu.suggestHint')}</p>
        </div>
        {suggestions.length === 0 ? <div className="card p-6 text-muted">{t('cu.fu.suggestEmpty')}</div> : (
          <ul className="flex flex-col gap-2">
            {suggestions.slice(0, 60).map(s => (
              <li key={s.customerId} className="card flex flex-col gap-2 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <Link href={`/dashboard/${shopId}/customers/${s.customerId}`} className="font-semibold">{s.name}</Link>
                    <span className={`chip ml-2 ${REASON_CHIP[s.reason]}`}>{t(`cu.reason.${s.reason}` as DictKey)}</span>
                    <span className="block text-[13px] text-muted">
                      {s.reason === 'birthday' && s.birthday ? fmtDate(s.birthday, lang, { month: 'short', day: 'numeric' }) : s.lastVisit ? t('cu.fu.lastVisit', fmtDate(s.lastVisit, lang, { month: 'short', day: 'numeric' })) : ''}
                      {' · '}{contactLine(s.phone, s.email)}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    {s.phone && <a className="btn btn-sm" href={`tel:${s.phone}`} aria-label={t('c.phone')}>☎</a>}
                    <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => contact(s.customerId, s.name)}>{t('cu.fu.done')}</button>
                    <button className="btn btn-sm" disabled={pending} aria-expanded={snooze === s.customerId} onClick={() => setSnooze(snooze === s.customerId ? null : s.customerId)}>{t('cu.fu.schedule')}</button>
                  </span>
                </div>
                {snooze === s.customerId && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
                    <label className="lbl mb-0" htmlFor={`sn-${s.customerId}`}>{t('cu.followUpDue')}</label>
                    <input id={`sn-${s.customerId}`} type="date" className="inp inp-sm !w-auto tnum" min={today} value={snoozeDate} onChange={e => setSnoozeDate(e.target.value)} />
                    <button className="btn btn-sm btn-dark" disabled={pending || !/^\d{4}-\d{2}-\d{2}$/.test(snoozeDate)}
                      onClick={() => run(() => scheduleFollowUpAction(shopId, s.customerId, { due: snoozeDate, reason: s.reason, note: null }).then(r => { if (r.ok) setSnooze(null); return r }), t('cu.followUpScheduled'))}>{t('cu.fu.schedule')}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="card flex flex-wrap items-center gap-3 p-3">
          <span className="min-w-0 flex-1"><b className="block text-[14px]">{t('cu.fu.rebookDays')}</b><span className="text-[12.5px] text-muted">{t('cu.fu.rebookDaysHint')}</span></span>
          <select className="inp inp-sm !w-auto" value={rebookDays} disabled={pending} aria-label={t('cu.fu.rebookDays')}
            onChange={e => run(() => saveRebookDaysAction(shopId, +e.target.value), t('c.saved'))}>
            {[7, 10, 14, 21, 28, 35, 42, 56, 90].map(d => <option key={d} value={d}>{t('cu.fu.days', d)}</option>)}
            {![7, 10, 14, 21, 28, 35, 42, 56, 90].includes(rebookDays) && <option value={rebookDays}>{t('cu.fu.days', rebookDays)}</option>}
          </select>
        </div>
      </section>
      {err && <p className="err lg:col-span-2">{err}</p>}
      {toast.node}
    </div>
  )
}
