'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useI18n } from './i18n'

import type { Look } from '@/lib/looks'

/** Photo grid with a full-screen viewer and "Book this look". */
export function StoreGallery({ slug, looks, columns = 3 }: { slug: string; looks: Look[]; columns?: 2 | 3 | 4 }) {
  const { t } = useI18n()
  const [open, setOpen] = useState<number | null>(null)
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open !== null && !d.open) d.showModal()
    if (open === null && d.open) d.close()
  }, [open])
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setOpen(i => (i === null ? i : (i + 1) % looks.length))
      if (e.key === 'ArrowLeft') setOpen(i => (i === null ? i : (i - 1 + looks.length) % looks.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, looks.length])
  const cur = open === null ? null : looks[open]
  const book = (l: Look) => `/${slug}/book?${new URLSearchParams({ ...(l.serviceId ? { service: l.serviceId } : {}), ...(l.staffId ? { staff: l.staffId } : {}), look: l.id })}`
  const cols = columns === 4 ? 'sm:grid-cols-4' : columns === 2 ? '' : 'sm:grid-cols-3'
  return (
    <>
      <ul className={`grid grid-cols-2 gap-2 ${cols}`}>
        {looks.map((l, i) => (
          <li key={l.id}>
            <button type="button" onClick={() => setOpen(i)} className="block w-full overflow-hidden" style={{ borderRadius: 'var(--s-rs)' }} aria-label={l.caption || t('gl.open')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.url} alt={l.caption || ''} loading="lazy" className="aspect-square w-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
            </button>
          </li>
        ))}
      </ul>
      <dialog ref={ref} onClose={() => setOpen(null)} onClick={e => { if (e.target === ref.current) setOpen(null) }}
        className="m-auto max-h-[94vh] w-[min(94vw,760px)] overflow-hidden p-0 backdrop:bg-black/75" style={{ background: 'var(--s-bg)', color: 'var(--s-ink)', borderRadius: 'var(--s-rs)' }}>
        {cur && (
          <div className="flex max-h-[94vh] flex-col">
            <div className="relative min-h-0 flex-1 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cur.url} alt={cur.caption || ''} className="mx-auto max-h-[70vh] w-auto object-contain" />
              {looks.length > 1 && <>
                <button type="button" aria-label={t('gl.prev')} onClick={() => setOpen((open! - 1 + looks.length) % looks.length)} className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[20px] text-black">‹</button>
                <button type="button" aria-label={t('gl.next')} onClick={() => setOpen((open! + 1) % looks.length)} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[20px] text-black">›</button>
              </>}
              <button type="button" aria-label={t('c.close')} onClick={() => setOpen(null)} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white/85 text-[18px] text-black">×</button>
            </div>
            <div className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                {cur.caption && <b className="block">{cur.caption}</b>}
                <span className="block text-[13.5px] s-muted">{[cur.serviceName, cur.staffName && t('gl.by', cur.staffName)].filter(Boolean).join(' · ')}</span>
              </div>
              <Link href={book(cur)} className="s-btn">{t('gl.book')}</Link>
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
