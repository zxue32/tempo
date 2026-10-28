import { notFound } from 'next/navigation'
import { hasNailTools } from '@/lib/templates'
import { loadStorefront } from '@/lib/storefront'
import { loadCatalog } from '@/lib/data/catalog'
import { makeT, pick } from '@/lib/i18n'
import { StoreHeader, PreviewBanner } from '@/components/store'
import { DesignStudio } from './DesignStudio'
import { studioVars } from '@/lib/themes'

export const metadata = { robots: { index: false } }

/** The shop's 3D nail studio (nail shops only). Same access rules as the shop page and booking. */
export default async function DesignPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await props.params
  const sp = await props.searchParams
  const { shop, preview, open, lang } = await loadStorefront(slug)
  if (!hasNailTools(shop.industry)) notFound()
  const t = makeT(lang)
  if (!open) {
    return (
      <div className="min-h-screen">
        <StoreHeader shop={shop} lang={lang} back={{ href: `/${shop.slug}`, label: t('c.back') }} />
        <main className="mx-auto max-w-xl px-4 py-16"><h1 className="s-display text-[34px]">{t('sf2.comingSoon')}</h1><p className="s-muted mt-2">{t('sf2.comingSoonD')}</p></main>
      </div>
    )
  }
  const asked = typeof sp.service === 'string' && /^[0-9a-f-]{36}$/i.test(sp.service) ? sp.service : null
  const { services } = await loadCatalog(shop.id, { forCustomers: true })
  const main = services.filter(s => s.kind === 'service')
  const serviceId = (asked && main.some(s => s.id === asked) ? asked : null) ?? main.find(s => s.category === 'hand')?.id ?? null
  return (
    <div className="min-h-screen">
      {preview && shop.status !== 'live' && <PreviewBanner text={t('sf2.previewBanner')} />}
      <StoreHeader shop={shop} lang={lang} back={{ href: `/${shop.slug}`, label: t('c.back') }} />
      <main className="mx-auto max-w-[1440px] px-2 pb-10 pt-2 sm:px-4">
        <h1 className="sr-only">{t('lu.title')}</h1>
        <DesignStudio slug={shop.slug} brand={pick(lang, shop.name, shop.nameZh)} serviceId={serviceId} vars={studioVars(shop.theme, shop.accent)} />
        <p className="mx-auto mt-4 max-w-3xl px-2 text-center text-[13px] s-muted">{t('lu.note')}</p>
      </main>
    </div>
  )
}
