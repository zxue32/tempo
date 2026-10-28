import { describe, expect, it } from 'vitest'
import { THEMES, studioVars, themeVars } from '../src/lib/themes'

const hex = /^#[0-9A-F]{6}$/i
function lum(h: string) {
  const n = parseInt(h.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe('storefront themes', () => {
  it('has the original four and the colour-block set', () => {
    expect(Object.keys(THEMES)).toEqual(expect.arrayContaining(['lacquer', 'brass', 'sage', 'clean', 'klein', 'bordeaux', 'forest', 'matcha', 'mist', 'cocoa', 'tangerine']))
  })

  for (const t of Object.values(THEMES)) {
    describe(t.id, () => {
      it('uses plain hex colours', () => {
        for (const k of ['bg', 'surface', 'sunk', 'ink', 'muted', 'line', 'accent', 'accentInk', 'soft', 'block', 'blockInk', 'pop', 'stage', 'stageInk'] as const) expect(t[k], k).toMatch(hex)
      })
      it('keeps every text colour readable (WCAG AA)', () => {
        expect(contrast(t.ink, t.bg)).toBeGreaterThanOrEqual(7)
        expect(contrast(t.ink, t.surface)).toBeGreaterThanOrEqual(7)
        expect(contrast(t.muted, t.bg)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.accentInk, t.accent)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.blockInk, t.block)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.stageInk, t.stage)).toBeGreaterThanOrEqual(4.5)
      })
      it('really is a colour block: the block stands apart from the ground', () => {
        expect(contrast(t.block, t.bg)).toBeGreaterThanOrEqual(2)
      })
    })
  }

  it('hands the shop colours to the storefront and the 3D studio', () => {
    expect(themeVars('klein')).toMatchObject({ '--s-block': '#1E3FB8', '--s-pop': '#F2C14E' })
    expect(studioVars('klein')).toMatchObject({ '--paper': '#F6F1E6', '--wine': '#1E3FB8', '--stage': '#2445BD', '--stage-ink': '#F6F1E6' })
    expect(studioVars('lacquer', '#123456')['--wine']).toBe('#123456')
    expect(studioVars('nope')['--paper']).toBe(THEMES.lacquer.bg)
  })
})
