'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { createInviteAction, deleteInviteAction } from '../actions'

export function InviteForm() {
  const { t } = useI18n()
  const router = useRouter()
  const [v, setV] = useState({ code: '', note: '', maxUses: 1, expires: '' })
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const create = () => start(async () => {
    setErr(null)
    const r = await createInviteAction(v)
    if (!r.ok) { setErr(r.error === 'taken' ? `${t('ad.code')}: ${t('ob.slugTaken')}` : t('c.error')); return }
    setV({ code: '', note: '', maxUses: 1, expires: '' }); router.refresh()
  })
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="text-[17px] font-bold">{t('ad.newInvite')}</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_120px_170px_auto] sm:items-end">
        <div><label className="lbl" htmlFor="iv-code">{t('ad.code')}</label><input id="iv-code" className="inp tnum uppercase" maxLength={32} value={v.code} placeholder={t('ad.codePh')} onChange={e => setV({ ...v, code: e.target.value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase() })} /></div>
        <div><label className="lbl" htmlFor="iv-note">{t('ad.inviteNote')}</label><input id="iv-note" className="inp" maxLength={200} value={v.note} onChange={e => setV({ ...v, note: e.target.value })} /></div>
        <div><label className="lbl" htmlFor="iv-max">{t('ad.maxUses')}</label><input id="iv-max" type="number" min={1} max={1000} className="inp tnum" value={v.maxUses} onChange={e => setV({ ...v, maxUses: Math.max(1, Math.min(1000, +e.target.value || 1)) })} /></div>
        <div><label className="lbl" htmlFor="iv-exp">{t('ad.expires')}</label><input id="iv-exp" type="date" className="inp tnum" value={v.expires} onChange={e => setV({ ...v, expires: e.target.value })} /></div>
        <button className="btn btn-primary" disabled={pending} onClick={create}>{t('c.add')}</button>
      </div>
      {err && <p className="err">{err}</p>}
    </section>
  )
}

export function DeleteInvite({ code }: { code: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [sure, setSure] = useState(false)
  const [pending, start] = useTransition()
  if (!sure) return <button className="btn btn-sm btn-ghost btn-danger" onClick={() => setSure(true)}>{t('ad.deleteInvite')}</button>
  return (
    <span className="inline-flex gap-1">
      <button className="btn btn-sm btn-danger" disabled={pending} onClick={() => start(async () => { await deleteInviteAction(code); router.refresh() })}>{t('c.confirm')}</button>
      <button className="btn btn-sm btn-ghost" onClick={() => setSure(false)}>{t('c.cancel')}</button>
    </span>
  )
}
