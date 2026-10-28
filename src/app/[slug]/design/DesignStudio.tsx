'use client'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { LuneStudio, type BookPayload, type StudioElement } from '@/components/LuneStudio'
import { isLuneDesign, luneToNailDesign, saveHandoff } from '@/lib/lune'

/** The 3D studio page: "book with this design" carries the design card and the technician's note into booking. */
export function DesignStudio({ slug, brand, serviceId }: { slug: string; brand: string; serviceId: string | null }) {
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const onBook = useCallback(async ({ design, summary }: BookPayload, el: StudioElement) => {
    if (busy || !isLuneDesign(design)) return
    setBusy(true)
    let card: Blob | null = null
    try { card = await el.exportCard() } catch { card = null }   // the booking still carries the design and the note
    saveHandoff({ slug, design: luneToNailDesign(design), summary, name: design.name }, card)
    router.push(`/${slug}/book?${new URLSearchParams({ ...(serviceId ? { service: serviceId } : {}), from: 'design' })}`)
  }, [busy, router, serviceId, slug])
  return (
    <>
      <LuneStudio storageKey={`tempo.lune:${slug}`} brand={brand} onBook={onBook} labels={{ loading: t('lu.loading'), failed: t('lu.failed') }} />
      {busy && <p role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-3 text-[14px] text-white shadow-lg" style={{ background: 'var(--s-accent, #783c4a)' }}>{t('lu.taking')}</p>}
    </>
  )
}
