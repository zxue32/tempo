// Storefront themes. Each shop picks one; `accent` can override the theme's accent colour.
// Every theme is built as a colour-block pair: a calm ground (`bg`) and a bold `block` colour for large areas,
// plus a small `pop` colour for details. `stage` is the backdrop behind the 3D hand in the nail studio.
export type Theme = {
  id: string
  label: { zh: string; en: string }
  note: { zh: string; en: string }
  dark: boolean
  bg: string; surface: string; sunk: string; ink: string; muted: string; line: string
  accent: string; accentInk: string; soft: string
  block: string; blockInk: string; pop: string
  stage: string; stageInk: string
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
    block: '#3B1A27', blockInk: '#FBF7F8', pop: '#E9B7C4', stage: '#F1E4E8', stageInk: '#2B1F26',
    display: "'Bodoni Moda', 'Noto Serif SC', Georgia, serif", displayCase: 'none', tracking: '0',
    radius: '999px', radiusSm: '14px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,500;1,6..96,500&${FIGTREE}&display=swap`,
  },
  brass: {
    id: 'brass', label: { zh: 'Brass & Oak', en: 'Brass & Oak' }, note: { zh: '深色复古 · 理发推荐', en: 'Dark vintage · barbers' }, dark: true,
    bg: '#14120F', surface: '#1E1B16', sunk: '#29251E', ink: '#F0E8D9', muted: '#A99F8B', line: '#3A342A',
    accent: '#D2A24C', accentInk: '#14120F', soft: '#2E2719',
    block: '#B4432B', blockInk: '#F0E8D9', pop: '#D2A24C', stage: '#221E19', stageInk: '#F0E8D9',
    display: "'Big Shoulders Display', 'Noto Sans SC', Impact, sans-serif", displayCase: 'uppercase', tracking: '0.02em',
    radius: '4px', radiusSm: '4px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&${FIGTREE}&display=swap`,
  },
  sage: {
    id: 'sage', label: { zh: 'Sage', en: 'Sage' }, note: { zh: '自然清爽 · 都适合', en: 'Calm and natural · any' }, dark: false,
    bg: '#F2F4EF', surface: '#FFFFFF', sunk: '#E7ECE3', ink: '#1E2620', muted: '#56635A', line: '#D9DFD3',
    accent: '#3F6B4E', accentInk: '#FFFFFF', soft: '#E1EADF',
    block: '#A9532F', blockInk: '#FFFFFF', pop: '#3F6B4E', stage: '#E3E8DE', stageInk: '#1E2620',
    display: "'Bricolage Grotesque', 'Noto Sans SC', system-ui, sans-serif", displayCase: 'none', tracking: '-0.01em',
    radius: '12px', radiusSm: '12px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&${FIGTREE}&display=swap`,
  },
  clean: {
    id: 'clean', label: { zh: 'Clean', en: 'Clean' }, note: { zh: '中性简约 · 多业务', en: 'Neutral · multi-service' }, dark: false,
    bg: '#FFFFFF', surface: '#F5F6F8', sunk: '#ECEEF2', ink: '#16171B', muted: '#575B65', line: '#E3E5EA',
    accent: '#2E45D9', accentInk: '#FFFFFF', soft: '#E4E8FD',
    block: '#16171B', blockInk: '#FFFFFF', pop: '#2E45D9', stage: '#ECEEF2', stageInk: '#16171B',
    display: "'Bricolage Grotesque', 'Noto Sans SC', system-ui, sans-serif", displayCase: 'none', tracking: '-0.02em',
    radius: '999px', radiusSm: '12px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&${FIGTREE}&display=swap`,
  },
  // ---------- colour-block themes (高级撞色)
  klein: {
    id: 'klein', label: { zh: '克莱因蓝 × 黄油', en: 'Klein & Butter' }, note: { zh: '浓烈蓝配奶油黄 · 大胆', en: 'Deep blue with butter · bold' }, dark: false,
    bg: '#F6F1E6', surface: '#FFFCF5', sunk: '#EEE6D4', ink: '#121A3D', muted: '#585F7A', line: '#E2D9C5',
    accent: '#1E3FB8', accentInk: '#FFFFFF', soft: '#E3E7F7',
    block: '#1E3FB8', blockInk: '#F6F1E6', pop: '#F2C14E', stage: '#2445BD', stageInk: '#F6F1E6',
    display: "'DM Serif Display', 'Noto Serif SC', Georgia, serif", displayCase: 'none', tracking: '-0.01em',
    radius: '999px', radiusSm: '18px',
    fontsHref: `https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&${FIGTREE}&display=swap`,
  },
  bordeaux: {
    id: 'bordeaux', label: { zh: '酒红 × 裸粉', en: 'Bordeaux & Blush' }, note: { zh: '深酒红配裸粉 · 美甲美睫', en: 'Wine with blush · nails, lashes' }, dark: false,
    bg: '#F8EBEB', surface: '#FFF7F6', sunk: '#F1DCDD', ink: '#33101A', muted: '#7B5560', line: '#EACFD2',
    accent: '#6E1428', accentInk: '#FFF4F2', soft: '#F3D9DD',
    block: '#6E1428', blockInk: '#F8EBEB', pop: '#E8A9B4', stage: '#5E1424', stageInk: '#F8EBEB',
    display: "'Playfair Display', 'Noto Serif SC', Georgia, serif", displayCase: 'none', tracking: '-0.01em',
    radius: '6px', radiusSm: '10px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&${FIGTREE}&display=swap`,
  },
  forest: {
    id: 'forest', label: { zh: '墨绿 × 杏橘', en: 'Forest & Apricot' }, note: { zh: '墨绿配杏橘 · 温暖高级', en: 'Forest green with apricot · warm' }, dark: false,
    bg: '#F3EDE3', surface: '#FFFBF4', sunk: '#E9E1D2', ink: '#17261E', muted: '#56675C', line: '#DED5C4',
    accent: '#1F3A2C', accentInk: '#F3EDE3', soft: '#DCE5DC',
    block: '#1F3A2C', blockInk: '#F3EDE3', pop: '#EE9A6D', stage: '#EC9C72', stageInk: '#17261E',
    display: "'Fraunces', 'Noto Serif SC', Georgia, serif", displayCase: 'none', tracking: '-0.01em',
    radius: '14px', radiusSm: '14px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&${FIGTREE}&display=swap`,
  },
  matcha: {
    id: 'matcha', label: { zh: '抹茶 × 樱桃红', en: 'Matcha & Cherry' }, note: { zh: '抹茶绿配樱桃红 · 清新跳色', en: 'Matcha with cherry · fresh' }, dark: false,
    bg: '#EFF1E4', surface: '#FBFCF5', sunk: '#E3E7D2', ink: '#1F2715', muted: '#5D6650', line: '#D8DDC4',
    accent: '#B3122E', accentInk: '#FFFFFF', soft: '#F4DADB',
    block: '#8FAE4E', blockInk: '#1F2715', pop: '#B3122E', stage: '#A9BC7C', stageInk: '#1F2715',
    display: "'Bricolage Grotesque', 'Noto Sans SC', system-ui, sans-serif", displayCase: 'none', tracking: '-0.02em',
    radius: '999px', radiusSm: '16px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&${FIGTREE}&display=swap`,
  },
  mist: {
    id: 'mist', label: { zh: '雾霾蓝 × 焦糖', en: 'Mist & Caramel' }, note: { zh: '灰蓝配焦糖 · 美发 SPA', en: 'Haze blue with caramel · hair, spa' }, dark: false,
    bg: '#E8EDF1', surface: '#F7F9FB', sunk: '#DCE3E9', ink: '#1B2833', muted: '#51616D', line: '#CFD9E1',
    accent: '#A25726', accentInk: '#FFFFFF', soft: '#F1E2D6',
    block: '#3F5E78', blockInk: '#F7F9FB', pop: '#C67A43', stage: '#B9C8D5', stageInk: '#1B2833',
    display: "'Instrument Serif', 'Noto Serif SC', Georgia, serif", displayCase: 'none', tracking: '0',
    radius: '999px', radiusSm: '12px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&${FIGTREE}&display=swap`,
  },
  cocoa: {
    id: 'cocoa', label: { zh: '可可 × 香芋紫', en: 'Cocoa & Taro' }, note: { zh: '深可可配香芋紫 · 夜色', en: 'Dark cocoa with taro lilac · evening' }, dark: true,
    bg: '#241815', surface: '#2F201C', sunk: '#3A2924', ink: '#F4EAF6', muted: '#B9A8B6', line: '#4A3630',
    accent: '#C3AEF0', accentInk: '#241815', soft: '#3B2C3E',
    block: '#C3AEF0', blockInk: '#241815', pop: '#E9B98F', stage: '#B7A1E4', stageInk: '#241815',
    display: "'Cormorant Garamond', 'Noto Serif SC', Georgia, serif", displayCase: 'none', tracking: '0',
    radius: '999px', radiusSm: '16px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&${FIGTREE}&display=swap`,
  },
  tangerine: {
    id: 'tangerine', label: { zh: '墨黑 × 橘', en: 'Ink & Tangerine' }, note: { zh: '黑配亮橘 · 纹身健身', en: 'Black with tangerine · tattoo, fitness' }, dark: true,
    bg: '#0F0F0F', surface: '#191919', sunk: '#222222', ink: '#F4F0E8', muted: '#A39E95', line: '#2F2F2F',
    accent: '#FF6A1F', accentInk: '#0F0F0F', soft: '#2A1A10',
    block: '#FF6A1F', blockInk: '#0F0F0F', pop: '#F4F0E8', stage: '#F2661E', stageInk: '#0F0F0F',
    display: "'Syne', 'Noto Sans SC', system-ui, sans-serif", displayCase: 'none', tracking: '-0.01em',
    radius: '2px', radiusSm: '2px',
    fontsHref: `https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&${FIGTREE}&display=swap`,
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
    '--s-block': t.block, '--s-block-ink': t.blockInk, '--s-pop': t.pop, '--s-pop-ink': inkFor(t.pop),
    colorScheme: t.dark ? 'dark' : 'light',
  }
}

/** The LUNE 3D studio's colour variables for a shop's theme, so the studio sits in the shop's own colours. */
export function studioVars(themeId: string, accent?: string | null): Record<string, string> {
  const t = themeOf(themeId)
  const a = accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : t.accent
  return {
    '--paper': t.bg, '--card': t.surface, '--sunk': t.sunk, '--line': t.line, '--ink': t.ink, '--muted': t.muted,
    '--wine': a, '--wine-ink': a === t.accent ? t.accentInk : inkFor(a),
    '--stage': t.stage, '--stage-ink': t.stageInk, '--stage-muted': `color-mix(in srgb, ${t.stageInk} 62%, ${t.stage})`,
  }
}

export const STAFF_COLORS = ['#C8445A', '#8E5BA8', '#2F8A78', '#C9822F', '#4A6FB3', '#B04A7A', '#5E7F2E', '#8A4B2F', '#3B5A8A', '#7A5A1E']
