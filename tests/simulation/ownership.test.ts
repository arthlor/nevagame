import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";

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
    const result = sim.execute({
      type: "crop.plant-near",
      farmId: "farm.starter_garden",
      cropId: "crop.wheat"
    });

    expect(result.success).toBe(true);
    expect(Object.keys(sim.state.crops)).toHaveLength(1);
    expect(sim.query({ type: "crop.find-placement", farmId: "farm.starter_garden", cropId: "crop.wheat" }))
      .toMatchObject({ success: false });
    expect(sim.execute({
      type: "crop.plant",
      request: { farmId: "farm.starter_garden", cropId: "crop.wheat", x: 1.25, z: 0 }
    })).toMatchObject({ success: true });
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
