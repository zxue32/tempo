import { describe, expect, it } from 'vitest'
import { MARKETS, marketOf, currencyOf, marketOpen, paymentGate } from '../src/lib/markets'
import { toMinor, fromMinor, formatMoney, addMoney, minorDigits } from '../src/lib/money'
import { parsePhone, phoneKey, legacyPhoneKey } from '../src/lib/phone'
import { dstRanges, resolveLocal, zonedToUtc } from '../src/lib/tz'

describe('markets (CORE-03)', () => {
  it('opens the United States in dollars and keeps Japan and China configured but closed', () => {
    expect(MARKETS.us).toMatchObject({ open: true, currencies: ['USD'], phoneRegion: 'US' })
    expect(MARKETS.jp).toMatchObject({ open: false, currencies: ['JPY'] })
    expect(MARKETS.cn).toMatchObject({ open: false, currencies: ['CNY'] })
  })

  it('treats shops saved before markets existed as US dollar shops', () => {
    expect(marketOf({}).key).toBe('us')
    expect(currencyOf({})).toBe('USD')
    expect(currencyOf({ marketKey: 'jp', currency: 'JPY' })).toBe('JPY')
    // a currency the market doesn't use falls back to the market's own
    expect(currencyOf({ marketKey: 'us', currency: 'JPY' })).toBe('USD')
    expect(marketOpen({ marketKey: 'jp' })).toBe(false)
  })

  it('keeps real payments closed until a market, its payment switch and a provider all say yes', () => {
    expect(paymentGate({ marketKey: 'jp' }, 'stripe')).toEqual({ allowed: false, code: 'MARKET_UNSUPPORTED' })
    expect(paymentGate({ marketKey: 'us' }, 'stripe')).toEqual({ allowed: false, code: 'PAYMENTS_OFF' })
    const on = { ...MARKETS, us: { ...MARKETS.us, paymentsEnabled: true, paymentProviders: ['stripe'] } }
    expect(paymentGate({ marketKey: 'us' }, null, on)).toEqual({ allowed: false, code: 'NO_PROVIDER' })
    expect(paymentGate({ marketKey: 'us' }, 'paypal', on)).toEqual({ allowed: false, code: 'NO_PROVIDER' })
    expect(paymentGate({ marketKey: 'us' }, 'stripe', on)).toEqual({ allowed: true })
  })
})

describe('money in minor units (CORE-03)', () => {
  it('knows a dollar has cents and a yen has none', () => {
    expect(minorDigits('USD')).toBe(2)
    expect(minorDigits('JPY')).toBe(0)
    expect(toMinor('12.5', 'USD')).toBe(1250)
    expect(toMinor('12', 'USD')).toBe(1200)
    expect(toMinor('1,200', 'JPY')).toBe(1200)
    expect(toMinor('1200', 'JPY')).toBe(1200)
    expect(toMinor('0.30', 'USD')).toBe(30)
    expect(toMinor(19.99, 'USD')).toBe(1999) // 19.99 * 100 is 1998.9999… in floating point
  })

  it('refuses amounts it would have to round or guess', () => {
    expect(toMinor('12.345', 'USD')).toBeNull()
    expect(toMinor('12.5', 'JPY')).toBeNull()
    expect(toMinor('-5', 'USD')).toBeNull()
    expect(toMinor('abc', 'USD')).toBeNull()
    expect(toMinor('', 'USD')).toBeNull()
    expect(toMinor('12.50', 'JPY')).toBeNull()
    expect(toMinor('12.00', 'JPY')).toBe(12)
  })

  it('writes amounts back without float drift', () => {
    expect(fromMinor(1250, 'USD')).toBe('12.50')
    expect(fromMinor(5, 'USD')).toBe('0.05')
    expect(fromMinor(1200, 'JPY')).toBe('1200')
    for (const n of [0, 1, 99, 100, 1999, 123456789]) expect(toMinor(fromMinor(n, 'USD'), 'USD')).toBe(n)
  })

  it('shows prices the same way in every interface language', () => {
    expect(formatMoney(4500, 'USD')).toBe('$45')
    expect(formatMoney(4550, 'USD')).toBe('$45.50')
    expect(formatMoney(120000, 'USD')).toBe('$1,200')
    expect(formatMoney(1200, 'JPY')).toBe('¥1,200')
    expect(formatMoney(4500)).toBe('$45') // shops saved before CORE-03
  })

  it('never adds two currencies together', () => {
    expect(addMoney({ amountMinor: 100, currency: 'USD' }, { amountMinor: 250, currency: 'USD' })).toEqual({ amountMinor: 350, currency: 'USD' })
    expect(() => addMoney({ amountMinor: 100, currency: 'USD' }, { amountMinor: 100, currency: 'JPY' })).toThrow(/mismatch/)
  })
})

describe('phone numbers read in the shop’s region (CORE-03)', () => {
  it('reads a US number however it was typed, with the same key as before', () => {
    for (const raw of ['(555) 555-0100', '555.555.0100', '1-555-555-0100', '+1 555 555 0100']) {
      expect(parsePhone(raw, 'US')).toEqual({ e164: '+15555550100', key: '5555550100', international: '+1 555 555 0100' })
      expect(phoneKey(raw, 'US')).toBe(legacyPhoneKey(raw))
    }
  })

  it('keeps a foreign number’s country code, so two countries never share a customer', () => {
    expect(parsePhone('+44 20 7946 0958', 'US')?.key).toBe('442079460958')
    expect(phoneKey('+44 20 7946 0958', 'US')).not.toBe(phoneKey('(207) 946-0958', 'US'))
    expect(parsePhone('+81 90 1234 5678', 'US')?.e164).toBe('+819012345678')
  })

  it('reads a number without a country code in the shop’s own region', () => {
    expect(parsePhone('090-1234-5678', 'JP')?.e164).toBe('+819012345678')
    expect(parsePhone('138 1234 5678', 'CN')?.e164).toBe('+8613812345678')
    // the same digits mean a different number in a US shop
    expect(parsePhone('13812345678', 'US')?.e164).toBe('+13812345678')
  })

  it('refuses what can’t be a phone number and keeps the old key for it', () => {
    expect(parsePhone('555-0100', 'US')).toBeNull()
    expect(parsePhone('call me', 'US')).toBeNull()
    expect(parsePhone('', 'US')).toBeNull()
    expect(phoneKey('555-0100', 'US')).toBe('5550100')
  })
})

describe('clock changes (CORE-03)', () => {
  const NY = 'America/New_York'
  it('finds the hour that never happens and the hour that happens twice', () => {
    expect(dstRanges('2026-03-08', NY)).toEqual([{ kind: 'gap', from: 120, to: 180, before: -300, after: -240 }])
    expect(dstRanges('2026-11-01', NY)).toEqual([{ kind: 'repeat', from: 60, to: 120, before: -240, after: -300 }])
    expect(dstRanges('2026-03-07', NY)).toEqual([])
    expect(dstRanges('2026-03-09', NY)).toEqual([])
    expect(dstRanges('2026-03-08', 'Asia/Tokyo')).toEqual([])
    // Southern hemisphere, half-hour zone, and a change at midnight
    expect(dstRanges('2026-10-04', 'Australia/Sydney')).toEqual([{ kind: 'gap', from: 120, to: 180, before: 600, after: 660 }])
    expect(dstRanges('2026-04-05', 'Australia/Lord_Howe')).toEqual([{ kind: 'repeat', from: 90, to: 120, before: 660, after: 630 }])
    expect(dstRanges('2026-03-29', 'Europe/London')).toEqual([{ kind: 'gap', from: 60, to: 120, before: 0, after: 60 }])
  })

  it('rejects a time that doesn’t exist and asks which one for a time that happens twice', () => {
    expect(resolveLocal('2026-03-08', 150, NY)).toEqual({ kind: 'gap' })
    const twice = resolveLocal('2026-11-01', 90, NY)
    expect(twice).toEqual({ kind: 'ambiguous', earlier: new Date('2026-11-01T05:30:00Z'), later: new Date('2026-11-01T06:30:00Z') })
    expect(resolveLocal('2026-11-01', 150, NY)).toEqual({ kind: 'ok', utc: new Date('2026-11-01T07:30:00Z') })
    expect(resolveLocal('2026-03-08', 180, NY)).toEqual({ kind: 'ok', utc: new Date('2026-03-08T07:00:00Z') })
    expect(resolveLocal('2026-07-01', 600, NY)).toEqual({ kind: 'ok', utc: zonedToUtc('2026-07-01', 600, NY) })
  })
})
