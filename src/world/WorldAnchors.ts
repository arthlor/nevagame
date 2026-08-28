/**
 * Pure gameplay-space anchors shared by simulation, physics and presentation.
 * Keep this module free of Three.js so simulation can consume it directly.
 */

export const WORLD_LAYOUT_REVISION = 8 as const;

export const WORLD_SPAWN = {
  playerPosition: { x: -65, z: -60.5 },
  regionId: "region.farm"
} as const;

/** East-bank apron after the stone bridge; no longer a fake village plaza. */
export const RIVER_CROSSING = { x: 0, z: -5 } as const;

/** Packed village court landform. Independent of the produce stall pose. */
export const VILLAGE_PLAZA = { x: 52.9, z: -53.2 } as const;

/** Northeast village plaza — produce market and arterial road hub. */
export const VILLAGE_MARKET = {
  marketId: "market.village",
  position: { x: 53.2, z: -51.5},
  radiusMeters: 6,
  // Stall working face opens southwest toward the mill pad, not the packed court.
  rotationY: -0.7854
} as const;

/** Inland side of the harbor apron; the fish table and dock sit in front of it. */
export const HARBOR_MARKET = {
  marketId: "market.harbor",
  position: { x: 64, z: 60 },
  radiusMeters: 7,
  rotationY: Math.PI - 0.2,
  scale: 0.84
} as const;

export const HARBOR_DOCK = {
  marketId: "market.harbor",
  boatPosition: { x: 81, y: 0, z: 72 },
  // Keep the disembark/boarding point on the authored pier and within the
  // interaction envelope of the current dock landmark.
  playerPosition: { x: 76, z: 66 },
  /** Shore-apron reach. The hull itself uses hullBoardRadius so Act 5's boat pin can board. */
  boardRadius: 4,
  /** Covers the full 14 m pier so boarding works from any walkable deck bay. */
  hullBoardRadius: 7.5,
  dockRadius: 6
} as const;

/**
 * Walkable pier box for `dock_straight_a` after landmark yaw π/2:
 * generator length runs along world Z, width along world X.
 * Keep in sync with catalog `length` / `width` and `WorldLayout.landmark("dock")`.
 */
export const HARBOR_PIER_DECK = {
  halfWidthX: 2.7,
  halfLengthZ: 7.1,
  hullKeepout: 2.25,
  /** Asset-space walkable plank top. World Y = terrain(dock) + yOffset + this. */
  deckSurfaceAssetY: 2.6,
  /** Shore stairs extend along world −Z from the south deck edge. */
  stairRun: 1.75,
  stairHalfWidthX: 1.75
} as const;

/** Separate mooring keeps the progression skiff readable beside the family rowboat. */
export const HARBOR_SKIFF_MOORING = {
  marketId: "market.harbor",
  boatPosition: { x: 88, y: 0, z: 72 },
  playerPosition: { x: 86, z: 69 },
  boardRadius: 4,
  hullBoardRadius: 6,
  dockRadius: 6
} as const;

export function harborMooringForBoatType(boatTypeId: string): typeof HARBOR_DOCK | typeof HARBOR_SKIFF_MOORING {
  return boatTypeId === "boat.skiff" ? HARBOR_SKIFF_MOORING : HARBOR_DOCK;
}

/** Harbor fish-cleaning table in front of the fish-market landmark. */
export const HARBOR_FISH_TABLE = {
  structureId: "struct.harbor_fish_table",
  type: "fish-table" as const,
  position: { x: 70.8, z: 61.8},
  // The reused workbench's cleaning face opens toward the dry dock approach.
  rotationY: 4.7124,
  clearanceRadius: 1.3,
  frontApproachDistanceMeters: 1.05
} as const;

export const HARBOR_SILAS_ANCHOR = { x: 83, z: 61} as const;
/**
 * In front of the fish-market stall and stairs. After glTF, the stall sits on
 * local +Z; world offset uses the landmark yaw so she faces the counter.
 * Distance clears the scaled collision box (~4.3 m) without entering the fish-table work face.
 */
const HARBOR_MAEVE_FRONT_DISTANCE_METERS = 5.9;
export const HARBOR_MAEVE_ANCHOR = {
  x: HARBOR_MARKET.position.x + Math.sin(HARBOR_MARKET.rotationY) * HARBOR_MAEVE_FRONT_DISTANCE_METERS,
  z: HARBOR_MARKET.position.z + Math.cos(HARBOR_MARKET.rotationY) * HARBOR_MAEVE_FRONT_DISTANCE_METERS
} as const;
