import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { LogisticsLedgerModal } from "../../src/ui/components/LogisticsLedgerModal";
import type { HoldStoresDto } from "../../src/simulation/core/contracts";

const stores: HoldStoresDto = {
  satchel: { occupiedSlots: 3, totalSlots: 16 },
  vesselHolds: { occupiedSlots: 1, totalSlots: 4 },
  carriedCatch: null,
  supplies: [{ itemId: "item.bait_worms", name: "Bait Worms", count: 6 } as never],
  satchelStock: [
    { itemId: "item.bait_worms", name: "Bait Worms", count: 6 },
    { itemId: "item.basic_fertilizer", name: "Basic Fertilizer", count: 2 }
  ] as never,
  vessels: [
    {
      boatId: "boat.player_rowboat",
      name: "Rowboat",
      statusLabel: "Docked",
      hull: { current: 90, maximum: 100, percent: 90 },
      occupiedSlots: 0,
      cargoSlots: [{ slotNumber: 1, cargo: null }],
      stock: [{ itemId: "item.boat_fuel", name: "Fuel Can", count: 3 }]
    }
  ] as never
};

const render = (over: Partial<React.ComponentProps<typeof LogisticsLedgerModal>> = {}): string =>
  renderToString(
    React.createElement(LogisticsLedgerModal, { stores, onClose: () => {}, ...over })
  );

describe("Milestone M4 — Hold & Stores transfer (R6.2)", () => {
  it("stays read-only when the host offers no transfer handler", () => {
    const html = render();
    expect(html).not.toContain("ledger-transfer-");
    // The existing read-only ledger content must still be there.
    expect(html).toContain("Hold &amp; Stores");
    expect(html).toContain("Rowboat");
  });

  it("renders both stores as transfer columns when transfers are available", () => {
    const html = render({ onTransfer: () => ({ success: true }) });
    expect(html).toContain('data-testid="ledger-transfer-boat.player_rowboat"');
    expect(html).toContain("Satchel");
    expect(html).toContain("Rowboat stores");
  });

  it("gives every satchel row a stow control and every hold row a take control", () => {
    const html = render({ onTransfer: () => ({ success: true }) });
    expect(html).toContain('data-testid="stow-boat.player_rowboat-item.bait_worms"');
    expect(html).toContain('data-testid="stow-boat.player_rowboat-item.basic_fertilizer"');
    expect(html).toContain('data-testid="take-boat.player_rowboat-item.boat_fuel"');
  });

  it("says how much a single press will move, before it is pressed", () => {
    const html = render({ onTransfer: () => ({ success: true }) });
    expect(html).toContain('aria-label="Stow 6 Bait Worms"');
    expect(html).toContain('aria-label="Take 3 Fuel Can"');
  });

  it("names an empty store instead of rendering a bare column", () => {
    const html = render({
      onTransfer: () => ({ success: true }),
      stores: { ...stores, satchelStock: [] as never }
    });
    expect(html).toContain("Nothing stackable in the satchel.");
  });

  it("stacks the two stores below the docking width rather than squeezing them", () => {
    const css = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/ui/modals.css"),
      "utf8"
    );
    const block = css.slice(css.indexOf(".ledger-transfer {"));
    expect(block).toMatch(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(max-width: 1023px\) \{\s*\/\*[\s\S]*?\*\/\s*\.ledger-transfer \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
});
