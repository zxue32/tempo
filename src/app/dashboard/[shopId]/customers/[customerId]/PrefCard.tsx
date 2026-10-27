'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n'
import { useToast, errText } from '@/components/dash'
import { NailArt, NailIcon, NAIL_SHAPES, NAIL_LENGTHS, NAIL_FINISHES, DEFAULT_NAIL_COLORS, describeDesign } from '@/components/NailArt'
import { colorLabel, type ColorName } from '@/components/PrefChips'
import { STYLE_TAGS } from '@/lib/tags'
import { cleanPrefs } from '@/lib/prefs'
import { pick } from '@/lib/i18n'
import type { NailDesign, Preferences, Staff } from '@/lib/types'
import { savePreferencesAction } from '../../actions'

export type HairOption = { id: string; label: string; display: string; hex: string; hex2: string | null }

const Tog = ({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) => (
  <button type="button" className="tog" aria-pressed={on} aria-label={label} onClick={onClick}>{children}</button>
)
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <span className="lbl">{label}</span>
    <div className="flex flex-wrap gap-2">{children}</div>
    {hint && <p className="hint">{hint}</p>}
  </div>
)

/**
 * The client's preference card — big tap-able choices so the front desk can fill it in
 * between two customers. Everything is optional; only what is set shows up on the calendar.
 */
export function PrefCard({ shopId, customerId, initial, staff, nailColors, hairColors, industry, recentDesigns }: {
  shopId: string; customerId: string; initial: Preferences; staff: Staff[]; nailColors: ColorName[]; hairColors: HairOption[]
  industry: 'nail' | 'barber' | 'both'; recentDesigns: NailDesign[]
}) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const [v, setV] = useState<Preferences>(cleanPrefs(initial))
  const [saved, setSaved] = useState<Preferences>(cleanPrefs(initial))
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(cleanPrefs(v)) !== JSON.stringify(saved)
  const nail = industry !== 'barber'
  const hair = industry !== 'nail'
  // the shop's own nail colours first, then the built-in ones it has not overridden
  const colorOptions: ColorName[] = [...nailColors, ...DEFAULT_NAIL_COLORS.filter(d => !nailColors.some(c => c.hex.toUpperCase() === d.hex.toUpperCase()))]
  const colors = v.colors ?? []
  const toggleColor = (hex: string) => setV(p => {
    const cur = p.colors ?? []
    return { ...p, colors: cur.includes(hex) ? cur.filter(c => c !== hex) : cur.length >= 6 ? cur : [...cur, hex] }
  })
  const toggleStyle = (s: string) => setV(p => {
    const cur = p.styles ?? []
    return { ...p, styles: cur.includes(s) ? cur.filter(x => x !== s) : cur.length >= 8 ? cur : [...cur, s] }
  })
  const applyDesign = (d: NailDesign) => setV(p => ({
    ...p, shape: d.shape, length: d.length, finish: d.finish,
    colors: Array.from(new Set([d.color, ...(d.art !== 'plain' && d.color2 ? [d.color2] : []), ...(p.colors ?? [])])).slice(0, 6),
  }))
  const save = () => start(async () => {
    setErr(null)
    const clean = cleanPrefs(v)
    const r = await savePreferencesAction(shopId, customerId, clean)
    if (!r.ok) { setErr(errText(t, r.error, r.detail)); return }
    setSaved(clean); setV(clean); toast.show(t('c.saved')); router.refresh()
  })
  const hairMatch = (o: HairOption) => (v.hairColor ?? '') === o.label

  return (
    <section className="card flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-[17px] font-bold">{t('pc.title')}</h2>
        <p className="text-[13px] text-muted">{t('pc.sub')}</p>
      </div>

      {nail && recentDesigns.length > 0 && (
        <Field label={t('pc.recent')} hint={t('pc.recentHint')}>
          {recentDesigns.map((d, i) => (
            <button key={i} type="button" className="flex flex-col items-center gap-1 rounded-xl border border-line bg-surface p-2 hover:border-ink" onClick={() => applyDesign(d)} aria-label={`${t('pc.useDesign')}: ${describeDesign(d, t as (k: string) => string)}`}>
              <NailArt design={d} size={96} uid={'pc' + i} />
              <span className="text-[12px] font-semibold">{t('pc.useDesign')}</span>
            </button>
          ))}
        </Field>
      )}

      {nail && (
        <>
          <Field label={t('pc.colors')} hint={t('pc.colorsHint')}>
            {colorOptions.map(c => {
              const on = colors.includes(c.hex)
              return (
                <Tog key={c.hex} on={on} onClick={() => toggleColor(c.hex)} label={colorLabel(c.hex, lang, nailColors)}>
                  <span className="h-5 w-5 flex-none rounded-full border border-black/10" style={{ background: c.hex }} />
                  <span className="max-w-[9rem] truncate">{pick(lang, c.name, c.nameZh ?? null)}</span>
                </Tog>
              )
            })}
          </Field>
          <Field label={t('nd.shapeT')}>
            {NAIL_SHAPES.map(s => (
              <Tog key={s} on={v.shape === s} onClick={() => setV(p => ({ ...p, shape: p.shape === s ? undefined : s }))}>
                <NailIcon shape={s} length={v.length ?? 'medium'} color={colors[0] ?? '#E8B4B8'} size={20} />{t(`nd.shape.${s}`)}
              </Tog>
            ))}
          </Field>
          <Field label={t('nd.lengthT')}>
            {NAIL_LENGTHS.map(l => <Tog key={l} on={v.length === l} onClick={() => setV(p => ({ ...p, length: p.length === l ? undefined : l }))}>{t(`nd.length.${l}`)}</Tog>)}
          </Field>
          <Field label={t('nd.finishT')}>
            {NAIL_FINISHES.map(f => <Tog key={f} on={v.finish === f} onClick={() => setV(p => ({ ...p, finish: p.finish === f ? undefined : f }))}>{t(`nd.finish.${f}`)}</Tog>)}
          </Field>
          <Field label={t('tag.style')}>
            {STYLE_TAGS.nail.map(s => <Tog key={s} on={(v.styles ?? []).includes(s)} onClick={() => toggleStyle(s)}>{t(`tag.${s}`)}</Tog>)}
          </Field>
        </>
      )}

      {hair && (
        <>
          <div>
            <label className="lbl" htmlFor="pc-hair">{t('pl.hair')}</label>
            {hairColors.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {hairColors.map(o => (
                  <Tog key={o.id} on={hairMatch(o)} onClick={() => setV(p => ({ ...p, hairColor: hairMatch(o) ? '' : o.label }))}>
                    <span className="h-5 w-5 flex-none rounded-full border border-black/10" style={{ background: o.hex2 ? `linear-gradient(135deg, ${o.hex}, ${o.hex2})` : o.hex }} />{o.display}
                  </Tog>
                ))}
              </div>
            )}
            <input id="pc-hair" className="inp" value={v.hairColor ?? ''} maxLength={80} placeholder={t('pc.hairColorPh')} onChange={e => setV(p => ({ ...p, hairColor: e.target.value }))} />
          </div>
          <div>
            <label className="lbl" htmlFor="pc-style">{t('pc.hairStyle')}</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {STYLE_TAGS.barber.map(s => <Tog key={s} on={(v.styles ?? []).includes(s)} onClick={() => toggleStyle(s)}>{t(`tag.${s}`)}</Tog>)}
            </div>
            <input id="pc-style" className="inp" value={v.hairStyle ?? ''} maxLength={80} placeholder={t('pc.hairStylePh')} onChange={e => setV(p => ({ ...p, hairStyle: e.target.value }))} />
          </div>
        </>
      )}

      <Field label={t('pc.staff')}>
        {staff.filter(s => s.active).map(s => (
          <Tog key={s.id} on={v.staffId === s.id} onClick={() => setV(p => ({ ...p, staffId: p.staffId === s.id ? null : s.id }))}>
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color }} />{pick(lang, s.name, s.nameZh)}
          </Tog>
        ))}
      </Field>

      <div>
        <label className="lbl" htmlFor="pc-notes">{t('pc.notes')}</label>
        <textarea id="pc-notes" className="inp" rows={3} maxLength={500} value={v.notes ?? ''} placeholder={t('pc.notesPh')} onChange={e => setV(p => ({ ...p, notes: e.target.value }))} />
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={!dirty || pending} onClick={save}>{pending ? t('c.saving') : t('c.save')}</button>
        {dirty && <button className="btn btn-ghost" onClick={() => setV(saved)}>{t('c.cancel')}</button>}
      </div>
      {toast.node}
    </section>
  )
}
