import { OCEAN_ISLAND_DEFINITIONS, type OceanIsletId } from "./OceanIslets";
import type { WorldBounds, WorldPoint } from "./WorldLayout";
import { isInsideLoop, pointSegmentDistance } from "./WorldGeometry";

export { isInsideLoop, pointSegmentDistance } from "./WorldGeometry";

export const SUNREACH_OFFSET_X = 800;

export type WorldIslandId = "island.neva" | "island.sunreach" | OceanIsletId;
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
  id: "terrain.neva" | "terrain.sunreach" | "terrain.gull_rest" | "terrain.driftwood" | "terrain.lantern";
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
  marketId: string | null;
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


export const NEVA_COAST_LOOP = [
  // Southern coast (preserving authored shoreline points)
  { x: -184, z: 89 },
  { x: -130, z: 96 },
  { x: -92, z: 94 },
  { x: -52, z: 87 },
  { x: -12, z: 83 },
  { x: 24, z: 79 },
  { x: 52, z: 74 },
  { x: 72, z: 68 },
  { x: 94, z: 73 },
  { x: 130, z: 82 },
  { x: 184, z: 88 },
  // Eastern coast bluffs (facing the open channel to Sunreach)
  { x: 184, z: 45 },
  { x: 182, z: 0 },
  { x: 176, z: -50 },
  { x: 172, z: -100 },
  { x: 160, z: -150 },
  { x: 140, z: -190 },
  { x: 100, z: -218 },
  // Northern sea cliffs (behind the mountain summits)
  { x: 50, z: -228 },
  { x: 0, z: -234 },
  { x: -50, z: -236 },
  { x: -100, z: -232 },
  { x: -145, z: -218 },
  // Western coast (beaches and rock shelves past western foothills)
  { x: -175, z: -180 },
  { x: -188, z: -140 },
  { x: -192, z: -90 },
  { x: -190, z: -40 },
  { x: -188, z: 10 },
  { x: -184, z: 50 }
] as const;

/** Positive in water, negative on Neva dry land. */
export function signedDistanceToNevaCoast(x: number, z: number): number {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < NEVA_COAST_LOOP.length; index++) {
    distance = Math.min(
      distance,
      pointSegmentDistance(
        x,
        z,
        NEVA_COAST_LOOP[index],
        NEVA_COAST_LOOP[(index + 1) % NEVA_COAST_LOOP.length]
      )
    );
  }
  return isInsideLoop(x, z, NEVA_COAST_LOOP) ? -distance : distance;
}

/**
 * Authored envelope for the warm-dry island. Fine shoreline character is
 * derived from this loop in SunreachWorld; these fixed points keep the cove,
 * southern reef, and exposed ridge stable across seeds.
 */
export const SUNREACH_COAST_LOOP = [
  { x: 349 + SUNREACH_OFFSET_X, z: 42 },
  { x: 365 + SUNREACH_OFFSET_X, z: 18 },
  { x: 389 + SUNREACH_OFFSET_X, z: -18 },
  { x: 431 + SUNREACH_OFFSET_X, z: -61 },
  { x: 480 + SUNREACH_OFFSET_X, z: -82 },
  { x: 532 + SUNREACH_OFFSET_X, z: -78 },
  { x: 581 + SUNREACH_OFFSET_X, z: -55 },
  { x: 621 + SUNREACH_OFFSET_X, z: -22 },
  { x: 646 + SUNREACH_OFFSET_X, z: 18 },
  { x: 653 + SUNREACH_OFFSET_X, z: 62 },
  { x: 642 + SUNREACH_OFFSET_X, z: 105 },
  { x: 613 + SUNREACH_OFFSET_X, z: 143 },
  { x: 571 + SUNREACH_OFFSET_X, z: 174 },
  { x: 525 + SUNREACH_OFFSET_X, z: 198 },
  { x: 479 + SUNREACH_OFFSET_X, z: 194 },
  { x: 433 + SUNREACH_OFFSET_X, z: 177 },
  { x: 397 + SUNREACH_OFFSET_X, z: 149 },
  { x: 372 + SUNREACH_OFFSET_X, z: 116 },
  { x: 360 + SUNREACH_OFFSET_X, z: 84 },
  { x: 349 + SUNREACH_OFFSET_X, z: 72 },
  { x: 350 + SUNREACH_OFFSET_X, z: 58 }
] as const;

export const SUNREACH_ANCHORS = Object.freeze({
  dockBoat: { x: 343 + SUNREACH_OFFSET_X, z: 58 },
  dockPlayer: { x: 355 + SUNREACH_OFFSET_X, z: 58 },
  coveMarket: { x: 373 + SUNREACH_OFFSET_X, z: 56 },
  terraceFarm: { x: 455 + SUNREACH_OFFSET_X, z: 5 },
  dryScrub: { x: 515 + SUNREACH_OFFSET_X, z: 75 },
  exposedRidge: { x: 590 + SUNREACH_OFFSET_X, z: 25 },
  southernReefView: { x: 520 + SUNREACH_OFFSET_X, z: 180 }
});

const NEVA_TERRAIN_PATCH = terrainPatch("terrain.neva", "island.neva", { x: 0, z: 0 }, 600, 384, 18);
const SUNREACH_TERRAIN_PATCH = terrainPatch("terrain.sunreach", "island.sunreach", { x: 500 + SUNREACH_OFFSET_X, z: 60 }, 360, 256, 16);

export const WORLD_ISLAND_DEFINITIONS: Readonly<Record<WorldIslandId, Readonly<WorldIslandDefinition>>> = Object.freeze({
  ...OCEAN_ISLAND_DEFINITIONS,
  "island.neva": Object.freeze({
    id: "island.neva",
    biomeId: "biome.neva_temperate",
    label: "Neva",
    terrainPatch: NEVA_TERRAIN_PATCH,
    authoredBounds: Object.freeze({ minX: -220, maxX: 200, minZ: -250, maxZ: 130 }),
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
    authoredBounds: Object.freeze({ minX: 330 + SUNREACH_OFFSET_X, maxX: 670 + SUNREACH_OFFSET_X, minZ: -100, maxZ: 220 }),
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
      { x: 90, z: 221.41154209242305, habitatId: "offshore" as const, reviewSpeciesId: "fish.blue_marlin" },
      // The river taught sport fishing in Act 3 and then had no sport school at
      // all, so the starting water went dead the moment the lesson ended. This
      // sits on the charted Silverwater access, where the bank reserve gives
      // the encounter a channel run to work with.
      { x: -19.193839218632608, z: -40, habitatId: "river" as const, reviewSpeciesId: "fish.trout" },
      // The deep trench, southwest and well past the working grounds. A second
      // offshore point so the far water is a place the player goes rather than
      // a re-roll of the one they already know.
      { x: -40, z: 250, habitatId: "offshore" as const, reviewSpeciesId: "fish.swordfish" },
      { x: 420, z: 325, habitatId: "offshore" as const, reviewSpeciesId: "fish.swordfish" },
      { x: 605, z: 110, habitatId: "coast" as const, reviewSpeciesId: "fish.tuna" }
    ])
  }),
  "ecology.sunreach": Object.freeze({
    id: "ecology.sunreach",
    islandId: "island.sunreach",
    label: "Sunreach Waters",
    schoolSpawnPoints: Object.freeze([
      // The reef edge where the southern shelf drops away. Tomas's whole case
      // for Sunreach is that "the cove is shelter, not a fishery. The shelf is
      // the fishery", and Acts 7 and 8 send the player here; the school used to
      // sit at the cove mouth beside the dock, so the reef the story is about
      // held nothing. Every rotation offset stays in Sunreach coast water and
      // the reef is sailable from the dock, about as far as the offshore point.
      { x: 586 + SUNREACH_OFFSET_X, z: 184, habitatId: "coast" as const, reviewSpeciesId: "fish.amberjack" },
      { x: 620 + SUNREACH_OFFSET_X, z: 250, habitatId: "offshore" as const, reviewSpeciesId: "fish.amberjack" },
      { x: 785, z: -40, habitatId: "coast" as const, reviewSpeciesId: "fish.amberjack" },
      { x: 960, z: 410, habitatId: "offshore" as const, reviewSpeciesId: "fish.amberjack" }
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
