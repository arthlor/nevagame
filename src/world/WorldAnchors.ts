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

export const HARBOR_DOCK = {
  marketId: "market.harbor",
  boatPosition: { x: 81, y: 0, z: 72 },
  playerPosition: { x: 76, z: 64 },
  boardRadius: 4,
  dockRadius: 6
} as const;

/** Harbor fish-cleaning table in front of the fish-market landmark. */
export const HARBOR_FISH_TABLE = {
  structureId: "struct.harbor_fish_table",
  type: "fish-table" as const,
  position: { x: 71, z: 63.2 },
  rotationY: Math.PI - 0.2,
  clearanceRadius: 1.3
} as const;
