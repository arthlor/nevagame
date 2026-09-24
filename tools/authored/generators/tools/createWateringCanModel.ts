import * as THREE from "three";

import { SurfaceBuilder, addGripMarker, mulberry32, type AuthoredModel, type GeneratorContext, type Station, type V3 } from "../../kit";
import { rope, v3 } from "../props/parts";

/** A can's shape: body profile (height, radius) about its axis, painted band, spout and rose. */
interface CanStyle {
  body: ReadonlyArray<readonly [number, number]>;
  band: readonly [number, number];
  spoutFrom: V3;
  spoutTo: V3;
  spoutRadius: readonly [number, number];
  rose: number;
  /** Hole rings on the rose face: [count, radius as a fraction of the rose]. */
  holes: ReadonlyArray<readonly [number, number]>;
  /** A domed accent lid instead of an open filler collar. */
  lid: boolean;
  /** Hammered metal: faint per-vertex value noise. */
  hammered: boolean;
  /** A dark wooden hand bar across the top of the carry arch. */
  handBar: boolean;
  /** Rolled beads (height, radius) at the foot and shoulder. */
  beads: ReadonlyArray<readonly [number, number]>;
  /** Carry arch: base height, half-span, rise. */
  arch: readonly [number, number, number];
  /** Where the grip straps meet the body (x from the grip). */
  strapTo: number;
}

const BODY_X = 0.17;

const STYLES: Record<string, CanStyle> = {
  classic: {
    body: [[-0.118, 0.09], [-0.112, 0.104], [-0.1, 0.106], [-0.03, 0.11], [0.03, 0.112], [0.07, 0.106], [0.092, 0.09], [0.104, 0.064]],
    band: [-0.03, 0.03], spoutFrom: [0, -0.07, 0.09], spoutTo: [0, 0.12, 0.34], spoutRadius: [0.026, 0.014],
    rose: 0.05, holes: [[1, 0], [6, 0.52]], lid: false, hammered: false, handBar: false,
    beads: [[-0.108, 0.108], [0.074, 0.104]], arch: [0.075, 0.075, 0.12], strapTo: 0.075
  },
  // A pot-bellied copper can with a domed teal lid and a broad pierced rose on a short spout.
  copper_rose: {
    body: [[-0.118, 0.078], [-0.112, 0.098], [-0.08, 0.122], [-0.02, 0.13], [0.04, 0.122], [0.08, 0.098], [0.1, 0.07], [0.106, 0.05]],
    band: [-0.1, -0.075], spoutFrom: [0, -0.06, 0.1], spoutTo: [0, 0.1, 0.28], spoutRadius: [0.028, 0.02],
    rose: 0.072, holes: [[1, 0], [6, 0.36], [12, 0.7]], lid: true, hammered: true, handBar: false,
    beads: [[-0.108, 0.1], [0.08, 0.1]], arch: [0.085, 0.09, 0.13], strapTo: 0.056
  },
  // A long-reach greenhouse can: a low wide drum, a slender spout reaching far forward, a small rose.
  long_spout: {
    body: [[-0.118, 0.1], [-0.112, 0.114], [-0.1, 0.116], [-0.02, 0.118], [0.03, 0.116], [0.052, 0.104], [0.066, 0.08], [0.074, 0.056]],
    band: [-0.06, -0.035], spoutFrom: [0, -0.08, 0.1], spoutTo: [0, 0.06, 0.56], spoutRadius: [0.022, 0.009],
    rose: 0.032, holes: [[1, 0], [5, 0.55]], lid: false, hammered: false, handBar: true,
    beads: [[-0.108, 0.117], [0.052, 0.108]], arch: [0.05, 0.075, 0.15], strapTo: 0.06
  }
};

/**
 * Watering can, glTF space, the grip at the origin: a side handle along +Y, the body out over +X,
 * the spout toward +Z (the runtime docks `tool_primary_grip`, whose frame is unchanged from the
 * Blender cans).
 *
 * Redesigned from the Blender cans: a drum body with rolled beads at the foot and shoulder and a
 * painted band, a filler collar (or a domed lid), an arched carry strap over the top, and a tapered
 * spout braced to the body, ending in a rose with its holes picked out. Styles: `classic` (the
 * starter can); `copper_rose`, a hammered, pot-bellied copper can with a broad rose; `long_spout`, a
 * low greenhouse can with a far-reaching spout and a wooden hand bar. Palette order: body metal,
 * dark grip and holes, accent paint.
 */
export function createWateringCanModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const styleName = String(context.parameters.style ?? "classic");
  const style = STYLES[styleName];
  if (!style) throw new Error(`${ID}: unknown watering can style ${styleName}`);
  const METAL = 0;
  const DARK = 1;
  const ACCENT = 2;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  addGripMarker("tool_primary_grip", [-0.016, 0, 0], [0, 0, 1], [1, 0, 0], root);
  const surface = new SurfaceBuilder(context.spec.palette);
  const at = (x: number, y: number, z: number): V3 => [BODY_X + x, y, z];
  const bottom = style.body[0][0];
  const top = style.body[style.body.length - 1];
  const shoulder = style.body[style.body.length - 2];
  const hammer = new Map<string, number>();
  const dent = (p: THREE.Vector3): number => {
    if (!style.hammered) return 1;
    const key = `${p.x.toFixed(3)}:${p.y.toFixed(3)}:${p.z.toFixed(3)}`;
    if (!hammer.has(key)) hammer.set(key, 0.94 + random() * 0.08);
    return hammer.get(key)!;
  };

  // Body drum, darker toward the foot, the band painted on.
  surface.addLoft(style.body.map(([y, r]): Station => ({ p: at(0, y, 0), w: r, h: r })), {
    sides: 16, ref: [0, 0, 1], capStart: 0,
    token: ({ centroid }) => (centroid.y > style.band[0] && centroid.y < style.band[1] ? ACCENT : METAL),
    tone: (p) => (0.86 + 0.16 * THREE.MathUtils.clamp((p.y - bottom) / (top[0] - bottom), 0, 1)) * dent(p)
  });
  // Rolled beads at the foot and shoulder.
  for (const [y, r] of style.beads) {
    surface.addLoft([
      { p: at(0, y - 0.007, 0), w: r - 0.002, h: r - 0.002 },
      { p: at(0, y, 0), w: r + 0.005, h: r + 0.005 },
      { p: at(0, y + 0.007, 0), w: r - 0.002, h: r - 0.002 }
    ], { sides: 16, ref: [0, 0, 1], capStart: 0, capEnd: 0, token: METAL, shade: 0.9 });
  }
  if (style.hammered) {
    // Riveted side seam, facing away from the hand.
    for (let k = 0; k < 5; k += 1) {
      const y = bottom + 0.03 + k * ((top[0] - bottom - 0.06) / 4);
      const r = radiusAt(style.body, y) + 0.002;
      surface.addDisc(at(r, y, 0), [1, 0, 0], 0.006, { token: DARK, sides: 5, dome: 0.003 });
    }
  }
  if (style.lid) {
    // Domed accent lid with a knob, over the shoulder.
    surface.addLoft([[0, top[1] + 0.006], [0.012, top[1] + 0.004], [0.03, top[1] * 0.8], [0.042, top[1] * 0.45], [0.047, 0.012]]
      .map(([dy, r]): Station => ({ p: at(0, top[0] + dy, 0), w: r, h: r })), { sides: 16, ref: [0, 0, 1], capStart: 0, capEnd: 0.4, token: ACCENT });
    surface.addEllipsoid(at(0, top[0] + 0.056, 0), [0.016, 0.012, 0.016], { token: DARK, sides: 8 });
  } else {
    surface.addPanel({
      cols: 16, rows: 1, thickness: 0.006,
      point: (u, v) => {
        const a = u * Math.PI * 2;
        const r = top[1] * 0.9 + 0.006 * v;
        return new THREE.Vector3(BODY_X + Math.cos(a) * r, top[0] - 0.004 + 0.03 * v, Math.sin(a) * r);
      },
      token: () => METAL, shade: () => 1.02
    });
    surface.addDisc(at(0, top[0] + 0.004, 0), [0, 1, 0], top[1] * 0.88, { token: DARK, shade: 0.72, sides: 12 });
  }

  // Side grip, and the straps that carry it.
  rope(surface, [[0, -0.075, 0], [0, 0.075, 0]], 0.017, DARK, { sides: 8 });
  for (const y of [-0.066, 0.066]) {
    rope(surface, [[0, y, 0], [style.strapTo * 0.53, y * 1.05, 0], [style.strapTo, y * 1.1, 0]], 0.009, METAL, { sides: 5, shade: 0.9 });
  }
  // Carry strap arching over the top, back to front of the filler.
  const [archBase, span, rise] = style.arch;
  const arch = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI;
    return new THREE.Vector3(BODY_X - Math.cos(a) * span, archBase + Math.sin(a) * rise, 0);
  });
  surface.addLoft(arch.map((p) => ({ p: v3(p), w: 0.006, h: 0.014 })), { sides: 6, ref: [0, 0, 1], capStart: 0.3, capEnd: 0.3, token: styleName === "copper_rose" ? DARK : METAL, shade: 0.94 });
  if (style.handBar) {
    // A turned wooden sleeve riding the crown of the arch.
    rope(surface, Array.from({ length: 5 }, (_, i) => {
      const a = Math.PI * (0.33 + 0.34 * (i / 4));
      return new THREE.Vector3(BODY_X - Math.cos(a) * span, archBase + Math.sin(a) * rise, 0);
    }), 0.016, DARK, { sides: 8 });
  }

  // Spout from the foot of the body, rising forward, braced to the body.
  const spoutFrom = new THREE.Vector3(...at(...style.spoutFrom));
  const spoutTo = new THREE.Vector3(...at(...style.spoutTo));
  const spout = Array.from({ length: 7 }, (_, i) => spoutFrom.clone().lerp(spoutTo, i / 6));
  surface.addLoft(spout.map((p, i) => {
    const r = THREE.MathUtils.lerp(style.spoutRadius[0], style.spoutRadius[1], i / 6);
    return { p: v3(p), w: r, h: r };
  }), {
    sides: 8, ref: [1, 0, 0], capStart: 0, token: METAL,
    tone: (p) => 0.9 + 0.1 * THREE.MathUtils.clamp((p.y - spoutFrom.y) / 0.2, 0, 1)
  });
  const braces = styleName === "long_spout" ? [0.32, 0.62] : [0.5];
  for (const t of braces) {
    const on = spoutFrom.clone().lerp(spoutTo, t);
    const y = Math.min(on.y - 0.01, shoulder[0] - 0.01);
    rope(surface, [on, new THREE.Vector3(BODY_X, y, radiusAt(style.body, y) - 0.004)], 0.006, METAL, { sides: 4, shade: 0.88 });
  }
  // Rose: a flared accent head, its face pierced.
  const dir = spoutTo.clone().sub(spoutFrom).normalize();
  const rose = (d: number): V3 => v3(spoutTo.clone().addScaledVector(dir, d));
  const R = style.rose;
  const neck = style.spoutRadius[1];
  surface.addLoft([
    { p: rose(-0.01), w: neck * 1.1, h: neck * 1.1 },
    { p: rose(0.02), w: neck * 1.6, h: neck * 1.6 },
    { p: rose(0.02 + R * 0.45), w: R, h: R },
    { p: rose(0.028 + R * 0.45), w: R, h: R }
  ], { sides: 12, ref: [1, 0, 0], capEnd: 0.12, token: ACCENT });
  const face = spoutTo.clone().addScaledVector(dir, 0.028 + R * 0.45 + R * 0.1);
  const across = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(dir, across);
  for (const [count, fraction] of style.holes) {
    for (let k = 0; k < count; k += 1) {
      const a = (k / count) * Math.PI * 2 + fraction;
      const p = face.clone().addScaledVector(across, Math.cos(a) * R * fraction).addScaledVector(up, Math.sin(a) * R * fraction);
      surface.addDisc(v3(p), v3(dir), Math.max(0.004, R * 0.1), { token: DARK, shade: 0.72, sides: 5 });
    }
  }

  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/** Body radius at a height, interpolated along the profile. */
function radiusAt(profile: ReadonlyArray<readonly [number, number]>, y: number): number {
  for (let i = 1; i < profile.length; i += 1) {
    const [y0, r0] = profile[i - 1];
    const [y1, r1] = profile[i];
    if (y <= y1) return THREE.MathUtils.lerp(r0, r1, THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1));
  }
  return profile[profile.length - 1][1];
}
