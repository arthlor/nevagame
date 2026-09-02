import { ASSET_IDS, type AssetId } from "../assets/AssetCatalog";

/** Runtime presentation bindings for every species that can appear in a sport-fishing school. */
export const FISH_SCHOOL_ASSETS: Readonly<Record<string, AssetId>> = {
  "fish.trout": ASSET_IDS.FISH_TROUT_A,
  "fish.catfish": ASSET_IDS.FISH_CATFISH_A,
  "fish.pike": ASSET_IDS.FISH_PIKE_A,
  "fish.arowana": ASSET_IDS.FISH_AROWANA_A,
  "fish.tuna": ASSET_IDS.FISH_TUNA_A,
  "fish.sturgeon": ASSET_IDS.FISH_STURGEON_A,
  "fish.sailfish": ASSET_IDS.FISH_SAILFISH_A,
  "fish.swordfish": ASSET_IDS.FISH_SWORDFISH_A,
  "fish.blue_marlin": ASSET_IDS.FISH_BLUE_MARLIN_A,
  "fish.sardine": ASSET_IDS.FISH_SARDINE_A,
  "fish.sea_bream": ASSET_IDS.FISH_SEA_BREAM_A,
  "fish.amberjack": ASSET_IDS.FISH_AMBERJACK_A
};

export function fishSchoolAsset(school: { speciesWeights: Array<{ speciesId: string }> }): AssetId | null {
  for (const entry of school.speciesWeights) {
    const assetId = FISH_SCHOOL_ASSETS[entry.speciesId];
    if (assetId) return assetId;
  }
  return null;
}

/** Stable weighted members so a mixed school presents the same composition after reload. */
export function fishSchoolMemberAssets(
  school: { speciesWeights: Array<{ speciesId: string; weight: number }> },
  count: number
): AssetId[] {
  const entries = school.speciesWeights.flatMap((entry) => {
    const assetId = FISH_SCHOOL_ASSETS[entry.speciesId];
    return assetId && Number.isFinite(entry.weight) && entry.weight > 0
      ? [{ assetId, weight: entry.weight }]
      : [];
  });
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (entries.length === 0 || total <= 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const target = ((index + 0.5) / count) * total;
    let accumulated = 0;
    for (const entry of entries) {
      accumulated += entry.weight;
      if (target <= accumulated) return entry.assetId;
    }
    return entries[entries.length - 1].assetId;
  });
}

export function fishSpeciesAsset(speciesId: string): AssetId | null {
  return FISH_SCHOOL_ASSETS[speciesId] ?? null;
}
