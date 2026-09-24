import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext } from "../../kit";
import { rope, timber, v3 } from "./parts";

// Catalog palette order: slats and lid boards, dark posts and battens, compost, iron fittings.
const TOKENS = ["wood_warm_01", "wood_dark_01", "soil_warm_01", "metal_dark_01"] as const;
const WOOD = 0;
const DARK = 1;
const SOIL = 2;
const IRON = 3;

/**
 * Worm compost bin, glTF space: +Y up, ground-centred, the lid hinged along the back (-Z), metres.
 *
 * Redesigned from the Blender bin: four chunky capped posts carry `slatCount` slats a side, each
 * its own board with daylight between; the bedding is a heaped, damp-dark crumbly surface a hand
 * below the top; the lid is three boards on two battens hung on iron strap hinges, propped open on a
 * stick and leaning `lidAngleDeg` back from upright; iron corner brackets tie the box together.
 */
export function createWormCompostModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);
  const width = Number(p.width ?? 1.25);
  const depth = Number(p.depth ?? 1.05);
  const height = Number(p.height ?? 0.78);
  const slats = Math.max(2, Math.round(Number(p.slatCount ?? 4)));
  // `lidAngleDeg` is how far the open lid leans back from upright, so the bedding shows.
  const lidAngle = THREE.MathUtils.degToRad(90 - Number(p.lidAngleDeg ?? 28));
  const fill = Number(p.soilFillRatio ?? 0.65);

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);
  const post = 0.055;
  const hx = width / 2 - post;
  const hz = depth / 2 - post;

  // Posts with pyramid caps standing proud of the slats.
  for (const [x, z] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]] as const) {
    timber(surface, [x, -0.02, z], [x, height + 0.06, z], [post, post], DARK, { ref: [0, 0, 1], bevel: 0.012 });
    surface.addLoft([
      { p: [x, height + 0.06, z], w: post * 1.25 * Math.SQRT2, h: post * 1.25 * Math.SQRT2 },
      { p: [x, height + 0.08, z], w: post * 1.25 * Math.SQRT2, h: post * 1.25 * Math.SQRT2 }
    ], { sides: 4, phase: Math.PI / 4, ref: [0, 0, 1], capStart: 0, capEnd: 0.7, flat: true, token: DARK, shade: 1.02 });
  }
  // Slats, a board at a time with gaps between.
  const pitch = (height - 0.06) / slats;
  const board = pitch * 0.74;
  for (let s = 0; s < slats; s += 1) {
    const y = 0.05 + pitch * (s + 0.5);
    for (const z of [-1, 1]) {
      timber(surface, [-hx, y + (random() - 0.5) * 0.01, z * (depth / 2 - 0.018)], [hx, y + (random() - 0.5) * 0.01, z * (depth / 2 - 0.018)],
        [0.016, board / 2], WOOD, { ref: [0, 1, 0], shade: 0.86 + random() * 0.16, bevel: 0.008 });
    }
    for (const x of [-1, 1]) {
      timber(surface, [x * (width / 2 - 0.018), y + (random() - 0.5) * 0.01, -hz], [x * (width / 2 - 0.018), y + (random() - 0.5) * 0.01, hz],
        [0.016, board / 2], WOOD, { ref: [0, 1, 0], shade: 0.86 + random() * 0.16, bevel: 0.008 });
    }
  }
  // Iron corner brackets over the top and bottom slats.
  for (const [x, z] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]] as const) {
    for (const y of [0.05 + pitch * 0.5, 0.05 + pitch * (slats - 0.5)]) {
      for (const [dx, dz] of [[Math.sign(x) * 0.0, Math.sign(z) * 1], [Math.sign(x) * 1, Math.sign(z) * 0.0]] as const) {
        const face = new THREE.Vector3(x + dx * (post + 0.004), y, z + dz * (post + 0.004));
        const along = new THREE.Vector3(dz !== 0 ? -Math.sign(x) : 0, 0, dx !== 0 ? -Math.sign(z) : 0);
        timber(surface, face, face.clone().addScaledVector(along, 0.14), [0.004, 0.028], IRON, { ref: [0, 1, 0], bevel: 0.002 });
      }
    }
  }

  // Bedding: a heaped crumbly surface with damp hollows.
  const soilY = 0.05 + (height - 0.06) * fill;
  const inner = [width / 2 - 0.04, depth / 2 - 0.04] as const;
  surface.addPanel({
    cols: 10, rows: 8, thickness: 0.04,
    point: (u, v) => {
      const x = (u - 0.5) * 2 * inner[0];
      const z = (v - 0.5) * 2 * inner[1];
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const heap = 0.07 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI) + 0.02 * Math.sin(u * 17 + v * 11) * Math.min(1, edge * 6);
      return new THREE.Vector3(x, soilY + heap, z);
    },
    token: () => SOIL,
    shade: () => 0.8 + random() * 0.22
  });
  timber(surface, [0, 0.02, -inner[1]], [0, 0.02, inner[1]], [inner[0], 0.02], DARK, { ref: [0, 1, 0] });

  // Lid hinged at the back top edge, propped open.
  const hinge = new THREE.Vector3(0, height + 0.02, depth / 2 + 0.01);
  const lidLength = depth * 1.04;
  const open = new THREE.Vector3(0, Math.sin(lidAngle), -Math.cos(lidAngle));
  const lidUp = new THREE.Vector3(0, Math.cos(lidAngle), Math.sin(lidAngle));
  const lidAt = (x: number, along: number, lift = 0): THREE.Vector3 =>
    hinge.clone().add(new THREE.Vector3(x, 0, 0)).addScaledVector(open, along).addScaledVector(lidUp, lift);
  const boards = 3;
  const lidWidth = width * 1.04;
  for (let b = 0; b < boards; b += 1) {
    const x = -lidWidth / 2 + (lidWidth / boards) * (b + 0.5);
    timber(surface, lidAt(x, 0), lidAt(x, lidLength), [lidWidth / boards / 2 - 0.006, 0.018], b % 2 ? DARK : WOOD,
      { ref: v3(lidUp), shade: 0.9 + random() * 0.12, bevel: 0.006 });
  }
  for (const along of [0.2, 0.8]) {
    timber(surface, lidAt(-lidWidth * 0.44, lidLength * along, -0.03), lidAt(lidWidth * 0.44, lidLength * along, -0.03), [0.02, 0.018], DARK,
      { ref: v3(lidUp), bevel: 0.005 });
  }
  for (const x of [-width * 0.3, width * 0.3]) {
    timber(surface, lidAt(x, 0.01, 0.022), lidAt(x, lidLength * 0.36, 0.022), [0.022, 0.004], IRON, { ref: v3(lidUp), bevel: 0.002 });
    timber(surface, [x, height - 0.1, depth / 2 + 0.004], [x, height + 0.02, depth / 2 + 0.004], [0.022, 0.004], IRON, { ref: [0, 0, 1], bevel: 0.002 });
  }
  // Prop stick from the side rail to under the lid's front.
  rope(surface, [[width * 0.4, height - 0.02, depth * 0.1], v3(lidAt(width * 0.4, lidLength * 0.62, -0.02))], 0.016, DARK, { sides: 5 });

  // Built facing -Z; turned to face +Z, the front the world layout's rotations were authored for.
  const mesh = surface.buildMesh(`${ID}_mesh`);
  mesh.geometry.rotateY(Math.PI);
  root.add(mesh);
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
