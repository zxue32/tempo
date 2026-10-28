/** Portable, versioned design contract. Coordinates use the nail texture's UV space. */
export type NailShape = 'almond' | 'oval' | 'square' | 'squoval' | 'coffin' | 'stiletto';
/** Retained for designs saved before the layered material controls. */
export type NailFinish = 'gloss' | 'matte' | 'pearl' | 'chrome';
export type NailPattern = 'solid' | 'french' | 'ombre' | 'bloom';
export type NailBase = 'jelly' | 'milky' | 'solid';
export type NailOptical = 'none' | 'catEye' | 'mirror' | 'aurora';
export type NailParticles = 'none' | 'shimmer' | 'glitter' | 'foil' | 'shell';
export type NailDecoration = 'none' | 'star' | 'line' | 'rhinestone' | 'pearl';
export type NailTopCoat = 'gloss' | 'matte';

/** x=0 is the left edge. y=0 is the free edge/tip; y=1 is the cuticle. */
export interface StrokePoint { x: number; y: number }
export interface Stroke {
  color: string;
  /** Brush diameter as a fraction of texture width. */
  width: number;
  points: StrokePoint[];
}

export interface NailDesign {
  color: string;
  shape: NailShape;
  /** Visual extension: 0 short, 0.5 medium-long, 1 long requiring extensions. Not millimetres. */
  length: number;
  finish: NailFinish;
  pattern: NailPattern;
  strokes: Stroke[];
  /** Optional in legacy JSON. normalizeNail() supplies all layer defaults. */
  base?: NailBase;
  patternColor?: string;
  optical?: NailOptical;
  opticalColor?: string;
  particles?: NailParticles;
  particleColor?: string;
  decoration?: NailDecoration;
  decorationColor?: string;
  topCoat?: NailTopCoat;
  /** A subtle tint for the sealing layer; white is neutral. */
  topCoatColor?: string;
}

export type NormalizedNailDesign = Required<NailDesign>;

export interface StudioDesign {
  schemaVersion: 1;
  skinTone: string;
  /** Always ordered thumb, index, middle, ring, pinky. */
  nails: NailDesign[];
  name: string;
  updatedAt: string;
}
