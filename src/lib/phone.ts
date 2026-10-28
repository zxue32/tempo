// Phone numbers read in the shop's market (CORE-03). A number without a country code belongs to the shop's
// region; a number with one keeps it. We keep what the person typed for display and the E.164 form for matching.
import { parsePhoneNumberFromString } from 'libphonenumber-js/min'
import type { PhoneRegion } from './markets'

export type ParsedPhone = {
  /** "+15555550100" */
  e164: string
  /** the customer-matching key. North American numbers keep the 10-digit key used before CORE-03, so existing
      customers still match; every other number is its full international digits, so two countries never collide. */
  key: string
  /** "+1 555 555 0100" */
  international: string
}

/** Null when the number can't be a phone number in that region (too short, too long, letters). */
export function parsePhone(raw: string | null | undefined, region: PhoneRegion): ParsedPhone | null {
  const s = String(raw ?? '').trim()
  if (!s || s.length > 40) return null
  const p = parsePhoneNumberFromString(s, region)
  if (!p || !p.isPossible()) return null
  const key = p.countryCallingCode === '1' ? String(p.nationalNumber) : `${p.countryCallingCode}${p.nationalNumber}`
  return { e164: p.number, key, international: p.formatInternational() }
}

/** The pre-CORE-03 key: digits only, with a leading US "1" dropped. Still used for numbers that don't parse. */
export function legacyPhoneKey(p: string | null | undefined): string {
  const d = String(p || '').replace(/\D/g, '')
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
}

/** Customer-matching key for whatever was typed: the parsed key when the number parses, the legacy key otherwise. */
export const phoneKey = (raw: string | null | undefined, region: PhoneRegion) => parsePhone(raw, region)?.key ?? legacyPhoneKey(raw)
