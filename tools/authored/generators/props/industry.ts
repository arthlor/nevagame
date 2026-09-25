import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { lumps, rope, sack, timber, v3 } from "./parts";

/**
 * Working sites that show where the mainland villages' goods come from: a mine adit above Highridge,
 * an ice house by the forest lake, salt pans on Reedhaven's cove flats and a timber stack at
 * Pinewatch's forest edge. glTF space: +Y up, ground at y = 0, the working front toward +Z, metres.
 */

/** A faceted, lumpy boulder lofted along Z; its underside stays at or above the ground line. */
function boulder(
  surface: SurfaceBuilder, centre: THREE.Vector3, radii: readonly [number, number, number], token: number,
  seed: number, shade: number, roughness = 0.14, sides = 7
): void {
  const [rx, ry, rz] = radii;
  const stations: Station[] = [-0.92, -0.5, 0.1, 0.92].map((t) => {
    const s = Math.sqrt(1 - t * t);
    return { p: [centre.x, centre.y, centre.z + t * rz], w: rx * s, h: ry * s };
  });
  surface.addLoft(stations, { sides, ref: [0, 1, 0], capStart: 0.25, capEnd: 0.25, flat: true, radial: lumps(seed, roughness), token, shade });
}

/** A low heap: a squat lumpy dome sitting on the ground. */
function heap(surface: SurfaceBuilder, centre: readonly [number, number], radius: number, height: number, token: number, seed: number, shade: number): void {
  const [x, z] = centre;
  const rings = [[0, 1], [0.35, 0.9], [0.7, 0.62], [1, 0.12]] as const;
  surface.addLoft(rings.map(([t, k]): Station => ({ p: [x, t * height, z], w: radius * k, h: radius * k * 0.86 })), {
    sides: 9, ref: [0, 0, 1], capStart: 0, capEnd: 0.4, flat: true, radial: lumps(seed, 0.16), token, shade
  });
}

/**
 * Mine adit. A timber-set portal cut into a buttressed rock face: two sets of posts and cap beams
 * with lagging overhead frame a dark drift; rails on sleepers run out onto the apron under a loaded
 * ore tub, a lantern hangs from the cap, and waste rock is heaped to one side. The rock mass behind
 * the portal is meant to sink into a hillside.
 */
export function createMineAditModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: rock, dark rock, dark timber, weathered timber, iron, shadow, ore, lantern.
  const surface = new SurfaceBuilder(spec.palette);
  const ROCK = 0;
  const DARK_ROCK = 1;
  const TIMBER = 2;
  const WEATHERED = 3;
  const IRON = 4;
  const SHADOW = 5;
  const ORE = 6;
  const LANTERN = 7;
  const half = 0.92;
  const clear = 2.12;
  // Rock face: buttresses either side, a brow over the cap and a mass behind the drift.
  // Angular six-sided slabs with strong lumps read as broken rock, not pebbles.
  boulder(surface, new THREE.Vector3(-2.25, 1.12, -0.55), [1.15, 1.17, 1.35], ROCK, 1, 0.9, 0.24, 6);
  boulder(surface, new THREE.Vector3(2.2, 1.05, -0.45), [1.1, 1.1, 1.3], ROCK, 2, 0.96, 0.24, 6);
  boulder(surface, new THREE.Vector3(0, 3.02, -0.7), [2.35, 0.78, 1.35], ROCK, 3, 1, 0.2, 6);
  boulder(surface, new THREE.Vector3(0, 1.62, -2.35), [2.7, 1.68, 1.55], DARK_ROCK, 4, 0.9, 0.22, 6);
  boulder(surface, new THREE.Vector3(-1.6, 2.35, -1.6), [1.2, 1.1, 1.1], ROCK, 5, 0.86, 0.26, 5);
  boulder(surface, new THREE.Vector3(1.7, 2.25, -1.5), [1.1, 1.1, 1.1], ROCK, 6, 0.92, 0.26, 5);
  // The drift: a dark recess with inner walls, so the opening reads deep, not painted.
  surface.addDisc([0, clear / 2, -1.25], [0, 0, 1], [clear / 2, half], { token: SHADOW, rect: true, up: [0, 1, 0], shade: 0.72 });
  for (const side of [-1, 1]) {
    timber(surface, [side * (half + 0.02), clear / 2, -1.25], [side * (half + 0.02), clear / 2, 0], [0.02, clear / 2], SHADOW, { ref: [0, 1, 0], shade: 0.74 });
  }
  timber(surface, [0, clear + 0.02, -1.25], [0, clear + 0.02, 0], [half + 0.04, 0.02], SHADOW, { ref: [0, 1, 0], shade: 0.72 });
  // Timber sets: battered posts under a cap, one at the portal and one inside the drift.
  for (const z of [0.08, -0.72]) {
    for (const side of [-1, 1]) {
      timber(surface, [side * (half + 0.1), 0, z], [side * (half + 0.02), clear, z], [0.12, 0.12], TIMBER,
        { ref: [0, 0, 1], bevel: 0.03, shade: 0.88 + random() * 0.12 });
    }
    timber(surface, [-(half + 0.36), clear + 0.14, z], [half + 0.36, clear + 0.14, z], [0.14, 0.14], TIMBER,
      { ref: [0, 1, 0], bevel: 0.035, shade: 0.94 });
  }
  // Lagging boards between the sets.
  for (let k = 0; k < 5; k += 1) {
    const x = -half + (k + 0.5) * ((half * 2) / 5);
    timber(surface, [x, clear + 0.32, -0.85], [x, clear + 0.32, 0.22], [0.16, 0.035], WEATHERED, { ref: [0, 1, 0], shade: 0.82 + random() * 0.16 });
  }
  // Rails on sleepers, from inside the drift out across the apron.
  const railEnd = 3.4;
  for (let z = -1.0; z <= railEnd; z += 0.55) {
    timber(surface, [-0.72, 0.05, z], [0.72, 0.05, z], [0.09, 0.05], WEATHERED, { ref: [0, 1, 0], shade: 0.78 + random() * 0.16 });
  }
  for (const x of [-0.42, 0.42]) {
    timber(surface, [x, 0.13, -1.1], [x, 0.13, railEnd + 0.15], [0.028, 0.035], IRON, { ref: [0, 1, 0], bevel: 0.006 });
  }
  // Ore tub on the rails: a planked box on iron wheels, heaped with ore.
  const tubZ = 2.25;
  const tubY = 0.34;
  timber(surface, [0, tubY, tubZ - 0.46], [0, tubY, tubZ + 0.46], [0.5, 0.05], WEATHERED, { ref: [0, 1, 0], shade: 0.86 });
  for (const side of [-1, 1]) {
    timber(surface, [side * 0.5, tubY + 0.3, tubZ - 0.46], [side * 0.5, tubY + 0.3, tubZ + 0.46], [0.04, 0.28], WEATHERED, { ref: [0, 1, 0], shade: 0.9 + random() * 0.08 });
    timber(surface, [-0.54, tubY + 0.3, tubZ + side * 0.48], [0.54, tubY + 0.3, tubZ + side * 0.48], [0.04, 0.28], WEATHERED, { ref: [0, 1, 0], shade: 0.84 + random() * 0.1 });
    timber(surface, [-0.56, tubY + 0.55, tubZ + side * 0.5], [0.56, tubY + 0.55, tubZ + side * 0.5], [0.022, 0.03], IRON, { ref: [0, 1, 0] });
    for (const end of [-1, 1]) {
      surface.addDisc([side * 0.47, 0.19, tubZ + end * 0.3], [side, 0, 0], 0.17, { token: IRON, sides: 10, dome: 0.03, shade: 0.9 });
    }
  }
  for (let k = 0; k < 9; k += 1) {
    const x = (random() - 0.5) * 0.7;
    const z = tubZ + (random() - 0.5) * 0.66;
    surface.addEllipsoid([x, tubY + 0.62 + random() * 0.08, z], [0.12 + random() * 0.05, 0.09, 0.12 + random() * 0.05],
      { token: k % 3 ? ORE : DARK_ROCK, sides: 5, shade: 0.84 + random() * 0.18 });
  }
  // Waste heap beside the apron, tipped on the portal's left.
  heap(surface, [-3.05, 1.55], 1.25, 0.82, DARK_ROCK, 7, 0.86);
  heap(surface, [-3.7, 2.55], 0.8, 0.5, ROCK, 8, 0.92);
  // Lantern hung from the portal cap.
  rope(surface, [[0.62, clear + 0.02, 0.28], [0.62, clear - 0.24, 0.28]], 0.012, IRON, { sides: 4 });
  timber(surface, [0.62, clear - 0.46, 0.28], [0.62, clear - 0.24, 0.28], [0.08, 0.08], LANTERN, { ref: [0, 0, 1], bevel: 0.02 });
  timber(surface, [0.62, clear - 0.24, 0.28], [0.62, clear - 0.19, 0.28], [0.1, 0.1], IRON, { ref: [0, 0, 1], bevel: 0.02 });
  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}

/**
 * Ice house. A coursed stone drum under a turf dome, half sunk into an earth bank, entered through a
 * short stone passage with a strapped timber door. Cut lake ice waits on a sledge by the door beside
 * the straw that packs it.
 */
export function createIceHouseModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: warm stone, cool stone, turf, dark timber, iron, ice, straw, bank.
  const surface = new SurfaceBuilder(spec.palette);
  const WARM = 0;
  const COOL = 1;
  const TURF = 2;
  const TIMBER = 3;
  const IRON = 4;
  const ICE = 5;
  const STRAW = 6;
  const BANK = 7;
  const radius = 1.85;
  const wall = 1.35;
  // Earth bank wrapped round the rear half.
  boulder(surface, new THREE.Vector3(0, 1.02, -1.25), [2.75, 1.1, 2.0], BANK, 11, 0.9, 0.08);
  // Coursed drum: each course a ring of stones, each stone its own value.
  const courses = 4;
  for (let c = 0; c < courses; c += 1) {
    const y0 = (wall / courses) * c;
    const y1 = y0 + wall / courses;
    surface.addLoft([
      { p: [0, y0, 0], w: radius + 0.03 * (c % 2), h: radius + 0.03 * (c % 2) },
      { p: [0, y1 - 0.02, 0], w: radius - 0.01, h: radius - 0.01 }
    ], { sides: 14, ref: [0, 0, 1], phase: c * 0.22, capStart: 0, capEnd: 0, flat: true, token: WARM, shade: () => 0.8 + random() * 0.22 });
  }
  // Eave ring and faceted turf dome.
  surface.addLoft([{ p: [0, wall - 0.02, 0], w: radius + 0.12, h: radius + 0.12 }, { p: [0, wall + 0.12, 0], w: radius + 0.1, h: radius + 0.1 }],
    { sides: 14, ref: [0, 0, 1], capStart: 0, capEnd: 0, flat: true, token: COOL, shade: 0.94 });
  const domeRings = [[0, 1.02], [0.3, 0.95], [0.58, 0.78], [0.82, 0.5], [1, 0.12]] as const;
  surface.addLoft(domeRings.map(([t, k]): Station => ({ p: [0, wall + 0.12 + t * 1.55, 0], w: (radius + 0.08) * k, h: (radius + 0.08) * k })), {
    sides: 14, ref: [0, 0, 1], capStart: 0, capEnd: 0.3, flat: true, radial: lumps(12, 0.04), token: TURF, shade: () => 0.86 + random() * 0.16
  });
  // Entrance passage with a gabled stone head.
  const front = radius + 0.95;
  for (const side of [-1, 1]) {
    timber(surface, [side * 0.78, 0.95, radius - 0.3], [side * 0.78, 0.95, front], [0.2, 0.95], WARM, { ref: [0, 1, 0], bevel: 0.04, shade: 0.9 + random() * 0.08 });
  }
  timber(surface, [0, 1.98, radius - 0.3], [0, 1.98, front + 0.06], [1.02, 0.1], COOL, { ref: [0, 1, 0], bevel: 0.03, shade: 0.96 });
  for (const side of [-1, 1]) {
    surface.addPanel({
      cols: 3, rows: 2, thickness: 0.06,
      point: (u, v) => new THREE.Vector3(side * THREE.MathUtils.lerp(0, 1.02, v), THREE.MathUtils.lerp(2.5, 2.08, v), THREE.MathUtils.lerp(radius - 0.3, front + 0.06, u)),
      token: () => TURF, shade: () => 0.86 + random() * 0.12
    });
  }
  // Strapped door set back in the passage mouth.
  for (let k = 0; k < 4; k += 1) {
    const x = -0.5 + 0.25 * (k + 0.5);
    timber(surface, [x, 0.02, front - 0.08], [x, 1.84, front - 0.08], [0.115, 0.03], TIMBER, { ref: [0, 0, 1], shade: 0.82 + random() * 0.16 });
  }
  for (const y of [0.45, 1.4]) {
    timber(surface, [-0.48, y, front - 0.03], [0.48, y, front - 0.03], [0.035, 0.012], IRON, { ref: [0, 0, 1] });
  }
  surface.addDisc([0.34, 0.95, front - 0.02], [0, 0, 1], 0.04, { token: IRON, sides: 6, dome: 0.02 });
  // Sledge of cut lake ice by the door.
  const sx = 1.75;
  const sz = front + 0.75;
  for (const side of [-1, 1]) {
    timber(surface, [sx + side * 0.36, 0.06, sz - 0.62], [sx + side * 0.36, 0.06, sz + 0.62], [0.05, 0.06], TIMBER, { ref: [0, 1, 0], halfEnd: [0.05, 0.035] });
  }
  for (const z of [-0.45, 0, 0.45]) {
    timber(surface, [sx - 0.44, 0.15, sz + z], [sx + 0.44, 0.15, sz + z], [0.05, 0.03], TIMBER, { ref: [0, 1, 0] });
  }
  for (const [x, z, y] of [[-0.2, -0.24, 0], [0.2, -0.24, 0], [-0.2, 0.24, 0], [0.2, 0.24, 0], [0, 0, 0.36]] as const) {
    timber(surface, [sx + x, 0.2 + y, sz + z - 0.19], [sx + x, 0.2 + y, sz + z + 0.19], [0.18, 0.17], ICE, { ref: [0, 1, 0], bevel: 0.04, shade: 0.92 + random() * 0.1 });
  }
  heap(surface, [-1.7, front + 0.55], 0.62, 0.55, STRAW, 13, 0.94);
  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}

/**
 * Salt pans. Six shallow beds walled with low clay bunds: the seaward row holds brine, the inner row
 * crusts white and shows its raked ridges. Harvested salt dries in a cone on boards with a wooden
 * rake leaning into it and filled sacks beside.
 */
export function createSaltPansModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: earth bund, brine, salt, crust, weathered timber, dark timber, burlap.
  const surface = new SurfaceBuilder(spec.palette);
  const CLAY = 0;
  const BRINE = 1;
  const SALT = 2;
  const CRUST = 3;
  const WEATHERED = 4;
  const DARK = 5;
  const BURLAP = 6;
  const cols = 3;
  const bedW = 2.1;
  const bedD = 1.7;
  const bund = 0.14;
  const totalW = cols * bedW + (cols + 1) * bund * 2;
  const totalD = 2 * bedD + 3 * bund * 2;
  const x0 = -totalW / 2;
  const z0 = -totalD / 2;
  // Bunds: long runs along X, short runs along Z.
  for (let r = 0; r <= 2; r += 1) {
    const z = z0 + bund + r * (bedD + bund * 2);
    timber(surface, [x0, 0.09, z], [x0 + totalW, 0.09, z], [bund, 0.09], CLAY, { ref: [0, 1, 0], bevel: 0.05, shade: 0.86 + random() * 0.12 });
  }
  for (let c = 0; c <= cols; c += 1) {
    const x = x0 + bund + c * (bedW + bund * 2);
    timber(surface, [x, 0.09, z0], [x, 0.09, z0 + totalD], [bund, 0.09], CLAY, { ref: [0, 1, 0], bevel: 0.05, shade: 0.84 + random() * 0.14 });
  }
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cx = x0 + bund * 2 + c * (bedW + bund * 2) + bedW / 2;
      const cz = z0 + bund * 2 + r * (bedD + bund * 2) + bedD / 2;
      // The seaward row (-Z) is still brine; the inner row has crusted.
      const brine = r === 0 && c !== 1;
      surface.addDisc([cx, 0.05, cz], [0, 1, 0], [bedD / 2, bedW / 2], { token: brine ? BRINE : CRUST, rect: true, up: [0, 0, 1], shade: brine ? 0.94 : 0.9 + random() * 0.08 });
      if (!brine) {
        for (let k = 0; k < 4; k += 1) {
          const z = cz - bedD / 2 + (k + 0.5) * (bedD / 4);
          timber(surface, [cx - bedW / 2 + 0.08, 0.07, z], [cx + bedW / 2 - 0.08, 0.07, z], [0.05, 0.02], SALT, { ref: [0, 1, 0], shade: 0.96 + random() * 0.06 });
        }
      }
    }
  }
  // Drying cone on boards, the rake leaning into it, sacks beside.
  const hx = x0 + totalW + 1.05;
  const hz = 0.2;
  for (let k = 0; k < 4; k += 1) {
    const z = hz - 0.7 + k * 0.47;
    timber(surface, [hx - 0.95, 0.03, z], [hx + 0.95, 0.03, z], [0.2, 0.03], WEATHERED, { ref: [0, 1, 0], shade: 0.82 + random() * 0.14 });
  }
  const cone = [[0, 0.82], [0.28, 0.66], [0.62, 0.38], [0.9, 0.1], [1, 0.02]] as const;
  surface.addLoft(cone.map(([t, k]): Station => ({ p: [hx, 0.06 + t * 0.95, hz], w: k, h: k })), {
    sides: 10, ref: [0, 0, 1], capStart: 0, capEnd: 0.4, flat: true, radial: lumps(21, 0.05), token: SALT, shade: () => 0.92 + random() * 0.1
  });
  rope(surface, [[hx - 0.2, 0.9, hz + 0.25], [hx - 1.35, 0.02, hz + 1.05]], 0.022, DARK, { sides: 5 });
  timber(surface, [hx - 1.55, 0.05, hz + 0.9], [hx - 1.15, 0.05, hz + 1.2], [0.03, 0.05], DARK, { bevel: 0.01 });
  sack(surface, [hx + 0.35, 0.03, hz + 1.05], [0.5, 0.4, 0.62], BURLAP, DARK, { seed: 22, yaw: 0.3 });
  sack(surface, [hx + 0.9, 0.03, hz + 0.75], [0.48, 0.4, 0.58], BURLAP, DARK, { seed: 23, yaw: -0.4, lean: 0.12 });
  root.add(surface.buildMesh(`${ID}_mesh`));
  // A bund-height footprint: walkable, but the meadow and scatter keep off the beds.
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}

/**
 * Timber stack. A pyramid of barked logs on bearers, chocked at the ends and showing sawn faces, and
 * beside it a stickered stack of sawn planks. A chopping block with an axe stands at the front corner.
 */
export function createTimberStackModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: bark, sawn face, plank, weathered bearer, iron.
  const surface = new SurfaceBuilder(spec.palette);
  const BARK = 0;
  const FACE = 1;
  const PLANK = 2;
  const BEARER = 3;
  const IRON = 4;
  // Log pile, logs along X on two bearers.
  const pileX = -1.35;
  const length = 3.9;
  for (const z of [-0.62, 0.62]) {
    timber(surface, [pileX - length / 2 + 0.3, 0.09, z], [pileX + length / 2 - 0.3, 0.09, z], [0.09, 0.09], BEARER, { ref: [0, 1, 0], bevel: 0.03, shade: 0.84 });
  }
  const rows = [4, 3, 2];
  const r = 0.21;
  for (let row = 0; row < rows.length; row += 1) {
    const count = rows[row];
    for (let k = 0; k < count; k += 1) {
      const z = (k - (count - 1) / 2) * r * 2.02;
      const y = 0.18 + r + row * r * 1.72;
      const radius = r * (0.92 + random() * 0.12);
      const shift = (random() - 0.5) * 0.24;
      const a = new THREE.Vector3(pileX - length / 2 + shift, y, z);
      const b = new THREE.Vector3(pileX + length / 2 + shift, y, z);
      surface.addLoft([{ p: v3(a), w: radius, h: radius }, { p: v3(b), w: radius * 0.96, h: radius * 0.96 }],
        { sides: 8, ref: [0, 1, 0], capStart: 0, capEnd: 0, flat: true, radial: lumps(row * 5 + k, 0.05), token: BARK, shade: 0.84 + random() * 0.16 });
      for (const [end, sign] of [[a, -1], [b, 1]] as const) {
        surface.addDisc([end.x + sign * 0.004, end.y, end.z], [sign, 0, 0], radius * 0.97, { token: FACE, sides: 8, shade: 0.94 + random() * 0.08 });
        surface.addDisc([end.x + sign * 0.008, end.y, end.z], [sign, 0, 0], radius * 0.45, { token: FACE, sides: 6, shade: 0.8 });
      }
    }
  }
  for (const x of [pileX - length / 2 + 0.35, pileX + length / 2 - 0.35]) {
    for (const side of [-1, 1]) {
      timber(surface, [x, 0.18, side * 0.95], [x, 0.44, side * 0.86], [0.07, 0.05], BEARER, { ref: [1, 0, 0], halfEnd: [0.07, 0.02] });
    }
  }
  // Sawn planks, stickered in layers.
  const stackX = 1.75;
  const plankLength = 2.6;
  for (const z of [-0.55, 0, 0.55]) {
    timber(surface, [stackX - plankLength / 2 + 0.2, 0.07, z], [stackX + plankLength / 2 - 0.2, 0.07, z], [0.07, 0.07], BEARER, { ref: [0, 1, 0], shade: 0.82 });
  }
  const layers = 5;
  for (let layer = 0; layer < layers; layer += 1) {
    const y = 0.17 + layer * 0.14;
    for (let k = 0; k < 5; k += 1) {
      const x = stackX - 0.72 + k * 0.36;
      timber(surface, [x, y, -plankLength / 2], [x, y, plankLength / 2], [0.16, 0.035], PLANK,
        { ref: [0, 1, 0], bevel: 0.008, shade: 0.84 + random() * 0.18 });
    }
    if (layer < layers - 1) {
      for (const z of [-0.95, 0, 0.95]) {
        timber(surface, [stackX - 0.9, y + 0.07, z], [stackX + 0.9, y + 0.07, z], [0.025, 0.025], BEARER, { ref: [0, 1, 0], shade: 0.8 });
      }
    }
  }
  // Chopping block and axe.
  const block = new THREE.Vector3(0.2, 0, 1.15);
  surface.addLoft([{ p: [block.x, 0, block.z], w: 0.26, h: 0.26 }, { p: [block.x, 0.48, block.z], w: 0.24, h: 0.24 }],
    { sides: 8, ref: [0, 0, 1], capStart: 0, capEnd: 0, flat: true, token: BARK, shade: 0.88 });
  surface.addDisc([block.x, 0.485, block.z], [0, 1, 0], 0.235, { token: FACE, sides: 8, shade: 0.92 });
  timber(surface, [block.x + 0.02, 0.5, block.z - 0.05], [block.x + 0.07, 0.5, block.z + 0.08], [0.02, 0.08], IRON, { ref: [0, 1, 0], halfEnd: [0.02, 0.055] });
  rope(surface, [[block.x + 0.045, 0.52, block.z + 0.02], [block.x + 0.2, 0.95, block.z + 0.3]], 0.022, PLANK, { sides: 5 });
  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
