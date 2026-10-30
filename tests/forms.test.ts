import { describe, expect, it } from 'vitest'
import { parseSchema, checkAnswers, visibleFields, nailIntake, FormError, LIMITS, type FormSchema } from '../src/lib/forms'

const REMOVAL = '11111111-2222-4333-8444-555555555555'
const form: FormSchema = parseSchema(nailIntake(REMOVAL))
const ok = (raw: unknown, addonIds: string[] = [], photoOk = (u: string) => u.startsWith('/media/ref/')) => checkAnswers(form, raw, { addonIds, photoOk })
const err = (fn: () => unknown) => { try { fn() } catch (e) { if (e instanceof FormError) return `${e.code}:${e.field ?? ''}`; throw e } return 'no error' }

describe('intake form schema (CORE-05)', () => {
  it('ships the nail starter questions: current nails, removal, length, repairs, a photo', () => {
    expect(form.fields.map(f => [f.key, f.type])).toEqual([
      ['currentNails', 'single'], ['removal', 'single'], ['extension', 'single'], ['repairCount', 'number'], ['handsPhoto', 'photo'],
    ])
    // "not sure" is a real answer that needs the technician to look, not "nothing"
    expect(form.fields[0].options!.find(o => o.value === 'unsure')).toMatchObject({ review: true })
    expect(form.fields[1]).toMatchObject({ showIf: { field: 'currentNails', in: ['gel', 'extensions', 'polish', 'unsure'] } })
    expect(form.fields[1].options!.find(o => o.value === 'yes')!.addonId).toBe(REMOVAL)
    expect(form.fields[4]).toMatchObject({ sensitive: true, maxPhotos: 2 })
  })

  it('accepts only the whitelisted field types and settings, nothing that runs', () => {
    const base = { key: 'q', type: 'text', label: { en: 'Q', zh: '问' }, required: false }
    expect(err(() => parseSchema({ fields: [{ ...base, type: 'script' }] }))).toMatch(/^schema:/)
    expect(err(() => parseSchema({ fields: [{ ...base, onChange: 'alert(1)' }] }))).toMatch(/^schema:/)
    expect(err(() => parseSchema({ fields: [base], extra: true }))).toMatch(/^schema:/)
    expect(err(() => parseSchema({ fields: [{ ...base, key: 'Bad Key' }] }))).toMatch(/^schema:/)
    expect(err(() => parseSchema({ fields: [{ ...base, key: 'snake_case' }] }))).toMatch(/^schema:/)
    expect(err(() => parseSchema({ fields: [base, base] }))).toBe('schema:duplicate')
    expect(err(() => parseSchema({ fields: Array.from({ length: LIMITS.fields + 1 }, (_, i) => ({ ...base, key: `q${i}` })) }))).toMatch(/^schema:/)
    expect(err(() => parseSchema({ fields: [{ ...base, type: 'number', min: 5, max: 1 }] }))).toBe('schema:q')
    expect(err(() => parseSchema({ fields: [{ ...base, type: 'text', maxLength: 5000 }] }))).toMatch(/^schema:/)
    // a condition can only point at an earlier choice question and its real options
    expect(err(() => parseSchema({ fields: [{ ...base, showIf: { field: 'nope', in: ['x'] } }] }))).toBe('schema:q')
    expect(err(() => parseSchema({ fields: [form.fields[0], { ...base, showIf: { field: 'currentNails', in: ['made_up'] } }] }))).toBe('schema:q')
  })
})

describe('intake answers (CORE-05)', () => {
  it('keeps a clean set of answers and only the questions that were showing', () => {
    const r = ok({ currentNails: 'none', removal: 'yes', extension: 'no', repairCount: 0 })
    expect(r.answers).toEqual({ currentNails: 'none', extension: 'no', repairCount: 0 }) // removal was hidden
    expect(r.requiresReview).toBe(false)
    expect(visibleFields(form, { currentNails: 'gel' }).map(f => f.key)).toContain('removal')
  })

  it('refuses fields it doesn’t know, wrong types and missing required answers', () => {
    expect(err(() => ok({ currentNails: 'none', extension: 'no', password: 'x' }))).toBe('unknown_field:password')
    expect(err(() => ok({ extension: 'no' }))).toBe('required:currentNails')
    expect(err(() => ok({ currentNails: 'gel', extension: 'no' }))).toBe('required:removal')
    expect(err(() => ok({ currentNails: 'purple', extension: 'no' }))).toBe('invalid:currentNails')
    expect(err(() => ok({ currentNails: 'none', extension: 'no', repairCount: 2.5 }))).toBe('invalid:repairCount')
    expect(err(() => ok({ currentNails: 'none', extension: 'no', repairCount: 99 }))).toBe('invalid:repairCount')
    expect(err(() => ok('nope'))).toBe('invalid:')
    expect(err(() => ok({ currentNails: 'none', extension: 'no', notes: 'x'.repeat(5000) }))).toBe('too_large:')
  })

  it('refuses photos that aren’t this shop’s private uploads, and too many of them', () => {
    const p = (n: number) => Array.from({ length: n }, (_, i) => `/media/ref/s/${i}.jpg`)
    expect(ok({ currentNails: 'none', extension: 'no', handsPhoto: p(2) }).answers.handsPhoto).toHaveLength(2)
    expect(err(() => ok({ currentNails: 'none', extension: 'no', handsPhoto: p(3) }))).toBe('too_many:handsPhoto')
    expect(err(() => ok({ currentNails: 'none', extension: 'no', handsPhoto: ['https://evil.example.com/x.jpg'] }))).toBe('bad_photo:handsPhoto')
  })

  it('asks for the removal add-on when the answers need it, instead of booking the basic service', () => {
    expect(ok({ currentNails: 'gel', removal: 'yes', extension: 'no' }).missingAddons).toEqual([REMOVAL])
    expect(ok({ currentNails: 'gel', removal: 'yes', extension: 'no' }, [REMOVAL]).missingAddons).toEqual([])
  })

  it('sends “not sure what’s on my nails” to the technician to review', () => {
    expect(ok({ currentNails: 'unsure', removal: 'yes', extension: 'no' }, [REMOVAL]).requiresReview).toBe(true)
  })
})
