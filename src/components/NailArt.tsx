import type { NailDesign } from '@/lib/types'

// Draws a hand with five nails from a NailDesign. Plain SVG with no CSS variables, so the same
// markup can be turned into a PNG on the client (see designToPng) and shown to the technician.

export const NAIL_SHAPES: NailDesign['shape'][] = ['round', 'square', 'squoval', 'almond', 'coffin', 'stiletto']
export const NAIL_LENGTHS: NailDesign['length'][] = ['short', 'medium', 'long']
export const NAIL_FINISHES: NailDesign['finish'][] = ['glossy', 'matte', 'chrome', 'glitter']
export const NAIL_ARTS: NailDesign['art'][] = ['plain', 'french', 'ombre', 'accent', 'dots', 'line', 'marble']

export const DEFAULT_NAIL_COLORS: Array<{ hex: string; name: string; nameZh: string }> = [
  { hex: '#F3D9D3', name: 'Ballet pink', nameZh: '芭蕾粉' }, { hex: '#E8B4B8', name: 'Rose', nameZh: '玫瑰粉' }, { hex: '#D9A48F', name: 'Nude', nameZh: '裸色' },
  { hex: '#C8405C', name: 'Raspberry', nameZh: '树莓红' }, { hex: '#A5192C', name: 'Classic red', nameZh: '正红' }, { hex: '#6E1E2E', name: 'Wine', nameZh: '酒红' },
  { hex: '#F2C14E', name: 'Butter', nameZh: '奶油黄' }, { hex: '#E07A3F', name: 'Terracotta', nameZh: '陶土橙' }, { hex: '#8A5A3C', name: 'Mocha', nameZh: '摩卡' },
  { hex: '#9CC5A1', name: 'Sage', nameZh: '鼠尾草绿' }, { hex: '#2F6B4F', name: 'Forest', nameZh: '墨绿' }, { hex: '#9DC3E6', name: 'Sky', nameZh: '天空蓝' },
  { hex: '#2B4A7A', name: 'Navy', nameZh: '藏青' }, { hex: '#B8A1D9', name: 'Lilac', nameZh: '丁香紫' }, { hex: '#5B3A8E', name: 'Grape', nameZh: '葡萄紫' },
  { hex: '#F7F3EE', name: 'Milk', nameZh: '奶白' }, { hex: '#C9CBD3', name: 'Silver', nameZh: '银灰' }, { hex: '#1E1E22', name: 'Black', nameZh: '黑色' },
]

export const DEFAULT_DESIGN: NailDesign = { shape: 'almond', length: 'medium', color: '#E8B4B8', color2: '#F7F3EE', finish: 'glossy', art: 'plain' }

const H = { short: 46, medium: 62, long: 82 }
const W = 40

/** Nail outline: base at y=0 (cuticle, wider), tip at y=-h. Returns an SVG path in local coordinates. */
export function nailPath(shape: NailDesign['shape'], length: NailDesign['length'], w = W): string {
  const h = H[length], x0 = -w / 2, x1 = w / 2, r = w / 2
  const base = `M${x0} 0 C ${x0} 10, ${x1} 10, ${x1} 0`  // curved cuticle line
  switch (shape) {
    case 'round':
      return `${base} L${x1} ${-h + r} A ${r} ${r} 0 0 0 ${x0} ${-h + r} Z`
    case 'square':
      return `${base} L${x1} ${-h + 4} Q ${x1} ${-h}, ${x1 - 4} ${-h} L${x0 + 4} ${-h} Q ${x0} ${-h}, ${x0} ${-h + 4} Z`
    case 'squoval':
      return `${base} L${x1} ${-h + 14} C ${x1} ${-h + 2}, ${x1 - 10} ${-h}, ${0} ${-h} C ${x0 + 10} ${-h}, ${x0} ${-h + 2}, ${x0} ${-h + 14} Z`
    case 'almond':
      return `${base} L${x1} ${-h * 0.42} C ${x1} ${-h * 0.8}, ${w * 0.16} ${-h}, 0 ${-h} C ${-w * 0.16} ${-h}, ${x0} ${-h * 0.8}, ${x0} ${-h * 0.42} Z`
    case 'coffin':
      return `${base} L${x1} ${-h * 0.4} L${w * 0.26} ${-h} L${-w * 0.26} ${-h} L${x0} ${-h * 0.4} Z`
    case 'stiletto':
      return `${base} L${x1} ${-h * 0.35} C ${x1} ${-h * 0.7}, ${w * 0.08} ${-h * 0.95}, 0 ${-h} C ${-w * 0.08} ${-h * 0.95}, ${x0} ${-h * 0.7}, ${x0} ${-h * 0.35} Z`
  }
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

type NailProps = { d: NailDesign; i: number; uid: string }

function Nail({ d, i, uid }: NailProps) {
  const h = H[d.length]
  const c2 = d.color2 || '#F7F3EE'
  const id = `${uid}-${i}`
  const path = nailPath(d.shape, d.length)
  const isAccent = d.art === 'accent' && i === 3
  const fill = isAccent ? c2 : d.color
  const dark = luminance(fill) < 0.45
  return (
    <g>
      <defs>
        <clipPath id={`${id}-clip`}><path d={path} /></clipPath>
        {d.art === 'ombre' && (
          <linearGradient id={`${id}-ombre`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c2} /><stop offset="1" stopColor={d.color} />
          </linearGradient>
        )}
        {d.finish === 'chrome' && (
          <linearGradient id={`${id}-chrome`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" /><stop offset="0.35" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="0.6" stopColor="#000000" stopOpacity="0.18" /><stop offset="1" stopColor="#ffffff" stopOpacity="0.45" />
          </linearGradient>
        )}
        {d.finish === 'glitter' && (
          <pattern id={`${id}-glitter`} width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.9" fill="#fff" opacity="0.85" /><circle cx="4.5" cy="4" r="0.7" fill="#fff" opacity="0.6" /><circle cx="3" cy="2.5" r="0.5" fill="#000" opacity="0.15" />
          </pattern>
        )}
        {d.art === 'dots' && (
          <pattern id={`${id}-dots`} width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="5" r="2.1" fill={c2} />
          </pattern>
        )}
      </defs>
      {/* base colour */}
      <path d={path} fill={d.art === 'ombre' && !isAccent ? `url(#${id}-ombre)` : fill} stroke="rgba(0,0,0,.18)" strokeWidth="1" />
      <g clipPath={`url(#${id}-clip)`}>
        {d.art === 'french' && !isAccent && <path d={`M-30 ${-h * 0.58} C -10 ${-h * 0.76}, 10 ${-h * 0.76}, 30 ${-h * 0.58} L30 ${-h - 20} L-30 ${-h - 20} Z`} fill={c2} />}
        {d.art === 'dots' && !isAccent && <rect x="-30" y={-h - 5} width="60" height={h + 10} fill={`url(#${id}-dots)`} />}
        {d.art === 'line' && !isAccent && <path d={`M-26 ${-h * 0.25} L26 ${-h * 0.75}`} stroke={c2} strokeWidth="3.5" strokeLinecap="round" />}
        {d.art === 'marble' && !isAccent && (
          <g fill="none" stroke={c2} strokeOpacity="0.85" strokeLinecap="round">
            <path d={`M-22 ${-h * 0.2} C -6 ${-h * 0.35}, -18 ${-h * 0.6}, 2 ${-h * 0.7} S 18 ${-h * 0.95}, 14 ${-h * 0.98}`} strokeWidth="2.4" />
            <path d={`M-16 ${-h * 0.85} C 0 ${-h * 0.7}, -4 ${-h * 0.5}, 12 ${-h * 0.4} S 18 ${-h * 0.15}, 8 ${-h * 0.08}`} strokeWidth="1.4" />
          </g>
        )}
        {d.finish === 'glitter' && <rect x="-30" y={-h - 5} width="60" height={h + 10} fill={`url(#${id}-glitter)`} />}
        {d.finish === 'chrome' && <rect x="-30" y={-h - 5} width="60" height={h + 10} fill={`url(#${id}-chrome)`} />}
        {d.finish === 'glossy' && <ellipse cx="-9" cy={-h * 0.62} rx="5" ry={h * 0.22} fill="#fff" opacity={dark ? 0.5 : 0.55} transform={`rotate(-8 -9 ${-h * 0.62})`} />}
        {d.finish === 'matte' && <rect x="-30" y={-h - 5} width="60" height={h + 10} fill="#000" opacity="0.04" />}
      </g>
    </g>
  )
}

/** The hand. `size` is the rendered width in px; the viewBox is 420×360. */
export function NailArt({ design, size = 300, uid = 'na', className, skin = '#E9C5AC' }: { design: NailDesign; size?: number; uid?: string; className?: string; skin?: string }) {
  // finger x positions and tip heights (thumb, index, middle, ring, pinky), hand drawn from the wrist up
  const fingers = [
    { x: 56, tip: 215, w: 54, rot: -22 }, { x: 148, tip: 112, w: 48, rot: -4 }, { x: 218, tip: 86, w: 50, rot: 0 }, { x: 288, tip: 104, w: 48, rot: 3 }, { x: 350, tip: 150, w: 42, rot: 8 },
  ]
  const shade = 'rgba(0,0,0,.08)'
  return (
    <svg viewBox="0 0 420 360" width={size} height={size * 360 / 420} className={className} role="img" aria-label="Nail design preview" xmlns="http://www.w3.org/2000/svg">
      <rect width="420" height="360" fill="#FBF6F2" rx="28" />
      {/* palm */}
      <path d="M118 360 L118 232 C118 198, 150 170, 200 168 L300 168 C340 168, 372 196, 372 238 L372 360 Z" fill={skin} />
      {fingers.map((f, i) => (
        <g key={i} transform={`translate(${f.x} ${f.tip}) rotate(${f.rot})`}>
          <rect x={-f.w / 2} y={0} width={f.w} height={i === 0 ? 120 : 200} rx={f.w / 2} fill={skin} />
          <rect x={f.w / 2 - 9} y={8} width={9} height={(i === 0 ? 120 : 200) - 16} rx={4.5} fill={shade} />
          <g transform={`translate(0 ${f.w * 1.05}) scale(${(f.w * 0.78) / W})`}>
            <Nail d={design} i={i} uid={uid} />
          </g>
        </g>
      ))}
    </svg>
  )
}

/** One nail on its own, for shape / length pickers. */
export function NailIcon({ shape, length = 'medium', color = '#E8B4B8', size = 28 }: { shape: NailDesign['shape']; length?: NailDesign['length']; color?: string; size?: number }) {
  const h = H[length]
  return (
    <svg viewBox={`-26 ${-h - 6} 52 ${h + 14}`} width={size} height={size * (h + 14) / 52} aria-hidden="true">
      <path d={nailPath(shape, length)} fill={color} stroke="rgba(0,0,0,.25)" strokeWidth="1.5" />
    </svg>
  )
}

/** Short human-readable description, e.g. for the booking notes the technician reads. */
export function describeDesign(d: NailDesign, t: (k: string) => string): string {
  const parts = [t(`nd.shape.${d.shape}`), t(`nd.length.${d.length}`), d.colorName || d.color, t(`nd.finish.${d.finish}`)]
  const named: Record<string, string> = { '#f7f3ee': 'nd.c2.white', '#d4af37': 'nd.c2.gold', '#c9cbd3': 'nd.c2.silver', '#1e1e22': 'nd.c2.black' }
  const c2 = d.color2 ? (named[d.color2.toLowerCase()] ? t(named[d.color2.toLowerCase()]) : DEFAULT_NAIL_COLORS.find(c => c.hex.toLowerCase() === d.color2!.toLowerCase())?.nameZh ?? d.color2) : ''
  if (d.art !== 'plain') parts.push(t(`nd.art.${d.art}`) + (c2 ? ` (${c2})` : ''))
  return parts.join(' · ')
}

export function isNailDesign(x: unknown): x is NailDesign {
  if (!x || typeof x !== 'object') return false
  const d = x as Record<string, unknown>
  const hex = (v: unknown) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
  return NAIL_SHAPES.includes(d.shape as never) && NAIL_LENGTHS.includes(d.length as never) && hex(d.color)
    && (d.color2 == null || hex(d.color2)) && NAIL_FINISHES.includes(d.finish as never) && NAIL_ARTS.includes(d.art as never)
    && (d.colorName == null || (typeof d.colorName === 'string' && d.colorName.length <= 60))
}
