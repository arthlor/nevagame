import * as THREE from "three";

import {
  SurfaceBuilder, buildBones, creatureScaffold, namedNode, pivotPitch, posTrack, rotTrack, skinSurface,
  type AuthoredModel, type GeneratorContext, type BoneSpec, type FaceContext, type Station, type V3
} from "../../kit";

// Head green (also the black stern), chestnut breast, cream collar and tail, ochre bill, grey
// flanks and wings.
const TOKENS = ["foliage_shadow_01", "wood_weathered_01", "canvas_cream_01", "accent_ochre_01", "stone_cool_01"] as const;
const GREEN = 0;
const CHESTNUT = 1;
const CREAM = 2;
const BILL = 3;
const GREY = 4;

const BONES: BoneSpec[] = [
  { name: "spine", head: [0, 0.12, -0.02] },
  { name: "neck", head: [0, 0.165, 0.12], parent: "spine" },
  { name: "head", head: [0, 0.255, 0.16], parent: "neck" },
  { name: "tail", head: [0, 0.17, -0.2], parent: "spine" }
];

/**
 * Mallard drake afloat, glTF space: +Y up, bill toward +Z, metres. Placements sit it 6 cm into the
 * water, so the hull's keel is authored just below y = 0.06 and everything above reads as a duck
 * riding high: a boat-shaped body with the stern lifted, the chestnut breast and grey flanks of a
 * drake, a black stern with the curled tail feathers, a white collar under the green head, and a
 * flat spatula bill.
 */
export function createDuckModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const { root, motion, rig } = creatureScaffold(ID);
  const bones = buildBones(BONES, rig);
  const surface = new SurfaceBuilder(TOKENS);

  const hull: Station[] = [
    { p: [0, 0.192, -0.236], w: 0.012, h: 0.010, bones: { spine: 0.4, tail: 0.6 } },
    { p: [0, 0.162, -0.206], w: 0.050, h: 0.030, hb: 0.040, bones: { spine: 0.7, tail: 0.3 } },
    { p: [0, 0.128, -0.150], w: 0.088, h: 0.055, hb: 0.062, bones: { spine: 1 } },
    { p: [0, 0.117, -0.070], w: 0.108, h: 0.070, hb: 0.062, bones: { spine: 1 } },
    { p: [0, 0.117, 0.020], w: 0.110, h: 0.074, hb: 0.062, bones: { spine: 1 } },
    { p: [0, 0.124, 0.095], w: 0.096, h: 0.070, hb: 0.060, bones: { spine: 1 } },
    { p: [0, 0.137, 0.145], w: 0.068, h: 0.056, hb: 0.050, bones: { spine: 0.7, neck: 0.3 } },
    { p: [0, 0.152, 0.172], w: 0.032, h: 0.028, hb: 0.028, bones: { spine: 0.5, neck: 0.5 } }
  ];
  const hullToken = ({ centroid: c, normal: n }: FaceContext): number => {
    // Black stern above the tail; chestnut breast in front; grey vermiculated flanks between.
    if (c.z < -0.165 && n.y > -0.3) return GREEN;
    if (c.z > 0.06 && n.z > -0.1 && c.y > 0.075) return CHESTNUT;
    return GREY;
  };
  surface.addLoft(hull, { sides: 12, ref: [0, 1, 0], capStart: 0.8, capEnd: 0.8, token: hullToken });

  // Neck and head rise out of the breast as one loft; the collar is a ring of faces.
  surface.addLoft([
    { p: [0, 0.150, 0.112], w: 0.040, h: 0.040, bones: { spine: 0.5, neck: 0.5 } },
    { p: [0, 0.198, 0.140], w: 0.033, h: 0.034, bones: { neck: 1 } },
    { p: [0, 0.232, 0.152], w: 0.031, h: 0.032, bones: { neck: 0.7, head: 0.3 } },
    { p: [0, 0.262, 0.164], w: 0.038, h: 0.040, bones: { head: 1 } },
    { p: [0, 0.283, 0.186], w: 0.041, h: 0.036, hb: 0.042, bones: { head: 1 } },
    { p: [0, 0.281, 0.212], w: 0.032, h: 0.028, hb: 0.030, bones: { head: 1 } },
    { p: [0, 0.272, 0.228], w: 0.022, h: 0.018, hb: 0.020, bones: { head: 1 } }
  ], {
    sides: 10, ref: [1, 0, 0], capEnd: 0.4,
    token: ({ u }) => (u < 1.35 ? CHESTNUT : u < 1.85 ? CREAM : GREEN)
  });
  // Flat spatula bill, a little wider at the tip.
  surface.addLoft([
    { p: [0, 0.272, 0.220], w: 0.019, h: 0.010, hb: 0.009, n: 3, bones: { head: 1 } },
    { p: [0, 0.266, 0.250], w: 0.021, h: 0.007, hb: 0.007, n: 3, bones: { head: 1 } },
    { p: [0, 0.259, 0.278], w: 0.022, h: 0.005, hb: 0.006, n: 3, bones: { head: 1 } }
  ], { sides: 8, ref: [0, 1, 0], capEnd: 0.8, token: BILL });

  // Tail: a short cream fan with the drake's black curl hooked up and forward above it.
  surface.addLoft([
    { p: [0, 0.172, -0.212], w: 0.030, h: 0.006, bones: { tail: 1 } },
    { p: [0, 0.178, -0.248], w: 0.034, h: 0.005, bones: { tail: 1 } },
    { p: [0, 0.186, -0.276], w: 0.022, h: 0.004, bones: { tail: 1 } }
  ], { sides: 6, ref: [0, 1, 0], capEnd: 0.6, token: CREAM });
  surface.addLoft([
    { p: [0, 0.198, -0.222], w: 0.009, h: 0.007, bones: { tail: 1 } },
    { p: [0, 0.222, -0.232], w: 0.008, h: 0.006, bones: { tail: 1 } },
    { p: [0, 0.236, -0.220], w: 0.006, h: 0.005, bones: { tail: 1 } },
    { p: [0, 0.232, -0.206], w: 0.004, h: 0.003, bones: { tail: 1 } }
  ], { sides: 5, ref: [1, 0, 0], capEnd: 0.6, token: GREEN });

  for (const sx of [-1, 1]) {
    // Folded grey wings lie flush along the back, black tips crossing over the stern. They sit on the
    // body instead of sticking out, which is what the old fins got wrong.
    const tilt: V3 = [sx * 0.45, 0.89, 0];
    surface.addLoft([
      { p: [sx * 0.046, 0.186, 0.075], w: 0.024, h: 0.008, bones: { spine: 1 } },
      { p: [sx * 0.066, 0.184, 0.005], w: 0.036, h: 0.009, bones: { spine: 1 } },
      { p: [sx * 0.058, 0.181, -0.085], w: 0.032, h: 0.009, bones: { spine: 1 } },
      { p: [sx * 0.032, 0.185, -0.160], w: 0.018, h: 0.006, bones: { spine: 0.6, tail: 0.4 } },
      { p: [sx * 0.012, 0.195, -0.196], w: 0.008, h: 0.004, bones: { tail: 1 } }
    ], {
      sides: 6, ref: tilt, capStart: 0.6, capEnd: 0.6,
      token: ({ centroid }) => (centroid.z < -0.15 ? GREEN : GREY)
    });
  }

  skinSurface(ID, surface, root, rig, bones);
  namedNode(`${ID}_head_pivot`, [0, 0.255, 0.16], motion);
  return { root, clips: duckClips(ID) };
}

function duckClips(ID: string): THREE.AnimationClip[] {
  const M = `${ID}_motion_root`;
  const zero: V3 = [0, 0, 0];

  // Idle: riding the water with a slow bob, looking about.
  const idle = new THREE.AnimationClip("idle", 2.8, [
    posTrack(M, zero, [[0, 0, 0, 0], [1.4, 0, 0.006, 0], [2.8, 0, 0, 0]]),
    rotTrack(M, [[0, 0, 0, 0], [0.7, 1.2, 0, 0.8], [1.4, 0, 0, 0], [2.1, -1.2, 0, -0.8], [2.8, 0, 0, 0]]),
    rotTrack("head", [[0, 0, 0, 0], [0.9, 0, -18, 0], [1.9, 0, 15, 0], [2.8, 0, 0, 0]]),
    rotTrack("tail", [[0, 0, 0, 0], [1.2, 0, 12, 0], [1.5, 0, -10, 0], [1.8, 0, 0, 0], [2.8, 0, 0, 0]])
  ]);

  // Paddle: the feet under the water push in turn, so the body yaws a little each stroke and the
  // neck leans into the swim.
  const paddle = new THREE.AnimationClip("paddle", 1.6, [
    posTrack(M, zero, [[0, 0, 0, 0], [0.4, 0, 0.005, 0], [0.8, 0, 0, 0], [1.2, 0, 0.005, 0], [1.6, 0, 0, 0]]),
    rotTrack(M, [[0, 0, 0, 0], [0.4, 0, 3, 0], [0.8, 0, 0, 0], [1.2, 0, -3, 0], [1.6, 0, 0, 0]]),
    rotTrack("neck", [[0, 8, 0, 0], [0.8, 12, 0, 0], [1.6, 8, 0, 0]]),
    rotTrack("head", [[0, -6, 0, 0], [0.8, -10, 0, 0], [1.6, -6, 0, 0]]),
    rotTrack("tail", [[0, 0, -8, 0], [0.8, 0, 8, 0], [1.6, 0, -8, 0]])
  ]);

  // Dabble: bottoms up. The duck tips forward over its breast until the stern points at the sky and
  // the head is under the water, wiggles its tail, and rights itself.
  const tip = 62;
  const tipped = pivotPitch([0, 0.06, 0.07], tip, [0, 0, 0]);
  const dabble = new THREE.AnimationClip("dabble", 2.2, [
    posTrack(M, zero, [[0, 0, 0, 0], [0.45, ...tipped], [1.75, ...tipped], [2.2, 0, 0, 0]]),
    rotTrack(M, [[0, 0, 0, 0], [0.45, tip, 0, 0], [1.1, tip + 4, 0, 0], [1.75, tip, 0, 0], [2.2, 0, 0, 0]]),
    rotTrack("neck", [[0, 0, 0, 0], [0.45, 30, 0, 0], [1.75, 30, 0, 0], [2.2, 0, 0, 0]]),
    rotTrack("head", [[0, 0, 0, 0], [0.45, 24, 0, 0], [1.75, 24, 0, 0], [2.2, 0, 0, 0]]),
    rotTrack("tail", [[0, 0, 0, 0], [0.6, 0, 18, 0], [0.8, 0, -18, 0], [1.0, 0, 16, 0], [1.2, 0, -16, 0],
      [1.4, 0, 12, 0], [1.6, 0, 0, 0], [2.2, 0, 0, 0]])
  ]);
  return [idle, paddle, dabble];
}
