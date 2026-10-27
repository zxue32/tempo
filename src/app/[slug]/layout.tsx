import type { Metadata } from 'next'
import { loadStorefront } from '@/lib/storefront'
import { themeVars, themeOf } from '@/lib/themes'
import { I18nProvider } from '@/components/i18n'
import { pick } from '@/lib/i18n'

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params
  const { shop, lang } = await loadStorefront(slug)
  const name = pick(lang, shop.name, shop.nameZh)
  return {
    title: { absolute: name },
    description: pick(lang, shop.aboutEn, shop.aboutZh)?.slice(0, 160) || name,
    robots: shop.status === 'live' ? undefined : { index: false },
    openGraph: { title: name, images: shop.coverUrl ? [shop.coverUrl] : undefined },
  }
}

export default async function StoreLayout(props: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const { shop, lang } = await loadStorefront(slug)
  const theme = themeOf(shop.theme)
  return (
    <I18nProvider lang={lang}>
      <link rel="stylesheet" href={theme.fontsHref} precedence="default" />
      <div className="s-root" style={themeVars(shop.theme, shop.accent) as React.CSSProperties}>{props.children}</div>
    </I18nProvider>
  )
}
