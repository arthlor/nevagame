import { ASSET_IDS, type AssetId } from "../assets/AssetCatalog";

/** Runtime presentation bindings for species that can appear in a sport-fishing school. */
export const FISH_SCHOOL_ASSETS: Readonly<Partial<Record<string, AssetId>>> = {
  "fish.trout": ASSET_IDS.FISH_TROUT_A,
  "fish.tuna": ASSET_IDS.FISH_TUNA_A
};

export function fishSchoolAsset(school: { speciesWeights: Array<{ speciesId: string }> }): AssetId | null {
  for (const entry of school.speciesWeights) {
    const assetId = FISH_SCHOOL_ASSETS[entry.speciesId];
    if (assetId) return assetId;
  }
  return null;
}
