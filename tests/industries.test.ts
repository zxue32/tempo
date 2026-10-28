import { describe, it, expect } from 'vitest'
import { INDUSTRIES, CATEGORIES, templateFor, defaultThemeFor, hasNailTools, hasHairTools } from '@/lib/templates'
import { THEMES } from '@/lib/themes'
import { zh } from '@/lib/i18n/zh'
import { en } from '@/lib/i18n/en'

const dicts = { zh: zh as Record<string, string>, en: en as Record<string, string> }

describe('industries', () => {
  it('covers every kind of appointment shop the landing page names', () => {
    expect([...INDUSTRIES]).toEqual(['nail', 'hair', 'barber', 'spa', 'beauty', 'tattoo', 'pet', 'pilates', 'fitness', 'both', 'other'])
  })

  for (const ind of INDUSTRIES) {
    describe(ind, () => {
      it('has a starter menu whose services fit its own categories', () => {
        const menu = templateFor(ind)
        const cats = CATEGORIES[ind]
        expect(cats.length).toBeGreaterThan(1)
        expect(cats).toContain('other')
        const services = menu.filter(s => s.kind === 'service')
        expect(services.length).toBeGreaterThanOrEqual(3)
        for (const s of services) expect(cats).toContain(s.category)
        for (const a of menu.filter(s => s.kind === 'addon')) for (const c of a.appliesTo ?? []) expect(cats).toContain(c)
        for (const s of menu) { expect(s.min).toBeGreaterThan(0); expect(s.price).toBeGreaterThanOrEqual(0); expect(s.nameZh.length).toBeGreaterThan(0) }
        expect(new Set(menu.map(s => s.key)).size).toBe(menu.length)
      })

      it('has names in both languages', () => {
        for (const lang of ['zh', 'en'] as const) {
          expect(dicts[lang][`ind.${ind}`], `${lang} ind.${ind}`).toBeTruthy()
          expect(dicts[lang][`staffWord.${ind}`], `${lang} staffWord.${ind}`).toBeTruthy()
          for (const c of CATEGORIES[ind]) expect(dicts[lang][`cat.${c}`], `${lang} cat.${c}`).toBeTruthy()
        }
      })

      it('opens with a storefront theme that exists', () => {
        expect(THEMES[defaultThemeFor(ind)]).toBeTruthy()
      })
    })
  }

  it('only offers the nail try-on and the hair colour board where they make sense', () => {
    expect(INDUSTRIES.filter(hasNailTools)).toEqual(['nail', 'both'])
    expect(INDUSTRIES.filter(hasHairTools)).toEqual(['hair', 'barber', 'both'])
  })
})
