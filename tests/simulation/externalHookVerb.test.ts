import { beforeEach, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { FRESHNESS_STORAGE_MODIFIERS } from "../../src/simulation/fishing/calculateFreshness";
import type { CargoClass, FishCargoId } from "../../src/simulation/core/types";

function carryCatch(
  sim: Simulation,
  cargoId: FishCargoId,
  speciesId: string,
  cargoClass: CargoClass
): void {
  sim.state.fishCargo[cargoId] = {
    id: cargoId,
    speciesId,
    weightKg: cargoClass === "gargantuan" ? 140 : 2,
    quality: "fine",
    caughtAtMinute: sim.state.clock.currentMinute,
    freshness: 100,
    cargoClass,
    location: { type: "player", containerId: "player" }
  };
  sim.state.player.carriedFishCargoId = cargoId;
}

function aboardSkiff(sim: Simulation): void {
  expect(sim.prepareDebugSkiffReview()).toBe(true);
  expect(sim.boardBoat("boat.player_skiff").success).toBe(true);
  expect(sim.state.player.activeBoatId).toBe("boat.player_skiff");
}

describe("external-hook boat verb", () => {
  beforeEach(() => ContentRegistry.initializeAndValidate());

  it("hangs a gargantuan catch the hold cannot take", () => {
    const sim = new Simulation();
    aboardSkiff(sim);
    carryCatch(sim, "cargo.marlin", "fish.blue_marlin", "gargantuan");
    const loaded: number[] = [];
    sim.events.on("CargoLoaded", (event) => loaded.push(event.slotIndex));

    const hold = sim.execute({ type: "cargo.stow-aboard", boatId: "boat.player_skiff", placement: "hold" });
    expect(hold).toMatchObject({ success: false, reason: "The hold has no room for this catch" });
    expect(sim.state.player.carriedFishCargoId).toBe("cargo.marlin");

    const hook = sim.execute({ type: "cargo.stow-aboard", boatId: "boat.player_skiff", placement: "hook" });
    expect(hook.success).toBe(true);
    const boat = sim.state.boats["boat.player_skiff"];
    expect(boat.fishCargoSlotIds[4]).toBe("cargo.marlin");
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    const cargo = sim.state.fishCargo["cargo.marlin"];
    expect(cargo.location).toEqual({ type: "boat-hook", containerId: "boat.player_skiff", slotIndex: 4 });
    expect(loaded).toEqual([4]);
  });

  it("stows a fitting catch in the hold and reports both placements", () => {
    const sim = new Simulation();
    aboardSkiff(sim);
    carryCatch(sim, "cargo.carp", "fish.carp", "small");

    const stores = sim.inspectHoldStores();
    const vessel = stores.vessels.find((entry) => entry.boatId === "boat.player_skiff")!;
    expect(vessel.isActive).toBe(true);
    expect(vessel.stowCarried).toEqual({ hold: true, hook: true });
    expect(vessel.cargoSlots.map((slot) => slot.kind)).toEqual(["hold", "hold", "hold", "hold", "hook", "hook"]);

    const stow = sim.execute({ type: "cargo.stow-aboard", boatId: "boat.player_skiff", placement: "hold" });
    expect(stow.success).toBe(true);
    expect(sim.state.boats["boat.player_skiff"].fishCargoSlotIds[0]).toBe("cargo.carp");
    expect(sim.state.fishCargo["cargo.carp"].location).toEqual({
      type: "boat-hold",
      containerId: "boat.player_skiff",
      slotIndex: 0
    });
    expect(sim.inspectHoldStores().vessels.find((entry) => entry.boatId === "boat.player_skiff")!.stowCarried)
      .toEqual({ hold: false, hook: false });
  });

  it("refuses to stow on a vessel the player is not aboard", () => {
    const sim = new Simulation();
    expect(sim.prepareDebugSkiffReview()).toBe(true);
    expect(sim.state.player.activeBoatId).toBeNull();
    carryCatch(sim, "cargo.carp", "fish.carp", "small");
    const other = sim.execute({ type: "cargo.stow-aboard", boatId: "boat.player_skiff", placement: "hold" });
    expect(other).toMatchObject({ success: false, reason: "Board the vessel to stow this catch" });
    expect(sim.state.player.carriedFishCargoId).toBe("cargo.carp");
    expect(sim.execute({ type: "cargo.stow-aboard", boatId: "boat.missing", placement: "hold" }))
      .toMatchObject({ success: false, reason: "Vessel not found" });
  });

  it("requires a carried catch before any stow", () => {
    const sim = new Simulation();
    aboardSkiff(sim);
    expect(sim.execute({ type: "cargo.stow-aboard", boatId: "boat.player_skiff", placement: "hold" }))
      .toMatchObject({ success: false, reason: "Your hands are empty" });
  });

  it("keeps the transom hook the exposed, faster-decaying placement", () => {
    expect(FRESHNESS_STORAGE_MODIFIERS["boat-hook"]).toBeGreaterThan(FRESHNESS_STORAGE_MODIFIERS["boat-hold"]);
    expect(FRESHNESS_STORAGE_MODIFIERS["boat-hook"]).toBe(FRESHNESS_STORAGE_MODIFIERS.player);
  });
});
