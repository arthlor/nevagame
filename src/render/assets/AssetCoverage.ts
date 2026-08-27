import { ContentRegistry } from "../../content/ContentRegistry";
import { FARMHOUSE_INTERIOR_PROPS } from "../../world/FarmhouseInterior";
import { createWorldEnvironmentLayout } from "../../world/WorldEnvironmentLayout";
import {
  ASSET_BY_ID,
  ASSET_CATALOG,
  ASSET_IDS,
  type AssetId,
  type RuntimeAssetSpec
} from "./AssetCatalog";
import {
  FARMING_PROP_ASSET_IDS,
  STATIC_FARM_PROP_ASSETS,
  STATIC_LANDMARK_ASSETS
} from "./RuntimeAssetOwners";
import {
  CROP_STAGE_ASSETS
} from "../scene/CropInstanceRenderer";
import { FISH_SCHOOL_ASSETS } from "../scene/FishSchoolAssets";

export type AssetCoverageDisposition =
  | "static-world"
  | "dynamic-world"
  | "conditional-world"
  | "progression-world"
  | "reserve";

export interface AssetCoverageRecord {
  id: AssetId;
  disposition: AssetCoverageDisposition;
  placementSource: string;
  worldContext: string;
  freshSaveVisible: boolean;
  activationTrigger: string;
}

export interface AssetCoverageSummary {
  total: number;
  byDisposition: Record<AssetCoverageDisposition, number>;
  freshSaveVisible: number;
  records: readonly AssetCoverageRecord[];
}

function uniqueAssetIds(values: Iterable<AssetId>): AssetId[] {
  return [...new Set(values)];
}

function staticWorldAssets(worldSeed: number): Set<AssetId> {
  const layout = createWorldEnvironmentLayout(worldSeed);
  return new Set<AssetId>([
    ...layout.staticPlacements.map((placement) => placement.assetId as AssetId),
    ...layout.groundCoverPlacements.map((placement) => placement.assetId as AssetId),
    ...Object.values(STATIC_LANDMARK_ASSETS),
    ...Object.values(STATIC_FARM_PROP_ASSETS),
    ...FARMHOUSE_INTERIOR_PROPS.map((placement) => placement.assetId),
    ASSET_IDS.PROP_PRODUCE_STALL_A
  ]);
}

function environmentAssetIds(worldSeed: number): Set<AssetId> {
  const layout = createWorldEnvironmentLayout(worldSeed);
  return new Set<AssetId>([
    ...layout.staticPlacements.map((placement) => placement.assetId as AssetId),
    ...layout.groundCoverPlacements.map((placement) => placement.assetId as AssetId)
  ]);
}

function cropStageAssets(): Set<AssetId> {
  return new Set<AssetId>(Object.values(CROP_STAGE_ASSETS).flatMap((stages) => Object.values(stages)));
}

function dynamicWorldAssets(): Set<AssetId> {
  ContentRegistry.initializeAndValidate();
  return new Set<AssetId>([
    ASSET_IDS.CHAR_PLAYER_A,
    ASSET_IDS.CLOUD_LOWPOLY_A,
    ASSET_IDS.FAUNA_GULL_A,
    ASSET_IDS.FAUNA_BUTTERFLY_A,
    ...Array.from(ContentRegistry.npcs.values()).map((npc) => npc.assetId),
    ...Object.values(FISH_SCHOOL_ASSETS).filter((assetId): assetId is AssetId => Boolean(assetId)),
    ...FARMING_PROP_ASSET_IDS,
    ...Array.from(ContentRegistry.boats.values())
      .filter((boat) => boat.id === "boat.rowboat")
      .map(() => ASSET_IDS.BOAT_ROWBOAT_A)
  ]);
}

function progressionWorldAssets(): Set<AssetId> {
  return new Set<AssetId>([ASSET_IDS.BOAT_SKIFF_A]);
}

function sourceFor(
  id: AssetId,
  staticIds: Set<AssetId>,
  conditionalIds: Set<AssetId>,
  progressionIds: Set<AssetId>,
  environmentIds: Set<AssetId>
): Pick<AssetCoverageRecord, "placementSource" | "worldContext" | "freshSaveVisible" | "activationTrigger"> {
  if (progressionIds.has(id)) {
    return {
      placementSource: "NavigationDomain.purchaseSkiff + HARBOR_SKIFF_MOORING",
      worldContext: "Harbor skiff mooring",
      freshSaveVisible: false,
      activationTrigger: "Fishing XP 15,000 and 850 G, then purchase at the skiff mooring"
    };
  }
  if (conditionalIds.has(id)) {
    return {
      placementSource: "CropInstanceRenderer stage maps",
      worldContext: "Starter farm planted crop rows",
      freshSaveVisible: false,
      activationTrigger: "Plant the owning crop and advance its lifecycle to the stage"
    };
  }
  if (staticIds.has(id)) {
    if (environmentIds.has(id)) {
      return {
        placementSource: "WorldEnvironmentLayout static/ground-cover placements",
        worldContext: "Authored landmarks, routes, farm, village, harbor, and coast fill",
        freshSaveVisible: true,
        activationTrigger: "Loaded with the world seed"
      };
    }
    if (FARMHOUSE_INTERIOR_PROPS.some((placement) => placement.assetId === id)) {
      return {
        placementSource: "FarmhouseInterior.FARMHOUSE_INTERIOR_PROPS",
        worldContext: "Farmhouse interior",
        freshSaveVisible: true,
        activationTrigger: "Enter the farmhouse"
      };
    }
    if (id === ASSET_IDS.PROP_SMOKE_PLUME_A) {
      return {
        placementSource: "WorldScene farmhouse chimney attachment",
        worldContext: "Farmhouse chimney",
        freshSaveVisible: true,
        activationTrigger: "Loaded with the farmhouse"
      };
    }
    return {
      placementSource: "WorldScene static landmark/farm prop owner",
      worldContext: "Farmstead, village, bridge, harbor, or lighthouse landmark",
      freshSaveVisible: true,
      activationTrigger: "Loaded with the world scene"
    };
  }
  if (id === ASSET_IDS.FISH_TROUT_A || id === ASSET_IDS.FISH_TUNA_A) {
    return {
      placementSource: "FishSchoolAssets + FishingDomain active school",
      worldContext: "Lake trout or coastal tuna school",
      freshSaveVisible: false,
      activationTrigger: "Reach the matching habitat and spawn or discover an active sport-fishing school"
    };
  }
  if (FARMING_PROP_ASSET_IDS.includes(id as (typeof FARMING_PROP_ASSET_IDS)[number])) {
    return {
      placementSource: "WorldScene FARMING_PROP_ATTACHMENTS",
      worldContext: "Player action presentation socket",
      freshSaveVisible: false,
      activationTrigger: "Start the matching planting, watering, harvesting, processing, or fishing action"
    };
  }
  return {
    placementSource: "WorldScene dynamic presentation owner",
    worldContext: id === ASSET_IDS.CHAR_PLAYER_A ? "Player avatar" : "Fishing, NPC, cloud, or action presentation",
    freshSaveVisible: true,
    activationTrigger: "Loaded or triggered by the matching gameplay state"
  };
}

export function getAssetCoverage(worldSeed: number = 42891): readonly AssetCoverageRecord[] {
  ContentRegistry.initializeAndValidate();
  const staticIds = staticWorldAssets(worldSeed);
  const environmentIds = environmentAssetIds(worldSeed);
  const conditionalIds = cropStageAssets();
  const progressionIds = progressionWorldAssets();
  const dynamicIds = dynamicWorldAssets();
  const dispositionById = new Map<AssetId, AssetCoverageDisposition>();

  for (const id of staticIds) dispositionById.set(id, "static-world");
  for (const id of dynamicIds) if (!dispositionById.has(id)) dispositionById.set(id, "dynamic-world");
  // A catalog asset can have more than one runtime owner. Keep a static world
  // placement authoritative when the same model is also used by a crop stage.
  for (const id of conditionalIds) if (!dispositionById.has(id)) dispositionById.set(id, "conditional-world");
  for (const id of progressionIds) dispositionById.set(id, "progression-world");

  return ASSET_CATALOG.map((asset: RuntimeAssetSpec) => {
    const disposition = dispositionById.get(asset.id) ?? "reserve";
    return {
      id: asset.id,
      disposition,
      ...sourceFor(asset.id, staticIds, conditionalIds, progressionIds, environmentIds)
    };
  });
}

export function getAssetCoverageSummary(worldSeed: number = 42891): AssetCoverageSummary {
  const records = getAssetCoverage(worldSeed);
  const byDisposition: Record<AssetCoverageDisposition, number> = {
    "static-world": 0,
    "dynamic-world": 0,
    "conditional-world": 0,
    "progression-world": 0,
    "reserve": 0
  };
  for (const record of records) byDisposition[record.disposition] += 1;
  return {
    total: records.length,
    byDisposition,
    freshSaveVisible: records.filter((record) => record.freshSaveVisible).length,
    records
  };
}

export function assertAssetCoverageParity(worldSeed: number = 42891): void {
  const records = getAssetCoverage(worldSeed);
  const catalogIds = new Set(ASSET_CATALOG.map((asset) => asset.id));
  const recordIds = records.map((record) => record.id);
  if (new Set(recordIds).size !== recordIds.length) throw new Error("[AssetCoverage] Duplicate asset coverage record");
  if (recordIds.length !== catalogIds.size || recordIds.some((id) => !catalogIds.has(id))) {
    throw new Error("[AssetCoverage] Coverage does not match the runtime catalog");
  }
  for (const record of records) {
    if (!ASSET_BY_ID.has(record.id)) throw new Error(`[AssetCoverage] Unknown asset ${record.id}`);
  }
}

export const ASSET_COVERAGE_DISPOSITIONS: readonly AssetCoverageDisposition[] = [
  "static-world",
  "dynamic-world",
  "conditional-world",
  "progression-world",
  "reserve"
] as const;

export const assetCoverageOwnerIds = (): readonly AssetId[] =>
  uniqueAssetIds(getAssetCoverage().map((record) => record.id));
