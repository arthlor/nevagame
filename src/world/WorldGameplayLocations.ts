import { PLAYER_HOMESTEAD_LAYOUT, STARTER_FARM_LAYOUT, SUNREACH_FARM_LAYOUT, starterStructureAnchor } from "./FarmLayout";
import { HARBOR_FISH_TABLE, HARBOR_MARKET, VILLAGE_MARKET } from "./WorldAnchors";
import { SUNREACH_ANCHORS, type WorldIslandId, type WorldRegionId } from "./WorldIslands";

export interface WorldFarmDefinition {
  id: string;
  islandId: WorldIslandId;
  regionId: WorldRegionId;
  origin: Readonly<{ x: number; z: number }>;
  widthMeters: number;
  depthMeters: number;
  climateId: "temperate" | "warm";
  fertility: number;
  moistureRetention: number;
  accessType: "public" | "private";
  leaseCost: number;
  plantableAreas: readonly Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>[];
  structureIds: readonly string[];
}

export interface WorldStationDefinition {
  id: string;
  islandId: WorldIslandId;
  type: "hand-mill" | "workbench" | "fish-table" | "compost-bin";
  position: Readonly<{ x: number; z: number }>;
  rotationY: number;
  approachDistanceMeters: number;
}

export interface WorldMarketLocation {
  id: string;
  islandId: WorldIslandId;
  regionId: WorldRegionId;
  position: Readonly<{ x: number; z: number }>;
  radiusMeters: number;
}

export interface WorldChartNode {
  id: string;
  islandId: WorldIslandId | null;
  regionId: WorldRegionId;
  position: Readonly<{ x: number; z: number }>;
  label: string;
  kind: "market" | "farm" | "dock" | "landmark" | "water";
  marketId?: string;
  farmId?: string;
  fishingHabitat?: "river" | "lake" | "coast" | "offshore";
  fishingEcologyId?: "ecology.neva" | "ecology.sunreach";
}

export interface WorldAmbienceProfile {
  id: string;
  islandId: WorldIslandId | null;
  regionId: WorldRegionId;
  windGain: number;
  surfGain: number;
  insectsGain: number;
  harborGain: number;
}

function farmSize(layout: typeof STARTER_FARM_LAYOUT | typeof PLAYER_HOMESTEAD_LAYOUT): { widthMeters: number; depthMeters: number } {
  const area = layout.plantableAreas[0] ?? layout.farmBounds;
  return { widthMeters: area.maxX - area.minX, depthMeters: area.maxZ - area.minZ };
}

export const SUNREACH_TERRACE_AREAS = SUNREACH_FARM_LAYOUT.plantableAreas;

export const WORLD_FARM_DEFINITIONS: Readonly<Record<string, Readonly<WorldFarmDefinition>>> = Object.freeze({
  "farm.starter_garden": Object.freeze({
    id: "farm.starter_garden",
    islandId: "island.neva",
    regionId: "region.farm",
    origin: STARTER_FARM_LAYOUT.origin,
    ...farmSize(STARTER_FARM_LAYOUT),
    climateId: "temperate",
    fertility: 85,
    moistureRetention: 0.7,
    accessType: "public",
    leaseCost: 0,
    plantableAreas: STARTER_FARM_LAYOUT.plantableAreas,
    structureIds: ["struct.starter_mill", "struct.workbench", "struct.starter_compost"]
  }),
  "farm.player_homestead": Object.freeze({
    id: "farm.player_homestead",
    islandId: "island.neva",
    regionId: "region.farm",
    origin: PLAYER_HOMESTEAD_LAYOUT.origin,
    ...farmSize(PLAYER_HOMESTEAD_LAYOUT),
    climateId: "temperate",
    fertility: 90,
    moistureRetention: 0.8,
    accessType: "private",
    leaseCost: 50,
    plantableAreas: PLAYER_HOMESTEAD_LAYOUT.plantableAreas,
    structureIds: []
  }),
  "farm.sunreach_terraces": Object.freeze({
    id: "farm.sunreach_terraces",
    islandId: "island.sunreach",
    regionId: "region.sunreach_terraces",
    origin: SUNREACH_FARM_LAYOUT.origin,
    widthMeters: 52,
    depthMeters: 51,
    climateId: "warm",
    fertility: 80,
    moistureRetention: 0.45,
    accessType: "public",
    leaseCost: 0,
    plantableAreas: SUNREACH_FARM_LAYOUT.plantableAreas,
    structureIds: [
      "struct.sunreach_hand_mill",
      "struct.sunreach_workbench",
      "struct.sunreach_fish_table"
    ]
  })
});

const starterMill = starterStructureAnchor("struct.starter_mill")!;
const starterWorkbench = starterStructureAnchor("struct.workbench")!;
const starterCompost = starterStructureAnchor("struct.starter_compost")!;

export const WORLD_STATION_DEFINITIONS: Readonly<Record<string, Readonly<WorldStationDefinition>>> = Object.freeze({
  [starterMill.id]: Object.freeze({
    id: starterMill.id,
    islandId: "island.neva",
    type: starterMill.type,
    position: { x: starterMill.x, z: starterMill.z },
    rotationY: starterMill.rotationY,
    approachDistanceMeters: starterMill.frontApproachDistanceMeters
  }),
  [starterWorkbench.id]: Object.freeze({
    id: starterWorkbench.id,
    islandId: "island.neva",
    type: starterWorkbench.type,
    position: { x: starterWorkbench.x, z: starterWorkbench.z },
    rotationY: starterWorkbench.rotationY,
    approachDistanceMeters: 1.05
  }),
  [starterCompost.id]: Object.freeze({
    id: starterCompost.id,
    islandId: "island.neva",
    type: starterCompost.type,
    position: { x: starterCompost.x, z: starterCompost.z },
    rotationY: starterCompost.rotationY,
    approachDistanceMeters: starterCompost.frontApproachDistanceMeters
  }),
  [HARBOR_FISH_TABLE.structureId]: Object.freeze({
    id: HARBOR_FISH_TABLE.structureId,
    islandId: "island.neva",
    type: HARBOR_FISH_TABLE.type,
    position: HARBOR_FISH_TABLE.position,
    rotationY: HARBOR_FISH_TABLE.rotationY,
    approachDistanceMeters: HARBOR_FISH_TABLE.frontApproachDistanceMeters
  }),
  "struct.sunreach_hand_mill": Object.freeze({
    id: "struct.sunreach_hand_mill",
    islandId: "island.sunreach",
    type: "hand-mill",
    position: { x: 444, z: 21 },
    rotationY: 2.35,
    approachDistanceMeters: 1.2
  }),
  "struct.sunreach_workbench": Object.freeze({
    id: "struct.sunreach_workbench",
    islandId: "island.sunreach",
    type: "workbench",
    position: { x: 466, z: 17 },
    rotationY: -0.7,
    approachDistanceMeters: 1.05
  }),
  "struct.sunreach_fish_table": Object.freeze({
    id: "struct.sunreach_fish_table",
    islandId: "island.sunreach",
    type: "fish-table",
    position: { x: 382, z: 61 },
    rotationY: -1.5,
    approachDistanceMeters: 1.05
  })
});

export const WORLD_MARKET_LOCATIONS: Readonly<Record<string, Readonly<WorldMarketLocation>>> = Object.freeze({
  [VILLAGE_MARKET.marketId]: Object.freeze({
    id: VILLAGE_MARKET.marketId,
    islandId: "island.neva",
    regionId: "region.village",
    position: VILLAGE_MARKET.position,
    radiusMeters: VILLAGE_MARKET.radiusMeters
  }),
  [HARBOR_MARKET.marketId]: Object.freeze({
    id: HARBOR_MARKET.marketId,
    islandId: "island.neva",
    regionId: "region.harbor",
    position: HARBOR_MARKET.position,
    radiusMeters: HARBOR_MARKET.radiusMeters
  }),
  "market.sunreach_cove": Object.freeze({
    id: "market.sunreach_cove",
    islandId: "island.sunreach",
    regionId: "region.sunreach_cove",
    position: SUNREACH_ANCHORS.coveMarket,
    radiusMeters: 7
  })
});

export const WORLD_CHART_NODES: readonly Readonly<WorldChartNode>[] = Object.freeze([
  { id: "chart.neva_farm", islandId: "island.neva", regionId: "region.farm", position: STARTER_FARM_LAYOUT.origin, label: "Starter Homestead", kind: "farm", farmId: "farm.starter_garden" },
  { id: "chart.neva_homestead", islandId: "island.neva", regionId: "region.farm", position: PLAYER_HOMESTEAD_LAYOUT.origin, label: "Private Homestead", kind: "farm", farmId: "farm.player_homestead" },
  { id: "chart.neva_village", islandId: "island.neva", regionId: "region.village", position: VILLAGE_MARKET.position, label: "Village Market", kind: "market", marketId: "market.village" },
  { id: "chart.neva_mill", islandId: "island.neva", regionId: "region.village", position: { x: 57.8, z: -81.2 }, label: "Village Mill", kind: "landmark" },
  { id: "chart.neva_crossing", islandId: "island.neva", regionId: "region.coast", position: { x: 0, z: -5 }, label: "River Crossing", kind: "water", fishingHabitat: "river", fishingEcologyId: "ecology.neva" },
  { id: "chart.neva_river", islandId: "island.neva", regionId: "region.coast", position: { x: -19.193839218632608, z: -40 }, label: "Silverwater River", kind: "water", fishingHabitat: "river", fishingEcologyId: "ecology.neva" },
  { id: "chart.neva_harbor", islandId: "island.neva", regionId: "region.harbor", position: HARBOR_MARKET.position, label: "Seabreak Harbor", kind: "dock", marketId: "market.harbor", fishingHabitat: "coast", fishingEcologyId: "ecology.neva" },
  { id: "chart.neva_lighthouse", islandId: "island.neva", regionId: "region.coast", position: { x: -92, z: 74 }, label: "Lighthouse Cliffs", kind: "landmark", fishingHabitat: "coast", fishingEcologyId: "ecology.neva" },
  { id: "chart.neva_offshore", islandId: "island.neva", regionId: "region.offshore", position: { x: 15, z: 170 }, label: "Neva Offshore Grounds", kind: "water", fishingHabitat: "offshore", fishingEcologyId: "ecology.neva" },
  { id: "chart.open_channel", islandId: null, regionId: "region.open_channel", position: { x: 310, z: 72 }, label: "Open Channel", kind: "water" },
  { id: "chart.sunreach_cove", islandId: "island.sunreach", regionId: "region.sunreach_cove", position: SUNREACH_ANCHORS.coveMarket, label: "Sunreach Cove", kind: "market", marketId: "market.sunreach_cove", fishingHabitat: "coast", fishingEcologyId: "ecology.sunreach" },
  { id: "chart.sunreach_terraces", islandId: "island.sunreach", regionId: "region.sunreach_terraces", position: SUNREACH_ANCHORS.terraceFarm, label: "Sunreach Terraces", kind: "farm", farmId: "farm.sunreach_terraces" },
  { id: "chart.sunreach_ridge", islandId: "island.sunreach", regionId: "region.sunreach_ridge", position: SUNREACH_ANCHORS.exposedRidge, label: "Exposed Ridge", kind: "landmark" },
  { id: "chart.sunreach_reef", islandId: "island.sunreach", regionId: "region.sunreach_scrub", position: SUNREACH_ANCHORS.southernReefView, label: "Sunreach Reef Shelf", kind: "water", fishingHabitat: "coast", fishingEcologyId: "ecology.sunreach" }
]);

export const WORLD_AMBIENCE_PROFILES: readonly Readonly<WorldAmbienceProfile>[] = Object.freeze([
  { id: "ambience.neva_village", islandId: "island.neva", regionId: "region.village", windGain: 0.35, surfGain: 0.08, insectsGain: 0.38, harborGain: 0 },
  { id: "ambience.neva_farm", islandId: "island.neva", regionId: "region.farm", windGain: 0.3, surfGain: 0.06, insectsGain: 0.5, harborGain: 0 },
  { id: "ambience.neva_coast", islandId: "island.neva", regionId: "region.coast", windGain: 0.58, surfGain: 0.7, insectsGain: 0.12, harborGain: 0 },
  { id: "ambience.neva_harbor", islandId: "island.neva", regionId: "region.harbor", windGain: 0.42, surfGain: 0.48, insectsGain: 0.08, harborGain: 0.72 },
  { id: "ambience.neva_offshore", islandId: null, regionId: "region.offshore", windGain: 0.72, surfGain: 0.82, insectsGain: 0, harborGain: 0 },
  { id: "ambience.open_channel", islandId: null, regionId: "region.open_channel", windGain: 0.9, surfGain: 0.95, insectsGain: 0, harborGain: 0 },
  { id: "ambience.sunreach_cove", islandId: "island.sunreach", regionId: "region.sunreach_cove", windGain: 0.48, surfGain: 0.62, insectsGain: 0.18, harborGain: 0.5 },
  { id: "ambience.sunreach_terraces", islandId: "island.sunreach", regionId: "region.sunreach_terraces", windGain: 0.46, surfGain: 0.16, insectsGain: 0.44, harborGain: 0 },
  { id: "ambience.sunreach_scrub", islandId: "island.sunreach", regionId: "region.sunreach_scrub", windGain: 0.68, surfGain: 0.22, insectsGain: 0.3, harborGain: 0 },
  { id: "ambience.sunreach_ridge", islandId: "island.sunreach", regionId: "region.sunreach_ridge", windGain: 0.94, surfGain: 0.4, insectsGain: 0.08, harborGain: 0 }
]);

export const WORLD_REGION_LABELS = Object.freeze(Object.fromEntries(
  WORLD_CHART_NODES.map((node) => [node.regionId, node.label])
) as Readonly<Record<WorldRegionId, string>>);
