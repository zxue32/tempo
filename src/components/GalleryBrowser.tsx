'use client'
import { useMemo, useState } from 'react'
import { useI18n } from './i18n'
import { StoreGallery } from './StoreGallery'
import type { Look } from '@/lib/looks'

type Opt = { id: string; label: string; hex?: string }

/** Gallery with big tap-able filters: who, length, style, colour. */
export function GalleryBrowser({ slug, looks, people, colors, initialStaff }: { slug: string; looks: Look[]; people: Opt[]; colors: Opt[]; initialStaff?: string | null }) {
  const { t } = useI18n()
  const [who, setWho] = useState<string | null>(initialStaff ?? null)
  const [len, setLen] = useState<string | null>(null)
  const [style, setStyle] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const styles = useMemo(() => Array.from(new Set(looks.flatMap(l => l.tags.style ?? []))), [looks])
  const lengths = useMemo(() => (['short', 'medium', 'long'] as const).filter(l => looks.some(x => x.tags.length === l)), [looks])
  const usedColors = useMemo(() => colors.filter(c => looks.some(l => l.tags.colorId === c.id)), [colors, looks])
  const shown = looks.filter(l => (!who || l.staffId === who) && (!len || l.tags.length === len) && (!style || l.tags.style?.includes(style)) && (!color || l.tags.colorId === color))
  const Chip = ({ on, onClick, children, swatch }: { on: boolean; onClick: () => void; children: React.ReactNode; swatch?: string }) => (
    <button type="button" aria-pressed={on} onClick={onClick} className="s-chip h-10 gap-2 px-3.5 text-[13.5px]" style={on ? { background: 'var(--s-ink)', color: 'var(--s-bg)' } : undefined}>
      {swatch && <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: swatch }} />}{children}
    </button>
  )
  const row = (label: string, items: Opt[], value: string | null, set: (v: string | null) => void) => items.length > 1 || (items.length === 1 && value) ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 text-[12px] font-bold uppercase tracking-wider s-muted">{label}</span>
      <Chip on={!value} onClick={() => set(null)}>{t('tag.any')}</Chip>
      {items.map(o => <Chip key={o.id} on={value === o.id} onClick={() => set(value === o.id ? null : o.id)} swatch={o.hex}>{o.label}</Chip>)}
    </div>
  ) : null
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {row(t('sf2.team'), people.map(p => ({ id: p.id, label: p.label })), who, setWho)}
        {row(t('tag.length'), lengths.map(l => ({ id: l, label: t(`tag.len.${l}`) })), len, setLen)}
        {row(t('tag.style'), styles.map(s => ({ id: s, label: t(`tag.${s}` as never) })), style, setStyle)}
        {row(t('tag.color'), usedColors, color, setColor)}
      </div>
      {shown.length ? <StoreGallery slug={slug} looks={shown} columns={4} /> : <p className="s-muted">{t('gl.noMatch')}</p>}
    </div>
  )
}
