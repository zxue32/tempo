'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useI18n } from '@/components/i18n'
import { useToast, errText } from '@/components/dash'
import type { Industry } from '@/lib/types'
import { saveSettingsAction, saveResourceAction, deleteResourceAction } from '../actions'

type Rules = { walkinReserve: number; assignMode: 'balanced' | 'turns'; turnsCountRequests: boolean; minGap: number; noshowLimit: number; waitlistEnabled: boolean }
type Res = { id: string; name: string; nameZh: string; quantity: number; used: string[] }

export function RulesEditor({ shopId, industry, staffCount, shortest, resources, rules }: {
  shopId: string; industry: Industry; staffCount: number; shortest: number; resources: Res[]; rules: Rules
}) {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [v, setV] = useState(rules)
  const [saved, setSaved] = useState(rules)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(v) !== JSON.stringify(saved)
  const word = t(`staffWord.${industry}`)
  const save = () => start(async () => {
    setErr(null)
    const r = await saveSettingsAction(shopId, v)
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    setSaved(v); toast.show(t('c.saved')); router.refresh()
  })
  const onlineMax = Math.max(0, staffCount - v.walkinReserve)

  return (
    <div className="flex flex-col gap-5 pb-20">
      <Rule title={t('ru.equipment')} why={t('ru.equipmentWhy')}>
        <EquipmentList key={resources.map(r => `${r.id}:${r.quantity}:${r.name}`).join('|')} shopId={shopId} resources={resources} />
        {resources.length > 0 && <p className="text-[13px] text-muted">{t('ru.equipmentNext')} <Link href={`/dashboard/${shopId}/services`}>{t('d.services')} →</Link></p>}
      </Rule>

      <Rule title={t('ru.reserve')} why={t('ru.reserveWhy')}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="lbl !mb-0" htmlFor="ru-reserve">{t('ru.reserveLabel', word)}</label>
          <input id="ru-reserve" type="number" min={0} max={50} className="inp inp-sm tnum !w-20" value={v.walkinReserve} onChange={e => setV({ ...v, walkinReserve: Math.max(0, Math.min(50, +e.target.value || 0)) })} />
        </div>
        <p className="text-[13.5px]">{v.walkinReserve === 0 ? t('ru.reserveOff') : t('ru.reserveExample', staffCount, onlineMax, v.walkinReserve)}</p>
      </Rule>

      <Rule title={t('ru.assign', word)} why={t('ru.assignWhy')}>
        <div role="radiogroup" aria-label={t('ru.assign', word)} className="grid gap-2 sm:grid-cols-2">
          {(['balanced', 'turns'] as const).map(m => (
            <button key={m} type="button" role="radio" aria-checked={v.assignMode === m} onClick={() => setV({ ...v, assignMode: m })}
              className={`rounded-xl border p-3 text-left ${v.assignMode === m ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
              <b className="block text-[14.5px]">{t(m === 'balanced' ? 'ru.balanced' : 'ru.turns')}</b>
              <span className="text-[13px] text-muted">{t(m === 'balanced' ? 'ru.balancedD' : 'ru.turnsD')}</span>
            </button>
          ))}
        </div>
        {v.assignMode === 'turns' && (
          <label className="chk text-[14px]"><input type="checkbox" checked={v.turnsCountRequests} onChange={e => setV({ ...v, turnsCountRequests: e.target.checked })} />{t('ru.turnsRequests')}</label>
        )}
      </Rule>

      <Rule title={t('ru.gap')} why={t('ru.gapWhy')}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="lbl !mb-0" htmlFor="ru-gap">{t('ru.gapLabel')}</label>
          <select id="ru-gap" className="inp inp-sm !w-auto" value={v.minGap} onChange={e => setV({ ...v, minGap: +e.target.value })}>
            {[0, 15, 20, 30, 45, 60, 90].map(m => <option key={m} value={m}>{m ? t('sg.mins', m) : t('ru.off')}</option>)}
          </select>
          {v.minGap !== shortest && shortest <= 120 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setV({ ...v, minGap: [15, 20, 30, 45, 60, 90].reduce((a, b) => Math.abs(b - shortest) < Math.abs(a - shortest) ? b : a, 15) })}>{t('ru.gapSuggest', shortest)}</button>}
        </div>
        {v.minGap > 0 && <p className="text-[13.5px]">{t('ru.gapExample', v.minGap)}</p>}
      </Rule>

      <Rule title={t('ru.noshow')} why={t('ru.noshowWhy')}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="lbl !mb-0" htmlFor="ru-ns">{t('ru.noshowLabel')}</label>
          <select id="ru-ns" className="inp inp-sm !w-auto" value={v.noshowLimit} onChange={e => setV({ ...v, noshowLimit: +e.target.value })}>
            {[0, 1, 2, 3, 5].map(n => <option key={n} value={n}>{n ? t('ru.noshowN', n) : t('ru.off')}</option>)}
          </select>
        </div>
      </Rule>

      <Rule title={t('ru.waitlist')} why={t('ru.waitlistWhy')}>
        <label className="chk text-[14px]"><input type="checkbox" checked={v.waitlistEnabled} onChange={e => setV({ ...v, waitlistEnabled: e.target.checked })} />{t('ru.waitlistOn')}</label>
      </Rule>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:left-[240px]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          {err ? <span className="err min-w-0 flex-1">{err}</span> : <span className="min-w-0 flex-1 text-[13px] text-muted">{dirty ? t('sc.unsaved') : ''}</span>}
          {dirty && <button className="btn btn-ghost btn-sm" onClick={() => setV(saved)}>{t('c.cancel')}</button>}
          <button className="btn btn-primary" disabled={!dirty || pending} onClick={save}>{pending ? t('c.saving') : t('c.save')}</button>
        </div>
      </div>
      {toast.node}
    </div>
  )
}

function Rule({ title, why, children }: { title: string; why: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div>
        <h2 className="text-[17px] font-bold">{title}</h2>
        <p className="text-[13.5px] text-muted">{why}</p>
      </div>
      {children}
    </section>
  )
}

function EquipmentList({ shopId, resources }: { shopId: string; resources: Res[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [rows, setRows] = useState(resources)
  const [adding, setAdding] = useState(false)
  const [nv, setNv] = useState({ name: '', nameZh: '', quantity: 2 })
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const saveRow = (r: Res | null, d: { name: string; nameZh: string; quantity: number }) => start(async () => {
    setErr(null)
    if (!d.name.trim()) { setErr(t('ru.eqName') + ' ✕'); return }
    const res = await saveResourceAction(shopId, r?.id ?? null, d)
    if (!res.ok) { setErr(t('c.error')); return }
    if (!r) { setNv({ name: '', nameZh: '', quantity: 2 }); setAdding(false) }
    router.refresh()
  })
  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && !adding && <p className="text-[13.5px] text-muted">{t('ru.eqEmpty')}</p>}
      {rows.map((r, i) => (
        <div key={r.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-2.5">
          <div className="min-w-0 flex-1"><label className="lbl" htmlFor={`eq-${r.id}-n`}>{t('ru.eqName')}</label><input id={`eq-${r.id}-n`} className="inp inp-sm" value={r.name} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></div>
          <div className="min-w-0 flex-1"><label className="lbl" htmlFor={`eq-${r.id}-z`}>{t('ru.eqNameZh')}</label><input id={`eq-${r.id}-z`} className="inp inp-sm" value={r.nameZh} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, nameZh: e.target.value } : x))} /></div>
          <div><label className="lbl" htmlFor={`eq-${r.id}-q`}>{t('ru.eqQty')}</label><input id={`eq-${r.id}-q`} type="number" min={1} max={100} className="inp inp-sm tnum !w-20" value={r.quantity} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, quantity: Math.max(1, Math.min(100, +e.target.value || 1)) } : x))} /></div>
          <button className="btn btn-sm" disabled={pending} onClick={() => saveRow(r, r)}>{t('c.save')}</button>
          <button className="btn btn-sm btn-ghost btn-danger" disabled={pending} onClick={() => { if (window.confirm(t('ru.eqDelete', r.name))) start(async () => { await deleteResourceAction(shopId, r.id); router.refresh() }) }}>{t('c.delete')}</button>
          <p className="w-full text-[12.5px] text-muted">{r.used.length ? t('ru.eqUsedBy', r.used.join(', ')) : t('ru.eqUnused')}</p>
        </div>
      ))}
      {adding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-accent p-2.5">
          <div className="min-w-0 flex-1"><label className="lbl" htmlFor="eq-new-n">{t('ru.eqName')}</label><input id="eq-new-n" className="inp inp-sm" value={nv.name} placeholder={t('ru.eqPh')} onChange={e => setNv({ ...nv, name: e.target.value })} /></div>
          <div className="min-w-0 flex-1"><label className="lbl" htmlFor="eq-new-z">{t('ru.eqNameZh')}</label><input id="eq-new-z" className="inp inp-sm" value={nv.nameZh} placeholder={t('ru.eqPhZh')} onChange={e => setNv({ ...nv, nameZh: e.target.value })} /></div>
          <div><label className="lbl" htmlFor="eq-new-q">{t('ru.eqQty')}</label><input id="eq-new-q" type="number" min={1} max={100} className="inp inp-sm tnum !w-20" value={nv.quantity} onChange={e => setNv({ ...nv, quantity: Math.max(1, Math.min(100, +e.target.value || 1)) })} /></div>
          <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => saveRow(null, nv)}>{t('c.add')}</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setAdding(false)}>{t('c.cancel')}</button>
        </div>
      ) : <button className="btn btn-sm self-start" onClick={() => setAdding(true)}>+ {t('ru.eqAdd')}</button>}
      {err && <p className="err">{err}</p>}
    </div>
  )
}
