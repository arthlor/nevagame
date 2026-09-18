/**
 * Pure gameplay-space anchors shared by simulation, physics and presentation.
 * Keep this module free of Three.js so simulation can consume it directly.
 */

export const WORLD_LAYOUT_REVISION = 21 as const;

export const WORLD_SPAWN = {
  playerPosition: { x: -65, z: -60.5 },
  regionId: "region.farm"
} as const;

/** East-bank apron after the stone bridge; no longer a fake village plaza. */
export const RIVER_CROSSING = { x: 0, z: -5 } as const;

/**
 * Packed village court landform. Centered on the produce market so the market
 * stall, well and benches read as one compact square rather than a broad field
 * of graded road with the market stranded at its edge.
 */
export const VILLAGE_PLAZA = { x: 42.0, z: -66.5 } as const;

/**
 * Freestanding town notice board on the village square. Sits clear of the
 * produced stall's 6 m interaction ring and every building envelope, on the
 * south side of the court, and faces north toward the market.
 */
export const VILLAGE_BULLETIN = {
  position: { x: 46.5, z: -71.5 },
  rotationY: 0,
  interactionRadiusMeters: 2.6
} as const;

/** Northeast village plaza — produce market and arterial road hub. */
/**
 * The village crossing: where the four village routes meet and the paved court is drawn. Distinct
 * from VILLAGE_PLAZA (the flattened landform under the square) and from VILLAGE_MARKET (the stall
 * building). The junction stays clear so the market can stand on its south lip instead of in the
 * middle of the roads, while cottages and pads keep aiming at the square.
 */
export const VILLAGE_CROSSING = { x: 39.7, z: -65.9 } as const;

export const VILLAGE_MARKET = {
  marketId: "market.village",
  // South lip of the court: every route arrives from the north, so the stall closes the one open
  // side with its counter facing the crossing. The 6 m market radius still reaches the square.
  position: { x: 39.7, z: -71.6 },
  radiusMeters: 6,
  // The stall's counter and awning face +Z, i.e. north into the court.
  rotationY: 0
} as const;

/** Inland side of the harbor apron; the fish table and dock sit in front of it. */
export const HARBOR_MARKET = {
  marketId: "market.harbor",
  position: { x: 64, z: 60 },
  radiusMeters: 7,
  rotationY: Math.PI - 0.2,
  scale: 0.84
} as const;

/** Open harbor apron in front of the Fish Market stall counter where routes terminate. */
export const HARBOR_MARKET_APRON = { x: 64.5, z: 54.5 } as const;

export const HARBOR_DOCK = {
  marketId: "market.harbor",
  // After landmark yaw π/2, catalog pile half-extent Z becomes world X.
  // Keep the hull east of that water-side face so Rapier never starts the
  // rowboat overlapping pilings (a toi=0 start freezes every boat cast).
  boatPosition: { x: 82.4, y: 0, z: 72 },
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
  halfLengthZ: 7.0,
  hullKeepout: 2.25,
  /** Asset-space walkable plank top matching catalog collision top (2.5 + 0.18 = 2.68). */
  deckSurfaceAssetY: 2.68,
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
