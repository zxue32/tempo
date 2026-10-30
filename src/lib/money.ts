// Money as an integer number of the currency's smallest unit (CORE-03). Never assume "× 100":
// a dollar has 2 decimals, a yen has none. The `price_cents` columns hold minor units of the shop's currency.
import { CURRENCIES, MARKETS, type CurrencyCode } from './markets'

export type Money = { amountMinor: number; currency: CurrencyCode }

export const minorDigits = (c: CurrencyCode) => CURRENCIES[c].minorDigits

/** "12.5" → 1250 (USD), "1200" → 1200 (JPY). Null for anything that isn't a plain non-negative amount
    with at most the currency's decimals: "12.345" dollars or "12.5" yen are refused, not rounded. */
export function toMinor(input: string | number, currency: CurrencyCode): number | null {
  const s = String(input).trim().replace(/,/g, '')
  const m = /^(\d{1,9})(?:\.(\d*))?$/.exec(s)
  if (!m) return null
  const digits = minorDigits(currency)
  const frac = (m[2] ?? '').replace(/0+$/, '')
  if (frac.length > digits) return null
  return Number(m[1]) * 10 ** digits + (frac ? Number(frac.padEnd(digits, '0')) : 0)
}

/** 1250 → "12.50" (USD), 1200 → "1200" (JPY): the plain number for an input field or a CSV. */
export function fromMinor(amountMinor: number, currency: CurrencyCode): string {
  const d = minorDigits(currency)
  if (d === 0) return String(amountMinor)
  const neg = amountMinor < 0 ? '-' : ''
  const a = Math.abs(amountMinor)
  return `${neg}${Math.floor(a / 10 ** d)}.${String(a % 10 ** d).padStart(d, '0')}`
}

const fmtCache = new Map<string, Intl.NumberFormat>()
const LOCALE: Record<CurrencyCode, string> = { USD: MARKETS.us.numberLocale, JPY: 'en-US', CNY: 'en-US' }

/**
 * "$12", "$12.50", "¥1,200". Written the same whichever interface language the visitor picked:
 * the language changes words, never amounts. Whole amounts drop the decimals, like a price list.
 */
export function formatMoney(amountMinor: number, currency: CurrencyCode = 'USD'): string {
  const d = minorDigits(currency)
  const whole = amountMinor % 10 ** d === 0
  const key = `${currency}:${whole}`
  let f = fmtCache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(LOCALE[currency], { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: whole ? 0 : d, maximumFractionDigits: whole ? 0 : d })
    fmtCache.set(key, f)
  }
  return f.format(amountMinor / 10 ** d)
}

/** Adding amounts of two currencies is a bug, not a conversion. */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`currency mismatch: ${a.currency} + ${b.currency}`)
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency }
}
