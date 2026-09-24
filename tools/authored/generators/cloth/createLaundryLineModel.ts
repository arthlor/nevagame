import * as THREE from "three";

import { SurfaceBuilder, namedNode, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";

// Catalog palette order: timber posts, dark rope and pegs, then the three cloths.
const TOKENS = ["wood_warm_01", "wood_dark_01", "canvas_cream_01", "cloth_teal_01", "cloth_rust_01"] as const;
const TIMBER = 0;
const DARK = 1;
const CREAM = 2;
const TEAL = 3;
const RUST = 4;

const POST_X = 2.0;
const TIE_X = 2.06;
const TIE_Y = 1.905;
const SAG = 0.24;
const CLOTH_THICKNESS = 0.009;

const ropeY = (x: number): number => TIE_Y - SAG * (1 - (x / TIE_X) ** 2);

/** Rows allocated to bands, so a band edge is always a grid line: a clean stripe, never a stair. */
function banded(bands: ReadonlyArray<{ rows: number; to: number; token: number }>): {
  rows: number;
  depth: (v: number) => number;
  token: (v: number) => number;
} {
  const rows = bands.reduce((sum, band) => sum + band.rows, 0);
  const locate = (v: number): { index: number; t: number } => {
    let row = v * rows;
    for (let index = 0; index < bands.length; index += 1) {
      if (row <= bands[index].rows + 1e-9) return { index, t: row / bands[index].rows };
      row -= bands[index].rows;
    }
    return { index: bands.length - 1, t: 1 };
  };
  return {
    rows,
    depth: (v) => {
      const { index, t } = locate(v);
      const from = index === 0 ? 0 : bands[index - 1].to;
      return from + (bands[index].to - from) * t;
    },
    token: (v) => bands[locate(v).index].token
  };
}

/** Wind belly: grows toward the hem, strongest mid-width, with a soft ripple. */
const belly = (u: number, depth: number, amount: number): number =>
  amount * Math.sin(Math.PI * u) * depth ** 1.3 + 0.012 * Math.sin(depth * 9 + u * 4) * depth;

function peg(builder: SurfaceBuilder, x: number, z = 0): void {
  builder.addBox([x, 0.034, z], [x, -0.052, z], [0.008, 0.005], { token: DARK, ref: [0, 0, 1] });
}

/**
 * Washing line, glTF space: +Y up, cloths facing +Z, metres.
 *
 * Two braced T-posts carry a sagging rope; four different garments hang on it, each from its own
 * `_sway_<n>` pivot on the rope so `WorldScene` swings them from the live wind about the line. A
 * sheet folded over the rope, a shirt, a pair of breeches and a striped towel give the line four
 * different silhouettes where the old one had four identical tiles. Every cloth is a closed slab, so
 * it lights correctly from both sides (the old cloths were wound inside out and rendered dark).
 */
export function createLaundryLineModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const frame = new SurfaceBuilder(TOKENS);

  for (const sx of [-1, 1]) {
    // Posts lean out a little under the load of the line, braced on the outside.
    frame.addLoft([
      { p: [sx * POST_X, 0, 0], w: 0.056, h: 0.056 },
      { p: [sx * (POST_X + 0.035), 1.0, 0], w: 0.050, h: 0.050 },
      { p: [sx * (POST_X + 0.068), 1.96, 0], w: 0.044, h: 0.044 }
    ], { sides: 8, ref: [0, 0, 1], capEnd: 0, flat: true, token: TIMBER });
    frame.addBox([sx * (POST_X + 0.068), 1.95, -0.16], [sx * (POST_X + 0.068), 1.95, 0.16], [0.028, 0.026], {
      token: TIMBER, ref: [0, 1, 0]
    });
    frame.addBox([sx * (POST_X + 0.03), 0.92, 0], [sx * (POST_X + 0.34), 0.02, 0], [0.022, 0.022], {
      token: TIMBER, ref: [0, 0, 1]
    });
    // Rope lashing round the post top.
    frame.addLoft([
      { p: [sx * (POST_X + 0.066), TIE_Y - 0.022, 0], w: 0.056, h: 0.056 },
      { p: [sx * (POST_X + 0.067), TIE_Y + 0.018, 0], w: 0.056, h: 0.056 }
    ], { sides: 8, ref: [0, 0, 1], capStart: 0, capEnd: 0, token: DARK });
  }
  const rope: Array<{ p: V3; w: number; h: number }> = [];
  for (let i = 0; i <= 20; i += 1) {
    const x = -TIE_X + (2 * TIE_X * i) / 20;
    rope.push({ p: [x, ropeY(x), 0], w: 0.011, h: 0.011 });
  }
  frame.addLoft(rope, { sides: 6, ref: [0, 1, 0], token: DARK });
  root.add(frame.buildMesh(`${ID}_frame`));

  const garments: Array<{ x: number; build: (builder: SurfaceBuilder) => void }> = [
    { x: -1.10, build: foldedSheet },
    { x: -0.36, build: shirt },
    { x: 0.36, build: breeches },
    { x: 1.10, build: towel }
  ];
  garments.forEach(({ x, build }, index) => {
    const pivot = namedNode(`${ID}_sway_${index}`, [x, ropeY(x), 0], root);
    const builder = new SurfaceBuilder(TOKENS);
    build(builder);
    pivot.add(builder.buildMesh(`${ID}_cloth_${index}`));
  });
  return { root, clips: [] };
}

/** A sheet folded over the rope: a long front drop, the fold round the line, a shorter back drop. */
function foldedSheet(builder: SurfaceBuilder): void {
  const width = 0.92;
  const front = 0.72;
  const back = 0.5;
  const radius = 0.018;
  const frontRows = 5;
  const foldRows = 2;
  const backRows = 4;
  const rows = frontRows + foldRows + backRows;
  builder.addPanel({
    cols: 7,
    rows,
    thickness: CLOTH_THICKNESS,
    point: (u, v) => {
      const row = v * rows;
      const x = (u - 0.5) * width;
      if (row <= frontRows) {
        const depth = front * (1 - row / frontRows);
        return new THREE.Vector3(x, -depth, radius + belly(u, depth / front, 0.05));
      }
      if (row <= frontRows + foldRows) {
        const phi = ((row - frontRows) / foldRows) * Math.PI;
        return new THREE.Vector3(x, radius * Math.sin(phi), radius * Math.cos(phi));
      }
      const depth = back * ((row - frontRows - foldRows) / backRows);
      return new THREE.Vector3(x, -depth, -radius - belly(u, depth / back, 0.035));
    },
    token: () => CREAM
  });
  for (const x of [-0.4, 0.4]) peg(builder, x);
}

/** A shirt pegged at the shoulders: body, drooping sleeves with cream cuffs, a collar notch. */
function shirt(builder: SurfaceBuilder): void {
  const width = 0.74;
  const length = 0.64;
  const body = 0.21;
  builder.addPanel({
    cols: 10,
    rows: 8,
    thickness: CLOTH_THICKNESS,
    inside: (u, v) => {
      const x = Math.abs((u - 0.5) * width);
      const y = v * length;
      if (x < 0.055 && y < 0.06) return false; // collar
      return x < body || y < 0.24 - (x - body) * 0.45;
    },
    point: (u, v) => {
      const x = (u - 0.5) * width;
      // The shoulder line droops out toward the sleeves.
      const y = -0.008 - v * length - Math.max(0, Math.abs(x) - body) * 0.35;
      return new THREE.Vector3(x, y, belly(u, v, 0.04));
    },
    token: (u) => (Math.abs((u - 0.5) * width) > 0.31 ? CREAM : TEAL)
  });
  for (const x of [-0.17, 0.17]) peg(builder, x);
}

/** Breeches pegged at the waistband: two legs parted below the seat, a cream waistband. */
function breeches(builder: SurfaceBuilder): void {
  const layout = banded([
    { rows: 1, to: 0.055, token: CREAM },
    { rows: 9, to: 0.76, token: RUST }
  ]);
  builder.addPanel({
    cols: 10,
    rows: layout.rows,
    thickness: CLOTH_THICKNESS,
    inside: (u, v) => !(layout.depth(v) > 0.3 && Math.abs(u - 0.5) < 0.1),
    point: (u, v) => {
      const depth = layout.depth(v);
      const flare = 1 + 0.12 * (depth / 0.76);
      return new THREE.Vector3((u - 0.5) * 0.42 * flare, -0.008 - depth, belly(u, depth / 0.76, 0.03));
    },
    token: (_u, v) => layout.token(v)
  });
  for (const x of [-0.19, 0.19]) peg(builder, x);
}

/** A towel pegged along one edge, with two teal stripes woven across its foot. */
function towel(builder: SurfaceBuilder): void {
  const layout = banded([
    { rows: 3, to: 0.3, token: CREAM },
    { rows: 1, to: 0.355, token: TEAL },
    { rows: 1, to: 0.395, token: CREAM },
    { rows: 1, to: 0.45, token: TEAL },
    { rows: 1, to: 0.5, token: CREAM }
  ]);
  builder.addPanel({
    cols: 6,
    rows: layout.rows,
    thickness: CLOTH_THICKNESS,
    point: (u, v) => {
      const depth = layout.depth(v);
      return new THREE.Vector3((u - 0.5) * 0.56, -0.008 - depth, belly(u, depth / 0.5, 0.045));
    },
    token: (_u, v) => layout.token(v)
  });
  for (const x of [-0.26, 0, 0.26]) peg(builder, x);
}
