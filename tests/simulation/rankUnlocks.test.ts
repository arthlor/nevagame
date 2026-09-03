import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import {
  LIVE_FEATURE_IDS,
  PROFICIENCY_RANKS,
  getRankForXp,
  hasRankUnlock,
  rankIndexForRequirement,
  unlocksThroughRank
} from "../../src/content/progression";

const SRC_ROOT = path.join(__dirname, "..", "..", "src");
const PROGRESSION_FILE = path.join(SRC_ROOT, "content", "progression.ts");

/** Every TypeScript source file except the progression table's own declaration. */
function sourceFiles(): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (/\.tsx?$/.test(entry.name) && filename !== PROGRESSION_FILE) files.push(filename);
    }
  };
  visit(SRC_ROOT);
  return files;
}

/**
 * Guards the "ladder promises what the code does not deliver" defect class.
 *
 * The rank tables once listed 25 `feature.*` ids, of which 23 had no consumer
 * anywhere and the remaining two were granted by quests rather than by XP.
 * Ranks 5-7 therefore advertised capabilities that could never arrive. These
 * two assertions close the loop from both ends: the registry refuses a rank
 * that advertises a feature outside `LIVE_FEATURE_IDS` (checked at startup),
 * and this file refuses a `LIVE_FEATURE_IDS` entry that nothing reads.
 */
describe("rank unlocks", () => {
  const sources = sourceFiles().map((file) => fs.readFileSync(file, "utf8"));

  it("gives every declared live feature at least one consumer in src/", () => {
    for (const featureId of LIVE_FEATURE_IDS) {
      const consumers = sources.filter((contents) => contents.includes(`"${featureId}"`)).length;
      expect(consumers, `${featureId} is declared live but nothing reads it`).toBeGreaterThan(0);
    }
  });

  it("advertises no feature the simulation cannot honour", () => {
    // The mirror of the startup assertion, stated here so the intent is
    // readable next to the consumer check above.
    for (const rank of PROFICIENCY_RANKS) {
      const advertised = [
        ...rank.farmingUnlocks,
        ...rank.fishingUnlocks,
        ...rank.tradingUnlocks,
        ...rank.processingUnlocks
      ].filter((id) => id.startsWith("feature."));
      for (const id of advertised) {
        expect(LIVE_FEATURE_IDS.has(id), `rank '${rank.rankName}' advertises unimplemented '${id}'`).toBe(true);
      }
    }
  });

  it("puts every crop and recipe in the band its own gate implies", () => {
    ContentRegistry.initializeAndValidate();
    for (const crop of ContentRegistry.crops.values()) {
      const band = rankIndexForRequirement(crop.minimumFarmingXp);
      expect(
        PROFICIENCY_RANKS[band].farmingUnlocks,
        `${crop.id} gates at ${crop.minimumFarmingXp} Farming XP`
      ).toContain(crop.id);
    }
    for (const recipe of ContentRegistry.recipes.values()) {
      const band = rankIndexForRequirement(recipe.minimumSkill?.xp ?? 0);
      expect(
        PROFICIENCY_RANKS[band].processingUnlocks,
        `${recipe.id} gates at ${recipe.minimumSkill?.xp ?? 0} XP`
      ).toContain(recipe.id);
    }
  });

  it("resolves a rank unlock exactly at its threshold and not before", () => {
    const apprentice = PROFICIENCY_RANKS[1];
    expect(apprentice.farmingUnlocks).toContain("crop.corn");
    expect(hasRankUnlock(apprentice.xpRequired - 1, "farmingUnlocks", "crop.corn")).toBe(false);
    expect(hasRankUnlock(apprentice.xpRequired, "farmingUnlocks", "crop.corn")).toBe(true);

    // Accumulates downward: a Master still has everything a Novice had.
    const master = PROFICIENCY_RANKS[4];
    expect(unlocksThroughRank(master.xpRequired, "farmingUnlocks")).toContain("crop.wheat");
    expect(getRankForXp(master.xpRequired).rankIndex).toBe(4);
  });

  it("keeps the rod ladder's XP requirements owned by the rank table", () => {
    // `rodFishingXpRequirement` reads a rod's rank back out of `fishingUnlocks`,
    // so these rows are the live gate, not an advertisement of one.
    const rodRanks = PROFICIENCY_RANKS.flatMap((rank) =>
      rank.fishingUnlocks.filter((id) => id.startsWith("rod.")).map((id) => [id, rank.xpRequired] as const)
    );
    expect(Object.fromEntries(rodRanks)).toEqual({
      "rod.willow": 0,
      "rod.river": 1000,
      "rod.heavy_sport": 3000,
      "rod.offshore": 15000,
      "rod.master": 60000
    });
  });
});
