import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { EscapeMenuModal } from "../../src/ui/EscapeMenuModal";
import { Simulation } from "../../src/simulation/Simulation";

const pause = (sim: Simulation) => sim.inspectPauseSummary();

const render = (
  sim: Simulation,
  over: Partial<React.ComponentProps<typeof EscapeMenuModal>> = {}
): string =>
  renderToString(
    React.createElement(EscapeMenuModal, {
      pause: pause(sim),
      onClose: () => {},
      onQuickSave: () => {},
      onResetPlayerToSafePlace: () => {},
      ...over
    } as React.ComponentProps<typeof EscapeMenuModal>)
  );

describe("Milestone M5 — Pause menu recovery actions (F8.1)", () => {
  it("offers Safe Return as before", () => {
    const sim = new Simulation();
    expect(render(sim)).toContain("Safe Return");
  });

  it("hides the tow action when the host cannot arrange one", () => {
    const sim = new Simulation();
    expect(render(sim)).not.toContain('data-testid="pause-emergency-tow"');
  });

  it("offers Emergency Tow when a tow handler is supplied", () => {
    // A stranded player often cannot walk to the boat, so the menu is the only
    // reliable way to reach the tow the simulation already supports.
    const sim = new Simulation();
    const html = render(sim, { onEmergencyTow: () => ({ success: true }) });
    expect(html).toContain('data-testid="pause-emergency-tow"');
    expect(html).toContain("Emergency Tow");
  });

  it("reports the autosave state on the harbor log line", () => {
    const sim = new Simulation();
    const html = render(sim);
    expect(html).toContain("Harbor log");
    expect(html).toMatch(/Last saved|Not saved yet|not being saved/);
  });
});

describe("Milestone M5 — Emergency tow reaches the simulation", () => {
  it("is exposed as a command the pause menu can call", () => {
    const sim = new Simulation();
    const result = sim.execute({ type: "boat.emergency-tow" });
    // Success depends on world state; what matters is that it is answerable
    // and never throws, so the menu can always report an outcome.
    expect(typeof result.success).toBe("boolean");
    if (!result.success) expect(typeof result.reason).toBe("string");
  });

  it("leaves state untouched when the tow is refused", () => {
    const sim = new Simulation();
    const before = JSON.stringify(sim.state.boats);
    const result = sim.execute({ type: "boat.emergency-tow" });
    if (!result.success) {
      expect(JSON.stringify(sim.state.boats)).toBe(before);
    }
  });
});
