'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from './i18n'

export type HairSwatch = { id: string; label: string; code: string | null; hex: string; hex2: string | null; photoUrl: string | null }

/** Hair colour swatches on the shop page: tap one to see it big, then book with it. */
export function HairPalette({ slug, swatches, serviceId }: { slug: string; swatches: HairSwatch[]; serviceId?: string | null }) {
  const { t } = useI18n()
  const [sel, setSel] = useState<HairSwatch | null>(null)
  const bg = (s: HairSwatch) => (s.hex2 ? `linear-gradient(135deg, ${s.hex}, ${s.hex2})` : s.hex)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8" role="radiogroup" aria-label={t('hc.title')}>
        {swatches.map(s => {
          const on = sel?.id === s.id
          return (
            <button key={s.id} type="button" role="radio" aria-checked={on} aria-label={`${s.label}${s.code ? ' ' + s.code : ''}`} onClick={() => setSel(on ? null : s)} className="flex flex-col items-center gap-1.5 text-center">
              <span className="block aspect-square w-full rounded-2xl border-2" style={{ background: bg(s), borderColor: on ? 'var(--s-ink)' : 'rgba(0,0,0,.08)', boxShadow: on ? '0 0 0 3px var(--s-bg), 0 0 0 5px var(--s-ink)' : 'none' }} />
              <span className="text-[12px] font-semibold leading-tight">{s.code || s.label}</span>
            </button>
          )
        })}
      </div>
      {sel && (
        <div className="s-card flex flex-col gap-3 overflow-hidden sm:flex-row">
          {sel.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sel.photoUrl} alt={sel.label} className="aspect-[4/3] w-full object-cover sm:w-64" />
          ) : <div className="aspect-[4/3] w-full sm:w-64" style={{ background: bg(sel) }} />}
          <div className="flex flex-col gap-2 p-4">
            <b className="text-[18px]">{sel.label}</b>
            {sel.code && <span className="s-muted">{sel.code}</span>}
            <Link href={`/${slug}/book?${new URLSearchParams({ ...(serviceId ? { service: serviceId } : {}), color: sel.id })}`} className="s-btn mt-auto self-start">{t('hc.bookWith')}</Link>
          </div>
        </div>
      )}
    </div>
  )
}
