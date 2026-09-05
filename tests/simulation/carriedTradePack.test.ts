import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import {
  CARRIED_LOAD_SPEED_SCALE,
  carriedLoadPenaltyPercent,
  carriedLoadSpeedScale
} from "../../src/simulation/navigation/PlayerTraversal";
import { buildStatusChips } from "../../src/simulation/presentation/WorldHudPresentation";
import type { CargoClass, FishCargoId } from "../../src/simulation/core/types";

const CLASSES: CargoClass[] = ["small", "medium", "large", "gargantuan"];

function carry(sim: Simulation, cargoClass: CargoClass): FishCargoId {
  const id = "cargo.carried" as FishCargoId;
  sim.state.fishCargo[id] = {
    id,
    speciesId: "fish.trout",
    weightKg: 4,
    quality: "fine",
    caughtAtMinute: 0,
    freshness: 90,
    cargoClass,
    location: { type: "player" }
  } as never;
  sim.state.player.carriedFishCargoId = id;
  return id;
}

describe("carried trade pack", () => {
  it("costs no speed with empty hands", () => {
    expect(carriedLoadSpeedScale(null)).toBe(1);
    expect(carriedLoadSpeedScale(undefined)).toBe(1);
    expect(carriedLoadPenaltyPercent(null)).toBe(0);
  });

  it("slows the player more the heavier the class", () => {
    let previous = 1;
    for (const cargoClass of CLASSES) {
      const scale = carriedLoadSpeedScale(cargoClass);
      expect(scale, cargoClass).toBeGreaterThan(0);
      expect(scale, cargoClass).toBeLessThan(previous);
      previous = scale;
    }
  });

  it("keeps every class walkable rather than pinning the player in place", () => {
    for (const cargoClass of CLASSES) {
      // A load that stops movement outright would read as a bug, not a cost.
      expect(carriedLoadSpeedScale(cargoClass)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("states the penalty as the exact complement of the scale", () => {
    for (const cargoClass of CLASSES) {
      expect(carriedLoadPenaltyPercent(cargoClass))
        .toBe(Math.round((1 - CARRIED_LOAD_SPEED_SCALE[cargoClass]) * 100));
    }
  });

  it("shows the Overburdened chip only while a pack is carried", () => {
    const sim = new Simulation();
    sim.state.player.carriedFishCargoId = null;
    expect(buildStatusChips(sim.state).some((c) => c.id === "overburdened")).toBe(false);

    carry(sim, "medium");
    expect(buildStatusChips(sim.state).some((c) => c.id === "overburdened")).toBe(true);
  });

  it("quotes the same penalty on the chip that the movement table applies", () => {
    // The chip used to assert a slowdown the physics never applied. Its number
    // and the traversal scale must come from the one table.
    const sim = new Simulation();
    for (const cargoClass of CLASSES) {
      carry(sim, cargoClass);
      const chip = buildStatusChips(sim.state).find((c) => c.id === "overburdened")!;
      expect(chip.description, cargoClass)
        .toContain(`${carriedLoadPenaltyPercent(cargoClass)}% slower`);
    }
  });

  it("publishes the class and its penalty on the carried-cargo readout", () => {
    const sim = new Simulation();
    carry(sim, "large");
    const hud = sim.inspectWorldHud(null);
    expect(hud.carriedFish?.cargoClass).toBe("large");
    expect(hud.carriedFish?.carrySpeedPenaltyPercent).toBe(carriedLoadPenaltyPercent("large"));
  });

  it("never mutates state while reporting the load", () => {
    const sim = new Simulation();
    carry(sim, "gargantuan");
    const before = JSON.stringify(sim.state.player);
    buildStatusChips(sim.state);
    sim.inspectWorldHud(null);
    expect(JSON.stringify(sim.state.player)).toBe(before);
  });
});

describe("carried trade pack — physics", () => {
  /** Walks straight for a fixed number of steps and reports distance covered. */
  async function walkDistance(cargoClass: CargoClass | null): Promise<number> {
    const { PhysicsWorld } = await import("../../src/physics/PhysicsWorld");
    const { WorldLayout } = await import("../../src/world/WorldLayout");
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    Object.assign(sim.state.player, {
      x: 0,
      y: WorldLayout.traversalSurfaceHeight(0, 0) + 0.5,
      z: 0
    });
    if (cargoClass) carry(sim, cargoClass);
    const startX = sim.state.player.x;
    const startZ = sim.state.player.z;
    for (let index = 0; index < 60; index += 1) {
      const frame = physics.step(sim.state, { x: 0, z: 1, sprint: false }, "on-foot", 1 / 60, index / 60);
      sim.commitPhysicsFrame(frame.frame);
    }
    return Math.hypot(sim.state.player.x - startX, sim.state.player.z - startZ);
  }

  it("actually moves the player more slowly while a pack is carried", async () => {
    const empty = await walkDistance(null);
    const laden = await walkDistance("gargantuan");
    expect(empty).toBeGreaterThan(0.2);
    // The HUD promises a slowdown; the world has to deliver one.
    expect(laden).toBeLessThan(empty);
  }, 60000);

  it("slows a heavy pack more than a light one", async () => {
    const light = await walkDistance("small");
    const heavy = await walkDistance("gargantuan");
    expect(heavy).toBeLessThan(light);
  }, 60000);
});
