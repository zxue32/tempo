'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast } from '@/components/dash'
import { nailIntake, FIELD_TYPES, LIMITS, type FormSchema, type FormField, type FieldType } from '@/lib/forms'
import type { DictKey } from '@/lib/i18n'
import { saveIntakeFormAction } from '../actions'

type Addon = { id: string; name: string }
type Latest = { industry: string; version: number; active: boolean; schema: FormSchema } | null

/**
 * The shop's booking questions (CORE-05). Only the whitelisted question types and settings can be edited here;
 * each save becomes a new version on the server, which checks it again. Answers already given keep their version.
 */
export function IntakeEditor({ shopId, industry, industryLabel, latest, addons, removalGuess }: {
  shopId: string; industry: string; industryLabel: string; latest: Latest; addons: Addon[]; removalGuess: string | null
}) {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [draft, setDraft] = useState<FormSchema | null>(latest?.schema ?? null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(draft) !== JSON.stringify(latest?.schema ?? null)

  const save = (active: boolean) => start(async () => {
    if (!draft) return
    setErr(null)
    const r = await saveIntakeFormAction(shopId, industry, draft, active)
    if (!r.ok) { setErr(t('fm.bad', r.detail || r.error)); return }
    toast.show(t('fm.saved', r.version))
    router.refresh()
  })
  const setField = (i: number, patch: Partial<FormField>) => setDraft(d => d && { fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  const move = (i: number, by: -1 | 1) => setDraft(d => {
    if (!d) return d
    const fields = [...d.fields]; const j = i + by
    if (j < 0 || j >= fields.length) return d
    ;[fields[i], fields[j]] = [fields[j], fields[i]]
    // a condition may only point at an earlier question
    return { fields: fields.map((f, k) => (f.showIf && fields.findIndex(x => x.key === f.showIf!.field) >= k ? { ...f, showIf: null } : f)) }
  })
  const remove = (i: number) => setDraft(d => d && { fields: d.fields.filter((_, j) => j !== i).map(f => (f.showIf?.field === d.fields[i].key ? { ...f, showIf: null } : f)) })
  const add = (type: FieldType) => setDraft(d => {
    const fields = d?.fields ?? []
    let n = fields.length + 1
    while (fields.some(f => f.key === `q${n}`)) n++
    const blank: FormField = { key: `q${n}`, type, required: false, label: { en: '', zh: '' } }
    if (type === 'single' || type === 'multi') blank.options = [{ value: 'o1', label: { en: '', zh: '' } }, { value: 'o2', label: { en: '', zh: '' } }]
    if (type === 'number') { blank.min = 0; blank.max = 10 }
    if (type === 'photo') blank.maxPhotos = 1
    return { fields: [...fields, blank] }
  })

  const status = !latest ? t('fm.off') : latest.active ? t('fm.on', latest.version) : t('fm.paused', latest.version)

  return (
    <section className="card flex flex-col gap-4 p-5" aria-labelledby={`fm-h-${industry}`} data-form={industry}>
      <div>
        <h2 id={`fm-h-${industry}`} className="text-[17px] font-bold">{t('fm.title')} · {industryLabel}</h2>
        <p className="text-[13.5px] text-muted">{t('fm.sub')}</p>
        <span className={`chip mt-2 ${latest?.active ? 'chip-ok' : ''}`}>{status}</span>
      </div>

      {!draft && (
        <div className="flex flex-wrap gap-2">
          {industry === 'nail' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setDraft(nailIntake(removalGuess))}>{t('fm.useNail')}</button>}
          <AddField onAdd={add} />
        </div>
      )}

      {draft && draft.fields.map((f, i) => (
        <FieldCard key={f.key} scope={industry} f={f} i={i} last={i === draft.fields.length - 1} earlier={draft.fields.slice(0, i).filter(x => x.options)} addons={addons}
          set={p => setField(i, p)} move={by => move(i, by)} remove={() => remove(i)} />
      ))}

      {draft && (
        <div className="flex flex-wrap items-center gap-2">
          {draft.fields.length < LIMITS.fields && <AddField onAdd={add} />}
          <span className="flex-1" />
          {latest?.active && !dirty && <button type="button" className="btn btn-sm" disabled={pending} onClick={() => save(false)}>{t('fm.turnOff')}</button>}
          {(dirty || !latest?.active) && draft.fields.length > 0 && (
            <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => save(true)}>{latest?.active ? t('fm.save') : t('fm.turnOn')}</button>
          )}
        </div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  )
}

function AddField({ onAdd }: { onAdd: (t: FieldType) => void }) {
  const { t } = useI18n()
  return (
    <label className="flex items-center gap-2 text-[13.5px]">
      <span className="font-semibold">{t('fm.addField')}</span>
      <select className="inp inp-sm !w-auto" value="" onChange={e => { if (e.target.value) onAdd(e.target.value as FieldType) }}>
        <option value="">…</option>
        {FIELD_TYPES.map(ty => <option key={ty} value={ty}>{t(`fm.type.${ty}` as DictKey)}</option>)}
      </select>
    </label>
  )
}

function FieldCard({ scope, f, i, last, earlier, addons, set, move, remove }: {
  scope: string; f: FormField; i: number; last: boolean; earlier: FormField[]; addons: Addon[]
  set: (p: Partial<FormField>) => void; move: (by: -1 | 1) => void; remove: () => void
}) {
  const { t, lang } = useI18n()
  const id = `fm-${scope}-${f.key}`
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.min(LIMITS.number, Math.round(+v) || 0)))
  const on = earlier.find(x => x.key === f.showIf?.field)
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-3" data-field={f.key}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip">{i + 1} · {t(`fm.type.${f.type}` as DictKey)}</span>
        <span className="flex-1" />
        <button type="button" className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => move(-1)} aria-label={t('fm.up')}>↑</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={last} onClick={() => move(1)} aria-label={t('fm.down')}>↓</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={remove}>{t('fm.remove')}</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className="lbl" htmlFor={`${id}-en`}>{t('fm.labelEn')}</label><input id={`${id}-en`} className="inp inp-sm" maxLength={LIMITS.label} value={f.label.en} onChange={e => set({ label: { ...f.label, en: e.target.value } })} /></div>
        <div><label className="lbl" htmlFor={`${id}-zh`}>{t('fm.labelZh')}</label><input id={`${id}-zh`} className="inp inp-sm" maxLength={LIMITS.label} value={f.label.zh} onChange={e => set({ label: { ...f.label, zh: e.target.value } })} /></div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="chk text-[13.5px]"><input type="checkbox" checked={f.required} onChange={e => set({ required: e.target.checked })} />{t('fm.required')}</label>
        <label className="chk text-[13.5px]"><input type="checkbox" checked={!!f.sensitive} onChange={e => set({ sensitive: e.target.checked })} />{t('fm.sensitive')}</label>
      </div>

      {f.options && (
        <div className="flex flex-col gap-2">
          <span className="lbl !mb-0">{t('fm.options')}</span>
          {f.options.map((o, k) => (
            <div key={o.value} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
              <input className="inp inp-sm" aria-label={t('fm.optEn')} placeholder={t('fm.optEn')} maxLength={LIMITS.label} value={o.label.en}
                onChange={e => set({ options: f.options!.map((x, j) => (j === k ? { ...x, label: { ...x.label, en: e.target.value } } : x)) })} />
              <input className="inp inp-sm" aria-label={t('fm.optZh')} placeholder={t('fm.optZh')} maxLength={LIMITS.label} value={o.label.zh}
                onChange={e => set({ options: f.options!.map((x, j) => (j === k ? { ...x, label: { ...x.label, zh: e.target.value } } : x)) })} />
              <label className="chk text-[12.5px]"><input type="checkbox" checked={!!o.review} onChange={e => set({ options: f.options!.map((x, j) => (j === k ? { ...x, review: e.target.checked } : x)) })} />{t('fm.optReview')}</label>
              <select className="inp inp-sm !w-auto" aria-label={t('fm.optAddon')} value={o.addonId ?? ''}
                onChange={e => set({ options: f.options!.map((x, j) => (j === k ? { ...x, addonId: e.target.value || null } : x)) })}>
                <option value="">{t('fm.optAddon')}: {t('fm.noAddon')}</option>
                {addons.map(a => <option key={a.id} value={a.id}>+ {a.name}</option>)}
              </select>
              <button type="button" className="btn btn-sm btn-ghost" disabled={f.options!.length <= 2} onClick={() => set({ options: f.options!.filter((_, j) => j !== k) })}>×</button>
            </div>
          ))}
          {f.options.length < LIMITS.options && (
            <button type="button" className="btn btn-sm btn-ghost self-start" onClick={() => {
              let n = f.options!.length + 1
              while (f.options!.some(o => o.value === `o${n}`)) n++
              set({ options: [...f.options!, { value: `o${n}`, label: { en: '', zh: '' } }] })
            }}>{t('fm.addOption')}</button>
          )}
        </div>
      )}

      {f.type === 'number' && (
        <div className="flex flex-wrap gap-3">
          {(['min', 'max', 'reviewAbove'] as const).map(k => (
            <label key={k} className="flex items-center gap-2 text-[13px]">{t(k === 'reviewAbove' ? 'fm.reviewAbove' : k === 'min' ? 'fm.min' : 'fm.max')}
              <input className="inp inp-sm tnum !w-20" inputMode="numeric" value={f[k] ?? ''} onChange={e => set({ [k]: num(e.target.value) ?? (k === 'reviewAbove' ? null : undefined) })} />
            </label>
          ))}
        </div>
      )}
      {f.type === 'photo' && (
        <label className="flex items-center gap-2 text-[13px]">{t('fm.maxPhotos')}
          <select className="inp inp-sm !w-auto" value={f.maxPhotos ?? 1} onChange={e => set({ maxPhotos: +e.target.value })}>
            {Array.from({ length: LIMITS.photos }, (_, k) => k + 1).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}

      {earlier.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="lbl !mb-0" htmlFor={`${id}-if`}>{t('fm.showIf')}</label>
          <select id={`${id}-if`} className="inp inp-sm !w-auto" value={f.showIf?.field ?? ''}
            onChange={e => { const q = earlier.find(x => x.key === e.target.value); set({ showIf: q ? { field: q.key, in: [q.options![0].value] } : null }) }}>
            <option value="">{t('fm.always')}</option>
            {earlier.map(q => <option key={q.key} value={q.key}>{q.label[lang] || q.key}</option>)}
          </select>
          {on && (
            <div className="flex flex-wrap gap-3">
              {on.options!.map(o => (
                <label key={o.value} className="chk text-[13px]">
                  <input type="checkbox" checked={f.showIf!.in.includes(o.value)} onChange={e => {
                    const next = e.target.checked ? [...f.showIf!.in, o.value] : f.showIf!.in.filter(v => v !== o.value)
                    if (next.length) set({ showIf: { field: on.key, in: next } })
                  }} />{o.label[lang] || o.value}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
