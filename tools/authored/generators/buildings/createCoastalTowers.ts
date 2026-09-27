import * as THREE from "three";
import { addCollisionMarkers, assembleLodLevels, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";
import { Architecture } from "./architectureParts";

/** Banded navigation tower, keeper's cottage, bracketed gallery and open lantern cage. */
export function createLighthouseModel({ spec, parameters: p, seed }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group(); root.name = spec.rootNode;
  const h = Number(p.height), r = Number(p.baseRadius), galleryY = h - 3.0;
  const [STONE, WHITE, RED, BRASS, GLOW, WOOD] = spec.palette.map((_, i) => i);
  assembleLodLevels(spec, root, level => {
    const a = new Architecture(spec.palette, level, seed), group = new THREE.Group();
    const sides = Number(p.sides), bandCount = Number(p.bandCount), base = 1.38;
    a.cylinder([0, 0.03, 0], base - 0.06, r, r * 0.93, STONE, sides);
    for (let row = 0; row < a.count(Number(p.masonryCourses), 3, 2); row++) {
      const rows = a.count(Number(p.masonryCourses), 3, 2), count = a.count(Number(p.masonryBlocks) * 2, 14, 10);
      const yy = 0.04 + (row + 0.5) * (base - 0.1) / rows, rr = r * (1 - 0.06 * row / rows);
      for (let i = 0; i < count; i++) {
        const theta = (i + (row % 2) * 0.5) / count * Math.PI * 2, d = Math.PI / count * 0.97;
        a.beam([Math.sin(theta - d) * rr, yy, Math.cos(theta - d) * rr], [Math.sin(theta + d) * rr, yy, Math.cos(theta + d) * rr], [0.09, (base - 0.1) / rows * 0.46], STONE, a.shade(), [0, 1, 0]);
      }
    }
    a.cylinder([0, base - 0.04, 0], 0.17, r * 0.97, r * 0.94, STONE, sides);
    const radius = (y: number): number => THREE.MathUtils.lerp(r * 0.91, r * 0.51, (y - base) / (galleryY - base));
    for (let i = 0; i < bandCount; i++) {
      const y0 = base + i * (galleryY - base) / bandCount, y1 = base + (i + 1) * (galleryY - base) / bandCount;
      a.cylinder([0, y0, 0], y1 - y0, radius(y0), radius(y1), i % 2 ? RED : WHITE, sides);
    }
    // Windows alternate around the tower like a climbing stair, rather than a stack of decals.
    for (const [y, yaw] of [[3.6, -0.2], [5.8, Math.PI / 2], [8.25, 0.10]] as const) {
      const rr = radius(y) + 0.03;
      a.window([Math.sin(yaw) * rr, y, Math.cos(yaw) * rr], 0.44, 0.76, STONE, WOOD, WOOD, yaw);
    }
    a.cylinder([0, galleryY - 0.19, 0], 0.26, r * 0.55, r * 0.70, STONE, sides);
    a.cylinder([0, galleryY + 0.04, 0], 0.19, r * 0.76, r * 0.76, STONE, sides);
    for (let i = 0; i < sides; i++) {
      const angle = i / sides * Math.PI * 2, pt = (radius: number, y: number): V3 => [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
      a.beam(pt(r * 0.52, galleryY - 0.52), pt(r * 0.72, galleryY + 0.02), [0.09, 0.10], STONE);
    }
    const balusters = a.count(24, 12, 12), galleryR = r * 0.72;
    for (let i = 0; i < balusters; i++) {
      const t = i / balusters * Math.PI * 2;
      a.rod([Math.sin(t) * galleryR, galleryY + 0.22, Math.cos(t) * galleryR], [Math.sin(t) * galleryR, galleryY + 1.01, Math.cos(t) * galleryR], 0.031, BRASS);
    }
    for (const y of [galleryY + 0.39, galleryY + 1.01]) a.ring([0, y, 0], galleryR, 0.065, 0.065, BRASS, balusters);
    const lanternR = r * 0.45, cageBase = galleryY + 0.25, cageTop = h - 0.68;
    a.cylinder([0, cageBase, 0], 0.16, lanternR * 1.07, lanternR * 1.07, WOOD, 12);
    for (let i = 0; i < 12; i++) {
      const t = i / 12 * Math.PI * 2;
      a.rod([Math.sin(t) * lanternR, cageBase + 0.13, Math.cos(t) * lanternR], [Math.sin(t) * lanternR, cageTop, Math.cos(t) * lanternR], 0.043, BRASS);
    }
    for (const y of [cageBase + 0.56, cageBase + 1.13, cageTop]) a.ring([0, y, 0], lanternR, 0.075, 0.07, BRASS, 12);
    a.cylinder([0, cageTop, 0], 0.16, lanternR * 1.20, lanternR * 1.19, BRASS, 12);
    a.cylinder([0, cageTop + 0.16, 0], 0.78, lanternR * 1.21, 0.17, RED, 12);
    a.cylinder([0, cageTop + 0.93, 0], 0.22, 0.17, 0.09, BRASS, 8);
    a.rod([0, cageTop + 1.15, 0], [0, cageTop + 1.40, 0], 0.025, BRASS);
    const light = new Architecture(spec.palette, level, seed);
    light.cylinder([0, -0.57, 0], 1.14, 0.24, 0.24, GLOW, 12);
    for (let j = 0; j < a.count(7, 4, 3); j++) light.ring([0, -0.43 + j * 0.86 / (a.count(7, 4, 3) - 1), 0], 0.32, 0.07, 0.075, GLOW, 12);
    const beacon = light.mesh(level === 0 ? "lighthouse_lantern_beacon" : `${spec.id}_LOD${level}_beacon`);
    beacon.position.set(0, cageBase + 0.91, 0); group.add(beacon);
    const cx = 1.70, cz = 0.89, cw = Number(p.cottageWidth), cd = 2.63, ct = 2.84;
    a.box([cx, ct / 2, cz], [cw, ct, cd], WHITE);
    for (const sign of [-1, 1]) {
      a.masonry([cx, 0.02, cz + sign * cd / 2], cw, 0.59, 0.15, 2, 7, STONE, sign < 0 ? Math.PI : 0);
      a.triangularGable([cx, ct, cz + sign * cd / 2], cw, 1.13, WHITE, WOOD, sign < 0 ? Math.PI : 0);
      for (let i = 0; i < a.count(7, 4, 3); i++) {
        const y = 0.23 + i * 2.40 / (a.count(7, 4, 3) - 1);
        for (const x of [cx - cw / 2, cx + cw / 2]) a.box([x, y, cz + sign * cd / 2], [0.37 + 0.1 * (i % 2), 0.28, 0.31], STONE, a.shade());
      }
    }
    a.roof([cx, ct + 0.03, cz], cw + 0.49, cd + 0.52, 1.23, RED, WOOD, 7, 9);
    a.door([cx - 0.15, 0.14, cz + cd / 2 + 0.06], 0.81, 1.87, WOOD, STONE, BRASS);
    a.window([cx + cw / 2 + 0.06, 1.65, cz + 0.44], 0.59, 0.94, WOOD, WOOD, WOOD, Math.PI / 2);
    a.window([cx + cw / 2 + 0.06, 1.65, cz - 0.83], 0.59, 0.94, WOOD, WOOD, WOOD, Math.PI / 2);
    a.window([cx, 3.20, cz + cd / 2 + 0.07], 0.38, 0.42, WOOD, WOOD, WOOD);
    a.box([cx - 0.15, 0.08, cz + cd / 2 + 0.34], [1.19, 0.16, 0.52], STONE);
    a.chimney([cx + 0.73, 2.45, cz - 0.82], 2.22, 0.44, 0.45, STONE, WOOD, RED);
    group.add(a.mesh(`${spec.id}_LOD${level}_tower`)); return group;
  });
  addCollisionMarkers(spec, root); return { root, clips: [] };
}

/** Stone-footed smock mill. The four sail assemblies rotate as one authored pivot in every LOD. */
export function createWindmillModel({ spec, parameters: p, seed }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group(); root.name = spec.rootNode;
  const h = Number(p.height), r = Number(p.baseRadius), base = h * 0.34;
  const [STONE, WOOD, TURF, CLOTH, DARK] = spec.palette.map((_, i) => i);
  assembleLodLevels(spec, root, level => {
    const group = new THREE.Group(), a = new Architecture(spec.palette, level, seed);
    const sides = Number(p.sides), courses = a.count(7, 5, 3), blocks = a.count(20, 12, 10);
    a.cylinder([0, 0.01, 0], base, r * 0.96, r * 0.85, STONE, sides);
    for (let row = 0; row < courses; row++) for (let i = 0; i < blocks; i++) {
      const radius = r * (0.985 - row / courses * 0.10), y = (row + 0.5) * base / courses;
      const t = (i + (row % 2) * 0.5) / blocks * Math.PI * 2, dt = Math.PI / blocks * 0.97;
      a.beam([Math.sin(t - dt) * radius, y, Math.cos(t - dt) * radius], [Math.sin(t + dt) * radius, y, Math.cos(t + dt) * radius], [0.065, base / courses * 0.47], STONE, a.shade(), [0, 1, 0]);
    }
    a.cylinder([0, base - 0.08, 0], 0.20, r * 0.96, r * 0.96, STONE, sides);
    const lowR = r * 0.85, highR = r * 0.61;
    a.cylinder([0, base + 0.11, 0], h - base, lowR, highR, WOOD, sides, 0.9);
    // Each smock face has its own horizontal clapboard laps and structural uprights.
    const rows = a.count(15, 7, 3);
    for (let row = 0; row < rows; row++) {
      const y = base + 0.11 + row * (h - base) / rows, radius = THREE.MathUtils.lerp(lowR, highR, row / rows) + 0.034;
      a.ring([0, y + (h - base) / rows * 0.5, 0], radius, 0.073, (h - base) / rows - 0.012, WOOD, sides);
    }
    for (let i = 0; i < sides; i++) {
      const t = i * Math.PI * 2 / sides, pt = (radius: number, y: number): V3 => [Math.cos(t) * radius, y, Math.sin(t) * radius];
      a.beam(pt(lowR + 0.065, base + 0.16), pt(highR + 0.065, h + 0.08), [0.07, 0.07], DARK);
      if (level < 2) {
        const t1 = (i + 1) * Math.PI * 2 / sides;
        const lowBraceR = THREE.MathUtils.lerp(lowR, highR, 1.02 / (h - base)) + 0.12;
        a.beam(pt(lowBraceR, base + 1.02), [Math.cos(t1) * (highR + 0.16), h - 0.31, Math.sin(t1) * (highR + 0.16)], [0.042, 0.046], DARK);
      }
    }
    for (const y of [base + 0.18, h * 0.68, h + 0.1]) {
      const radius = THREE.MathUtils.lerp(lowR, highR, (y - base) / (h - base)) + 0.12;
      a.ring([0, y, 0], radius, 0.16, 0.17, DARK, sides);
    }
    a.door([0, 0.12, r * 0.985], 1.08, 2.02, WOOD, DARK);
    a.box([0, 0.06, r + 0.22], [1.49, 0.12, 0.49], STONE);
    for (const side of [-1, 1]) a.window([side * 1.76, 4.20, 0], 0.66, 0.84, DARK, DARK, CLOTH, side * Math.PI / 2);
    a.window([0, 5.25, -1.68], 0.64, 0.81, DARK, DARK, CLOTH, Math.PI);
    const capBase = h + 0.15, capR = r * 0.79;
    a.cylinder([0, capBase, 0], 0.18, capR, capR, DARK, sides);
    const capRows = a.count(6, 3, 2);
    for (let row = 0; row < capRows; row++) {
      const t0 = row / capRows, t1 = (row + 1) / capRows;
      a.cylinder([0, capBase + 0.18 + t0 * 1.30, 0], (t1 - t0) * 1.30 + 0.025,
        capR * (1 - t0) + 0.055, capR * (1 - t1) + 0.055, TURF, sides, 0.9 + (row % 3) * 0.035);
    }
    a.rod([0, capBase + 1.51, 0], [0, capBase + 1.88, 0], 0.038, DARK);
    // The complete swept disc clears both the roof and tower, even when viewed from behind.
    const hubY = h * 0.81, hubZ = r + 0.53, reach = h * 0.445;
    a.rod([0, hubY, highR], [0, hubY, hubZ], 0.16, DARK);
    const rotor = new THREE.Group(); rotor.name = level ? `${spec.id}_LOD${level}_rotor` : "windmill_rotor";
    rotor.position.set(0, hubY, hubZ);
    const b = new Architecture(spec.palette, level, seed);
    b.rod([0, 0, -0.18], [0, 0, 0.20], 0.30, DARK);
    b.rod([0, 0, 0.19], [0, 0, 0.28], 0.18, STONE);
    for (let sail = 0; sail < 4; sail++) {
      const angle = Math.PI / 4 + sail * Math.PI / 2;
      const f = (rad: number, off: number, z: number): V3 => [Math.cos(angle) * rad - Math.sin(angle) * off, Math.sin(angle) * rad + Math.cos(angle) * off, z];
      b.beam(f(0.10, 0, 0), f(reach + 0.04, 0, 0), [0.075, 0.065], WOOD);
      for (const off of [0.12, 0.82]) b.beam(f(reach * 0.29, off, 0), f(reach, off, 0), [0.035, 0.034], DARK);
      const rungs = a.count(12, 6, 4);
      for (let i = 0; i < rungs; i++) {
        const rad = reach * (0.29 + 0.71 * i / (rungs - 1));
        b.beam(f(rad, -0.07, 0.01), f(rad, 0.90, 0.01), [0.026, 0.028], WOOD);
      }
      // Sailcloth is a closed, shallow billow: broad folds, stitched hems, no transparent cutout.
      b.surface.addPanel({ cols: a.count(4, 2, 1), rows: a.count(9, 4, 2), thickness: 0.012,
        point: (u, v) => new THREE.Vector3(...f(reach * (0.34 + 0.61 * v), 0.17 + 0.59 * u,
          0.048 + 0.072 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI))), token: () => CLOTH,
        shade: (u, v) => 0.92 + 0.07 * Math.sin(u * Math.PI) * Math.cos(v * Math.PI * 4) });
      if (level < 2) for (const v of [0, 1]) b.rod(f(reach * (0.34 + 0.61 * v), 0.16, 0.07), f(reach * (0.34 + 0.61 * v), 0.77, 0.07), 0.014, WOOD);
      if (a.fine) for (let i = 0; i < 5; i++) for (const off of [0.13, 0.8]) b.rod(f(reach * (0.35 + i * 0.15), off - 0.025, 0.06), f(reach * (0.35 + i * 0.15), off + 0.025, 0.06), 0.013, DARK);
    }
    rotor.add(b.mesh(level ? `${spec.id}_LOD${level}_sails` : "windmill_sail_canvas"));
    const hub = new THREE.Object3D(); hub.name = level ? `${spec.id}_LOD${level}_hub` : "windmill_hub"; rotor.add(hub);
    group.add(a.mesh(`${spec.id}_LOD${level}_mill`), rotor); return group;
  });
  addCollisionMarkers(spec, root); return { root, clips: [] };
}
