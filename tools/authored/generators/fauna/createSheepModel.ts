import * as THREE from "three";

import {
  SurfaceBuilder, buildBones, creatureScaffold, mulberry32, namedNode, pivotPitch, posTrack, rotTrack, skinSurface,
  type AuthoredModel, type GeneratorContext, type BoneSpec, type Station, type V3
} from "../../kit";

// Catalog palette order: fleece, face and legs, hooves, eyes.
const TOKENS = ["foam_warm_01", "animal_hide_black_01", "soil_shadow_01", "metal_dark_01"] as const;
const FLEECE = 0;
const DARK = 1;
const HOOF = 2;
const EYE = 3;

// One root joint over both spine chains: glTF names a single skeleton root for the skin.
const BONES: BoneSpec[] = [
  { name: "hips", head: [0, 0.47, -0.05] },
  { name: "spine", head: [0, 0.47, -0.05], parent: "hips" },
  { name: "chest", head: [0, 0.47, 0.12], parent: "spine" },
  { name: "neck", head: [0, 0.45, 0.22], parent: "chest" },
  { name: "head", head: [0, 0.545, 0.36], parent: "neck" },
  { name: "ear_left", head: [-0.046, 0.556, 0.392], parent: "head" },
  { name: "ear_right", head: [0.046, 0.556, 0.392], parent: "head" },
  { name: "haunch", head: [0, 0.47, -0.05], parent: "hips" },
  { name: "tail", head: [0, 0.50, -0.37], parent: "haunch" },
  { name: "foreleg_left", head: [-0.100, 0.36, 0.20], parent: "chest" },
  { name: "forearm_left", head: [-0.105, 0.17, 0.202], parent: "foreleg_left" },
  { name: "foreleg_right", head: [0.100, 0.36, 0.20], parent: "chest" },
  { name: "forearm_right", head: [0.105, 0.17, 0.202], parent: "foreleg_right" },
  { name: "hindleg_left", head: [-0.100, 0.36, -0.24], parent: "haunch" },
  { name: "hock_left", head: [-0.106, 0.15, -0.265], parent: "hindleg_left" },
  { name: "hindleg_right", head: [0.100, 0.36, -0.24], parent: "haunch" },
  { name: "hock_right", head: [0.106, 0.15, -0.265], parent: "hindleg_right" }
];

/**
 * Paddock sheep, glTF space: +Y up, nose toward +Z, metres.
 *
 * Built fleece-first: the body is one broad woollen loft whose every ring is pushed in and out by
 * seeded lumps, so the outline itself reads as wool (the old model stuck separate balls onto a
 * smooth barrel). The dark head, ears and thin jointed legs are the only other colour, and the neck
 * is long enough that grazing actually puts the muzzle in the grass.
 */
export function createSheepModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const { root, motion, rig } = creatureScaffold(ID);
  const bones = buildBones(BONES, rig);
  const surface = new SurfaceBuilder(TOKENS);
  const rng = mulberry32(context.seed);

  // Seeded lumps: two ring harmonics with per-station phases, plus a little per-vertex jitter.
  const lumps = (count: number, strength: number) => {
    const phases = Array.from({ length: count }, () => [
      rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2, 0.92 + rng() * 0.16
    ]);
    const jitter = Array.from({ length: count * 32 }, () => rng());
    return (index: number, theta: number): number => {
      const [a, b, c, swell] = phases[index];
      const k = Math.round((theta / (Math.PI * 2)) * 32) % 32;
      return swell * (1
        + strength * 0.5 * Math.sin(3 * theta + a)
        + strength * 0.32 * Math.sin(5 * theta + b)
        + strength * 0.28 * Math.sin(7 * theta + c)
        + strength * 0.4 * (jitter[index * 32 + k] - 0.5));
    };
  };

  const fleece: Station[] = [
    { p: [0, 0.475, -0.398], w: 0.080, h: 0.080, hb: 0.070, bones: { haunch: 1 } },
    { p: [0, 0.478, -0.360], w: 0.165, h: 0.160, hb: 0.145, bones: { haunch: 1 } },
    { p: [0, 0.482, -0.280], w: 0.215, h: 0.200, hb: 0.180, bones: { haunch: 1 } },
    { p: [0, 0.486, -0.160], w: 0.236, h: 0.214, hb: 0.192, bones: { haunch: 0.6, spine: 0.4 } },
    { p: [0, 0.486, -0.030], w: 0.242, h: 0.220, hb: 0.196, bones: { spine: 1 } },
    { p: [0, 0.486, 0.100], w: 0.236, h: 0.214, hb: 0.190, bones: { spine: 0.4, chest: 0.6 } },
    { p: [0, 0.482, 0.210], w: 0.204, h: 0.194, hb: 0.170, bones: { chest: 1 } },
    { p: [0, 0.488, 0.290], w: 0.150, h: 0.150, hb: 0.130, bones: { chest: 0.8, neck: 0.2 } },
    { p: [0, 0.496, 0.336], w: 0.080, h: 0.090, hb: 0.070, bones: { chest: 0.5, neck: 0.5 } }
  ];
  surface.addLoft(fleece, {
    sides: 16, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.5, token: FLEECE, radial: lumps(fleece.length, 0.19)
  });

  // Woolly neck ruff: a second fleece mass that carries the head out of the body, so the neck can
  // drop to the grass without tearing the body open.
  const ruff: Station[] = [
    { p: [0, 0.460, 0.200], w: 0.110, h: 0.110, bones: { chest: 1 } },
    { p: [0, 0.490, 0.270], w: 0.108, h: 0.110, hb: 0.100, bones: { chest: 0.3, neck: 0.7 } },
    { p: [0, 0.520, 0.330], w: 0.086, h: 0.090, hb: 0.080, bones: { neck: 1 } },
    { p: [0, 0.540, 0.362], w: 0.064, h: 0.068, hb: 0.060, bones: { neck: 0.5, head: 0.5 } }
  ];
  surface.addLoft(ruff, { sides: 12, ref: [0, 1, 0], capEnd: 0.4, token: FLEECE, radial: lumps(ruff.length, 0.16) });

  // Dark face: a broad poll, a gentle roman nose and a blunt muzzle.
  surface.addLoft([
    { p: [0, 0.548, 0.340], w: 0.046, h: 0.046, bones: { head: 1 } },
    { p: [0, 0.548, 0.382], w: 0.054, h: 0.050, hb: 0.050, bones: { head: 1 } },
    { p: [0, 0.530, 0.424], w: 0.050, h: 0.046, hb: 0.048, bones: { head: 1 } },
    { p: [0, 0.506, 0.462], w: 0.041, h: 0.039, hb: 0.041, bones: { head: 1 } },
    { p: [0, 0.484, 0.496], w: 0.034, h: 0.032, hb: 0.032, n: 2.4, bones: { head: 1 } },
    { p: [0, 0.470, 0.518], w: 0.026, h: 0.022, hb: 0.024, n: 2.4, bones: { head: 1 } }
  ], { sides: 10, ref: [0, 1, 0], capEnd: 0.6, token: DARK });
  // A woolly topknot on the poll.
  surface.addEllipsoid([0, 0.592, 0.370], [0.046, 0.026, 0.040], { bones: { head: 1 }, token: FLEECE });
  surface.addLoft([
    { p: [0, 0.505, -0.360], w: 0.040, h: 0.036, bones: { haunch: 0.3, tail: 0.7 } },
    { p: [0, 0.462, -0.405], w: 0.036, h: 0.032, bones: { tail: 1 } },
    { p: [0, 0.420, -0.418], w: 0.026, h: 0.024, bones: { tail: 1 } }
  ], { sides: 8, ref: [1, 0, 0], capEnd: 0.7, token: FLEECE });

  for (const [side, sx] of [["left", -1], ["right", 1]] as const) {
    // Ears stick out sideways from under the topknot and droop a little.
    const ear = `ear_${side}`;
    surface.addLoft([
      { p: [sx * 0.042, 0.556, 0.392], w: 0.020, h: 0.008, bones: { head: 0.3, [ear]: 0.7 } },
      { p: [sx * 0.082, 0.546, 0.390], w: 0.024, h: 0.008, bones: { [ear]: 1 } },
      { p: [sx * 0.118, 0.530, 0.386], w: 0.014, h: 0.006, bones: { [ear]: 1 } }
    ], { sides: 6, ref: [0, 1, 0], capEnd: 0.8, token: DARK });
    surface.addEllipsoid([sx * 0.042, 0.540, 0.432], [0.010, 0.009, 0.008], { bones: { head: 1 }, token: EYE });

    const upper = `foreleg_${side}`;
    const lower = `forearm_${side}`;
    // Thin dark legs with a visible knee, emerging from under the fleece skirt.
    surface.addLoft([
      { p: [sx * 0.100, 0.370, 0.200], w: 0.030, h: 0.036, bones: { chest: 0.4, [upper]: 0.6 } },
      { p: [sx * 0.104, 0.250, 0.200], w: 0.022, h: 0.026, bones: { [upper]: 1 } },
      { p: [sx * 0.106, 0.170, 0.203], w: 0.020, h: 0.023, bones: { [upper]: 0.5, [lower]: 0.5 } },
      { p: [sx * 0.106, 0.095, 0.205], w: 0.016, h: 0.017, bones: { [lower]: 1 } },
      { p: [sx * 0.106, 0.040, 0.206], w: 0.016, h: 0.018, bones: { [lower]: 1 } }
    ], { sides: 7, ref: [0, 0, 1], token: DARK });
    surface.addLoft([
      { p: [sx * 0.106, 0.042, 0.206], w: 0.019, h: 0.021, n: 2.6, bones: { [lower]: 1 } },
      { p: [sx * 0.106, 0.004, 0.210], w: 0.022, h: 0.026, n: 2.6, bones: { [lower]: 1 } }
    ], { sides: 8, ref: [0, 0, 1], capStart: 0.2, capEnd: 0.05, flat: true, token: HOOF });

    const thigh = `hindleg_${side}`;
    const shank = `hock_${side}`;
    surface.addLoft([
      { p: [sx * 0.100, 0.370, -0.240], w: 0.034, h: 0.048, bones: { haunch: 0.4, [thigh]: 0.6 } },
      { p: [sx * 0.104, 0.250, -0.226], w: 0.025, h: 0.032, bones: { [thigh]: 1 } },
      { p: [sx * 0.106, 0.150, -0.265], w: 0.018, h: 0.022, bones: { [thigh]: 0.5, [shank]: 0.5 } },
      { p: [sx * 0.106, 0.085, -0.252], w: 0.016, h: 0.017, bones: { [shank]: 1 } },
      { p: [sx * 0.106, 0.040, -0.246], w: 0.016, h: 0.018, bones: { [shank]: 1 } }
    ], { sides: 7, ref: [0, 0, 1], token: DARK });
    surface.addLoft([
      { p: [sx * 0.106, 0.042, -0.246], w: 0.019, h: 0.021, n: 2.6, bones: { [shank]: 1 } },
      { p: [sx * 0.106, 0.004, -0.242], w: 0.022, h: 0.026, n: 2.6, bones: { [shank]: 1 } }
    ], { sides: 8, ref: [0, 0, 1], capStart: 0.2, capEnd: 0.05, flat: true, token: HOOF });
  }

  skinSurface(ID, surface, root, rig, bones);
  namedNode(`${ID}_head_pivot`, [0, 0.545, 0.36], motion);
  return { root, clips: sheepClips(ID) };
}

function sheepClips(ID: string): THREE.AnimationClip[] {
  const M = `${ID}_motion_root`;
  const zero: V3 = [0, 0, 0];

  // Idle: slow breathing through the barrel, a lazy head sway, an ear flick and a tail twitch.
  const idle = new THREE.AnimationClip("idle", 3.2, [
    rotTrack("spine", [[0, 0, 0, 0], [1.6, -0.8, 0, 0], [3.2, 0, 0, 0]]),
    rotTrack("head", [[0, 0, 0, 0], [1.2, 4, -9, 0], [2.4, 2, 6, 0], [3.2, 0, 0, 0]]),
    rotTrack("ear_left", [[0, 0, 0, 0], [0.9, 0, 0, 14], [1.3, 0, 0, 0], [3.2, 0, 0, 0]]),
    rotTrack("ear_right", [[0, 0, 0, 0], [2.1, 0, 0, -12], [2.5, 0, 0, 0], [3.2, 0, 0, 0]]),
    rotTrack("tail", [[0, 0, 0, 0], [0.6, 0, 18, 0], [0.9, 0, -14, 0], [1.2, 0, 0, 0], [3.2, 0, 0, 0]])
  ]);

  // Graze: the whole body tips a little forward over the forelegs, the neck drops until the muzzle is
  // in the grass, the head crops side to side, and lifts once to chew before the loop comes round.
  const tip = pivotPitch([0, 0, -0.245], 5, [0, 0, 0]);
  const down: [number, number, number] = [80, 0, 0];
  const graze = new THREE.AnimationClip("graze", 3.6, [
    posTrack(M, zero, [[0, 0, 0, 0], [0.8, ...tip], [3.0, ...tip], [3.6, 0, 0, 0]]),
    rotTrack(M, [[0, 0, 0, 0], [0.8, 5, 0, 0], [3.0, 5, 0, 0], [3.6, 0, 0, 0]]),
    rotTrack("neck", [[0, 0, 0, 0], [0.8, ...down], [1.5, 82, 6, 0], [2.2, 80, -6, 0], [3.0, ...down], [3.6, 0, 0, 0]]),
    rotTrack("head", [[0, 0, 0, 0], [0.8, -26, 0, 0], [1.1, -22, 10, 0], [1.5, -26, 0, 0], [1.9, -22, -10, 0],
      [2.3, -26, 0, 0], [2.6, -20, 8, 0], [3.0, -26, 0, 0], [3.6, 0, 0, 0]]),
    rotTrack("ear_left", [[0, 0, 0, 0], [0.8, 0, 0, -10], [3.0, 0, 0, -10], [3.6, 0, 0, 0]]),
    rotTrack("ear_right", [[0, 0, 0, 0], [0.8, 0, 0, 10], [3.0, 0, 0, 10], [3.6, 0, 0, 0]])
  ]);

  // Look: the head comes up and round toward whatever caught its attention, ears pricked forward.
  const look = new THREE.AnimationClip("look", 2, [
    rotTrack("neck", [[0, 0, 0, 0], [0.5, -10, 0, 0], [1.5, -10, 0, 0], [2, 0, 0, 0]]),
    rotTrack("head", [[0, 0, 0, 0], [0.5, -8, -26, 0], [1.1, -8, 20, 0], [1.6, -6, 6, 0], [2, 0, 0, 0]]),
    rotTrack("ear_left", [[0, 0, 0, 0], [0.5, 0, 24, 12], [1.6, 0, 20, 10], [2, 0, 0, 0]]),
    rotTrack("ear_right", [[0, 0, 0, 0], [0.5, 0, -24, -12], [1.6, 0, -20, -10], [2, 0, 0, 0]])
  ]);
  return [idle, graze, look];
}
