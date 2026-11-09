'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast, errText } from '@/components/dash'
import type { DictKey } from '@/lib/i18n'
import { createCustomerAction, importCustomersAction } from '../../actions'

const TEMPLATE = 'name,phone,email,tags,birthday,notes\r\nAna Lee,(555) 555-0101,ana@example.com,"VIP; loves red",1995-10-20,Prefers Ana\r\n'

/** Add one client by hand, or many from a CSV; both land in the same list as online bookers. */
export function NewClient({ shopId }: { shopId: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [v, setV] = useState({ name: '', phone: '', email: '', notes: '', source: 'walkin' as 'walkin' | 'phone' | 'manual' })
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const create = () => start(async () => {
    setErr(null)
    const r = await createCustomerAction(shopId, v)
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    toast.show(t('cu.new.created'))
    router.push(`/dashboard/${shopId}/customers/${r.id}`)
  })
  const pick = (f: File | undefined) => {
    if (!f) { setCsv(null); return }
    f.text().then(text => setCsv({ name: f.name, text }))
  }
  const run = () => start(async () => {
    if (!csv) return
    setErr(null); setResult(null)
    const r = await importCustomersAction(shopId, csv.text)
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    setResult(t('cu.import.result', r.added, r.updated, r.skipped)); setCsv(null); router.refresh()
  })

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card flex flex-col gap-3 p-5">
        <div><h2 className="text-[17px] font-bold">{t('cu.new.title')}</h2><p className="text-[13px] text-muted">{t('cu.new.hint')}</p></div>
        <div><label className="lbl" htmlFor="nc-name">{t('c.name')} *</label><input id="nc-name" className="inp" value={v.name} maxLength={80} onChange={e => setV({ ...v, name: e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="lbl" htmlFor="nc-phone">{t('c.phone')}</label><input id="nc-phone" type="tel" className="inp tnum" value={v.phone} maxLength={30} onChange={e => setV({ ...v, phone: e.target.value })} /></div>
          <div><label className="lbl" htmlFor="nc-email">{t('c.email')}</label><input id="nc-email" type="email" className="inp" value={v.email} maxLength={120} onChange={e => setV({ ...v, email: e.target.value })} /></div>
        </div>
        <div><label className="lbl" htmlFor="nc-source">{t('cu.source')}</label>
          <select id="nc-source" className="inp" value={v.source} onChange={e => setV({ ...v, source: e.target.value as typeof v.source })}>
            {(['walkin', 'phone', 'manual'] as const).map(s => <option key={s} value={s}>{t(`cu.source.${s}` as DictKey)}</option>)}
          </select></div>
        <div><label className="lbl" htmlFor="nc-notes">{t('cu.notes')}</label><textarea id="nc-notes" className="inp" rows={3} value={v.notes} maxLength={2000} onChange={e => setV({ ...v, notes: e.target.value })} /></div>
        <div><button className="btn btn-primary" disabled={pending || !v.name.trim()} onClick={create}>{t('cu.new.create')}</button></div>
      </section>
      <section className="card flex flex-col gap-3 p-5">
        <div><h2 className="text-[17px] font-bold">{t('cu.import.title')}</h2><p className="text-[13px] text-muted">{t('cu.import.hint')}</p></div>
        <div>
          <label className="lbl" htmlFor="nc-file">{t('cu.import.file')}</label>
          <input id="nc-file" type="file" accept=".csv,text/csv" className="inp" onChange={e => pick(e.target.files?.[0])} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" disabled={pending || !csv} onClick={run}>{t('cu.import.run')}{csv ? ` · ${csv.name}` : ''}</button>
          <a className="btn btn-ghost btn-sm" download="clients-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + TEMPLATE)}`}>{t('cu.import.template')}</a>
        </div>
        {result && <p className="text-[14px] font-semibold text-ok">{result}</p>}
      </section>
      {err && <p className="err lg:col-span-2">{err}</p>}
      {toast.node}
    </div>
  )
}
