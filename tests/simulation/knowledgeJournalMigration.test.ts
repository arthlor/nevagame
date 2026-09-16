import { describe, expect, it } from "vitest";
import fixture from "../fixtures/save_v41_layout19.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";

const legacy = () => structuredClone(fixture) as unknown as SaveEnvelope;

describe("Knowledge journal cleanup (v44)", () => {
  it("drops capability ids an old build wrote into the knowledge journal", () => {
    // A pre-v9 build pushed `quest.rewards.unlocksFeature` into both the feature
    // list and the knowledge journal, so a veteran save can carry capability
    // ids where the journal expects knowledge ids.
    const before = legacy();
    before.state.journal.unlockedKnowledge = [
      "knowledge.land_sea_cycle",
      "boat.player_rowboat",
      "feature.expedition_planner"
    ];
    before.state.quests.unlockedFeatureIds = ["boat.player_rowboat", "feature.expedition_planner"];
    const untouched = structuredClone(before);

    const after = migrateSaveData(before);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.journal.unlockedKnowledge).toEqual(["knowledge.land_sea_cycle"]);
    // The capability list already owned both unlocks; nothing is lost.
    expect(after.state.quests.unlockedFeatureIds).toEqual([
      "boat.player_rowboat",
      "feature.expedition_planner"
    ]);
    expect(validateSaveEnvelope(after)).toBe(true);
    // Migrations must not mutate the caller's envelope.
    expect(before).toEqual(untouched);
  });

  it("is idempotent on an already-migrated save", () => {
    const once = migrateSaveData(legacy());
    const twice = migrateSaveData(structuredClone(once));
    expect(twice.state.journal.unlockedKnowledge).toEqual(once.state.journal.unlockedKnowledge);
    expect(validateSaveEnvelope(twice)).toBe(true);
  });
});
