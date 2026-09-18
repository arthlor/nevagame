import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { MOTOR_FUEL_PER_GAME_MINUTE } from "../../src/simulation/domains/NavigationDomain";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import type { BoatState, GameState } from "../../src/simulation/core/types";

/**
 * Offline catch-up owns a documented motor-fuel drain (`01` §6 load order) but
 * simulates no vessel travel. These tests lock that contract: a boat saved
 * under way burns fuel by its saved speed, every boat holds its saved pose,
 * and a stationary or manual vessel burns nothing.
 */
function stateWithSkiff(): { state: GameState; boat: BoatState } {
  const state = createInitialGameState(20260918);
  const definition = ContentRegistry.boats.get("boat.skiff")!;
  const supplyInventoryId = "inv.skiff_supply";
  state.inventories[supplyInventoryId] = InventoryManager.createInventory(
    supplyInventoryId,
    definition.supplySlotCount
  );
  const boat: BoatState = {
    id: "boat.player_skiff",
    boatTypeId: definition.id,
    x: 120,
    y: 0,
    z: -80,
    headingRadians: 0.5,
    speed: 0,
    fuel: definition.fuelCapacity,
    durability: definition.durabilityMax,
    fishCargoSlotIds: definition.fishCargoSlots.map(() => null),
    supplyInventoryId,
    upgrades: [],
    isDocked: false,
    dockedMarketId: null
  };
  state.boats[boat.id] = boat;
  return { state, boat };
}

describe("offline motor fuel", () => {
  it("burns the saved-speed rate for a boat left under way, without moving it", () => {
    const { state, boat } = stateWithSkiff();
    const definition = ContentRegistry.boats.get("boat.skiff")!;
    boat.speed = definition.maxSpeed;
    const pose = { x: boat.x, y: boat.y, z: boat.z, headingRadians: boat.headingRadians };
    const fuelBefore = boat.fuel;

    const summary = applyOfflineProgression(state, state.metadata.lastSavedUtcMs + 10 * 60 * 1000);

    expect(summary.simulatedGameMinutes).toBeGreaterThan(0);
    const expectedBurn = summary.simulatedGameMinutes * MOTOR_FUEL_PER_GAME_MINUTE;
    expect(boat.fuel).toBeCloseTo(Math.max(0, fuelBefore - expectedBurn), 6);
    expect({ x: boat.x, y: boat.y, z: boat.z, headingRadians: boat.headingRadians }).toEqual(pose);
  });

  it("leaves a stationary motorboat and the manual rowboat untouched", () => {
    const { state, boat } = stateWithSkiff();
    const skiffFuelBefore = boat.fuel;
    const rowboat = state.boats["boat.player_rowboat"];
    expect(rowboat).toBeDefined();
    const rowboatFuelBefore = rowboat.fuel;

    applyOfflineProgression(state, state.metadata.lastSavedUtcMs + 10 * 60 * 1000);

    expect(boat.fuel).toBe(skiffFuelBefore);
    expect(rowboat.fuel).toBe(rowboatFuelBefore);
  });
});
