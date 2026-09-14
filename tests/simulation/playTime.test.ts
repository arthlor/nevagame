import { describe, expect, it } from "vitest";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { Simulation } from "../../src/simulation/Simulation";
import { buildPauseSummaryDto } from "../../src/simulation/presentation/PausePresentation";

describe("total play time", () => {
  it("accrues real, unpaused minutes live and reaches the pause summary", () => {
    const sim = new Simulation();
    const before = sim.state.metadata.totalPlayMinutes;
    for (let frame = 0; frame < 90; frame++) sim.tick(1);
    expect(sim.state.metadata.totalPlayMinutes).toBeCloseTo(before + 1.5, 10);

    sim.clock.setPaused(true);
    sim.tick(600);
    expect(sim.state.metadata.totalPlayMinutes).toBeCloseTo(before + 1.5, 10);

    expect(buildPauseSummaryDto(sim.state).totalPlayMinutes).toBe(sim.state.metadata.totalPlayMinutes);
  });

  it("does not count time away as play", () => {
    const sim = new Simulation();
    const played = sim.state.metadata.totalPlayMinutes;
    const now = Date.now();
    sim.state.metadata.lastSavedUtcMs = now - 5 * 3600 * 1000;
    expect(applyOfflineProgression(sim.state, now).elapsedRealMinutes).toBe(300);
    expect(sim.state.metadata.totalPlayMinutes).toBe(played);
  });
});
