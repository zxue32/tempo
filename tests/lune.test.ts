import { describe, expect, it } from 'vitest'
import { isLuneDesign, luneToNailDesign, noteFromSummary, type LuneDesign, type LuneNail } from '../src/lib/lune'
import { isNailDesign } from '../src/components/NailArt'

const nail = (o: Partial<LuneNail> = {}): LuneNail => ({ color: '#3d4558', shape: 'almond', length: 0.5, finish: 'gloss', pattern: 'solid', strokes: [], ...o })
const design = (nails: LuneNail[], name = '月光猫眼'): LuneDesign => ({ schemaVersion: 1, name, updatedAt: '2026-10-28T00:00:00Z', skinTone: '#e0b8a0', nails })

describe('LUNE studio designs', () => {
  it('recognises a five-finger design and rejects anything else', () => {
    expect(isLuneDesign(design([nail(), nail(), nail(), nail(), nail()]))).toBe(true)
    expect(isLuneDesign(design([nail(), nail()]))).toBe(false)
    expect(isLuneDesign({ ...design([nail(), nail(), nail(), nail(), nail({ color: 'red' })]) })).toBe(false)
    expect(isLuneDesign(null)).toBe(false)
  })

  it('becomes a valid booking design that follows the middle finger', () => {
    const d = luneToNailDesign(design([nail(), nail(), nail({ color: '#d9b8a8', shape: 'oval', length: 1, optical: 'mirror' }), nail(), nail()]))
    expect(isNailDesign(d)).toBe(true)
    expect(d).toMatchObject({ shape: 'round', length: 'long', color: '#d9b8a8', finish: 'chrome', colorName: '月光猫眼' })
  })

  it('maps lengths, finishes and patterns', () => {
    const one = (n: Partial<LuneNail>) => luneToNailDesign(design(Array.from({ length: 5 }, () => nail(n))))
    expect(one({ length: 0 }).length).toBe('short')
    expect(one({ length: 0.5 }).length).toBe('medium')
    expect(one({ particles: 'glitter' }).finish).toBe('glitter')
    expect(one({ topCoat: 'matte' }).finish).toBe('matte')
    expect(one({}).finish).toBe('glossy')
    expect(one({ pattern: 'french', patternColor: '#ffffff' })).toMatchObject({ art: 'french', color2: '#ffffff' })
    expect(one({ pattern: 'bloom' }).art).toBe('marble')
    expect(one({ decoration: 'rhinestone' }).art).toBe('dots')
    expect(one({ decoration: 'line' }).art).toBe('line')
  })

  it('calls a hand with different fingers an accent design', () => {
    const d = luneToNailDesign(design([nail(), nail(), nail(), nail({ color: '#f0e6dc' }), nail()]))
    expect(d).toMatchObject({ art: 'accent', color2: '#f0e6dc' })
    expect(isNailDesign(d)).toBe(true)
  })

  it('keeps the technician note inside the booking note limit', () => {
    expect(noteFromSummary('杏仁 · 中长')).toBe('杏仁 · 中长')
    const long = noteFromSummary('款'.repeat(2000))
    expect(long.length).toBe(700)
    expect(long.endsWith('…')).toBe(true)
  })
})
