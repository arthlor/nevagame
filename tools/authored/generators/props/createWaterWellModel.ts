import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { rope, timber, v3 } from "./parts";

// Catalog palette order: stone, timber, roof planks, iron, water.
const TOKENS = ["stone_warm_01", "wood_dark_01", "roof_terracotta_01", "metal_dark_01", "water_shallow_01"] as const;
const STONE = 0;
const WOOD = 1;
const ROOF = 2;
const IRON = 3;
const WATER = 4;

/**
 * Village well, glTF space: +Y up, ground-centred, the windlass along X, metres.
 *
 * Redesigned from the Blender well: the drum is laid stone by stone in staggered courses with a
 * capstone coping, dark inside down to the water; two square-hewn posts on knee braces carry a log
 * windlass wound with rope and turned by an iron crank; the rope drops to a staved, hooped bucket
 * over the opening; the gable roof is rows of overlapping planks under a ridge board, with barge
 * boards at the gable ends; a few loose stones settle the base.
 */
export function createWaterWellModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);
  const radius = Number(p.radius ?? 0.95) * 0.86;
  const postHeight = Number(p.postHeight ?? 1.42);

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);

  // Stone drum: staggered courses of individual stones.
  const courses = 4;
  const courseH = 0.2;
  const wall = 0.2;
  for (let c = 0; c < courses; c += 1) {
    const count = 11;
    const offset = (c % 2) * 0.5;
    for (let k = 0; k < count; k += 1) {
      const a0 = ((k + offset) / count) * Math.PI * 2 + 0.012;
      const a1 = ((k + 1 + offset) / count) * Math.PI * 2 - 0.012;
      const y = c * courseH + courseH / 2;
      const bulge = 1 + (random() - 0.5) * 0.04;
      const arc: Station[] = [0, 0.5, 1].map((t) => {
        const a = THREE.MathUtils.lerp(a0, a1, t);
        const r = radius - wall / 2 + (t === 0.5 ? 0.01 : 0);
        return { p: [Math.cos(a) * r, y, Math.sin(a) * r], w: (wall / 2) * bulge, h: courseH / 2 - 0.008, n: 3 };
      });
      surface.addLoft(arc, { sides: 8, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: STONE, shade: 0.84 + random() * 0.18 });
    }
  }
  // Capstone coping, overhanging both faces.
  const copeY = courses * courseH + 0.05;
  for (let k = 0; k < 9; k += 1) {
    const a0 = (k / 9) * Math.PI * 2 + 0.01;
    const a1 = ((k + 1) / 9) * Math.PI * 2 - 0.01;
    const arc: Station[] = [0, 0.5, 1].map((t) => {
      const a = THREE.MathUtils.lerp(a0, a1, t);
      return { p: [Math.cos(a) * (radius - wall / 2), copeY, Math.sin(a) * (radius - wall / 2)], w: wall * 0.68, h: 0.05, n: 4 };
    });
    surface.addLoft(arc, { sides: 8, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: STONE, shade: 0.94 + random() * 0.1 });
  }
  // Dark shaft lining and the water below.
  surface.addPanel({
    cols: 16, rows: 1, thickness: 0.02,
    point: (u, v) => new THREE.Vector3(Math.cos(u * Math.PI * 2) * (radius - wall), THREE.MathUtils.lerp(0.25, copeY, v), Math.sin(u * Math.PI * 2) * (radius - wall)),
    token: () => STONE, shade: () => 0.72
  });
  surface.addDisc([0, 0.32, 0], [0, 1, 0], radius - wall, { token: WATER, sides: 16, shade: 0.9 });

  // Posts on knee braces, and the windlass.
  const postX = radius - wall / 2;
  const top = copeY + postHeight;
  for (const side of [-1, 1]) {
    timber(surface, [side * postX, copeY - 0.2, 0], [side * postX, top, 0], [0.09, 0.09], WOOD, { ref: [0, 0, 1], bevel: 0.022, shade: 0.95 });
    for (const z of [-1, 1]) {
      timber(surface, [side * postX, copeY + 0.05, z * 0.36], [side * postX, copeY + 0.55, z * 0.06], [0.04, 0.04], WOOD, { bevel: 0.01 });
    }
  }
  timber(surface, [-postX - 0.14, top - 0.05, 0], [postX + 0.14, top - 0.05, 0], [0.08, 0.07], WOOD, { ref: [0, 1, 0], bevel: 0.016 });
  const axleY = copeY + postHeight * 0.52;
  surface.addLoft([
    { p: [-postX - 0.1, axleY, 0], w: 0.07, h: 0.07 },
    { p: [postX + 0.1, axleY, 0], w: 0.07, h: 0.07 }
  ], { sides: 8, ref: [0, 1, 0], capStart: 0.1, capEnd: 0.1, token: WOOD, shade: 0.9 });
  // Rope wound round the drum of the windlass.
  const turns = 5;
  rope(surface, Array.from({ length: turns * 8 + 1 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return new THREE.Vector3(-0.2 + (0.4 * i) / (turns * 8), axleY + Math.sin(a) * 0.088, Math.cos(a) * 0.088);
  }), 0.018, WOOD, { sides: 4, shade: 1.04, caps: false });
  // Crank on the right post.
  rope(surface, [[postX + 0.1, axleY, 0], [postX + 0.16, axleY, 0], [postX + 0.16, axleY - 0.22, 0], [postX + 0.3, axleY - 0.22, 0]], 0.018, IRON, { sides: 6 });
  rope(surface, [[postX + 0.3, axleY - 0.22, 0], [postX + 0.42, axleY - 0.22, 0]], 0.026, WOOD, { sides: 6 });

  // Rope down to a staved, hooped bucket over the opening.
  const bucketY = copeY + 0.1;
  rope(surface, [[0, axleY - 0.08, 0.05], [0, bucketY + 0.3, 0.05]], 0.012, WOOD, { sides: 4, shade: 1.04 });
  const bucket: Station[] = [[0, 0.1], [0.02, 0.105], [0.22, 0.125], [0.24, 0.128]].map(([y, r]) => ({ p: [0, bucketY + y, 0.05], w: r, h: r }));
  surface.addLoft(bucket, {
    sides: 10, ref: [0, 0, 1], capStart: 0, token: ({ centroid }) => (Math.abs(centroid.y - bucketY - 0.06) < 0.02 || centroid.y > bucketY + 0.2 ? IRON : WOOD),
    shade: ({ theta }) => 0.88 + 0.12 * Math.abs(Math.sin(theta * 5))
  });
  surface.addDisc([0, bucketY + 0.2, 0.05], [0, 1, 0], 0.115, { token: WATER, sides: 10 });
  rope(surface, Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI;
    return new THREE.Vector3(Math.cos(a) * 0.13, bucketY + 0.24 + Math.sin(a) * 0.08, 0.05);
  }), 0.007, IRON, { sides: 4 });

  // Gable roof of overlapping plank courses, a ridge board and barge boards.
  const eave = radius + 0.18;
  const depth = radius * 1.95;
  const pitch = THREE.MathUtils.degToRad(35);
  const ridgeY = top + Math.tan(pitch) * eave;
  const slope = eave / Math.cos(pitch);
  const rows = 5;
  for (const side of [-1, 1]) {
    const down = new THREE.Vector3(side * Math.cos(pitch), -Math.sin(pitch), 0);
    const normal = new THREE.Vector3(side * Math.sin(pitch), Math.cos(pitch), 0);
    for (let r = 0; r < rows; r += 1) {
      const along = (slope * (r + 0.5)) / rows + 0.04;
      const centre = new THREE.Vector3(0, ridgeY, 0).addScaledVector(down, along).addScaledVector(normal, 0.03 + (rows - r) * 0.012);
      const tilt = normal.clone().addScaledVector(down, -0.12).normalize();
      timber(surface, centre.clone().setZ(-depth / 2), centre.clone().setZ(depth / 2), [slope / rows / 2 + 0.03, 0.022], ROOF,
        { ref: [tilt.x, tilt.y, tilt.z], shade: 0.86 + random() * 0.16, bevel: 0.01 });
    }
    // Barge boards at both gable ends.
    for (const z of [-1, 1]) {
      const from = new THREE.Vector3(0, ridgeY + 0.03, z * (depth / 2 + 0.03));
      timber(surface, from, from.clone().addScaledVector(down, slope + 0.1), [0.02, 0.07], WOOD, { ref: v3(normal), bevel: 0.008 });
    }
    // Rafters from the crossbeam to the ridge.
    timber(surface, [side * (postX + 0.1), top, 0], [0, ridgeY - 0.04, 0], [0.04, 0.05], WOOD, { bevel: 0.01 });
  }
  timber(surface, [0, ridgeY + 0.07, -depth / 2 - 0.06], [0, ridgeY + 0.07, depth / 2 + 0.06], [0.07, 0.05], WOOD, { ref: [0, 1, 0], bevel: 0.015 });

  // Loose stones settling the base.
  for (let k = 0; k < 6; k += 1) {
    const a = k * 1.1 + random();
    const r = radius + 0.12 + random() * 0.12;
    const s = 0.05 + random() * 0.05;
    surface.addEllipsoid([Math.cos(a) * r, s * 0.4, Math.sin(a) * r], [s * 1.3, s, s * 1.1], { token: STONE, sides: 6, shade: 0.85 + random() * 0.15 });
  }

  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
