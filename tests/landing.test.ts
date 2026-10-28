import { describe, it, expect } from 'vitest'
import { TRADES, formation, TRADE_COLORS, TRADE_MESH, type Formation } from '@/components/landing/shapes'

const N = 3000
describe('particle sculptures', () => {
  for (const kind of [...TRADES, 'calendar', 'field', 'ring'] as Formation[]) {
    it(`${kind}: exactly N finite points, the same on every visit`, () => {
      const a = formation(kind, N), b = formation(kind, N)
      expect(a.length).toBe(N * 3)
      expect(a.every(Number.isFinite)).toBe(true)
      expect(Array.from(a.slice(0, 30))).toEqual(Array.from(b.slice(0, 30)))
    })
  }
  for (const t of TRADES) {
    it(`${t}: fits the stage and has real depth and breadth`, () => {
      const p = formation(t, N)
      let maxR = 0; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { const v = p[i * 3 + k]; lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v) }
      for (let i = 0; i < N; i++) maxR = Math.max(maxR, Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]))
      expect(maxR).toBeLessThan(3.2)
      const ext = hi.map((h, k) => h - lo[k]).sort((x, y) => y - x)
      expect(ext[0]).toBeGreaterThan(1.8)
      expect(ext[1]).toBeGreaterThan(1)
      expect(ext[2]).toBeGreaterThan(0.1)
      expect(TRADE_COLORS[t]).toHaveLength(2)
      expect(TRADE_MESH[t]).toHaveLength(3)
    })
  }
})
