import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { STARTER_CARRIAGE_ID } from "../../src/simulation/mounts/Carriage";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";

describe("loaded-wagon debug fixture", () => {
  it("stows two harvest packs through the carriage and boards the driver", () => {
    const sim = new Simulation();
    expect(sim.prepareDebugLoadedCarriage()).toBe(true);
    const carriage = sim.state.mounts[STARTER_CARRIAGE_ID];
    const slots = carriage.fishCargoSlotIds ?? [];
    expect(slots.filter((id) => id !== null)).toHaveLength(2);
    for (const [slotIndex, cargoId] of slots.entries()) {
      const cargo = sim.state.fishCargo[cargoId!];
      expect(cargo).toMatchObject({ kind: "farm", itemId: "produce.wheat",
        location: { type: "carriage", containerId: STARTER_CARRIAGE_ID, slotIndex } });
    }
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    expect(sim.state.player.activeMountId).toBe(STARTER_CARRIAGE_ID);
    expect(validateSaveEnvelope({ schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: structuredClone(sim.state) }))
      .toBe(true);
  });
});
