import { describe, expect, it } from "vitest";
import predecessor from "../fixtures/save_v69_layout37_road_network_predecessor.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { MAIN_QUEST_TRACK_ID } from "../../src/simulation/core/QuestTypes";
import type { GameState } from "../../src/simulation/core/types";

describe("schema 73 quest-credit track migration", () => {
  it("binds an unowned retained-save credit to the main track without changing its meaning", () => {
    const legacy = structuredClone(predecessor) as unknown as SaveEnvelope;
    const legacyState = legacy.state as GameState;
    (legacyState.quests as unknown as { earlyActionCredits: unknown[] }).earlyActionCredits = [{
      type: "craft-recipe",
      targetId: "recipe.compost_worms",
      location: { kind: "station", id: "struct.starter_compost" },
      quantity: 1
    }];
    const original = structuredClone(legacy);
    expect(validateSaveEnvelope(legacy)).toBe(true);

    const migrated = migrateSaveData(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.quests.earlyActionCredits).toEqual([{
      trackId: MAIN_QUEST_TRACK_ID,
      type: "craft-recipe",
      targetId: "recipe.compost_worms",
      location: { kind: "station", id: "struct.starter_compost" },
      quantity: 1
    }]);
    expect(migrated.state.quests.tracks).toEqual(original.state.quests.tracks);
    expect(migrated.state.quests.completedQuestIds).toEqual(original.state.quests.completedQuestIds);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(legacy).toEqual(original);

    const reloaded = migrateSaveData(structuredClone(migrated));
    expect(reloaded.state.quests.earlyActionCredits).toEqual(migrated.state.quests.earlyActionCredits);
    expect(validateSaveEnvelope(reloaded)).toBe(true);
  });
});
