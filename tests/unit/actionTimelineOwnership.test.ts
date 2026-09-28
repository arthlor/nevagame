import { describe, expect, it, vi } from "vitest";
import { SimulationActionTimeline, SIMULATION_ACTION_TIMINGS } from "../../src/simulation/actions/ActionTimeline";

const target = { x: 0, y: 0, z: 0 };
const command = { type: "crop.water", placedCropId: "crop.test" } as const;

describe("action ownership lifecycle", () => {
  it("cancels without running a delayed frame's unattempted commit", () => {
    const commit = vi.fn(() => ({ success: true }));
    const timeline = new SimulationActionTimeline(commit);
    timeline.start("water", target, 0, command);
    expect(timeline.cancelBeforeCommit(2_000)).toBe(true);
    timeline.update(3_000);
    expect(commit).not.toHaveBeenCalled();
    expect(timeline.isActive).toBe(false);
  });

  it("drops an uncommitted scene action and releases actor ownership", () => {
    const commit = vi.fn(() => ({ success: true }));
    const timeline = new SimulationActionTimeline(commit);
    timeline.start("water", target, 0, command);
    timeline.reset();
    expect(timeline.isActive).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(timeline.start("water", target, 1_000, command)).toBe(true);
  });

  it("releases ownership if command execution throws", () => {
    const timeline = new SimulationActionTimeline(() => { throw new Error("failed commit"); });
    timeline.start("water", target, 0, command);
    expect(() => timeline.update(SIMULATION_ACTION_TIMINGS.water.commitMs)).toThrow("failed commit");
    expect(timeline.isActive).toBe(false);
    expect(timeline.start("water", target, 1_000, command)).toBe(true);
  });

  it.each(["started", "committed", "completed", "cancelled"])("releases ownership when the %s observer throws", phase => {
    const timeline = new SimulationActionTimeline(() => ({ success: true }));
    expect(() => {
      timeline.start("water", target, 0, command, { phaseChanged: snapshot => {
        if (snapshot.phase === phase) throw new Error("observer failure");
      } });
      if (phase === "cancelled") timeline.cancelBeforeCommit(10);
      else timeline.update(SIMULATION_ACTION_TIMINGS.water.durationMs + 1);
    }).toThrow("observer failure");
    expect(timeline.isActive).toBe(false);
  });

  it("does not complete twice when an observer reenters update", () => {
    const phases: string[] = [];
    const commit = vi.fn(() => ({ success: true }));
    const timeline = new SimulationActionTimeline(commit);
    timeline.start("water", target, 0, command, { phaseChanged: snapshot => {
      phases.push(snapshot.phase);
      if (snapshot.phase === "committed") timeline.update(2_000);
    } });
    timeline.update(2_000);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(phases).toEqual(["started", "committed", "completed"]);
  });
});
