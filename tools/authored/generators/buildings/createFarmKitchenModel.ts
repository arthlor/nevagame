import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";
import { rope, timber } from "../props/parts";

/**
 * Catalog palette tokens (materialsMax: 8):
 * 0: stone_warm_01       - Masonry hearth, stone chimney flue, oven pedestal, flagstone pavers & curb
 * 1: wood_dark_01        - Hewn timber posts, roof beams, rafters, forged iron crane, cauldron & tools
 * 2: wood_honey_01       - Prep table, butcher block, cutting board, dough bowls, baker's peel, potatoes
 * 3: roof_terracotta_01  - Terracotta roof tiles, clay dome bake oven, ceramic crocks, carrots
 * 4: metal_brass_01      - Polished copper/brass sauté pans, hanging lantern frame, kettle
 * 5: emissive_lantern_01 - Hearth glowing coals/embers, warm hanging lantern core, oven firebed
 * 6: foliage_sage_01     - Hanging dried herbal bundles, carrot tops, leek greens
 * 7: plaster_warm_01     - Ceramic dough mixing bowl, mortar joints, salt crock, garlic
 */
const TOKENS = [
  "stone_warm_01",
  "wood_dark_01",
  "wood_honey_01",
  "roof_terracotta_01",
  "metal_brass_01",
  "emissive_lantern_01",
  "foliage_sage_01",
  "plaster_warm_01"
] as const;

const STONE = 0;
const DARK_WOOD = 1;
const HONEY_WOOD = 2;
const TERRACOTTA = 3;
const BRASS = 4;
const GLOW = 5;
const SAGE = 6;
const PLASTER = 7;

/**
 * Farm Kitchen Station, glTF space: +Y up, ground-centred at (0, 0, 0).
 *
 * Front working face (+Z) opens warmly toward the farmhouse door and yard:
 * - Robust, physically grounded open-air country hearth & summer kitchen station.
 * - Lofty timber canopy: front eaves headroom ~2.58m, rear eaves ~3.32m, chimney top 4.35m.
 * - Zero unphysical clipping: posts carry plates, plates carry rafters, rafters carry tiles.
 * - Non-parallel reference vectors ([0, 0, 1]) for all vertical lofts:
 *   restores cauldron, clay bake dome, harvest basket, mixing bowl, lantern, bucket, and jars.
 * - Real arched cob oven mouth with masonry voussoir arch, dark glowing cavity, and wooden peel.
 * - Continuous, staggered terracotta tile roof with zero missing edge tiles and clean chimney penetration.
 * - Grounded props: firewood cradle, iron tool stand, wash bucket, produce in wicker basket.
 */
export function createFarmKitchenModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);

  const width = Number(p.width ?? 4.0);
  const depth = Number(p.depth ?? 3.0);
  const overhang = Number(p.roofOverhang ?? 0.42);

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);

  const hw = width / 2; // 2.0m
  const hd = depth / 2; // 1.5m

  // Roof Plane & Carpentry Geometry:
  // Underside of rafters plane:
  const rafterZBack = -hd - overhang; // -1.92m
  const rafterZFront = hd + overhang;  // 1.92m
  const rafterUnderYBack = 3.32;
  const rafterUnderYFront = 2.58;
  const roofSlopeZ = (rafterUnderYFront - rafterUnderYBack) / (rafterZFront - rafterZBack); // ~ -0.1927
  const rafterUnderYAt = (z: number): number => rafterUnderYBack + roofSlopeZ * (z - rafterZBack);

  const rafterThickness = 0.09; // 9cm rafter depth
  const rafterWidth = 0.08;     // 8cm rafter width
  const rafterTopYAt = (z: number): number => rafterUnderYAt(z) + rafterThickness;

  // Plate / tie beam depth = 0.14m (halfExtent 0.07m). Top of beam meets rafter underside!
  const beamHalf = 0.07;
  const beamCenterYAt = (z: number): number => rafterUnderYAt(z) - beamHalf;

  // Helper for chamfered timber
  const beam = (from: V3, to: V3, half = beamHalf, token = DARK_WOOD, shade?: number): void => {
    timber(surface, from, to, [half, half], token, {
      bevel: 0.016,
      shade: shade ?? (0.9 + random() * 0.12)
    });
  };

  // ===============================================================================================
  // 1. FOUNDATION, PERIMETER STONE CURB & FLAGSTONE FLOOR
  // ===============================================================================================
  const curbH = 0.15;
  const curbW = 0.18;

  // Perimeter stone curb with corner mitering
  // Back curb
  timber(surface, [-hw, curbH / 2, -hd], [hw, curbH / 2, -hd], [curbW / 2, curbH / 2], STONE, {
    ref: [0, 1, 0], bevel: 0.02, shade: 0.85
  });
  // Left curb
  timber(surface, [-hw, curbH / 2, -hd], [-hw, curbH / 2, hd], [curbW / 2, curbH / 2], STONE, {
    ref: [0, 1, 0], bevel: 0.02, shade: 0.88
  });
  // Right curb
  timber(surface, [hw, curbH / 2, -hd], [hw, curbH / 2, hd], [curbW / 2, curbH / 2], STONE, {
    ref: [0, 1, 0], bevel: 0.02, shade: 0.88
  });
  // Front-left curb
  timber(surface, [-hw, curbH / 2, hd], [-0.75, curbH / 2, hd], [curbW / 2, curbH / 2], STONE, {
    ref: [0, 1, 0], bevel: 0.02, shade: 0.86
  });
  // Front-right curb (center 1.5m wide opening for player approach)
  timber(surface, [0.75, curbH / 2, hd], [hw, curbH / 2, hd], [curbW / 2, curbH / 2], STONE, {
    ref: [0, 1, 0], bevel: 0.02, shade: 0.86
  });

  // Flat flagstone pavers paving the entire interior floor
  const paverRows = 6;
  const paverCols = 8;
  for (let r = 0; r < paverRows; r += 1) {
    for (let c = 0; c < paverCols; c += 1) {
      const px = -hw + curbW + ((2 * hw - curbW * 2) / paverCols) * (c + 0.5);
      const pz = -hd + curbW + ((2 * hd - curbW * 2) / paverRows) * (r + 0.5);
      const pw = ((2 * hw - curbW * 2) / paverCols) * 0.46;
      const pd = ((2 * hd - curbW * 2) / paverRows) * 0.46;
      const py = 0.045 + (random() - 0.5) * 0.012;
      timber(surface, [px - pw, py, pz], [px + pw, py, pz], [pd, py], STONE, {
        ref: [0, 1, 0],
        bevel: 0.014,
        shade: 0.86 + random() * 0.16
      });
    }
  }

  // Heavy stone foundation bed across back zone supporting masonry stations
  timber(surface, [0, 0.08, -hd + 0.5], [0, 0.08, -hd + 1.1], [hw - 0.25, 0.08], STONE, {
    ref: [0, 1, 0],
    shade: 0.82
  });

  // ===============================================================================================
  // 2. LOW STONE BACK WALL & SPICE SHELF (Enclosed Back, Open View Above)
  // ===============================================================================================
  const wallZ = -hd + 0.22;
  const wallH = 0.88;
  const wallThick = 0.24;

  // Solid coursed stone masonry for the center back wall
  for (let c = 0; c < 3; c += 1) {
    const ch = wallH / 3;
    const cy = c * ch + ch / 2;
    timber(surface, [-0.58, cy, wallZ], [0.58, cy, wallZ], [wallThick / 2, ch / 2 - 0.004], STONE, {
      ref: [0, 1, 0],
      bevel: 0.018,
      shade: 0.84 + random() * 0.16
    });
  }

  // Stone wall coping ledge
  timber(surface, [-0.62, wallH + 0.025, wallZ], [0.62, wallH + 0.025, wallZ], [wallThick / 2 + 0.03, 0.025], STONE, {
    ref: [0, 1, 0],
    bevel: 0.015,
    shade: 0.96
  });

  // Solid wooden spice shelf resting directly on the wall coping
  const shelfY = wallH + 0.055;
  timber(surface, [-0.54, shelfY, wallZ + 0.02], [0.54, shelfY, wallZ + 0.02], [0.11, 0.02], HONEY_WOOD, {
    ref: [0, 1, 0],
    bevel: 0.008
  });

  // Ceramic Seasoning Jars resting on the shelf (ref: [0, 0, 1] for solid vertical loft!)
  for (let j = 0; j < 4; j += 1) {
    const jx = -0.36 + j * 0.24;
    const jz = wallZ + 0.02;
    const jToken = j % 2 === 0 ? PLASTER : TERRACOTTA;
    surface.addLoft([
      { p: [jx, shelfY + 0.01, jz], w: 0.038, h: 0.038 },
      { p: [jx, shelfY + 0.07, jz], w: 0.046, h: 0.046 },
      { p: [jx, shelfY + 0.12, jz], w: 0.034, h: 0.034 },
      { p: [jx, shelfY + 0.14, jz], w: 0.038, h: 0.038 }
    ], {
      sides: 8,
      ref: [0, 0, 1],
      capStart: 0.2,
      capEnd: 0.2,
      token: jToken,
      shade: 0.95
    });
    // Wooden cork stopper
    surface.addDisc([jx, shelfY + 0.148, jz], [0, 1, 0], 0.025, { token: HONEY_WOOD, shade: 0.9 });
  }

  // ===============================================================================================
  // 3. LEFT ZONE: MASONRY HEARTH, FIREBACK, CHIMNEY, CRANE & CAULDRON
  // ===============================================================================================
  const hearthX = -hw + 0.85; // -1.15m
  const hearthZ = -hd + 0.65; // -0.85m
  const hearthW = 1.15;
  const hearthD = 0.95;
  const hearthBaseH = 0.38;

  // Solid Stone Hearth Base Foundation
  timber(surface, [hearthX - hearthW / 2, hearthBaseH / 2, hearthZ], [hearthX + hearthW / 2, hearthBaseH / 2, hearthZ], [hearthD / 2, hearthBaseH / 2], STONE, {
    ref: [0, 1, 0],
    bevel: 0.025,
    shade: 0.84
  });

  // SOLID REAR FIREBACK: Closes the back of the fireplace against wind & elements
  timber(
    surface,
    [hearthX - hearthW / 2, hearthBaseH + 0.55, -hd + 0.2],
    [hearthX + hearthW / 2, hearthBaseH + 0.55, -hd + 0.2],
    [0.12, 0.55],
    STONE,
    { ref: [0, 1, 0], bevel: 0.02, shade: 0.78 }
  );

  // Left & right masonry side jambs for the fireplace
  const pillarW = 0.25;
  const pillarH = 1.05;
  for (const px of [hearthX - hearthW / 2 + pillarW / 2, hearthX + hearthW / 2 - pillarW / 2]) {
    timber(surface, [px, hearthBaseH + pillarH / 2, hearthZ], [px, hearthBaseH + pillarH / 2, hearthZ + 0.2], [pillarW / 2, pillarH / 2], STONE, {
      ref: [0, 1, 0],
      bevel: 0.022,
      shade: 0.86 + random() * 0.12
    });
  }

  // Fireplace Stone Segmental Arch Lintel
  timber(
    surface,
    [hearthX - hearthW / 2 - 0.06, hearthBaseH + pillarH + 0.08, hearthZ + 0.06],
    [hearthX + hearthW / 2 + 0.06, hearthBaseH + pillarH + 0.08, hearthZ + 0.06],
    [0.18, 0.08],
    STONE,
    { ref: [0, 1, 0], bevel: 0.025, shade: 0.92 }
  );

  // Hearth Firebed: Refractory charcoal & glowing embers
  const emberY = hearthBaseH + 0.05;
  surface.addDisc([hearthX, emberY, hearthZ], [0, 1, 0], [0.24, 0.3], {
    token: GLOW,
    rect: true,
    shade: 1.0
  });

  // Black iron fire grate on the hearth bed
  timber(surface, [hearthX - 0.22, emberY + 0.015, hearthZ], [hearthX + 0.22, emberY + 0.015, hearthZ], [0.15, 0.015], DARK_WOOD, {
    shade: 0.6
  });

  // Burning charred logs resting in the grate over the coals
  for (let l = 0; l < 4; l += 1) {
    const logAngle = (l / 4) * Math.PI + 0.25 + (random() - 0.5) * 0.2;
    const ldx = Math.cos(logAngle) * 0.2;
    const ldz = Math.sin(logAngle) * 0.2;
    const logToken = l % 2 === 0 ? DARK_WOOD : HONEY_WOOD;
    timber(
      surface,
      [hearthX - ldx, emberY + 0.04 + l * 0.025, hearthZ - ldz],
      [hearthX + ldx, emberY + 0.04 + l * 0.025, hearthZ + ldz],
      [0.035, 0.035],
      logToken,
      { bevel: 0.008, shade: 0.72 + random() * 0.2 }
    );
  }

  // Stone Chimney Flue & Shoulders
  const chimneyX = hearthX - 0.05; // -1.20m
  const chimneyZ = -hd + 0.38;    // -1.12m
  const chimneyShoulderY = hearthBaseH + pillarH + 0.16; // ~1.59m
  const stackTopY = 4.35; // Rises proud above the roof canopy

  // Sloping stone chimney shoulders narrowing into the upper stack
  timber(surface, [chimneyX - 0.52, chimneyShoulderY + 0.15, chimneyZ], [chimneyX + 0.52, chimneyShoulderY + 0.15, chimneyZ], [0.38, 0.15], STONE, {
    ref: [0, 1, 0],
    bevel: 0.03,
    shade: 0.88
  });

  // Main vertical stone chimney stack
  const stackHalfW = 0.32;
  const stackHalfD = 0.30;
  const stackBaseY = chimneyShoulderY + 0.3;
  const stackCourses = 10;
  const sCourseH = (stackTopY - stackBaseY) / stackCourses;

  for (let c = 0; c < stackCourses; c += 1) {
    const cy = stackBaseY + c * sCourseH + sCourseH / 2;
    timber(surface, [chimneyX - stackHalfW, cy, chimneyZ], [chimneyX + stackHalfW, cy, chimneyZ], [stackHalfD, sCourseH / 2 - 0.006], STONE, {
      ref: [0, 1, 0],
      bevel: 0.022,
      shade: 0.82 + random() * 0.18
    });
  }

  // Stepped stone cornice coping at the chimney head
  timber(surface, [chimneyX - stackHalfW - 0.06, stackTopY + 0.03, chimneyZ], [chimneyX + stackHalfW + 0.06, stackTopY + 0.03, chimneyZ], [stackHalfD + 0.06, 0.035], STONE, {
    ref: [0, 1, 0],
    bevel: 0.02,
    shade: 0.98
  });
  timber(surface, [chimneyX - stackHalfW - 0.03, stackTopY + 0.08, chimneyZ], [chimneyX + stackHalfW + 0.03, stackTopY + 0.08, chimneyZ], [stackHalfD + 0.03, 0.025], STONE, {
    ref: [0, 1, 0],
    bevel: 0.015,
    shade: 0.92
  });

  // Dual fluted terracotta chimney pots on the crown (ref: [0, 0, 1])
  for (const px of [chimneyX - 0.15, chimneyX + 0.15]) {
    surface.addLoft([
      { p: [px, stackTopY + 0.11, chimneyZ], w: 0.11, h: 0.11 },
      { p: [px, stackTopY + 0.35, chimneyZ], w: 0.09, h: 0.09 },
      { p: [px, stackTopY + 0.42, chimneyZ], w: 0.11, h: 0.11 }
    ], { sides: 8, ref: [0, 0, 1], capEnd: 0, token: TERRACOTTA, shade: 0.92 });
    surface.addDisc([px, stackTopY + 0.422, chimneyZ], [0, 1, 0], 0.07, { token: DARK_WOOD, shade: 0.6, sides: 8 });
  }

  // Forged Iron Swivel Crane swinging from the hearth pillar
  const cranePillarX = hearthX - hearthW / 2 + pillarW / 2;
  const craneY = hearthBaseH + pillarH - 0.1;
  timber(surface, [cranePillarX, craneY - 0.32, hearthZ + 0.18], [cranePillarX, craneY + 0.1, hearthZ + 0.18], [0.025, 0.025], DARK_WOOD, {
    shade: 0.62
  });
  timber(surface, [cranePillarX, craneY, hearthZ + 0.18], [hearthX, craneY, hearthZ], [0.025, 0.025], DARK_WOOD, {
    shade: 0.62
  });
  timber(surface, [cranePillarX, craneY - 0.24, hearthZ + 0.18], [hearthX - 0.14, craneY, hearthZ + 0.06], [0.018, 0.018], DARK_WOOD, {
    shade: 0.62
  });

  // Hanging Iron Suspension Chain
  const potHangY = craneY - 0.02;
  const potRimY = hearthBaseH + 0.36;
  rope(surface, [
    [hearthX, potHangY, hearthZ],
    [hearthX, potRimY + 0.22, hearthZ]
  ], 0.012, DARK_WOOD, { sides: 4, shade: 0.6 });

  // SOLID CAST-IRON STEW CAULDRON (ref: [0, 0, 1] ensures fully solid 3D mesh!)
  const cauldronY = potRimY + 0.08;
  const potRadius = 0.24;
  surface.addLoft([
    { p: [hearthX, cauldronY - 0.2, hearthZ], w: potRadius * 0.45, h: potRadius * 0.45 },
    { p: [hearthX, cauldronY - 0.12, hearthZ], w: potRadius * 0.95, h: potRadius * 0.95 },
    { p: [hearthX, cauldronY - 0.03, hearthZ], w: potRadius, h: potRadius },
    { p: [hearthX, cauldronY + 0.05, hearthZ], w: potRadius * 0.86, h: potRadius * 0.86 },
    { p: [hearthX, cauldronY + 0.1, hearthZ], w: potRadius * 0.92, h: potRadius * 0.92 }
  ], {
    sides: 9,
    ref: [0, 0, 1],
    capStart: 0.25,
    capEnd: 0,
    token: DARK_WOOD,
    shade: 0.68
  });

  // Cauldron loop handles
  for (const hx of [-potRadius - 0.03, potRadius + 0.03]) {
    rope(surface, [
      [hearthX + hx * 0.7, cauldronY + 0.03, hearthZ - 0.06],
      [hearthX + hx, cauldronY + 0.06, hearthZ],
      [hearthX + hx * 0.7, cauldronY + 0.03, hearthZ + 0.06]
    ], 0.014, DARK_WOOD, { sides: 4, shade: 0.6 });
  }

  // Simmering stew surface inside the cauldron
  surface.addDisc([hearthX, cauldronY + 0.06, hearthZ], [0, 1, 0], potRadius * 0.82, {
    token: TERRACOTTA,
    shade: 0.82,
    sides: 8
  });

  // Solid Iron Hearth Tool Stand on the left floor holding ash shovel & poker
  const toolStandX = hearthX - hearthW / 2 - 0.12;
  const toolStandZ = hearthZ + 0.28;
  timber(surface, [toolStandX - 0.08, 0.05, toolStandZ], [toolStandX + 0.08, 0.05, toolStandZ], [0.08, 0.015], DARK_WOOD, {
    ref: [0, 1, 0], shade: 0.6
  });
  // Upright stand post
  timber(surface, [toolStandX, 0.05, toolStandZ], [toolStandX, 0.85, toolStandZ], [0.015, 0.015], DARK_WOOD, {
    shade: 0.62
  });
  // Hanging iron shovel & poker
  timber(surface, [toolStandX - 0.04, 0.08, toolStandZ + 0.02], [toolStandX - 0.04, 0.82, toolStandZ + 0.02], [0.01, 0.01], DARK_WOOD, {
    shade: 0.68
  });
  timber(surface, [toolStandX - 0.08, 0.08, toolStandZ + 0.02], [toolStandX, 0.18, toolStandZ + 0.02], [0.05, 0.01], DARK_WOOD, {
    shade: 0.65
  });
  timber(surface, [toolStandX + 0.04, 0.08, toolStandZ - 0.02], [toolStandX + 0.04, 0.84, toolStandZ - 0.02], [0.01, 0.01], DARK_WOOD, {
    shade: 0.68
  });

  // ===============================================================================================
  // 4. RIGHT ZONE: ARTISANAL CLAY DOME BAKE OVEN & PEDESTAL
  // ===============================================================================================
  const ovenX = hw - 0.95; // 1.05m
  const ovenZ = -hd + 0.68; // -0.82m
  const ovenW = 1.25;
  const ovenD = 1.1;
  const ovenBaseH = 0.72;

  // Solid Stone Pedestal Foundation & Side Walls
  const nicheW = 0.58;
  const nicheH = 0.52;
  const nicheLeftW = (ovenW - nicheW) / 2;

  timber(surface, [ovenX - ovenW / 2 + nicheLeftW / 2, ovenBaseH / 2, ovenZ], [ovenX - ovenW / 2 + nicheLeftW / 2, ovenBaseH / 2, ovenZ + ovenD / 2], [nicheLeftW / 2, ovenBaseH / 2], STONE, {
    ref: [0, 1, 0], bevel: 0.022, shade: 0.86
  });
  timber(surface, [ovenX + ovenW / 2 - nicheLeftW / 2, ovenBaseH / 2, ovenZ], [ovenX + ovenW / 2 - nicheLeftW / 2, ovenBaseH / 2, ovenZ + ovenD / 2], [nicheLeftW / 2, ovenBaseH / 2], STONE, {
    ref: [0, 1, 0], bevel: 0.022, shade: 0.86
  });

  // SOLID REAR WALL of the oven pedestal (seals back of wood niche)
  timber(surface, [ovenX - ovenW / 2, ovenBaseH / 2, -hd + 0.2], [ovenX + ovenW / 2, ovenBaseH / 2, -hd + 0.2], [0.12, ovenBaseH / 2], STONE, {
    ref: [0, 1, 0], bevel: 0.02, shade: 0.8
  });

  // Arch bridge stone over the wood niche
  timber(surface, [ovenX - nicheW / 2 - 0.03, nicheH + 0.09, ovenZ], [ovenX + nicheW / 2 + 0.03, nicheH + 0.09, ovenZ + ovenD / 2], [0.14, 0.09], STONE, {
    ref: [0, 1, 0], bevel: 0.022, shade: 0.9
  });

  // Heavy stone countertop slab covering the oven pedestal top
  timber(surface, [ovenX - ovenW / 2 - 0.04, ovenBaseH + 0.035, ovenZ + 0.06], [ovenX + ovenW / 2 + 0.04, ovenBaseH + 0.035, ovenZ + 0.06], [ovenD / 2 + 0.06, 0.04], STONE, {
    ref: [0, 1, 0], bevel: 0.022, shade: 0.94
  });

  // Split firewood logs securely inside the niche
  for (let row = 0; row < 2; row += 1) {
    const logsInRow = 3 - row;
    for (let k = 0; k < logsInRow; k += 1) {
      const lx = ovenX - nicheW * 0.35 + ((nicheW * 0.7) / Math.max(1, logsInRow - 1)) * k;
      const ly = 0.08 + row * 0.17;
      const lz = ovenZ + 0.08;
      surface.addLoft([
        { p: [lx, ly, lz - 0.28], w: 0.07, h: 0.07 },
        { p: [lx, ly, lz + 0.28], w: 0.07, h: 0.07 }
      ], {
        sides: 6,
        ref: [0, 1, 0],
        capStart: 0.3,
        capEnd: 0.3,
        token: HONEY_WOOD,
        shade: 0.82 + random() * 0.18
      });
    }
  }

  // MAGNIFICENT SOLID CLAY DOME OVEN (ref: [0, 0, 1] ensures 100% visible 3D dome!)
  const domeR = 0.46;
  const domeBaseY = ovenBaseH + 0.075; // ~0.795m
  const domeCenterZ = ovenZ - 0.06;

  surface.addLoft([
    { p: [ovenX, domeBaseY, domeCenterZ], w: domeR * 0.92, h: domeR * 0.92 },
    { p: [ovenX, domeBaseY + 0.2, domeCenterZ], w: domeR, h: domeR },
    { p: [ovenX, domeBaseY + 0.42, domeCenterZ], w: domeR * 0.94, h: domeR * 0.94 },
    { p: [ovenX, domeBaseY + 0.62, domeCenterZ], w: domeR * 0.70, h: domeR * 0.70 },
    { p: [ovenX, domeBaseY + 0.74, domeCenterZ], w: domeR * 0.30, h: domeR * 0.30 }
  ], {
    sides: 9,
    ref: [0, 0, 1],
    capStart: 0,
    capEnd: 0.3,
    token: TERRACOTTA,
    shade: 0.95
  });

  // REAL AUTHORED ARCHED OVEN MOUTH & TUNNEL FACING FORWARD (+Z)
  const mouthZ = domeCenterZ + domeR * 0.76; // ~ -0.53m
  const mouthW = 0.36;
  const mouthH = 0.32;
  const jambThick = 0.07;
  const tunnelZBack = mouthZ - 0.26;
  const tunnelZFront = mouthZ + 0.08;

  // Left & right masonry side tunnel walls (extending into dome)
  for (const jx of [ovenX - mouthW / 2 - jambThick / 2, ovenX + mouthW / 2 + jambThick / 2]) {
    timber(surface, [jx, domeBaseY + mouthH / 2, tunnelZBack], [jx, domeBaseY + mouthH / 2, tunnelZFront], [jambThick / 2, mouthH / 2], STONE, {
      ref: [0, 1, 0], bevel: 0.014, shade: 0.86
    });
  }

  // Curved voussoir stone arch across the tunnel roof
  const numArchStones = 7;
  for (let a = 0; a < numArchStones; a += 1) {
    const angle0 = Math.PI * (a / numArchStones);
    const angle1 = Math.PI * ((a + 1) / numArchStones);
    const midAngle = (angle0 + angle1) / 2;
    const ax = ovenX - Math.cos(midAngle) * (mouthW / 2 + 0.02);
    const ay = domeBaseY + mouthH + Math.sin(midAngle) * 0.08;
    timber(surface, [ax, ay, tunnelZBack], [ax, ay, tunnelZFront], [0.035, 0.028], STONE, {
      ref: [0, 1, 0], bevel: 0.01, shade: 0.90 + (a % 2) * 0.06
    });
  }

  // Solid dark refractory interior backwall inside the tunnel (zero transparency/culling)
  timber(
    surface,
    [ovenX - mouthW / 2, domeBaseY + mouthH / 2, tunnelZBack + 0.02],
    [ovenX + mouthW / 2, domeBaseY + mouthH / 2, tunnelZBack + 0.02],
    [0.02, mouthH / 2],
    DARK_WOOD,
    { ref: [0, 1, 0], shade: 0.45 }
  );

  // Glowing refractory firebrick floor inside the oven mouth
  timber(
    surface,
    [ovenX - mouthW / 2 + 0.04, domeBaseY + 0.018, tunnelZBack + 0.05],
    [ovenX + mouthW / 2 - 0.04, domeBaseY + 0.018, tunnelZFront - 0.02],
    [0.018, 0.015],
    GLOW,
    { ref: [0, 1, 0], shade: 1.0 }
  );

  // Projecting stone landing ledge in front of the mouth
  timber(surface, [ovenX - mouthW / 2 - 0.08, domeBaseY + 0.02, tunnelZFront + 0.08], [ovenX + mouthW / 2 + 0.08, domeBaseY + 0.02, tunnelZFront + 0.08], [0.09, 0.025], STONE, {
    ref: [0, 1, 0], bevel: 0.012, shade: 0.96
  });

  // Authored removable wooden oven door propped slightly ajar to the right of the mouth
  const doorX = ovenX + mouthW / 2 + 0.12;
  const doorZ = tunnelZFront + 0.06;
  timber(surface, [doorX, domeBaseY + 0.02, doorZ], [doorX - 0.04, domeBaseY + mouthH + 0.02, doorZ - 0.08], [0.10, 0.016], HONEY_WOOD, {
    ref: [0, 1, 0], bevel: 0.008, shade: 0.92
  });
  // Turned wooden knob on the door
  surface.addLoft([
    { p: [doorX - 0.02, domeBaseY + mouthH * 0.5, doorZ + 0.02], w: 0.02, h: 0.02 },
    { p: [doorX - 0.02, domeBaseY + mouthH * 0.5, doorZ + 0.05], w: 0.03, h: 0.03 }
  ], { sides: 6, ref: [0, 1, 0], token: DARK_WOOD, shade: 0.7 });

  // Wooden Baker's Peel leaning stably against the side of the stone pedestal
  const peelX = ovenX + ovenW / 2 + 0.08;
  const peelBottomZ = ovenZ + 0.38;
  const peelTopZ = ovenZ - 0.14;
  const peelTopY = domeBaseY + 0.90;
  timber(surface, [peelX, 0.05, peelBottomZ], [peelX - 0.05, peelTopY, peelTopZ], [0.016, 0.016], HONEY_WOOD, {
    bevel: 0.006, shade: 0.98
  });
  // Thin paddle blade of the peel flat on the floor/curb
  timber(surface, [peelX - 0.01, 0.04, peelBottomZ], [peelX - 0.01, 0.30, peelBottomZ - 0.1], [0.09, 0.012], HONEY_WOOD, {
    ref: [1, 0, 0], bevel: 0.006, shade: 0.92
  });

  // Cooling board with fresh sourdough bread & tart on the pedestal side ledge
  timber(surface, [ovenX - ovenW / 2 + 0.08, domeBaseY + 0.02, ovenZ + 0.32], [ovenX - ovenW / 2 + 0.36, domeBaseY + 0.02, ovenZ + 0.32], [0.12, 0.016], HONEY_WOOD, {
    ref: [0, 1, 0]
  });
  // Solid crusty sourdough loaf (ref: [0, 0, 1])
  surface.addLoft([
    { p: [ovenX - ovenW / 2 + 0.16, domeBaseY + 0.03, ovenZ + 0.32], w: 0.075, h: 0.075 },
    { p: [ovenX - ovenW / 2 + 0.16, domeBaseY + 0.09, ovenZ + 0.32], w: 0.095, h: 0.095 },
    { p: [ovenX - ovenW / 2 + 0.16, domeBaseY + 0.14, ovenZ + 0.32], w: 0.045, h: 0.045 }
  ], { sides: 8, ref: [0, 0, 1], capStart: 0.2, capEnd: 0.3, token: HONEY_WOOD, shade: 1.05 });
  // Glazed orchard tart (ref: [0, 0, 1])
  surface.addLoft([
    { p: [ovenX - ovenW / 2 + 0.29, domeBaseY + 0.03, ovenZ + 0.32], w: 0.065, h: 0.065 },
    { p: [ovenX - ovenW / 2 + 0.29, domeBaseY + 0.065, ovenZ + 0.32], w: 0.07, h: 0.07 }
  ], { sides: 8, ref: [0, 0, 1], capStart: 0.2, capEnd: 0.1, token: TERRACOTTA, shade: 1.02 });

  // ===============================================================================================
  // 5. CENTER ZONE: ARTISAN BUTCHER BLOCK WORKBENCH & CULINARY PROPS
  // ===============================================================================================
  const tableX = 0;
  const tableZ = 0.22;
  const tableW = 1.48;
  const tableD = 0.68;
  const tableH = 0.88;
  const tableLeg = 0.06;
  const legX = tableW / 2 - tableLeg;
  const legZ = tableD / 2 - tableLeg;

  // 4 Robust Chamfered Table Legs
  for (const lx of [-legX, legX]) {
    for (const lz of [-legZ, legZ]) {
      beam([tableX + lx, 0.05, tableZ + lz], [tableX + lx, tableH - 0.06, tableZ + lz], tableLeg / 2, HONEY_WOOD);
    }
  }

  // Lower perimeter stretchers & slatted storage shelf
  const shelfH = 0.24;
  for (const lz of [-legZ, legZ]) {
    timber(surface, [tableX - legX, shelfH, tableZ + lz], [tableX + legX, shelfH, tableZ + lz], [0.022, 0.038], HONEY_WOOD);
  }
  for (const lx of [-legX, legX]) {
    timber(surface, [tableX + lx, shelfH, tableZ - legZ], [tableX + lx, shelfH, tableZ + legZ], [0.038, 0.022], HONEY_WOOD);
  }
  for (let s = 0; s < 5; s += 1) {
    const sz = tableZ - legZ + ((2 * legZ) / 4) * s;
    timber(surface, [tableX - legX + 0.04, shelfH + 0.03, sz], [tableX + legX - 0.04, shelfH + 0.03, sz], [0.045, 0.012], HONEY_WOOD, {
      shade: 0.88 + random() * 0.1
    });
  }

  // Upper perimeter aprons under tabletop
  for (const lz of [-legZ, legZ]) {
    timber(surface, [tableX - legX, tableH - 0.09, tableZ + lz], [tableX + legX, tableH - 0.09, tableZ + lz], [0.022, 0.048], HONEY_WOOD);
  }
  for (const lx of [-legX, legX]) {
    timber(surface, [tableX + lx, tableH - 0.09, tableZ - legZ], [tableX + lx, tableH - 0.09, tableZ + legZ], [0.048, 0.022], HONEY_WOOD);
  }

  // Solid butcher block timber tabletop slab
  timber(surface, [tableX - tableW / 2, tableH - 0.04, tableZ], [tableX + tableW / 2, tableH - 0.04, tableZ], [tableD / 2, 0.04], HONEY_WOOD, {
    ref: [0, 1, 0],
    bevel: 0.018,
    shade: 0.98
  });

  // Table Props:
  // (a) Thick End-Grain Cutting Board on the left
  const boardX = tableX - 0.36;
  const boardZ = tableZ;
  timber(surface, [boardX - 0.2, tableH + 0.02, boardZ], [boardX + 0.2, tableH + 0.02, boardZ], [0.16, 0.02], HONEY_WOOD, {
    ref: [0, 1, 0],
    bevel: 0.01,
    shade: 1.05
  });

  // (b) Forged Steel Chef's Cleaver resting firmly on the board
  timber(surface, [boardX - 0.09, tableH + 0.05, boardZ - 0.02], [boardX + 0.07, tableH + 0.05, boardZ + 0.04], [0.05, 0.007], DARK_WOOD, {
    ref: [0, 1, 0],
    shade: 0.65
  });
  timber(surface, [boardX + 0.07, tableH + 0.052, boardZ + 0.04], [boardX + 0.18, tableH + 0.056, boardZ + 0.08], [0.014, 0.014], HONEY_WOOD);

  // (c) Ceramic Dough Mixing Bowl (ref: [0, 0, 1] ensures fully solid 3D bowl!)
  const bowlX = tableX + 0.38;
  const bowlZ = tableZ + 0.04;
  surface.addLoft([
    { p: [bowlX, tableH + 0.01, bowlZ], w: 0.09, h: 0.09 },
    { p: [bowlX, tableH + 0.07, bowlZ], w: 0.15, h: 0.15 },
    { p: [bowlX, tableH + 0.12, bowlZ], w: 0.17, h: 0.17 }
  ], { sides: 8, ref: [0, 0, 1], capStart: 0.2, capEnd: 0, token: PLASTER, shade: 0.96 });
  surface.addDisc([bowlX, tableH + 0.08, bowlZ], [0, 1, 0], 0.12, { token: PLASTER, shade: 1.02, sides: 7 });

  // (d) Turned Rolling Pin beside bowl
  timber(surface, [bowlX - 0.08, tableH + 0.028, bowlZ - 0.18], [bowlX + 0.2, tableH + 0.028, bowlZ - 0.18], [0.024, 0.024], HONEY_WOOD, {
    bevel: 0.006
  });
  for (const hx of [bowlX - 0.13, bowlX + 0.25]) {
    timber(surface, [hx, tableH + 0.028, bowlZ - 0.18], [hx + (hx < bowlX ? 0.05 : -0.05), tableH + 0.028, bowlZ - 0.18], [0.012, 0.012], HONEY_WOOD);
  }

  // (e) SOLID WICKER HARVEST BASKET (ref: [0, 0, 1] ensures fully solid 3D basket enclosing the produce!)
  const basketX = tableX + 0.04;
  const basketZ = tableZ + 0.08;
  const bH = 0.15;
  const bR = 0.16;
  surface.addLoft([
    { p: [basketX, tableH + 0.01, basketZ], w: bR * 0.75, h: bR * 0.75 },
    { p: [basketX, tableH + bH * 0.5, basketZ], w: bR, h: bR },
    { p: [basketX, tableH + bH, basketZ], w: bR * 0.94, h: bR * 0.94 }
  ], { sides: 8, ref: [0, 0, 1], capStart: 0.3, capEnd: 0, token: HONEY_WOOD, shade: 0.86 });

  // Fresh harvest carrots seated firmly inside the basket
  for (let c = 0; c < 3; c += 1) {
    const cx = basketX - 0.05 + c * 0.05;
    const cz = basketZ - 0.02 + (c % 2) * 0.04;
    surface.addLoft([
      { p: [cx, tableH + 0.05, cz], w: 0.026, h: 0.026 },
      { p: [cx + 0.02, tableH + 0.14, cz + 0.02], w: 0.02, h: 0.02 },
      { p: [cx + 0.03, tableH + 0.22, cz + 0.03], w: 0.007, h: 0.007 }
    ], { sides: 5, ref: [0, 0, 1], capEnd: 0.2, token: TERRACOTTA, shade: 1.05 });
    timber(surface, [cx + 0.03, tableH + 0.22, cz + 0.03], [cx + 0.05, tableH + 0.30, cz + 0.04], [0.016, 0.016], SAGE, {
      shade: 0.95
    });
  }

  // Round potatoes inside the basket (ref: [0, 0, 1])
  for (let pt = 0; pt < 3; pt += 1) {
    const px = basketX + 0.04 - pt * 0.04;
    const pz = basketZ + 0.05 - (pt % 2) * 0.03;
    surface.addLoft([
      { p: [px, tableH + 0.03, pz], w: 0.038, h: 0.038 },
      { p: [px, tableH + 0.08, pz], w: 0.042, h: 0.042 },
      { p: [px, tableH + 0.12, pz], w: 0.024, h: 0.024 }
    ], { sides: 6, ref: [0, 0, 1], capStart: 0.2, capEnd: 0.2, token: HONEY_WOOD, shade: 0.88 });
  }

  // On the table's lower shelf: Stack of wooden bowls & stoneware pitcher (ref: [0, 0, 1])
  surface.addLoft([
    { p: [tableX - 0.35, shelfH + 0.04, tableZ], w: 0.08, h: 0.08 },
    { p: [tableX - 0.35, shelfH + 0.14, tableZ], w: 0.12, h: 0.12 }
  ], { sides: 7, ref: [0, 0, 1], capStart: 0.2, capEnd: 0, token: HONEY_WOOD, shade: 0.95 });
  surface.addLoft([
    { p: [tableX + 0.34, shelfH + 0.04, tableZ], w: 0.07, h: 0.07 },
    { p: [tableX + 0.34, shelfH + 0.18, tableZ], w: 0.09, h: 0.09 },
    { p: [tableX + 0.34, shelfH + 0.24, tableZ], w: 0.045, h: 0.045 }
  ], { sides: 6, ref: [0, 0, 1], capStart: 0.2, capEnd: 0.2, token: PLASTER, shade: 0.9 });

  // ===============================================================================================
  // 6. HEWN TIMBER POSTS, ROOF FRAMING & LOGICAL CHIMNEY TRIMMERS
  // ===============================================================================================
  const postOffset = 0.28;
  const postHalf = 0.085;
  const postZBack = -hd + postOffset; // -1.22m
  const postZFront = hd - postOffset;  // 1.22m
  const postXLeft = -hw + postOffset;  // -1.72m
  const postXRight = hw - postOffset;  // 1.72m

  // Exactly calculate the post top so it meets the bottom of the roof plate (zero clipping!)
  const postTopYBack = beamCenterYAt(postZBack) - beamHalf;   // Plate underside at back
  const postTopYFront = beamCenterYAt(postZFront) - beamHalf; // Plate underside at front

  const postPositions: Array<{ x: number; z: number; topY: number }> = [
    { x: postXLeft, z: postZBack, topY: postTopYBack },
    { x: postXRight, z: postZBack, topY: postTopYBack },
    { x: postXLeft, z: postZFront, topY: postTopYFront },
    { x: postXRight, z: postZFront, topY: postTopYFront }
  ];

  for (const pos of postPositions) {
    // Stone post foot
    timber(surface, [pos.x, 0.06, pos.z], [pos.x, 0.18, pos.z], [postHalf + 0.035, postHalf + 0.035], STONE, {
      bevel: 0.016, shade: 0.88
    });
    // Main vertical timber post
    beam([pos.x, 0.18, pos.z], [pos.x, pos.topY, pos.z], postHalf);
  }

  // Longitudinal side plates (back to front): Top surface is flush with rafter underside!
  for (const sideX of [postXLeft, postXRight]) {
    beam([sideX, beamCenterYAt(postZBack), postZBack], [sideX, beamCenterYAt(postZFront), postZFront], beamHalf);

    // Diagonal knee braces front & back
    const braceLen = 0.42;
    beam([sideX, postTopYBack - braceLen, postZBack], [sideX, beamCenterYAt(postZBack), postZBack + braceLen], 0.048);
    beam([sideX, postTopYFront - braceLen, postZFront], [sideX, beamCenterYAt(postZFront), postZFront - braceLen], 0.048);
  }

  // Transverse tie beams (Rear & Front): Top surface flush with rafter underside!
  beam([postXLeft - 0.12, beamCenterYAt(postZBack), postZBack], [postXRight + 0.12, beamCenterYAt(postZBack), postZBack], beamHalf);
  beam([postXLeft - 0.12, beamCenterYAt(postZFront), postZFront], [postXRight + 0.12, beamCenterYAt(postZFront), postZFront], beamHalf);

  // Transverse mid cross-tie beam (supports utensil rack & hanging lantern)
  const midBeamZ = 0.12;
  beam([postXLeft, beamCenterYAt(midBeamZ), midBeamZ], [postXRight, beamCenterYAt(midBeamZ), midBeamZ], beamHalf);

  // LOGICAL CHIMNEY TIMBER TRIMMERS (Carpentry framing around chimney penetration)
  const chimCutX0 = chimneyX - stackHalfW - 0.06;
  const chimCutX1 = chimneyX + stackHalfW + 0.06;
  const chimCutZ0 = chimneyZ - stackHalfD - 0.06;
  const chimCutZ1 = chimneyZ + stackHalfD + 0.06;

  // Header trimmer beams framing the chimney opening in the roof structure
  const trimY0 = rafterUnderYAt(chimCutZ0) + rafterThickness * 0.5;
  const trimY1 = rafterUnderYAt(chimCutZ1) + rafterThickness * 0.5;
  beam([chimCutX0, trimY0, chimCutZ0], [chimCutX1, trimY0, chimCutZ0], 0.04);
  beam([chimCutX0, trimY1, chimCutZ1], [chimCutX1, trimY1, chimCutZ1], 0.04);

  // Sloping Roof Rafters spanning back to front with decorative rafter tails
  const numRafters = 9;
  for (let i = 0; i < numRafters; i += 1) {
    const rx = -hw - 0.08 + ((width + 0.16) / (numRafters - 1)) * i;

    // Rafter trims cleanly around the chimney header opening
    if (rx > chimCutX0 && rx < chimCutX1) {
      beam([rx, rafterUnderYAt(rafterZBack) + rafterThickness / 2, rafterZBack], [rx, trimY0, chimCutZ0], rafterWidth / 2);
      beam([rx, trimY1, chimCutZ1], [rx, rafterUnderYAt(rafterZFront) + rafterThickness / 2, rafterZFront], rafterWidth / 2);
    } else {
      beam([rx, rafterUnderYAt(rafterZBack) + rafterThickness / 2, rafterZBack], [rx, rafterUnderYAt(rafterZFront) + rafterThickness / 2, rafterZFront], rafterWidth / 2);
    }
  }

  // ===============================================================================================
  // 7. CONTINUOUS STAGGERED TERRACOTTA TILE ROOF WITH CLEAN CHIMNEY CUTOUT
  // ===============================================================================================
  const roofCourses = 11;
  const roofWidth = width + overhang * 2; // 4.84m
  const roofRun = Math.hypot(rafterZFront - rafterZBack, rafterUnderYFront - rafterUnderYBack);
  const roofDir = new THREE.Vector3(0, rafterUnderYFront - rafterUnderYBack, rafterZFront - rafterZBack).normalize();
  const roofNorm = new THREE.Vector3(0, -roofDir.z, roofDir.y).normalize();
  if (roofNorm.y < 0) roofNorm.negate();

  const tileW = 0.26;
  const numCols = Math.ceil(roofWidth / tileW) + 2;

  for (let r = 0; r < roofCourses; r += 1) {
    const t = (r + 0.5) / roofCourses;
    const distAlong = roofRun * t;
    const courseCenter = new THREE.Vector3(0, rafterUnderYBack + rafterThickness + 0.02, rafterZBack)
      .addScaledVector(roofDir, distAlong)
      .addScaledVector(roofNorm, 0.025 + (r % 2) * 0.012);

    const rowOffset = (r % 2) * (tileW * 0.5);
    const inChimneyZ = courseCenter.z > chimCutZ0 && courseCenter.z < chimCutZ1;

    for (let c = -1; c < numCols; c += 1) {
      const x0 = -roofWidth / 2 + c * tileW - rowOffset + 0.008;
      const x1 = x0 + tileW - 0.016;
      if (x1 <= -roofWidth / 2 || x0 >= roofWidth / 2) continue;

      let clampX0 = Math.max(-roofWidth / 2, x0);
      let clampX1 = Math.min(roofWidth / 2, x1);

      // Clean chimney cutout: split or clip tiles around the chimney penetration
      if (inChimneyZ) {
        // Case 1: Entirely inside chimney cutout -> omit completely
        if (clampX0 >= chimCutX0 && clampX1 <= chimCutX1) {
          continue;
        }
        // Case 2: Straddles both left and right edges -> render two separate tile segments
        if (clampX0 < chimCutX0 && clampX1 > chimCutX1) {
          // Left segment
          timber(
            surface,
            [clampX0, courseCenter.y, courseCenter.z],
            [chimCutX0, courseCenter.y, courseCenter.z],
            [roofRun / roofCourses / 2 + 0.024, 0.022],
            TERRACOTTA,
            { ref: [roofNorm.x, roofNorm.y, roofNorm.z], bevel: 0.007, shade: 0.84 + random() * 0.2 }
          );
          // Right segment
          timber(
            surface,
            [chimCutX1, courseCenter.y, courseCenter.z],
            [clampX1, courseCenter.y, courseCenter.z],
            [roofRun / roofCourses / 2 + 0.024, 0.022],
            TERRACOTTA,
            { ref: [roofNorm.x, roofNorm.y, roofNorm.z], bevel: 0.007, shade: 0.84 + random() * 0.2 }
          );
          continue;
        }
        // Case 3: Overlaps left edge of chimney -> clip right end to chimCutX0
        if (clampX0 < chimCutX0 && clampX1 > chimCutX0) {
          clampX1 = chimCutX0;
        }
        // Case 4: Overlaps right edge of chimney -> clip left end to chimCutX1
        if (clampX0 < chimCutX1 && clampX1 > chimCutX1) {
          clampX0 = chimCutX1;
        }
      }

      if (clampX1 - clampX0 < 0.04) continue;

      timber(
        surface,
        [clampX0, courseCenter.y, courseCenter.z],
        [clampX1, courseCenter.y, courseCenter.z],
        [roofRun / roofCourses / 2 + 0.024, 0.022],
        TERRACOTTA,
        {
          ref: [roofNorm.x, roofNorm.y, roofNorm.z],
          bevel: 0.007,
          shade: 0.84 + random() * 0.2
        }
      );
    }
  }

  // Side fascia bargeboards neatly capping the rafter ends on left & right gable edges
  for (const bx of [-roofWidth / 2, roofWidth / 2]) {
    timber(
      surface,
      [bx, rafterUnderYAt(rafterZBack) + rafterThickness * 0.5, rafterZBack],
      [bx, rafterUnderYAt(rafterZFront) + rafterThickness * 0.5, rafterZFront],
      [0.022, 0.065],
      HONEY_WOOD,
      { bevel: 0.008, shade: 0.92 }
    );
  }

  // ===============================================================================================
  // 8. ARCHITECTURAL LEAD / STONE FLASHING COLLAR AROUND CHIMNEY
  // ===============================================================================================
  const flashLip = 0.08;
  const flashThick = 0.02;

  // Upper apron flashing (behind chimney, shedding water onto tiles)
  const flashBackCenter = new THREE.Vector3(chimneyX, rafterTopYAt(chimCutZ0) + 0.04, chimCutZ0);
  timber(
    surface,
    [chimCutX0 - 0.02, flashBackCenter.y, flashBackCenter.z],
    [chimCutX1 + 0.02, flashBackCenter.y, flashBackCenter.z],
    [flashLip, flashThick],
    STONE,
    { ref: [roofNorm.x, roofNorm.y, roofNorm.z], bevel: 0.006, shade: 0.76 }
  );

  // Lower apron flashing (in front of chimney, overlapping tiles)
  const flashFrontCenter = new THREE.Vector3(chimneyX, rafterTopYAt(chimCutZ1) + 0.04, chimCutZ1);
  timber(
    surface,
    [chimCutX0 - 0.02, flashFrontCenter.y, flashFrontCenter.z],
    [chimCutX1 + 0.02, flashFrontCenter.y, flashFrontCenter.z],
    [flashLip, flashThick],
    STONE,
    { ref: [roofNorm.x, roofNorm.y, roofNorm.z], bevel: 0.006, shade: 0.76 }
  );

  // Left & right side step flashing along the chimney sides
  for (const fx of [chimCutX0, chimCutX1]) {
    timber(
      surface,
      [fx, flashBackCenter.y, chimCutZ0],
      [fx, flashFrontCenter.y, chimCutZ1],
      [flashLip * 0.6, flashThick],
      STONE,
      { ref: [roofNorm.x, roofNorm.y, roofNorm.z], bevel: 0.006, shade: 0.74 }
    );
  }

  // ===============================================================================================
  // 9. OVERHEAD UTENSIL RACK, HANGING PANS, HERBS, GARLIC & WARM LANTERN
  // ===============================================================================================
  const rackY = beamCenterYAt(midBeamZ) - 0.16; // Under mid cross beam (~2.69m)
  const rackZ = midBeamZ;

  // Forged iron rack bar
  timber(surface, [-0.6, rackY, rackZ], [0.6, rackY, rackZ], [0.016, 0.016], DARK_WOOD, {
    shade: 0.65
  });

  // Hanging Copper/Brass Sauté Pans
  const panConfigs = [
    { x: -0.44, r: 0.15, drop: 0.44, d: 0.038 },
    { x: -0.22, r: 0.12, drop: 0.38, d: 0.032 },
    { x: 0.46, r: 0.14, drop: 0.42, d: 0.035 }
  ];

  for (const pan of panConfigs) {
    const py = rackY - pan.drop;
    // Iron S-hook & handle
    rope(surface, [
      [pan.x, rackY, rackZ],
      [pan.x, py + pan.r + 0.18, rackZ],
      [pan.x, py + pan.r, rackZ]
    ], 0.009, DARK_WOOD, { sides: 4, shade: 0.65 });
    // Brass handle
    timber(surface, [pan.x, py + pan.r, rackZ], [pan.x, py + pan.r + 0.16, rackZ], [0.012, 0.016], BRASS, {
      shade: 0.92
    });
    // Polished Copper/Brass Pan Disc & Rim
    surface.addDisc([pan.x, py, rackZ - pan.d / 2], [0, 0, -1], pan.r, {
      token: BRASS,
      sides: 9,
      shade: 1.05
    });
    surface.addLoft([
      { p: [pan.x, py, rackZ - pan.d / 2], w: pan.r, h: pan.r },
      { p: [pan.x, py, rackZ + pan.d / 2], w: pan.r * 1.04, h: pan.r * 1.04 }
    ], { sides: 9, ref: [0, 1, 0], capEnd: 0, token: BRASS, shade: 0.98 });
  }

  // Hanging Iron Ladle and Slotted Spoon (ref: [0, 0, 1])
  const ladleX = 0.28;
  rope(surface, [
    [ladleX, rackY, rackZ],
    [ladleX, rackY - 0.36, rackZ]
  ], 0.008, DARK_WOOD, { sides: 4, shade: 0.65 });
  surface.addLoft([
    { p: [ladleX, rackY - 0.36, rackZ], w: 0.026, h: 0.026 },
    { p: [ladleX, rackY - 0.41, rackZ + 0.02], w: 0.04, h: 0.04 }
  ], { sides: 6, ref: [0, 0, 1], capStart: 0.2, capEnd: 0, token: DARK_WOOD, shade: 0.7 });

  // Dried Herbal Bundles
  for (const hx of [-0.08, 0.16]) {
    const herbTopY = rackY - 0.05;
    rope(surface, [
      [hx, rackY, rackZ],
      [hx, herbTopY, rackZ]
    ], 0.007, HONEY_WOOD, { sides: 4 });
    surface.addLoft([
      { p: [hx, herbTopY, rackZ], w: 0.016, h: 0.016 },
      { p: [hx - 0.01, herbTopY - 0.12, rackZ], w: 0.05, h: 0.05 },
      { p: [hx + 0.01, herbTopY - 0.26, rackZ], w: 0.065, h: 0.065 },
      { p: [hx, herbTopY - 0.35, rackZ], w: 0.028, h: 0.028 }
    ], { sides: 6, ref: [1, 0, 0], capStart: 0.2, capEnd: 0.3, token: SAGE, shade: 0.92 + random() * 0.14 });
  }

  // Braided Garlic Strand (ref: [0, 0, 1])
  const garlicX = -0.54;
  const garlicTopY = rackY - 0.05;
  rope(surface, [
    [garlicX, rackY, rackZ],
    [garlicX, garlicTopY - 0.38, rackZ]
  ], 0.009, HONEY_WOOD, { sides: 4, shade: 0.85 });
  for (let g = 0; g < 4; g += 1) {
    const gy = garlicTopY - 0.09 - g * 0.075;
    const gx = garlicX + (g % 2 === 0 ? -0.018 : 0.018);
    surface.addLoft([
      { p: [gx, gy - 0.028, rackZ], w: 0.028, h: 0.028 },
      { p: [gx, gy, rackZ], w: 0.038, h: 0.038 },
      { p: [gx, gy + 0.028, rackZ], w: 0.02, h: 0.02 }
    ], { sides: 6, ref: [0, 0, 1], capStart: 0.2, capEnd: 0.2, token: PLASTER, shade: 1.02 });
  }

  // SOLID BRASS LANTERN (ref: [0, 0, 1] ensures fully solid 3D lantern body, hood, core & base!)
  const lanternX = 0;
  const lanternZ = 0.22;
  const lanternY = 2.15;
  const rafterRoofY = rafterUnderYAt(lanternZ);

  // Iron link chain dropping from the roof rafter
  rope(surface, [
    [lanternX, rafterRoofY - 0.04, lanternZ],
    [lanternX, lanternY + 0.24, lanternZ]
  ], 0.009, DARK_WOOD, { sides: 4, shade: 0.65 });

  // Brass lantern top cap & loop
  rope(surface, [
    [lanternX - 0.035, lanternY + 0.24, lanternZ],
    [lanternX, lanternY + 0.28, lanternZ],
    [lanternX + 0.035, lanternY + 0.24, lanternZ]
  ], 0.009, BRASS, { sides: 4, shade: 0.95 });

  // Lantern peaked roof hood (ref: [0, 0, 1])
  surface.addLoft([
    { p: [lanternX, lanternY + 0.23, lanternZ], w: 0.045, h: 0.045 },
    { p: [lanternX, lanternY + 0.17, lanternZ], w: 0.12, h: 0.12 }
  ], { sides: 8, ref: [0, 0, 1], capStart: 0.3, capEnd: 0, token: BRASS, shade: 0.95 });

  // Glowing lantern glass core (warm emissive) (ref: [0, 0, 1])
  surface.addLoft([
    { p: [lanternX, lanternY + 0.16, lanternZ], w: 0.082, h: 0.082 },
    { p: [lanternX, lanternY - 0.04, lanternZ], w: 0.072, h: 0.072 }
  ], { sides: 8, ref: [0, 0, 1], token: GLOW, shade: 1.0 });

  // Octagonal brass frame struts
  for (let a = 0; a < 8; a += 1) {
    const angle = (a / 8) * Math.PI * 2;
    const ax0 = Math.cos(angle) * 0.092;
    const az0 = Math.sin(angle) * 0.092;
    const ax1 = Math.cos(angle) * 0.082;
    const az1 = Math.sin(angle) * 0.082;
    timber(surface, [lanternX + ax0, lanternY + 0.16, lanternZ + az0], [lanternX + ax1, lanternY - 0.04, lanternZ + az1], [0.009, 0.009], BRASS, {
      shade: 0.9
    });
  }

  // Lantern bottom base & finial (ref: [0, 0, 1])
  surface.addLoft([
    { p: [lanternX, lanternY - 0.04, lanternZ], w: 0.098, h: 0.098 },
    { p: [lanternX, lanternY - 0.08, lanternZ], w: 0.065, h: 0.065 },
    { p: [lanternX, lanternY - 0.12, lanternZ], w: 0.016, h: 0.016 }
  ], { sides: 8, ref: [0, 0, 1], capEnd: 0.3, token: BRASS, shade: 0.95 });

  // ===============================================================================================
  // 10. SIDE ACCESSORIES: WASH BUCKET & TIMBER FIREWOOD CRADLE
  // ===============================================================================================
  // SOLID COOPERED WOODEN WASH BUCKET (ref: [0, 0, 1] ensures fully solid 3D bucket!)
  const bucketX = -hw + 0.42;
  const bucketZ = 0.52;
  const bucketH = 0.3;
  const bucketR = 0.17;
  const bucketFloorY = 0.05; // Resting firmly on the flagstone floor!

  surface.addLoft([
    { p: [bucketX, bucketFloorY, bucketZ], w: bucketR * 0.82, h: bucketR * 0.82 },
    { p: [bucketX, bucketFloorY + bucketH, bucketZ], w: bucketR, h: bucketR }
  ], { sides: 9, ref: [0, 0, 1], capStart: 0.2, capEnd: 0, token: HONEY_WOOD, shade: 0.88 });

  // Iron hoops on bucket (ref: [0, 0, 1])
  for (const by of [bucketFloorY + bucketH * 0.25, bucketFloorY + bucketH * 0.75]) {
    surface.addLoft([
      { p: [bucketX, by - 0.012, bucketZ], w: bucketR * 0.96, h: bucketR * 0.96 },
      { p: [bucketX, by + 0.012, bucketZ], w: bucketR * 0.96, h: bucketR * 0.96 }
    ], { sides: 9, ref: [0, 0, 1], capStart: 0, capEnd: 0, token: DARK_WOOD, shade: 0.65 });
  }

  // Arched wire handle
  rope(surface, [
    [bucketX - bucketR - 0.01, bucketFloorY + bucketH - 0.02, bucketZ],
    [bucketX, bucketFloorY + bucketH + 0.15, bucketZ],
    [bucketX + bucketR + 0.01, bucketFloorY + bucketH - 0.02, bucketZ]
  ], 0.009, DARK_WOOD, { sides: 4, shade: 0.65 });

  // Water level inside bucket
  surface.addDisc([bucketX, bucketFloorY + bucketH * 0.82, bucketZ], [0, 1, 0], bucketR * 0.92, {
    token: DARK_WOOD,
    shade: 0.5,
    sides: 8
  });

  // Dipper ladle resting on the bucket rim
  timber(surface, [bucketX - bucketR * 0.4, bucketFloorY + bucketH + 0.02, bucketZ - bucketR * 0.5], [bucketX + bucketR + 0.09, bucketFloorY + bucketH + 0.09, bucketZ + bucketR * 0.4], [0.012, 0.012], HONEY_WOOD);

  // GROUNDED TIMBER WOOD CRADLE (Firewood storage rack firmly on flagstones)
  const cradleX = hw - 0.42;
  const cradleZ = 0.55;
  const cradleW = 0.48;
  const cradleD = 0.44;

  // Two wooden runner skids on the flagstone floor
  for (const cx of [cradleX - cradleW / 2 + 0.04, cradleX + cradleW / 2 - 0.04]) {
    timber(surface, [cx, 0.05, cradleZ - cradleD / 2], [cx, 0.05, cradleZ + cradleD / 2], [0.03, 0.02], DARK_WOOD);
  }
  // Upright corner cradle posts
  for (const cx of [cradleX - cradleW / 2, cradleX + cradleW / 2]) {
    for (const cz of [cradleZ - cradleD / 2, cradleZ + cradleD / 2]) {
      timber(surface, [cx, 0.05, cz], [cx, 0.38, cz], [0.022, 0.022], DARK_WOOD);
    }
  }
  // Split cordwood logs neatly stacked inside the cradle
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 2; c += 1) {
      const lx = cradleX - 0.1 + c * 0.2;
      const ly = 0.09 + r * 0.14;
      surface.addLoft([
        { p: [lx, ly, cradleZ - 0.2], w: 0.065, h: 0.065 },
        { p: [lx, ly, cradleZ + 0.2], w: 0.065, h: 0.065 }
      ], {
        sides: 6,
        ref: [0, 1, 0],
        capStart: 0.3,
        capEnd: 0.3,
        token: HONEY_WOOD,
        shade: 0.78 + random() * 0.18
      });
    }
  }

  // ===============================================================================================
  // FINALIZE & EXPORT MODEL
  // ===============================================================================================
  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
