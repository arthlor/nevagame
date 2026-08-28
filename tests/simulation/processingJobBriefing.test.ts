import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { formatClockTime, formatGameDuration } from "../../src/simulation/core/GameClock";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";

function movePlayerToProcessingFront(simulation: Simulation, stationId: string): void {
  const station = simulation.state.world.structures[stationId];
  const front = station ? getProcessingStationFrontPosition(stationId, station) : null;
  if (!front) throw new Error(`Missing processing front for ${stationId}`);
  simulation.state.player.x = front.x;
  simulation.state.player.z = front.z;
}

describe("formatGameDuration / formatClockTime", () => {
  it("formats remaining waits and ready-clock hours without inventing extra time", () => {
    expect(formatGameDuration(0)).toBe("almost ready");
    expect(formatGameDuration(5)).toBe("5m");
    expect(formatGameDuration(60)).toBe("1h");
    expect(formatGameDuration(320)).toBe("5h 20m");
    expect(formatGameDuration(360)).toBe("6h");
    expect(formatClockTime(8 * 60)).toBe("08:00");
    expect(formatClockTime(14 * 60)).toBe("14:00");
  });
});

describe("processing job wait briefing", () => {
  it("exposes compost remaining minutes and ready clock from stored job bounds", () => {
    const sim = new Simulation();
    movePlayerToProcessingFront(sim, "struct.starter_compost");
    expect(sim.inspectProcessingJob("struct.starter_compost")).toBeNull();

    expect(sim.startProcessingJob("recipe.compost_worms", "struct.starter_compost")).toMatchObject({
      success: true
    });

    const started = sim.inspectProcessingJob("struct.starter_compost");
    expect(started).toMatchObject({
      recipeId: "recipe.compost_worms",
      outputName: "Bait Worms",
      status: "active",
      remainingMinutes: 360,
      readyClockLabel: "14:00"
    });
    expect(started?.waitBriefing).toBe("Bait Worms working · 6h left · ready 14:00");
    expect(started?.startBriefing).toBe("Cultivate Bait Worms started · 6h · ready 14:00");

    sim.advanceGameMinutes(40);
    const mid = sim.inspectProcessingJob("struct.starter_compost");
    expect(mid).toMatchObject({
      status: "active",
      remainingMinutes: 320,
      readyClockLabel: "14:00"
    });
    expect(mid?.waitBriefing).toBe("Bait Worms working · 5h 20m left · ready 14:00");

    sim.advanceGameMinutes(320);
    const done = sim.inspectProcessingJob("struct.starter_compost");
    expect(done).toMatchObject({
      status: "complete",
      remainingMinutes: 0
    });
    expect(done?.waitBriefing).toBe("Bait Worms ready to collect");
  });

  it("briefs mill jobs in minutes", () => {
    const sim = new Simulation();
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 2 }]);
    movePlayerToProcessingFront(sim, "struct.starter_mill");
    expect(sim.startProcessingJob("recipe.wheat_to_grain", "struct.starter_mill")).toMatchObject({
      success: true
    });
    const inspection = sim.inspectProcessingJob("struct.starter_mill");
    expect(inspection).toMatchObject({
      remainingMinutes: 5,
      readyClockLabel: "08:05",
      waitBriefing: "Ground Grain working · 5m left · ready 08:05"
    });
  });
});
