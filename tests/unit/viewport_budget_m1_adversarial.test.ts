import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { buildWorldHudDto } from "../../src/simulation/presentation/WorldHudPresentation";
import { PlayerUnitFrame } from "../../src/ui/hud/PlayerUnitFrame";
import { MicroMenuPurseBar, TidebookPurse } from "../../src/ui/hud/MicroMenuPurseBar";

describe("HUD component rendering under large content loads", () => {
  it("retains all four status chips and the accessible player profile", () => {
    const hud = buildWorldHudDto(createInitialGameState());
    const html = renderToString(
      React.createElement(PlayerUnitFrame, {
        work: hud.work,
        sprint: hud.sprint,
        statusEffects: [
          { id: "overburdened", type: "debuff", label: "Overburdened", icon: "satchel", description: "Heavy pack" },
          { id: "well-rested", type: "buff", label: "Well Rested", icon: "sun", description: "+10% work" },
          { id: "rain-soaked", type: "debuff", label: "Rain Soaked", icon: "rain", description: "Slower sprint" },
          { id: "night-chill", type: "warning", label: "Night Chill", icon: "moon", description: "Cold winds" }
        ]
      })
    );
    expect(html).toContain('aria-label="Player profile and crest"');
    expect(html).toContain('aria-label="Active status effects"');
    expect(html.match(/data-testid="status-chip-[^"]+"/g)).toHaveLength(4);
    for (const id of ["overburdened", "well-rested", "rain-soaked", "night-chill"]) {
      expect(html).toContain(`data-testid="status-chip-${id}"`);
    }
  });

  it("renders large currency through the purse and full capacities through utility controls", () => {
    const purse = renderToString(React.createElement(TidebookPurse, { money: 999999 })).replace(/<!--.*?-->/g, "");
    const utilities = renderToString(
      React.createElement(MicroMenuPurseBar, {
        money: 999999,
        capacity: { satchelUsed: 20, satchelMax: 20, cargoUsed: 1, cargoMax: 1 },
        expeditionUnlocked: true,
        onOpenModal: () => {}
      })
    ).replace(/<!--.*?-->/g, "");
    expect(purse).toContain('aria-label="Purse: 999,999 gold"');
    expect(purse).toContain("999,999 G");
    expect(utilities).toContain('data-testid="satchel-capacity-badge">20/20');
    expect(utilities).toContain('data-testid="cargo-capacity-badge">1/1');
    expect(utilities.match(/<button[^>]*data-testid="micro-btn-satchel"[^>]*>/)?.[0]).toContain("is-full");
    for (const label of ["Open satchel inventory", "Open field journal and quests", "Open nautical chart", "Open game menu (Esc)"]) {
      expect(utilities).toContain(`aria-label="${label}"`);
    }
  });
});
