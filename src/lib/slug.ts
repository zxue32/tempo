const RESERVED = new Set(`admin api app apps assets auth b about account accounts billing blog book booking bookings
  business careers contact dashboard demo docs help home invite invites join legal login logout me media new
  onboarding pricing privacy register reset s settings shop shops signup signin staff static status support
  terms tempo uploads user users www mail email _next favicon robots sitemap manifest cron`.split(/\s+/).filter(Boolean))

export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

export type SlugProblem = 'short' | 'format' | 'reserved'
export function slugProblem(slug: string): SlugProblem | null {
  if (slug.length < 3) return 'short'
  if (!/^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/.test(slug) || slug.includes('--')) return 'format'
  if (RESERVED.has(slug)) return 'reserved'
  return null
}
