import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MaritimeVesselConsole } from "../../src/ui/components/MaritimeVesselConsole";
import type { WorldHudBoatDto } from "../../src/simulation/core/contracts";

function boat(overrides: Partial<WorldHudBoatDto> = {}): WorldHudBoatDto {
  return {
    boatId: "boat.player_skiff",
    name: "Coastal Fishing Skiff",
    speedKnots: 0,
    seaState: "Rough",
    seaWarning: "Unsafe swell",
    showNightWarning: false,
    hull: { current: 0, maximum: 250, percent: 0, danger: true },
    fuel: { current: 90, maximum: 100, percent: 90, danger: false },
    wrecked: true,
    occupiedCargoSlots: 0,
    cargoSlots: [],
    isDocked: false,
    ...overrides
  };
}

describe("MaritimeVesselConsole wreck state", () => {
  it("shows Wrecked and the tow advisory for a hull lost at sea", () => {
    const html = renderToString(React.createElement(MaritimeVesselConsole, { boat: boat() }));
    expect(html).toContain("Wrecked");
    expect(html).toContain("Hull lost — tow to Neva Harbor for repairs");
    expect(html).toContain("hull-critical is-wrecked");
  });

  it("keeps Wrecked dominant over Docked so a berthed wreck never reads as sound", () => {
    const html = renderToString(React.createElement(
      MaritimeVesselConsole,
      { boat: boat({ isDocked: true }) }
    ));
    expect(html).toContain("Wrecked");
    expect(html).not.toContain(">Docked<");
  });

  it("still reads Docked for a sound berthed hull", () => {
    const html = renderToString(React.createElement(MaritimeVesselConsole, {
      boat: boat({
        isDocked: true,
        wrecked: false,
        hull: { current: 250, maximum: 250, percent: 100, danger: false }
      })
    }));
    expect(html).toContain(">Docked<");
    expect(html).not.toContain("Wrecked");
  });
});
