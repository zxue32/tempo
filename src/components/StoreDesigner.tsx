'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from './i18n'
import type { NailDesign } from '@/lib/types'
import { DEFAULT_DESIGN } from './NailArt'
import { NailDesigner, encodeDesign, type SwatchOption } from './NailDesigner'

/** "Design your nails" on the shop page; the design travels to the booking page in the link. */
export function StoreDesigner({ slug, swatches, serviceId }: { slug: string; swatches: SwatchOption[]; serviceId?: string | null }) {
  const { t } = useI18n()
  const [d, setD] = useState<NailDesign>({ ...DEFAULT_DESIGN, color: swatches[0]?.hex ?? DEFAULT_DESIGN.color, colorName: swatches[0]?.name ?? null })
  const href = `/${slug}/book?${new URLSearchParams({ ...(serviceId ? { service: serviceId } : {}), design: encodeDesign(d) })}`
  return (
    <div className="flex flex-col gap-4">
      <NailDesigner value={d} onChange={setD} swatches={swatches} />
      <Link href={href} className="s-btn self-start">{t('nd.bookWith')}</Link>
    </div>
  )
}
