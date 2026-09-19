import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { LaborMinigameWidget } from "../../src/ui/labor/LaborMinigameWidget";
import { LaborShiftResult } from "../../src/ui/labor/LaborShiftResult";
import type { LaborHudDto } from "../../src/simulation/core/contracts";

function laborHud(overrides: Partial<LaborHudDto> = {}): LaborHudDto {
  return {
    active: true,
    stationId: "labor.firewood",
    stationName: "Split Kindling",
    yield: 20,
    meter: 0.4,
    targetMin: 0.72,
    targetMax: 0.88,
    ...overrides
  };
}

describe("Work-shift instrument", () => {
  it("shows the station, reward preview, sweet-spot band and both commands", () => {
    const html = renderToString(
      React.createElement(LaborMinigameWidget, {
        hud: laborHud(),
        onStrike: () => {},
        onCancel: () => {}
      })
    );
    expect(html).toContain('data-testid="labor-minigame"');
    expect(html).toContain("Split Kindling");
    expect(html).toContain('data-testid="labor-shift-reward"');
    expect(html).toContain("+20 Work");
    expect(html).toContain("labor-shift__sweet");
    expect(html).toContain("left:72%");
    expect(html).toContain("width:16%");
    expect(html).toContain("Strike");
    expect(html).toContain("Stop");
    expect(html).toContain("chrome-keycap");
  });

  it("lights the hot state only while the needle is inside the band", () => {
    const cold = renderToString(
      React.createElement(LaborMinigameWidget, {
        hud: laborHud({ meter: 0.5 }),
        onStrike: () => {},
        onCancel: () => {}
      })
    );
    expect(cold).not.toContain("is-in-sweet");
    expect(cold).toContain("Line up the swing");

    const hot = renderToString(
      React.createElement(LaborMinigameWidget, {
        hud: laborHud({ meter: 0.8 }),
        onStrike: () => {},
        onCancel: () => {}
      })
    );
    expect(hot).toContain("is-in-sweet");
    expect(hot).toContain("In the sweet spot");
    expect(hot).toContain("in the sweet spot");
  });

  it("reports the simulation strike grade and granted Work", () => {
    const clean = renderToString(
      React.createElement(LaborShiftResult, {
        feedback: { token: 1, outcome: "clean", granted: 20 }
      })
    );
    expect(clean).toContain("Clean strike");
    expect(clean).toContain("+20 Work");
    expect(clean).toContain('data-outcome="clean"');

    const glancing = renderToString(
      React.createElement(LaborShiftResult, {
        feedback: { token: 2, outcome: "glancing", granted: 10 }
      })
    );
    expect(glancing).toContain("Glancing blow");
    expect(glancing).toContain("+10 Work");

    const miss = renderToString(
      React.createElement(LaborShiftResult, {
        feedback: { token: 3, outcome: "miss", granted: 0, reason: "The strike glanced off" }
      })
    );
    expect(miss).toContain("Missed");
    expect(miss).toContain("The strike glanced off");
    expect(miss).not.toContain("Work</strong>");
  });
});
