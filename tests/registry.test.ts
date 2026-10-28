import { describe, expect, it } from 'vitest'
import { INDUSTRY_KEYS, REGISTRY, CAPABILITIES, fromPlanKey, legacyToIndustries, industryAllows, shopAllows, unbookableReason } from '../src/lib/industries/registry'

describe('industry registry (CORE-02)', () => {
  it('registers exactly the ten industries, each once, in trusted code', () => {
    expect(INDUSTRY_KEYS).toEqual(['nail', 'hair', 'barber', 'spa', 'beauty', 'tattoo', 'pet', 'pilates', 'fitness', 'other'])
    expect(Object.keys(REGISTRY).sort()).toEqual([...INDUSTRY_KEYS].sort())
    for (const k of INDUSTRY_KEYS) {
      const d = REGISTRY[k]
      expect(d.key).toBe(k)
      expect(d.serviceTemplateVersion).toBeGreaterThanOrEqual(1)
      for (const c of [...d.requires, ...d.enabled]) expect(CAPABILITIES).toContain(c)
      // a capability can only be switched on if the industry actually uses it
      for (const c of d.enabled) expect(d.requires).toContain(c)
    }
  })

  it('maps the execution plan’s industry keys onto the keys already in the data', () => {
    expect(fromPlanKey('nails')).toBe('nail')
    expect(fromPlanKey('hair_salon')).toBe('hair')
    expect(fromPlanKey('lash_beauty')).toBe('beauty')
    expect(fromPlanKey('pet_grooming')).toBe('pet')
    expect(fromPlanKey('personal_training')).toBe('fitness')
    expect(fromPlanKey('barber')).toBe('barber')
    expect(fromPlanKey('nail')).toBe('nail')
    expect(fromPlanKey('both')).toBeNull()
    expect(fromPlanKey('karaoke')).toBeNull()
  })

  it('keeps legacy shops: both means nails and barber, never other', () => {
    expect(legacyToIndustries('nail')).toEqual(['nail'])
    expect(legacyToIndustries('barber')).toEqual(['barber'])
    expect(legacyToIndustries('both')).toEqual(['nail', 'barber'])
    expect(legacyToIndustries('pilates')).toEqual(['pilates'])
    expect(legacyToIndustries('nonsense')).toEqual([])
  })

  it('switches capabilities on per industry on the server side', () => {
    // every industry takes plain appointments today; classes, quotes and payments are not switched on yet
    for (const k of INDUSTRY_KEYS) expect(industryAllows(k, 'appointment')).toBe(true)
    expect(industryAllows('nail', 'design_snapshot')).toBe(true)
    expect(industryAllows('pilates', 'class_enrollment')).toBe(false)
    expect(industryAllows('tattoo', 'consultation_quote')).toBe(false)
    expect(industryAllows('barber', 'design_snapshot')).toBe(false)
  })

  it('a shop can use a capability only through one of its own industries', () => {
    expect(shopAllows(['nail', 'barber'], 'design_snapshot')).toBe(true)
    expect(shopAllows(['barber'], 'design_snapshot')).toBe(false)
    expect(shopAllows([], 'appointment')).toBe(false)
  })

  it('explains why a service cannot be booked online', () => {
    expect(unbookableReason(['nail'], 'nail')).toBeNull()
    expect(unbookableReason(['nail', 'barber'], 'barber')).toBeNull()
    expect(unbookableReason(['nail'], 'pet')).toBe('CAPABILITY_DISABLED')
    expect(unbookableReason(['nail'], null)).toBeNull()   // a service not yet tagged falls back to the shop
    expect(unbookableReason(['nail'], 'nail', { ...REGISTRY, nail: { ...REGISTRY.nail, enabled: [] } })).toBe('CAPABILITY_DISABLED')
  })
})
