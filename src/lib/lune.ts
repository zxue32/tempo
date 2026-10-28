// The LUNE 3D nail studio (public/vendor/lune-nail-studio.js) keeps a rich five-finger design.
// Tempo's bookings keep a simpler one-look design (shown on the calendar and "My day"), a picture and a note,
// so this file turns the studio's design into those, and carries it from the studio to the booking page.
import type { NailDesign } from './types'

export type LuneNail = {
  color: string
  shape: 'almond' | 'oval' | 'square' | 'squoval' | 'coffin' | 'stiletto'
  length: number
  finish: 'gloss' | 'matte' | 'pearl' | 'chrome'
  pattern: 'solid' | 'french' | 'ombre' | 'bloom'
  base?: 'jelly' | 'milky' | 'solid'
  patternColor?: string
  optical?: 'none' | 'catEye' | 'mirror' | 'aurora'
  opticalColor?: string
  particles?: 'none' | 'shimmer' | 'glitter' | 'foil' | 'shell'
  particleColor?: string
  decoration?: 'none' | 'star' | 'line' | 'rhinestone' | 'pearl'
  decorationColor?: string
  topCoat?: 'gloss' | 'matte'
  topCoatColor?: string
  strokes: unknown[]
}
export type LuneDesign = { schemaVersion: 1; name: string; updatedAt: string; skinTone: string; nails: LuneNail[] }

const HEX = /^#[0-9a-f]{6}$/i

export function isLuneDesign(v: unknown): v is LuneDesign {
  if (!v || typeof v !== 'object') return false
  const d = v as Partial<LuneDesign>
  return d.schemaVersion === 1 && Array.isArray(d.nails) && d.nails.length === 5 &&
    d.nails.every(n => !!n && typeof n === 'object' && typeof n.color === 'string' && HEX.test(n.color) && typeof n.shape === 'string' && typeof n.length === 'number')
}

const SHAPE: Record<LuneNail['shape'], NailDesign['shape']> = { almond: 'almond', oval: 'round', square: 'square', squoval: 'squoval', coffin: 'coffin', stiletto: 'stiletto' }

/** The booking's one-look summary of a studio design. The studio itself says colours follow the middle finger. */
export function luneToNailDesign(d: LuneDesign): NailDesign {
  const n = d.nails[2] ?? d.nails[0]
  const length: NailDesign['length'] = n.length < 0.25 ? 'short' : n.length < 0.75 ? 'medium' : 'long'
  const finish: NailDesign['finish'] =
    n.optical === 'mirror' || n.finish === 'chrome' ? 'chrome'
      : n.particles && n.particles !== 'none' ? 'glitter'
        : n.topCoat === 'matte' || n.finish === 'matte' ? 'matte' : 'glossy'
  const differs = d.nails.some(x => x.color.toLowerCase() !== n.color.toLowerCase() || (x.pattern ?? 'solid') !== (n.pattern ?? 'solid'))
  const art: NailDesign['art'] =
    n.pattern === 'french' ? 'french' : n.pattern === 'ombre' ? 'ombre' : n.pattern === 'bloom' ? 'marble'
      : differs ? 'accent'
        : n.decoration === 'line' ? 'line' : n.decoration && n.decoration !== 'none' ? 'dots' : 'plain'
  const color2 = n.patternColor && HEX.test(n.patternColor) ? n.patternColor
    : differs ? (d.nails.find(x => x.color.toLowerCase() !== n.color.toLowerCase())?.color ?? null) : null
  return { shape: SHAPE[n.shape] ?? 'almond', length, color: n.color, color2, finish, art, colorName: d.name?.slice(0, 40) || null }
}

/** The technician's sentence goes into the booking note, which holds 1000 characters in all. */
export function noteFromSummary(summary: string, max = 700): string {
  const s = summary.replace(/\s+\n/g, '\n').trim()
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// ---------- studio → booking page

export type Handoff = { slug: string; design: NailDesign; summary: string; name: string; at: number }
const KEY = 'tempo.lune'
const MAX_AGE = 6 * 60 * 60 * 1000
// The design card stays in memory: the booking page is a client-side navigation away, so it survives;
// after a reload the booking still carries the design and the note, just without the picture.
let card: { slug: string; blob: Blob } | null = null

export function saveHandoff(h: Omit<Handoff, 'at'>, blob: Blob | null) {
  card = blob ? { slug: h.slug, blob } : null
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...h, at: Date.now() })) } catch { /* private mode: memory only */ }
}

export function readHandoff(slug: string): (Handoff & { card: Blob | null }) | null {
  let h: Handoff | null = null
  try { h = JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch { h = null }
  if (!h || h.slug !== slug || Date.now() - h.at > MAX_AGE || typeof h.summary !== 'string' || !h.design) return null
  return { ...h, card: card && card.slug === slug ? card.blob : null }
}

export function clearHandoff() {
  card = null
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}
