import * as THREE from "three";

import {
  SurfaceBuilder, buildBones, creatureScaffold, namedNode, posTrack, rotTrack, skinSurface,
  type AuthoredModel, type GeneratorContext, type BoneSpec, type FaceContext, type Station, type V3
} from "../../kit";

// Catalog palette order: slate body and wing markings, pale wing and tail, ochre bill and eye.
const TOKENS = ["cloth_slate_01", "stone_coastal_light_01", "accent_ochre_01"] as const;
const SLATE = 0;
const PALE = 1;
const OCHRE = 2;

const SHOULDER_X = 0.034;
const WRIST_X = 0.140;

const BONES: BoneSpec[] = [
  { name: "spine", head: [0, 0.030, 0] },
  { name: "head", head: [0, 0.052, 0.118], parent: "spine" },
  { name: "tail_fan", head: [0, 0.030, -0.088], parent: "spine" },
  { name: "wing_left", head: [-SHOULDER_X, 0.046, 0.038], parent: "spine" },
  { name: "hand_left", head: [-WRIST_X, 0.050, 0.030], parent: "wing_left" },
  { name: "wing_right", head: [SHOULDER_X, 0.046, 0.038], parent: "spine" },
  { name: "hand_right", head: [WRIST_X, 0.050, 0.030], parent: "wing_right" }
];

/** Wing sections outward from the shoulder: [span x, chord centre z, chord half-width, half-thickness, y]. */
const WING: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0.030, 0.034, 0.052, 0.010, 0.046],
  [0.085, 0.028, 0.060, 0.009, 0.048],
  [WRIST_X, 0.024, 0.058, 0.008, 0.050],
  [0.180, 0.014, 0.047, 0.007, 0.052],
  [0.206, 0.002, 0.033, 0.006, 0.053],
  [0.222, -0.010, 0.017, 0.005, 0.053]
];

/**
 * Village dove in flight, glTF space: +Y up, bill toward +Z, metres; the ambient-flyer runtime heads
 * it along +Z. Seen from below, which is how it is usually seen, it has to read as a pigeon rather
 * than a small gull: a plump breast, a small head, broad pale wings that fold at the wrist, a
 * fingered dark wingtip, and a fanned square tail with a dark end band.
 *
 * `WorldScene.loadAmbientFlyers` plays `glide` and `flap` together and blends their weights, so the
 * two clips never share a transform: `glide` keys only the motion root, `flap` only the wing bones.
 */
export function createPigeonModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const { root, motion, rig } = creatureScaffold(ID);
  const bones = buildBones(BONES, rig);
  const surface = new SurfaceBuilder(TOKENS);

  const body: Station[] = [
    { p: [0, 0.030, -0.100], w: 0.018, h: 0.012, bones: { spine: 0.5, tail_fan: 0.5 } },
    { p: [0, 0.031, -0.070], w: 0.038, h: 0.028, hb: 0.028, bones: { spine: 1 } },
    { p: [0, 0.029, -0.020], w: 0.050, h: 0.038, hb: 0.044, bones: { spine: 1 } },
    { p: [0, 0.031, 0.035], w: 0.054, h: 0.042, hb: 0.052, bones: { spine: 1 } },
    { p: [0, 0.038, 0.080], w: 0.042, h: 0.036, hb: 0.040, bones: { spine: 0.8, head: 0.2 } },
    { p: [0, 0.050, 0.110], w: 0.029, h: 0.027, hb: 0.027, bones: { spine: 0.3, head: 0.7 } },
    { p: [0, 0.058, 0.134], w: 0.027, h: 0.027, hb: 0.024, bones: { head: 1 } },
    { p: [0, 0.060, 0.157], w: 0.022, h: 0.021, hb: 0.019, bones: { head: 1 } },
    { p: [0, 0.056, 0.174], w: 0.012, h: 0.011, hb: 0.010, bones: { head: 1 } }
  ];
  surface.addLoft(body, { sides: 10, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.5, token: SLATE });
  surface.addLoft([
    { p: [0, 0.056, 0.170], w: 0.007, h: 0.005, bones: { head: 1 } },
    { p: [0, 0.052, 0.186], w: 0.005, h: 0.004, bones: { head: 1 } },
    { p: [0, 0.048, 0.198], w: 0.002, h: 0.002, bones: { head: 1 } }
  ], { sides: 5, ref: [0, 1, 0], capEnd: 0.5, token: OCHRE });

  // Square tail fan, pale with a dark terminal band.
  surface.addLoft([
    { p: [0, 0.030, -0.086], w: 0.026, h: 0.006, bones: { tail_fan: 1 } },
    { p: [0, 0.029, -0.130], w: 0.040, h: 0.006, bones: { tail_fan: 1 } },
    { p: [0, 0.027, -0.168], w: 0.050, h: 0.005, bones: { tail_fan: 1 } },
    { p: [0, 0.026, -0.194], w: 0.054, h: 0.004, n: 3, bones: { tail_fan: 1 } }
  ], { sides: 6, ref: [0, 1, 0], capEnd: 0.1, token: ({ u }) => (u > 2.1 ? SLATE : PALE) });

  for (const [side, sx] of [["left", -1], ["right", 1]] as const) {
    const wing = `wing_${side}`;
    const hand = `hand_${side}`;
    surface.addEllipsoid([sx * 0.018, 0.064, 0.140], [0.006, 0.006, 0.005], { bones: { head: 1 }, token: OCHRE, sides: 5 });

    const stations: Station[] = WING.map(([x, z, w, h, y], index) => ({
      p: [sx * x, y, z],
      w,
      h,
      bones: index === 0 ? { spine: 0.4, [wing]: 0.6 }
        : x < WRIST_X - 0.01 ? { [wing]: 1 }
          : x < WRIST_X + 0.01 ? { [wing]: 0.5, [hand]: 0.5 }
            : { [hand]: 1 }
    }));
    // Chord position of a face: 0 at the trailing edge, 1 at the leading edge.
    const chord = (c: THREE.Vector3): { x: number; f: number } => {
      const x = Math.abs(c.x);
      let i = 0;
      while (i < WING.length - 2 && WING[i + 1][0] < x) i += 1;
      const [x0, z0, w0] = WING[i];
      const [x1, z1, w1] = WING[i + 1];
      const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
      const zc = z0 + (z1 - z0) * t;
      const w = w0 + (w1 - w0) * t;
      return { x, f: (c.z - (zc - w)) / (2 * w) };
    };
    const wingToken = ({ centroid }: FaceContext): number => {
      const { x, f } = chord(centroid);
      if (x > 0.176) return SLATE; // dark primaries
      // The rock dove's two dark bars across the inner wing.
      if (x > 0.045 && x < 0.13 && ((f > 0.2 && f < 0.3) || (f > 0.4 && f < 0.5))) return SLATE;
      return PALE;
    };
    surface.addLoft(stations, { sides: 8, ref: [0, 1, 0], capEnd: 0.6, token: wingToken });

    // Primary "fingers" fanned off the trailing edge of the hand: the notched tip that makes a
    // pigeon's wing read as feathered in silhouette.
    for (let i = 0; i < 4; i += 1) {
      const rootX = 0.168 + i * 0.013;
      const rootZ = -0.012 - i * 0.006;
      const tipX = rootX + 0.040 - i * 0.006;
      const tipZ = rootZ - 0.028 - i * 0.010;
      surface.addLoft([
        { p: [sx * rootX, 0.052, rootZ], w: 0.010, h: 0.003, bones: { [hand]: 1 } },
        { p: [sx * (rootX + tipX) * 0.5, 0.053, (rootZ + tipZ) * 0.5], w: 0.009, h: 0.003, bones: { [hand]: 1 } },
        { p: [sx * tipX, 0.054, tipZ], w: 0.004, h: 0.002, bones: { [hand]: 1 } }
      ], { sides: 4, ref: [0, 1, 0], capEnd: 0.8, token: SLATE });
    }
  }

  skinSurface(ID, surface, root, rig, bones);
  namedNode(`${ID}_wing_left_pivot`, [-SHOULDER_X, 0.046, 0.038], motion);
  namedNode(`${ID}_wing_right_pivot`, [SHOULDER_X, 0.046, 0.038], motion);
  return { root, clips: pigeonClips(ID) };
}

function pigeonClips(ID: string): THREE.AnimationClip[] {
  const M = `${ID}_motion_root`;
  const zero: V3 = [0, 0, 0];

  // Glide: motion root only. A gentle rise and settle with a slight bank.
  const glide = new THREE.AnimationClip("glide", 1.2, [
    posTrack(M, zero, [[0, 0, 0, 0], [0.6, 0, 0.008, 0], [1.2, 0, 0, 0]]),
    rotTrack(M, [[0, 0, 0, 0], [0.3, 1.5, 0, 3], [0.6, 2.5, 0, 0], [0.9, 1.5, 0, -3], [1.2, 0, 0, 0]])
  ]);

  // Flap: wing bones only. A quick, shallow dove beat: the downstroke with the hand spread, then an
  // upstroke that folds the hand at the wrist and sweeps the tip back. Left wing tips go up with
  // negative Z rotation; the right wing mirrors every angle.
  const beat: Array<readonly [number, number, number, number]> = [
    // [time, wing roll, hand roll, hand sweep]
    [0, -42, -14, -18],
    [0.07, -6, 6, -4],
    [0.13, 30, 12, 0],
    [0.2, 4, -28, -26],
    [0.28, -42, -14, -18]
  ];
  const flap = new THREE.AnimationClip("flap", 0.28, [
    rotTrack("wing_left", beat.map(([t, roll]) => [t, 0, 0, roll] as const)),
    rotTrack("hand_left", beat.map(([t, , handRoll, sweep]) => [t, 0, sweep, handRoll] as const)),
    rotTrack("wing_right", beat.map(([t, roll]) => [t, 0, 0, -roll] as const)),
    rotTrack("hand_right", beat.map(([t, , handRoll, sweep]) => [t, 0, -sweep, -handRoll] as const))
  ]);
  return [glide, flap];
}
