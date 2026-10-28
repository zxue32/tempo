'use client'
// Client wrapper for the LUNE 3D nail studio web component (public/vendor/lune-nail-studio.js, model in
// public/models/tripo-hand.glb). The module is loaded only in the browser, listeners are attached before the
// element is mounted, and everything is released on unmount.
import { useEffect, useRef, useState } from 'react'
import type { LuneDesign } from '@/lib/lune'

export type StudioElement = HTMLElement & { getDesign(): LuneDesign; setDesign(v: unknown): void; exportCard(): Promise<Blob> }
export type BookPayload = { design: LuneDesign; summary: string }

const SRC = '/vendor/lune-nail-studio.js?v=1.2.1-theme'
let loading: Promise<void> | undefined
function loadStudio(): Promise<void> {
  if (customElements.get('lune-nail-studio')) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.type = 'module'; s.src = SRC
    s.onload = () => (customElements.get('lune-nail-studio') ? resolve() : (s.remove(), reject(new Error('module'))))
    s.onerror = () => { s.remove(); reject(new Error('network')) }
    document.head.append(s)
  }).catch(e => { loading = undefined; throw e })
  return loading
}

export function LuneStudio({ storageKey, brand, onBook, labels, vars }: {
  storageKey: string
  brand: string
  /** Colour variables (see packages/lune-nail-studio/README.md), so the studio wears the shop's theme. */
  vars?: Record<string, string>
  /** Takes over "book with this design"; gets the element too, for exportCard(). Without it the studio shows its own hand-over dialog. */
  onBook?: (p: BookPayload, el: StudioElement) => void
  labels: { loading: string; failed: string }
}) {
  const host = useRef<HTMLDivElement>(null)
  const elRef = useRef<StudioElement | null>(null)
  const varsRef = useRef(vars)
  varsRef.current = vars
  const book = useRef(onBook)
  useEffect(() => { book.current = onBook })
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let cancelled = false, el: StudioElement | undefined
    const onBooking = (e: Event) => {
      if (!book.current) return
      e.preventDefault()   // synchronously, before any async work, so the studio's own dialog stays closed
      book.current((e as CustomEvent<BookPayload>).detail, e.currentTarget as StudioElement)
    }
    const onError = (e: Event) => { setState('error'); setMsg((e as CustomEvent<{ message: string }>).detail?.message || '') }
    const onReady = () => { setState('ready'); setMsg('') }
    setState('loading')
    loadStudio().then(() => {
      if (cancelled || !host.current) return
      el = document.createElement('lune-nail-studio') as StudioElement
      el.setAttribute('storage-key', storageKey)
      el.setAttribute('brand', brand)
      el.setAttribute('model-src', '/models/tripo-hand.glb')
      for (const [k, v] of Object.entries(varsRef.current ?? {})) el.style.setProperty(k, v)
      elRef.current = el
      el.addEventListener('lune:book', onBooking)
      el.addEventListener('lune:error', onError)
      el.addEventListener('lune:ready', onReady)
      host.current.append(el)
    }).catch(() => { if (!cancelled) { setState('error'); setMsg(labels.failed) } })
    return () => {
      cancelled = true
      if (el) {
        el.removeEventListener('lune:book', onBooking); el.removeEventListener('lune:error', onError); el.removeEventListener('lune:ready', onReady)
        el.remove()   // the component releases WebGL in disconnectedCallback
      }
      elRef.current = null
    }
  }, [storageKey, brand, labels.failed])

  // a new theme (e.g. picked on the demo page) recolours the studio in place
  const varsKey = JSON.stringify(vars ?? {})
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    for (const [k, v] of Object.entries(JSON.parse(varsKey) as Record<string, string>)) el.style.setProperty(k, v)
  }, [varsKey])

  return (
    <div className="relative">
      {state === 'loading' && (
        <p role="status" className="absolute left-1/2 top-40 z-10 -translate-x-1/2 rounded-full px-4 py-2 text-[14px] shadow" style={{ background: 'var(--s-surface, #fff)' }}>
          {labels.loading}
        </p>
      )}
      {state === 'error' && msg && <p role="status" className="mb-3 rounded-xl px-4 py-3 text-[14px]" style={{ background: 'var(--s-surface, #fff)' }}>{msg}</p>}
      <div ref={host} className="min-h-[70svh]" />
    </div>
  )
}
