import { ASSET_IDS, type AssetId } from "../assets/AssetCatalog";

/** Runtime presentation bindings for every species that can appear in a sport-fishing school.
 *  Only trout and tuna have authored GLBs. Other freshwater species reuse trout and
 *  other saltwater species reuse tuna as silhouette stand-ins, not distinct models.
 */
export const FISH_SCHOOL_ASSETS: Readonly<Record<string, AssetId>> = {
  "fish.trout": ASSET_IDS.FISH_TROUT_A,
  "fish.catfish": ASSET_IDS.FISH_TROUT_A,
  "fish.pike": ASSET_IDS.FISH_TROUT_A,
  "fish.arowana": ASSET_IDS.FISH_TROUT_A,
  "fish.tuna": ASSET_IDS.FISH_TUNA_A,
  "fish.sturgeon": ASSET_IDS.FISH_TUNA_A,
  "fish.sailfish": ASSET_IDS.FISH_TUNA_A,
  "fish.swordfish": ASSET_IDS.FISH_TUNA_A,
  "fish.blue_marlin": ASSET_IDS.FISH_TUNA_A
};

export function fishSchoolAsset(school: { speciesWeights: Array<{ speciesId: string }> }): AssetId | null {
  for (const entry of school.speciesWeights) {
    const assetId = FISH_SCHOOL_ASSETS[entry.speciesId];
    if (assetId) return assetId;
  }
  return null;
}

export function fishSpeciesAsset(speciesId: string): AssetId | null {
  return FISH_SCHOOL_ASSETS[speciesId] ?? null;
}
