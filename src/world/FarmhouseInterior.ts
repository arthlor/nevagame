// src/world/FarmhouseInterior.ts
import { ASSET_IDS, type AssetId } from "../render/assets/AssetCatalog.generated";

export interface InteriorPropPlacement {
  id: string;
  assetId: AssetId;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale?: number;
}

export const FARMHOUSE_INTERIOR_ORIGIN = Object.freeze({
  x: 240.0,
  y: 0.0,
  z: -240.0
});

export const FARMHOUSE_INTERIOR_BOUNDS = Object.freeze({
  minX: 235.4,
  maxX: 244.6,
  minZ: -243.6,
  maxZ: -236.4,
  floorY: 0.17,
  ceilingY: 3.7
});

/**
 * Outside door anchor on the farmhouse porch.
 * The starter farmhouse is placed at world coordinates (-57.0, -53.5) facing South.
 * Porch steps and doorway extend South to world z ≈ -57.8 to -58.5.
 */
export const FARMHOUSE_OUTSIDE_DOOR = Object.freeze({
  x: -57.0,
  y: 0.95,
  z: -57.8,
  radiusMeters: 3.2,
  exitSpawn: {
    x: -57.0,
    y: 1.0,
    z: -59.6,
    rotationY: Math.PI
  }
});

/**
 * Interior door anchor inside the farmhouse room.
 */
export const FARMHOUSE_INTERIOR_DOOR = Object.freeze({
  x: FARMHOUSE_INTERIOR_ORIGIN.x,
  y: FARMHOUSE_INTERIOR_BOUNDS.floorY,
  z: FARMHOUSE_INTERIOR_ORIGIN.z - 3.1,
  radiusMeters: 2.2,
  enterSpawn: {
    x: FARMHOUSE_INTERIOR_ORIGIN.x,
    y: FARMHOUSE_INTERIOR_BOUNDS.floorY + 0.05,
    z: FARMHOUSE_INTERIOR_ORIGIN.z - 2.2,
    rotationY: 0
  }
});

/**
 * Cozy furniture layout placed inside the farmhouse interior.
 */
export const FARMHOUSE_INTERIOR_PROPS: readonly InteriorPropPlacement[] = Object.freeze([
  // 1. Rustic Bed in the northwest corner nook
  {
    id: "interior_bed",
    assetId: ASSET_IDS.PROP_BED_COZY_A,
    x: FARMHOUSE_INTERIOR_ORIGIN.x - 2.9,
    y: FARMHOUSE_INTERIOR_BOUNDS.floorY,
    z: FARMHOUSE_INTERIOR_ORIGIN.z + 1.8,
    rotationY: 0,
    scale: 1.0
  },
  // 2. Fireplace Stone Hearth centered on the back wall
  {
    id: "interior_fireplace",
    assetId: ASSET_IDS.PROP_FIREPLACE_HEARTH_A,
    x: FARMHOUSE_INTERIOR_ORIGIN.x,
    y: FARMHOUSE_INTERIOR_BOUNDS.floorY,
    z: FARMHOUSE_INTERIOR_ORIGIN.z + 2.85,
    rotationY: Math.PI,
    scale: 1.0
  },
  // 3. Tall Pantry Cupboard with shelves along the east wall
  {
    id: "interior_cupboard",
    assetId: ASSET_IDS.PROP_CUPBOARD_SHELVES_A,
    x: FARMHOUSE_INTERIOR_ORIGIN.x + 3.8,
    y: FARMHOUSE_INTERIOR_BOUNDS.floorY,
    z: FARMHOUSE_INTERIOR_ORIGIN.z + 1.2,
    rotationY: -Math.PI / 2,
    scale: 1.0
  },
  // 4. Dining Table in the southeast area
  {
    id: "interior_dining_table",
    assetId: ASSET_IDS.PROP_TABLE_DINING_A,
    x: FARMHOUSE_INTERIOR_ORIGIN.x + 2.0,
    y: FARMHOUSE_INTERIOR_BOUNDS.floorY,
    z: FARMHOUSE_INTERIOR_ORIGIN.z - 1.0,
    rotationY: 0,
    scale: 1.0
  },
  // 5. Dining Chairs
  {
    id: "interior_chair_north",
    assetId: ASSET_IDS.PROP_CHAIR_RUSTIC_A,
    x: FARMHOUSE_INTERIOR_ORIGIN.x + 2.0,
    y: FARMHOUSE_INTERIOR_BOUNDS.floorY,
    z: FARMHOUSE_INTERIOR_ORIGIN.z - 0.35,
    rotationY: Math.PI,
    scale: 1.0
  },
  {
    id: "interior_chair_south",
    assetId: ASSET_IDS.PROP_CHAIR_RUSTIC_A,
    x: FARMHOUSE_INTERIOR_ORIGIN.x + 2.0,
    y: FARMHOUSE_INTERIOR_BOUNDS.floorY,
    z: FARMHOUSE_INTERIOR_ORIGIN.z - 1.65,
    rotationY: 0,
    scale: 1.0
  },
  // 6. Reading Armchair near the window
  {
    id: "interior_armchair",
    assetId: ASSET_IDS.PROP_ARMCHAIR_COZY_A,
    x: FARMHOUSE_INTERIOR_ORIGIN.x - 2.8,
    y: FARMHOUSE_INTERIOR_BOUNDS.floorY,
    z: FARMHOUSE_INTERIOR_ORIGIN.z - 1.2,
    rotationY: 0.65,
    scale: 1.0
  },
  // 7. Woven Area Rug in the living hearth area
  {
    id: "interior_rug",
    assetId: ASSET_IDS.PROP_RUG_WOVEN_A,
    x: FARMHOUSE_INTERIOR_ORIGIN.x + 0.3,
    y: FARMHOUSE_INTERIOR_BOUNDS.floorY,
    z: FARMHOUSE_INTERIOR_ORIGIN.z + 0.8,
    rotationY: 0,
    scale: 1.15
  }
]);

export function isInsideFarmhouseInterior(x: number, z: number): boolean {
  return (
    x >= FARMHOUSE_INTERIOR_BOUNDS.minX &&
    x <= FARMHOUSE_INTERIOR_BOUNDS.maxX &&
    z >= FARMHOUSE_INTERIOR_BOUNDS.minZ &&
    z <= FARMHOUSE_INTERIOR_BOUNDS.maxZ
  );
}
