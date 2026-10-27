/** Preset style tags a shop can put on gallery photos (filters on the public gallery). */
export const STYLE_TAGS = {
  nail: ['french', 'ombre', 'glitter', 'art', 'minimal', 'extension', 'chrome', 'floral', 'cateye', 'seasonal'],
  barber: ['fade', 'undercut', 'curly', 'straight', 'wavy', 'bob', 'pixie', 'bangs', 'updo', 'braids', 'balayage', 'highlights', 'perm', 'beard'],
} as const
export type StyleTag = (typeof STYLE_TAGS)[keyof typeof STYLE_TAGS][number]
export const LENGTHS = ['short', 'medium', 'long'] as const
export function tagsFor(industry: 'nail' | 'barber' | 'both'): string[] {
  return industry === 'nail' ? [...STYLE_TAGS.nail] : industry === 'barber' ? [...STYLE_TAGS.barber] : [...STYLE_TAGS.nail, ...STYLE_TAGS.barber]
}
