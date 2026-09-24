import * as THREE from "three";

import {
  SurfaceBuilder, buildBones, creatureScaffold, cyclicTrack, namedNode, pivotPitch, posTrack, rotTrack,
  skinSurface, solveSagittalChain,
  type AuthoredModel, type GeneratorContext, type BoneSpec, type FaceContext, type Station, type V3
} from "../../kit";

// Catalog palette order: coat, saddle, blaze, eye/nose leather.
const TOKENS = ["soil_dry_01", "wood_dark_01", "animal_hide_white_01", "metal_dark_01"] as const;
const COAT = 0;
const DARK = 1;
const BLAZE = 2;
const EYE = 3;

const HIP: V3 = [0, 0.415, -0.17];

// One root joint over both spine chains: glTF names a single skeleton root for the skin.
const BONES: BoneSpec[] = [
  { name: "hips", head: HIP },
  { name: "spine", head: HIP, parent: "hips" },
  { name: "chest", head: [0, 0.425, 0.06], parent: "spine" },
  { name: "neck", head: [0, 0.44, 0.25], parent: "chest" },
  { name: "head", head: [0, 0.555, 0.385], parent: "neck" },
  { name: "ear_left", head: [-0.042, 0.61, 0.405], parent: "head" },
  { name: "ear_right", head: [0.042, 0.61, 0.405], parent: "head" },
  { name: "haunch", head: HIP, parent: "hips" },
  { name: "tail_base", head: [0, 0.43, -0.345], parent: "haunch" },
  { name: "tail_tip", head: [0, 0.545, -0.425], parent: "tail_base" },
  { name: "foreleg_left", head: [-0.07, 0.40, 0.17], parent: "chest" },
  { name: "forearm_left", head: [-0.078, 0.25, 0.155], parent: "foreleg_left" },
  { name: "foreleg_right", head: [0.07, 0.40, 0.17], parent: "chest" },
  { name: "forearm_right", head: [0.078, 0.25, 0.155], parent: "foreleg_right" },
  { name: "hindleg_left", head: [-0.075, 0.40, -0.22], parent: "haunch" },
  { name: "hock_left", head: [-0.082, 0.235, -0.175], parent: "hindleg_left" },
  { name: "hindpaw_left", head: [-0.082, 0.115, -0.285], parent: "hock_left" },
  { name: "hindleg_right", head: [0.075, 0.40, -0.22], parent: "haunch" },
  { name: "hock_right", head: [0.082, 0.235, -0.175], parent: "hindleg_right" },
  { name: "hindpaw_right", head: [0.082, 0.115, -0.285], parent: "hock_right" }
];

/**
 * Village dog, glTF space: +Y up, nose toward +Z, metres.
 *
 * One continuous loft runs rump -> loin -> ribs -> withers -> neck -> skull -> stop -> muzzle -> nose,
 * so the dipped topline, the deep brisket, the tucked waist and the stop are one surface rather than
 * tubes pushed through each other. The saddle, bib, chin, sock and tail-tip markings are face
 * regions of that surface.
 */
export function createDogModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const { root, motion, rig } = creatureScaffold(ID);
  const bones = buildBones(BONES, rig);
  const surface = new SurfaceBuilder(TOKENS);

  const body: Station[] = [
    { p: [0, 0.418, -0.360], w: 0.042, h: 0.034, hb: 0.040, bones: { haunch: 1 } },
    { p: [0, 0.416, -0.330], w: 0.086, h: 0.058, hb: 0.074, bones: { haunch: 1 } },
    { p: [0, 0.410, -0.265], w: 0.100, h: 0.066, hb: 0.090, bones: { haunch: 1 } },
    { p: [0, 0.412, -0.185], w: 0.090, h: 0.058, hb: 0.072, bones: { haunch: 0.6, spine: 0.4 } },
    // Waist: narrower and tucked up, so the belly line rises toward the flank.
    { p: [0, 0.418, -0.105], w: 0.084, h: 0.056, hb: 0.068, bones: { spine: 1 } },
    { p: [0, 0.410, -0.020], w: 0.092, h: 0.060, hb: 0.090, bones: { spine: 0.7, chest: 0.3 } },
    // Ribcage and brisket: the belly line drops to elbow height.
    { p: [0, 0.400, 0.065], w: 0.106, h: 0.068, hb: 0.128, bones: { chest: 1 } },
    { p: [0, 0.402, 0.150], w: 0.104, h: 0.074, hb: 0.140, bones: { chest: 1 } },
    { p: [0, 0.418, 0.222], w: 0.088, h: 0.072, hb: 0.118, bones: { chest: 0.8, neck: 0.2 } },
    // Neck rising out of the withers.
    { p: [0, 0.458, 0.282], w: 0.066, h: 0.058, hb: 0.074, bones: { neck: 0.7, chest: 0.3 } },
    { p: [0, 0.505, 0.330], w: 0.054, h: 0.050, hb: 0.054, bones: { neck: 1 } },
    { p: [0, 0.552, 0.372], w: 0.052, h: 0.048, hb: 0.046, bones: { neck: 0.4, head: 0.6 } },
    // Skull: broad cheeks, then the stop drops to a narrower, boxier muzzle.
    { p: [0, 0.576, 0.418], w: 0.060, h: 0.050, hb: 0.050, bones: { head: 1 } },
    { p: [0, 0.572, 0.458], w: 0.054, h: 0.042, hb: 0.050, bones: { head: 1 } },
    { p: [0, 0.556, 0.490], w: 0.040, h: 0.030, hb: 0.042, n: 2.6, bones: { head: 1 } },
    { p: [0, 0.546, 0.528], w: 0.034, h: 0.028, hb: 0.034, n: 3, bones: { head: 1 } },
    { p: [0, 0.540, 0.566], w: 0.030, h: 0.026, hb: 0.028, n: 3, bones: { head: 1 } },
    { p: [0, 0.542, 0.590], w: 0.022, h: 0.020, hb: 0.018, n: 2.4, bones: { head: 1 } }
  ];
  const bodyToken = ({ u, centroid: c, normal: n }: FaceContext): number => {
    if (u > 16.5) return EYE; // nose leather on the cap
    // Saddle over the back; its edge wavers along the flank so it reads as a coat, not a stripe.
    const saddleEdge = 0.18 + 0.12 * Math.sin(c.z * 30) + 0.06 * Math.sin(c.z * 71 + 1.3);
    if (c.z > -0.33 && c.z < 0.25 && n.y > saddleEdge) return DARK;
    // The saddle runs up the back of the neck into a dark cap over the skull.
    if (c.z >= 0.25 && c.z < 0.47 && n.y > 0.55 - (c.z - 0.25) * 0.8) return DARK;
    // Chest bib and throat: the one bright mass on the front.
    if (c.z > 0.15 && c.z < 0.40 && n.z > 0.2 && n.y < 0.45 && c.y < 0.53) return BLAZE;
    // Pale chin and lip line under the muzzle.
    if (u > 13.5 && n.y < -0.35) return BLAZE;
    return COAT;
  };
  surface.addLoft(body, { sides: 12, ref: [0, 1, 0], capStart: 0.7, capEnd: 0.8, token: bodyToken });

  // Tail: set on high and carried in a loose curl that leaves air above the rump.
  surface.addLoft([
    { p: [0, 0.418, -0.330], w: 0.030, h: 0.030, bones: { haunch: 1 } },
    { p: [0, 0.440, -0.372], w: 0.030, h: 0.028, bones: { tail_base: 1 } },
    { p: [0, 0.485, -0.412], w: 0.028, h: 0.025, bones: { tail_base: 1 } },
    { p: [0, 0.545, -0.428], w: 0.026, h: 0.023, bones: { tail_base: 0.4, tail_tip: 0.6 } },
    { p: [0, 0.598, -0.410], w: 0.023, h: 0.020, bones: { tail_tip: 1 } },
    { p: [0, 0.628, -0.372], w: 0.019, h: 0.016, bones: { tail_tip: 1 } },
    { p: [0, 0.632, -0.332], w: 0.012, h: 0.010, bones: { tail_tip: 1 } }
  ], { sides: 7, ref: [1, 0, 0], capEnd: 0.9, token: ({ u }) => (u > 4.6 ? BLAZE : COAT) });

  for (const [side, sx] of [["left", -1], ["right", 1]] as const) {
    const upper = `foreleg_${side}`;
    const lower = `forearm_${side}`;
    // Foreleg: a flattened shoulder pressed into the chest, the elbow, a straight forearm and a
    // sloped pastern.
    surface.addLoft([
      { p: [sx * 0.050, 0.425, 0.172], w: 0.036, h: 0.066, bones: { chest: 0.5, [upper]: 0.5 } },
      { p: [sx * 0.068, 0.345, 0.165], w: 0.040, h: 0.056, bones: { [upper]: 1 } },
      { p: [sx * 0.078, 0.262, 0.150], w: 0.032, h: 0.036, bones: { [upper]: 0.5, [lower]: 0.5 } },
      { p: [sx * 0.079, 0.170, 0.158], w: 0.024, h: 0.026, bones: { [lower]: 1 } },
      { p: [sx * 0.079, 0.085, 0.164], w: 0.021, h: 0.022, bones: { [lower]: 1 } },
      { p: [sx * 0.079, 0.038, 0.178], w: 0.021, h: 0.023, bones: { [lower]: 1 } }
    ], { sides: 8, ref: [0, 0, 1], token: COAT });
    // Paw: a flat-bottomed pad pointing forward, the white sock.
    surface.addLoft([
      { p: [sx * 0.079, 0.026, 0.158], w: 0.024, h: 0.020, hb: 0.024, bones: { [lower]: 1 } },
      { p: [sx * 0.079, 0.022, 0.190], w: 0.028, h: 0.022, hb: 0.020, n: 2.6, bones: { [lower]: 1 } },
      { p: [sx * 0.079, 0.016, 0.218], w: 0.024, h: 0.014, hb: 0.014, n: 2.6, bones: { [lower]: 1 } }
    ], { sides: 8, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.9, token: BLAZE });

    const thigh = `hindleg_${side}`;
    const shank = `hock_${side}`;
    const foot = `hindpaw_${side}`;
    // Hind leg: a broad ham under the haunch, the stifle angled forward, the hock kicked back and a
    // near-vertical metatarsus. That zig-zag is what makes a standing dog look sprung.
    surface.addLoft([
      { p: [sx * 0.050, 0.410, -0.226], w: 0.046, h: 0.086, bones: { haunch: 0.5, [thigh]: 0.5 } },
      { p: [sx * 0.070, 0.335, -0.205], w: 0.050, h: 0.080, bones: { [thigh]: 1 } },
      { p: [sx * 0.080, 0.245, -0.180], w: 0.034, h: 0.044, bones: { [thigh]: 0.5, [shank]: 0.5 } },
      { p: [sx * 0.082, 0.175, -0.232], w: 0.025, h: 0.032, bones: { [shank]: 1 } },
      { p: [sx * 0.082, 0.118, -0.282], w: 0.021, h: 0.026, bones: { [shank]: 0.5, [foot]: 0.5 } },
      { p: [sx * 0.082, 0.060, -0.270], w: 0.020, h: 0.021, bones: { [foot]: 1 } },
      { p: [sx * 0.082, 0.036, -0.262], w: 0.020, h: 0.022, bones: { [foot]: 1 } }
    ], { sides: 8, ref: [0, 0, 1], token: COAT });
    surface.addLoft([
      { p: [sx * 0.082, 0.026, -0.280], w: 0.023, h: 0.020, hb: 0.024, bones: { [foot]: 1 } },
      { p: [sx * 0.082, 0.022, -0.250], w: 0.027, h: 0.021, hb: 0.020, n: 2.6, bones: { [foot]: 1 } },
      { p: [sx * 0.082, 0.016, -0.224], w: 0.023, h: 0.013, hb: 0.014, n: 2.6, bones: { [foot]: 1 } }
    ], { sides: 8, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.9, token: BLAZE });

    // Ears: thick triangular blades on the top corners of the skull, tips tipping forward.
    const ear = `ear_${side}`;
    surface.addLoft([
      { p: [sx * 0.034, 0.598, 0.400], w: 0.034, h: 0.011, bones: { head: 0.3, [ear]: 0.7 } },
      { p: [sx * 0.050, 0.642, 0.408], w: 0.028, h: 0.010, bones: { [ear]: 1 } },
      { p: [sx * 0.062, 0.674, 0.424], w: 0.016, h: 0.008, bones: { [ear]: 1 } },
      { p: [sx * 0.066, 0.682, 0.450], w: 0.005, h: 0.005, bones: { [ear]: 1 } }
    ], { sides: 6, ref: [0, 0, 1], capEnd: 0.5, token: DARK });

    // Eyes sit where the forehead breaks down to the muzzle, proud of the surface.
    surface.addEllipsoid([sx * 0.036, 0.578, 0.478], [0.011, 0.011, 0.009], { bones: { head: 1 }, token: EYE });
  }

  skinSurface(ID, surface, root, rig, bones);
  namedNode(`${ID}_head_pivot`, [0, 0.555, 0.385], motion);
  namedNode(`${ID}_tail_pivot`, [0, 0.43, -0.345], motion);
  return { root, clips: dogClips(ID) };
}

function dogClips(ID: string): THREE.AnimationClip[] {
  const M = `${ID}_motion_root`;
  const zero: V3 = [0, 0, 0];

  // Idle: planted stance, breathing through the chest, an attentive head and a loose wag. The ears
  // lead the head turn by a beat.
  const idle = new THREE.AnimationClip("idle", 2, [
    posTrack(M, zero, [[0, 0, 0, 0], [1, 0, 0.004, 0], [2, 0, 0, 0]]),
    rotTrack("chest", [[0, 0, 0, 0], [1, -1.2, 0, 0], [2, 0, 0, 0]]),
    rotTrack("head", [[0, 0, 0, 0], [0.7, 0, -12, 3], [1.3, -4, 9, -2], [2, 0, 0, 0]]),
    rotTrack("ear_left", [[0, 0, 0, 0], [0.55, -14, 0, 0], [1.1, 4, 0, 0], [2, 0, 0, 0]]),
    rotTrack("ear_right", [[0, 0, 0, 0], [0.55, 10, 0, 0], [1.1, -6, 0, 0], [2, 0, 0, 0]]),
    rotTrack("tail_base", [[0, 0, 0, 0], [0.5, 0, 16, 0], [1, 0, -14, 0], [1.5, 0, 12, 0], [2, 0, 0, 0]]),
    rotTrack("tail_tip", [[0, 0, 0, 0], [0.6, 0, 10, 0], [1.1, 0, -10, 0], [1.6, 0, 8, 0], [2, 0, 0, 0]])
  ]);

  // Trot: diagonal pairs with explicit contact / stance / toe-off / fold / reach keys. The lower
  // limb folds in swing so the paw clears the ground instead of sweeping it like a pendulum.
  const T = 0.96;
  const foreUpper = [[0, -24], [0.25, -4], [0.5, 20], [0.62, 16], [0.75, -6], [0.88, -26]] as const;
  const foreLower = [[0, 0], [0.25, 0], [0.5, 8], [0.62, 62], [0.75, 48], [0.88, 6]] as const;
  const hindUpper = [[0, -18], [0.25, -2], [0.5, 18], [0.62, 10], [0.75, -12], [0.88, -22]] as const;
  const hindShank = [[0, 0], [0.25, 4], [0.5, 10], [0.62, 36], [0.75, 30], [0.88, 4]] as const;
  const hindFoot = [[0, 0], [0.25, -4], [0.5, -16], [0.62, -48], [0.75, -34], [0.88, -2]] as const;
  const walk = new THREE.AnimationClip("walk", T, [
    cyclicTrack("foreleg_left", foreUpper, 0, T), cyclicTrack("forearm_left", foreLower, 0, T),
    cyclicTrack("hindleg_right", hindUpper, 0, T), cyclicTrack("hock_right", hindShank, 0, T),
    cyclicTrack("hindpaw_right", hindFoot, 0, T),
    cyclicTrack("foreleg_right", foreUpper, 0.5, T), cyclicTrack("forearm_right", foreLower, 0.5, T),
    cyclicTrack("hindleg_left", hindUpper, 0.5, T), cyclicTrack("hock_left", hindShank, 0.5, T),
    cyclicTrack("hindpaw_left", hindFoot, 0.5, T),
    // Two suspension bobs per stride, a counter-nod of the head, and a wag in time with the trot.
    posTrack(M, zero, [[0, 0, 0, 0], [0.12, 0, 0.012, 0], [0.24, 0, 0, 0], [0.6, 0, 0.012, 0], [0.72, 0, 0, 0], [0.96, 0, 0, 0]]),
    rotTrack(M, [[0, 0, 0, 1.2], [0.48, 0, 0, -1.2], [0.96, 0, 0, 1.2]]),
    rotTrack("head", [[0, 3, 0, 0], [0.24, -2, 0, 0], [0.48, 3, 0, 0], [0.72, -2, 0, 0], [0.96, 3, 0, 0]]),
    rotTrack("tail_base", [[0, 0, 14, 0], [0.48, 0, -14, 0], [0.96, 0, 14, 0]])
  ]);

  // Sit: a held settled pose the runtime crossfades into at the night station, not a squat loop.
  // The body pitches up about the hip until the rump meets the ground, the forelegs counter-rotate
  // to stay vertical, and the hind chain is solved so the stifle comes forward, the hock rests
  // behind it and the foot lies flat.
  const pitch = -45;
  const rootOffset = pivotPitch(HIP, pitch, [0, -0.245, 0.06]);
  const [thigh, shank, foot] = solveSagittalChain(
    [[0.235 - 0.40, -0.175 + 0.22], [0.115 - 0.235, -0.285 + 0.175], [0.02 - 0.115, -0.27 + 0.285]],
    [[-0.064, 0.158], [-0.030, -0.160], [-0.004, 0.096]],
    pitch
  );
  const sitPose = (breath: number): Array<[string, number, number, number]> => [
    ["foreleg_left", -pitch + breath, 0, 0], ["foreleg_right", -pitch + breath, 0, 0],
    ["forearm_left", -breath, 0, 0], ["forearm_right", -breath, 0, 0],
    ["hindleg_left", thigh, 0, -8], ["hindleg_right", thigh, 0, 8],
    ["hock_left", shank, 0, 0], ["hock_right", shank, 0, 0],
    ["hindpaw_left", foot, 0, 0], ["hindpaw_right", foot, 0, 0],
    ["chest", -breath, 0, 0], ["neck", 20, 0, 0], ["head", 16, 0, 0],
    ["tail_base", 34, 0, 0], ["tail_tip", 24, 0, 0]
  ];
  const settled = sitPose(0);
  const breathing = sitPose(1.2);
  const sit = new THREE.AnimationClip("sit", 2.4, [
    posTrack(M, rootOffset, [[0, 0, 0, 0], [2.4, 0, 0, 0]]),
    rotTrack(M, [[0, pitch, 0, 0], [2.4, pitch, 0, 0]]),
    ...settled.map(([name, x, y, z], index) => {
      const [, bx, by, bz] = breathing[index];
      const head = name === "head";
      return rotTrack(name, [
        [0, x, y, z],
        [1.2, head ? bx - 4 : bx, head ? by - 12 : by, head ? bz + 8 : bz],
        [2.4, x, y, z]
      ]);
    })
  ]);
  return [idle, walk, sit];
}
