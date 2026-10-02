import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { StormHelmWidget } from "../../src/ui/boats/StormHelmWidget";
import type { StormHelmHudDto } from "../../src/simulation/core/contracts";

function hud(overrides: Partial<StormHelmHudDto> = {}): StormHelmHudDto {
  return {
    active: true,
    boatId: "boat.player_skiff",
    phase: "gust",
    heel: 0.2,
    heelSafeHalfWidth: 0.6,
    gustStrength: 0.6,
    remainingSeconds: 3.4,
    hullLives: 4,
    maxLives: 5,
    consecutiveFails: 1,
    lastResult: null,
    failReason: null,
    wrecked: false,
    ...overrides
  };
}

describe("StormHelmWidget", () => {
  it("draws the heel needle, safe band and hull lives straight from the DTO", () => {
    const html = renderToString(React.createElement(StormHelmWidget, { hud: hud() }));
    expect(html).toContain('data-testid="storm-helm"');
    expect(html).toContain("storm-helm__needle");
    expect(html).toContain("storm-helm__safe");
    expect(html).toContain("4/5");
    expect(html).toContain("3.4s");
    expect(html).toContain("1 missed in a row");
    // A heel inside the band reads as steady rather than straining.
    expect(html).toContain("Hold course");
  });

  it("reports an out-of-band heel as straining with the corrective instruction", () => {
    const html = renderToString(React.createElement(StormHelmWidget, { hud: hud({ heel: -0.82 }) }));
    expect(html).toContain("is-straining");
    expect(html).toContain("Steer into the wind");
  });

  it("keeps a failed gust's reason alive for its short result plaque", () => {
    const html = renderToString(React.createElement(StormHelmWidget, {
      hud: hud({
        phase: "result",
        lastResult: "failed",
        failReason: "broach",
        heel: -1,
        consecutiveFails: 2
      })
    }));
    expect(html).toContain("is-hit");
    expect(html).toContain("Turned broadside · hull hit");
  });

  it("tells a wrecked captain to signal a tow", () => {
    const html = renderToString(React.createElement(StormHelmWidget, {
      hud: hud({
        phase: "result",
        wrecked: true,
        hullLives: 0,
        lastResult: "failed",
        failReason: "sustained"
      })
    }));
    expect(html).toContain("Hull lost");
    expect(html).toContain("0/5");
    expect(html).toContain("Request a tow to Neva Harbor");
  });
});
