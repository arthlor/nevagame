import * as THREE from "three";

import { SurfaceBuilder, namedNode, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";

// Catalog palette order: timber, rust cloth, ochre chevron/trim/cords, brass fittings.
const TOKENS = ["wood_warm_01", "cloth_rust_01", "accent_ochre_01", "metal_brass_01"] as const;
const TIMBER = 0;
const RUST = 1;
const OCHRE = 2;
const BRASS = 3;

const POLE_TOP = 3.05;
const ARM_Y = 2.97;
/** The hanging ring on the bracket arm: the cloth's sway pivot. */
const RING: [number, number, number] = [0.36, 2.935, 0];

const CLOTH_WIDTH = 0.54;
const CLOTH_TOP = -0.222;
const CLOTH_DROP = 1.42;
const NOTCH = 0.34;

/**
 * Market banner, glTF space: +Y up, cloth facing +Z, metres.
 *
 * A timber pole on a braced cross-foot carries a bracket arm; the banner's batten hangs from a single
 * ring on that arm by a V bridle, so when `WorldScene` swings the `_sway_0` pivot from the wind (about
 * X) and rolls it (about Z) the whole hanging assembly moves about a real suspension point instead of
 * a crossbar tilting on a fixed pole.
 *
 * The cloth is one closed panel whose grid rows follow the chevron and the swallow-tail hem, so the
 * ochre chevron and the gold hem trim are clean painted bands on both faces rather than stair-steps.
 */
export function createBannerClothModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const root = new THREE.Group();
  root.name = `${ID}_root`;

  const frame = new SurfaceBuilder(TOKENS);
  // Braced cross-foot.
  frame.addBox([-0.27, 0.045, 0], [0.27, 0.045, 0], [0.05, 0.045], { token: TIMBER });
  frame.addBox([0, 0.045, -0.27], [0, 0.045, 0.27], [0.05, 0.045], { token: TIMBER });
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    frame.addBox([dx * 0.22, 0.08, dz * 0.22], [dx * 0.035, 0.42, dz * 0.035], [0.02, 0.02], {
      token: TIMBER, ref: dx === 0 ? [1, 0, 0] : [0, 0, 1]
    });
  }
  // Tapered octagonal pole with brass ferrules at the foot and under the arm.
  const pole: Station[] = [
    { p: [0, 0.02, 0], w: 0.058, h: 0.058 },
    { p: [0, 1.4, 0], w: 0.050, h: 0.050 },
    { p: [0, POLE_TOP, 0], w: 0.038, h: 0.038 }
  ];
  frame.addLoft(pole, { sides: 8, ref: [0, 0, 1], capEnd: 0, flat: true, token: TIMBER });
  for (const [y, r] of [[0.12, 0.066], [2.86, 0.046]] as const) {
    frame.addLoft([{ p: [0, y - 0.035, 0], w: r, h: r }, { p: [0, y + 0.035, 0], w: r, h: r }], {
      sides: 8, ref: [0, 0, 1], capStart: 0, capEnd: 0, flat: true, token: BRASS
    });
  }
  // Bracket arm and its strut.
  frame.addBox([-0.03, ARM_Y, 0], [0.44, ARM_Y, 0], [0.026, 0.028], { token: TIMBER, ref: [0, 1, 0] });
  frame.addBox([0.02, 2.62, 0], [0.26, ARM_Y - 0.02, 0], [0.018, 0.018], { token: TIMBER, ref: [0, 0, 1] });
  // Brass hook ring under the arm, and a spearhead finial.
  frame.addLoft([
    { p: [RING[0], ARM_Y - 0.03, 0], w: 0.010, h: 0.010 },
    { p: [RING[0], RING[1] + 0.012, 0], w: 0.008, h: 0.008 }
  ], { sides: 6, ref: [0, 0, 1], capEnd: 0.5, token: BRASS });
  frame.addLoft([
    { p: [0, POLE_TOP - 0.01, 0], w: 0.040, h: 0.040 },
    { p: [0, POLE_TOP + 0.04, 0], w: 0.046, h: 0.046 },
    { p: [0, POLE_TOP + 0.09, 0], w: 0.020, h: 0.020 },
    { p: [0, POLE_TOP + 0.13, 0], w: 0.040, h: 0.014 },
    { p: [0, POLE_TOP + 0.19, 0], w: 0.026, h: 0.010 },
    { p: [0, POLE_TOP + 0.25, 0], w: 0.004, h: 0.003 }
  ], { sides: 8, ref: [0, 0, 1], capStart: 0, capEnd: 0.5, token: BRASS });
  root.add(frame.buildMesh(`${ID}_frame`));

  const pivot = namedNode(`${ID}_sway_0`, RING, root);
  const hanging = new SurfaceBuilder(TOKENS);
  // Batten with brass end knobs, and the V bridle up to the ring.
  const battenY = -0.20;
  hanging.addLoft([
    { p: [-0.305, battenY, 0], w: 0.017, h: 0.017 },
    { p: [0.305, battenY, 0], w: 0.017, h: 0.017 }
  ], { sides: 8, ref: [0, 1, 0], token: TIMBER });
  for (const sx of [-1, 1]) {
    hanging.addEllipsoid([sx * 0.318, battenY, 0], [0.026, 0.026, 0.026], { token: BRASS });
    hanging.addLoft([
      { p: [0, 0, 0], w: 0.005, h: 0.005 },
      { p: [sx * 0.27, battenY + 0.012, 0], w: 0.005, h: 0.005 }
    ], { sides: 4, ref: [0, 0, 1], token: OCHRE });
  }
  // Rust loops wrap the batten where the cloth is sewn on.
  for (const x of [-0.2, 0, 0.2]) {
    hanging.addLoft([
      { p: [x - 0.03, battenY, 0], w: 0.024, h: 0.024 },
      { p: [x + 0.03, battenY, 0], w: 0.024, h: 0.024 }
    ], { sides: 8, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: RUST });
  }

  // Cloth rows are allocated to the bands they carry: field above the chevron, the chevron, the
  // field below it, and the hem trim along the swallow tail. Every band edge is a V, so the rows bend.
  const hem = (u: number): number => CLOTH_DROP - NOTCH * (1 - Math.abs(2 * u - 1));
  const vee = (u: number): number => 1 - Math.abs(2 * u - 1);
  const bands: Array<{ rows: number; from: (u: number) => number; to: (u: number) => number; token: number }> = [
    { rows: 4, from: () => 0, to: (u) => 0.34 + 0.24 * vee(u), token: RUST },
    { rows: 2, from: (u) => 0.34 + 0.24 * vee(u), to: (u) => 0.47 + 0.24 * vee(u), token: OCHRE },
    { rows: 6, from: (u) => 0.47 + 0.24 * vee(u), to: (u) => hem(u) - 0.075, token: RUST },
    { rows: 1, from: (u) => hem(u) - 0.075, to: hem, token: OCHRE }
  ];
  const rows = bands.reduce((sum, band) => sum + band.rows, 0);
  const bandAt = (v: number): { band: (typeof bands)[number]; t: number } => {
    let row = v * rows;
    for (const band of bands) {
      if (row <= band.rows + 1e-9) return { band, t: row / band.rows };
      row -= band.rows;
    }
    return { band: bands[bands.length - 1], t: 1 };
  };
  hanging.addPanel({
    cols: 8,
    rows,
    thickness: 0.012,
    point: (u, v) => {
      const { band, t } = bandAt(v);
      const drop = band.from(u) + (band.to(u) - band.from(u)) * t;
      const d = drop / CLOTH_DROP;
      // A wind belly that grows toward the hem, and a slight flare where the tails hang free.
      const belly = 0.05 * Math.sin(Math.PI * u) * d ** 1.2 + 0.018 * Math.sin(d * Math.PI * 2.3 + u * 2.1) * d;
      return new THREE.Vector3((u - 0.5) * CLOTH_WIDTH * (1 + 0.06 * d), CLOTH_TOP - drop, belly);
    },
    token: (_u, v) => bandAt(v).band.token
  });
  pivot.add(hanging.buildMesh(`${ID}_banner`));

  return { root, clips: [] };
}
