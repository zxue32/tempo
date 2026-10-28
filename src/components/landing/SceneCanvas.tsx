'use client'
// The fixed 3D background: loads Three.js only after the page is up, and falls back to a still where WebGL is missing.
import { useEffect, useRef, useState } from 'react'
import type { Trade } from './shapes'
import type { SceneHandle, Slots, Stage } from './scene'

export function SceneCanvas({ trade, stage, slots, poster = '/landing/poster.jpg' }: { trade: Trade; stage: Stage; slots?: Slots; poster?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<SceneHandle | null>(null)
  const latest = useRef({ trade, stage, slots })
  latest.current = { trade, stage, slots }
  const [mode, setMode] = useState<'loading' | 'live' | 'still'>('loading')
  useEffect(() => {
    let dead = false
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const small = window.innerWidth < 760
    let ok = false
    try { const c = document.createElement('canvas'); ok = !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { ok = false }
    if (!ok) { setMode('still'); return }
    import('./scene').then(m => {
      if (dead || !host.current) return
      const h = m.createScene(host.current, { trade: latest.current.trade, calm, small, onFail: () => setMode('still') })
      if (!h) { setMode('still'); return }
      handle.current = h
      h.setStage(latest.current.stage)
      if (latest.current.slots) h.setSlots(latest.current.slots)
      setMode('live')
    }).catch(() => setMode('still'))
    return () => { dead = true; handle.current?.dispose(); handle.current = null }
  }, [])
  useEffect(() => { handle.current?.setTrade(trade) }, [trade])
  useEffect(() => { handle.current?.setStage(stage) }, [stage])
  useEffect(() => { if (slots) handle.current?.setSlots(slots) }, [slots])
  return (
    <div className="ds-scene" aria-hidden="true" data-scene={mode}>
      <div className="ds-poster" style={{ backgroundImage: `url(${poster})`, opacity: mode === 'live' ? 0 : mode === 'still' ? 0.85 : 0.6, transition: 'opacity 1s' }} />
      <div ref={host} className="absolute inset-0" />
    </div>
  )
}
