import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getShopBySlug } from './data/shops'
import { getUser, membership } from './auth'
import { isLang } from './i18n'
import { getLang } from './i18n/server'
import type { Lang, Shop } from './types'

/** Shop for a public page + whether the visitor may see it before it's live. */
export const loadStorefront = cache(async (slug: string): Promise<{ shop: Shop; preview: boolean; open: boolean; lang: Lang }> => {
  const shop = await getShopBySlug(slug)
  if (!shop) notFound()
  let preview = false
  if (shop.status !== 'live') {
    const user = await getUser().catch(() => null)
    preview = !!(user && (await membership(shop.id, user)))
  }
  const c = (await cookies()).get('lang')?.value
  const lang = isLang(c) ? c : await getLang(shop.defaultLang)
  return { shop, preview, open: shop.status === 'live' || preview, lang }
})
