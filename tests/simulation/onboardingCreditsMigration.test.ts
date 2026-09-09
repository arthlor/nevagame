import { describe, it, expect } from "vitest";
import fixture from "../fixtures/save_v34_layout14.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { Simulation } from "../../src/simulation/Simulation";
import { mainQuestTrack, questEarlyActionCredits } from "../../src/simulation/core/QuestTypes";
import type { SaveEnvelope } from "../../src/persistence/SaveSchema";
import type { GameState } from "../../src/simulation/core/types";

/** A pre-v35 envelope genuinely has no `earlyActionCredits`. */
function legacyEnvelope(): SaveEnvelope {
  return structuredClone(fixture) as unknown as SaveEnvelope;
}

function migrate(envelope: SaveEnvelope): GameState {
  const migrated = migrateSaveData(envelope);
  expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  expect(validateSaveEnvelope(migrated)).toBe(true);
  return migrated.state;
}

/**
 * A processing job exactly as schema 34 stored it. Later schemas add
 * presentation and economy snapshot fields to `ProcessingJobState`; a save
 * written before those existed genuinely lacks them, so this is cast rather
 * than typed — the same treatment the legacy envelope itself gets. Keeping it
 * legacy-shaped is also what stops this fixture breaking every time the live
 * job shape grows a field.
 */
function legacyJob(job: {
  id: string; recipeId: string; stationId: string;
  startedAtMinute: number; completesAtMinute: number;
}): GameState["processingJobs"][string] {
  return { ...job, status: "active" } as unknown as GameState["processingJobs"][string];
}

describe("schema 35 onboarding credit migration", () => {
  it("frees a save stranded on the watering step by its already-wet crops", () => {
    const state = migrate(legacyEnvelope());

    // The migration banks the owed watering; loading redeems it.
    expect(questEarlyActionCredits(state.quests)).toEqual([
      { type: "water-crop", location: { kind: "farm", id: "farm.starter_garden" }, quantity: 3 }
    ]);

    const simulation = new Simulation(state);
    expect(mainQuestTrack(simulation.state.quests).stepProgress).toEqual({ "step.act1_water_3_crops": 3 });
    expect(questEarlyActionCredits(simulation.state.quests)).toEqual([]);
  });

  it("is stable across a repeated load", () => {
    const once = new Simulation(migrate(legacyEnvelope()));
    const twice = new Simulation(structuredClone(once.state));
    expect(mainQuestTrack(twice.state.quests).stepProgress).toEqual({ "step.act1_water_3_crops": 3 });
    expect(questEarlyActionCredits(twice.state.quests)).toEqual([]);
  });

  it("does not over-credit a save that already recorded some watering", () => {
    const envelope = legacyEnvelope();
    const quests = (envelope.state as GameState).quests;
    quests.tracks["track.main"].stepProgress = { "step.act1_water_3_crops": 2 };
    const state = migrate(envelope);
    expect(questEarlyActionCredits(state.quests)).toEqual([
      { type: "water-crop", location: { kind: "farm", id: "farm.starter_garden" }, quantity: 1 }
    ]);
    expect(mainQuestTrack(new Simulation(state).state.quests).stepProgress).toEqual({
      "step.act1_water_3_crops": 3
    });
  });

  it("ignores dry, withered, and other-farm crops", () => {
    const envelope = legacyEnvelope();
    const state0 = envelope.state as GameState;
    const crops = Object.values(state0.crops);
    crops[0].moisture = 10;
    crops[1].stage = "withered";
    // Move the third crop to another farm properly — the save validator holds
    // `farms[farmId].placedCropIds` and the crop record to the same truth.
    const moved = crops[2];
    state0.farms["farm.starter_garden"].placedCropIds =
      state0.farms["farm.starter_garden"].placedCropIds.filter((id) => id !== moved.id);
    state0.farms["farm.player_homestead"].placedCropIds.push(moved.id);
    moved.farmId = "farm.player_homestead";

    const state = migrate(envelope);
    expect(questEarlyActionCredits(state.quests)).toEqual([]);
    expect(mainQuestTrack(new Simulation(state).state.quests).stepProgress).toEqual({});
  });

  it("credits the compost step for a legacy save holding the old starting worms", () => {
    const envelope = legacyEnvelope();
    const state0 = envelope.state as GameState;
    state0.quests.tracks["track.main"] = {
      activeQuestId: "quest.act2_harvest_and_compost",
      activeStepIndex: 1,
      stepProgress: {}
    };
    const inventory = state0.inventories[state0.player.inventoryId];
    inventory.slots[0] = { ...inventory.slots[0], itemId: "item.bait_worms", quantity: 10 };

    const state = migrate(envelope);
    expect(mainQuestTrack(state.quests).stepProgress).toEqual({ "step.act2_compost_worms": 1 });
  });

  it("never lets worm ownership stand in for a recipe outside the migration", () => {
    // A live game holding worms must not have the compost step handed to it.
    const simulation = new Simulation();
    const inventory = simulation.state.inventories[simulation.state.player.inventoryId];
    inventory.slots[0] = { ...inventory.slots[0], itemId: "item.bait_worms", quantity: 25 };
    simulation.state.quests.tracks["track.main"] = {
      activeQuestId: "quest.act2_harvest_and_compost",
      activeStepIndex: 1,
      stepProgress: {}
    };

    const reloaded = new Simulation(structuredClone(simulation.state));
    expect(mainQuestTrack(reloaded.state.quests).stepProgress).toEqual({});
  });

  it("does not credit the compost step from a different cursor", () => {
    const envelope = legacyEnvelope();
    const state0 = envelope.state as GameState;
    state0.quests.tracks["track.main"] = {
      activeQuestId: "quest.act2_harvest_and_compost",
      activeStepIndex: 0, // still on the harvest step
      stepProgress: {}
    };
    const inventory = state0.inventories[state0.player.inventoryId];
    inventory.slots[0] = { ...inventory.slots[0], itemId: "item.bait_worms", quantity: 10 };

    const state = migrate(envelope);
    expect(mainQuestTrack(state.quests).stepProgress["step.act2_compost_worms"]).toBeUndefined();
  });

  it("clamps an in-flight tutorial compost job, and leaves other jobs alone", () => {
    const envelope = legacyEnvelope();
    const state0 = envelope.state as GameState;
    const now = state0.clock.currentMinute;
    state0.processingJobs = {
      job_compost: legacyJob({
        id: "job_compost", recipeId: "recipe.compost_worms", stationId: "struct.starter_compost",
        startedAtMinute: now, completesAtMinute: now + 360
      }),
      job_mill: legacyJob({
        id: "job_mill", recipeId: "recipe.wheat_to_grain", stationId: "struct.starter_mill",
        startedAtMinute: now, completesAtMinute: now + 6
      }),
      job_elsewhere: legacyJob({
        id: "job_elsewhere", recipeId: "recipe.compost_worms", stationId: "struct.workbench",
        startedAtMinute: now, completesAtMinute: now + 360
      })
    };

    const state = migrate(envelope);
    expect(state.processingJobs.job_compost.completesAtMinute).toBe(now + 12);
    expect(state.processingJobs.job_mill.completesAtMinute).toBe(now + 6);
    expect(state.processingJobs.job_elsewhere.completesAtMinute).toBe(now + 360);
  });

  it("leaves a veteran's compost run at its authored length", () => {
    const envelope = legacyEnvelope();
    const state0 = envelope.state as GameState;
    const now = state0.clock.currentMinute;
    state0.quests.completedQuestIds.push("quest.act2_harvest_and_compost");
    state0.processingJobs = {
      job_compost: legacyJob({
        id: "job_compost", recipeId: "recipe.compost_worms", stationId: "struct.starter_compost",
        startedAtMinute: now, completesAtMinute: now + 360
      })
    };

    const state = migrate(envelope);
    expect(state.processingJobs.job_compost.completesAtMinute).toBe(now + 360);
  });

  it("rejects malformed credit ledgers", () => {
    const base = () => {
      const migrated = migrateSaveData(legacyEnvelope());
      return migrated;
    };
    const withCredits = (credits: unknown) => {
      const envelope = base();
      (envelope.state.quests as unknown as Record<string, unknown>).earlyActionCredits = credits;
      return validateSaveEnvelope(envelope);
    };

    expect(withCredits([])).toBe(true);
    expect(withCredits("nope")).toBe(false);
    expect(withCredits([{ type: "not-a-type", quantity: 1 }])).toBe(false);
    expect(withCredits([{ type: "water-crop", quantity: 0 }])).toBe(false);
    expect(withCredits([{ type: "water-crop", quantity: 65 }])).toBe(false);
    expect(withCredits([{ type: "water-crop", quantity: 1, location: { kind: "nowhere", id: "x" } }])).toBe(false);
    expect(withCredits([{ type: "water-crop", quantity: 1, targetId: 7 }])).toBe(false);
    expect(withCredits(Array.from({ length: 17 }, () => ({ type: "water-crop", quantity: 1 })))).toBe(false);
  });
});
