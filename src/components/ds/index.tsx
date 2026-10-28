'use client'
// Tempo design system for the landing page and sign-in pages (styles in src/styles/ds.css).
// One set of controls with every state spelled out: hover, press, keyboard focus, loading, disabled, success, error.
import Link from 'next/link'
import { forwardRef, useCallback, useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'glass'
type Size = 'sm' | 'md' | 'lg'

function btnClass(variant: Variant, size: Size, block?: boolean, extra?: string) {
  return ['ds-btn', `ds-btn-${variant}`, size !== 'md' ? `ds-btn-${size}` : '', block ? 'ds-btn-block' : '', extra ?? ''].filter(Boolean).join(' ')
}

export type ButtonProps = {
  variant?: Variant; size?: Size; block?: boolean; loading?: boolean; success?: boolean; magnetic?: boolean
  href?: string; children: ReactNode; className?: string
} & Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'children'>

/** A button, or a link styled as one when `href` is given. */
export function Button({ variant = 'glass', size = 'md', block, loading, success, magnetic, href, children, className, disabled, ...rest }: ButtonProps) {
  const ref = useMagnetic<HTMLElement>(!!magnetic && !disabled)
  const cls = btnClass(variant, size, block, className)
  const body = (
    <>
      {loading && <span className="ds-spinner" aria-hidden="true" />}
      {success && !loading && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
      <span>{children}</span>
    </>
  )
  if (href) {
    return <Link href={href} ref={ref as React.Ref<HTMLAnchorElement>} className={cls} aria-disabled={disabled || undefined} data-state={success ? 'success' : undefined}>{body}</Link>
  }
  return (
    <button ref={ref as React.Ref<HTMLButtonElement>} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} data-state={success ? 'success' : undefined} {...rest}>
      {body}
    </button>
  )
}

/** The element drifts a few pixels toward the pointer, then springs back. */
export function useMagnetic<T extends HTMLElement>(on: boolean, strength = 0.28) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !on || window.matchMedia('(pointer: coarse), (prefers-reduced-motion: reduce)').matches) return
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2)
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`
    }
    const leave = () => { el.style.transform = '' }
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave)
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave) }
  }, [on, strength])
  return ref
}

/** A frosted panel. `breathe` lets it float gently. */
export function Glass({ as: Tag = 'div', strong, breathe, className, children, ...rest }: {
  as?: 'div' | 'section' | 'article' | 'aside' | 'header' | 'form'; strong?: boolean; breathe?: boolean; className?: string; children: ReactNode
} & Record<string, unknown>) {
  const cls = ['ds-glass', strong ? 'ds-glass-strong' : '', breathe ? 'ds-breathe' : '', className ?? ''].filter(Boolean).join(' ')
  return <Tag className={cls} {...rest}>{children}</Tag>
}

type FieldBase = { label: ReactNode; hint?: ReactNode; error?: ReactNode; success?: ReactNode; aside?: ReactNode }

/** Label, control, hint, and an error that is announced and tied to the control. */
export const TextField = forwardRef<HTMLInputElement, FieldBase & ComponentPropsWithoutRef<'input'>>(function TextField({ label, hint, error, success, aside, id, className, ...rest }, ref) {
  const auto = useId()
  const fid = id ?? auto
  const describe = [hint ? `${fid}-hint` : '', error ? `${fid}-err` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="ds-field">
      <label className="ds-label" htmlFor={fid}><span>{label}</span>{aside}</label>
      <div className="ds-control">
        <input ref={ref} id={fid} className={['ds-input', className ?? ''].join(' ')} aria-invalid={error ? true : undefined} aria-describedby={describe} data-valid={success ? true : undefined} {...rest} />
      </div>
      {hint && <p id={`${fid}-hint`} className="ds-hint">{hint}</p>}
      {error && <p id={`${fid}-err`} className="ds-error" role="alert">{error}</p>}
      {success && !error && <p className="ds-success">{success}</p>}
    </div>
  )
})

/** A password field with a show / hide toggle. */
export function PasswordField({ label, hint, error, aside, showLabel, hideLabel, id, ...rest }: FieldBase & { showLabel: string; hideLabel: string } & ComponentPropsWithoutRef<'input'>) {
  const [shown, setShown] = useState(false)
  const auto = useId()
  const fid = id ?? auto
  const describe = [hint ? `${fid}-hint` : '', error ? `${fid}-err` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="ds-field">
      <label className="ds-label" htmlFor={fid}><span>{label}</span>{aside}</label>
      <div className="ds-control">
        <input id={fid} type={shown ? 'text' : 'password'} className="ds-input ds-input-pad-r" aria-invalid={error ? true : undefined} aria-describedby={describe} {...rest} />
        <button type="button" className="ds-reveal-pw" aria-label={showLabel} aria-pressed={shown} title={shown ? hideLabel : showLabel} onClick={() => setShown(s => !s)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{shown && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
      {hint && <p id={`${fid}-hint`} className="ds-hint">{hint}</p>}
      {error && <p id={`${fid}-err`} className="ds-error" role="alert">{error}</p>}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  return <p className={`ds-notice ${tone !== 'info' ? `ds-notice-${tone}` : ''}`} role={tone === 'bad' ? 'alert' : 'status'}>{children}</p>
}

/** Children rise and fade in, one after another, the first time they scroll into view. */
/** Reduced-motion preference that is safe to render with: false on the server and on the first client render
    (so the markup matches), the visitor's real setting right after. */
export function useCalm() {
  const reduce = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted && !!reduce
}

export function Reveal({ children, delay = 0, y = 24, className, as = 'div' }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'li' | 'section' }) {
  const calm = useCalm()
  const M = as === 'li' ? motion.li : as === 'section' ? motion.section : motion.div
  // with reduced motion the content is simply shown (no rise, no fade) as soon as the page is up
  const how = calm
    ? { animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : { whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '0px 0px -10% 0px' }, transition: { type: 'spring' as const, stiffness: 120, damping: 20, mass: 0.8, delay } }
  return <M className={className} initial={{ opacity: 0, y }} {...how}>{children}</M>
}

/** A card that tilts toward the pointer, with a soft light following it. */
export function Tilt({ children, className, max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${px * 100}%`); el.style.setProperty('--my', `${py * 100}%`)
    el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) translateZ(0)`
  }, [max])
  const onLeave = useCallback(() => { if (ref.current) ref.current.style.transform = '' }, [])
  return <div ref={ref} className={['ds-tilt', className ?? ''].join(' ')} onPointerMove={onMove} onPointerLeave={onLeave}>{children}</div>
}
