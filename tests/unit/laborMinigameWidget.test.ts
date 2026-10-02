import { afterEach, describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { LaborMinigameWidget } from "../../src/ui/labor/LaborMinigameWidget";
import { LaborShiftResult } from "../../src/ui/labor/LaborShiftResult";
import type { LaborHudDto } from "../../src/simulation/core/contracts";
import { localeStore } from "../../src/i18n/localeStore";

function laborHud(overrides: Partial<LaborHudDto> = {}): LaborHudDto {
  return {
    active: true,
    stationId: "labor.firewood",
    stationName: "Split Kindling",
    yield: 20,
    glancingYield: 10,
    glancingMin: 0.62,
    glancingMax: 0.98,
    timingGrade: "miss",
    choresRemaining: 9,
    totalChores: 9,
    meter: 0.4,
    targetMin: 0.72,
    targetMax: 0.88,
    ...overrides
  };
}

describe("Work-shift instrument", () => {
  afterEach(() => localeStore.set("en"));
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
    expect(html).toContain("Finish chore");
    expect(html).toContain("Leave chore");
    expect(html).toContain("Near hit +10");
    expect(html).toContain("9 of 9 chores unclaimed today");
    expect(html).toContain("A miss costs no Work; try again");
    expect(html).toContain("Esc");
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
    expect(cold).toContain("Wait for the marked band");

    const hot = renderToString(
      React.createElement(LaborMinigameWidget, {
        hud: laborHud({ meter: 0.8, timingGrade: "clean" }),
        onStrike: () => {},
        onCancel: () => {}
      })
    );
    expect(hot).toContain("is-in-sweet");
    expect(hot).toContain("Strike now");
    expect(hot).toContain("80 percent — Clean strike");
  });

  it("renders the owner's grade rather than recalculating a gameplay outcome", () => {
    const html = renderToString(React.createElement(LaborMinigameWidget, {
      hud: laborHud({ meter: 0.8, timingGrade: "glancing", glancingYield: 7 }),
      onStrike: () => {}, onCancel: () => {}
    }));
    expect(html).not.toContain("is-in-sweet");
    expect(html).toContain("Almost lined up");
    expect(html).toContain("Near hit +7");
  });

  it("localizes the chore identity and instructions without the crafting-station fallback", () => {
    localeStore.set("tr");
    const html = renderToString(React.createElement(LaborMinigameWidget, {
      hud: laborHud({ stationId: "labor.pinewatch_timber", stationName: "Stack Pinewatch Timber" }),
      onStrike: () => {}, onCancel: () => {}
    }));
    expect(html).toContain("Çamlıgöz");
    expect(html).toContain("İşi bitir");
    expect(html).toContain("Yakın isabet +10");
    expect(html).not.toContain("Zanaat İstasyonu");
    expect(html).not.toContain("labor.stations");
  });

  it("reports the simulation strike grade and granted Work", () => {
    const clean = renderToString(
      React.createElement(LaborShiftResult, {
        feedback: { token: 1, outcome: "clean", granted: 20, claimed: true, choresRemaining: 8, totalChores: 9 }
      })
    );
    expect(clean).toContain("Clean strike");
    expect(clean).toContain("+20 Work");
    expect(clean).toContain('data-outcome="clean"');
    expect(clean).toContain("Done for today · returns at midnight");
    expect(clean).toContain("8 of 9 chores unclaimed today");

    const glancing = renderToString(
      React.createElement(LaborShiftResult, {
        feedback: { token: 2, outcome: "glancing", granted: 10, claimed: true, choresRemaining: 8, totalChores: 9 }
      })
    );
    expect(glancing).toContain("Glancing blow");
    expect(glancing).toContain("+10 Work");

    const miss = renderToString(
      React.createElement(LaborShiftResult, {
        feedback: { token: 3, outcome: "miss", granted: 0, reason: "The strike glanced off", claimed: false, choresRemaining: 9, totalChores: 9 }
      })
    );
    expect(miss).toContain("Missed");
    expect(miss).toContain("The strike glanced off");
    expect(miss).not.toContain("Work</strong>");
    expect(miss).toContain("No Work spent · try again");
  });
});
