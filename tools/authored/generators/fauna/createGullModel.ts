import * as THREE from "three";

import {
  SurfaceBuilder, buildBones, creatureScaffold, namedNode, posTrack, rotTrack, skinSurface,
  type AuthoredModel, type BoneSpec, type FaceContext, type GeneratorContext, type Station, type V3
} from "../../kit";

// Cream body and head, pale underwing and tail, grey mantle, black wingtips and eyes, ochre bill.
const TOKENS = ["canvas_cream_01", "foam_warm_01", "stone_cool_01", "animal_hide_black_01", "accent_ochre_01"] as const;
const CREAM = 0;
const PALE = 1;
const GREY = 2;
const BLACK = 3;
const BILL = 4;

/** Wing sections outward from the shoulder, in scale units: [span x, chord centre z, chord half, half-thickness, y]. */
const WING: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0.06, 0.02, 0.085, 0.014, 0.060],
  [0.16, 0.012, 0.100, 0.012, 0.063],
  [0.28, 0.022, 0.085, 0.010, 0.066],
  [0.38, 0.000, 0.060, 0.008, 0.063],
  [0.46, -0.035, 0.036, 0.006, 0.059],
  [0.50, -0.058, 0.014, 0.004, 0.057]
];
const WRIST = 0.28;

/**
 * Herring-type gull in flight, glTF space: +Y up, bill toward +Z, metres; the ambient-flyer runtime
 * heads it along +Z and scales it up. Redesigned from the Blender gull, whose thin wing blades had
 * ochre tips and read as a dark stick from below: the wings are now long and narrow and fold at the
 * wrist like the village dove's, grey above and pale below with black tips and a white trailing
 * edge, over a cream body with a grey mantle, a white tail and a heavy ochre bill.
 *
 * `glide` keys only the motion root and `flap` only the wing bones, because `loadAmbientFlyers`
 * plays both at once and blends their weights.
 */
export function createGullModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const s = Number(context.parameters.scale ?? 0.7);
  const span = Number(context.parameters.wingSpan ?? 1);
  const at = (x: number, y: number, z: number): V3 => [x * s, y * s, z * s];

  const { root, motion, rig } = creatureScaffold(ID);
  const specs: BoneSpec[] = [
    { name: "spine", head: at(0, 0.05, 0) },
    { name: "head", head: at(0, 0.075, 0.19), parent: "spine" },
    { name: "tail_fan", head: at(0, 0.045, -0.20), parent: "spine" },
    { name: "wing_left", head: at(-0.06, 0.06, 0.02), parent: "spine" },
    { name: "hand_left", head: at(-WRIST * span, 0.066, 0.022), parent: "wing_left" },
    { name: "wing_right", head: at(0.06, 0.06, 0.02), parent: "spine" },
    { name: "hand_right", head: at(WRIST * span, 0.066, 0.022), parent: "wing_right" }
  ];
  const bones = buildBones(specs, rig);
  const surface = new SurfaceBuilder(TOKENS);

  const body: Station[] = [
    { p: at(0, 0.040, -0.30), w: 0.020 * s, h: 0.015 * s, bones: { spine: 0.5, tail_fan: 0.5 } },
    { p: at(0, 0.045, -0.20), w: 0.055 * s, h: 0.045 * s, hb: 0.040 * s, bones: { spine: 1 } },
    { p: at(0, 0.045, -0.08), w: 0.082 * s, h: 0.065 * s, hb: 0.070 * s, bones: { spine: 1 } },
    { p: at(0, 0.050, 0.04), w: 0.085 * s, h: 0.070 * s, hb: 0.075 * s, bones: { spine: 1 } },
    { p: at(0, 0.060, 0.12), w: 0.065 * s, h: 0.058 * s, hb: 0.055 * s, bones: { spine: 0.7, head: 0.3 } },
    { p: at(0, 0.075, 0.19), w: 0.045 * s, h: 0.042 * s, hb: 0.040 * s, bones: { head: 1 } },
    { p: at(0, 0.085, 0.24), w: 0.048 * s, h: 0.045 * s, hb: 0.040 * s, bones: { head: 1 } },
    { p: at(0, 0.085, 0.29), w: 0.038 * s, h: 0.034 * s, hb: 0.032 * s, bones: { head: 1 } },
    { p: at(0, 0.080, 0.315), w: 0.020 * s, h: 0.018 * s, hb: 0.016 * s, bones: { head: 1 } }
  ];
  // The grey mantle covers the back between the wings; head, breast and belly stay cream.
  const bodyToken = ({ centroid: c, normal: n }: FaceContext): number =>
    n.y > 0.45 && c.z > -0.18 * s && c.z < 0.10 * s ? GREY : CREAM;
  surface.addLoft(body, { sides: 10, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.4, token: bodyToken });
  // Heavy bill with a slight droop at the tip.
  surface.addLoft([
    { p: at(0, 0.080, 0.31), w: 0.012 * s, h: 0.012 * s, bones: { head: 1 } },
    { p: at(0, 0.077, 0.345), w: 0.009 * s, h: 0.010 * s, bones: { head: 1 } },
    { p: at(0, 0.070, 0.372), w: 0.004 * s, h: 0.004 * s, bones: { head: 1 } }
  ], { sides: 5, ref: [0, 1, 0], capEnd: 0.5, token: BILL });
  // Square white tail.
  surface.addLoft([
    { p: at(0, 0.042, -0.24), w: 0.040 * s, h: 0.008 * s, bones: { tail_fan: 1 } },
    { p: at(0, 0.040, -0.33), w: 0.062 * s, h: 0.007 * s, bones: { tail_fan: 1 } },
    { p: at(0, 0.038, -0.40), w: 0.070 * s, h: 0.005 * s, n: 3, bones: { tail_fan: 1 } }
  ], { sides: 6, ref: [0, 1, 0], capEnd: 0.1, token: PALE });

  for (const [side, sx] of [["left", -1], ["right", 1]] as const) {
    surface.addEllipsoid(at(sx * 0.036, 0.098, 0.265), [0.008 * s, 0.008 * s, 0.007 * s], { bones: { head: 1 }, token: BLACK, sides: 5 });
    const wing = `wing_${side}`;
    const hand = `hand_${side}`;
    const stations: Station[] = WING.map(([x, z, w, h, y], index) => ({
      p: at(sx * x * span, y, z),
      w: w * s,
      h: h * s,
      bones: index === 0 ? { spine: 0.4, [wing]: 0.6 }
        : x < WRIST - 0.01 ? { [wing]: 1 }
          : x < WRIST + 0.01 ? { [wing]: 0.5, [hand]: 0.5 }
            : { [hand]: 1 }
    }));
    // Chord position of a face: 0 at the trailing edge, 1 at the leading edge.
    const chord = (c: THREE.Vector3): { x: number; f: number } => {
      const x = Math.abs(c.x) / (s * span);
      let i = 0;
      while (i < WING.length - 2 && WING[i + 1][0] < x) i += 1;
      const [x0, z0, w0] = WING[i];
      const [x1, z1, w1] = WING[i + 1];
      const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
      const zc = (z0 + (z1 - z0) * t) * s;
      const w = (w0 + (w1 - w0) * t) * s;
      return { x, f: (c.z - (zc - w)) / (2 * w) };
    };
    const wingToken = ({ centroid, normal }: FaceContext): number => {
      const { x, f } = chord(centroid);
      if (x > 0.40) return BLACK; // black primaries
      if (normal.y < 0) return PALE; // pale underwing, the view from below
      return f < 0.14 ? PALE : GREY; // grey above with a white trailing edge
    };
    surface.addLoft(stations, { sides: 8, ref: [0, 1, 0], capEnd: 0.6, token: wingToken });
  }

  skinSurface(ID, surface, root, rig, bones);
  namedNode(`${ID}_wing_left_pivot`, at(-0.08, 0.05, 0), motion);
  namedNode(`${ID}_wing_right_pivot`, at(0.08, 0.05, 0), motion);
  return { root, clips: gullClips(ID, s) };
}

function gullClips(ID: string, s: number): THREE.AnimationClip[] {
  const M = `${ID}_motion_root`;
  const zero: V3 = [0, 0, 0];
  // Glide: motion root only, a slow rise and bank on the air.
  const glide = new THREE.AnimationClip("glide", 1.6, [
    posTrack(M, zero, [[0, 0, 0, 0], [0.8, 0, 0.012 * s, 0], [1.6, 0, 0, 0]]),
    rotTrack(M, [[0, 0, 0, 0], [0.4, 1, 0, 4], [0.8, 2, 0, 0], [1.2, 1, 0, -4], [1.6, 0, 0, 0]])
  ]);
  // Flap: wing bones only. Slower and deeper than the dove's beat, with less wrist fold.
  // Left wing tips rise with negative Z; the right wing mirrors every angle.
  const beat: Array<readonly [number, number, number, number]> = [
    [0, -34, -8, -8],
    [0.1, -4, 6, -2],
    [0.18, 30, 10, 0],
    [0.27, 6, -20, -16],
    [0.36, -34, -8, -8]
  ];
  const flap = new THREE.AnimationClip("flap", 0.36, [
    rotTrack("wing_left", beat.map(([t, roll]) => [t, 0, 0, roll] as const)),
    rotTrack("hand_left", beat.map(([t, , handRoll, sweep]) => [t, 0, sweep, handRoll] as const)),
    rotTrack("wing_right", beat.map(([t, roll]) => [t, 0, 0, -roll] as const)),
    rotTrack("hand_right", beat.map(([t, , handRoll, sweep]) => [t, 0, -sweep, -handRoll] as const))
  ]);
  return [glide, flap];
}
