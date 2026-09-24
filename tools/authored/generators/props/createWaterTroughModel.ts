import * as THREE from "three";

import { SurfaceBuilder, mulberry32, type AuthoredModel, type GeneratorContext, type Station, type V3 } from "../../kit";

// Catalog palette order: weathered planks, dark cradles and floor, water, iron bands.
const TOKENS = ["wood_weathered_01", "wood_dark_01", "water_shallow_01", "metal_dark_01"] as const;
const PLANK = 0;
const DARK = 1;
const WATER = 2;
const IRON = 3;

const LENGTH = 1.5;
const FLOOR_Y = 0.13;
const TOP_Y = 0.5;
/** Half-widths of the splayed body at the floor and at the rim (outer faces). */
const BOTTOM_HALF = 0.2;
const TOP_HALF = 0.3;
const WALL = 0.045;
const WATER_Y = 0.43;

/**
 * Hewn plank stock trough, glTF space: +Y up, long along X, ground-centred, metres.
 *
 * Redesigned from the Blender trough, a straight box with iron straps floating off its sides and a
 * flat water plate. The walls now splay outward the way a plank trough is built, each side two
 * boards of their own tone, damp and darker toward the foot; trapezoid end boards stand proud of the
 * sides; two iron bands wrap the whole body; it rests on notched log cradles. The water sits a hand
 * below the rim with a gentle ripple, darker where the walls shade it.
 */
export function createWaterTroughModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);
  const halfAt = (y: number): number => BOTTOM_HALF + ((y - FLOOR_Y) / (TOP_Y - FLOOR_Y)) * (TOP_HALF - BOTTOM_HALF);
  const splay = Math.atan2(TOP_HALF - BOTTOM_HALF, TOP_Y - FLOOR_Y);
  const inner = LENGTH / 2 - 0.05;

  // Log cradles: half-round blocks under each end, notched to seat the body.
  for (const x of [-LENGTH * 0.32, LENGTH * 0.32]) {
    surface.addLoft([
      { p: [x - 0.08, 0.075, 0], w: TOP_HALF + 0.02, h: 0.07, hb: 0.075 },
      { p: [x + 0.08, 0.075, 0], w: TOP_HALF + 0.02, h: 0.07, hb: 0.075 }
    ], {
      sides: 8, ref: [0, 1, 0], capStart: 0, capEnd: 0, flat: true, token: DARK,
      shade: ({ normal }) => (normal.y > 0.5 ? 0.98 : 0.86)
    });
  }
  // Floor, hidden but closing the body.
  surface.addBox([-inner, FLOOR_Y + 0.02, 0], [inner, FLOOR_Y + 0.02, 0], [BOTTOM_HALF, 0.022], { ref: [0, 1, 0], token: DARK });

  // Side walls: two boards per side, splayed, damp toward the foot.
  const boardHeights = [[FLOOR_Y, 0.31], [0.31, TOP_Y]] as const;
  for (const side of [-1, 1]) {
    for (const [y0, y1] of boardHeights) {
      const y = (y0 + y1) / 2;
      const z = side * (halfAt(y) - WALL / 2 * Math.cos(splay));
      const tone = 0.9 + random() * 0.1;
      const ref: V3 = [0, Math.cos(splay), side * Math.sin(splay)];
      surface.addBox([-inner - 0.015, y, z], [inner + 0.015, y, z], [WALL / 2, (y1 - y0) / 2 / Math.cos(splay) - 0.004], {
        ref, bevel: 0.01, token: PLANK, shade: ({ centroid }) => (centroid.y < 0.24 ? tone * 0.86 : tone)
      });
    }
  }
  // Trapezoid end boards, standing a little proud of the sides and the rim.
  const bottom = BOTTOM_HALF + 0.03;
  const top = TOP_HALF + 0.035;
  for (const x of [-inner - 0.04, inner + 0.04]) {
    surface.addLoft([
      { p: [x - 0.028, (FLOOR_Y + TOP_Y) / 2 + 0.01, 0], w: top, h: (TOP_Y - FLOOR_Y) / 2 + 0.035 },
      { p: [x + 0.028, (FLOOR_Y + TOP_Y) / 2 + 0.01, 0], w: top, h: (TOP_Y - FLOOR_Y) / 2 + 0.035 }
    ], {
      ref: [0, 1, 0], sides: 4, capStart: 0, capEnd: 0, flat: true, token: PLANK,
      profile: [[bottom / top, -1], [1, 1], [-1, 1], [-bottom / top, -1]],
      shade: ({ centroid }) => (centroid.y < 0.24 ? 0.8 : 0.93)
    });
  }

  // Iron bands wrapping sides and floor.
  for (const x of [-LENGTH * 0.26, LENGTH * 0.26]) {
    // Section half-sizes are scaled by SQRT2 because a 4-sided section at phase PI/4 is a square
    // whose corners, not faces, sit at w and h.
    const out = 0.012;
    const band = { w: 0.008 * Math.SQRT2, h: 0.026 * Math.SQRT2 };
    const path: Station[] = [
      { p: [x, TOP_Y - 0.02, halfAt(TOP_Y - 0.02) + out], ...band },
      { p: [x, FLOOR_Y - 0.01, BOTTOM_HALF + out], ...band },
      { p: [x, FLOOR_Y - 0.01, -BOTTOM_HALF - out], ...band },
      { p: [x, TOP_Y - 0.02, -halfAt(TOP_Y - 0.02) - out], ...band }
    ];
    surface.addLoft(path, { sides: 4, phase: Math.PI / 4, ref: [1, 0, 0], capStart: 0, capEnd: 0, flat: true, token: IRON });
  }

  // Water: a closed thin sheet a hand below the rim, rippled, shaded darker under the walls.
  const waterHalf = halfAt(WATER_Y) - WALL - 0.004;
  surface.addPanel({
    cols: 8,
    rows: 3,
    thickness: 0.012,
    point: (u, v) => {
      const x = (u - 0.5) * 2 * (inner - 0.02);
      const z = (v - 0.5) * 2 * waterHalf;
      return new THREE.Vector3(x, WATER_Y + 0.004 * Math.sin(u * 13 + v * 5), z);
    },
    token: () => WATER,
    shade: (u, v) => (v < 0.34 || v > 0.66 || u < 0.13 || u > 0.87 ? 0.86 : 1)
  });

  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
