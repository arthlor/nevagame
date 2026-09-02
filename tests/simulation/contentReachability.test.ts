import { describe, it, expect } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { VILLAGE_SEED_CROP_IDS, isVillageSeedCrop } from "../../src/content/markets";
import { MarketDomain } from "../../src/simulation/domains/MarketDomain";
import { BasicFishingMinigame } from "../../src/simulation/fishing/BasicFishingMinigame";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { SEASONS } from "../../src/simulation/core/GameClock";
import { isSpeciesInSeason } from "../../src/simulation/fishing/seasonalAvailability";
import { SCHOOL_SPAWN_POINTS } from "../../src/simulation/domains/FishingDomain";

/**
 * Guards the "authored but unreachable" defect class.
 *
 * `seed.corn` and `seed.apple_sapling` shipped with no source anywhere — not
 * stocked, not a quest reward, not treasure — so `crop.corn` and the game's
 * only orchard crop could never be planted. Nothing failed, because nothing
 * checked. This is that check.
 */

/** Every way an item can enter a player's hands. */
function itemSources(): Map<string, string[]> {
  const sources = new Map<string, string[]>();
  const add = (itemId: string, source: string) => {
    const list = sources.get(itemId) ?? [];
    list.push(source);
    sources.set(itemId, list);
  };

  for (const cropId of VILLAGE_SEED_CROP_IDS) {
    const crop = ContentRegistry.crops.get(cropId);
    if (crop) add(crop.seedItemId, "village seed stall");
  }
  for (const itemId of MarketDomain.VILLAGE_SUPPLIES) add(itemId, "village supplies");
  for (const itemId of MarketDomain.HARBOR_BUYABLE) add(itemId, "harbor supplies");
  for (const itemId of BasicFishingMinigame.COMMON_TREASURE_LOOT) add(itemId, "common treasure");
  for (const itemId of BasicFishingMinigame.RARE_TREASURE_LOOT) add(itemId, "rare treasure");

  for (const recipe of ContentRegistry.recipes.values()) {
    for (const output of recipe.outputs) add(output.itemId, `recipe ${recipe.id}`);
  }
  for (const quest of ContentRegistry.quests.values()) {
    for (const reward of quest.rewards.items ?? []) add(reward.itemId, `quest ${quest.id}`);
  }
  for (const crop of ContentRegistry.crops.values()) {
    add(crop.harvestItemId, `harvest ${crop.id}`);
  }
  // Basic-catchable species enter the inventory as stackable items when caught.
  // Sport fish do not — they are physical cargo, never an ItemId.
  for (const fish of ContentRegistry.fishSpecies.values()) {
    if (!fish.isSportFish && ContentRegistry.items.has(fish.id)) {
      add(fish.id, `basic fishing ${fish.id}`);
    }
  }

  const initial = createInitialGameState();
  for (const inventory of Object.values(initial.inventories)) {
    for (const slot of inventory.slots) {
      if (slot?.itemId) add(slot.itemId, "starting inventory");
    }
  }

  return sources;
}

describe("content reachability", () => {
  const sources = itemSources();

  it("gives every crop's seed at least one source", () => {
    for (const crop of ContentRegistry.crops.values()) {
      const found = sources.get(crop.seedItemId) ?? [];
      expect(
        found.length,
        `${crop.id} needs '${crop.seedItemId}', which has no source — the crop is unplantable`
      ).toBeGreaterThan(0);
    }
  });

  it("stocks every crop in the seed stall so the XP gate is the only pacing", () => {
    for (const crop of ContentRegistry.crops.values()) {
      expect(isVillageSeedCrop(crop.id), `${crop.id} is not stocked anywhere`).toBe(true);
    }
  });

  it("paces seed access by minimumFarmingXp rather than by absence", () => {
    const gates = [...ContentRegistry.crops.values()].map((crop) => crop.minimumFarmingXp);
    // At least one free starter crop, and a real spread above it.
    expect(Math.min(...gates)).toBe(0);
    expect(new Set(gates).size).toBeGreaterThan(3);
  });

  it("makes every recipe input obtainable", () => {
    for (const recipe of ContentRegistry.recipes.values()) {
      for (const input of recipe.inputs) {
        const found = sources.get(input.itemId) ?? [];
        expect(
          found.length,
          `recipe ${recipe.id} needs '${input.itemId}', which has no source`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("makes every contract template completable in at least one season", () => {
    for (const template of ContentRegistry.contractTemplates.values()) {
      for (const targetId of template.itemOrSpeciesPool) {
        if (template.type === "produce") {
          const crop = [...ContentRegistry.crops.values()].find(
            (candidate) => candidate.harvestItemId === targetId
          );
          expect(crop, `contract ${template.id} targets unknown produce '${targetId}'`).toBeDefined();
          expect(
            isVillageSeedCrop(crop!.id),
            `contract ${template.id} targets '${targetId}', whose crop is not obtainable`
          ).toBe(true);
          continue;
        }

        const fish = ContentRegistry.fishSpecies.get(targetId);
        expect(fish, `contract ${template.id} targets unknown species '${targetId}'`).toBeDefined();

        const seasons = SEASONS.filter((season) => isSpeciesInSeason(fish!, season));
        expect(
          seasons.length,
          `contract ${template.id} targets '${targetId}', which is out of season year-round`
        ).toBeGreaterThan(0);

        const hasHabitat = SCHOOL_SPAWN_POINTS.some((point) =>
          fish!.habitats.includes(point.habitatId)
        );
        expect(
          hasHabitat,
          `contract ${template.id} targets '${targetId}', which has no reachable habitat`
        ).toBe(true);
      }
    }
  });
});
