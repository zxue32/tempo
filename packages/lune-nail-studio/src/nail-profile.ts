import type { NailDesign } from './types';

/** Shared silhouette for the 3D mesh, drawing pad and exported design card. */
export function nailWidthAt(v: number, shape: NailDesign['shape']): number {
  // Semicircular cuticle at v=0, then parallel sidewalls before the free edge.
  const base = v < .17 ? Math.sqrt(Math.max(0, 1 - ((.17 - v) / .17) ** 2)) : 1;
  if (v < .42) return base;
  const t = (v - .42) / .58;
  if (shape === 'square') return t < .86 ? 1 : .88 + .12 * Math.sqrt(Math.max(0, 1 - ((t - .86) / .14) ** 2));
  if (shape === 'coffin') return 1 - .40 * t;
  if (shape === 'stiletto') return Math.max(.014, 1 - t ** 1.12);
  if (shape === 'oval') return Math.sqrt(Math.max(.00015, 1 - t * t));
  return Math.max(.012, Math.sqrt(1 - t) * (1 - .20 * t));
}

