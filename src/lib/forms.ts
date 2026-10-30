// Intake forms (CORE-05): a few questions a customer answers before booking, so the shop knows what it is
// walking into. Forms are data, not code: a short whitelist of question types and settings, checked on save and
// again on every answer. Nothing in a form can run, fetch or compute. Safe in client components.
import { z } from 'zod'

export const FIELD_TYPES = ['single', 'multi', 'number', 'text', 'photo'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const LIMITS = { fields: 12, options: 10, label: 80, help: 160, text: 200, photos: 3, number: 1000, answersBytes: 4096 } as const

// question keys are camelCase letters and digits: the database layer camel-cases JSON keys when it reads them back
const KEY = /^[a-z][a-zA-Z0-9]{0,31}$/
const VALUE = /^[a-z0-9_]{1,24}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bilingual = (max: number) => z.strictObject({ en: z.string().trim().min(1).max(max), zh: z.string().trim().min(1).max(max) })
const option = z.strictObject({
  value: z.string().regex(VALUE),
  label: bilingual(LIMITS.label),
  /** picking this needs the technician to look before the booking counts as confirmed */
  review: z.boolean().optional(),
  /** picking this needs this add-on (its time and price come from the shop's menu) */
  addonId: z.string().regex(UUID).nullable().optional(),
})
const field = z.strictObject({
  key: z.string().regex(KEY),
  type: z.enum(FIELD_TYPES),
  label: bilingual(LIMITS.label),
  help: bilingual(LIMITS.help).nullable().optional(),
  required: z.boolean(),
  options: z.array(option).min(2).max(LIMITS.options).optional(),
  min: z.number().int().min(0).max(LIMITS.number).optional(),
  max: z.number().int().min(0).max(LIMITS.number).optional(),
  /** a number above this needs review */
  reviewAbove: z.number().int().min(0).max(LIMITS.number).nullable().optional(),
  maxLength: z.number().int().min(1).max(LIMITS.text).optional(),
  maxPhotos: z.number().int().min(1).max(LIMITS.photos).optional(),
  /** only asked when an earlier choice question has one of these answers */
  showIf: z.strictObject({ field: z.string().regex(KEY), in: z.array(z.string().regex(VALUE)).min(1).max(LIMITS.options) }).nullable().optional(),
  /** personal: only the shop's own people see it (never in emails) */
  sensitive: z.boolean().optional(),
})
const schema = z.strictObject({ fields: z.array(field).max(LIMITS.fields) })

export type FormOption = z.infer<typeof option>
export type FormField = z.infer<typeof field>
export type FormSchema = z.infer<typeof schema>
export type Answer = string | string[] | number
export type Answers = Record<string, Answer>

export class FormError extends Error {
  constructor(public code: 'schema' | 'invalid' | 'unknown_field' | 'required' | 'too_large' | 'too_long' | 'too_many' | 'bad_photo', public field?: string) {
    super(field ? `${code}:${field}` : code)
  }
}

/** A form as saved by the shop: the whitelist, plus the rules that span fields. Throws FormError('schema', where). */
export function parseSchema(raw: unknown): FormSchema {
  const p = schema.safeParse(raw)
  if (!p.success) throw new FormError('schema', p.error.issues[0]?.path.join('.') || 'form')
  const seen = new Map<string, FormField>()
  for (const f of p.data.fields) {
    if (seen.has(f.key)) throw new FormError('schema', 'duplicate')
    const choice = f.type === 'single' || f.type === 'multi'
    if (choice !== !!f.options) throw new FormError('schema', f.key)
    if (f.options && new Set(f.options.map(o => o.value)).size !== f.options.length) throw new FormError('schema', f.key)
    if (f.type !== 'number' && (f.min != null || f.max != null || f.reviewAbove != null)) throw new FormError('schema', f.key)
    if (f.type === 'number' && f.min != null && f.max != null && f.min > f.max) throw new FormError('schema', f.key)
    if (f.type !== 'text' && f.maxLength != null) throw new FormError('schema', f.key)
    if (f.type !== 'photo' && f.maxPhotos != null) throw new FormError('schema', f.key)
    if (f.showIf) {
      const on = seen.get(f.showIf.field)
      if (!on?.options || !f.showIf.in.every(v => on.options!.some(o => o.value === v))) throw new FormError('schema', f.key)
    }
    seen.set(f.key, f)
  }
  return p.data
}

const shown = (f: FormField, a: Record<string, unknown>) => {
  if (!f.showIf) return true
  const v = a[f.showIf.field]
  return Array.isArray(v) ? v.some(x => f.showIf!.in.includes(String(x))) : f.showIf.in.includes(String(v))
}

/** The questions to ask given the answers so far. */
export function visibleFields(form: FormSchema, answers: Record<string, unknown>): FormField[] {
  const out: FormField[] = []
  const live: Record<string, unknown> = {}
  for (const f of form.fields) {
    if (!shown(f, live)) continue
    out.push(f)
    if (f.key in answers) live[f.key] = answers[f.key]
  }
  return out
}

const blank = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

/**
 * Check what a customer sent against the form. Unknown fields, wrong types, oversize answers and photos that
 * aren't this shop's own private uploads are refused; answers to questions that weren't showing are dropped.
 */
export function checkAnswers(form: FormSchema, raw: unknown, ctx: { addonIds: readonly string[]; photoOk: (url: string) => boolean }):
  { answers: Answers; requiresReview: boolean; missingAddons: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new FormError('invalid')
  if (JSON.stringify(raw).length > LIMITS.answersBytes) throw new FormError('too_large')
  const input = raw as Record<string, unknown>
  for (const k of Object.keys(input)) if (!form.fields.some(f => f.key === k)) throw new FormError('unknown_field', k.slice(0, 32))
  const answers: Answers = {}
  let requiresReview = false
  const missing = new Set<string>()
  const pick = (f: FormField, v: string) => {
    const o = f.options!.find(x => x.value === v)
    if (!o) throw new FormError('invalid', f.key)
    if (o.review) requiresReview = true
    if (o.addonId && !ctx.addonIds.includes(o.addonId)) missing.add(o.addonId)
  }
  for (const f of visibleFields(form, input)) {
    const v = input[f.key]
    if (blank(v)) {
      if (f.required) throw new FormError('required', f.key)
      continue
    }
    switch (f.type) {
      case 'single':
        if (typeof v !== 'string') throw new FormError('invalid', f.key)
        pick(f, v)
        answers[f.key] = v
        break
      case 'multi': {
        if (!Array.isArray(v) || v.some(x => typeof x !== 'string') || new Set(v).size !== v.length) throw new FormError('invalid', f.key)
        for (const x of v as string[]) pick(f, x)
        answers[f.key] = v as string[]
        break
      }
      case 'number': {
        const lo = f.min ?? 0, hi = f.max ?? LIMITS.number
        if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) throw new FormError('invalid', f.key)
        if (f.reviewAbove != null && v > f.reviewAbove) requiresReview = true
        answers[f.key] = v
        break
      }
      case 'text': {
        if (typeof v !== 'string') throw new FormError('invalid', f.key)
        const s = v.trim()
        if (s.length > (f.maxLength ?? LIMITS.text)) throw new FormError('too_long', f.key)
        if (s) answers[f.key] = s
        else if (f.required) throw new FormError('required', f.key)
        break
      }
      case 'photo': {
        if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) throw new FormError('invalid', f.key)
        if (v.length > (f.maxPhotos ?? 1)) throw new FormError('too_many', f.key)
        if (!(v as string[]).every(ctx.photoOk)) throw new FormError('bad_photo', f.key)
        answers[f.key] = v as string[]
        break
      }
    }
  }
  return { answers, requiresReview, missingAddons: [...missing] }
}

/** Required questions still unanswered (only the ones showing). */
export function missingRequired(form: FormSchema, answers: Record<string, unknown>): string[] {
  return visibleFields(form, answers).filter(f => f.required && blank(answers[f.key])).map(f => f.key)
}

/** Answers limited to the questions showing, and the add-ons those answers call for. */
export function settle(form: FormSchema, answers: Record<string, unknown>): { answers: Record<string, unknown>; addons: Set<string>; linked: Set<string> } {
  const live: Record<string, unknown> = {}
  const addons = new Set<string>()
  const linked = new Set<string>()
  for (const f of form.fields) for (const o of f.options ?? []) if (o.addonId) linked.add(o.addonId)
  for (const f of visibleFields(form, answers)) {
    const v = answers[f.key]
    if (blank(v)) continue
    live[f.key] = v
    for (const x of Array.isArray(v) ? v : [v]) {
      const o = f.options?.find(op => op.value === x)
      if (o?.addonId) addons.add(o.addonId)
    }
  }
  return { answers: live, addons, linked }
}

/** How an answer reads to people (option labels instead of codes). */
export function answerText(f: FormField, v: Answer, lang: 'en' | 'zh'): string {
  if (f.options) {
    const one = (x: string) => f.options!.find(o => o.value === x)?.label[lang] ?? x
    return Array.isArray(v) ? v.map(one).join(', ') : one(String(v))
  }
  if (Array.isArray(v)) return String(v.length)
  return String(v)
}

/**
 * The nail starter questions (NAIL-03): what's on the nails now, whether to take it off, length, repairs and a
 * photo. "Not sure" is a real answer and goes to the technician. `removalAddonId` links "take it off" to the
 * shop's removal add-on so its time and price are counted.
 */
export function nailIntake(removalAddonId: string | null): FormSchema {
  const L = (en: string, zh: string) => ({ en, zh })
  return {
    fields: [
      {
        key: 'currentNails', type: 'single', required: true, label: L('What’s on your nails right now?', '你现在手上是什么？'),
        options: [
          { value: 'none', label: L('Nothing — natural nails', '什么都没有，真甲') },
          { value: 'polish', label: L('Regular polish', '普通甲油') },
          { value: 'gel', label: L('Gel polish', '甲油胶') },
          { value: 'extensions', label: L('Extensions, acrylic or builder gel', '延长甲、水晶甲或加固胶') },
          { value: 'unsure', label: L('Not sure', '不确定'), review: true },
        ],
      },
      {
        key: 'removal', type: 'single', required: true, label: L('Should we take it off first?', '需要先卸掉吗？'),
        showIf: { field: 'currentNails', in: ['gel', 'extensions', 'polish', 'unsure'] },
        options: [
          { value: 'yes', label: L('Yes, please remove it', '要，帮我卸掉'), addonId: removalAddonId },
          { value: 'no', label: L('No, keep it', '不用'), },
        ],
      },
      {
        key: 'extension', type: 'single', required: false, label: L('Do you want length added?', '需要延长吗？'),
        options: [{ value: 'no', label: L('No', '不需要') }, { value: 'yes', label: L('Yes', '需要') }],
      },
      { key: 'repairCount', type: 'number', required: false, min: 0, max: 10, label: L('How many nails are broken or need fixing?', '有几个指甲断了或需要修补？') },
      {
        key: 'handsPhoto', type: 'photo', required: false, maxPhotos: 2, sensitive: true,
        label: L('A photo of your hands now (optional)', '现在手部的照片（可选）'),
        help: L('Only the shop sees it.', '只有店里能看到。'),
      },
    ],
  }
}
