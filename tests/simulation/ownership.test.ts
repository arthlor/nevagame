import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { farmLocalToWorld, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { INTERACTION_STANCE_OFFSET_METERS } from "../../src/world/InteractionReach";
import { WorldLayout } from "../../src/world/WorldLayout";

/**
 * A fresh save starts without seeds, and planting needs the player on prepared soil, so tests that
 * plant grant the seeds they use and stand on the starter plot.
 */
function withWheatSeed(sim: Simulation, quantity = 1): void {
  InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
    { itemId: "seed.wheat", quantity }
  ]);
  sim.state.player.x = STARTER_FARM_LAYOUT.origin.x;
  sim.state.player.z = STARTER_FARM_LAYOUT.origin.z;
  sim.state.player.y = WorldLayout.traversalSurfaceHeight(sim.state.player.x, sim.state.player.z) + INTERACTION_STANCE_OFFSET_METERS;
}

describe("Simulation ownership boundaries", () => {
  it("atomically validates and commits resolved physics poses", () => {
    const sim = new Simulation();
    const originalX = sim.state.player.x;
    const valid = sim.commitPhysicsFrame({
      player: {
        x: originalX + 1,
        y: 0.5,
        z: sim.state.player.z,
        rotationY: 0.5,
        traversal: { ...sim.state.player.traversal }
      },
      boats: {}
    });

    expect(valid.success).toBe(true);
    expect(sim.state.player.x).toBe(originalX + 1);

    const beforeInvalid = { ...sim.state.player };
    const invalid = sim.commitPhysicsFrame({
      player: {
        x: beforeInvalid.x + 1,
        y: beforeInvalid.y,
        z: beforeInvalid.z,
        rotationY: 0,
        traversal: { ...beforeInvalid.traversal }
      },
      boats: {
        "boat.unknown": { x: 0, y: 0, z: 50, headingRadians: 0, speed: 0 }
      }
    });

    expect(invalid.success).toBe(false);
    expect(sim.state.player).toEqual(beforeInvalid);
  });

  it("rejects a physics frame that detaches the player from the active boat", () => {
    const sim = new Simulation();
    const boat = sim.state.boats["boat.player_rowboat"];
    sim.state.player.activeBoatId = boat.id;

    const result = sim.commitPhysicsFrame({
      player: {
        x: boat.x + 1,
        y: boat.y + 0.5,
        z: boat.z,
        rotationY: boat.headingRadians,
        traversal: { ...sim.state.player.traversal }
      },
      boats: {
        [boat.id]: {
          x: boat.x,
          y: boat.y,
          z: boat.z,
          headingRadians: boat.headingRadians,
          speed: boat.speed
        }
      }
    });

    expect(result).toMatchObject({ success: false });
  });

  it("uses one deterministic crop-placement rule for prompt and execution", () => {
    const left = new Simulation();
    const right = new Simulation();
    withWheatSeed(left);
    withWheatSeed(right);
    const leftPlacement = left.findPlantingPosition("farm.starter_garden", "crop.wheat");
    const rightPlacement = right.findPlantingPosition("farm.starter_garden", "crop.wheat");

    expect(leftPlacement).toEqual(rightPlacement);
    expect(leftPlacement.success).toBe(true);
    expect(left.plantCropNearPlayer("farm.starter_garden", "crop.wheat").success).toBe(true);
    const planted = Object.values(left.state.crops)[0];
    expect({ x: planted.x, z: planted.z }).toEqual({ x: leftPlacement.x, z: leftPlacement.z });
  });

  it("routes player-facing mutations through semantic commands", () => {
    const sim = new Simulation();
    withWheatSeed(sim, 2);
    const result = sim.execute({
      type: "crop.plant-near",
      farmId: "farm.starter_garden",
      cropId: "crop.wheat"
    });

    expect(result.success).toBe(true);
    expect(Object.keys(sim.state.crops)).toHaveLength(1);
    // The query answers in farm-local metres; the explicit command takes world coordinates.
    const offered = sim.query({ type: "crop.find-placement", farmId: "farm.starter_garden", cropId: "crop.wheat" }) as
      { success: boolean; x: number; z: number };
    expect(offered.success).toBe(true);
    const freePlot = farmLocalToWorld("farm.starter_garden", { x: offered.x, z: offered.z });
    expect(sim.execute({
      type: "crop.plant",
      request: { farmId: "farm.starter_garden", cropId: "crop.wheat", x: freePlot.x, z: freePlot.z }
    })).toMatchObject({ success: true });
    expect(Object.keys(sim.state.crops)).toHaveLength(2);
  });

  it("does not reinterpret an off-farm world coordinate as farm-local", () => {
    const sim = new Simulation();
    // The starter farm's local bounds are x[-18,18] z[-14,14]; as raw world
    // coordinates those points sit across the island. A request that far from
    // the angler must fail on distance, not silently plant near the farm.
    expect(sim.validateCropPlacement("farm.starter_garden", "crop.wheat", 5, 3))
      .toMatchObject({ valid: false, reasonCode: "too-far" });
  });

  it("faces a resolved world target without changing position or save shape", () => {
    const sim = new Simulation();
    const before = { x: sim.state.player.x, y: sim.state.player.y, z: sim.state.player.z };
    const result = sim.execute({
      type: "player.face-target",
      x: before.x + 4,
      z: before.z
    });

    expect(result.success).toBe(true);
    expect(sim.state.player).toMatchObject(before);
    expect(sim.state.player.rotationY).toBeCloseTo(Math.PI / 2, 6);
    expect(sim.execute({ type: "player.face-target", x: Number.NaN, z: 0 }).success).toBe(false);

    sim.state.player.activeBoatId = "boat.player_rowboat";
    expect(sim.execute({ type: "player.face-target", x: 0, z: 4 }).success).toBe(false);
  });
});
