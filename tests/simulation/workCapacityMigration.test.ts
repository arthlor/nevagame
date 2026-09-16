import { describe, expect, it } from "vitest";
import fixture from "../fixtures/save_v41_layout19.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { WORK_CAPACITY_MAXIMUM } from "../../src/simulation/domains/ProgressionDomain";

const legacy = () => structuredClone(fixture) as unknown as SaveEnvelope;

describe("Work capacity daily-budget migration (v43)", () => {
  it("rescales the legacy Work pool to the daily ceiling, preserving fullness", () => {
    const before = legacy();
    const untouched = structuredClone(before);
    expect(validateSaveEnvelope(before)).toBe(true);

    const after = migrateSaveData(before);
    const beforeWork = before.state.player.workCapacity;
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.player.workCapacity.maximum).toBe(WORK_CAPACITY_MAXIMUM);
    expect(after.state.player.workCapacity.current).toBe(
      Math.round((beforeWork.current / beforeWork.maximum) * WORK_CAPACITY_MAXIMUM)
    );
    expect(after.state.player.workCapacity.earnedToday).toBe(0);
    expect(after.state.player.workCapacity.mealsToday).toBe(0);
    expect(after.state.player.workCapacity.laborUsedToday).toEqual([]);
    expect(validateSaveEnvelope(after)).toBe(true);
    // The migration must not mutate the caller's envelope.
    expect(before).toEqual(untouched);
  });

  it("is idempotent on an already-migrated save", () => {
    const once = migrateSaveData(legacy());
    const twice = migrateSaveData(structuredClone(once));
    expect(twice.state.player.workCapacity).toEqual(once.state.player.workCapacity);
  });
});
