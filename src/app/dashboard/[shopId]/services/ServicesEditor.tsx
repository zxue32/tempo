'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast, errText } from '@/components/dash'
import type { DictKey } from '@/lib/i18n'
import type { Service } from '@/lib/types'
import { saveServiceAction, deleteServiceAction, reorderServicesAction } from '../actions'

type Row = {
  id: string | null; kind: 'service' | 'addon'; category: string; appliesTo: string[]; name: string; nameZh: string; descEn: string; descZh: string
  durationMin: number; price: string; priceFrom: boolean; active: boolean; online: boolean
  resourceId: string; questionEn: string; questionZh: string
}
type Res = { id: string; name: string; nameZh: string | null; quantity: number }
const toRow = (s: Service): Row => ({ id: s.id, kind: s.kind, category: s.category, appliesTo: s.appliesTo, name: s.name, nameZh: s.nameZh ?? '', descEn: s.descEn ?? '', descZh: s.descZh ?? '', durationMin: s.durationMin, price: s.priceCents == null ? '' : String(s.priceCents / 100), priceFrom: s.priceFrom, active: s.active, online: s.online, resourceId: s.resourceId ?? '', questionEn: s.questionEn ?? '', questionZh: s.questionZh ?? '' })

export function ServicesEditor({ shopId, services, categories, resources }: { shopId: string; services: Service[]; categories: string[]; resources: Res[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [adding, setAdding] = useState<null | 'service' | 'addon'>(null)
  const main = services.filter(s => s.kind === 'service')
  const addons = services.filter(s => s.kind === 'addon')
  const mainCats = categories.filter(c => c !== 'addon')
  const blank = (kind: 'service' | 'addon'): Row => ({ id: null, kind, category: kind === 'addon' ? 'addon' : mainCats[0], appliesTo: kind === 'addon' ? mainCats.filter(c => c !== 'other') : [], name: '', nameZh: '', descEn: '', descZh: '', durationMin: kind === 'addon' ? 10 : 30, price: '', priceFrom: false, active: true, online: true, resourceId: '', questionEn: '', questionZh: '' })
  const reorder = async (list: Service[], i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const ids = list.map(s => s.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    const others = services.filter(s => !list.includes(s)).map(s => s.id)
    await reorderServicesAction(shopId, list[0]?.kind === 'service' ? [...ids, ...others] : [...others, ...ids])
    router.refresh()
  }
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[20px] font-extrabold">{t('sv.main')}</h2>
          <button className="btn btn-sm btn-primary" onClick={() => setAdding('service')} disabled={adding !== null}>+ {t('sv.add')}</button>
        </div>
        {adding === 'service' && <ServiceRow shopId={shopId} row={blank('service')} categories={mainCats} resources={resources} onDone={() => { setAdding(null); router.refresh() }} onCancel={() => setAdding(null)} />}
        {main.length === 0 && adding !== 'service' && <p className="text-muted">{t('sv.empty')}</p>}
        {main.map((s, i) => <ServiceRow key={s.id} shopId={shopId} row={toRow(s)} categories={mainCats} resources={resources} onDone={() => router.refresh()} onMove={d => reorder(main, i, d)} first={i === 0} last={i === main.length - 1} />)}
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[20px] font-extrabold">{t('sv.addons')}</h2>
            <p className="text-[13px] text-muted">{t('sv.addonsHint')}</p>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => setAdding('addon')} disabled={adding !== null}>+ {t('sv.addAddon')}</button>
        </div>
        {adding === 'addon' && <ServiceRow shopId={shopId} row={blank('addon')} categories={mainCats} resources={resources} onDone={() => { setAdding(null); router.refresh() }} onCancel={() => setAdding(null)} />}
        {addons.map((s, i) => <ServiceRow key={s.id} shopId={shopId} row={toRow(s)} categories={mainCats} resources={resources} onDone={() => router.refresh()} onMove={d => reorder(addons, i, d)} first={i === 0} last={i === addons.length - 1} />)}
      </section>
    </div>
  )
}

function ServiceRow({ shopId, row, categories, resources, onDone, onCancel, onMove, first, last }: {
  shopId: string; row: Row; categories: string[]; resources: Res[]; onDone: () => void; onCancel?: () => void; onMove?: (d: -1 | 1) => void; first?: boolean; last?: boolean
}) {
  const { t, lang } = useI18n()
  const toast = useToast()
  const [v, setV] = useState<Row>(row)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(v) !== JSON.stringify(row)
  const id = row.id ?? 'new-' + row.kind
  const f = <K extends keyof Row>(k: K, val: Row[K]) => setV(x => ({ ...x, [k]: val }))
  const save = () => start(async () => {
    setErr(null)
    const price = v.price.trim() === '' ? null : Math.round(parseFloat(v.price) * 100)
    if (!v.name.trim()) { setErr(t('sv.nameEn') + ' ✕'); return }
    if (price != null && (!Number.isFinite(price) || price < 0)) { setErr(t('sv.price') + ' ✕'); return }
    const r = await saveServiceAction(shopId, row.id, { kind: v.kind, category: v.kind === 'addon' ? 'addon' : v.category, appliesTo: v.kind === 'addon' ? v.appliesTo : [], name: v.name, nameZh: v.nameZh, descEn: v.descEn, descZh: v.descZh, durationMin: v.durationMin, priceCents: price, priceFrom: v.priceFrom, active: v.active, online: v.online, resourceId: v.resourceId || null, questionEn: v.questionEn, questionZh: v.questionZh })
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    toast.show(t('c.saved'))
    onDone()
  })
  return (
    <div className={`card flex flex-col gap-3 p-3 ${v.active ? '' : 'opacity-70'} ${row.id ? '' : 'border-accent'}`}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_120px_96px_96px]">
        <div><label className="lbl" htmlFor={`${id}-n`}>{t('sv.nameEn')}</label><input id={`${id}-n`} className="inp inp-sm" value={v.name} onChange={e => f('name', e.target.value)} maxLength={80} /></div>
        <div><label className="lbl" htmlFor={`${id}-z`}>{t('sv.nameZh')}</label><input id={`${id}-z`} className="inp inp-sm" value={v.nameZh} onChange={e => f('nameZh', e.target.value)} maxLength={80} /></div>
        {v.kind === 'service' ? (
          <div><label className="lbl" htmlFor={`${id}-c`}>{t('sv.category')}</label>
            <select id={`${id}-c`} className="inp inp-sm" value={v.category} onChange={e => f('category', e.target.value)}>
              {categories.map(c => <option key={c} value={c}>{t(`cat.${c}` as DictKey)}</option>)}
            </select></div>
        ) : <div />}
        <div><label className="lbl" htmlFor={`${id}-d`}>{t('sv.duration')}</label><input id={`${id}-d`} type="number" min={5} max={600} step={5} className="inp inp-sm tnum" value={v.durationMin} onChange={e => f('durationMin', Math.max(5, Math.min(600, +e.target.value || 5)))} /></div>
        <div><label className="lbl" htmlFor={`${id}-p`}>{t('sv.price')}</label><input id={`${id}-p`} inputMode="decimal" className="inp inp-sm tnum" value={v.price} onChange={e => f('price', e.target.value.replace(/[^0-9.]/g, ''))} /></div>
      </div>
      {v.kind === 'service' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label className="lbl" htmlFor={`${id}-de`}>{t('sv.descEn')}</label><input id={`${id}-de`} className="inp inp-sm" value={v.descEn} onChange={e => f('descEn', e.target.value)} maxLength={300} /></div>
          <div><label className="lbl" htmlFor={`${id}-dz`}>{t('sv.descZh')}</label><input id={`${id}-dz`} className="inp inp-sm" value={v.descZh} onChange={e => f('descZh', e.target.value)} maxLength={300} /></div>
        </div>
      )}
      {v.kind === 'addon' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label className="lbl" htmlFor={`${id}-qe`}>{t('sv.questionEn')}</label><input id={`${id}-qe`} className="inp inp-sm" value={v.questionEn} placeholder={t('sv.questionPhEn')} onChange={e => f('questionEn', e.target.value)} maxLength={160} /></div>
          <div><label className="lbl" htmlFor={`${id}-qz`}>{t('sv.questionZh')}</label><input id={`${id}-qz`} className="inp inp-sm" value={v.questionZh} placeholder={t('sv.questionPhZh')} onChange={e => f('questionZh', e.target.value)} maxLength={160} /></div>
          <p className="hint !mt-0 sm:col-span-2">{t('sv.questionHint')}</p>
        </div>
      )}
      {resources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="lbl !mb-0" htmlFor={`${id}-r`}>{t('sv.resource')}</label>
          <select id={`${id}-r`} className="inp inp-sm !w-auto" value={v.resourceId} onChange={e => f('resourceId', e.target.value)}>
            <option value="">{t('sv.resourceNone')}</option>
            {resources.map(r => <option key={r.id} value={r.id}>{(lang === 'zh' && r.nameZh) || r.name} × {r.quantity}</option>)}
          </select>
        </div>
      )}
      {v.kind === 'addon' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="lbl !mb-0">{t('sv.appliesTo')}</span>
          {categories.map(c => <label key={c} className="chk text-[13px]"><input type="checkbox" checked={v.appliesTo.includes(c)} onChange={e => f('appliesTo', e.target.checked ? [...v.appliesTo, c] : v.appliesTo.filter(x => x !== c))} />{t(`cat.${c}` as DictKey)}</label>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="chk text-[13px]"><input type="checkbox" checked={v.active} onChange={e => f('active', e.target.checked)} />{t('sv.active')}</label>
        <label className="chk text-[13px]"><input type="checkbox" checked={v.online} onChange={e => f('online', e.target.checked)} />{t('sv.online')}</label>
        <label className="chk text-[13px]"><input type="checkbox" checked={v.priceFrom} onChange={e => f('priceFrom', e.target.checked)} />{t('sv.priceFrom')}</label>
        <span className="flex-1" />
        {onMove && <>
          <button className="btn btn-sm btn-ghost !px-2" aria-label={t('sv.moveUp')} disabled={first} onClick={() => onMove(-1)}>↑</button>
          <button className="btn btn-sm btn-ghost !px-2" aria-label={t('sv.moveDown')} disabled={last} onClick={() => onMove(1)}>↓</button>
        </>}
        {row.id && <button className="btn btn-sm btn-ghost btn-danger" disabled={pending} onClick={() => { if (window.confirm(t('sv.confirmDelete', row.name))) start(async () => { await deleteServiceAction(shopId, row.id!); onDone() }) }}>{t('c.delete')}</button>}
        {onCancel && <button className="btn btn-sm btn-ghost" onClick={onCancel}>{t('c.cancel')}</button>}
        <button className="btn btn-sm btn-primary" disabled={(!dirty && !!row.id) || pending} onClick={save}>{pending ? '…' : t('c.save')}</button>
      </div>
      {err && <p className="err">{err}</p>}
      {toast.node}
    </div>
  )
}
