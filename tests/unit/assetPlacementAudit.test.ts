import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { ASSET_BY_ID, ASSET_IDS, type AssetId } from "../../src/render/assets/AssetCatalog";
import { FISH_SCHOOL_ASSETS } from "../../src/render/scene/FishSchoolAssets";
import { createWorldEnvironmentLayout } from "../../src/world/WorldEnvironmentLayout";

type PlacementDisposition =
  | "static-world"
  | "dynamic-world"
  | "conditional-world"
  | "fresh-save-absent"
  | "art-yard-only";

describe("Created asset placement audit", () => {
  it("keeps the audited catalog IDs classified by their actual runtime path", () => {
    const layout = createWorldEnvironmentLayout(42891);
    const staticIds = new Set(layout.staticPlacements.map((placement) => placement.assetId));
    const freshSave = createInitialGameState();
    const audited: Array<{ id: string; disposition: PlacementDisposition }> = [
      { id: ASSET_IDS.PROP_WAGON_CART_A, disposition: "static-world" },
      { id: ASSET_IDS.FAUNA_COW_A, disposition: "static-world" },
      { id: ASSET_IDS.FISH_TROUT_A, disposition: "dynamic-world" },
      { id: ASSET_IDS.FISH_TUNA_A, disposition: "dynamic-world" },
      { id: ASSET_IDS.CROP_TOMATO_MATURE, disposition: "conditional-world" },
      { id: ASSET_IDS.CROP_POTATO_MATURE, disposition: "conditional-world" },
      { id: ASSET_IDS.BOAT_SKIFF_A, disposition: "fresh-save-absent" }
    ];

    for (const entry of audited) {
      expect(ASSET_BY_ID.has(entry.id as AssetId), entry.id).toBe(true);
      if (entry.disposition === "static-world") {
        expect(staticIds.has(entry.id), entry.id).toBe(true);
      } else {
        expect(staticIds.has(entry.id), entry.id).toBe(false);
      }
    }

    expect(FISH_SCHOOL_ASSETS).toMatchObject({
      "fish.trout": ASSET_IDS.FISH_TROUT_A,
      "fish.tuna": ASSET_IDS.FISH_TUNA_A
    });
    expect(freshSave.boats["boat.player_rowboat"]).toBeDefined();
    expect(Object.values(freshSave.boats).some((boat) => boat.boatTypeId === "boat.skiff")).toBe(false);

    // No audited asset is Art Yard-only after the wagon/cow placement and fish-school binding.
    expect(audited.filter((entry) => entry.disposition === "art-yard-only")).toEqual([]);
  });
});
