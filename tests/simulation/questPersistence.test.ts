// tests/simulation/questPersistence.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";

describe("Quest State Persistence & Schema 10 Migration", () => {
  it("validates valid GameState with quests on CURRENT_SCHEMA_VERSION", () => {
    const state = createInitialGameState();
    expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(state.quests).toBeDefined();
    expect(state.quests.activeActId).toBe("act1_homestead");

    const envelope: SaveEnvelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: Date.now(),
      state,
      checksum: "dummy_checksum"
    };

    expect(validateSaveEnvelope(envelope)).toBe(true);
  });

  it("migrates schema version 7 save data by backfilling quests state", () => {
    const state = createInitialGameState();
    // Simulate v7 save by deleting quests and setting schemaVersion to 7
    const v7State: Record<string, unknown> = {
      ...state,
      schemaVersion: 7
    };
    delete v7State.quests;

    const envelope: SaveEnvelope = {
      schemaVersion: 7,
      savedAtUtcMs: Date.now(),
      state: v7State as unknown as typeof state,
      checksum: "dummy_checksum"
    };

    const migrated = migrateSaveData(envelope);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.quests).toBeDefined();
    expect(migrated.state.quests.activeActId).toBe("act1_homestead");
    expect(migrated.state.quests.activeQuestId).toBe("quest.act1_welcome");
    expect(migrated.state.quests.activeStepIndex).toBe(0);
    expect(Array.isArray(migrated.state.quests.completedQuestIds)).toBe(true);
    expect(migrated.state.quests.unlockedFeatureIds).toEqual([]);
    expect(migrated.state.world.storySchoolSpawned).toBe(false);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  describe("IndexedDB durable quest slots", () => {
    let restoreIndexedDB: () => void;

    beforeEach(() => {
      restoreIndexedDB = installMemoryIndexedDB();
    });

    afterEach(async () => {
      await new IndexedDbSaveRepository().clearSaves();
      restoreIndexedDB();
    });

    it("persists quest progress through IndexedDB save & load", async () => {
      const repo = new IndexedDbSaveRepository();
      const state = createInitialGameState();

      // Advance quest step
      state.quests.activeQuestId = "quest.act1_sow_wheat";
      state.quests.activeStepIndex = 0;
      state.quests.stepProgress = { "step.act1_sow_3_wheat": 2 };
      state.quests.completedQuestIds = ["quest.act1_welcome"];

      const saveSuccess = await repo.saveGame(state);
      expect(saveSuccess).toBe(true);

      const loaded = await repo.loadGame();
      expect(loaded).not.toBeNull();
      expect(loaded?.state.quests.activeQuestId).toBe("quest.act1_sow_wheat");
      expect(loaded?.state.quests.stepProgress["step.act1_sow_3_wheat"]).toBe(2);
      expect(loaded?.state.quests.completedQuestIds).toContain("quest.act1_welcome");
    });
  });

  it("rejects invalid or poisoned quest structures in save envelope", () => {
    const state = createInitialGameState();
    const poisonedState: Record<string, unknown> = {
      ...state,
      schemaVersion: 9,
      quests: {
        activeActId: 12345, // invalid type
        activeStepIndex: -1 // invalid negative
      }
    };

    const envelope: SaveEnvelope = {
      schemaVersion: 9,
      savedAtUtcMs: Date.now(),
      state: poisonedState as unknown as typeof state,
      checksum: "dummy_checksum"
    };

    expect(validateSaveEnvelope(envelope)).toBe(false);
  });
});
