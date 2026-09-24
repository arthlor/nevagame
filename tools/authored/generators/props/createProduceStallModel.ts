import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext } from "../../kit";
import { crate, fruit, rope, sack, timber } from "./parts";

// Catalog palette order: honey boards, dark posts, cream canvas, red and ochre (stripes and produce).
const TOKENS = ["wood_honey_01", "wood_dark_01", "canvas_cream_01", "accent_red_01", "accent_ochre_01"] as const;
const HONEY = 0;
const DARK = 1;
const CANVAS = 2;
const RED = 3;
const OCHRE = 4;

/**
 * Produce stall, glTF space: +Y up, ground-centred, the counter facing +Z, metres. Builds both the
 * dock produce stall and the plaza market stall; `ladder` and `sign` switch the dock stall's extras.
 *
 * Redesigned from the Blender stall: four chunky posts on knee braces carry eave beams and a ridge
 * pole; the gabled canopy is striped canvas that sags between its rafters and ends in a scalloped,
 * striped valance; the counter is a planked box with an overhanging top and a shelf behind, loaded
 * with slatted crates heaped with red apples and ochre gourds; sacks sit at its foot. The dock stall
 * adds a ladder against its side and a painted hanging sign.
 */
export function createProduceStallModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);
  const width = Number(p.width ?? 3.1);
  const depth = Number(p.depth ?? 1.8);
  const roofHeight = Number(p.roofHeight ?? 2.65);
  const withLadder = p.ladder === true;
  const withSign = p.sign === true;

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);
  const px = width / 2 - 0.1;
  const pz = depth / 2 - 0.1;
  const eave = roofHeight * 0.74;
  const post = 0.075;

  // Posts, eave beams, knee braces, king posts and the ridge.
  for (const [x, z] of [[-px, -pz], [px, -pz], [-px, pz], [px, pz]] as const) {
    timber(surface, [x, 0, z], [x, eave, z], [post, post], DARK, { ref: [0, 0, 1], bevel: 0.018 });
    timber(surface, [x, eave - 0.45, z], [x - Math.sign(x) * 0.35, eave - 0.06, z], [0.035, 0.035], DARK, { bevel: 0.008 });
  }
  for (const z of [-pz, pz]) {
    timber(surface, [-px - 0.2, eave, z], [px + 0.2, eave, z], [0.06, 0.07], DARK, { ref: [0, 1, 0], bevel: 0.014 });
  }
  for (const x of [-px, px]) {
    timber(surface, [x, eave, -pz - 0.1], [x, eave, pz + 0.1], [0.05, 0.06], DARK, { ref: [0, 1, 0], bevel: 0.012 });
    timber(surface, [x, eave, 0], [x, roofHeight, 0], [0.05, 0.05], DARK, { ref: [0, 0, 1], bevel: 0.012 });
  }
  timber(surface, [-px - 0.25, roofHeight, 0], [px + 0.25, roofHeight, 0], [0.05, 0.05], DARK, { ref: [0, 1, 0], bevel: 0.012 });

  // Striped canvas canopy, sagging between rafters, with a scalloped valance.
  const overhang = 0.22;
  const stripes = Math.max(6, Math.round(width / 0.32));
  const bays = 3;
  const canvasWidth = width + 0.5;
  for (const side of [-1, 1]) {
    const eaveZ = side * (pz + overhang);
    const eaveY = eave + 0.02 - overhang * 0.35;
    const slope = (u: number, v: number): THREE.Vector3 => {
      const sag = 0.07 * Math.sin(Math.PI * v) * (0.4 + 0.6 * Math.abs(Math.sin(Math.PI * u * bays)));
      return new THREE.Vector3((u - 0.5) * canvasWidth, THREE.MathUtils.lerp(roofHeight + 0.06, eaveY, v) - sag, THREE.MathUtils.lerp(0, eaveZ, v));
    };
    surface.addPanel({
      cols: stripes * 2, rows: 4, thickness: 0.012, point: slope,
      token: (u) => (Math.floor(u * stripes) % 2 ? RED : CANVAS),
      tone: (_, v) => 0.92 + 0.08 * v
    });
    // Valance: hangs from the eave edge, each stripe ending in a rounded scallop.
    surface.addPanel({
      cols: stripes * 4, rows: 2, thickness: 0.01,
      point: (u, v) => {
        const lip = slope(u, 1);
        const scallop = 0.06 * Math.sin(Math.PI * ((u * stripes) % 1));
        return lip.add(new THREE.Vector3(0, -v * (0.14 + scallop), side * 0.01 * v));
      },
      token: (u) => (Math.floor(u * stripes) % 2 ? RED : CANVAS),
      shade: () => 0.94
    });
  }

  // Counter: a planked box with an overhanging top, and a shelf behind.
  const counterY = 0.92;
  const cz = -pz + 0.05;
  const counterW = width - 0.34;
  const boards = Math.round(counterW / 0.18);
  for (let b = 0; b < boards; b += 1) {
    const x = -counterW / 2 + (counterW / boards) * (b + 0.5);
    timber(surface, [x, 0.02, cz], [x, counterY - 0.06, cz], [counterW / boards / 2 - 0.006, 0.02], HONEY,
      { ref: [0, 0, 1], shade: 0.84 + random() * 0.18, bevel: 0.006 });
  }
  timber(surface, [-counterW / 2 - 0.06, counterY - 0.03, cz + 0.12], [counterW / 2 + 0.06, counterY - 0.03, cz + 0.12], [0.24, 0.035], HONEY,
    { ref: [0, 1, 0], bevel: 0.012 });
  timber(surface, [-counterW / 2, 0.3, cz + 0.2], [counterW / 2, 0.3, cz + 0.2], [0.18, 0.02], DARK, { ref: [0, 1, 0] });
  timber(surface, [-counterW / 2, counterY - 0.25, cz - 0.03], [counterW / 2, counterY - 0.25, cz - 0.03], [0.02, 0.04], DARK, { ref: [0, 1, 0] });

  // Crates heaped with produce along the counter.
  const crates = Math.max(2, Math.round(counterW / 0.62));
  for (let c = 0; c < crates; c += 1) {
    const x = -counterW / 2 + (counterW / crates) * (c + 0.5);
    crate(surface, [x, counterY, cz + 0.12], [counterW / crates - 0.08, 0.34, 0.2], HONEY, DARK, {
      random, yaw: (random() - 0.5) * 0.12,
      fill: { tokens: c % 2 ? [OCHRE] : [RED, RED, OCHRE], radius: 0.055, stem: DARK }
    });
  }
  // Loose produce and sacks.
  for (let k = 0; k < 4; k += 1) {
    fruit(surface, [-counterW / 2 + 0.1 + random() * counterW, counterY + 0.05, cz + 0.28], 0.05, k % 2 ? RED : OCHRE, { stem: DARK });
  }
  sack(surface, [px - 0.15, 0, -pz - 0.35], [0.36, 0.3, 0.46], CANVAS, DARK, { seed: 7, yaw: 0.4, lean: 0.08 });
  sack(surface, [px - 0.5, 0, -pz - 0.4], [0.32, 0.28, 0.4], CANVAS, DARK, { seed: 8, yaw: -0.3, neck: false });

  if (withLadder) {
    // Ladder leaning against the left side.
    const foot = new THREE.Vector3(-px - 0.45, 0, 0.1);
    const head = new THREE.Vector3(-px - 0.08, eave + 0.1, 0.1);
    for (const dz of [-0.2, 0.2]) {
      timber(surface, foot.clone().add(new THREE.Vector3(0, 0, dz)), head.clone().add(new THREE.Vector3(0, 0, dz)), [0.03, 0.04], HONEY, { bevel: 0.008 });
    }
    for (let r = 1; r < 7; r += 1) {
      const at = foot.clone().lerp(head, r / 7);
      rope(surface, [at.clone().add(new THREE.Vector3(0, 0, -0.2)), at.clone().add(new THREE.Vector3(0, 0, 0.2))], 0.02, DARK, { sides: 5 });
    }
  }
  if (withSign) {
    // Hanging sign from the front eave beam: a board painted with an apple.
    const sx = px - 0.45;
    const sy = eave - 0.42;
    for (const dx of [-0.2, 0.2]) {
      rope(surface, [[sx + dx, eave - 0.06, -pz - 0.02], [sx + dx, sy + 0.14, -pz - 0.02]], 0.008, DARK, { sides: 4 });
    }
    timber(surface, [sx - 0.3, sy, -pz - 0.02], [sx + 0.3, sy, -pz - 0.02], [0.02, 0.14], HONEY, { ref: [0, 1, 0], bevel: 0.012, shade: 1.02 });
    surface.addDisc([sx, sy - 0.01, -pz - 0.044], [0, 0, -1], 0.08, { token: RED, sides: 10 });
    rope(surface, [[sx, sy + 0.06, -pz - 0.046], [sx + 0.02, sy + 0.1, -pz - 0.046]], 0.008, DARK, { sides: 4 });
    surface.addDisc([sx + 0.05, sy + 0.08, -pz - 0.046], [0, 0, -1], [0.02, 0.035], { token: OCHRE, sides: 6, up: [1, 1, 0] });
  }

  // Built facing -Z; turned to face +Z, the front the world layout's rotations were authored for.
  const mesh = surface.buildMesh(`${ID}_mesh`);
  mesh.geometry.rotateY(Math.PI);
  root.add(mesh);
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
