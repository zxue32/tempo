'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast, errText, Panel } from '@/components/dash'
import type { DictKey } from '@/lib/i18n'
import { fmtDate } from '@/lib/tz'
import { SEGMENTS, type Segment, type CampaignSegment } from '@/lib/segments'
import { createCampaignAction, deleteCampaignAction, sendCampaignAction, campaignAudienceAction } from '../../actions'

type Row = { id: string; name: string; subject: string; body: string; segment: CampaignSegment; status: 'draft' | 'sent'; createdAt: string; sentAt: string | null; sentCount: number }
type Props = { shopId: string; shopName: string; tags: string[]; campaigns: Row[]; emailOn: boolean }

const AUDIENCE_SEGMENTS = SEGMENTS.filter(s => s !== 'consented')

/** Drafts, a composer, and a send button that asks once and then really sends — only to consenting clients. */
export function Campaigns({ shopId, shopName, tags, campaigns, emailOn }: Props) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [count, setCount] = useState<Record<string, number>>({})
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const blank = { name: '', subject: '', body: '', segment: 'all' as Segment, tag: '' }
  const [v, setV] = useState(blank)
  const [n, setN] = useState<number | null>(null)

  // live audience count while composing
  useEffect(() => {
    if (!open) return
    let alive = true
    campaignAudienceAction(shopId, { segment: v.segment, ...(v.tag ? { tag: v.tag } : {}) }).then(r => { if (alive) setN(r.ok ? r.n : null) })
    return () => { alive = false }
  }, [open, shopId, v.segment, v.tag])

  const audienceOf = (c: Row) => {
    if (count[c.id] !== undefined) return
    campaignAudienceAction(shopId, c.segment).then(r => setCount(x => ({ ...x, [c.id]: r.ok ? r.n : 0 })))
  }
  const segLabel = (s: CampaignSegment) => t(`cu.seg.${s.segment}` as DictKey) + (s.tag ? ` · ${s.tag}` : '')

  const create = () => start(async () => {
    setErr(null)
    const r = await createCampaignAction(shopId, { name: v.name, subject: v.subject, body: v.body, segment: { segment: v.segment, ...(v.tag ? { tag: v.tag } : {}) } })
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    setOpen(false); setV(blank); toast.show(t('c.saved')); router.refresh()
  })
  const send = (id: string) => start(async () => {
    setErr(null)
    const r = await sendCampaignAction(shopId, id)
    setConfirm(null)
    if (!r.ok) { setErr(r.error === 'email_off' ? t('cu.cp.noEmail') : r.error === 'already_sent' ? t('c.error') : errText(t, r.error, r.detail)); return }
    toast.show(t('cu.cp.result', r.sent, r.failed)); router.refresh()
  })
  const remove = (id: string) => start(async () => {
    const r = await deleteCampaignAction(shopId, id)
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    router.refresh()
  })

  return (
    <div className="flex flex-col gap-3">
      <div><button className="btn btn-primary" onClick={() => setOpen(true)}>{t('cu.cp.new')}</button></div>
      {err && <p className="err">{err}</p>}
      {campaigns.length === 0 ? <div className="card p-8 text-center text-muted">{t('cu.cp.empty')}</div> : (
        <ul className="flex flex-col gap-2">
          {campaigns.map(c => (
            <li key={c.id} className="card flex flex-wrap items-start gap-3 p-4" onMouseEnter={() => c.status === 'draft' && audienceOf(c)}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><b className="text-[15px]">{c.name}</b>
                  {c.status === 'sent' ? <span className="chip chip-ok">{t('cu.cp.sent', c.sentCount)}</span> : <span className="chip">{t('cu.cp.draft')}</span>}
                  <span className="chip chip-accent">{segLabel(c.segment)}</span>
                </span>
                <span className="block text-[14px]">{c.subject}</span>
                <span className="block text-[12.5px] text-muted">{fmtDate((c.sentAt ?? c.createdAt).slice(0, 10), lang, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                {confirm === c.id && (
                  <span className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-warn-soft p-2 text-[14px]">
                    {t('cu.cp.sendConfirm', count[c.id] ?? '…')}
                    <button className="btn btn-sm btn-dark" disabled={pending} onClick={() => send(c.id)}>{t('c.confirm')}</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setConfirm(null)}>{t('c.cancel')}</button>
                  </span>
                )}
              </span>
              {c.status === 'draft' && confirm !== c.id && (
                <span className="flex gap-1.5">
                  <button className="btn btn-sm btn-primary" disabled={pending || !emailOn} onClick={() => { audienceOf(c); setConfirm(c.id) }}>{t('cu.cp.send')}</button>
                  <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => remove(c.id)}>{t('c.delete')}</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <Panel title={t('cu.cp.new')} onClose={() => setOpen(false)}>
          <div className="mt-4 flex flex-col gap-3">
            <div><label className="lbl" htmlFor="cp-name">{t('cu.cp.name')}</label><input id="cp-name" className="inp" value={v.name} maxLength={80} onChange={e => setV({ ...v, name: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="lbl" htmlFor="cp-seg">{t('cu.cp.segment')}</label>
                <select id="cp-seg" className="inp" value={v.segment} onChange={e => setV({ ...v, segment: e.target.value as Segment })}>
                  {AUDIENCE_SEGMENTS.map(s => <option key={s} value={s}>{t(`cu.seg.${s}` as DictKey)}</option>)}
                </select></div>
              {tags.length > 0 && <div><label className="lbl" htmlFor="cp-tag">{t('cu.tagFilter')}</label>
                <select id="cp-tag" className="inp" value={v.tag} onChange={e => setV({ ...v, tag: e.target.value })}>
                  <option value="">{t('cu.tagAll')}</option>{tags.map(x => <option key={x} value={x}>{x}</option>)}
                </select></div>}
            </div>
            <p className="text-[13.5px] text-muted">{n === null ? '…' : t('cu.cp.audience', n)}</p>
            <div><label className="lbl" htmlFor="cp-subject">{t('cu.cp.subject')}</label><input id="cp-subject" className="inp" value={v.subject} maxLength={120} onChange={e => setV({ ...v, subject: e.target.value })} /></div>
            <div><label className="lbl" htmlFor="cp-body">{t('cu.cp.body')}</label><textarea id="cp-body" className="inp" rows={7} value={v.body} maxLength={4000} onChange={e => setV({ ...v, body: e.target.value })} /><p className="hint">{t('cu.cp.bodyHint')}</p></div>
            {v.body && (
              <div className="rounded-xl border border-line bg-sunk p-4 text-[14px]">
                <div className="eyebrow mb-2">{t('cu.cp.preview')}</div>
                <p className="whitespace-pre-wrap">{v.body.replace(/\{name\}/g, 'Ana')}</p>
                <p className="mt-3 text-[12.5px] text-muted">{shopName}<br /><u>退订 / Unsubscribe</u></p>
              </div>
            )}
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={pending || !v.name.trim() || !v.subject.trim() || !v.body.trim()} onClick={create}>{t('c.save')}</button>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>{t('c.cancel')}</button>
            </div>
          </div>
        </Panel>
      )}
      {toast.node}
    </div>
  )
}
