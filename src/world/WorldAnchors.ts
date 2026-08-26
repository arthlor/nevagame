/**
 * Pure gameplay-space anchors shared by simulation, physics and presentation.
 * Keep this module free of Three.js so simulation can consume it directly.
 */
import { starterMarketAnchor } from "./FarmLayout";

export const WORLD_LAYOUT_REVISION = 3 as const;

export const WORLD_SPAWN = {
  playerPosition: { x: -65, z: -60.5 },
  regionId: "region.farm"
} as const;

const STARTER_PRODUCE_STALL = starterMarketAnchor("market.village")!;

export const VILLAGE_MARKET = {
  marketId: "market.village",
  position: { x: STARTER_PRODUCE_STALL.x, z: STARTER_PRODUCE_STALL.z },
  radiusMeters: STARTER_PRODUCE_STALL.radiusMeters,
  rotationY: STARTER_PRODUCE_STALL.rotationY
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
  playerPosition: { x: 76, z: 64 },
  boardRadius: 4,
  dockRadius: 6
} as const;

/** Separate mooring keeps the progression skiff readable beside the family rowboat. */
export const HARBOR_SKIFF_MOORING = {
  marketId: "market.harbor",
  boatPosition: { x: 88, y: 0, z: 72 },
  playerPosition: { x: 86, z: 69 },
  boardRadius: 4,
  dockRadius: 6
} as const;

export function harborMooringForBoatType(boatTypeId: string): typeof HARBOR_DOCK | typeof HARBOR_SKIFF_MOORING {
  return boatTypeId === "boat.skiff" ? HARBOR_SKIFF_MOORING : HARBOR_DOCK;
}

/** Harbor fish-cleaning table in front of the fish-market landmark. */
export const HARBOR_FISH_TABLE = {
  structureId: "struct.harbor_fish_table",
  type: "fish-table" as const,
  position: { x: 71, z: 60.8 },
  rotationY: Math.PI - 0.2,
  clearanceRadius: 1.3,
  frontApproachDistanceMeters: 1.05
} as const;

export const HARBOR_SILAS_ANCHOR = { x: 83, z: 61 } as const;
/** Market-side approach keeps Maeve readable without occupying the fish-table work face. */
export const HARBOR_MAEVE_ANCHOR = { x: 65.5, z: 66.9 } as const;
