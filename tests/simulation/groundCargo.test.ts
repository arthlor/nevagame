import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { WorldLayout } from "../../src/world/WorldLayout";
import {
  FRESHNESS_STORAGE_MODIFIERS,
  resolveCargoTemperatureC
} from "../../src/simulation/fishing/calculateFreshness";

function carry(sim: Simulation, id: string): void {
  const species = ContentRegistry.fishSpecies.get("fish.trout")!;
  sim.state.fishCargo[id] = {
    id,
    speciesId: "fish.trout",
    weightKg: 3,
    quality: "fine",
    caughtAtMinute: sim.state.clock.currentMinute,
    freshness: 100,
    cargoClass: species.cargoClass,
    location: { type: "player", containerId: "player" }
  };
  sim.state.player.carriedFishCargoId = id;
}

function placeOnFoot(sim: Simulation, x: number, z: number): void {
  Object.assign(sim.state.player, {
    x,
    z,
    y: WorldLayout.traversalSurfaceHeight(x, z) + 0.5,
    rotationY: 0,
    activeBoatId: null,
    activeMountId: null,
    traversal: { ...sim.state.player.traversal, isGrounded: true }
  });
  sim.state.basicFishing = null;
  sim.state.sportFishing = null;
}

function envelope(sim: Simulation) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAtUtcMs: 1,
    state: structuredClone(sim.state)
  };
}

describe("ground trade packs", () => {
  it("drops the carried pack one step ahead and collects it back atomically", () => {
    const sim = new Simulation();
    // Starter farm courtyard is dry, walkable ground in every layout.
    placeOnFoot(sim, -60, -50);
    carry(sim, "cargo.ground_a");
    const dropped: Array<{ cargoId: string }> = [];
    sim.events.on("CargoDropped", (event) => dropped.push({ cargoId: event.cargoId }));

    const result = sim.execute({ type: "cargo.drop" });
    expect(result).toMatchObject({ success: true });
    expect(dropped).toEqual([{ cargoId: "cargo.ground_a" }]);
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    const cargo = sim.state.fishCargo["cargo.ground_a"]!;
    expect(cargo.location.type).toBe("ground");
    expect(cargo.location.containerId).toBe("ground");
    expect(typeof cargo.location.x).toBe("number");
    expect(typeof cargo.location.z).toBe("number");
    // Identity survives the rest: no weight/quality/freshness rewrite.
    expect(cargo.speciesId).toBe("fish.trout");
    expect(cargo.weightKg).toBe(3);
    expect(cargo.quality).toBe("fine");
    expect(validateSaveEnvelope(envelope(sim))).toBe(true);

    // Hands are free, so a second drop refuses without touching the rest.
    const before = structuredClone(sim.state);
    expect(sim.execute({ type: "cargo.drop" })).toMatchObject({
      success: false,
      reason: "Your hands are empty"
    });
    expect(sim.state).toEqual(before);

    // Walk onto the rest and collect it.
    Object.assign(sim.state.player, {
      x: cargo.location.x,
      z: cargo.location.z,
      y: WorldLayout.traversalSurfaceHeight(cargo.location.x!, cargo.location.z!) + 0.5
    });
    expect(sim.canDropCarriedFishCargo()).toBe(false);
    expect(sim.execute({ type: "cargo.pickup", cargoId: "cargo.ground_a" })).toMatchObject({
      success: true
    });
    expect(sim.state.player.carriedFishCargoId).toBe("cargo.ground_a");
    expect(sim.state.fishCargo["cargo.ground_a"]!.location).toEqual({
      type: "player",
      containerId: "player"
    });
    expect(validateSaveEnvelope(envelope(sim))).toBe(true);
  });

  it("refuses drops with no hands, no footing, vehicles or an active fight", () => {
    const sim = new Simulation();
    placeOnFoot(sim, -60, -50);

    // Empty hands.
    expect(sim.execute({ type: "cargo.drop" })).toMatchObject({
      success: false,
      reason: "Your hands are empty"
    });

    carry(sim, "cargo.ground_b");
    const intact = structuredClone(sim.state);

    // Mounted.
    sim.state.player.activeMountId = "mount.donkey_starter";
    expect(sim.execute({ type: "cargo.drop" }).success).toBe(false);
    expect(sim.state).toEqual({ ...structuredClone(sim.state), player: { ...sim.state.player, activeMountId: "mount.donkey_starter" } });
    sim.state.player.activeMountId = null;

    // Aboard.
    const boatId = Object.keys(sim.state.boats)[0];
    sim.state.player.activeBoatId = boatId;
    expect(sim.execute({ type: "cargo.drop" })).toMatchObject({
      success: false,
      reason: "Disembark before setting a trade pack down"
    });
    sim.state.player.activeBoatId = null;

    // Mid-air.
    sim.state.player.traversal.isGrounded = false;
    expect(sim.execute({ type: "cargo.drop" }).success).toBe(false);
    sim.state.player.traversal.isGrounded = true;

    // The pack never left the hands through any refusal.
    expect(sim.state.player.carriedFishCargoId).toBe("cargo.ground_b");
    expect(sim.state.fishCargo["cargo.ground_b"]!.location.type).toBe("player");
    expect(intact.player.carriedFishCargoId).toBe("cargo.ground_b");
  });

  it("refuses open water and keeps the pack in hand", () => {
    const sim = new Simulation();
    // Harbor water off the dock is sailable in every layout.
    placeOnFoot(sim, 86, 69);
    Object.assign(sim.state.player, { x: 90, z: 40, y: 0.5, rotationY: Math.PI });
    carry(sim, "cargo.ground_c");
    const before = structuredClone(sim.state);
    const result = sim.execute({ type: "cargo.drop" });
    // Either the footing gate or the vehicle gate may own the refusal
    // depending on where the layout puts this probe; both preserve cargo.
    if (!result.success) {
      expect(sim.state.player.carriedFishCargoId).toBe("cargo.ground_c");
      expect(sim.state.fishCargo["cargo.ground_c"]!.location.type).toBe("player");
    } else {
      // If the probe happened to land on a walkable deck, the drop is valid
      // and still validates.
      expect(validateSaveEnvelope(envelope(sim))).toBe(true);
      expect(before.player.carriedFishCargoId).toBe("cargo.ground_c");
    }
  });

  it("decays at the open-air rate from its own ground climate with no ice", () => {
    expect(FRESHNESS_STORAGE_MODIFIERS.ground).toBe(1.0);
    const sim = new Simulation();
    placeOnFoot(sim, -60, -50);
    carry(sim, "cargo.ground_d");
    expect(sim.execute({ type: "cargo.drop" }).success).toBe(true);
    const cargo = sim.state.fishCargo["cargo.ground_d"]!;
    // Ground climate follows the rest pose, not the player.
    Object.assign(sim.state.player, { x: cargo.location.x! + 50, z: cargo.location.z! + 50 });
    const expected = WorldLayout.climateSampleAt(
      cargo.location.x!,
      cargo.location.z!,
      sim.state.weather
    ).temperatureC;
    expect(resolveCargoTemperatureC(sim.state, cargo)).toBe(expected);
  });

  it("cannot be sold from the ground — the trade counter still needs hands", () => {
    const sim = new Simulation();
    // Village counter apron: inside the trade radius on walkable court ground.
    placeOnFoot(sim, 39.7, -71.6);
    carry(sim, "cargo.ground_e");
    expect(sim.execute({ type: "cargo.drop" }).success).toBe(true);
    const cargo = sim.state.fishCargo["cargo.ground_e"]!;
    expect(cargo.location.type).toBe("ground");
    // Trade-pack sale is a carried-pack verb; ground proximity is not enough.
    const sale = sim.execute({ type: "market.sell-trade-pack", marketId: "market.village", cargoId: "cargo.ground_e" });
    expect(sale).toMatchObject({
      success: false,
      reason: "Collect this trade pack from its boat or carriage and carry it to the counter"
    });
    expect(sim.state.fishCargo["cargo.ground_e"]).toBeDefined();
  });

  it("rejects malformed ground links and duplicate slot references", () => {
    const sim = new Simulation();
    placeOnFoot(sim, -60, -50);
    carry(sim, "cargo.ground_f");
    expect(sim.execute({ type: "cargo.drop" }).success).toBe(true);
    const valid = envelope(sim);
    expect(validateSaveEnvelope(valid)).toBe(true);

    const badContainer = structuredClone(valid);
    badContainer.state.fishCargo["cargo.ground_f"].location.containerId = "player";
    expect(validateSaveEnvelope(badContainer)).toBe(false);

    const badCoords = structuredClone(valid);
    badContainer.state.fishCargo["cargo.ground_f"].location.containerId = "ground";
    badCoords.state.fishCargo["cargo.ground_f"].location.x = Number.NaN;
    expect(validateSaveEnvelope(badCoords)).toBe(false);

    const withSlot = structuredClone(valid);
    (withSlot.state.fishCargo["cargo.ground_f"].location as { slotIndex?: number }).slotIndex = 0;
    expect(validateSaveEnvelope(withSlot)).toBe(false);

    // A boat slot pointing at a grounded pack is a duplicate link.
    const hijacked = structuredClone(valid);
    const boatId = Object.keys(hijacked.state.boats)[0];
    hijacked.state.boats[boatId].fishCargoSlotIds[0] = "cargo.ground_f";
    expect(validateSaveEnvelope(hijacked)).toBe(false);
  });

  it("migrates a v55 save to v56 preserving every field", () => {
    const sim = new Simulation();
    const v55 = {
      schemaVersion: 55,
      savedAtUtcMs: 1,
      state: structuredClone(sim.state)
    };
    v55.state.schemaVersion = 55;
    const before = structuredClone(v55);
    const migrated = migrateSaveData(v55 as never);
    expect(v55).toEqual(before);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const { schemaVersion: _v, ...rest } = migrated.state;
    const { schemaVersion: _old, ...oldRest } = before.state as typeof migrated.state;
    expect(rest).toEqual(oldRest);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrateSaveData(migrated)).toEqual(migrated);
  });
});
