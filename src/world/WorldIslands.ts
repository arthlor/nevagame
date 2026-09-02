import type { WorldBounds, WorldPoint } from "./WorldLayout";

export type WorldIslandId = "island.neva" | "island.sunreach";
export type WorldBiomeId = "biome.neva_temperate" | "biome.sunreach_warm_dry";
export type FishingEcologyId = "ecology.neva" | "ecology.sunreach";

export type WorldRegionId =
  | "region.village"
  | "region.farm"
  | "region.coast"
  | "region.harbor"
  | "region.offshore"
  | "region.open_channel"
  | "region.sunreach_cove"
  | "region.sunreach_terraces"
  | "region.sunreach_scrub"
  | "region.sunreach_ridge";

export interface WorldTerrainPatchDefinition {
  id: "terrain.neva" | "terrain.sunreach";
  islandId: WorldIslandId;
  center: Readonly<WorldPoint>;
  sizeMeters: number;
  resolution: number;
  bounds: Readonly<WorldBounds>;
  /** Visual-only skirt below sea level. It is never part of the collider. */
  submergedApronMeters: number;
}

export interface WorldClimateWeatherInput {
  temperatureC: number;
  precipitation: number;
  windSpeed: number;
  windDirectionDeg: number;
  seaRoughness: number;
}

export interface WorldClimateSample {
  islandId: WorldIslandId;
  biomeId: WorldBiomeId;
  climateId: "temperate" | "warm";
  temperatureC: number;
  temperatureOffsetC: number;
  precipitation: number;
  rainfallEffectiveness: number;
  effectivePrecipitation: number;
  evaporationMultiplier: number;
  exposure: number;
}

export interface WorldDrainageSample {
  islandId: WorldIslandId;
  catchment: number;
  wash: number;
  erosion: number;
  deposition: number;
  moisturePotential: number;
  slope: number;
  aspect: number;
  saltExposure: number;
  reefShelfInfluence: number;
}

export interface MarineSample {
  /** Positive in water and negative on dry land. */
  signedShoreDistance: number;
  bathymetryMeters: number;
  coveShelter: number;
  openWaterExposure: number;
  reefInfluence: number;
  shallowWaterInfluence: number;
  waveDirection: Readonly<WorldPoint>;
  flowDirection: Readonly<WorldPoint>;
  navigationHazard: number;
  ecologyWeights: Readonly<Record<FishingEcologyId, number>>;
}

export interface FishingEcologyDefinition {
  id: FishingEcologyId;
  islandId: WorldIslandId;
  label: string;
  schoolSpawnPoints: readonly Readonly<WorldPoint & {
    habitatId: "river" | "lake" | "coast" | "offshore";
    reviewSpeciesId?: string;
  }>[];
}

export interface BoatMooringDefinition {
  id: string;
  islandId: WorldIslandId;
  marketId: string;
  boatPosition: Readonly<{ x: number; y: number; z: number }>;
  playerPosition: Readonly<WorldPoint>;
  boardRadius: number;
  hullBoardRadius: number;
  dockRadius: number;
  boatTypeIds?: readonly string[];
}

export interface SailingRequirement {
  id: "navigation.open_channel";
  requiredBoatTypeId: "boat.skiff";
  message: string;
  exposureThreshold: number;
}

export interface WorldIslandDefinition {
  id: WorldIslandId;
  biomeId: WorldBiomeId;
  label: string;
  terrainPatch: Readonly<WorldTerrainPatchDefinition>;
  authoredBounds: Readonly<WorldBounds>;
  /** Clockwise closed shoreline loop used by the shared marine field. */
  coastLoop: readonly Readonly<WorldPoint>[];
  fishingEcologyId: FishingEcologyId;
  regions: readonly WorldRegionId[];
  anchors: Readonly<Record<string, Readonly<WorldPoint>>>;
}

function terrainPatch(
  id: WorldTerrainPatchDefinition["id"],
  islandId: WorldIslandId,
  center: Readonly<WorldPoint>,
  sizeMeters: number,
  resolution: number,
  submergedApronMeters: number
): WorldTerrainPatchDefinition {
  const half = sizeMeters * 0.5;
  return {
    id,
    islandId,
    center,
    sizeMeters,
    resolution,
    bounds: {
      minX: center.x - half,
      maxX: center.x + half,
      minZ: center.z - half,
      maxZ: center.z + half
    },
    submergedApronMeters
  };
}

const NEVA_COAST_LOOP = [
  { x: -180, z: 89 },
  { x: -130, z: 96 },
  { x: -92, z: 94 },
  { x: -52, z: 87 },
  { x: -12, z: 83 },
  { x: 24, z: 79 },
  { x: 52, z: 74 },
  { x: 72, z: 68 },
  { x: 94, z: 73 },
  { x: 130, z: 82 },
  { x: 180, z: 88 },
  { x: 180, z: -160 },
  { x: -180, z: -160 }
] as const;

/**
 * Authored envelope for the warm-dry island. Fine shoreline character is
 * derived from this loop in SunreachWorld; these fixed points keep the cove,
 * southern reef, and exposed ridge stable across seeds.
 */
export const SUNREACH_COAST_LOOP = [
  { x: 349, z: 42 },
  { x: 365, z: 18 },
  { x: 389, z: -18 },
  { x: 431, z: -61 },
  { x: 480, z: -82 },
  { x: 532, z: -78 },
  { x: 581, z: -55 },
  { x: 621, z: -22 },
  { x: 646, z: 18 },
  { x: 653, z: 62 },
  { x: 642, z: 105 },
  { x: 613, z: 143 },
  { x: 571, z: 174 },
  { x: 525, z: 198 },
  { x: 479, z: 194 },
  { x: 433, z: 177 },
  { x: 397, z: 149 },
  { x: 372, z: 116 },
  { x: 360, z: 84 },
  { x: 349, z: 72 },
  { x: 350, z: 58 }
] as const;

export const SUNREACH_ANCHORS = Object.freeze({
  dockBoat: { x: 343, z: 58 },
  dockPlayer: { x: 355, z: 58 },
  coveMarket: { x: 373, z: 56 },
  terraceFarm: { x: 455, z: 5 },
  dryScrub: { x: 515, z: 75 },
  exposedRidge: { x: 590, z: 25 },
  southernReefView: { x: 520, z: 180 }
});

const NEVA_TERRAIN_PATCH = terrainPatch("terrain.neva", "island.neva", { x: 0, z: 0 }, 600, 384, 18);
const SUNREACH_TERRAIN_PATCH = terrainPatch("terrain.sunreach", "island.sunreach", { x: 500, z: 60 }, 360, 256, 16);

export const WORLD_ISLAND_DEFINITIONS: Readonly<Record<WorldIslandId, Readonly<WorldIslandDefinition>>> = Object.freeze({
  "island.neva": Object.freeze({
    id: "island.neva",
    biomeId: "biome.neva_temperate",
    label: "Neva",
    terrainPatch: NEVA_TERRAIN_PATCH,
    authoredBounds: Object.freeze({ minX: -180, maxX: 180, minZ: -160, maxZ: 120 }),
    coastLoop: NEVA_COAST_LOOP,
    fishingEcologyId: "ecology.neva",
    regions: ["region.village", "region.farm", "region.coast", "region.harbor", "region.offshore"] as const,
    anchors: Object.freeze({})
  }),
  "island.sunreach": Object.freeze({
    id: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    label: "Sunreach Isle",
    terrainPatch: SUNREACH_TERRAIN_PATCH,
    authoredBounds: Object.freeze({ minX: 340, maxX: 654, minZ: -90, maxZ: 205 }),
    coastLoop: SUNREACH_COAST_LOOP,
    fishingEcologyId: "ecology.sunreach",
    regions: [
      "region.sunreach_cove",
      "region.sunreach_terraces",
      "region.sunreach_scrub",
      "region.sunreach_ridge"
    ] as const,
    anchors: SUNREACH_ANCHORS
  })
});

export const WORLD_ISLAND_IDS = Object.freeze(Object.keys(WORLD_ISLAND_DEFINITIONS) as WorldIslandId[]);

export const FISHING_ECOLOGY_DEFINITIONS: Readonly<Record<FishingEcologyId, Readonly<FishingEcologyDefinition>>> = Object.freeze({
  "ecology.neva": Object.freeze({
    id: "ecology.neva",
    islandId: "island.neva",
    label: "Neva Waters",
    schoolSpawnPoints: Object.freeze([
      { x: 18, z: 92.21637079147003, habitatId: "lake" as const, reviewSpeciesId: "fish.trout" },
      { x: 118, z: 138.00113938994076, habitatId: "coast" as const, reviewSpeciesId: "fish.tuna" },
      { x: 90, z: 221.41154209242305, habitatId: "offshore" as const, reviewSpeciesId: "fish.blue_marlin" }
    ])
  }),
  "ecology.sunreach": Object.freeze({
    id: "ecology.sunreach",
    islandId: "island.sunreach",
    label: "Sunreach Waters",
    schoolSpawnPoints: Object.freeze([
      { x: 344, z: 66, habitatId: "coast" as const, reviewSpeciesId: "fish.sea_bream" },
      { x: 620, z: 250, habitatId: "offshore" as const, reviewSpeciesId: "fish.amberjack" }
    ])
  })
});

export const OPEN_CHANNEL_REQUIREMENT: Readonly<SailingRequirement> = Object.freeze({
  id: "navigation.open_channel",
  requiredBoatTypeId: "boat.skiff",
  message: "The open channel needs the Coastal Fishing Skiff.",
  exposureThreshold: 0.58
});

export function worldIslandDefinitions(): readonly Readonly<WorldIslandDefinition>[] {
  return WORLD_ISLAND_IDS.map((id) => WORLD_ISLAND_DEFINITIONS[id]);
}
