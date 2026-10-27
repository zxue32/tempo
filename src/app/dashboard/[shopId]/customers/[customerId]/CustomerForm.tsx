'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast, errText } from '@/components/dash'
import { saveCustomerAction } from '../../actions'

type C = { id: string; name: string; phone: string; email: string; notes: string; blocked: boolean }

export function CustomerForm({ shopId, customer }: { shopId: string; customer: C }) {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [v, setV] = useState(customer)
  const [saved, setSaved] = useState(customer)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(v) !== JSON.stringify(saved)
  const save = () => start(async () => {
    setErr(null)
    const r = await saveCustomerAction(shopId, v.id, v)
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    setSaved(v); toast.show(t('c.saved')); router.refresh()
  })
  return (
    <div className="flex flex-col gap-3">
      <div><label className="lbl" htmlFor="cu-name">{t('c.name')}</label><input id="cu-name" className="inp" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></div>
      <div><label className="lbl" htmlFor="cu-phone">{t('c.phone')}</label>
        <div className="flex gap-2"><input id="cu-phone" type="tel" className="inp tnum" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} />{saved.phone && <a className="btn" href={`tel:${saved.phone}`} aria-label={t('c.phone')}>☎</a>}</div></div>
      <div><label className="lbl" htmlFor="cu-email">{t('c.email')}</label><input id="cu-email" type="email" className="inp" value={v.email} onChange={e => setV({ ...v, email: e.target.value })} /></div>
      <div><label className="lbl" htmlFor="cu-notes">{t('cu.notes')}</label><textarea id="cu-notes" className="inp" rows={4} value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} /></div>
      <label className="chk items-start"><input type="checkbox" checked={v.blocked} onChange={e => setV({ ...v, blocked: e.target.checked })} /><span><b className="block">{t('cu.blocked')}</b><span className="hint mt-0">{t('cu.blockedHint')}</span></span></label>
      {err && <p className="err">{err}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={!dirty || pending || !v.name.trim()} onClick={save}>{pending ? t('c.saving') : t('c.save')}</button>
        {dirty && <button className="btn btn-ghost" onClick={() => setV(saved)}>{t('c.cancel')}</button>}
      </div>
      {toast.node}
    </div>
  )
}
