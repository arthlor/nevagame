import catalogJson from "../../../assets/specs/asset-catalog.json";

export const ASSET_IDS = {
  TREE_OAK_A: "tree_oak_a",
  TREE_OAK_B: "tree_oak_b",
  TREE_PINE_A: "tree_pine_a",
  TREE_APPLE_A: "tree_apple_a",
  FOLIAGE_BUSH_A: "foliage_bush_a",
  FOLIAGE_REEDS_A: "foliage_reeds_a",
  ROCK_BOULDER_A: "rock_boulder_a",
  ROCK_COASTAL_A: "rock_coastal_a",
  ROCK_FIELD_A: "rock_field_a",
  HOUSE_FARMHOUSE_A: "house_farmhouse_a",
  BUILDING_LIGHTHOUSE_A: "building_lighthouse_a",
  BUILDING_WINDMILL_A: "building_windmill_a",
  BRIDGE_STONE_A: "bridge_stone_a",
  DOCK_STRAIGHT_A: "dock_straight_a",
  BUILDING_FISH_MARKET_A: "building_fish_market_a",
  PROP_WATER_WELL_A: "prop_water_well_a",
  PROP_PUMPKIN_PATCH_A: "prop_pumpkin_patch_a",
  PROP_LOBSTER_TRAP_A: "prop_lobster_trap_a",
  PROP_CRATE_WOOD_A: "prop_crate_wood_a",
  PROP_BARREL_WOOD_A: "prop_barrel_wood_a",
  PROP_FENCE_WOOD_A: "prop_fence_wood_a",
  PROP_HAY_BALE_A: "prop_hay_bale_a",
  PROP_LAMP_POST_A: "prop_lamp_post_a",
  BOAT_ROWBOAT_A: "boat_rowboat_a",
  BOAT_SKIFF_A: "boat_skiff_a",
  CROP_WHEAT_SEEDED: "crop_wheat_seeded",
  CROP_WHEAT_SPROUT: "crop_wheat_sprout",
  CROP_WHEAT_GROWING: "crop_wheat_growing",
  CROP_WHEAT_MATURE: "crop_wheat_mature",
  CROP_WHEAT_OVERRIPE: "crop_wheat_overripe",
  CROP_WHEAT_WITHERED: "crop_wheat_withered",
  FISH_TROUT_A: "fish_trout_a",
  FISH_TUNA_A: "fish_tuna_a",
  CLOUD_LOWPOLY_A: "cloud_lowpoly_a",
  CHAR_PLAYER_A: "char_player_a"
} as const;

export type AssetId = (typeof ASSET_IDS)[keyof typeof ASSET_IDS];
export type AssetFamily =
  | "vegetation"
  | "rock"
  | "architecture"
  | "prop"
  | "boat"
  | "crop"
  | "fish"
  | "cloud"
  | "character";

export interface RuntimeAssetSpec {
  id: AssetId;
  file: string;
  family: AssetFamily;
  instancing: boolean;
  lod: "none" | "small" | "medium" | "hero";
  rootNode: string;
  requiredNodes: string[];
  readDistanceMeters: number;
}

const knownIds = new Set<string>(Object.values(ASSET_IDS));
const sourceAssets = catalogJson.assets as unknown as RuntimeAssetSpec[];

if (sourceAssets.length !== knownIds.size || sourceAssets.some((asset) => !knownIds.has(asset.id))) {
  throw new Error("Generated AssetId types are out of sync with assets/specs/asset-catalog.json");
}

export const ASSET_CATALOG: readonly RuntimeAssetSpec[] = sourceAssets;
export const ASSET_BY_ID: ReadonlyMap<AssetId, RuntimeAssetSpec> = new Map(
  ASSET_CATALOG.map((asset) => [asset.id, asset])
);

export function assetUrl(assetId: AssetId): string {
  const asset = ASSET_BY_ID.get(assetId);
  if (!asset) throw new Error(`Unknown Neva asset ID: ${assetId}`);
  return `/assets/models/${asset.file}`;
}
