import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import type { GameCommand } from "../../src/simulation/core/contracts";
import { farmLocalToWorld } from "../../src/world/FarmLayout";

function carryingFishWithCrop(): { sim: Simulation; cropId: string } {
  const sim = new Simulation();
  const position = farmLocalToWorld("farm.starter_garden", { x: 0, z: 0 });
  Object.assign(sim.state.player, position);
  const planted = sim.plantCrop("farm.starter_garden", "crop.wheat", position.x, position.z);
  expect(planted.success).toBe(true);
  const cropId = planted.placedCropId!;
  sim.state.crops[cropId].moisture = 20;
  sim.state.player.carriedFishCargoId = "cargo.held";
  sim.state.fishCargo["cargo.held"] = {
    id: "cargo.held", speciesId: "fish.trout", weightKg: 3,
    quality: "common", caughtAtMinute: sim.state.clock.currentMinute,
    freshness: 100, cargoClass: "medium", location: { type: "player", containerId: "player" }
  };
  return { sim, cropId };
}

describe("physical cargo occupies the character's hands", () => {
  it("rejects competing tool actions before changing inventory, work, crops, jobs or RNG", () => {
    const { sim, cropId } = carryingFishWithCrop();
    const commands: GameCommand[] = [
      { type: "crop.plant", request: { farmId: "farm.starter_garden", cropId: "crop.wheat", x: 2, z: 0 } },
      { type: "crop.plant-near", farmId: "farm.starter_garden", cropId: "crop.wheat" },
      { type: "crop.water", placedCropId: cropId },
      { type: "crop.harvest", placedCropId: cropId },
      { type: "farm.apply-fertilizer", farmId: "farm.starter_garden" },
      { type: "farm.irrigate", farmId: "farm.starter_garden" },
      { type: "processing.start", recipeId: "recipe.flour", stationId: "struct.starter_mill" },
      { type: "processing.collect", jobId: "job.ready" },
      { type: "fishing.cast-basic" },
      { type: "fishing.start-charge-basic" },
      { type: "fishing.release-cast-basic" },
      { type: "fishing.chum-school", schoolId: "school.lake" },
      { type: "fishing.hook-school", schoolId: "school.lake" }
    ];
    const before = structuredClone(sim.state);
    const rngBefore = sim.rng.getState();
    for (const command of commands) {
      expect(sim.execute(command), command.type).toMatchObject({ success: false, reason: sim.inspectFreeHands() });
      expect(sim.state, command.type).toEqual(before);
      expect(sim.rng.getState(), command.type).toEqual(rngBefore);
    }
    expect(sim.inspectCrop(cropId)?.actions).toMatchObject({ canWater: false, canHarvest: false, waterReason: sim.inspectFreeHands() });
    expect(sim.validateCropPlacement("farm.starter_garden", "crop.wheat", 2, 0).reasonCode).toBe("hands-occupied");
  });

  it("keeps the fish until an explicit cargo transaction, then resumes a valid crop action", () => {
    const { sim, cropId } = carryingFishWithCrop();
    expect(sim.waterCrop(cropId).success).toBe(false);
    expect(sim.state.fishCargo["cargo.held"].location.type).toBe("player");
    expect(sim.execute({ type: "cargo.discard", cargoId: "cargo.held" }).success).toBe(true);
    expect(sim.inspectFreeHands()).toBeNull();
    expect(sim.inspectCrop(cropId)?.actions.canWater).toBe(true);
    expect(sim.waterCrop(cropId).success).toBe(true);
    expect(sim.state.crops[cropId].moisture).toBe(100);
  });
});
