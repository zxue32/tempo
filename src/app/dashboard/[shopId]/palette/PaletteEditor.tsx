'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast } from '@/components/dash'
import { downscale } from '@/components/downscale'
import { pick } from '@/lib/i18n'
import type { Swatch } from '@/lib/types'
import { saveSwatchAction, deleteSwatchAction, reorderPaletteAction } from '../actions'

type Kind = 'hair' | 'nail'
const blank = (kind: Kind) => ({ id: null as string | null, kind, name: '', nameZh: '', code: '', hex: kind === 'hair' ? '#5A3A2A' : '#E8B4B8', hex2: null as string | null, active: true, photoUrl: null as string | null })
type Draft = ReturnType<typeof blank>

export function PaletteEditor({ shopId, kinds, items, max }: { shopId: string; kinds: Kind[]; items: Swatch[]; max: number }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-8">
      {kinds.map(k => <KindSection key={k} shopId={shopId} kind={k} items={items.filter(i => i.kind === k)} max={max} hint={t(k === 'hair' ? 'pl.hairHint' : 'pl.nailHint')} />)}
    </div>
  )
}

function KindSection({ shopId, kind, items, max, hint }: { shopId: string; kind: Kind; items: Swatch[]; max: number; hint: string }) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [editing, setEditing] = useState<Draft | null>(null)
  const [, start] = useTransition()
  const move = (i: number, dir: -1 | 1) => start(async () => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const ids = items.map(x => x.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await reorderPaletteAction(shopId, ids)
    router.refresh()
  })
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-extrabold">{t(kind === 'hair' ? 'pl.hair' : 'pl.nail')}</h2>
          <p className="text-[13.5px] text-muted">{hint}</p>
        </div>
        <button className="btn btn-primary btn-sm" disabled={items.length >= max} onClick={() => setEditing(blank(kind))}>+ {t('pl.add')}</button>
      </div>
      {editing && <SwatchForm shopId={shopId} draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast.show(t('c.saved')); router.refresh() }} />}
      {items.length === 0 ? <p className="text-muted">{t('pl.empty')}</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((s, i) => (
            <li key={s.id} className={`card flex flex-col overflow-hidden ${s.active ? '' : 'opacity-60'}`}>
              <div className="relative aspect-[4/3]">
                {s.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : <div className="h-full w-full" style={{ background: s.hex2 ? `linear-gradient(135deg, ${s.hex}, ${s.hex2})` : s.hex }} />}
                <span className="absolute bottom-2 left-2 h-7 w-7 rounded-full border-2 border-white shadow" style={{ background: s.hex2 ? `linear-gradient(135deg, ${s.hex}, ${s.hex2})` : s.hex }} />
              </div>
              <div className="flex flex-col gap-1 p-3">
                <b className="truncate">{pick(lang, s.name, s.nameZh)}</b>
                <span className="truncate text-[12.5px] text-muted">{s.code || s.hex}{!s.active ? ` · ${t('sv.active')} ✕` : ''}</span>
                <div className="mt-1 flex items-center gap-1">
                  <button className="btn btn-sm btn-ghost !px-2" aria-label={t('ga.left')} disabled={i === 0} onClick={() => move(i, -1)}>←</button>
                  <button className="btn btn-sm btn-ghost !px-2" aria-label={t('ga.right')} disabled={i === items.length - 1} onClick={() => move(i, 1)}>→</button>
                  <span className="flex-1" />
                  <button className="btn btn-sm" onClick={() => setEditing({ id: s.id, kind: s.kind, name: s.name, nameZh: s.nameZh ?? '', code: s.code ?? '', hex: s.hex, hex2: s.hex2, active: s.active, photoUrl: s.photoUrl })}>{t('c.edit')}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {toast.node}
    </section>
  )
}

function SwatchForm({ shopId, draft, onClose, onSaved }: { shopId: string; draft: Draft; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const [v, setV] = useState(draft)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(draft.photoUrl)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const save = () => start(async () => {
    setErr(null)
    if (!v.name.trim()) { setErr(t('c.required')); return }
    let fd: FormData | undefined
    if (file) { fd = new FormData(); fd.append('file', new File([await downscale(file)], 'photo.jpg', { type: 'image/jpeg' })) }
    const r = await saveSwatchAction(shopId, v.id, { kind: v.kind, name: v.name, nameZh: v.nameZh, code: v.code, hex: v.hex, hex2: v.hex2, active: v.active }, fd)
    if (!r.ok) { setErr(r.error === 'limit' ? t('pl.limit', 60) : t('c.error')); return }
    onSaved()
  })
  const del = () => { if (v.id && window.confirm(t('pl.confirmDelete', v.name))) start(async () => { await deleteSwatchAction(shopId, v.id!); onSaved() }) }
  return (
    <div className="card flex flex-col gap-3 border-accent p-4" role="dialog" aria-label={t('pl.add')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="lbl" htmlFor="pl-name">{t('pl.name')} *</label><input id="pl-name" className="inp" value={v.name} maxLength={60} onChange={e => setV({ ...v, name: e.target.value })} /></div>
        <div><label className="lbl" htmlFor="pl-zh">{t('pl.nameZh')}</label><input id="pl-zh" className="inp" value={v.nameZh} maxLength={60} onChange={e => setV({ ...v, nameZh: e.target.value })} /></div>
        <div><label className="lbl" htmlFor="pl-code">{t('pl.code')}</label><input id="pl-code" className="inp" value={v.code} maxLength={40} placeholder="7.1 / OPI Bubble Bath" onChange={e => setV({ ...v, code: e.target.value })} /></div>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="lbl" htmlFor="pl-hex">{t('pl.hex')}</label><input id="pl-hex" type="color" className="h-10 w-14 cursor-pointer rounded-lg border border-line p-0.5" value={v.hex} onChange={e => setV({ ...v, hex: e.target.value })} /></div>
          <div>
            <label className="lbl" htmlFor="pl-hex2">{t('pl.hex2')}</label>
            <div className="flex items-center gap-2">
              <input id="pl-hex2" type="color" className="h-10 w-14 cursor-pointer rounded-lg border border-line p-0.5" value={v.hex2 ?? '#ffffff'} onChange={e => setV({ ...v, hex2: e.target.value })} />
              {v.hex2 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setV({ ...v, hex2: null })}>{t('sg.remove')}</button>}
            </div>
          </div>
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <label className="btn btn-sm cursor-pointer">{t('pl.photo')}<input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) setPreview(URL.createObjectURL(f)) }} /></label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="" className="h-14 w-20 rounded-lg object-cover" />}
          <label className="chk ml-auto"><input type="checkbox" checked={v.active} onChange={e => setV({ ...v, active: e.target.checked })} />{t('pl.active')}</label>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={pending} onClick={save}>{t('c.save')}</button>
        <button className="btn btn-ghost" onClick={onClose}>{t('c.cancel')}</button>
        <span className="flex-1" />
        {v.id && <button className="btn btn-ghost btn-danger" disabled={pending} onClick={del}>{t('c.delete')}</button>}
      </div>
    </div>
  )
}
