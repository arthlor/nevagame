import runtimeAssets from "virtual:neva-runtime-asset-catalog";
import {
  ASSET_FAMILIES,
  ASSET_IDS,
  ASSET_IDS_BY_FAMILY,
  type AssetFamily,
  type AssetId
} from "./AssetCatalog.generated";

export { ASSET_FAMILIES, ASSET_IDS, ASSET_IDS_BY_FAMILY };
export type { AssetFamily, AssetId };

export interface RuntimeLodLevel {
  node: string;
  distanceMeters: number;
  triangleRatioMin: number;
  triangleRatioMax: number;
}

export interface RuntimeCollisionPrimitive {
  id: string;
  center: readonly [number, number, number];
  halfExtents: readonly [number, number, number];
  yawDegrees?: number;
}

export interface RuntimeAnimationClipSpec {
  name: string;
  durationSeconds: number;
  commitMarkerSeconds?: number;
  loop: boolean;
  referenceSpeedMetersPerSecond?: number;
  optional?: boolean;
  fallbackClip?: string;
  events?: readonly RuntimeAnimationEventSpec[];
}

export interface RuntimeAnimationEventSpec {
  name: string;
  timeSeconds: number;
}

export interface RuntimeAssetSpec {
  id: AssetId;
  file: string;
  contentHash: string;
  family: AssetFamily;
  collision: "none" | "box" | "compound";
  instancing: boolean;
  lod: "none" | "small" | "medium" | "hero";
  rootNode: string;
  requiredNodes: string[];
  readDistanceMeters: number;
  lodLevels: readonly RuntimeLodLevel[] | null;
  collisionPrimitives: readonly RuntimeCollisionPrimitive[] | null;
  rigNode: string | null;
  socketNodes: readonly string[] | null;
  animationClips: readonly RuntimeAnimationClipSpec[] | null;
  additionalAnimationClips: readonly RuntimeAnimationClipSpec[] | null;
}

const knownIds = new Set<string>(Object.values(ASSET_IDS));
const sourceAssets = runtimeAssets as unknown as RuntimeAssetSpec[];

if (sourceAssets.length !== knownIds.size || sourceAssets.some((asset) => !knownIds.has(asset.id))) {
  throw new Error("Generated AssetId types are out of sync with assets/specs/asset-catalog.json");
}

export const ASSET_CATALOG: readonly RuntimeAssetSpec[] = sourceAssets;
export const ASSET_BY_ID: ReadonlyMap<AssetId, RuntimeAssetSpec> = new Map(
  ASSET_CATALOG.map((asset) => [asset.id, asset])
);

const BOAT_ASSET_BY_TYPE: Readonly<Record<string, AssetId>> = {
  "boat.rowboat": ASSET_IDS.BOAT_ROWBOAT_A,
  "boat.skiff": ASSET_IDS.BOAT_SKIFF_A
};

export function boatAssetId(boatTypeId: string): AssetId {
  const assetId = BOAT_ASSET_BY_TYPE[boatTypeId];
  if (!assetId) throw new Error(`No runtime asset is registered for boat type: ${boatTypeId}`);
  return assetId;
}

export function assetUrl(assetId: AssetId): string {
  const asset = ASSET_BY_ID.get(assetId);
  if (!asset) throw new Error(`Unknown Neva asset ID: ${assetId}`);
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const stage = new URLSearchParams(window.location.search).get("artStage");
    if (stage && /^run-[A-Za-z0-9_-]+$/.test(stage)) {
      return `/__neva_art_stage/${stage}/${asset.file}`;
    }
  }
  return `/assets/models/${asset.file}?v=${asset.contentHash.slice(0, 16)}`;
}
