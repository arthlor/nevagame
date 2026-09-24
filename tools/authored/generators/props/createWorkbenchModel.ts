import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { rope, sack, timber, v3 } from "./parts";

// Catalog palette order: honey planks, dark frame, iron, canvas.
const TOKENS = ["wood_honey_01", "wood_dark_01", "metal_dark_01", "canvas_cream_01"] as const;
const HONEY = 0;
const DARK = 1;
const IRON = 2;
const CANVAS = 3;

/**
 * Farm workbench, glTF space: +Y up, ground-centred, the working face toward +Z, the backboard at
 * -Z, metres.
 *
 * Redesigned from the Blender bench: splayed legs on stretchers carry a top of separate thick planks
 * with bench-dog holes; a wooden face vise with an iron screw and tommy bar clamps the front-right
 * corner; the backboard's rail hangs a saw, a mallet and a chisel, each with its own silhouette; a
 * hand plane sits on the top among curled shavings; a sack and a folded rag fill the shelf below.
 */
export function createWorkbenchModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);
  const width = Number(p.width ?? 2);
  const depth = Number(p.depth ?? 0.88);
  const top = Number(p.topHeight ?? 0.92);

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);
  const legX = width / 2 - 0.16;
  const legZ = depth / 2 - 0.12;
  const plankT = 0.07;

  // Splayed legs and stretchers.
  for (const [x, z] of [[-legX, -legZ], [legX, -legZ], [-legX, legZ], [legX, legZ]] as const) {
    timber(surface, [x * 1.04, 0, z * 1.06], [x, top - plankT, z], [0.06, 0.06], DARK, { ref: [0, 0, 1], bevel: 0.014 });
  }
  for (const x of [-legX, legX]) {
    timber(surface, [x, 0.22, -legZ], [x, 0.22, legZ], [0.035, 0.05], DARK, { ref: [0, 1, 0] });
    timber(surface, [x, top - plankT - 0.08, -legZ], [x, top - plankT - 0.08, legZ], [0.035, 0.05], DARK, { ref: [0, 1, 0] });
  }
  timber(surface, [-legX, 0.22, legZ], [legX, 0.22, legZ], [0.035, 0.05], DARK, { ref: [0, 1, 0] });
  // Lower shelf boards.
  for (let b = 0; b < 4; b += 1) {
    const z = -legZ + ((2 * legZ) / 4) * (b + 0.5);
    timber(surface, [-legX, 0.27, z], [legX, 0.27, z], [legZ / 4 - 0.008, 0.016], HONEY, { ref: [0, 1, 0], shade: 0.86 + random() * 0.14 });
  }

  // Top: five thick planks with small gaps, overhanging the frame.
  const planks = 5;
  for (let b = 0; b < planks; b += 1) {
    const z = -depth / 2 + (depth / planks) * (b + 0.5);
    const lift = (random() - 0.5) * 0.006;
    timber(surface, [-width / 2, top - plankT / 2 + lift, z], [width / 2, top - plankT / 2 + lift, z], [depth / planks / 2 - 0.004, plankT / 2], HONEY,
      { ref: [0, 1, 0], shade: 0.86 + random() * 0.16, bevel: 0.01 });
  }
  // Bench-dog holes along the front plank.
  for (let k = 0; k < 5; k += 1) {
    surface.addDisc([-width * 0.38 + k * width * 0.16, top + 0.0015, -depth / 2 + depth / planks / 2], [0, 1, 0], 0.016, { token: DARK, shade: 0.72, sides: 6 });
  }

  // Face vise on the front-right corner: a wooden chop, an iron screw, a tommy bar.
  const viseX = -(width / 2 - 0.26);
  timber(surface, [viseX, top - 0.3, -depth / 2 - 0.05], [viseX, top + 0.005, -depth / 2 - 0.05], [0.13, 0.035], HONEY, { ref: [0, 0, 1], bevel: 0.012 });
  rope(surface, [[viseX, top - 0.1, -depth / 2 - 0.2], [viseX, top - 0.1, -depth / 2 + 0.05]], 0.018, IRON, { sides: 8 });
  rope(surface, [[viseX - 0.16, top - 0.1, -depth / 2 - 0.19], [viseX + 0.16, top - 0.1, -depth / 2 - 0.19]], 0.011, IRON, { sides: 6 });
  for (const x of [viseX - 0.17, viseX + 0.17]) {
    surface.addLoft([{ p: [x, top - 0.1, -depth / 2 - 0.19], w: 0.02, h: 0.02 }, { p: [x + Math.sign(x - viseX) * 0.02, top - 0.1, -depth / 2 - 0.19], w: 0.02, h: 0.02 }],
      { sides: 6, ref: [0, 1, 0], capStart: 0.8, capEnd: 0.8, token: IRON });
  }

  // Backboard with a tool rail.
  const back = depth / 2 + 0.03;
  // (The mesh is turned to face +Z at the end, so this backboard ends up at -Z.)
  timber(surface, [-width * 0.46, top, back], [-width * 0.46, top + 0.72, back], [0.04, 0.03], DARK, { ref: [0, 0, 1] });
  timber(surface, [width * 0.46, top, back], [width * 0.46, top + 0.72, back], [0.04, 0.03], DARK, { ref: [0, 0, 1] });
  const boards = 9;
  for (let b = 0; b < boards; b += 1) {
    const x = -width * 0.46 + ((width * 0.92) / boards) * (b + 0.5);
    timber(surface, [x, top, back], [x, top + 0.78, back], [(width * 0.92) / boards / 2 - 0.004, 0.016], DARK, { ref: [0, 0, 1], shade: 0.86 + random() * 0.16 });
  }
  const rail = top + 0.6;
  timber(surface, [-width * 0.42, rail, back - 0.05], [width * 0.42, rail, back - 0.05], [0.025, 0.025], HONEY, { ref: [0, 1, 0] });

  // Hanging saw: a tapered blade on a closed wooden handle.
  const sawX = -width * 0.3;
  surface.addPanel({
    cols: 6, rows: 1, thickness: 0.005,
    point: (u, v) => new THREE.Vector3(sawX + (v - 0.5) * THREE.MathUtils.lerp(0.2, 0.1, u), rail - 0.1 - u * 0.55, back - 0.06),
    token: () => IRON, shade: (_, v) => (v > 0.5 ? 1.04 : 0.95)
  });
  timber(surface, [sawX, rail - 0.12, back - 0.06], [sawX, rail + 0.04, back - 0.06], [0.08, 0.022], HONEY, { ref: [0, 0, 1], bevel: 0.012 });
  // Mallet: a round-headed beetle on a handle.
  const malletX = -width * 0.08;
  rope(surface, [[malletX, rail + 0.02, back - 0.08], [malletX, rail - 0.3, back - 0.08]], 0.016, HONEY, { sides: 6 });
  surface.addLoft([
    { p: [malletX - 0.12, rail - 0.36, back - 0.08], w: 0.064, h: 0.064 },
    { p: [malletX - 0.105, rail - 0.36, back - 0.08], w: 0.075, h: 0.075 },
    { p: [malletX + 0.105, rail - 0.36, back - 0.08], w: 0.075, h: 0.075 },
    { p: [malletX + 0.12, rail - 0.36, back - 0.08], w: 0.064, h: 0.064 }
  ], { sides: 8, ref: [0, 1, 0], capStart: 0.2, capEnd: 0.2, token: DARK });
  // Chisel.
  const chiselX = width * 0.12;
  rope(surface, [[chiselX, rail + 0.02, back - 0.08], [chiselX, rail - 0.14, back - 0.08]], 0.016, HONEY, { sides: 6, taper: [0.8, 1] });
  timber(surface, [chiselX, rail - 0.14, back - 0.08], [chiselX, rail - 0.3, back - 0.08], [0.014, 0.005], IRON, { ref: [0, 0, 1], halfEnd: [0.018, 0.002] });

  // Hand plane on the top with curled shavings.
  const planeAt = new THREE.Vector3(width * 0.1, top, -0.05);
  timber(surface, planeAt.clone().add(new THREE.Vector3(-0.16, 0.035, 0)), planeAt.clone().add(new THREE.Vector3(0.16, 0.035, 0)), [0.045, 0.035], HONEY, { ref: [0, 1, 0], bevel: 0.012 });
  rope(surface, [planeAt.clone().add(new THREE.Vector3(-0.07, 0.07, 0)), planeAt.clone().add(new THREE.Vector3(-0.02, 0.13, 0)), planeAt.clone().add(new THREE.Vector3(0.03, 0.09, 0))], 0.016, DARK, { sides: 6 });
  timber(surface, planeAt.clone().add(new THREE.Vector3(0.06, 0.07, 0)), planeAt.clone().add(new THREE.Vector3(0.1, 0.12, 0)), [0.03, 0.006], IRON, { ref: [0, 0, 1] });
  for (let k = 0; k < 7; k += 1) {
    const c = planeAt.clone().add(new THREE.Vector3(-0.3 - random() * 0.35, 0.02, (random() - 0.5) * 0.4));
    const r = 0.025 + random() * 0.02;
    const spin = random() * Math.PI;
    const curl: Station[] = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 7) * Math.PI * 1.7;
      return { p: v3(c.clone().add(new THREE.Vector3(Math.cos(a + spin) * r * (1 - i * 0.05), Math.sin(a) * r * 0.6 + r * 0.6, Math.sin(a + spin) * r * 0.3 + i * 0.006))), w: 0.012, h: 0.002 };
    });
    surface.addLoft(curl, { sides: 4, ref: [0, 1, 0], token: CANVAS, shade: 1.02 });
  }

  // Shelf load: a sack and a folded rag hanging over the front rail.
  sack(surface, [-width * 0.22, 0.29, 0.02], [0.4, 0.32, 0.36], CANVAS, DARK, { seed: 4, yaw: 0.4, neck: false });
  surface.addPanel({
    cols: 3, rows: 4, thickness: 0.008,
    point: (u, v) => {
      const x = width * 0.3 + (u - 0.5) * 0.24;
      const over = v * 0.3;
      return over < 0.08
        ? new THREE.Vector3(x, top + 0.004 + 0.01 * Math.sin(u * 6), -depth / 2 + 0.08 - over)
        : new THREE.Vector3(x, top + 0.004 - (over - 0.08), -depth / 2 - 0.01 - 0.02 * Math.sin(u * 5));
    },
    token: () => CANVAS, shade: (u) => 0.9 + 0.1 * Math.sin(u * 9) ** 2
  });

  // Built facing -Z; turned to face +Z, the front the world layout's rotations were authored for.
  const mesh = surface.buildMesh(`${ID}_mesh`);
  mesh.geometry.rotateY(Math.PI);
  root.add(mesh);
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
