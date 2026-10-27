import { loadStorefront } from '@/lib/storefront'
import { makeT } from '@/lib/i18n'
import { StoreHeader } from '@/components/store'
import { FindForm } from './FindForm'

export const metadata = { robots: { index: false } }

export default async function Find(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await props.params
  const sp = await props.searchParams
  const { shop, lang } = await loadStorefront(slug)
  const t = makeT(lang)
  return (
    <div className="min-h-screen">
      <StoreHeader shop={shop} lang={lang} back={{ href: `/${shop.slug}`, label: t('c.back') }} />
      <main className="mx-auto max-w-md px-4 pb-16 pt-4">
        <h1 className="s-display text-[30px]">{t('mg.findTitle')}</h1>
        <p className="mb-5 s-muted">{t('mg.findSub')}</p>
        <FindForm slug={shop.slug} defaultCode={(sp.code ?? '').slice(0, 8)} />
      </main>
    </div>
  )
}
