/**
 * Species table for the authored fish.
 *
 * Body positions `s` run from the nose (0) to the tail base (1); flank heights `hf` from the belly
 * keel (-1) to the dorsal ridge (1). The silhouette `keys` are shape only, normalised to 1 at the
 * thickest point: heights scale by the catalog half-depth D (girth x bodyDepth) and widths by the
 * half-girth G. Every other length is a fraction of the catalog `length` L, so fins, eyes and bills
 * keep real proportions whatever the body's bulk.
 *
 * Tokens index the catalog palette: 0 dorsal, 1 belly, 2 accent.
 */

export const DORSAL = 0;
export const BELLY = 1;
export const ACCENT = 2;

/** Silhouette key: [s, top half-height, bottom half-height, half-width]. */
export type BodyKey = readonly [number, number, number, number];

export type CaudalForm = "forked" | "lunate" | "rounded" | "fan" | "heterocercal";

/**
 * Median fin outlines, as a height profile along the fin base: `tri` a raked triangle, `sickle` a
 * falcate blade, `sail` the sailfish's sail, `round` a rounded lobe, `rising` a long fin deepening
 * toward the tail (arowana), `lobe` a tall front lobe running on low (marlin, amberjack), `long` a
 * long even spiny fin (bream).
 */
export type FinShape = "tri" | "sickle" | "sail" | "round" | "rising" | "lobe" | "long";

export interface MedianFin {
  from: number;
  to: number;
  /** Height, fraction of L. */
  height: number;
  shape: FinShape;
  /** How far the rays rake back, per unit of height. */
  sweep?: number;
  token?: number;
  /** Ray count; 0 for a fleshy fin without rays (the adipose). */
  rays?: number;
}

export interface PairedFin {
  at: number;
  /** Base length along the body and fin length, fractions of L. */
  base: number;
  length: number;
  /** Flank height of the base. */
  hf: number;
  /** Ray direction outward and downward (the backward component is 1). */
  out: number;
  down: number;
  shape: "sickle" | "round";
}

export interface SpotField {
  count: number;
  s: readonly [number, number];
  hf: readonly [number, number];
  /** Radius, fraction of L; `stretch` elongates it along the body. */
  size: number;
  stretch?: number;
  token: number;
  shade?: number;
  /** Evenly spaced along `s` at `hf[0]`, instead of scattered. */
  row?: boolean;
}

/** One side's barbels; the builder mirrors them. */
export interface Barbel {
  s: number;
  hf: number;
  /** Direction [out, up, forward]. */
  dir: readonly [number, number, number];
  length: number;
}

export interface FishSpecies {
  keys: readonly BodyKey[];
  /** Section superellipse exponent: 2 is elliptical, higher is boxier. */
  n: number;
  /** Mouth gape: the flank row it runs along and how far back it reaches. */
  mouth?: { hf: number; to: number };
  /** Trailing edge of the gill cover at mid flank. */
  gill: number;
  eye: { at: number; hf: number; size: number; iris: number };
  /** Flank height below which the belly colour takes over. */
  beltLine: number;
  /** Flank height above which the accent darkens the back (three-tone fish). */
  saddle?: number;
  /** Accent band along the flank: [hf from, hf to, s from, s to]. */
  stripe?: readonly [number, number, number, number];
  /** A band across the top of the head in the dorsal colour, over a darker saddle: [s from, s to]. */
  crownBand?: readonly [number, number];
  /** Dark hairline along the flank at this height. */
  lateralLine?: number;
  bars?: { count: number; s: readonly [number, number]; down: number };
  scales?: boolean;
  tail: CaudalForm;
  tailLength: number;
  /** Half the tail's span, fraction of L. */
  tailSpread: number;
  dorsal: readonly MedianFin[];
  anal: readonly MedianFin[];
  finlets?: readonly [number, number, number];
  finToken: number;
  /** Token of the leading ray of the pelvic and anal fins (the trout's white edge). */
  finEdge?: number;
  pectoral: PairedFin;
  pelvic?: PairedFin;
  /** Bill: length, half-width, half-height, fractions of L. */
  bill?: { length: number; width: number; height: number };
  /** Lateral keels on the peduncle (tunas, billfish). */
  keel?: boolean;
  barbels?: readonly Barbel[];
  /** Bony scutes in rows: [hf, s from, s to, count]. */
  scutes?: ReadonlyArray<readonly [number, number, number, number]>;
  spots?: readonly SpotField[];
}

const roundFin = (at: number, base: number, length: number, hf: number, out = 0.8, down = 0.5): PairedFin =>
  ({ at, base, length, hf, out, down, shape: "round" });
const sickleFin = (at: number, base: number, length: number, hf: number, out = 0.4, down = 0.3): PairedFin =>
  ({ at, base, length, hf, out, down, shape: "sickle" });

export const FISH_SPECIES: Readonly<Record<string, FishSpecies>> = {
  trout: {
    keys: [[0, 0.1, 0.1, 0.1], [0.03, 0.36, 0.3, 0.36], [0.08, 0.6, 0.55, 0.62], [0.16, 0.83, 0.78, 0.85], [0.28, 0.97, 0.95, 0.98],
      [0.4, 1, 1, 1], [0.55, 0.92, 0.9, 0.88], [0.7, 0.7, 0.66, 0.62], [0.84, 0.46, 0.42, 0.4], [0.93, 0.36, 0.34, 0.3], [1, 0.42, 0.4, 0.24]],
    n: 2.2, mouth: { hf: -0.12, to: 0.085 }, gill: 0.19, eye: { at: 0.08, hf: 0.36, size: 0.028, iris: BELLY },
    beltLine: -0.3, stripe: [-0.12, 0.12, 0.1, 0.95],
    tail: "forked", tailLength: 0.2, tailSpread: 0.13,
    dorsal: [{ from: 0.38, to: 0.5, height: 0.1, shape: "tri", sweep: 0.5 }, { from: 0.76, to: 0.81, height: 0.035, shape: "round", rays: 0 }],
    anal: [{ from: 0.68, to: 0.78, height: 0.08, shape: "tri", sweep: 0.5 }],
    finToken: DORSAL, finEdge: BELLY,
    pectoral: roundFin(0.17, 0.035, 0.13, -0.55),
    pelvic: roundFin(0.5, 0.03, 0.09, -0.85, 0.45, 1),
    spots: [{ count: 22, s: [0.12, 0.96], hf: [0.18, 0.88], size: 0.009, token: DORSAL, shade: 0.72 }]
  },
  catfish: {
    keys: [[0, 0.3, 0.22, 0.45], [0.03, 0.5, 0.45, 0.8], [0.08, 0.68, 0.7, 1], [0.16, 0.82, 0.88, 1.05], [0.28, 0.95, 1, 1],
      [0.4, 1, 0.98, 0.9], [0.55, 0.9, 0.85, 0.72], [0.7, 0.72, 0.62, 0.52], [0.84, 0.5, 0.42, 0.36], [0.93, 0.38, 0.34, 0.26], [1, 0.42, 0.4, 0.2]],
    n: 2.3, mouth: { hf: -0.05, to: 0.06 }, gill: 0.2, eye: { at: 0.1, hf: 0.4, size: 0.014, iris: BELLY },
    beltLine: -0.35, lateralLine: 0.05,
    tail: "forked", tailLength: 0.19, tailSpread: 0.12,
    dorsal: [{ from: 0.3, to: 0.37, height: 0.09, shape: "tri", sweep: 0.45 }, { from: 0.76, to: 0.83, height: 0.03, shape: "round", rays: 0 }],
    anal: [{ from: 0.6, to: 0.88, height: 0.06, shape: "round", sweep: 0.3 }],
    finToken: DORSAL,
    pectoral: sickleFin(0.19, 0.035, 0.13, -0.55, 1, 0.3),
    pelvic: roundFin(0.5, 0.03, 0.08, -0.85, 0.45, 1),
    barbels: [
      { s: 0.02, hf: 0.1, dir: [0.9, 0.05, -0.45], length: 0.22 },
      { s: 0.04, hf: -0.7, dir: [0.35, -0.9, 0.2], length: 0.09 },
      { s: 0.06, hf: -0.85, dir: [0.2, -0.95, 0.1], length: 0.07 }
    ],
    spots: [{ count: 14, s: [0.16, 0.9], hf: [0.1, 0.8], size: 0.007, token: ACCENT }]
  },
  pike: {
    keys: [[0, 0.08, 0.08, 0.16], [0.04, 0.22, 0.2, 0.38], [0.1, 0.45, 0.42, 0.6], [0.18, 0.7, 0.68, 0.8], [0.3, 0.9, 0.88, 0.95],
      [0.45, 1, 1, 1], [0.6, 0.98, 0.98, 0.95], [0.72, 0.92, 0.9, 0.82], [0.84, 0.7, 0.66, 0.58], [0.93, 0.5, 0.46, 0.38], [1, 0.55, 0.5, 0.26]],
    n: 2.3, mouth: { hf: -0.05, to: 0.14 }, gill: 0.24, eye: { at: 0.1, hf: 0.44, size: 0.02, iris: ACCENT },
    beltLine: -0.3, lateralLine: 0.08,
    tail: "forked", tailLength: 0.17, tailSpread: 0.1,
    dorsal: [{ from: 0.72, to: 0.84, height: 0.085, shape: "round", sweep: 0.3 }],
    anal: [{ from: 0.74, to: 0.86, height: 0.075, shape: "round", sweep: 0.3 }],
    finToken: ACCENT,
    pectoral: roundFin(0.22, 0.03, 0.09, -0.6),
    pelvic: roundFin(0.52, 0.03, 0.07, -0.85, 0.45, 1),
    spots: [{ count: 30, s: [0.2, 0.97], hf: [-0.2, 0.75], size: 0.008, stretch: 2, token: ACCENT }]
  },
  arowana: {
    keys: [[0, 0.35, 0.05, 0.25], [0.04, 0.5, 0.35, 0.45], [0.1, 0.62, 0.7, 0.7], [0.2, 0.72, 0.9, 0.9], [0.35, 0.8, 1, 1],
      [0.5, 0.85, 0.98, 0.95], [0.65, 0.85, 0.88, 0.82], [0.78, 0.75, 0.72, 0.65], [0.9, 0.55, 0.5, 0.42], [1, 0.5, 0.48, 0.28]],
    n: 2.1, mouth: { hf: 0.3, to: 0.06 }, gill: 0.17, eye: { at: 0.07, hf: 0.45, size: 0.03, iris: BELLY },
    beltLine: -0.62, scales: true,
    tail: "fan", tailLength: 0.2, tailSpread: 0.12,
    dorsal: [{ from: 0.62, to: 0.88, height: 0.09, shape: "rising", sweep: 0.2 }],
    anal: [{ from: 0.55, to: 0.88, height: 0.11, shape: "rising", sweep: 0.2 }],
    finToken: ACCENT,
    pectoral: sickleFin(0.15, 0.035, 0.2, -0.7, 0.7, 0.8),
    pelvic: roundFin(0.45, 0.03, 0.1, -0.95, 0.45, 1),
    barbels: [{ s: 0.01, hf: -0.2, dir: [0.12, 0.35, 1], length: 0.07 }]
  },
  tuna: {
    keys: [[0, 0.1, 0.12, 0.12], [0.04, 0.38, 0.38, 0.4], [0.1, 0.65, 0.65, 0.68], [0.2, 0.88, 0.88, 0.9], [0.32, 0.99, 0.99, 1],
      [0.42, 1, 1, 0.98], [0.55, 0.88, 0.88, 0.82], [0.68, 0.6, 0.6, 0.55], [0.8, 0.3, 0.3, 0.3], [0.9, 0.13, 0.13, 0.18], [1, 0.18, 0.18, 0.16]],
    n: 2.1, mouth: { hf: -0.1, to: 0.07 }, gill: 0.2, eye: { at: 0.09, hf: 0.3, size: 0.022, iris: BELLY },
    beltLine: -0.3,
    tail: "lunate", tailLength: 0.24, tailSpread: 0.2,
    dorsal: [
      { from: 0.3, to: 0.44, height: 0.07, shape: "tri", sweep: 0.6 },
      { from: 0.5, to: 0.58, height: 0.15, shape: "sickle", sweep: 1.1, token: ACCENT }
    ],
    anal: [{ from: 0.52, to: 0.6, height: 0.15, shape: "sickle", sweep: 1.1, token: ACCENT }],
    finlets: [0.64, 0.9, 7],
    finToken: DORSAL, keel: true,
    pectoral: sickleFin(0.23, 0.03, 0.3, -0.1, 0.35, 0.15),
    pelvic: roundFin(0.3, 0.03, 0.08, -0.85, 0.45, 1)
  },
  sturgeon: {
    keys: [[0, 0.05, 0.05, 0.12], [0.06, 0.18, 0.16, 0.32], [0.14, 0.4, 0.38, 0.55], [0.24, 0.7, 0.66, 0.8], [0.36, 0.92, 0.9, 0.95],
      [0.48, 1, 1, 1], [0.62, 0.9, 0.92, 0.88], [0.76, 0.66, 0.7, 0.62], [0.88, 0.42, 0.45, 0.38], [1, 0.32, 0.28, 0.2]],
    n: 2.6, gill: 0.26, eye: { at: 0.13, hf: 0.38, size: 0.01, iris: BELLY },
    beltLine: -0.55,
    tail: "heterocercal", tailLength: 0.28, tailSpread: 0.12,
    dorsal: [{ from: 0.72, to: 0.82, height: 0.06, shape: "tri", sweep: 0.5 }],
    anal: [{ from: 0.74, to: 0.84, height: 0.05, shape: "tri", sweep: 0.5 }],
    finToken: DORSAL,
    pectoral: roundFin(0.26, 0.04, 0.12, -0.8, 1, 0.3),
    pelvic: roundFin(0.6, 0.04, 0.07, -0.9, 0.45, 1),
    barbels: [
      { s: 0.1, hf: -0.85, dir: [0.2, -1, 0.1], length: 0.05 },
      { s: 0.12, hf: -0.9, dir: [0.1, -1, 0.05], length: 0.05 }
    ],
    scutes: [[0.98, 0.2, 0.7, 11], [0.15, 0.3, 0.94, 15], [-0.62, 0.3, 0.6, 9]]
  },
  sailfish: {
    keys: [[0, 0.18, 0.18, 0.18], [0.04, 0.42, 0.42, 0.42], [0.1, 0.68, 0.68, 0.68], [0.2, 0.9, 0.9, 0.9], [0.32, 1, 1, 1],
      [0.46, 0.96, 0.95, 0.92], [0.6, 0.8, 0.78, 0.72], [0.74, 0.55, 0.52, 0.5], [0.86, 0.3, 0.3, 0.3], [0.94, 0.16, 0.16, 0.2], [1, 0.2, 0.2, 0.16]],
    n: 2.2, mouth: { hf: -0.1, to: 0.06 }, gill: 0.19, eye: { at: 0.07, hf: 0.3, size: 0.018, iris: BELLY },
    beltLine: -0.3, bars: { count: 8, s: [0.24, 0.84], down: -0.1 },
    tail: "lunate", tailLength: 0.22, tailSpread: 0.2,
    dorsal: [{ from: 0.12, to: 0.68, height: 0.34, shape: "sail", sweep: 0.15 }, { from: 0.8, to: 0.83, height: 0.03, shape: "tri" }],
    anal: [{ from: 0.56, to: 0.64, height: 0.09, shape: "sickle", sweep: 0.8 }, { from: 0.82, to: 0.85, height: 0.025, shape: "tri" }],
    finToken: DORSAL, keel: true,
    pectoral: sickleFin(0.23, 0.025, 0.2, -0.3),
    pelvic: sickleFin(0.3, 0.015, 0.2, -0.95, 0.12, 0.3),
    bill: { length: 0.3, width: 0.012, height: 0.012 }
  },
  swordfish: {
    keys: [[0, 0.2, 0.2, 0.22], [0.04, 0.45, 0.45, 0.48], [0.1, 0.72, 0.72, 0.72], [0.2, 0.92, 0.92, 0.92], [0.32, 1, 1, 1],
      [0.45, 0.95, 0.95, 0.92], [0.6, 0.78, 0.78, 0.74], [0.74, 0.52, 0.52, 0.5], [0.86, 0.28, 0.28, 0.3], [0.94, 0.14, 0.14, 0.22], [1, 0.18, 0.18, 0.18]],
    n: 2.2, mouth: { hf: -0.1, to: 0.06 }, gill: 0.2, eye: { at: 0.07, hf: 0.3, size: 0.026, iris: BELLY },
    beltLine: -0.3, saddle: 0.3,
    tail: "lunate", tailLength: 0.24, tailSpread: 0.22,
    dorsal: [{ from: 0.2, to: 0.3, height: 0.17, shape: "sickle", sweep: 0.5, token: ACCENT }, { from: 0.86, to: 0.88, height: 0.02, shape: "tri" }],
    anal: [{ from: 0.72, to: 0.78, height: 0.06, shape: "sickle", sweep: 0.6 }],
    finToken: ACCENT, keel: true,
    pectoral: sickleFin(0.25, 0.03, 0.2, -0.4, 0.45, 0.4),
    bill: { length: 0.45, width: 0.045, height: 0.01 }
  },
  blue_marlin: {
    keys: [[0, 0.18, 0.18, 0.18], [0.04, 0.45, 0.42, 0.44], [0.1, 0.75, 0.7, 0.72], [0.2, 0.96, 0.92, 0.94], [0.3, 1, 1, 1],
      [0.44, 0.95, 0.96, 0.94], [0.58, 0.78, 0.8, 0.74], [0.72, 0.52, 0.55, 0.5], [0.85, 0.28, 0.3, 0.3], [0.94, 0.14, 0.14, 0.2], [1, 0.18, 0.18, 0.16]],
    n: 2.2, mouth: { hf: -0.1, to: 0.06 }, gill: 0.19, eye: { at: 0.07, hf: 0.3, size: 0.018, iris: BELLY },
    beltLine: -0.3, bars: { count: 9, s: [0.22, 0.86], down: -0.1 },
    tail: "lunate", tailLength: 0.24, tailSpread: 0.22,
    dorsal: [{ from: 0.16, to: 0.66, height: 0.16, shape: "lobe", sweep: 0.55 }],
    anal: [{ from: 0.56, to: 0.66, height: 0.09, shape: "sickle", sweep: 0.8 }],
    finToken: DORSAL, keel: true,
    pectoral: sickleFin(0.23, 0.025, 0.22, -0.35),
    pelvic: sickleFin(0.3, 0.015, 0.18, -0.95, 0.12, 0.3),
    bill: { length: 0.28, width: 0.016, height: 0.016 }
  },
  sardine: {
    keys: [[0, 0.15, 0.15, 0.18], [0.04, 0.42, 0.4, 0.42], [0.1, 0.7, 0.7, 0.68], [0.2, 0.9, 0.9, 0.88], [0.35, 1, 1, 1],
      [0.5, 0.95, 0.97, 0.92], [0.65, 0.78, 0.78, 0.72], [0.8, 0.52, 0.5, 0.48], [0.92, 0.34, 0.32, 0.3], [1, 0.4, 0.38, 0.22]],
    n: 2.1, mouth: { hf: -0.05, to: 0.06 }, gill: 0.2, eye: { at: 0.09, hf: 0.3, size: 0.03, iris: BELLY },
    beltLine: 0.2, stripe: [0.35, 0.55, 0.1, 0.95],
    tail: "forked", tailLength: 0.22, tailSpread: 0.11,
    dorsal: [{ from: 0.4, to: 0.52, height: 0.08, shape: "tri", sweep: 0.5 }],
    anal: [{ from: 0.72, to: 0.8, height: 0.045, shape: "tri", sweep: 0.5 }],
    finToken: DORSAL,
    pectoral: roundFin(0.2, 0.03, 0.1, -0.5),
    pelvic: roundFin(0.5, 0.025, 0.06, -0.9, 0.45, 1),
    spots: [{ count: 6, s: [0.22, 0.55], hf: [0.3, 0.3], size: 0.012, token: DORSAL, shade: 0.72, row: true }]
  },
  sea_bream: {
    keys: [[0, 0.18, 0.1, 0.3], [0.03, 0.32, 0.3, 0.5], [0.08, 0.55, 0.55, 0.72], [0.15, 0.8, 0.78, 0.9], [0.25, 0.96, 0.92, 1],
      [0.38, 1, 1, 1], [0.5, 0.95, 0.95, 0.95], [0.62, 0.8, 0.78, 0.8], [0.74, 0.56, 0.52, 0.58], [0.86, 0.3, 0.28, 0.36], [0.94, 0.2, 0.2, 0.24], [1, 0.26, 0.26, 0.18]],
    n: 2, mouth: { hf: -0.2, to: 0.05 }, gill: 0.23, eye: { at: 0.11, hf: 0.38, size: 0.03, iris: DORSAL },
    beltLine: -0.32, saddle: 0.5, crownBand: [0.1, 0.14], lateralLine: 0.35,
    tail: "forked", tailLength: 0.2, tailSpread: 0.14,
    dorsal: [{ from: 0.25, to: 0.72, height: 0.09, shape: "long", sweep: 0.4 }],
    anal: [{ from: 0.6, to: 0.8, height: 0.07, shape: "round", sweep: 0.3 }],
    finToken: ACCENT,
    pectoral: sickleFin(0.22, 0.03, 0.2, -0.2, 0.5, 0.4),
    pelvic: roundFin(0.32, 0.03, 0.09, -0.9, 0.45, 1),
    spots: [{ count: 1, s: [0.2, 0.2], hf: [0.45, 0.45], size: 0.02, stretch: 0.8, token: ACCENT, shade: 0.72, row: true }]
  },
  amberjack: {
    keys: [[0, 0.12, 0.12, 0.14], [0.04, 0.38, 0.36, 0.4], [0.1, 0.64, 0.62, 0.66], [0.2, 0.86, 0.86, 0.88], [0.32, 0.98, 0.98, 1],
      [0.44, 1, 1, 0.98], [0.58, 0.88, 0.88, 0.84], [0.72, 0.62, 0.6, 0.58], [0.84, 0.36, 0.36, 0.36], [0.93, 0.2, 0.2, 0.24], [1, 0.24, 0.24, 0.18]],
    n: 2.1, mouth: { hf: -0.1, to: 0.07 }, gill: 0.21, eye: { at: 0.09, hf: 0.32, size: 0.02, iris: ACCENT },
    beltLine: -0.3, stripe: [-0.08, 0.08, 0.12, 0.92],
    tail: "lunate", tailLength: 0.22, tailSpread: 0.17,
    dorsal: [{ from: 0.3, to: 0.35, height: 0.035, shape: "tri", sweep: 0.4 }, { from: 0.37, to: 0.72, height: 0.075, shape: "lobe", sweep: 0.5 }],
    anal: [{ from: 0.56, to: 0.76, height: 0.065, shape: "lobe", sweep: 0.5 }],
    finToken: DORSAL,
    pectoral: roundFin(0.22, 0.03, 0.12, -0.4),
    pelvic: roundFin(0.3, 0.03, 0.1, -0.9, 0.45, 1)
  }
};
