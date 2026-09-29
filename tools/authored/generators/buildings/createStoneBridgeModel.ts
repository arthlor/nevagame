import * as THREE from "three";
import { addCollisionMarkers, assembleLodLevels, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";
import { Architecture } from "./architectureParts";

/**
 * Vaults under the cobbled road. The channel vault is centered on the river
 * thalweg in this asset's local frame (bridge root at `BRIDGE_CENTER`) and is
 * tall enough for a rowboat or skiff hull. The west vault stays over the
 * scoured bank. Collider tops, not a decorative parabola, own the road surface.
 */
export const STONE_BRIDGE_CHANNEL_ARCH = Object.freeze({ center: 1.46, rx: 3.15, ry: 2.68 });
export const STONE_BRIDGE_WEST_ARCH = Object.freeze({ center: -4.55, rx: 1.7, ry: 2.35 });
export const STONE_BRIDGE_SPRING = 0.32;
export const STONE_BRIDGE_PIERS = Object.freeze([
  { id: "pier_west", x: -6.68, width: 0.86 },
  { id: "pier_channel", x: -2.27, width: 0.9 },
  { id: "pier_east", x: 6.68, width: 0.86 }
]);

/** A pair of true barrel vaults under a cobbled road. */
export function createStoneBridgeModel({ spec, parameters: p, seed }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group(); root.name = spec.rootNode;
  const length = Number(p.length), width = Number(p.width), archCount = Number(p.archCount);
  const decks = spec.collisionPrimitives!.filter(box => box.id.startsWith("deck") || box.id === "main").sort((a, b) => a.center[0] - b.center[0]);
  if (!decks.length) throw new Error(`${spec.id}: the bridge needs its authoritative deck primitives`);
  const surfaceY = (x: number): number => {
    const box = decks.find(d => x >= d.center[0] - d.halfExtents[0] - 0.001 && x <= d.center[0] + d.halfExtents[0] + 0.001) ?? decks[x < 0 ? 0 : decks.length - 1];
    return box.center[1] + box.halfExtents[1];
  };
  if (archCount !== 2) throw new Error(`${spec.id}: the bridge is authored as two vaults`);
  const spring = STONE_BRIDGE_SPRING;
  const arches = [STONE_BRIDGE_WEST_ARCH, STONE_BRIDGE_CHANNEL_ARCH];
  const [GOLD, STONE, WOOD, DARK, GLOW] = spec.palette.map((_, i) => i);
  assembleLodLevels(spec, root, level => {
    const a = new Architecture(spec.palette, level, seed);
    // Abutments bookend the span. The channel pier stands in the gap between
    // the west vault and the taller arch over the thalweg.
    for (const [index, pier] of STONE_BRIDGE_PIERS.entries()) {
      const x = pier.x, pierW = pier.width;
      const pierHeight = surfaceY(x) - 0.12;
      a.box([x, pierHeight / 2, 0], [pierW, pierHeight, width - 0.10], STONE, 0.91);
      if (index !== 1) a.masonry([x + (index === 0 ? -1 : 1) * pierW / 2, 0, 0], width - 0.12, pierHeight,
        0.15, 6, 7, STONE, index === 0 ? -Math.PI / 2 : Math.PI / 2);
      for (const side of [-1, 1]) {
        a.masonry([x, 0, side * (width / 2 - 0.04)], pierW, 1.28, 0.32, Number(p.masonryCourses) + 1, 3, STONE, side < 0 ? Math.PI : 0);
        a.surface.addHull([[x - pierW * 0.48, 0.02, side * width * 0.43], [x + pierW * 0.48, 0.02, side * width * 0.43],
          [x, 0.02, side * (width / 2 + 0.24)], [x - pierW * 0.40, 0.79, side * width * 0.46],
          [x + pierW * 0.40, 0.79, side * width * 0.46], [x, 0.96, side * (width / 2 + 0.13)]], { token: GOLD, shade: 0.95 });
      }
    }
    for (const arch of arches) {
      const { center: cx, rx, ry } = arch;
      const voussoirs = a.count(19, 13, 9), courses = a.count(7, 3, 2);
      for (let k = 0; k < voussoirs; k++) for (let row = 0; row < courses; row++) {
        const t0 = k * Math.PI / voussoirs + 0.002, t1 = (k + 1) * Math.PI / voussoirs - 0.002;
        const z0 = -width / 2 + row * width / courses + 0.007, z1 = -width / 2 + (row + 1) * width / courses - 0.007;
        const at = (t: number, outer: boolean, z: number): V3 => [cx + Math.cos(t) * (rx + (outer ? 0.22 : 0)), spring + Math.sin(t) * (ry + (outer ? 0.18 : 0)), z];
        a.surface.addHull([at(t0, false, z0), at(t1, false, z0), at(t0, true, z0), at(t1, true, z0),
          at(t0, false, z1), at(t1, false, z1), at(t0, true, z1), at(t1, true, z1)],
        { token: row === 0 || row === courses - 1 ? GOLD : STONE, shade: a.shade() });
      }
      // Larger, projecting keys lock the crown, not a flat painted arch outline.
      const keyTop = Math.min(spring + ry + 0.22, surfaceY(cx) - 0.06);
      for (const side of [-1, 1]) a.surface.addHull([
        [cx - 0.15, spring + ry - 0.04, side * (width / 2 - 0.05)], [cx + 0.15, spring + ry - 0.04, side * (width / 2 - 0.05)],
        [cx - 0.22, keyTop, side * (width / 2 - 0.05)], [cx + 0.22, keyTop, side * (width / 2 - 0.05)],
        [cx - 0.15, spring + ry - 0.04, side * (width / 2 + 0.09)], [cx + 0.15, spring + ry - 0.04, side * (width / 2 + 0.09)],
        [cx - 0.22, keyTop, side * (width / 2 + 0.09)], [cx + 0.22, keyTop, side * (width / 2 + 0.09)]
      ], { token: GOLD });
    }
    const outerArch = (x: number): number => {
      let y = 0.05;
      for (const arch of arches) {
        const outerRx = arch.rx + 0.22;
        if (Math.abs(x - arch.center) < outerRx) {
          y = Math.max(y, spring + (arch.ry + 0.18) * Math.sqrt(1 - ((x - arch.center) / outerRx) ** 2));
        }
      }
      return y;
    };
    const bays = a.count(26, 18, 12);
    for (let i = 0; i < bays; i++) {
      const left = -length / 2 + i * length / bays, right = left + length / bays;
      // A continuous recessed core closes the stepped stone courses at the curved vault.
      // Without it, the coarser LOD stones leave triangular daylight above the arch ring.
      const coreZ = width / 2 - 0.05, coreTop = Math.min(surfaceY(left), surfaceY(right)) - 0.08;
      const lowerLeft = outerArch(left), lowerRight = outerArch(right);
      a.surface.addHull([
        [left, lowerLeft, -coreZ], [right, lowerRight, -coreZ], [left, coreTop, -coreZ], [right, coreTop, -coreZ],
        [left, lowerLeft, coreZ], [right, lowerRight, coreZ], [left, coreTop, coreZ], [right, coreTop, coreZ]
      ], { token: GOLD, shade: 0.91 });
      const bottom = Math.max(outerArch(left), outerArch(right), outerArch((left + right) / 2));
      const top = Math.min(surfaceY(left), surfaceY(right)) - 0.11;
      if (top <= bottom + 0.04) continue;
      const rows = Math.max(1, Math.ceil((top - bottom) / a.count(0.40, 0.6, 1)));
      for (let row = 0; row < rows; row++) for (const sign of [-1, 1]) {
        a.box([(left + right) / 2, bottom + (row + 0.5) * (top - bottom) / rows, sign * (width / 2 - 0.13)],
          [right - left - 0.012, (top - bottom) / rows - 0.018, 0.29], GOLD, 0.92 + a.random() * 0.08);
      }
    }
    for (const deck of decks) {
      const [x, y] = deck.center, [hx, hy] = deck.halfExtents, top = y + hy;
      a.box([x, top - 0.11, 0], [hx * 2 + 0.002, 0.17, width], STONE, 0.86);
      const across = a.count(5, 4, 2), along = a.count(2, 2, 1);
      for (let row = 0; row < along; row++) for (let col = 0; col < across; col++) {
        a.box([x - hx + (row + 0.5) * hx * 2 / along, top - 0.047, -width / 2 + (col + 0.5) * width / across],
          [hx * 2 / along - 0.018, 0.10, width / across - 0.018], GOLD, 0.92 + a.random() * 0.08);
      }
      for (const side of [-1, 1]) a.box([x, top + 0.055, side * (width / 2 - 0.03)], [hx * 2 - 0.008, 0.15, 0.21], GOLD);
    }
    const posts = Number(p.railPosts);
    for (const side of [-1, 1]) {
      for (let i = 0; i < posts; i++) {
        const x = -length / 2 + 0.16 + i * (length - 0.32) / (posts - 1), y = surfaceY(x);
        a.beam([x, y + 0.07, side * (width / 2 + 0.01)], [x, y + 0.92, side * (width / 2 + 0.01)], [0.10, 0.11], WOOD);
        a.box([x, y + 0.94, side * (width / 2 + 0.01)], [0.25, 0.10, 0.24], DARK);
        if (i + 1 < posts) {
          const nx = -length / 2 + 0.16 + (i + 1) * (length - 0.32) / (posts - 1), ny = surfaceY(nx);
          for (const height of [0.38, 0.79]) a.beam([x, y + height, side * (width / 2 + 0.01)], [nx, ny + height, side * (width / 2 + 0.01)], [0.065, 0.075], WOOD);
        }
      }
    }
    const lx = -length / 2 + 0.36, ly = surfaceY(lx), lz = width / 2 + 0.06;
    a.beam([lx, ly + 0.08, lz], [lx, ly + 1.33, lz], [0.09, 0.10], DARK);
    a.beam([lx - 0.04, ly + 1.27, lz], [lx + 0.65, ly + 1.27, lz], [0.07, 0.08], WOOD);
    a.beam([lx, ly + 0.89, lz], [lx + 0.40, ly + 1.27, lz], [0.045, 0.045], WOOD);
    a.lantern([lx + 0.55, ly + 0.55, lz], 0.63, DARK, GLOW);
    return a.mesh(`${spec.id}_LOD${level}_bridge`);
  });
  addCollisionMarkers(spec, root); return { root, clips: [] };
}
