import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";
import { rope, timber } from "../props/parts";

// Catalog palette order: stone, plaster, honey trim, dark timber, roof tiles, lit windows.
const TOKENS = ["stone_warm_01", "plaster_warm_01", "wood_honey_01", "wood_dark_01", "roof_terracotta_01", "emissive_window_01"] as const;
const STONE = 0;
const PLASTER = 1;
const HONEY = 2;
const DARK = 3;
const TILE = 4;
const GLOW = 5;

/**
 * Farm kitchen, glTF space: +Y up, ground-centred on the main block, the door and porch toward +Z,
 * metres.
 *
 * Redesigned from the Blender kitchen: a coursed stone plinth carries half-timbered plaster walls
 * (corner posts, sills, plates, mid rails and braces); a lean-to roof of staggered terracotta tiles
 * falls from the back to the front and breaks to a shallower porch roof on two braced posts over a
 * plank deck and stone steps; a stone chimney climbs the side wall to a pot; the door is planked with
 * a Z-brace; the windows glow behind cross mullions between open shutters; firewood is stacked under
 * the eave.
 */
export function createFarmKitchenModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);
  const width = Number(p.width ?? 3.2);
  const depth = Number(p.depth ?? 2.6);
  const wallHeight = Number(p.wallHeight ?? 2.1);
  const pitch = THREE.MathUtils.degToRad(Number(p.roofPitchDeg ?? 30));
  const base = Number(p.foundationHeight ?? 0.42);
  const overhang = Number(p.roofOverhang ?? 0.34);
  const porch = Number(p.porchDepth ?? 1.35);
  const chimneyHeight = Number(p.chimneyHeight ?? 2.4);
  const doorW = Number(p.doorWidth ?? 0.86);
  const doorH = Number(p.doorHeight ?? 1.55);

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);
  const hw = width / 2;
  const hd = depth / 2;
  const frontTop = base + wallHeight;
  const backTop = frontTop + Math.tan(pitch) * depth;
  const topAt = (z: number): number => THREE.MathUtils.lerp(backTop, frontTop, (z + hd) / depth);
  const wall = 0.16;

  // ---- Plinth: two courses of stone blocks round the perimeter ---------------------------------
  const course = base / 2;
  for (let c = 0; c < 2; c += 1) {
    const edges: Array<readonly [THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(-hw - 0.05, 0, -hd - 0.05), new THREE.Vector3(hw + 0.05, 0, -hd - 0.05)],
      [new THREE.Vector3(hw + 0.05, 0, -hd - 0.05), new THREE.Vector3(hw + 0.05, 0, hd + 0.05)],
      [new THREE.Vector3(hw + 0.05, 0, hd + 0.05), new THREE.Vector3(-hw - 0.05, 0, hd + 0.05)],
      [new THREE.Vector3(-hw - 0.05, 0, hd + 0.05), new THREE.Vector3(-hw - 0.05, 0, -hd - 0.05)]
    ];
    for (const [a, b] of edges) {
      const run = a.distanceTo(b);
      let t = c ? 0.12 : 0;
      while (t < run - 0.05) {
        const piece = Math.min(run - t, 0.34 + random() * 0.26);
        const from = a.clone().lerp(b, t / run).setY(c * course + course / 2);
        const to = a.clone().lerp(b, (t + piece - 0.02) / run).setY(c * course + course / 2);
        timber(surface, from, to, [0.11 + random() * 0.02, course / 2 - 0.01], STONE, { ref: [0, 1, 0], bevel: 0.03, shade: 0.82 + random() * 0.2 });
        t += piece;
      }
    }
  }
  timber(surface, [0, base / 2, -hd], [0, base / 2, hd], [hw, base / 2 - 0.01], STONE, { ref: [0, 1, 0], shade: 0.8 });

  // ---- Walls: plaster between a dark timber frame -----------------------------------------------
  const slab = (from: V3, to: V3, half: readonly [number, number], ref: V3): void =>
    timber(surface, from, to, half, PLASTER, { ref, bevel: 0.01, shade: 0.97 });
  slab([-hw, (base + frontTop) / 2, hd], [hw, (base + frontTop) / 2, hd], [wall / 2, (frontTop - base) / 2], [0, 1, 0]);
  slab([-hw, (base + backTop) / 2, -hd], [hw, (base + backTop) / 2, -hd], [wall / 2, (backTop - base) / 2], [0, 1, 0]);
  for (const x of [-hw, hw]) {
    // Gable wall: plaster from the plinth up to the roof line, which falls from back to front.
    surface.addPanel({
      cols: 4, rows: 2, thickness: wall,
      point: (u, v) => {
        const z = THREE.MathUtils.lerp(-hd, hd, u);
        return new THREE.Vector3(x, THREE.MathUtils.lerp(base, topAt(z), v), z);
      },
      token: () => PLASTER, shade: () => 0.97
    });
  }
  const beam = (from: V3, to: V3, half = 0.055): void => timber(surface, from, to, [half, half], DARK, { bevel: 0.012, shade: 0.9 + random() * 0.1 });
  const face = wall / 2 + 0.02;
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]] as const) {
    beam([x, base, z], [x, z > 0 ? frontTop : backTop, z], 0.08);
  }
  // Sills, plates, mid rails and braces on the front and back.
  for (const [z, top] of [[hd + face, frontTop], [-hd - face, backTop]] as const) {
    beam([-hw, base + 0.05, z], [hw, base + 0.05, z]);
    beam([-hw, top - 0.05, z], [hw, top - 0.05, z]);
    beam([-hw, base + 1.05, z], [hw, base + 1.05, z], 0.045);
    beam([-hw + 0.1, base + 0.1, z], [-hw + 0.75, base + 1.0, z], 0.04);
    beam([hw - 0.1, base + 0.1, z], [hw - 0.75, base + 1.0, z], 0.04);
  }
  for (const x of [-hw - face, hw + face]) {
    beam([x, base + 0.05, -hd], [x, base + 0.05, hd]);
    beam([x, backTop - 0.05, -hd], [x, frontTop - 0.05, hd]);
    beam([x, base + 1.05, -hd], [x, base + 1.05, hd], 0.045);
    beam([x, base + 1.1, -hd + 0.1], [x, topAt(-hd + 0.9) - 0.1, -hd + 0.9], 0.04);
  }

  // ---- Door and windows -------------------------------------------------------------------------
  const doorX = -hw * 0.4;
  const doorZ = hd + face + 0.01;
  beam([doorX - doorW / 2 - 0.05, base, doorZ], [doorX - doorW / 2 - 0.05, base + doorH + 0.08, doorZ], 0.05);
  beam([doorX + doorW / 2 + 0.05, base, doorZ], [doorX + doorW / 2 + 0.05, base + doorH + 0.08, doorZ], 0.05);
  timber(surface, [doorX - doorW / 2 - 0.12, base + doorH + 0.1, doorZ], [doorX + doorW / 2 + 0.12, base + doorH + 0.1, doorZ], [0.05, 0.06], HONEY, { ref: [0, 1, 0], bevel: 0.012 });
  const planks = 4;
  for (let k = 0; k < planks; k += 1) {
    const x = doorX - doorW / 2 + (doorW / planks) * (k + 0.5);
    timber(surface, [x, base + 0.02, doorZ + 0.01], [x, base + doorH, doorZ + 0.01], [doorW / planks / 2 - 0.005, 0.02], DARK, { ref: [0, 0, 1], shade: 0.86 + random() * 0.14 });
  }
  for (const y of [0.25, doorH - 0.25]) {
    timber(surface, [doorX - doorW / 2 + 0.05, base + y, doorZ + 0.035], [doorX + doorW / 2 - 0.05, base + y, doorZ + 0.035], [0.012, 0.05], HONEY, { ref: [0, 0, 1] });
  }
  timber(surface, [doorX - doorW / 2 + 0.08, base + 0.3, doorZ + 0.035], [doorX + doorW / 2 - 0.08, base + doorH - 0.3, doorZ + 0.035], [0.012, 0.04], HONEY, { ref: [0, 0, 1] });
  rope(surface, Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return new THREE.Vector3(doorX + doorW * 0.32 + Math.sin(a) * 0.04, base + doorH * 0.5 + Math.cos(a) * 0.04, doorZ + 0.06);
  }), 0.008, DARK, { sides: 4, caps: false });

  const windowAt = (centre: THREE.Vector3, normal: THREE.Vector3, w: number, h: number): void => {
    const across = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    const at = (a: number, b: number, out = 0): THREE.Vector3 => centre.clone().addScaledVector(across, a).addScaledVector(new THREE.Vector3(0, 1, 0), b).addScaledVector(normal, out);
    surface.addDisc([at(0, 0, 0.005).x, at(0, 0, 0.005).y, at(0, 0, 0.005).z], [normal.x, normal.y, normal.z], [h / 2, w / 2], { token: GLOW, rect: true, up: [0, 1, 0] });
    const frame = (a: V3, b: V3, half = 0.035): void => timber(surface, a, b, [half, half], HONEY, { bevel: 0.008 });
    const c = (a: number, b: number): V3 => { const q = at(a, b, 0.03); return [q.x, q.y, q.z]; };
    frame(c(-w / 2, -h / 2), c(w / 2, -h / 2));
    frame(c(-w / 2, h / 2), c(w / 2, h / 2));
    frame(c(-w / 2, -h / 2), c(-w / 2, h / 2));
    frame(c(w / 2, -h / 2), c(w / 2, h / 2));
    frame(c(0, -h / 2), c(0, h / 2), 0.018);
    frame(c(-w / 2, 0), c(w / 2, 0), 0.018);
    frame(c(-w / 2 - 0.08, -h / 2 - 0.06), c(w / 2 + 0.08, -h / 2 - 0.06), 0.04);
    // Open shutters, planked, either side.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k += 1) {
        const a = side * (w / 2 + 0.06 + (w / 6) * (k + 0.5));
        const q0 = at(a, -h / 2, 0.04);
        const q1 = at(a, h / 2, 0.04);
        timber(surface, q0, q1, [w / 12 - 0.004, 0.015], DARK, { ref: [normal.x, normal.y, normal.z], shade: 0.86 + random() * 0.14 });
      }
    }
  };
  windowAt(new THREE.Vector3(hw * 0.45, base + 1.35, hd + face), new THREE.Vector3(0, 0, 1), 0.62, 0.62);
  windowAt(new THREE.Vector3(-hw - face, base + 1.4, -hd * 0.2), new THREE.Vector3(-1, 0, 0), 0.56, 0.6);

  // ---- Roof: staggered tile courses, main lean-to and the shallower porch ------------------------
  const tileRoof = (zBack: number, yBack: number, zFront: number, yFront: number, x0: number, x1: number, rows: number): void => {
    const down = new THREE.Vector3(0, yFront - yBack, zFront - zBack).normalize();
    const normal = new THREE.Vector3(0, -down.z, down.y).multiplyScalar(down.z > 0 ? -1 : 1);
    if (normal.y < 0) normal.negate();
    const run = Math.hypot(zFront - zBack, yFront - yBack);
    for (let r = 0; r < rows; r += 1) {
      const along = (run * (r + 0.5)) / rows;
      const centre = new THREE.Vector3(0, yBack, zBack).addScaledVector(down, along).addScaledVector(normal, 0.05 + (r % 2) * 0.012);
      const tile = 0.3;
      const count = Math.round((x1 - x0) / tile);
      const offset = (r % 2) * tile * 0.5;
      for (let k = 0; k < count; k += 1) {
        const a = Math.max(x0, x0 + k * tile - offset + 0.01);
        const b = Math.min(x1, x0 + (k + 1) * tile - offset - 0.01);
        if (b - a < 0.05) continue;
        const tilt = normal.clone().addScaledVector(down, -0.14).normalize();
        timber(surface, centre.clone().setX(a), centre.clone().setX(b), [run / rows / 2 + 0.035, 0.03], TILE,
          { ref: [tilt.x, tilt.y, tilt.z], shade: 0.84 + random() * 0.2, bevel: 0 });
      }
    }
  };
  const x0 = -hw - overhang;
  const x1 = hw + overhang;
  const zBack = -hd - overhang;
  const zFront = hd + 0.1;
  tileRoof(zBack, backTop + Math.tan(pitch) * overhang + 0.06, zFront, frontTop - Math.tan(pitch) * 0.1 + 0.06, x0, x1, 12);
  const porchPitch = THREE.MathUtils.degToRad(14);
  const porchFront = hd + porch;
  const porchLow = frontTop - Math.tan(porchPitch) * porch;
  const porchX = [doorX - doorW * 1.1, doorX + doorW * 1.3] as const;
  tileRoof(hd + 0.02, frontTop - 0.12, porchFront + 0.15, porchLow - 0.12 - Math.tan(porchPitch) * 0.15, porchX[0] - 0.15, porchX[1] + 0.15, 5);
  // Barge boards along the main roof's sides.
  for (const x of [x0, x1]) {
    timber(surface, [x, backTop + Math.tan(pitch) * overhang + 0.02, zBack], [x, frontTop - Math.tan(pitch) * 0.1 + 0.02, zFront], [0.03, 0.09], HONEY, { bevel: 0.01 });
  }

  // Porch: deck, steps, braced posts carrying a beam.
  for (let k = 0; k < 6; k += 1) {
    const x = porchX[0] + ((porchX[1] - porchX[0]) / 6) * (k + 0.5);
    timber(surface, [x, base - 0.03, hd + 0.1], [x, base - 0.03, porchFront], [(porchX[1] - porchX[0]) / 12 - 0.008, 0.03], HONEY, { ref: [0, 1, 0], shade: 0.86 + random() * 0.14 });
  }
  timber(surface, [porchX[0], base / 2 - 0.03, porchFront - 0.05], [porchX[1], base / 2 - 0.03, porchFront - 0.05], [0.06, base / 2 - 0.03], STONE, { ref: [0, 1, 0], shade: 0.9 });
  timber(surface, [doorX - doorW * 0.6, base * 0.33, porchFront + 0.22], [doorX + doorW * 0.6, base * 0.33, porchFront + 0.22], [0.16, base * 0.33], STONE, { ref: [0, 1, 0], bevel: 0.03, shade: 0.95 });
  for (const x of porchX) {
    beam([x, base, porchFront - 0.1], [x, porchLow - 0.08, porchFront - 0.1], 0.065);
    beam([x, porchLow - 0.45, porchFront - 0.1], [x, porchLow - 0.1, porchFront - 0.45], 0.035);
  }
  beam([porchX[0] - 0.12, porchLow - 0.1, porchFront - 0.1], [porchX[1] + 0.12, porchLow - 0.1, porchFront - 0.1], 0.06);

  // ---- Chimney up the side wall ----------------------------------------------------------------
  const chimneyX = hw + face + 0.26;
  const chimneyZ = -hd * 0.35;
  const chimneyTop = backTop + chimneyHeight * 0.55;
  const courses = Math.round(chimneyTop / 0.28);
  for (let c = 0; c < courses; c += 1) {
    const y = c * (chimneyTop / courses);
    const narrow = y > frontTop ? 0.72 : 1;
    const hx = 0.3 * narrow;
    const hz = 0.36 * narrow;
    for (const [a, b, half] of [
      [[chimneyX - hx, 0, chimneyZ - hz + (c % 2 ? 0.1 : 0)], [chimneyX - hx, 0, chimneyZ + hz], 0.09],
      [[chimneyX + hx, 0, chimneyZ - hz], [chimneyX + hx, 0, chimneyZ + hz - (c % 2 ? 0.1 : 0)], 0.09]
    ] as const) {
      const yc = y + chimneyTop / courses / 2;
      timber(surface, [a[0], yc, a[2]], [b[0], yc, b[2]], [half, chimneyTop / courses / 2 - 0.012], STONE, { ref: [0, 1, 0], bevel: 0.025, shade: 0.82 + random() * 0.2 });
    }
    const yc = y + chimneyTop / courses / 2;
    timber(surface, [chimneyX - hx + 0.08, yc, chimneyZ - hz], [chimneyX + hx - 0.08, yc, chimneyZ - hz], [0.08, chimneyTop / courses / 2 - 0.012], STONE, { ref: [0, 1, 0], bevel: 0.025, shade: 0.82 + random() * 0.2 });
    timber(surface, [chimneyX - hx + 0.08, yc, chimneyZ + hz], [chimneyX + hx - 0.08, yc, chimneyZ + hz], [0.08, chimneyTop / courses / 2 - 0.012], STONE, { ref: [0, 1, 0], bevel: 0.025, shade: 0.82 + random() * 0.2 });
  }
  timber(surface, [chimneyX, chimneyTop, chimneyZ - 0.32], [chimneyX, chimneyTop, chimneyZ + 0.32], [0.3, 0.05], STONE, { ref: [0, 1, 0], bevel: 0.02, shade: 1.02 });
  surface.addLoft([
    { p: [chimneyX, chimneyTop + 0.05, chimneyZ], w: 0.13, h: 0.13 },
    { p: [chimneyX, chimneyTop + 0.3, chimneyZ], w: 0.1, h: 0.1 },
    { p: [chimneyX, chimneyTop + 0.36, chimneyZ], w: 0.12, h: 0.12 }
  ], { sides: 8, ref: [0, 0, 1], capEnd: 0, token: TILE, shade: 0.92 });
  surface.addDisc([chimneyX, chimneyTop + 0.362, chimneyZ], [0, 1, 0], 0.08, { token: DARK, shade: 0.72, sides: 8 });

  // ---- Firewood stacked under the eave on the -X side --------------------------------------------
  for (let row = 0; row < 3; row += 1) {
    for (let k = 0; k < 6 - row; k += 1) {
      const z = -hd + 0.35 + k * 0.2 + row * 0.1;
      const y = 0.09 + row * 0.16;
      const x = -hw - face - 0.28;
      surface.addLoft([
        { p: [x - 0.22, y, z], w: 0.08, h: 0.08 }, { p: [x + 0.22, y, z], w: 0.08, h: 0.08 }
      ], {
        sides: 7, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: HONEY,
        shade: ({ u }) => (u < 0 || u > 1 ? 1.04 : 0.7 + random() * 0.1)
      });
    }
  }

  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
