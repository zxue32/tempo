'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n'
import type { T, DictKey } from '@/lib/i18n'
import { pick } from '@/lib/i18n'
import type { Service, Lang } from '@/lib/types'
import { fmtTime } from '@/lib/tz'

export function Panel({ title, onClose, children, eyebrow }: { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="panel-veil" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="panel" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 className="font-display text-[22px] font-extrabold leading-tight">{title}</h2>
          </div>
          <button type="button" className="grid h-9 w-9 flex-none place-items-center rounded-full border border-line bg-surface text-[18px]" onClick={onClose} aria-label={t('c.close')}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 2600)
  }, [])
  const node = msg ? <div className="toast" role="status">{msg}</div> : null
  return { show, node }
}

/** Human message for an action error code. */
export function errText(t: T, error: string, detail?: string | null): string {
  if (error === 'taken') return t(detail && ['booked', 'shift', 'break', 'off', 'closed'].includes(detail) ? (`cal.why.${detail}` as DictKey) : 'cal.why.booked')
  if (error === 'outside_shift') return t(detail && ['shift', 'break', 'off', 'closed', 'skill'].includes(detail) ? (`cal.why.${detail}` as DictKey) : 'cal.why.shift')
  if (error === 'bad_time') return t('sc.badTime', detail || '')
  if (error === 'service_gone') return t('bf.err.service_gone')
  if (error === 'capability_disabled') return t('bf.err.capability_disabled')
  if (error === 'market_unsupported') return t('bf.err.market_unsupported')
  if (error === 'invalid' && (detail === 'dst_gap' || detail === 'dst_ambiguous')) return t(`bf.err.${detail}`)
  if (error === 'invalid') return t('bf.err.invalid') + (detail ? ` (${detail})` : '')
  if (error === 'duplicate_phone') return t('c.phone') + ' ✕'
  return t('c.error')
}

export function timeOptions(from: number, to: number, step: number, lang: Lang) {
  const out: Array<{ value: number; label: string }> = []
  for (let m = from; m <= to; m += step) out.push({ value: m, label: fmtTime(m, lang) })
  return out
}

export function ServiceChecklist({ services, selected, onToggle, idPrefix, staffDurations }: {
  services: Service[]
  selected: string[]
  onToggle: (id: string) => void
  idPrefix: string
  staffDurations?: Map<string, number | null>
}) {
  const { t, lang } = useI18n()
  const main = services.filter(s => s.kind === 'service' && s.active)
  const cats = Array.from(new Set(main.map(s => s.category)))
  const chosenCats = new Set(main.filter(s => selected.includes(s.id)).map(s => s.category))
  const addons = services.filter(s => s.kind === 'addon' && s.active && (!s.appliesTo.length || s.appliesTo.some(c => chosenCats.has(c))))
  return (
    <div className="flex flex-col gap-3">
      {cats.map(c => (
        <div key={c}>
          <div className="eyebrow mb-1">{t(`cat.${c}` as DictKey)}</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {main.filter(s => s.category === c).map(s => {
              const own = staffDurations?.get(s.id)
              const can = !staffDurations || staffDurations.has(s.id)
              return (
                <label key={s.id} className={`chk rounded-lg border px-2.5 py-2 text-[13.5px] ${selected.includes(s.id) ? 'border-accent bg-accent-soft' : 'border-line bg-surface'} ${can ? '' : 'opacity-50'}`}>
                  <input type="checkbox" id={`${idPrefix}-${s.id}`} checked={selected.includes(s.id)} onChange={() => onToggle(s.id)} />
                  <span className="min-w-0 flex-1 truncate">{pick(lang, s.name, s.nameZh)}</span>
                  <span className="tnum text-[12px] text-muted">{own ?? s.durationMin}′</span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
      {addons.length > 0 && (
        <div>
          <div className="eyebrow mb-1">{t('cat.addon')}</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {addons.map(s => (
              <label key={s.id} className={`chk rounded-lg border px-2.5 py-2 text-[13.5px] ${selected.includes(s.id) ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                <input type="checkbox" id={`${idPrefix}-${s.id}`} checked={selected.includes(s.id)} onChange={() => onToggle(s.id)} />
                <span className="min-w-0 flex-1 truncate">+ {pick(lang, s.name, s.nameZh)}</span>
                <span className="tnum text-[12px] text-muted">+{s.durationMin}′</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function CopyButton({ text, className = 'btn btn-sm' }: { text: string; className?: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text) } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } finally { ta.remove() }
    }
    setDone(true); setTimeout(() => setDone(false), 1800)
  }
  return <button type="button" className={className} onClick={copy} aria-live="polite">{done ? '✓ ' + t('c.copied') : t('c.copy')}</button>
}
