/** Preset style tags a shop can put on gallery photos (filters on the public gallery). */
export const STYLE_TAGS = {
  nail: ['french', 'ombre', 'glitter', 'art', 'minimal', 'extension', 'chrome', 'floral', 'cateye', 'seasonal'],
  barber: ['fade', 'undercut', 'curly', 'straight', 'wavy', 'bob', 'pixie', 'bangs', 'updo', 'braids', 'balayage', 'highlights', 'perm', 'beard'],
} as const
export type StyleTag = (typeof STYLE_TAGS)[keyof typeof STYLE_TAGS][number]
export const LENGTHS = ['short', 'medium', 'long'] as const
export function tagsFor(industry: string): string[] {
  const nail = industry === 'nail' || industry === 'both', hair = industry === 'hair' || industry === 'barber' || industry === 'both'
  return [...(nail ? STYLE_TAGS.nail : []), ...(hair ? STYLE_TAGS.barber : [])]
}
