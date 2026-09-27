import * as THREE from "three";
import { addCollisionMarkers, assembleLodLevels, type AuthoredModel, type GeneratorContext } from "../../kit";
import { Architecture } from "./architectureParts";

/** An offset cross-gable and a proper covered porch make the inn/farmhouse legible from the road. */
export function createFarmhouseModel({ spec, parameters: p, seed }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group(); root.name = spec.rootNode;
  const w = Number(p.width), d = Number(p.depth), base = 0.84, eave = base + Number(p.wallHeight);
  const roofWidth = d + 0.85, roofRise = Math.tan(THREE.MathUtils.degToRad(Number(p.roofPitchDeg))) * d / 2 + 0.14;
  const porchX = -1.6, porchW = Number(p.crossGableWidth), porchD = Number(p.porchDepth);
  const [STONE, PLASTER, WOOD, DARK, TILE, GLOW, WINDOW, IRON] = spec.palette.map((_, i) => i);
  assembleLodLevels(spec, root, level => {
    const a = new Architecture(spec.palette, level, seed), group = new THREE.Group();
    a.foundation(w, d, 0.76, STONE, Number(p.masonryCourses), Number(p.masonryBlocks) * 2);
    a.box([0, (base + eave) / 2, 0], [w - 0.12, eave - base, d - 0.12], PLASTER);
    for (const x of [-w / 2, -1.6, 0.15, w / 2]) for (const z of [-d / 2, d / 2]) {
      a.beam([x, 0.82, z], [x, eave + 0.04, z], [0.14, 0.14], WOOD);
      for (const y of [1.05, eave - 0.16]) a.pin([x, y, z + 0.15], [0, 0, 1], IRON);
    }
    for (const sign of [-1, 1]) {
      for (const y of [base + 0.13, eave - 0.10]) {
        a.beam([-w / 2 - 0.10, y, sign * d / 2], [w / 2 + 0.10, y, sign * d / 2], [0.12, 0.15], WOOD);
        a.beam([sign * w / 2, y, -d / 2], [sign * w / 2, y, d / 2], [0.12, 0.15], WOOD);
      }
      for (const z of [-d / 2, d / 2]) a.beam([sign * w / 2, eave - 1.0, z], [sign * (w / 2 - 0.68), eave - 0.15, z], [0.085, 0.085], WOOD);
      a.triangularGable([sign * w / 2, eave, 0], roofWidth, roofRise - 0.09, PLASTER, WOOD, sign * Math.PI / 2, 0.20);
      a.window([sign * (w / 2 + 0.075), 2.35, 1.4], 0.68, 1.02, WOOD, DARK, WINDOW, sign * Math.PI / 2);
      a.window([sign * (w / 2 + 0.075), 2.35, -1.4], 0.68, 1.02, WOOD, DARK, WINDOW, sign * Math.PI / 2);
    }
    // Main ridge runs east-west; the front dormer breaks it off-centre.
    a.roof([0, eave, 0], roofWidth, w + 0.75, roofRise, TILE, WOOD,
      Number(p.shingleRows), Number(p.shingleColumns), Math.PI / 2);
    a.triangularGable([porchX, eave + 0.07, d / 2 + 0.54], porchW, 1.95, PLASTER, WOOD);
    a.roof([porchX, eave + 0.05, d / 2 - 0.03], porchW + 0.46, 1.82, 2.01, TILE, WOOD, 7, 6);
    a.window([porchX, eave + 0.86, d / 2 + 0.62], 0.66, 0.77, WOOD, DARK, DARK);
    a.door([porchX, 1.03, d / 2 + 0.06], 1.1, 2.12, WOOD, DARK, IRON);
    for (const x of [0.91, 2.42]) a.window([x, 2.3, d / 2 + 0.08], 0.73, 1.1, WOOD, DARK, WINDOW);
    for (const x of [-2.0, 1.55]) a.window([x, 2.35, -d / 2 - 0.07], 0.92, 1.1, WOOD, DARK, DARK, Math.PI, true);
    const front = d / 2 + porchD;
    for (const x of [porchX - porchW / 2, porchX + porchW / 2]) {
      for (const z of [d / 2 + 0.12, front]) {
        a.box([x, 0.16, z], [0.43, 0.32, 0.43], STONE);
        a.beam([x, 0.30, z], [x, z === front ? 3.18 : 3.77, z], [0.13, 0.13], WOOD);
      }
      a.beam([x, 1.75, d / 2 + 0.10], [x, 1.75, front], [0.085, 0.095], WOOD);
      a.beam([x, 2.50, front], [x, 3.15, front - 0.6], [0.085, 0.085], WOOD);
      a.beam([x, 0.75, d / 2], [x, 0.75, front + 0.08], [0.115, 0.18], DARK);
    }
    const boards = a.count(Number(p.porchPlanks), 4, 2);
    for (let i = 0; i < boards; i++) a.box([porchX - porchW / 2 + (i + 0.5) * porchW / boards, 0.96, (d / 2 + front) / 2], [porchW / boards - 0.014, 0.18, porchD + 0.20], WOOD, a.shade());
    a.leanRoof([porchX, 3.75, (d / 2 + front) / 2], porchW + 0.45, porchD + 0.42, 0.58, TILE, WOOD, 5, 8);
    // Three freestanding timber treads keep the original porch silhouette and support datum.
    for (let i = 0; i < 3; i++) {
      const y = 0.22 + i * 0.25, z = front + 1.08 - i * 0.33;
      a.box([porchX, y, z], [1.72, 0.16, 0.42], WOOD);
      for (const sign of [-1, 1]) a.box([porchX + sign * 0.68, y / 2, z], [0.13, y, 0.22], DARK);
    }
    a.box([porchX - 0.96, 1.53, d / 2 + 0.58], [0.83, 0.13, 0.42], WOOD);
    for (const x of [porchX - 1.25, porchX - 0.66]) a.box([x, 1.22, d / 2 + 0.58], [0.10, 0.53, 0.30], DARK);
    // Preserve the runtime smoke attachment, which is authored against this flue lip.
    a.chimney([Number(p.chimneyOffsetX), 0, -0.35], Number(p.chimneyHeight), 0.94, 0.91, STONE, DARK, TILE, 0.47);
    a.beam([porchX + 0.79, 3.04, d / 2 + 0.22], [porchX + 0.79, 3.04, d / 2 + 0.60], [0.035, 0.04], IRON);
    const lantern = new Architecture(spec.palette, level, seed);
    a.lantern([porchX + 0.79, 2.38, d / 2 + 0.6], 0.58, IRON, GLOW, lantern);
    const lamp = lantern.mesh(level === 0 ? "farmhouse_lantern_glow" : `${spec.id}_LOD${level}_lantern`);
    group.add(lamp);
    group.add(a.mesh(`${spec.id}_LOD${level}_house`)); return group;
  });
  addCollisionMarkers(spec, root); return { root, clips: [] };
}

/** The cottage is a narrow, tall harbour house, with a sheltered door and a shuttered loft. */
export function createCottageModel({ spec, parameters: p, seed }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group(); root.name = spec.rootNode;
  const w = Number(p.width), d = Number(p.depth), eave = Number(p.wallHeight);
  const [STONE, PLASTER, WOOD, DARK, TILE, IRON, WINDOW, GLOW] = spec.palette.map((_, i) => i);
  assembleLodLevels(spec, root, level => {
    const a = new Architecture(spec.palette, level, seed);
    a.foundation(w, d, 0.56, STONE, 2, 6);
    a.box([0, (eave + 0.62) / 2, 0], [w - 0.09, eave - 0.62, d - 0.09], PLASTER);
    for (const z of [-d / 2, d / 2]) {
      for (const x of [-w / 2, -0.18, w / 2]) a.beam([x, 0.6, z], [x, eave + 0.10, z], [0.13, 0.13], WOOD);
      for (const y of [0.78, 3.05, eave]) a.beam([-w / 2 - 0.08, y, z], [w / 2 + 0.08, y, z], [0.13, 0.14], WOOD);
      for (const sign of [-1, 1]) a.beam([sign * w / 2, 3.18, z], [sign * (w / 2 - 0.85), eave - 0.08, z], [0.085, 0.085], WOOD);
      a.triangularGable([0, eave, z], w, Number(p.roofRise), PLASTER, WOOD, z < 0 ? Math.PI : 0);
      a.window([0, eave + 0.76, z + Math.sign(z) * 0.07], 0.68, 0.83, WOOD, DARK, DARK, z < 0 ? Math.PI : 0, true);
    }
    for (const side of [-1, 1]) {
      for (const z of [-1.30, 1.34]) {
        a.beam([side * w / 2, 0.66, z], [side * w / 2, eave, z], [0.11, 0.11], WOOD);
        a.window([side * (w / 2 + 0.05), 2.12, z], 0.84, 1.1, WOOD, DARK, WINDOW, side * Math.PI / 2, true);
      }
      for (const y of [0.78, 3.05, eave]) a.beam([side * w / 2, y, -d / 2], [side * w / 2, y, d / 2], [0.11, 0.13], WOOD);
    }
    a.roof([0, eave, 0], w + 0.88, d + 0.8, Number(p.roofRise) + 0.18, TILE, WOOD, 9, 13);
    a.door([-0.82, 0.65, d / 2 + 0.04], 0.94, 2.03, WOOD, DARK, IRON);
    a.window([1.17, 1.97, d / 2 + 0.065], 0.71, 1.07, WOOD, DARK, WINDOW);
    a.roof([-0.82, 2.97, d / 2 + 0.26], 1.95, 1.25, 0.64, TILE, WOOD, 3, 5);
    for (const x of [-1.58, -0.07]) a.beam([x, 2.33, d / 2 + 0.07], [x, 2.94, d / 2 + 0.76], [0.08, 0.08], WOOD);
    for (let i = 0; i < 2; i++) a.box([-0.82, 0.13 + i * 0.22, d / 2 + 0.65 - i * 0.26], [1.35, 0.24, 0.42], STONE);
    // The flue remains exactly under WorldScene's existing smoke socket.
    a.chimney([1.53, 4.70, 1.22], Number(p.chimneyHeight) - 4.70, 0.70, 0.72, TILE, DARK, TILE, 0.55);
    a.lantern([-1.73, 2.13, d / 2 + 0.27], 0.54, IRON, GLOW);
    a.beam([-1.73, 2.73, d / 2], [-1.73, 2.73, d / 2 + 0.3], [0.025, 0.035], IRON);
    // A shallow herb drying rack belongs to the wall, leaving the approach clear.
    a.box([1.15, 1.26, d / 2 + 0.23], [1.07, 0.27, 0.28], DARK);
    for (let i = 0; i < a.count(6, 3, 2); i++) a.box([0.71 + i * 0.88 / (a.count(6, 3, 2) - 1), 1.31, d / 2 + 0.39], [0.12, 0.28, 0.045], WOOD, a.shade());
    return a.mesh(`${spec.id}_LOD${level}_cottage`);
  });
  addCollisionMarkers(spec, root); return { root, clips: [] };
}
