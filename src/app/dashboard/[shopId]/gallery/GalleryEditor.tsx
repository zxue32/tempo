'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast } from '@/components/dash'
import { downscale } from '@/components/downscale'
import { pick } from '@/lib/i18n'
import { uploadGalleryAction, updateGalleryAction, deleteGalleryAction, reorderGalleryAction } from '../actions'

type Item = { id: string; url: string; captionEn: string; captionZh: string; staffId: string; serviceId: string }
type Opt = { id: string; name: string; nameZh: string | null }

export function GalleryEditor({ shopId, max, items, staff, services }: { shopId: string; max: number; items: Item[]; staff: Opt[]; services: Opt[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [, start] = useTransition()

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setErr(null)
    const list = Array.from(files).slice(0, Math.max(0, max - items.length))
    if (list.length < files.length) setErr(t('ga.limit', max))
    setProgress({ done: 0, total: list.length })
    let failed = 0
    for (let i = 0; i < list.length; i++) {
      try {
        const blob = await downscale(list[i])
        const fd = new FormData()
        fd.append('file', new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
        const r = await uploadGalleryAction(shopId, fd)
        if (!r.ok) failed++
      } catch { failed++ }
      setProgress({ done: i + 1, total: list.length })
    }
    setProgress(null)
    if (failed) setErr(t('ga.failed', failed))
    router.refresh()
  }
  const move = (i: number, dir: -1 | 1) => start(async () => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const ids = items.map(x => x.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await reorderGalleryAction(shopId, ids)
    router.refresh()
  })

  return (
    <div className="flex flex-col gap-4">
      <label className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line bg-surface px-4 py-8 text-center ${items.length >= max ? 'pointer-events-none opacity-50' : 'hover:border-accent'}`}>
        <span className="text-[28px]" aria-hidden="true">＋</span>
        <b>{progress ? t('ga.uploading', progress.done, progress.total) : t('ga.add')}</b>
        <span className="text-[13px] text-muted">{t('ga.addHint')} · {items.length} / {max}</span>
        <input type="file" accept="image/*" multiple className="sr-only" disabled={!!progress || items.length >= max} onChange={e => { upload(e.target.files); e.target.value = '' }} />
      </label>
      {err && <p className="err">{err}</p>}
      {items.length === 0 ? <p className="text-muted">{t('ga.empty')}</p> : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it, i) => (
            <GalleryCard key={it.id} shopId={shopId} item={it} staff={staff} services={services} first={i === 0} last={i === items.length - 1}
              onMove={d => move(i, d)} onSaved={() => toast.show(t('c.saved'))} onDeleted={() => router.refresh()} />
          ))}
        </ul>
      )}
      {toast.node}
    </div>
  )
}

function GalleryCard({ shopId, item, staff, services, first, last, onMove, onSaved, onDeleted }: {
  shopId: string; item: Item; staff: Opt[]; services: Opt[]; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onSaved: () => void; onDeleted: () => void
}) {
  const { t, lang } = useI18n()
  const [v, setV] = useState(item)
  const [saved, setSaved] = useState(item)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(v) !== JSON.stringify(saved)
  const save = () => start(async () => {
    const r = await updateGalleryAction(shopId, v.id, { captionEn: v.captionEn, captionZh: v.captionZh, staffId: v.staffId || null, serviceId: v.serviceId || null })
    if (r.ok) { setSaved(v); onSaved() }
  })
  return (
    <li className="card flex flex-col overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt={v.captionEn || v.captionZh || ''} className="aspect-square w-full object-cover" loading="lazy" />
      <div className="flex flex-col gap-2 p-3">
        <input aria-label={t('ga.captionEn')} placeholder={t('ga.captionEn')} className="inp inp-sm" value={v.captionEn} maxLength={200} onChange={e => setV({ ...v, captionEn: e.target.value })} />
        <input aria-label={t('ga.captionZh')} placeholder={t('ga.captionZh')} className="inp inp-sm" value={v.captionZh} maxLength={200} onChange={e => setV({ ...v, captionZh: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <select aria-label={t('ga.who')} className="inp inp-sm" value={v.staffId} onChange={e => setV({ ...v, staffId: e.target.value })}>
            <option value="">{t('ga.who')}</option>
            {staff.map(s => <option key={s.id} value={s.id}>{pick(lang, s.name, s.nameZh)}</option>)}
          </select>
          <select aria-label={t('ga.what')} className="inp inp-sm" value={v.serviceId} onChange={e => setV({ ...v, serviceId: e.target.value })}>
            <option value="">{t('ga.what')}</option>
            {services.map(s => <option key={s.id} value={s.id}>{pick(lang, s.name, s.nameZh)}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn btn-sm btn-ghost !px-2" aria-label={t('ga.left')} disabled={first || pending} onClick={() => onMove(-1)}>←</button>
          <button className="btn btn-sm btn-ghost !px-2" aria-label={t('ga.right')} disabled={last || pending} onClick={() => onMove(1)}>→</button>
          <span className="flex-1" />
          <button className="btn btn-sm btn-ghost btn-danger" disabled={pending} onClick={() => { if (window.confirm(t('ga.confirmDelete'))) start(async () => { await deleteGalleryAction(shopId, item.id); onDeleted() }) }}>{t('c.delete')}</button>
          <button className="btn btn-sm btn-primary" disabled={!dirty || pending} onClick={save}>{t('c.save')}</button>
        </div>
      </div>
    </li>
  )
}
