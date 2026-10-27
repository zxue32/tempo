import Link from 'next/link'
import { loadStorefront } from '@/lib/storefront'
import { loadCatalog } from '@/lib/data/catalog'
import { listGallery, listPalette } from '@/lib/data/rules'
import { GalleryBrowser } from '@/components/GalleryBrowser'
import { looksFrom } from '@/lib/looks'
import { makeT, pick } from '@/lib/i18n'
import { StoreHeader, PreviewBanner } from '@/components/store'

export default async function GalleryPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await props.params
  const sp = await props.searchParams
  const { shop, preview, open, lang } = await loadStorefront(slug)
  const t = makeT(lang)
  const [catalog, gallery, palette] = await Promise.all([loadCatalog(shop.id, { forCustomers: true }), open ? listGallery(shop.id) : Promise.resolve([]), open ? listPalette(shop.id, undefined, true) : Promise.resolve([])])
  const all = looksFrom(gallery, catalog.staff, catalog.services, lang)
  const people = catalog.staff.filter(s => all.some(l => l.staffId === s.id))
  const who = people.find(p => p.id === sp.staff)?.id ?? null
  return (
    <div className="min-h-screen pb-16">
      {preview && shop.status !== 'live' && <PreviewBanner text={t('sf2.previewBanner')} />}
      <StoreHeader shop={shop} lang={lang} back={{ href: `/${shop.slug}`, label: t('c.back') }} />
      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="s-display text-[34px] leading-tight">{t('gl.title')}</h1>
          <Link href={`/${shop.slug}/book`} className="s-btn">{t('sf2.bookNow')}</Link>
        </div>
        {all.length ? (
          <GalleryBrowser slug={shop.slug} looks={all} initialStaff={who}
            people={people.map(p => ({ id: p.id, label: pick(lang, p.name, p.nameZh) }))}
            colors={palette.map(c => ({ id: c.id, label: pick(lang, c.name, c.nameZh) + (c.code ? ` ${c.code}` : ''), hex: c.hex2 ? `linear-gradient(135deg, ${c.hex}, ${c.hex2})` : c.hex }))} />
        ) : <p className="s-muted">{t('gl.empty')}</p>}
      </main>
    </div>
  )
}
