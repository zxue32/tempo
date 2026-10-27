// Storefront themes. Each shop picks one; `accent` can override the theme's accent colour.
export type Theme = {
  id: string
  label: { zh: string; en: string }
  note: { zh: string; en: string }
  dark: boolean
  bg: string; surface: string; sunk: string; ink: string; muted: string; line: string
  accent: string; accentInk: string; soft: string
  display: string
  displayCase: 'none' | 'uppercase'
  tracking: string
  radius: string; radiusSm: string
  fontsHref: string
}

const FIGTREE = 'family=Figtree:wght@400;500;600;700'

export const THEMES: Record<string, Theme> = {
  lacquer: {
    id: 'lacquer', label: { zh: 'Lacquer', en: 'Lacquer' }, note: { zh: '柔和精致 · 美甲推荐', en: 'Soft and refined · nails' }, dark: false,
    bg: '#FBF7F8', surface: '#FFFFFF', sunk: '#F4ECEF', ink: '#2B1F26', muted: '#6D5A64', line: '#EBDDE3',
    accent: '#A3223D', accentInk: '#FFFFFF', soft: '#F6E3E9',
    display: "'Bodoni Moda', 'Noto Serif SC', Georgia, serif", displayCase: 'none', tracking: '0',
    radius: '999px', radiusSm: '14px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,500;1,6..96,500&${FIGTREE}&display=swap`,
  },
  brass: {
    id: 'brass', label: { zh: 'Brass & Oak', en: 'Brass & Oak' }, note: { zh: '深色复古 · 理发推荐', en: 'Dark vintage · barbers' }, dark: true,
    bg: '#14120F', surface: '#1E1B16', sunk: '#29251E', ink: '#F0E8D9', muted: '#A99F8B', line: '#3A342A',
    accent: '#D2A24C', accentInk: '#14120F', soft: '#2E2719',
    display: "'Big Shoulders Display', 'Noto Sans SC', Impact, sans-serif", displayCase: 'uppercase', tracking: '0.02em',
    radius: '4px', radiusSm: '4px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&${FIGTREE}&display=swap`,
  },
  sage: {
    id: 'sage', label: { zh: 'Sage', en: 'Sage' }, note: { zh: '自然清爽 · 都适合', en: 'Calm and natural · any' }, dark: false,
    bg: '#F2F4EF', surface: '#FFFFFF', sunk: '#E7ECE3', ink: '#1E2620', muted: '#56635A', line: '#D9DFD3',
    accent: '#3F6B4E', accentInk: '#FFFFFF', soft: '#E1EADF',
    display: "'Bricolage Grotesque', 'Noto Sans SC', system-ui, sans-serif", displayCase: 'none', tracking: '-0.01em',
    radius: '12px', radiusSm: '12px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&${FIGTREE}&display=swap`,
  },
  clean: {
    id: 'clean', label: { zh: 'Clean', en: 'Clean' }, note: { zh: '中性简约 · 多业务', en: 'Neutral · multi-service' }, dark: false,
    bg: '#FFFFFF', surface: '#F5F6F8', sunk: '#ECEEF2', ink: '#16171B', muted: '#575B65', line: '#E3E5EA',
    accent: '#2E45D9', accentInk: '#FFFFFF', soft: '#E4E8FD',
    display: "'Bricolage Grotesque', 'Noto Sans SC', system-ui, sans-serif", displayCase: 'none', tracking: '-0.02em',
    radius: '999px', radiusSm: '12px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&${FIGTREE}&display=swap`,
  },
}

export function themeOf(id: string | null | undefined): Theme {
  return THEMES[id || ''] || THEMES.lacquer
}

/** Readable text colour (black/white) for a background hex. */
export function inkFor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#FFFFFF'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return L > 0.4 ? '#14120F' : '#FFFFFF'
}

/** CSS custom properties for a shop's storefront. */
export function themeVars(themeId: string, accent?: string | null): Record<string, string> {
  const t = themeOf(themeId)
  const a = accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : t.accent
  return {
    '--s-bg': t.bg, '--s-surface': t.surface, '--s-sunk': t.sunk, '--s-ink': t.ink, '--s-muted': t.muted,
    '--s-line': t.line, '--s-accent': a, '--s-accent-ink': a === t.accent ? t.accentInk : inkFor(a), '--s-soft': t.soft,
    '--s-display': t.display, '--s-case': t.displayCase, '--s-track': t.tracking, '--s-r': t.radius, '--s-rs': t.radiusSm,
    colorScheme: t.dark ? 'dark' : 'light',
  }
}

export const STAFF_COLORS = ['#C8445A', '#8E5BA8', '#2F8A78', '#C9822F', '#4A6FB3', '#B04A7A', '#5E7F2E', '#8A4B2F', '#3B5A8A', '#7A5A1E']
