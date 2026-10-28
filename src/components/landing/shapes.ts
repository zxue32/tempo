// Point clouds for the landing page's particle sculptures: one signature object per trade,
// plus the formations the particles take on while the page scrolls (a week calendar, a far field, a ring).
// Every shape returns exactly `n` points (x, y, z) centred on the origin, about 2.4 units across in its radius.

export const TRADES = ['nail', 'hair', 'barber', 'spa', 'beauty', 'tattoo', 'pet', 'pilates', 'fitness', 'other'] as const
export type Trade = (typeof TRADES)[number]
export type Formation = Trade | 'calendar' | 'field' | 'ring'

/** Small deterministic random generator so a shape looks the same on every visit (and in tests). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

type Pt = [number, number, number]
type Sampler = (r: () => number, i: number, n: number) => Pt

function build(n: number, seed: number, parts: Array<[number, Sampler]>): Float32Array {
  const r = rng(seed), out = new Float32Array(n * 3)
  const total = parts.reduce((s, [w]) => s + w, 0)
  let i = 0
  parts.forEach(([w, f], k) => {
    const count = k === parts.length - 1 ? n - i : Math.round((w / total) * n)
    for (let j = 0; j < count && i < n; j++, i++) { const p = f(r, j, count); out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2] }
  })
  return out
}

const rotZ = ([x, y, z]: Pt, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z]
const rotX = ([x, y, z]: Pt, a: number): Pt => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)]
const rotY = ([x, y, z]: Pt, a: number): Pt => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]
const add = ([x, y, z]: Pt, [a, b, c]: Pt): Pt => [x + a, y + b, z + c]
const onSphere = (r: () => number): Pt => { const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); return [s * Math.cos(t), u, s * Math.sin(t)] }
const ellipsoid = (r: () => number, a: number, b: number, c: number): Pt => { const [x, y, z] = onSphere(r); return [x * a, y * b, z * c] }

// ---------- the trades

/** A fan of five almond nail tips, like a colour chart held open. */
function nail(n: number) {
  const tip = (r: () => number, k: number): Pt => {
    const L = 1.95, edge = r() < 0.3
    const v = r(), u = edge ? (r() < 0.5 ? -1 : 1) : r() * 2 - 1
    const w = 0.42 * (v < 0.62 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.62) / 0.38, 2.2))))
    let p: Pt = [u * w, v * L, 0.2 * (1 - u * u) - 0.05 * v]
    p = add(rotZ(p, ((k - 2) * 17 * Math.PI) / 180), [0, -1.15, (2 - Math.abs(k - 2)) * 0.08])
    return p
  }
  return build(n, 11, [0, 1, 2, 3, 4].map(k => [1, (r: () => number) => tip(r, k)] as [number, Sampler]))
}

/** A lock of hair: strands flowing in one S-shaped sweep, wide at the root and tapering to a curled tip. */
function hair(n: number) {
  const S = 44
  return build(n, 12, [[1, (r, j, count) => {
    const s = Math.floor((j / count) * S), u = (s / (S - 1)) * 2 - 1   // across the lock
    const t = r()                                                      // root (0) to tip (1)
    const ph = 1.7 * Math.PI * t
    const cx = 0.95 * Math.sin(ph - 0.4), cy = 2.2 - 4.4 * t, cz = 0.45 * Math.cos(ph)
    const dx = 0.95 * 1.7 * Math.PI * Math.cos(ph - 0.4), dy = -4.4, L = Math.hypot(dx, dy)
    const nx = -dy / L, ny = dx / L                                    // across the sweep, in the picture plane
    const w = 0.7 * Math.pow(1 - t, 0.75) + 0.04
    const off = u * w + 0.035 * Math.sin(8 * t + s * 1.3)
    const k = Math.max(0, (t - 0.8) / 0.2), ca = k * Math.PI * 1.4    // the tip turns over on itself
    const curlX = 0.32 * k * (Math.cos(ca) - 1), curlY = 0.32 * k * Math.sin(ca)
    return [cx + nx * off + curlX, cy + ny * off + curlY, cz + 0.16 * Math.sin(s * 2.1) * (1 - t) + (r() - 0.5) * 0.015]
  }]])
}

/** Open scissors. */
function barber(n: number) {
  const blade = (r: () => number, side: number): Pt => {
    const v = r(), w = 0.2 * (1 - v) * (r() * 2 - 1)
    const p: Pt = [w, 0.25 + v * 2.0, side * 0.05]
    return rotZ(p, side * 0.2)
  }
  const ring = (r: () => number, side: number): Pt => {
    const a = r() * Math.PI * 2, b = r() * Math.PI * 2, R = 0.42, rr = 0.07
    const c: Pt = rotZ([0, -0.55 - 0.5, 0], side * -0.42)
    return add([(R + rr * Math.cos(b)) * Math.cos(a), (R + rr * Math.cos(b)) * Math.sin(a), rr * Math.sin(b) + side * 0.05], c)
  }
  const neck = (r: () => number, side: number): Pt => rotZ([(r() - 0.5) * 0.12, 0.25 - r() * 0.9, side * 0.05], side * -0.42)
  return build(n, 13, [[3, r => blade(r, 1)], [3, r => blade(r, -1)], [1, r => neck(r, 1)], [1, r => neck(r, -1)], [2, r => ring(r, 1)], [2, r => ring(r, -1)]])
}

/** Warm stones stacked, with steam rising. */
function spa(n: number) {
  const stones: Array<[number, number, number, number, number]> = [[1.15, 0.36, 0.92, -1.45, 0.04], [0.95, 0.32, 0.78, -0.82, -0.08], [0.74, 0.27, 0.62, -0.27, 0.06], [0.52, 0.22, 0.44, 0.2, -0.05]]
  const parts: Array<[number, Sampler]> = stones.map(([a, b, c, y, tilt]) => [a * c * 2.2, (r: () => number) => add(rotZ(ellipsoid(r, a, b, c), tilt), [0, y, 0])] as [number, Sampler])
  parts.push([1.6, (r) => {
    const w = Math.floor(r() * 3), y = 0.5 + r() * 1.7, k = (y - 0.5) / 1.7
    return [(w - 1) * 0.32 + 0.22 * Math.sin(4 * y + w * 2) * (0.4 + k), y, 0.18 * Math.cos(3 * y + w) * k + (r() - 0.5) * 0.06 * k]
  }])
  return build(n, 14, parts)
}

/** A flower opening, petal by petal. */
function beauty(n: number) {
  const layers = 5
  return build(n, 15, [[1, (r) => {
    const k = Math.floor(r() * layers), m = 5 + k, p = Math.floor(r() * m)
    const s = Math.sqrt(r()), w = r() * 2 - 1
    const R = 0.35 + 0.42 * k
    const c = (2 * Math.PI * p) / m + k * 0.55
    const width = (0.55 * Math.sin(Math.PI * Math.min(1, s * 1.05)) * Math.PI) / m
    const a = c + w * width
    const rad = R * (0.25 + 0.75 * s)
    const y = (1.05 - 0.17 * k) * s * s - 0.1 * k
    let pt: Pt = [rad * Math.cos(a), y, rad * Math.sin(a)]
    pt = rotX(pt, -1.0)
    return add(pt, [0, -0.2, 0])
  }]])
}

/** A drop of ink and the crown it throws up. */
function tattoo(n: number) {
  const drop: Sampler = (r) => {
    const t = Math.acos(1 - 2 * r()), a = r() * Math.PI * 2
    const rho = 0.85 * Math.sin(t) * Math.pow(Math.sin(t / 2), 1.4)
    return [rho * Math.cos(a), 1.25 * Math.cos(t) + 0.55, rho * Math.sin(a)]
  }
  const crown: Sampler = (r) => {
    const spikes = 11, s = Math.floor(r() * spikes), a = (s / spikes) * Math.PI * 2 + (r() - 0.5) * 0.12
    const h = Math.pow(r(), 0.7) * (0.55 + 0.25 * Math.sin(s * 2.3)), R = 1.05 + h * 0.25
    return [R * Math.cos(a), -1.3 + h, R * Math.sin(a) * 0.55]
  }
  const ripple: Sampler = (r) => {
    const R = r() < 0.5 ? 1.55 : 2.05, a = r() * Math.PI * 2
    return [R * Math.cos(a), -1.42 + (r() - 0.5) * 0.03, R * Math.sin(a) * 0.5]
  }
  return build(n, 16, [[4, drop], [2, crown], [2, ripple]])
}

/** A paw print, softly domed. */
function pet(n: number) {
  const dome = (r: () => number, cx: number, cy: number, rx: number, ry: number, rot: number): Pt => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r())
    let x = d * rx * Math.cos(a), y = d * ry * Math.sin(a)
    ;[x, y] = [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)]
    return [cx + x, cy + y, 0.32 * Math.sqrt(Math.max(0, 1 - d * d)) * (r() < 0.5 ? 1 : -0.4)]
  }
  return build(n, 17, [
    [5, r => { const p = dome(r, 0, -0.55, 0.95, 0.78, 0); return [p[0] * (1 - 0.18 * Math.max(0, -p[1] - 0.55)), p[1], p[2]] }],
    [1.5, r => dome(r, -1.05, 0.55, 0.32, 0.44, 0.35)], [1.7, r => dome(r, -0.38, 1.12, 0.34, 0.47, 0.1)],
    [1.7, r => dome(r, 0.38, 1.12, 0.34, 0.47, -0.1)], [1.5, r => dome(r, 1.05, 0.55, 0.32, 0.44, -0.35)],
  ])
}

/** A pilates ring with its two pads. */
function pilates(n: number) {
  const ring: Sampler = (r) => {
    const a = r() * Math.PI * 2, b = r() * Math.PI * 2, R = 1.65, rr = 0.1
    return rotX([(R + rr * Math.cos(b)) * Math.cos(a), (R + rr * Math.cos(b)) * Math.sin(a), rr * Math.sin(b)], 0.5)
  }
  const pad = (side: number): Sampler => (r) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.5, t = (r() - 0.5) * 0.28
    return rotX([side * (1.65 + 0.12) + t * side, d * Math.cos(a), d * Math.sin(a)], 0.5)
  }
  return build(n, 18, [[5, ring], [1.3, pad(1)], [1.3, pad(-1)]])
}

/** A dumbbell. */
function fitness(n: number) {
  const bar: Sampler = (r) => { const a = r() * Math.PI * 2; return [(r() * 2 - 1) * 1.75, 0.09 * Math.cos(a), 0.09 * Math.sin(a)] }
  const plate = (x: number, R: number, th: number): Sampler => (r) => {
    const a = Math.floor(r() * 6) / 6 * Math.PI * 2, b = a + Math.PI / 3, f = r(), e = r() < 0.45
    const k = e ? 1 : Math.sqrt(r())
    const px = Math.cos(a) * (1 - f) + Math.cos(b) * f, py = Math.sin(a) * (1 - f) + Math.sin(b) * f
    return [x + (r() - 0.5) * th, py * R * k, px * R * k]
  }
  const parts: Array<[number, Sampler]> = [[1.5, bar], [3, plate(1.15, 0.85, 0.22)], [2.2, plate(1.45, 0.66, 0.2)], [3, plate(-1.15, 0.85, 0.22)], [2.2, plate(-1.45, 0.66, 0.2)]]
  return build(n, 19, parts.map(([w, f]) => [w, (r: () => number, j: number, c: number) => rotY(rotZ(f(r, j, c), 0.32), -0.5)] as [number, Sampler]))
}

/** A clock face: for every other kind of appointment. */
function other(n: number) {
  const ring: Sampler = (r) => { const a = r() * Math.PI * 2, b = r() * Math.PI * 2, R = 1.85, rr = 0.06; return [(R + rr * Math.cos(b)) * Math.cos(a), (R + rr * Math.cos(b)) * Math.sin(a), rr * Math.sin(b)] }
  const ticks: Sampler = (r) => { const k = Math.floor(r() * 12), a = (k / 12) * Math.PI * 2, d = 1.45 + r() * (k % 3 === 0 ? 0.28 : 0.15); return [d * Math.cos(a), d * Math.sin(a), (r() - 0.5) * 0.04] }
  const hand = (len: number, ang: number, w: number): Sampler => (r) => { const t = r() * len; return rotZ([(r() - 0.5) * w, t, (r() - 0.5) * 0.04], ang) }
  return build(n, 20, [[5, ring], [2, ticks], [1.4, hand(1.35, -Math.PI / 3, 0.08)], [1, hand(0.9, Math.PI * 0.78, 0.12)], [0.4, r => { const [x, y, z] = onSphere(r); return [x * 0.12, y * 0.12, z * 0.05] }]])
}

// ---------- formations while scrolling

/** A week calendar: staff columns of time slots, outlined in light. */
function calendar(n: number) {
  const cols = 5, rows = 9, W = 6.2, H = 4.2, cw = W / cols, rh = H / rows
  return build(n, 21, [[1, (r) => {
    const c = Math.floor(r() * cols), row = Math.floor(r() * rows)
    const x0 = -W / 2 + c * cw + 0.06, y0 = H / 2 - (row + 1) * rh + 0.04, w = cw - 0.12, h = rh - 0.08
    const e = r() * 2 * (w + h)
    let x: number, y: number
    if (e < w) { x = x0 + e; y = y0 } else if (e < w + h) { x = x0 + w; y = y0 + (e - w) } else if (e < 2 * w + h) { x = x0 + (e - w - h); y = y0 + h } else { x = x0; y = y0 + (e - 2 * w - h) }
    return rotX([x, y, (r() - 0.5) * 0.02], -0.45)
  }]])
}

function field(n: number) {
  return build(n, 22, [[1, (r) => { const [x, y, z] = onSphere(r), d = 6 + r() * 7; return [x * d * 1.4, y * d * 0.8, z * d - 4] }]])
}

function ring(n: number) {
  return build(n, 23, [[1, (r) => { const a = r() * Math.PI * 2, d = 2.6 + (r() - 0.5) * 0.9 * r(); return rotX([d * Math.cos(a), d * Math.sin(a), (r() - 0.5) * 0.25], 1.15) }]])
}

const MAKERS: Record<Formation, (n: number) => Float32Array> = { nail, hair, barber, spa, beauty, tattoo, pet, pilates, fitness, other, calendar, field, ring }

export function formation(kind: Formation, n: number): Float32Array {
  return MAKERS[kind](n)
}

/** Particle colours per trade: two tones the points blend between. */
export const TRADE_COLORS: Record<Trade, [string, string]> = {
  nail: ['#F6D3E1', '#C4A3FF'], hair: ['#F3C38F', '#E48A63'], barber: ['#9FC3FF', '#E9CFA0'], spa: ['#A8E6CF', '#F3E5C0'],
  beauty: ['#FFB6CF', '#FFE6EE'], tattoo: ['#B5A3FF', '#FF6B8B'], pet: ['#FFD59E', '#FFB3A0'], pilates: ['#B6F0E5', '#C7D6FF'],
  fitness: ['#FF9D78', '#FFE08A'], other: ['#C9D0FF', '#8C9BFF'],
}

/** The background mesh tints behind each trade (deep, low-light versions of its colours). */
export const TRADE_MESH: Record<Trade, [string, string, string]> = {
  nail: ['#2E1030', '#141A3C', '#22123F'], hair: ['#2E1A10', '#1A1430', '#2B1222'], barber: ['#0F1A33', '#231A10', '#151236'],
  spa: ['#0E2A24', '#1D1A10', '#10233A'], beauty: ['#33102A', '#24122E', '#2B1020'], tattoo: ['#1A0F33', '#330F1E', '#120E2A'],
  pet: ['#2E1F10', '#2A1416', '#1A1630'], pilates: ['#0E2A2A', '#141B3A', '#1A1238'], fitness: ['#331410', '#2E220E', '#1A1230'],
  other: ['#141A3A', '#1D1240', '#10183A'],
}
