// A shop's industries, read from `app.shop_industries` when the load included them, otherwise from the
// legacy single `industry` column (dual read while both exist). Safe in client components.
import { legacyToIndustries, type IndustryKey } from './registry'

export type ShopIndustryFields = { industry: string; industries?: readonly IndustryKey[] | null }

export function shopIndustries(shop: ShopIndustryFields): IndustryKey[] {
  return shop.industries?.length ? [...shop.industries] : legacyToIndustries(shop.industry)
}

/** The 3D nail studio and the nail colour board. */
export const shopHasNailTools = (shop: ShopIndustryFields) => shopIndustries(shop).includes('nail')

/** The hair colour board. */
export const shopHasHairTools = (shop: ShopIndustryFields) => {
  const i = shopIndustries(shop)
  return i.includes('hair') || i.includes('barber')
}
