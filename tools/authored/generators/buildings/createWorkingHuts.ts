import * as THREE from "three";
import { addCollisionMarkers, assembleLodLevels, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";
import { rope } from "../props/parts";
import { Architecture } from "./architectureParts";

/** The harbour's two working huts share joinery, not a sealed box. The exact floor and wall
 * datums come from the existing collision contract, including the low central threshold. */
export function createCoastalHutModel({ spec, parameters: p, seed }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group(); root.name = spec.rootNode;
  const w = Number(p.width), d = Number(p.depth), top = Number(p.wallHeight) + 0.24;
  const store = p.form === "store", [WOOD, DARK, WEATHERED] = spec.palette.map((_, i) => i);
  assembleLodLevels(spec, root, level => {
    const a = new Architecture(spec.palette, level, seed);
    const floorBoards = a.count(18, 9, 4);
    for (let i = 0; i < floorBoards; i++) a.box([-w / 2 + (i + 0.5) * w / floorBoards, 0.12, 0], [w / floorBoards - 0.009, 0.24, d], WEATHERED, a.shade());
    a.box([0, 0.105, d / 2 + 0.26], [1.65, 0.21, 0.55], WEATHERED);
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) {
      a.box([x, 0.18, z], [0.34, 0.36, 0.34], DARK);
      a.beam([x, 0.24, z], [x, top + 0.12, z], [0.115, 0.115], WOOD);
      a.box([x, top - 0.02, z], [0.41, 0.20, 0.31], DARK);
      a.pin([x, top - 0.04, z + 0.165], [0, 0, 1], WEATHERED);
    }
    const boardWall = (origin: V3, span: number, yaw: number, window: boolean, door = false): void => {
      const f = a.frame(origin, yaw), n = a.count(Math.ceil(span / 0.24), Math.ceil(span / 0.47), 5);
      for (let i = 0; i < n; i++) {
        const l = -span / 2 + i * span / n, r = l + span / n;
        // Split boards at exact opening jambs; no plank bridges a doorway at a lower LOD.
        const cuts = [l, r, ...(door ? [-0.72, 0.72] : window ? [-0.66, 0.66] : [])].filter(x => x >= l && x <= r).sort((x, y) => x - y);
        for (let c = 0; c < cuts.length - 1; c++) {
          const left = cuts[c], right = cuts[c + 1], x = (left + right) / 2;
          if (right - left < 0.01) continue;
          if (door && Math.abs(x) < 0.72) {
            a.faceBeam(f, [x, 2.25, 0], [x, top - 0.09, 0], right - left - 0.008, 0.10, WEATHERED);
          } else if (window && Math.abs(x) < 0.66) {
            a.faceBeam(f, [x, 0.24, 0], [x, 1.23, 0], right - left - 0.008, 0.10, WOOD);
            a.faceBeam(f, [x, 2.11, 0], [x, top - 0.08, 0], right - left - 0.008, 0.10, WOOD);
          } else a.faceBeam(f, [x, 0.24, 0], [x, top - 0.08, 0], right - left - 0.008, 0.10, WOOD);
        }
      }
      for (const y of [0.35, top - 0.13]) {
        if (door && y < 1) {
          a.beam(f(-span / 2, y, 0), f(-0.72, y, 0), [0.075, 0.08], DARK);
          a.beam(f(0.72, y, 0), f(span / 2, y, 0), [0.075, 0.08], DARK);
        } else a.beam(f(-span / 2, y, 0), f(span / 2, y, 0), [0.075, 0.08], DARK);
      }
      if (window) {
        for (const x of [-0.70, 0, 0.70]) a.faceBeam(f, [x, 1.20, 0.065], [x, 2.14, 0.065], 0.075, 0.12, DARK);
        for (const y of [1.20, 2.14]) a.faceBeam(f, [-0.76, y, 0.06], [0.76, y, 0.06], 0.11, y < 2 ? 0.30 : 0.12, WEATHERED);
      }
    };
    boardWall([0, 0, -d / 2], w, Math.PI, false);
    for (const side of [-1, 1]) boardWall([side * w / 2, 0, 0], d, side * Math.PI / 2, true);
    if (store) {
      boardWall([0, 0, d / 2], w, 0, false, true);
      // Open shutters hang flat against the front wall, clear of the existing 1.44m door.
      for (const sign of [-1, 1]) {
        a.faceBeam(a.frame([sign * 1.07, 0, d / 2 + 0.10]), [0, 0.28, 0], [0, 2.23, 0], 0.55, 0.06, DARK);
        for (const y of [0.61, 1.94]) a.beam([sign * 0.82, y, d / 2 + 0.16], [sign * 1.31, y, d / 2 + 0.16], [0.035, 0.045], WEATHERED);
      }
      a.beam([-0.81, 2.27, d / 2 + 0.06], [0.81, 2.27, d / 2 + 0.06], [0.11, 0.11], DARK);
    }
    const rise = Math.tan(THREE.MathUtils.degToRad(Number(p.roofPitch))) * w / 2;
    for (const z of [-d / 2, d / 2]) {
      a.beam([-w / 2 - 0.06, top, z], [w / 2 + 0.06, top, z], [0.13, 0.13], WOOD);
      a.beam([0, top, z], [0, top + rise, z], [0.08, 0.09], DARK);
      for (const side of [-1, 1]) {
        a.beam([side * w / 2, top, z], [0, top + rise, z], [0.10, 0.10], WOOD);
        a.beam([side * w / 2, top - 0.63, z], [side * (w / 2 - 0.65), top, z], [0.09, 0.09], WOOD);
      }
    }
    a.roof([0, top + 0.04, 0], w + 0.62, d + 0.78, rise + 0.07, DARK, WEATHERED, 6, 11);
    // Shallow racks occupy the existing rear-wall thickness, not the navigable floor.
    for (const y of [0.95, 1.58]) {
      a.box([0, y, -d / 2 + 0.14], [w * 0.7, 0.085, 0.25], WEATHERED);
      for (const x of [-w * 0.29, w * 0.29]) a.beam([x, y - 0.28, -d / 2 + 0.06], [x, y, -d / 2 + 0.25], [0.045, 0.045], DARK);
    }
    if (a.fine) {
      const z = -d / 2 + 0.22;
      for (let i = 0; i < 5; i++) {
        const x = -w * 0.26 + i * w * 0.13;
        a.box([x, 1.78, z], [0.22, 0.32 + (i % 2) * 0.08, 0.17], WEATHERED, a.shade());
        a.box([x, 1.90 + (i % 2) * 0.04, z], [0.13, 0.06, 0.13], DARK);
      }
      // A few broad hanging rope turns are readable through the open work bay.
      for (let turn = 0; turn < 3; turn++) {
        const points = Array.from({ length: 15 }, (_, i): V3 => {
          const angle = i / 14 * Math.PI * 2;
          return [w * 0.29 + Math.cos(angle) * (0.15 + turn * 0.022), 1.96 + Math.sin(angle) * 0.22, z + turn * 0.021];
        });
        rope(a.surface, points, 0.017, WEATHERED, { sides: 4, caps: false });
      }
    }
    return a.mesh(`${spec.id}_LOD${level}_hut`);
  });
  addCollisionMarkers(spec, root); return { root, clips: [] };
}

export function createToolShedModel({ spec, parameters: p, seed }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group(); root.name = spec.rootNode;
  const w = Number(p.width), d = Number(p.depth), base = Number(p.foundationHeight), wall = Number(p.wallHeight);
  const [STONE, WOOD, DARK, TILE] = spec.palette.map((_, i) => i);
  assembleLodLevels(spec, root, level => {
    const a = new Architecture(spec.palette, level, seed), top = base + wall;
    const slope = Math.tan(THREE.MathUtils.degToRad(Number(p.roofPitchDeg))), backRise = slope * d;
    a.foundation(w, d, base, STONE, Number(p.masonryCourses), Number(p.masonryBlocks) * 2);
    a.box([0, (base + top) / 2, 0], [w - 0.08, wall, d - 0.08], DARK, 0.84);
    for (const sign of [-1, 1]) {
      const n = a.count(12, 6, 3);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * w / n;
        a.box([x, (base + top) / 2, sign * d / 2], [w / n - 0.016, wall, 0.075], WOOD, a.shade());
        const z = -d / 2 + (i + 0.5) * d / n, h = wall + (0.5 - z / d) * backRise;
        a.box([sign * w / 2, base + h / 2, z], [0.075, h, d / n - 0.013], WOOD, a.shade());
      }
      for (const z of [-d / 2, d / 2]) a.beam([sign * w / 2, base, z], [sign * w / 2, top + (z < 0 ? backRise : 0), z], [0.10, 0.10], DARK);
      a.beam([sign * w / 2, base + 0.15, -d / 2], [sign * w / 2, base + 0.15, d / 2], [0.085, 0.1], DARK);
    }
    a.box([0, top + backRise / 2, -d / 2], [w, backRise, 0.075], WOOD);
    a.leanRoof([0, top + backRise + slope * 0.275, 0], w + Number(p.roofOverhang) * 2, d + 0.55, slope * (d + 0.55), TILE, DARK, Number(p.shingleRows) + 1, Number(p.shingleColumns) + 2);
    a.door([-0.45, base + 0.08, d / 2 + 0.08], Number(p.doorWidth), Number(p.doorHeight), WOOD, DARK);
    a.window([0.73, 1.67, d / 2 + 0.075], 0.46, 0.53, DARK, DARK, WOOD);
    a.box([-0.45, 0.12, d / 2 + 0.26], [1.11, 0.24, 0.45], STONE);
    // Implements hang flush against the side; no loose props extend the solid footprint.
    a.beam([w / 2 + 0.085, 1.70, -0.73], [w / 2 + 0.085, 1.70, 0.70], [0.05, 0.065], DARK);
    for (const [i, z] of [-0.64, -0.12, 0.43].entries()) {
      a.rod([w / 2 + 0.14, 0.63, z], [w / 2 + 0.14, 1.91, z + 0.10], 0.031, WOOD);
      a.rod([w / 2 + 0.07, 1.76, z + 0.08], [w / 2 + 0.21, 1.76, z + 0.08], 0.025, DARK);
      if (i === 0) {
        a.beam([w / 2 + 0.14, 0.69, z - 0.22], [w / 2 + 0.14, 0.69, z + 0.22], [0.035, 0.035], DARK);
        for (let tooth = 0; tooth < a.count(5, 3, 3); tooth++) {
          const zz = z - 0.19 + tooth * 0.38 / (a.count(5, 3, 3) - 1);
          a.rod([w / 2 + 0.14, 0.68, zz], [w / 2 + 0.19, 0.49, zz], 0.021, DARK);
        }
      } else if (i === 1) {
        a.surface.addHull([[w / 2 + 0.11, 0.74, z - 0.14], [w / 2 + 0.11, 0.74, z + 0.14], [w / 2 + 0.13, 0.46, z],
          [w / 2 + 0.18, 0.74, z - 0.14], [w / 2 + 0.18, 0.74, z + 0.14], [w / 2 + 0.20, 0.46, z]], {token: DARK});
      } else a.box([w / 2 + 0.20, 0.65, z], [0.20, 0.045, 0.24], DARK);
    }
    return a.mesh(`${spec.id}_LOD${level}_shed`);
  });
  addCollisionMarkers(spec, root); return { root, clips: [] };
}

/** Dry-stone cold vault: a ring of actual voussoirs, turf shoulders and a raised meltwater sill. */
export function createIceHouseModel({ spec, parameters: p, seed }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group(); root.name = spec.rootNode;
  const r = Number(p.radius), wall = Number(p.wallHeight), [STONE, COOL, TURF, WOOD, IRON, ICE, STRAW, BANK] = spec.palette.map((_, i) => i);
  assembleLodLevels(spec, root, level => {
    const a = new Architecture(spec.palette, level, seed), sides = a.count(24, 14, 10);
    a.cylinder([0, 0, -0.25], wall, r - 0.09, r - 0.15, COOL, sides, 0.86);
    const rows = a.count(5, 3, 2);
    for (let row = 0; row < rows; row++) for (let i = 0; i < sides; i++) {
      const angle = (i + (row % 2) * 0.5) / sides * Math.PI * 2, step = Math.PI / sides * 0.97;
      const y = (row + 0.5) * wall / rows;
      a.beam([Math.sin(angle - step) * r, y, -0.25 + Math.cos(angle - step) * r], [Math.sin(angle + step) * r, y, -0.25 + Math.cos(angle + step) * r], [0.14, wall / rows * 0.48], row % 3 === 0 ? COOL : STONE, a.shade(), [0, 1, 0]);
    }
    a.surface.addLoft([[0, 1], [0.25, 0.96], [0.58, 0.77], [0.84, 0.44], [1, 0.15]].map(([t, k]) => ({
      p: [-0.06 * t, wall + t * 1.30, -0.25 - t * 0.25] as V3, w: (r + 0.13) * k, h: (r + 0.13) * k
    })), { sides: a.count(18, 12, 8), ref: [0, 0, 1], capStart: 0, capEnd: 0.08, flat: true, token: TURF,
      shade: f => 0.9 + Math.sin(f.theta * 3) * 0.04 });
    // Turf shoulders stay inside the pre-existing solid body, not over the front apron.
    a.surface.addLoft([{ p: [0, 0.02, -1.18], w: r + 0.08, h: 1.34 }, { p: [0, 0.64, -1.18], w: r * 0.88, h: 1.25 }, { p: [0, 1.22, -0.98], w: r * 0.55, h: 0.83 }],
      { sides: a.count(14, 10, 8), ref: [0, 0, 1], capStart: 0, capEnd: 0.1, flat: true, token: BANK });
    const front = 2.49;
    for (const side of [-1, 1]) {
      a.box([side * 0.76, 0.81, 1.79], [0.43, 1.62, 1.39], COOL);
      a.masonry([side * 0.76, 0, front], 0.44, 1.52, 0.23, 5, 1, STONE);
      a.masonry([side * 0.99, 0, 1.79], 1.40, 1.57, 0.12, 5, 4, STONE, side * Math.PI / 2);
    }
    const segments = a.count(13, 9, 7), crown = 1.45;
    for (let i = 0; i < segments; i++) {
      const t0 = i * Math.PI / segments + 0.008, t1 = (i + 1) * Math.PI / segments - 0.008;
      const point = (angle: number, radius: number, z: number): V3 => [Math.cos(angle) * radius, crown + Math.sin(angle) * radius, z];
      a.surface.addHull([point(t0, 0.58, 1.18), point(t1, 0.58, 1.18), point(t0, 0.94, 1.18), point(t1, 0.94, 1.18),
        point(t0, 0.58, front + 0.12), point(t1, 0.58, front + 0.12), point(t0, 0.94, front + 0.12), point(t1, 0.94, front + 0.12)],
      { token: i === Math.floor(segments / 2) ? COOL : STONE, shade: a.shade() });
    }
    a.door([0, 0.12, 2.34], 1.08, 1.71, WOOD, COOL, IRON);
    a.box([0, 0.10, 2.74], [1.32, 0.2, 0.37], COOL);
    a.box([0, 1.66, 2.46], [0.74, 0.20, 0.035], IRON);
    // Snowflake maker's mark, broad enough to read above the iron strap.
    for (let arm = 0; arm < 3; arm++) {
      const angle = arm * Math.PI / 3;
      a.beam([Math.cos(angle) * -0.17, 1.67 + Math.sin(angle) * -0.17, 2.49], [Math.cos(angle) * 0.17, 1.67 + Math.sin(angle) * 0.17, 2.49], [0.018, 0.018], ICE);
    }
    // Cold-air chimney with a capped rain hood, kept inside the original 3.1m height.
    a.cylinder([-0.10, 2.62, -0.55], 0.27, 0.20, 0.18, COOL, 8);
    for (const x of [-0.26, 0.06]) a.rod([x, 2.88, -0.55], [x, 3.0, -0.55], 0.022, IRON);
    a.cylinder([-0.10, 3.0, -0.55], 0.10, 0.28, 0.055, COOL, 8);
    // A compact sled and straw stay beside the door within the existing body footprint.
    for (const x of [1.27, 1.76]) a.beam([x, 0.09, 1.77], [x, 0.09, 2.8], [0.055, 0.07], WOOD);
    a.box([1.51, 0.22, 2.29], [0.72, 0.12, 0.93], WOOD);
    a.box([1.51, 0.32, 2.29], [0.66, 0.09, 0.87], STRAW);
    for (const x of [1.35, 1.68]) for (const z of [2.10, 2.51]) a.box([x, 0.54, z], [0.30, 0.36, 0.37], ICE, a.shade());
    for (const z of [2.1, 2.5]) a.beam([1.12, 0.73, z], [1.9, 0.73, z], [0.023, 0.024], WOOD);
    return a.mesh(`${spec.id}_LOD${level}_vault`);
  });
  addCollisionMarkers(spec, root); return { root, clips: [] };
}
