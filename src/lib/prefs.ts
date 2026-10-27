import type { Preferences } from './types'

/** Keys a preference card can hold, in display order. */
export const PREF_KEYS = ['colors', 'shape', 'length', 'finish', 'styles', 'hairColor', 'hairStyle', 'staffId', 'notes'] as const

/** True when at least one field is filled in. */
export function hasPrefs(p: Preferences | null | undefined): p is Preferences {
  if (!p) return false
  return PREF_KEYS.some(k => {
    const v = p[k]
    return Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim().length > 0 : false
  })
}

/** Drop empty fields so the stored card stays small and `hasPrefs` stays honest. */
export function cleanPrefs(p: Preferences): Preferences {
  const out: Preferences = {}
  if (p.colors?.length) out.colors = p.colors.slice(0, 6)
  if (p.shape) out.shape = p.shape
  if (p.length) out.length = p.length
  if (p.finish) out.finish = p.finish
  if (p.styles?.length) out.styles = p.styles.slice(0, 8)
  if (p.hairColor?.trim()) out.hairColor = p.hairColor.trim()
  if (p.hairStyle?.trim()) out.hairStyle = p.hairStyle.trim()
  if (p.staffId) out.staffId = p.staffId
  if (p.notes?.trim()) out.notes = p.notes.trim()
  return out
}
