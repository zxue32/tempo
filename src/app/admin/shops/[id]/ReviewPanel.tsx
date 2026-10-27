'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import type { DictKey } from '@/lib/i18n'
import type { ShopStatus } from '@/lib/types'
import { reviewShopAction, changeSlugAction, type Decision } from '../../actions'

const OPTIONS: Record<ShopStatus, Decision[]> = {
  pending: ['approve', 'changes', 'reject'],
  changes: ['approve', 'reject'],
  draft: ['approve', 'changes', 'reject'],
  rejected: ['approve'],
  live: ['changes', 'suspend'],
  suspended: ['unsuspend'],
}
const LABEL: Record<Decision, DictKey> = { approve: 'ad.approve', changes: 'ad.requestChanges', reject: 'ad.reject', suspend: 'ad.suspend', unsuspend: 'ad.unsuspend' }
const NEEDS_NOTE: Decision[] = ['changes', 'reject', 'suspend']

export function ReviewPanel({ shopId, status, lastNote }: { shopId: string; status: ShopStatus; lastNote: string | null }) {
  const { t } = useI18n()
  const router = useRouter()
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const act = (d: Decision) => start(async () => {
    setMsg(null)
    if (NEEDS_NOTE.includes(d) && !note.trim()) { setMsg({ ok: false, text: t('ad.noteRequired') }); return }
    const r = await reviewShopAction(shopId, d, note)
    if (!r.ok) { setMsg({ ok: false, text: r.error === 'note_required' ? t('ad.noteRequired') : t('c.error') }); return }
    setNote(''); setMsg({ ok: true, text: t('ad.done') }); router.refresh()
  })
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="text-[17px] font-bold">{t('ad.review')}</h2>
      {lastNote && <p className="rounded-lg bg-sunk px-3 py-2 text-[13.5px]"><span className="text-muted">{t('ad.reviewNote')}: </span>{lastNote}</p>}
      <div>
        <label className="lbl" htmlFor="ad-note">{t('ad.note')}</label>
        <textarea id="ad-note" className="inp" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={t('ad.notePh')} />
      </div>
      <div className="flex flex-wrap gap-2">
        {OPTIONS[status].map(d => (
          <button key={d} disabled={pending} onClick={() => act(d)}
            className={`btn ${d === 'approve' || d === 'unsuspend' ? 'btn-primary' : d === 'reject' || d === 'suspend' ? 'btn-danger' : ''}`}>{t(LABEL[d])}</button>
        ))}
      </div>
      {msg && <p className={msg.ok ? 'text-[14px] text-ok' : 'err'} role="status">{msg.text}</p>}
    </section>
  )
}

export function SlugForm({ shopId, slug, live }: { shopId: string; slug: string; live: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const [v, setV] = useState(slug)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const save = () => start(async () => {
    setMsg(null)
    const r = await changeSlugAction(shopId, v)
    if (!r.ok) {
      const k: Record<string, DictKey> = { taken: 'ob.slugTaken', short: 'ob.slugShort', format: 'ob.slugFormat', reserved: 'ob.slugReserved' }
      setMsg({ ok: false, text: t(k[r.error] ?? 'c.error') }); return
    }
    setV(r.slug); setMsg({ ok: true, text: t('ad.slugSaved') }); router.refresh()
  })
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="text-[17px] font-bold">{t('ad.changeSlug')}</h2>
      {live && <p className="text-[13px] text-warn">{t('ad.slugWarn')}</p>}
      <div className="flex gap-2">
        <input aria-label={t('ob.slug')} className="inp tnum" value={v} onChange={e => setV(e.target.value.toLowerCase())} />
        <button className="btn" disabled={pending || v === slug} onClick={save}>{t('c.save')}</button>
      </div>
      {msg && <p className={msg.ok ? 'text-[14px] text-ok' : 'err'} role="status">{msg.text}</p>}
    </section>
  )
}
