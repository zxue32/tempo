// Where a shop trades (CORE-03). A market fixes the currency, the phone region and the policies; the visitor's
// interface language never changes any of them. Markets live in trusted code: opening one is a code change
// after the local rules (prices, cancellations, consent, payments) have been checked by people, not guessed.

export const CURRENCIES = {
  USD: { minorDigits: 2 },
  JPY: { minorDigits: 0 },
  CNY: { minorDigits: 2 },
} as const
export type CurrencyCode = keyof typeof CURRENCIES
export const isCurrency = (v: unknown): v is CurrencyCode => typeof v === 'string' && v in CURRENCIES

export type PhoneRegion = 'US' | 'JP' | 'CN'

export type MarketProfile = {
  key: MarketKey
  countryCode: PhoneRegion
  currencies: readonly CurrencyCode[]
  /** how money and dates are written for this market, whatever language the page is in */
  numberLocale: string
  supportedLangs: readonly ('en' | 'zh')[]
  phoneRegion: PhoneRegion
  policyPackVersion: string
  /** shops here can take bookings */
  open: boolean
  /** real money can move here (also needs a configured provider). No market has this yet. */
  paymentsEnabled: boolean
  paymentProviders: readonly string[]
}

export const MARKET_KEYS = ['us', 'jp', 'cn'] as const
export type MarketKey = (typeof MARKET_KEYS)[number]
export const isMarketKey = (v: unknown): v is MarketKey => typeof v === 'string' && (MARKET_KEYS as readonly string[]).includes(v)

export const MARKETS: Record<MarketKey, MarketProfile> = {
  // first launch market (decision D2): United States, US dollars
  us: { key: 'us', countryCode: 'US', currencies: ['USD'], numberLocale: 'en-US', supportedLangs: ['en', 'zh'], phoneRegion: 'US', policyPackVersion: 'us-2026.1', open: true, paymentsEnabled: false, paymentProviders: [] },
  // configured so the contracts are exercised, but closed: no bookings, no payments
  jp: { key: 'jp', countryCode: 'JP', currencies: ['JPY'], numberLocale: 'ja-JP', supportedLangs: ['en', 'zh'], phoneRegion: 'JP', policyPackVersion: 'jp-draft', open: false, paymentsEnabled: false, paymentProviders: [] },
  cn: { key: 'cn', countryCode: 'CN', currencies: ['CNY'], numberLocale: 'zh-CN', supportedLangs: ['zh', 'en'], phoneRegion: 'CN', policyPackVersion: 'cn-draft', open: false, paymentsEnabled: false, paymentProviders: [] },
}

type MarketFields = { marketKey?: string | null; currency?: string | null }

/** A shop's market; shops saved before CORE-03 have none and are US shops. */
export function marketOf(shop: MarketFields, reg: Record<MarketKey, MarketProfile> = MARKETS): MarketProfile {
  return reg[isMarketKey(shop.marketKey) ? shop.marketKey : 'us']
}

/** The shop's settlement currency (always one of its market's). */
export function currencyOf(shop: MarketFields, reg: Record<MarketKey, MarketProfile> = MARKETS): CurrencyCode {
  const m = marketOf(shop, reg)
  return isCurrency(shop.currency) && m.currencies.includes(shop.currency) ? shop.currency : m.currencies[0]
}

export const marketOpen = (shop: MarketFields, reg: Record<MarketKey, MarketProfile> = MARKETS) => marketOf(shop, reg).open

/**
 * Whether real money may move for this shop. Closed unless the market is open, payments are switched on for it
 * and a provider the market allows is configured. Nothing in the app can turn this on by itself.
 */
export function paymentGate(shop: MarketFields, configuredProvider: string | null, reg: Record<MarketKey, MarketProfile> = MARKETS):
  { allowed: true } | { allowed: false; code: 'MARKET_UNSUPPORTED' | 'PAYMENTS_OFF' | 'NO_PROVIDER' } {
  const m = marketOf(shop, reg)
  if (!m.open) return { allowed: false, code: 'MARKET_UNSUPPORTED' }
  if (!m.paymentsEnabled) return { allowed: false, code: 'PAYMENTS_OFF' }
  if (!configuredProvider || !m.paymentProviders.includes(configuredProvider)) return { allowed: false, code: 'NO_PROVIDER' }
  return { allowed: true }
}
