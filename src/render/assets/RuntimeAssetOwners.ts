import { ASSET_IDS, type AssetId } from "./AssetCatalog";

/**
 * Runtime owners for assets that are loaded outside the data-driven environment
 * layout. Keeping these bindings beside the catalog lets the coverage audit
 * consume the same owner used by the scene instead of maintaining a filename
 * list in tests.
 */
export const STATIC_LANDMARK_ASSETS = {
  farmhouse: ASSET_IDS.HOUSE_FARMHOUSE_A,
  farmhouseSmoke: ASSET_IDS.PROP_SMOKE_PLUME_A,
  well: ASSET_IDS.PROP_WATER_WELL_A,
  bridge: ASSET_IDS.BRIDGE_STONE_A,
  dock: ASSET_IDS.DOCK_STRAIGHT_A,
  fishMarket: ASSET_IDS.BUILDING_FISH_MARKET_A,
  lighthouse: ASSET_IDS.BUILDING_LIGHTHOUSE_A,
  windmill: ASSET_IDS.BUILDING_WINDMILL_A,
  workbench: ASSET_IDS.PROP_FARM_WORKBENCH_A,
  compost: ASSET_IDS.PROP_WORM_COMPOST_A,
  fishTable: ASSET_IDS.PROP_FARM_WORKBENCH_A,
  produceStall: ASSET_IDS.PROP_PRODUCE_STALL_A,
  interiorShell: ASSET_IDS.INTERIOR_FARMHOUSE_SHELL,
  fence: ASSET_IDS.PROP_FENCE_WOOD_A
} as const satisfies Readonly<Record<string, AssetId>>;

export const STATIC_FARM_PROP_ASSETS = {
  "hay-bale": ASSET_IDS.PROP_HAY_BALE_A,
  "produce-crate": ASSET_IDS.PROP_PRODUCE_CRATE_A,
  "harvest-basket": ASSET_IDS.PROP_HARVEST_BASKET_A,
  "lamp-post": ASSET_IDS.PROP_LAMP_POST_A
} as const satisfies Readonly<Record<string, AssetId>>;

export const FARMING_PROP_ASSET_IDS = [
  ASSET_IDS.TOOL_SEED_POUCH_A,
  ASSET_IDS.TOOL_WATERING_CAN_A,
  ASSET_IDS.TOOL_SICKLE_A,
  ASSET_IDS.PROP_CROP_BUNDLE_A,
  ASSET_IDS.PROP_HARVEST_BASKET_A,
  ASSET_IDS.TOOL_WORKSTATION_SCOOP_A,
  ASSET_IDS.TOOL_FISHING_ROD_A
] as const;
