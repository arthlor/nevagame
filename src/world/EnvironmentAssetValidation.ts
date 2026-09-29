import { ASSET_BY_ID, ASSET_IDS, type AssetId, type RuntimeAssetSpec } from "../render/assets/AssetCatalog";
import type { EnvironmentAssetPlacement } from "./WorldEnvironmentLayout";

const SEEDED_FILL_COLLIDING_FAMILIES: ReadonlySet<string> = new Set(["vegetation", "rock"]);

// These existing deadwood, rest and farm-work placements already reserve route/working clearance.
// Keep the exception explicit: a colliding prop family must not admit arbitrary buildings or cargo.
const SEEDED_FILL_SOLID_PROPS: ReadonlySet<AssetId> = new Set([
  ASSET_IDS.PROP_FALLEN_LOG_A,
  ASSET_IDS.PROP_BENCH_WOOD_A,
  ASSET_IDS.PROP_PICNIC_TABLE_A,
  ASSET_IDS.PROP_WATER_TROUGH_A,
  ASSET_IDS.PROP_BEEHIVE_A,
  ASSET_IDS.PROP_POTTING_BENCH_A
]);

/** Shared by world startup and layout checks, including placements restored from a build bake. */
export function validateEnvironmentPlacementAsset(
  placement: Pick<EnvironmentAssetPlacement, "id" | "assetId" | "origin">
): RuntimeAssetSpec {
  const spec = ASSET_BY_ID.get(placement.assetId as AssetId);
  if (!spec) {
    throw new Error(`[WorldScene] Unknown environment asset ${placement.assetId} for placement ${placement.id}`);
  }
  if (placement.origin === "seeded-fill" && spec.collision !== "none"
    && !SEEDED_FILL_COLLIDING_FAMILIES.has(spec.family) && !SEEDED_FILL_SOLID_PROPS.has(spec.id)) {
    throw new Error(`[WorldScene] Seeded-fill placement ${placement.id} cannot use colliding asset ${placement.assetId}`);
  }
  return spec;
}
