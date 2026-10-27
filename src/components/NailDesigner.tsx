'use client'
import { useMemo, useState } from 'react'
import { useI18n } from './i18n'
import { pick } from '@/lib/i18n'
import type { NailDesign } from '@/lib/types'
import { DEFAULT_DESIGN, DEFAULT_NAIL_COLORS, NAIL_ARTS, NAIL_FINISHES, NAIL_LENGTHS, NAIL_SHAPES, NailArt, NailIcon } from './NailArt'

export type SwatchOption = { hex: string; name: string; nameZh?: string | null; code?: string | null }

/** Design-your-nails: tap big buttons, the hand on top updates at once. Works without a camera. */
export function NailDesigner({ value, onChange, swatches, compact = false }: {
  value?: NailDesign; onChange: (d: NailDesign) => void; swatches?: SwatchOption[]; compact?: boolean
}) {
  const { t, lang } = useI18n()
  const [d, setD] = useState<NailDesign>(value ?? DEFAULT_DESIGN)
  const [custom, setCustom] = useState(false)
  const colors = useMemo<SwatchOption[]>(() => (swatches && swatches.length ? swatches : DEFAULT_NAIL_COLORS), [swatches])
  const set = (patch: Partial<NailDesign>) => { const next = { ...d, ...patch }; setD(next); onChange(next) }
  const colorName = (hex: string) => { const c = colors.find(x => x.hex.toLowerCase() === hex.toLowerCase()); return c ? pick(lang, c.name, c.nameZh ?? null) + (c.code ? ` ${c.code}` : '') : null }
  const Chip = ({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) => (
    <button type="button" role="radio" aria-checked={on} aria-label={label} onClick={onClick}
      className="flex min-h-[52px] min-w-[64px] flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-2 text-[13px] font-semibold"
      style={on ? { background: 'var(--s-ink)', color: 'var(--s-bg)', borderColor: 'var(--s-ink)' } : { borderColor: 'var(--s-line)', background: 'var(--s-surface)' }}>
      {children}
    </button>
  )
  const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11.5px] font-bold uppercase tracking-[.14em] s-muted">{title}</h3>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={title}>{children}</div>
    </section>
  )

  return (
    <div className={`grid gap-5 ${compact ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'}`}>
      <div className="flex flex-col items-center gap-2">
        <NailArt design={d} size={compact ? 240 : 330} uid="nd" className="max-w-full" />
        <p className="text-center text-[13.5px] s-muted">{t('nd.preview')}</p>
      </div>
      <div className="flex flex-col gap-5">
        <Row title={t('nd.shapeT')}>
          {NAIL_SHAPES.map(s => <Chip key={s} on={d.shape === s} onClick={() => set({ shape: s })}><NailIcon shape={s} length="medium" color={d.shape === s ? 'rgba(255,255,255,.85)' : d.color} size={22} />{t(`nd.shape.${s}`)}</Chip>)}
        </Row>
        <Row title={t('nd.lengthT')}>
          {NAIL_LENGTHS.map(l => <Chip key={l} on={d.length === l} onClick={() => set({ length: l })}><NailIcon shape={d.shape} length={l} color={d.length === l ? 'rgba(255,255,255,.85)' : d.color} size={18} />{t(`nd.length.${l}`)}</Chip>)}
        </Row>
        <Row title={t('nd.colorT')}>
          {colors.map(c => {
            const on = d.color.toLowerCase() === c.hex.toLowerCase()
            return (
              <button key={c.hex} type="button" role="radio" aria-checked={on} aria-label={pick(lang, c.name, c.nameZh ?? null)} title={pick(lang, c.name, c.nameZh ?? null)}
                onClick={() => { setCustom(false); set({ color: c.hex, colorName: pick(lang, c.name, c.nameZh ?? null) + (c.code ? ` ${c.code}` : '') }) }}
                className="h-11 w-11 rounded-full border-2" style={{ background: c.hex, borderColor: on ? 'var(--s-ink)' : 'rgba(0,0,0,.12)', boxShadow: on ? '0 0 0 3px var(--s-bg), 0 0 0 5px var(--s-ink)' : 'none' }} />
            )
          })}
          <label className="flex h-11 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold s-line" style={custom ? { borderColor: 'var(--s-ink)' } : {}}>
            <input type="color" value={d.color} onChange={e => { setCustom(true); set({ color: e.target.value, colorName: null }) }} className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label={t('nd.customColor')} />
            {t('nd.customColor')}
          </label>
        </Row>
        {colorName(d.color) && <p className="-mt-3 text-[13px] s-muted">{t('nd.chosenColor', colorName(d.color)!)}</p>}
        <Row title={t('nd.finishT')}>
          {NAIL_FINISHES.map(f => <Chip key={f} on={d.finish === f} onClick={() => set({ finish: f })}>{t(`nd.finish.${f}`)}</Chip>)}
        </Row>
        <Row title={t('nd.artT')}>
          {NAIL_ARTS.map(a => <Chip key={a} on={d.art === a} onClick={() => set({ art: a })}>{t(`nd.art.${a}`)}</Chip>)}
        </Row>
        {d.art !== 'plain' && (
          <Row title={t('nd.color2T')}>
            {[{ hex: '#F7F3EE', name: 'White', nameZh: '白色' }, { hex: '#D4AF37', name: 'Gold', nameZh: '金色' }, { hex: '#C9CBD3', name: 'Silver', nameZh: '银色' }, { hex: '#1E1E22', name: 'Black', nameZh: '黑色' }, ...colors.slice(0, 8)].map(c => {
              const on = (d.color2 || '').toLowerCase() === c.hex.toLowerCase()
              return <button key={c.hex} type="button" role="radio" aria-checked={on} aria-label={pick(lang, c.name, c.nameZh ?? null)} onClick={() => set({ color2: c.hex })}
                className="h-9 w-9 rounded-full border-2" style={{ background: c.hex, borderColor: on ? 'var(--s-ink)' : 'rgba(0,0,0,.12)', boxShadow: on ? '0 0 0 2px var(--s-bg), 0 0 0 4px var(--s-ink)' : 'none' }} />
            })}
          </Row>
        )}
      </div>
    </div>
  )
}

/** Renders the design to a PNG blob (for the reference photo the technician sees). */
export async function designToPng(svgEl: SVGSVGElement, width = 840): Promise<Blob> {
  const xml = new XMLSerializer().serializeToString(svgEl)
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('svg')); img.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = Math.round(width * 360 / 420)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#FBF6F2'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((ok, bad) => canvas.toBlob(b => (b ? ok(b) : bad(new Error('png'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function encodeDesign(d: NailDesign): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
