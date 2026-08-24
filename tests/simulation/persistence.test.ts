// tests/simulation/persistence.test.ts
import { describe, it, expect } from "vitest";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { Simulation } from "../../src/simulation/Simulation";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";

describe("Persistence & Offline Progression", () => {
  it("saves and loads game state reliably", async () => {
    const repo = new IndexedDbSaveRepository();
    const state = createInitialGameState(12345);
    state.player.money = 550;

    const saveSuccess = await repo.saveGame(state);
    expect(saveSuccess).toBe(true);

    const loaded = await repo.loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded?.state.player.money).toBe(550);
    expect(loaded?.state.worldSeed).toBe(12345);
  });

  it("advances offline progression deterministically", () => {
    const sim = new Simulation();
    sim.plantCrop("farm.starter_garden", "crop.wheat", 0, 0);

    const now = Date.now();
    sim.state.metadata.lastSavedUtcMs = now - 52 * 1000; // 52 real seconds = 52 game minutes (52 * 1.2 = 62.4 effective minutes)

    const summary = applyOfflineProgression(sim.state, now);
    expect(summary.simulatedGameMinutes).toBe(52);
    expect(summary.cropsMaturedCount).toBe(1);

    const cropId = Object.keys(sim.state.crops)[0];
    expect(sim.state.crops[cropId].stage).toBe("mature");
  });

  it("caps wall clock first so 3 real hours simulate 3*3600 game minutes", () => {
    const sim = new Simulation();
    const now = Date.now();
    sim.state.metadata.lastSavedUtcMs = now - 3 * 3600 * 1000;
    const summary = applyOfflineProgression(sim.state, now);
    expect(summary.simulatedGameMinutes).toBe(3 * 3600);
  });

  it("rejects poisoned numeric state before it can be restored", () => {
    const state = createInitialGameState();
    const envelope = { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state };
    expect(validateSaveEnvelope(envelope)).toBe(true);

    state.player.money = Number.NaN;
    expect(validateSaveEnvelope(envelope)).toBe(false);
    state.player.money = 100;
    state.inventories[state.player.inventoryId].slots[0].quantity = Infinity;
    expect(validateSaveEnvelope(envelope)).toBe(false);
  });

  it("rejects missing and poisoned simulation branches before offline progression", () => {
    const validEnvelope = () => ({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: createInitialGameState()
    });

    const missingWeather = validEnvelope();
    delete (missingWeather.state as { weather?: unknown }).weather;
    expect(validateSaveEnvelope(missingWeather)).toBe(false);

    const poisonedMarket = validEnvelope();
    poisonedMarket.state.markets["market.village"].commodities["produce.wheat"].basePrice = Number.NaN;
    expect(validateSaveEnvelope(poisonedMarket)).toBe(false);

    const poisonedCapacity = validEnvelope();
    poisonedCapacity.state.player.workCapacity.current = Number.POSITIVE_INFINITY;
    expect(validateSaveEnvelope(poisonedCapacity)).toBe(false);

    const poisonedXp = validEnvelope();
    poisonedXp.state.player.proficiencies.fishing = Number.NaN;
    expect(validateSaveEnvelope(poisonedXp)).toBe(false);

    const poisonedSchool = validEnvelope();
    poisonedSchool.state.world.activeSchools["school.bad"] = {
      id: "school.bad",
      habitatId: "lake",
      x: Number.NaN,
      z: 45,
      radius: 8,
      spawnedAtMinute: 480,
      expiresAtMinute: 660,
      remainingCatchPotential: 3,
      speciesWeights: [{ speciesId: "fish.trout", weight: 1 }]
    };
    expect(validateSaveEnvelope(poisonedSchool)).toBe(false);
  });
});
