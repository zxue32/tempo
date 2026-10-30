'use client'
import { useState } from 'react'
import { useI18n } from '@/components/i18n'
import { downscale } from '@/components/downscale'
import { visibleFields, type FormSchema, type FormField } from '@/lib/forms'
import { pick } from '@/lib/i18n'
import { fmtDuration } from '@/lib/tz'
import { formatMoney } from '@/lib/money'
import type { CurrencyCode } from '@/lib/markets'

type Addon = { id: string; name: string; nameZh: string | null; durationMin: number; priceCents: number | null }

/**
 * The shop's intake questions (CORE-05), shown under the services. Choice answers that need an add-on say so
 * (time and price come from the shop's menu). Photos go up as private files only the shop can open; the preview
 * here is the customer's own copy.
 */
export function IntakeQuestions({ slug, form, answers, onChange, addons, showPrices, currency }: {
  slug: string; form: FormSchema; answers: Record<string, unknown>; onChange: (answers: Record<string, unknown>) => void
  addons: Addon[]; showPrices: boolean; currency: CurrencyCode
}) {
  const { t, lang } = useI18n()
  const set = (key: string, v: unknown) => onChange({ ...answers, [key]: v })
  return (
    <section className="flex flex-col gap-3" aria-labelledby="in-h">
      <div>
        <h2 id="in-h" className="text-[11.5px] font-bold uppercase tracking-[.14em] s-muted">{t('in.title')}</h2>
        <p className="text-[12.5px] s-muted">{t('in.sub')}</p>
      </div>
      {visibleFields(form, answers).map(f => (
        <div key={f.key} className="s-card flex flex-col gap-2 p-3" role="group" aria-labelledby={`in-${f.key}`}>
          <b id={`in-${f.key}`} className="text-[14.5px]">{f.label[lang]}{f.required ? '' : <span className="font-normal s-muted"> ({t('c.optional')})</span>}</b>
          {f.help && <span className="text-[12.5px] s-muted">{f.help[lang]}</span>}
          <Field f={f} value={answers[f.key]} set={v => set(f.key, v)} slug={slug} addons={addons} showPrices={showPrices} currency={currency} />
        </div>
      ))}
    </section>
  )
}

function Field({ f, value, set, slug, addons, showPrices, currency }: {
  f: FormField; value: unknown; set: (v: unknown) => void; slug: string; addons: Addon[]; showPrices: boolean; currency: CurrencyCode
}) {
  const { t, lang } = useI18n()
  if (f.type === 'single' || f.type === 'multi') {
    const picked = f.type === 'multi' ? (Array.isArray(value) ? (value as string[]) : []) : value
    const hint = (addonId: string | null | undefined, review?: boolean) => {
      const a = addonId ? addons.find(x => x.id === addonId) : null
      const parts = [a ? t('in.adds', pick(lang, a.name, a.nameZh), fmtDuration(a.durationMin, lang)) + (showPrices && a.priceCents ? ` · +${formatMoney(a.priceCents, currency)}` : '') : '', review ? t('in.review') : '']
      return parts.filter(Boolean).join(' · ')
    }
    const chosen = f.options!.find(o => (Array.isArray(picked) ? picked.includes(o.value) : picked === o.value))
    return (
      <>
        <div className="flex flex-wrap gap-2" role={f.type === 'single' ? 'radiogroup' : undefined}>
          {f.options!.map(o => {
            const on = Array.isArray(picked) ? picked.includes(o.value) : picked === o.value
            return (
              <button key={o.value} type="button" className="s-pill !px-4" role={f.type === 'single' ? 'radio' : undefined}
                aria-checked={f.type === 'single' ? on : undefined} aria-pressed={f.type === 'multi' ? on : undefined}
                onClick={() => set(f.type === 'single' ? o.value : on ? (picked as string[]).filter(x => x !== o.value) : [...(picked as string[]), o.value])}>
                {o.label[lang]}
              </button>
            )
          })}
        </div>
        {f.type === 'single' && chosen && hint(chosen.addonId, chosen.review) && <span className="text-[12.5px] s-muted" role="status">{hint(chosen.addonId, chosen.review)}</span>}
      </>
    )
  }
  if (f.type === 'number') {
    const lo = f.min ?? 0, hi = f.max ?? 1000
    const n = typeof value === 'number' ? value : null
    return (
      <div className="flex items-center gap-2">
        <button type="button" className="s-pill !w-10 !px-0" aria-label="−" onClick={() => set(Math.max(lo, (n ?? lo) - 1))} disabled={n == null || n <= lo}>−</button>
        <input className="s-inp tnum !w-20 text-center" inputMode="numeric" aria-label={f.label[lang]} value={n ?? ''}
          onChange={e => { const d = e.target.value.replace(/\D/g, ''); set(d === '' ? null : Math.min(hi, Math.max(lo, Number(d)))) }} />
        <button type="button" className="s-pill !w-10 !px-0" aria-label="+" onClick={() => set(Math.min(hi, (n ?? lo - 1) + 1))} disabled={n != null && n >= hi}>+</button>
      </div>
    )
  }
  if (f.type === 'text') {
    return <input className="s-inp" aria-label={f.label[lang]} value={typeof value === 'string' ? value : ''} maxLength={f.maxLength ?? 200} onChange={e => set(e.target.value)} />
  }
  return <Photos value={Array.isArray(value) ? (value as string[]) : []} max={f.maxPhotos ?? 1} set={set} slug={slug} />
}

function Photos({ value, max, set, slug }: { value: string[]; max: number; set: (v: string[]) => void; slug: string }) {
  const { t } = useI18n()
  // the uploads are private (only the shop can open them), so the customer sees a local preview
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const add = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setErr(false)
    try {
      const blob = await downscale(file)
      const fd = new FormData(); fd.append('file', blob, 'photo.jpg')
      const res = await fetch(`/api/public/${slug}/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error)
      setPreviews(p => ({ ...p, [data.url]: URL.createObjectURL(blob) }))
      set([...value, data.url])
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {value.map(u => (
        <span key={u} className="flex items-center gap-2">
          {previews[u]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={previews[u]} alt="" className="h-16 w-16 rounded-xl object-cover" />
            : <span className="grid h-16 w-16 place-items-center rounded-xl s-card text-[18px]" aria-hidden="true">✓</span>}
          <button type="button" className="s-btn s-btn-ghost s-btn-sm" onClick={() => set(value.filter(x => x !== u))}>{t('in.photoRemove')}</button>
        </span>
      ))}
      {value.length < max && (
        <label className="s-btn s-btn-ghost s-btn-sm cursor-pointer">
          {busy ? t('in.uploading') : t('in.photoAdd')}
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={e => add(e.target.files?.[0])} />
        </label>
      )}
      {err && <span className="text-[12.5px]" role="alert">{t('bf.photoErr')}</span>}
    </div>
  )
}
