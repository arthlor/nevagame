import * as THREE from "three";

import {
  SurfaceBuilder, buildBones, creatureScaffold, namedNode, posTrack, rotTrack, skinSurface,
  type AuthoredModel, type BoneSpec, type FaceContext, type GeneratorContext, type Station, type V3
} from "../../kit";

// Catalog palette order: cream fur, dark eyes, pale-pink nose and inner ears, white cotton tail.
const TOKENS = ["canvas_cream_01", "wood_dark_01", "plaster_cream_01", "animal_hide_white_01"] as const;
const FUR = 0;
const DARK = 1;
const PINK = 2;
const WHITE = 3;

/**
 * Meadow rabbit, glTF space: +Y up, nose toward +Z, metres. A faithful port of the Blender rabbit's
 * read (long ears, crouched body, folded hind legs), rebuilt as one continuous rump-to-nose surface
 * with round haunches instead of a chain of tubes, long flat hind feet, cupped ears with pale insides
 * and a white cotton tail. `scale` and `earLength` behave as they did in Blender.
 */
export function createRabbitModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const s = Number(context.parameters.scale ?? 0.55);
  const ear = Number(context.parameters.earLength ?? 1);
  const at = (x: number, y: number, z: number): V3 => [x * s, y * s, z * s];

  const { root, motion, rig } = creatureScaffold(ID);
  const specs: BoneSpec[] = [
    { name: "hips", head: at(0, 0.270, -0.10) },
    { name: "spine", head: at(0, 0.270, -0.10), parent: "hips" },
    { name: "chest", head: at(0, 0.250, 0.06), parent: "spine" },
    { name: "neck", head: at(0, 0.280, 0.15), parent: "chest" },
    { name: "head", head: at(0, 0.330, 0.22), parent: "neck" },
    { name: "ear_left", head: at(-0.048, 0.380, 0.235), parent: "head" },
    { name: "ear_right", head: at(0.048, 0.380, 0.235), parent: "head" },
    { name: "haunch", head: at(0, 0.270, -0.10), parent: "hips" },
    { name: "tail", head: at(0, 0.280, -0.27), parent: "haunch" },
    { name: "foreleg_left", head: at(-0.06, 0.220, 0.10), parent: "chest" },
    { name: "foreleg_right", head: at(0.06, 0.220, 0.10), parent: "chest" },
    { name: "hindleg_left", head: at(-0.085, 0.230, -0.12), parent: "haunch" },
    { name: "hock_left", head: at(-0.100, 0.070, -0.19), parent: "hindleg_left" },
    { name: "hindleg_right", head: at(0.085, 0.230, -0.12), parent: "haunch" },
    { name: "hock_right", head: at(0.100, 0.070, -0.19), parent: "hindleg_right" }
  ];
  const bones = buildBones(specs, rig);
  const surface = new SurfaceBuilder(TOKENS);

  // Rump to nose: round haunches, a low belly, the chest, the neck rising into a round head.
  const body: Station[] = [
    { p: at(0, 0.220, -0.27), w: 0.050 * s, h: 0.045 * s, hb: 0.050 * s, bones: { haunch: 1 } },
    { p: at(0, 0.250, -0.20), w: 0.120 * s, h: 0.110 * s, hb: 0.130 * s, bones: { haunch: 1 } },
    { p: at(0, 0.280, -0.12), w: 0.140 * s, h: 0.130 * s, hb: 0.150 * s, bones: { haunch: 1 } },
    { p: at(0, 0.270, -0.02), w: 0.120 * s, h: 0.110 * s, hb: 0.120 * s, bones: { haunch: 0.4, spine: 0.6 } },
    { p: at(0, 0.250, 0.08), w: 0.100 * s, h: 0.095 * s, hb: 0.100 * s, bones: { chest: 1 } },
    { p: at(0, 0.280, 0.15), w: 0.080 * s, h: 0.075 * s, hb: 0.075 * s, bones: { chest: 0.5, neck: 0.5 } },
    { p: at(0, 0.320, 0.20), w: 0.085 * s, h: 0.080 * s, hb: 0.075 * s, bones: { neck: 0.3, head: 0.7 } },
    { p: at(0, 0.335, 0.26), w: 0.090 * s, h: 0.082 * s, hb: 0.078 * s, bones: { head: 1 } },
    { p: at(0, 0.315, 0.33), w: 0.065 * s, h: 0.060 * s, hb: 0.055 * s, bones: { head: 1 } },
    { p: at(0, 0.290, 0.385), w: 0.038 * s, h: 0.035 * s, hb: 0.032 * s, bones: { head: 1 } },
    { p: at(0, 0.280, 0.41), w: 0.020 * s, h: 0.018 * s, hb: 0.016 * s, bones: { head: 1 } }
  ];
  surface.addLoft(body, {
    sides: 12, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.6,
    token: ({ u }: FaceContext) => (u > 9.4 ? PINK : FUR)
  });
  surface.addEllipsoid(at(0, 0.290, -0.30), [0.05 * s, 0.05 * s, 0.045 * s], { bones: { tail: 1 }, token: WHITE });

  for (const [side, sx] of [["left", -1], ["right", 1]] as const) {
    // Ears: tall cupped paddles, pale inside, leaning back a little and flaring out.
    const earBone = `ear_${side}`;
    const earTop = 0.38 + 0.33 * ear;
    surface.addLoft([
      { p: at(sx * 0.048, 0.380, 0.235), w: 0.030 * s, h: 0.014 * s, bones: { head: 0.3, [earBone]: 0.7 } },
      { p: at(sx * 0.058, 0.380 + 0.11 * ear, 0.222), w: 0.040 * s, h: 0.013 * s, bones: { [earBone]: 1 } },
      { p: at(sx * 0.068, 0.380 + 0.24 * ear, 0.205), w: 0.036 * s, h: 0.011 * s, bones: { [earBone]: 1 } },
      { p: at(sx * 0.076, earTop, 0.19), w: 0.010 * s, h: 0.006 * s, bones: { [earBone]: 1 } }
    ], {
      sides: 6, ref: [0, 0, 1], capEnd: 0.5,
      token: ({ u, normal }: FaceContext) => (u > 0.4 && u < 2.4 && normal.z > 0.45 ? PINK : FUR)
    });
    surface.addEllipsoid(at(sx * 0.068, 0.342, 0.272), [0.018 * s, 0.02 * s, 0.018 * s], { bones: { head: 1 }, token: DARK });

    // Forelegs: short and slim under the chest, small paws.
    const fore = `foreleg_${side}`;
    surface.addLoft([
      { p: at(sx * 0.055, 0.22, 0.10), w: 0.040 * s, h: 0.050 * s, bones: { chest: 0.4, [fore]: 0.6 } },
      { p: at(sx * 0.065, 0.12, 0.11), w: 0.030 * s, h: 0.034 * s, bones: { [fore]: 1 } },
      { p: at(sx * 0.065, 0.035, 0.125), w: 0.026 * s, h: 0.028 * s, bones: { [fore]: 1 } }
    ], { sides: 7, ref: [0, 0, 1], token: FUR });
    surface.addLoft([
      { p: at(sx * 0.065, 0.02, 0.11), w: 0.026 * s, h: 0.020 * s, bones: { [fore]: 1 } },
      { p: at(sx * 0.065, 0.016, 0.16), w: 0.022 * s, h: 0.014 * s, bones: { [fore]: 1 } }
    ], { sides: 6, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.7, token: FUR });

    // Hind legs: a broad thigh folded under the haunch, the hock tucked behind, and the long flat
    // foot lying forward on the ground. That fold is what makes a sitting rabbit read as crouched.
    const thigh = `hindleg_${side}`;
    const hock = `hock_${side}`;
    surface.addLoft([
      { p: at(sx * 0.080, 0.25, -0.12), w: 0.055 * s, h: 0.090 * s, bones: { haunch: 0.4, [thigh]: 0.6 } },
      { p: at(sx * 0.100, 0.15, -0.09), w: 0.062 * s, h: 0.085 * s, bones: { [thigh]: 1 } },
      { p: at(sx * 0.100, 0.07, -0.19), w: 0.036 * s, h: 0.040 * s, bones: { [thigh]: 0.4, [hock]: 0.6 } },
      { p: at(sx * 0.098, 0.035, -0.22), w: 0.028 * s, h: 0.028 * s, bones: { [hock]: 1 } }
    ], { sides: 7, ref: [0, 0, 1], token: FUR });
    surface.addLoft([
      { p: at(sx * 0.098, 0.022, -0.23), w: 0.028 * s, h: 0.020 * s, bones: { [hock]: 1 } },
      { p: at(sx * 0.098, 0.020, -0.10), w: 0.030 * s, h: 0.018 * s, bones: { [hock]: 1 } },
      { p: at(sx * 0.098, 0.016, -0.02), w: 0.024 * s, h: 0.012 * s, bones: { [hock]: 1 } }
    ], { sides: 6, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.7, token: FUR });
  }

  skinSurface(ID, surface, root, rig, bones);
  namedNode(`${ID}_head_pivot`, at(0, 0.25, 0.16), motion);
  return { root, clips: rabbitClips(ID, s) };
}

function rabbitClips(ID: string, s: number): THREE.AnimationClip[] {
  const M = `${ID}_motion_root`;
  const zero: V3 = [0, 0, 0];

  // Idle: breathing, a twitching nose and one ear swivelling.
  const idle = new THREE.AnimationClip("idle", 1.4, [
    posTrack(M, zero, [[0, 0, 0, 0], [0.7, 0, 0.006 * s, 0], [1.4, 0, 0, 0]]),
    rotTrack(M, [[0, 0, 0, 0], [0.7, -2, 0, 0], [1.4, 0, 0, 0]]),
    rotTrack("head", [[0, 0, 0, 0], [0.2, 3, 0, 0], [0.3, 0, 0, 0], [0.5, 3, 0, 0], [0.6, 0, 0, 0], [1.4, 0, 0, 0]]),
    rotTrack("ear_left", [[0, 0, 0, 0], [0.7, -6, 0, -8], [1.4, 0, 0, 0]]),
    rotTrack("ear_right", [[0, 0, 0, 0], [0.9, 4, -18, 0], [1.4, 0, 0, 0]])
  ]);
  // Look: the head turns one way and the other, the neck following, ears pricked up.
  const look = new THREE.AnimationClip("look", 1.2, [
    rotTrack("head", [[0, 0, 0, 0], [0.4, -6, -20, 0], [0.8, -4, 18, 0], [1.2, 0, 0, 0]]),
    rotTrack("neck", [[0, 0, 0, 0], [0.4, -4, -8, 0], [0.8, -4, 7, 0], [1.2, 0, 0, 0]]),
    rotTrack("ear_left", [[0, 0, 0, 0], [0.4, -8, 0, 6], [1.2, 0, 0, 0]]),
    rotTrack("ear_right", [[0, 0, 0, 0], [0.4, -8, 0, -6], [1.2, 0, 0, 0]])
  ]);
  // Hop: load the haunches, push off with the hind feet, reach and land on the forepaws.
  const hop = new THREE.AnimationClip("hop", 0.48, [
    posTrack(M, zero, [[0, 0, 0, 0], [0.08, 0, -0.012 * s, 0], [0.2, 0, 0.07 * s, 0.03 * s], [0.32, 0, 0.09 * s, 0.05 * s],
      [0.42, 0, 0.01 * s, 0.01 * s], [0.48, 0, 0, 0]]),
    rotTrack(M, [[0, 0, 0, 0], [0.08, 4, 0, 0], [0.2, -12, 0, 0], [0.32, 8, 0, 0], [0.42, 3, 0, 0], [0.48, 0, 0, 0]]),
    ...(["left", "right"] as const).flatMap((side) => [
      rotTrack(`hindleg_${side}`, [[0, 0, 0, 0], [0.08, -8, 0, 0], [0.2, 30, 0, 0], [0.32, -18, 0, 0], [0.42, -6, 0, 0], [0.48, 0, 0, 0]]),
      rotTrack(`hock_${side}`, [[0, 0, 0, 0], [0.08, -6, 0, 0], [0.2, 42, 0, 0], [0.32, -8, 0, 0], [0.42, 0, 0, 0], [0.48, 0, 0, 0]]),
      rotTrack(`foreleg_${side}`, [[0, 0, 0, 0], [0.08, 6, 0, 0], [0.2, 14, 0, 0], [0.32, -30, 0, 0], [0.42, 8, 0, 0], [0.48, 0, 0, 0]])
    ]),
    rotTrack("spine", [[0, 0, 0, 0], [0.08, 6, 0, 0], [0.2, -8, 0, 0], [0.32, 6, 0, 0], [0.48, 0, 0, 0]]),
    rotTrack("ear_left", [[0, 0, 0, 0], [0.2, -16, 0, 0], [0.32, 10, 0, 0], [0.48, 0, 0, 0]]),
    rotTrack("ear_right", [[0, 0, 0, 0], [0.2, -16, 0, 0], [0.32, 10, 0, 0], [0.48, 0, 0, 0]])
  ]);
  return [idle, look, hop];
}
