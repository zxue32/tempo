import Link from 'next/link'
import { loadStorefront } from '@/lib/storefront'
import { loadCatalog } from '@/lib/data/catalog'
import { listGallery } from '@/lib/data/rules'
import { looksFrom } from '@/lib/looks'
import { makeT, pick } from '@/lib/i18n'
import { StoreHeader, PreviewBanner } from '@/components/store'
import { StoreGallery } from '@/components/StoreGallery'

export default async function GalleryPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await props.params
  const sp = await props.searchParams
  const { shop, preview, open, lang } = await loadStorefront(slug)
  const t = makeT(lang)
  const [catalog, gallery] = await Promise.all([loadCatalog(shop.id, { forCustomers: true }), open ? listGallery(shop.id) : Promise.resolve([])])
  const all = looksFrom(gallery, catalog.staff, catalog.services, lang)
  const people = catalog.staff.filter(s => all.some(l => l.staffId === s.id))
  const who = people.find(p => p.id === sp.staff)?.id ?? null
  const looks = who ? all.filter(l => l.staffId === who) : all
  return (
    <div className="min-h-screen pb-16">
      {preview && shop.status !== 'live' && <PreviewBanner text={t('sf2.previewBanner')} />}
      <StoreHeader shop={shop} lang={lang} back={{ href: `/${shop.slug}`, label: t('c.back') }} />
      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="s-display text-[34px] leading-tight">{t('gl.title')}</h1>
          <Link href={`/${shop.slug}/book`} className="s-btn">{t('sf2.bookNow')}</Link>
        </div>
        {people.length > 1 && (
          <nav className="flex flex-wrap gap-2" aria-label={t('gl.title')}>
            <Link href={`/${shop.slug}/gallery`} className="s-chip no-underline" aria-current={!who ? 'page' : undefined} style={!who ? { background: 'var(--s-ink)', color: 'var(--s-bg)' } : undefined}>{t('gl.everyone')}</Link>
            {people.map(p => (
              <Link key={p.id} href={`/${shop.slug}/gallery?staff=${p.id}`} className="s-chip no-underline" aria-current={who === p.id ? 'page' : undefined} style={who === p.id ? { background: 'var(--s-ink)', color: 'var(--s-bg)' } : undefined}>{pick(lang, p.name, p.nameZh)}</Link>
            ))}
          </nav>
        )}
        {looks.length ? <StoreGallery slug={shop.slug} looks={looks} columns={4} /> : <p className="s-muted">{t('gl.empty')}</p>}
      </main>
    </div>
  )
}
