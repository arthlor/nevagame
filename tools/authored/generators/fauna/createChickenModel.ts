import * as THREE from "three";

import {
  SurfaceBuilder, buildBones, creatureScaffold, namedNode, posTrack, rotTrack, skinSurface,
  type AuthoredModel, type BoneSpec, type GeneratorContext, type Station, type V3
} from "../../kit";

// Catalog palette order: feathers, dark tail and eyes, red comb and wattle, ochre beak and legs.
const TOKENS = ["canvas_cream_01", "wood_dark_01", "accent_red_01", "accent_ochre_01"] as const;
const FEATHER = 0;
const DARK = 1;
const COMB = 2;
const OCHRE = 3;

/**
 * Farm hen, glTF space: +Y up, beak toward +Z, metres. A faithful port of the Blender hen, which
 * already read well: an upright pear of a body lofted bottom to top with the neck and head leaning
 * forward, a dark fanned tail, flank wings, a red comb and wattle, and thin ochre legs.
 *
 * The runtime turns `<id>_wing_left_pivot` / `_right_pivot` itself (flutter and wind lean), so the
 * wings are rigid meshes parented to those pivots. The body is skinned, so the clips bend the neck.
 */
export function createChickenModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const s = Number(context.parameters.scale ?? 0.65);
  const comb = Number(context.parameters.combScale ?? 1);
  const at = (x: number, y: number, z: number): V3 => [x * s, y * s, z * s];

  const { root, motion, rig } = creatureScaffold(ID);
  const bones = buildBones([
    { name: "body", head: at(0, 0.30, -0.02) },
    { name: "neck", head: at(0, 0.52, 0.12), parent: "body" },
    { name: "head", head: at(0, 0.62, 0.20), parent: "neck" }
  ] satisfies BoneSpec[], rig);
  const surface = new SurfaceBuilder(TOKENS);

  // The body rises bottom to top: a small keel, the full breast, the neck pinch, the head.
  const body: Station[] = [
    { p: at(0, 0.19, -0.05), w: 0.12 * s, h: 0.15 * s, hb: 0.19 * s, bones: { body: 1 } },
    { p: at(0, 0.30, -0.03), w: 0.25 * s, h: 0.30 * s, hb: 0.34 * s, bones: { body: 1 } },
    { p: at(0, 0.43, -0.02), w: 0.28 * s, h: 0.34 * s, hb: 0.38 * s, bones: { body: 1 } },
    { p: at(0, 0.54, 0.10), w: 0.19 * s, h: 0.22 * s, hb: 0.24 * s, bones: { body: 0.5, neck: 0.5 } },
    { p: at(0, 0.60, 0.20), w: 0.085 * s, h: 0.09 * s, hb: 0.10 * s, bones: { neck: 1 } },
    { p: at(0, 0.72, 0.26), w: 0.11 * s, h: 0.12 * s, hb: 0.13 * s, bones: { head: 1 } },
    { p: at(0, 0.80, 0.26), w: 0.065 * s, h: 0.07 * s, hb: 0.08 * s, bones: { head: 1 } }
  ];
  surface.addLoft(body, { sides: 12, ref: [0, 0, 1], capStart: 0.5, capEnd: 0.6, token: FEATHER });

  // Head details, all on the head bone.
  surface.addLoft([
    { p: at(0, 0.705, 0.335), w: 0.035 * s, h: 0.022 * s, bones: { head: 1 } },
    { p: at(0, 0.698, 0.385), w: 0.018 * s, h: 0.012 * s, bones: { head: 1 } },
    { p: at(0, 0.690, 0.425), w: 0.004 * s, h: 0.003 * s, bones: { head: 1 } }
  ], { sides: 5, ref: [0, 1, 0], capStart: 0, capEnd: 0.5, token: OCHRE });
  for (const sx of [-1, 1]) {
    surface.addEllipsoid(at(sx * 0.08, 0.74, 0.30), [0.02 * s, 0.02 * s, 0.018 * s], { bones: { head: 1 }, token: DARK });
  }
  // The comb runs back along the crown from above the eyes.
  for (const [index, z] of [0.24, 0.20, 0.16].entries()) {
    const lift = index === 1 ? 0.03 : 0;
    surface.addEllipsoid(at(0, 0.82 + lift, z), [0.018 * s, 0.052 * s * comb, 0.035 * s], { bones: { head: 1 }, token: COMB });
  }
  surface.addLoft([
    { p: at(0, 0.652, 0.315), w: 0.005 * s, h: 0.010 * s, bones: { head: 1 } },
    { p: at(0, 0.625, 0.325), w: 0.012 * s, h: 0.022 * s, bones: { head: 1 } },
    { p: at(0, 0.595, 0.332), w: 0.016 * s, h: 0.029 * s, bones: { head: 1 } },
    { p: at(0, 0.575, 0.325), w: 0.006 * s, h: 0.012 * s, bones: { head: 1 } }
  ], { sides: 8, ref: [0, 0, 1], capStart: 0.6, capEnd: 0.6, token: COMB });

  // Tail: a fan of three feathers rising up and back, the front one cream, the rest dark.
  [28, 42, 55].forEach((pitch, index) => {
    const base = at(0, 0.46 + index * 0.06, -(0.24 + index * 0.04));
    const angle = THREE.MathUtils.degToRad(pitch);
    const length = 0.24 * s;
    const tip: V3 = [base[0] + (index - 1) * 0.02 * s, base[1] + Math.cos(angle) * length * 0.8, base[2] - Math.sin(angle) * length];
    const mid: V3 = [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2 + 0.01 * s, (base[2] + tip[2]) / 2];
    const width = (0.12 - index * 0.02) * s;
    surface.addLoft([
      { p: base, w: width * 0.55, h: 0.02 * s, bones: { body: 1 } },
      { p: mid, w: width * 0.5, h: 0.018 * s, bones: { body: 1 } },
      { p: tip, w: width * 0.2, h: 0.012 * s, bones: { body: 1 } }
    ], { sides: 6, ref: [1, 0, 0], capEnd: 0.6, token: index ? DARK : FEATHER });
  });

  // Legs: thin ochre shanks, three toes forward and one back.
  for (const sx of [-1, 1]) {
    surface.addLoft([
      { p: at(sx * 0.09, 0.22, -0.02), w: 0.022 * s, h: 0.022 * s, bones: { body: 1 } },
      { p: at(sx * 0.09, 0.10, -0.02), w: 0.016 * s, h: 0.016 * s, bones: { body: 1 } },
      { p: at(sx * 0.09, 0.03, 0.0), w: 0.016 * s, h: 0.016 * s, bones: { body: 1 } }
    ], { sides: 5, ref: [0, 0, 1], token: OCHRE });
    for (const spread of [-0.35, 0, 0.35, Math.PI]) {
      const length = spread === Math.PI ? 0.06 * s : 0.10 * s;
      const start = at(sx * 0.09, 0.015, 0.0);
      const end: V3 = [start[0] + Math.sin(spread) * length, 0.012 * s, start[2] + Math.cos(spread) * length];
      surface.addLoft([
        { p: start, w: 0.012 * s, h: 0.009 * s, bones: { body: 1 } },
        { p: end, w: 0.007 * s, h: 0.006 * s, bones: { body: 1 } }
      ], { sides: 4, ref: [0, 1, 0], capStart: 0.3, capEnd: 0.5, token: OCHRE });
    }
  }
  skinSurface(ID, surface, root, rig, bones);

  namedNode(`${ID}_head_pivot`, at(0, 0.54, 0.18), motion);
  // Wings: rigid feathered paddles lying along the flanks, one per runtime-driven pivot.
  for (const [side, sx] of [["left", -1], ["right", 1]] as const) {
    const pivotAt = at(sx * 0.15, 0.38, -0.02);
    const pivot = namedNode(`${ID}_wing_${side}_pivot`, pivotAt, motion);
    const wing = new SurfaceBuilder(TOKENS);
    wing.addLoft([
      { p: at(sx * 0.225, 0.44, 0.10), w: 0.05 * s, h: 0.02 * s },
      { p: at(sx * 0.255, 0.42, -0.02), w: 0.11 * s, h: 0.03 * s },
      { p: at(sx * 0.255, 0.36, -0.16), w: 0.09 * s, h: 0.026 * s },
      { p: at(sx * 0.24, 0.32, -0.25), w: 0.03 * s, h: 0.012 * s }
    ], { sides: 6, ref: [sx, 0, 0], capStart: 0.5, capEnd: 0.6, token: ({ centroid }) => (centroid.z < -0.17 * s ? DARK : FEATHER) });
    const mesh = wing.buildMesh(`${ID}_wing_${side}`);
    mesh.position.set(-pivotAt[0], -pivotAt[1], -pivotAt[2]);
    pivot.add(mesh);
  }
  return { root, clips: chickenClips(ID, s) };
}

function chickenClips(ID: string, s: number): THREE.AnimationClip[] {
  const M = `${ID}_motion_root`;
  const zero: V3 = [0, 0, 0];
  const idle = new THREE.AnimationClip("idle", 1.2, [
    posTrack(M, zero, [[0, 0, 0, 0], [0.6, 0, 0.008 * s, 0], [1.2, 0, 0, 0]]),
    rotTrack(M, [[0, 0, 0, 0], [0.6, 1.5, 0, 0], [1.2, 0, 0, 0]]),
    rotTrack("head", [[0, 0, 0, 0], [0.4, 0, 10, 0], [0.8, 0, -8, 0], [1.2, 0, 0, 0]])
  ]);
  // Two quick pecks: the neck pitches the head down to the ground and snaps back up.
  const peck = new THREE.AnimationClip("peck", 0.8, [
    rotTrack("neck", [[0, 0, 0, 0], [0.16, 48, 0, 0], [0.32, 14, 0, 0], [0.48, 52, 0, 0], [0.64, 10, 0, 0], [0.8, 0, 0, 0]]),
    rotTrack("head", [[0, 0, 0, 0], [0.16, 22, 0, 0], [0.32, 6, 0, 0], [0.48, 24, 0, 0], [0.64, 4, 0, 0], [0.8, 0, 0, 0]])
  ]);
  const look = new THREE.AnimationClip("look", 1.4, [
    rotTrack("head", [[0, 0, 0, 0], [0.35, -7, -22, 0], [0.7, -4, 19, 0], [1.05, -7, -14, 0], [1.4, 0, 0, 0]]),
    rotTrack("neck", [[0, 0, 0, 0], [0.35, -6, 0, 0], [1.05, -6, 0, 0], [1.4, 0, 0, 0]])
  ]);
  return [idle, peck, look];
}
