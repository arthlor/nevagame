import * as THREE from "three";

import {
  SurfaceBuilder, buildBones, creatureScaffold, cyclicTrack, namedNode, posTrack, rotTrack, skinSurface,
  type AuthoredModel, type GeneratorContext, type BoneSpec, type FaceContext, type Station, type V3
} from "../../kit";

// Catalog palette order: grey coat, tabby band, white bib and socks, eye/nose.
const TOKENS = ["stone_cool_01", "wood_coastal_dark_01", "animal_hide_white_01", "metal_dark_01"] as const;
const COAT = 0;
const BAND = 1;
const BIB = 2;
const EYE = 3;

const LOIN: V3 = [0, 0.198, -0.08];

// One root joint over both spine chains: glTF names a single skeleton root for the skin.
const BONES: BoneSpec[] = [
  { name: "hips", head: LOIN },
  { name: "spine", head: LOIN, parent: "hips" },
  { name: "chest", head: [0, 0.200, 0.060], parent: "spine" },
  { name: "neck", head: [0, 0.220, 0.150], parent: "chest" },
  { name: "head", head: [0, 0.250, 0.198], parent: "neck" },
  { name: "ear_left", head: [-0.032, 0.300, 0.226], parent: "head" },
  { name: "ear_right", head: [0.032, 0.300, 0.226], parent: "head" },
  { name: "haunch", head: LOIN, parent: "hips" },
  { name: "tail_base", head: [0, 0.214, -0.214], parent: "haunch" },
  { name: "tail_mid", head: [0, 0.292, -0.282], parent: "tail_base" },
  { name: "tail_tip", head: [0, 0.404, -0.288], parent: "tail_mid" },
  { name: "foreleg_left", head: [-0.040, 0.200, 0.104], parent: "chest" },
  { name: "forearm_left", head: [-0.046, 0.132, 0.098], parent: "foreleg_left" },
  { name: "foreleg_right", head: [0.040, 0.200, 0.104], parent: "chest" },
  { name: "forearm_right", head: [0.046, 0.132, 0.098], parent: "foreleg_right" },
  { name: "hindleg_left", head: [-0.044, 0.200, -0.160], parent: "haunch" },
  { name: "hock_left", head: [-0.052, 0.128, -0.126], parent: "hindleg_left" },
  { name: "hindpaw_left", head: [-0.052, 0.062, -0.186], parent: "hock_left" },
  { name: "hindleg_right", head: [0.044, 0.200, -0.160], parent: "haunch" },
  { name: "hock_right", head: [0.052, 0.128, -0.126], parent: "hindleg_right" },
  { name: "hindpaw_right", head: [0.052, 0.062, -0.186], parent: "hock_right" }
];

/**
 * Barn cat, glTF space: +Y up, nose toward +Z, metres.
 *
 * A cat reads by proportion before detail: a low, compact body that is short against its tail, a
 * round skull with wide cheeks and a very short muzzle, upright triangular ears, and a long tail
 * carried up with a hooked tip. The tabby banding is painted across the back as broad faces, so it
 * never breaks the silhouette the way the old proud rings did.
 */
export function createCatModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const { root, motion, rig } = creatureScaffold(ID);
  const bones = buildBones(BONES, rig);
  const surface = new SurfaceBuilder(TOKENS);

  const body: Station[] = [
    { p: [0, 0.204, -0.226], w: 0.030, h: 0.026, hb: 0.030, bones: { haunch: 1 } },
    { p: [0, 0.204, -0.206], w: 0.056, h: 0.042, hb: 0.050, bones: { haunch: 1 } },
    { p: [0, 0.200, -0.160], w: 0.066, h: 0.050, hb: 0.066, bones: { haunch: 1 } },
    // The loin dips between the haunch and the shoulder blades.
    { p: [0, 0.196, -0.100], w: 0.056, h: 0.040, hb: 0.058, bones: { haunch: 0.4, spine: 0.6 } },
    { p: [0, 0.192, -0.030], w: 0.060, h: 0.040, hb: 0.068, bones: { spine: 1 } },
    { p: [0, 0.194, 0.035], w: 0.062, h: 0.044, hb: 0.072, bones: { spine: 0.4, chest: 0.6 } },
    { p: [0, 0.202, 0.095], w: 0.058, h: 0.050, hb: 0.068, bones: { chest: 1 } },
    { p: [0, 0.214, 0.138], w: 0.046, h: 0.040, hb: 0.056, bones: { chest: 0.7, neck: 0.3 } },
    { p: [0, 0.232, 0.170], w: 0.038, h: 0.032, hb: 0.038, bones: { neck: 1 } },
    { p: [0, 0.250, 0.196], w: 0.041, h: 0.034, hb: 0.035, bones: { neck: 0.3, head: 0.7 } },
    // Round skull and wide cheeks, then a very short muzzle.
    { p: [0, 0.268, 0.222], w: 0.056, h: 0.045, hb: 0.045, bones: { head: 1 } },
    { p: [0, 0.270, 0.250], w: 0.052, h: 0.042, hb: 0.040, bones: { head: 1 } },
    { p: [0, 0.261, 0.273], w: 0.032, h: 0.024, hb: 0.027, bones: { head: 1 } },
    { p: [0, 0.258, 0.287], w: 0.015, h: 0.012, hb: 0.013, bones: { head: 1 } }
  ];
  const bodyToken = ({ u, centroid: c, normal: n }: FaceContext): number => {
    if (u > 12.6) return EYE; // nose leather
    // White bib down the throat and chest, and a pale chin.
    if (c.z > 0.10 && c.z < 0.21 && n.z > 0.15 && n.y < 0.3 && c.y < 0.245) return BIB;
    if (u > 11 && n.y < -0.45) return BIB;
    // Forehead stripes over the skull.
    if (c.z > 0.205 && c.z < 0.262 && n.y > 0.55 && Math.sin(c.z * 230) > 0.25) return BAND;
    // Broad tabby bands across the back and flanks; they fade out down the sides.
    const stripe = Math.sin(c.z * 62 + 0.4 + Math.sin(c.z * 11) * 0.8);
    if (c.z < 0.12 && n.y > -0.25 && stripe > 0.35 - n.y * 0.35) return BAND;
    return COAT;
  };
  surface.addLoft(body, { sides: 12, ref: [0, 1, 0], capStart: 0.7, capEnd: 0.8, token: bodyToken });

  // Tail: longer than the cat is tall, carried up with the tip hooked forward. Ringed toward the end.
  surface.addLoft([
    { p: [0, 0.206, -0.206], w: 0.018, h: 0.018, bones: { haunch: 1 } },
    { p: [0, 0.230, -0.240], w: 0.018, h: 0.017, bones: { tail_base: 1 } },
    { p: [0, 0.262, -0.268], w: 0.017, h: 0.016, bones: { tail_base: 1 } },
    { p: [0, 0.300, -0.286], w: 0.016, h: 0.015, bones: { tail_base: 0.3, tail_mid: 0.7 } },
    { p: [0, 0.350, -0.294], w: 0.015, h: 0.014, bones: { tail_mid: 1 } },
    { p: [0, 0.402, -0.290], w: 0.014, h: 0.013, bones: { tail_mid: 0.4, tail_tip: 0.6 } },
    { p: [0, 0.442, -0.276], w: 0.013, h: 0.012, bones: { tail_tip: 1 } },
    { p: [0, 0.466, -0.250], w: 0.011, h: 0.010, bones: { tail_tip: 1 } },
    { p: [0, 0.470, -0.226], w: 0.008, h: 0.008, bones: { tail_tip: 1 } }
  ], {
    sides: 7, ref: [1, 0, 0], capEnd: 0.9,
    token: ({ u }) => (u > 3 && Math.sin(u * 3.6) > 0.3 ? BAND : COAT)
  });

  for (const [side, sx] of [["left", -1], ["right", 1]] as const) {
    const upper = `foreleg_${side}`;
    const lower = `forearm_${side}`;
    // Forelegs: straight and slim under a shoulder blade that stands proud of the dipped spine.
    surface.addLoft([
      { p: [sx * 0.036, 0.222, 0.106], w: 0.024, h: 0.034, bones: { chest: 0.5, [upper]: 0.5 } },
      { p: [sx * 0.044, 0.170, 0.102], w: 0.022, h: 0.028, bones: { [upper]: 1 } },
      { p: [sx * 0.047, 0.128, 0.098], w: 0.017, h: 0.019, bones: { [upper]: 0.5, [lower]: 0.5 } },
      { p: [sx * 0.047, 0.070, 0.102], w: 0.014, h: 0.015, bones: { [lower]: 1 } },
      { p: [sx * 0.047, 0.026, 0.108], w: 0.014, h: 0.016, bones: { [lower]: 1 } }
    ], { sides: 7, ref: [0, 0, 1], token: COAT });
    surface.addLoft([
      { p: [sx * 0.047, 0.016, 0.098], w: 0.016, h: 0.014, hb: 0.016, bones: { [lower]: 1 } },
      { p: [sx * 0.047, 0.013, 0.118], w: 0.018, h: 0.013, hb: 0.013, bones: { [lower]: 1 } },
      { p: [sx * 0.047, 0.010, 0.134], w: 0.014, h: 0.009, hb: 0.009, bones: { [lower]: 1 } }
    ], { sides: 7, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.9, token: BIB });

    const thigh = `hindleg_${side}`;
    const shank = `hock_${side}`;
    const foot = `hindpaw_${side}`;
    // Hind legs: a round haunch, the stifle forward, the hock well back; a crouched, springy stance.
    surface.addLoft([
      { p: [sx * 0.036, 0.210, -0.164], w: 0.032, h: 0.052, bones: { haunch: 0.5, [thigh]: 0.5 } },
      { p: [sx * 0.046, 0.164, -0.146], w: 0.030, h: 0.046, bones: { [thigh]: 1 } },
      { p: [sx * 0.052, 0.124, -0.128], w: 0.020, h: 0.024, bones: { [thigh]: 0.5, [shank]: 0.5 } },
      { p: [sx * 0.053, 0.090, -0.160], w: 0.015, h: 0.018, bones: { [shank]: 1 } },
      { p: [sx * 0.053, 0.062, -0.186], w: 0.013, h: 0.016, bones: { [shank]: 0.5, [foot]: 0.5 } },
      { p: [sx * 0.053, 0.026, -0.176], w: 0.013, h: 0.015, bones: { [foot]: 1 } }
    ], { sides: 7, ref: [0, 0, 1], token: COAT });
    surface.addLoft([
      { p: [sx * 0.053, 0.016, -0.186], w: 0.015, h: 0.014, hb: 0.016, bones: { [foot]: 1 } },
      { p: [sx * 0.053, 0.013, -0.166], w: 0.017, h: 0.013, hb: 0.013, bones: { [foot]: 1 } },
      { p: [sx * 0.053, 0.010, -0.150], w: 0.013, h: 0.009, hb: 0.009, bones: { [foot]: 1 } }
    ], { sides: 7, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.9, token: BIB });

    // Ears: upright triangles set wide on the skull, facing forward, darker at the tips.
    const ear = `ear_${side}`;
    surface.addLoft([
      { p: [sx * 0.032, 0.300, 0.230], w: 0.027, h: 0.008, bones: { head: 0.3, [ear]: 0.7 } },
      { p: [sx * 0.038, 0.324, 0.231], w: 0.020, h: 0.007, bones: { [ear]: 1 } },
      { p: [sx * 0.044, 0.346, 0.232], w: 0.010, h: 0.005, bones: { [ear]: 1 } },
      { p: [sx * 0.047, 0.360, 0.232], w: 0.002, h: 0.002, bones: { [ear]: 1 } }
    ], { sides: 6, ref: [0, 0, 1], capEnd: 0.5, token: ({ u }) => (u > 1.6 ? BAND : COAT) });

    surface.addEllipsoid([sx * 0.026, 0.279, 0.267], [0.010, 0.009, 0.007], { bones: { head: 1 }, token: EYE });
  }

  skinSurface(ID, surface, root, rig, bones);
  namedNode(`${ID}_head_pivot`, [0, 0.250, 0.198], motion);
  namedNode(`${ID}_tail_pivot`, [0, 0.214, -0.214], motion);
  return { root, clips: catClips(ID) };
}

function catClips(ID: string): THREE.AnimationClip[] {
  const M = `${ID}_motion_root`;
  const zero: V3 = [0, 0, 0];

  // Idle: breathing, a slow look round, the tail tip flicking on its own rhythm, ears swivelling.
  const idle = new THREE.AnimationClip("idle", 2.4, [
    posTrack(M, zero, [[0, 0, 0, 0], [1.2, 0, 0.003, 0], [2.4, 0, 0, 0]]),
    rotTrack("chest", [[0, 0, 0, 0], [1.2, -1.5, 0, 0], [2.4, 0, 0, 0]]),
    rotTrack("head", [[0, 0, 0, 0], [0.9, -3, -16, 0], [1.7, 2, 12, 0], [2.4, 0, 0, 0]]),
    rotTrack("ear_left", [[0, 0, 0, 0], [0.8, 0, -18, 0], [1.6, 0, 6, 0], [2.4, 0, 0, 0]]),
    rotTrack("ear_right", [[0, 0, 0, 0], [0.8, 0, 12, 0], [1.6, 0, -8, 0], [2.4, 0, 0, 0]]),
    rotTrack("tail_mid", [[0, 0, 0, 0], [1.2, 0, 7, 0], [2.4, 0, 0, 0]]),
    rotTrack("tail_tip", [[0, 0, 0, 0], [0.6, 0, 24, 0], [1.2, 0, -8, 0], [1.8, 0, 20, 0], [2.4, 0, 0, 0]])
  ]);

  // Walk: a four-beat lateral sequence (hind, fore on the same side, then the other side), each
  // foot on the ground for most of the cycle, paws lifted and placed rather than swung.
  const T = 1.04;
  const foreUpper = [[0, -20], [0.3, -2], [0.6, 18], [0.72, 14], [0.84, -6], [0.94, -22]] as const;
  const foreLower = [[0, 0], [0.3, 0], [0.6, 8], [0.72, 58], [0.84, 44], [0.94, 6]] as const;
  const hindUpper = [[0, -16], [0.3, -2], [0.6, 16], [0.72, 8], [0.84, -10], [0.94, -18]] as const;
  const hindShank = [[0, 0], [0.3, 4], [0.6, 10], [0.72, 34], [0.84, 26], [0.94, 4]] as const;
  const hindFoot = [[0, 0], [0.3, -4], [0.6, -14], [0.72, -44], [0.84, -30], [0.94, -2]] as const;
  const walk = new THREE.AnimationClip("walk", T, [
    cyclicTrack("hindleg_left", hindUpper, 0, T), cyclicTrack("hock_left", hindShank, 0, T),
    cyclicTrack("hindpaw_left", hindFoot, 0, T),
    cyclicTrack("foreleg_left", foreUpper, 0.25, T), cyclicTrack("forearm_left", foreLower, 0.25, T),
    cyclicTrack("hindleg_right", hindUpper, 0.5, T), cyclicTrack("hock_right", hindShank, 0.5, T),
    cyclicTrack("hindpaw_right", hindFoot, 0.5, T),
    cyclicTrack("foreleg_right", foreUpper, 0.75, T), cyclicTrack("forearm_right", foreLower, 0.75, T),
    // Shoulders and hips roll against each other; the head stays level; the tail sways slowly.
    rotTrack("spine", [[0, 0, 0, 2], [0.52, 0, 0, -2], [1.04, 0, 0, 2]]),
    rotTrack("haunch", [[0, 0, 0, -2], [0.52, 0, 0, 2], [1.04, 0, 0, -2]]),
    posTrack(M, zero, [[0, 0, 0, 0], [0.26, 0, 0.004, 0], [0.52, 0, 0, 0], [0.78, 0, 0.004, 0], [1.04, 0, 0, 0]]),
    rotTrack("tail_mid", [[0, 0, 8, 0], [0.52, 0, -8, 0], [1.04, 0, 8, 0]]),
    rotTrack("tail_tip", [[0, 0, -10, 0], [0.52, 0, 10, 0], [1.04, 0, -10, 0]])
  ]);

  // Sleep: curled up on the ground. The legs fold under, the spine bends into a C with the rump and
  // the head both coming round to the same side, the head rests on the flank and the tail wraps
  // round in front of the nose. Held, with slow breathing, so the night station crossfades into it.
  // The tail bones rest pointing up, so their wrap is a Z roll applied after the X pitch has laid the
  // tail down (a Y yaw would only spin it about its own length).
  const curled = (breath: number): Array<[string, number, number, number]> => [
    ["haunch", 0, -50, 0], ["spine", -breath * 0.6, 30, 0], ["chest", 0, 30, 0],
    ["neck", 30, 40, 0], ["head", 24, 26, -34],
    ["foreleg_left", 78, 0, 0], ["foreleg_right", 78, 0, 0],
    ["forearm_left", -150, 0, 0], ["forearm_right", -150, 0, 0],
    ["hindleg_left", -64, 0, 0], ["hindleg_right", -64, 0, 0],
    ["hock_left", 132, 0, 0], ["hock_right", 132, 0, 0],
    ["hindpaw_left", -60, 0, 0], ["hindpaw_right", -60, 0, 0],
    ["tail_base", -76, 0, -34], ["tail_mid", 6, 0, -64], ["tail_tip", 0, 0, -64],
    ["ear_left", -10, 0, 0], ["ear_right", -10, 0, 0]
  ];
  const settled = curled(0);
  const breathing = curled(2.5);
  const sleep = new THREE.AnimationClip("sleep", 4, [
    posTrack(M, zero, [[0, 0, -0.118, 0], [2, 0, -0.114, 0], [4, 0, -0.118, 0]]),
    ...settled.map(([name, x, y, z], index) => {
      const [, bx, by, bz] = breathing[index];
      return rotTrack(name, [[0, x, y, z], [2, bx, by, bz], [4, x, y, z]]);
    })
  ]);
  return [idle, walk, sleep];
}
