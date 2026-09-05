import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { LegacyHUD as HUD } from "./uiTestHelpers";
import type { CargoClass, FishCargoId } from "../../src/simulation/core/types";

function carry(sim: Simulation, cargoClass: CargoClass): void {
  const id = "cargo.carried" as FishCargoId;
  sim.state.fishCargo[id] = {
    id, speciesId: "fish.trout", weightKg: 4.2, quality: "fine",
    caughtAtMinute: 0, freshness: 88, cargoClass, location: { type: "player" }
  } as never;
  sim.state.player.carriedFishCargoId = id;
}

const render = (sim: Simulation): string =>
  renderToString(React.createElement(HUD, { state: sim.state, promptText: null }));

describe("Milestone M4 — Physical trade packs (R6.3)", () => {
  it("shows no pack treatment when the player carries nothing", () => {
    const sim = new Simulation();
    sim.state.player.carriedFishCargoId = null;
    expect(render(sim)).not.toContain('data-testid="carried-trade-pack"');
  });

  it("marks a carried catch as a physical pack, distinct from stackable goods", () => {
    const sim = new Simulation();
    carry(sim, "medium");
    const html = render(sim);
    expect(html).toContain('data-testid="carried-trade-pack"');
    expect(html).toContain("is-physical-pack");
    expect(html).toContain('data-cargo-class="medium"');
  });

  it("bands the treatment by cargo class so weight reads at a glance", () => {
    for (const cargoClass of ["small", "medium", "large", "gargantuan"] as CargoClass[]) {
      const sim = new Simulation();
      carry(sim, cargoClass);
      expect(render(sim)).toContain(`pack-${cargoClass}`);
    }
  });

  it("puts the movement cost on the pack itself", () => {
    const sim = new Simulation();
    carry(sim, "large");
    const html = render(sim);
    expect(html).toContain('data-testid="carried-pack-penalty"');
    expect(html).toMatch(/▼ \d+% speed/);
  });

  it("gives heavier packs a warmer border than light ones", () => {
    const css = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/ui/hud.css"),
      "utf8"
    );
    expect(css).toMatch(/\.hud-cargo-note\.is-physical-pack \{[^}]*border-left:/);
    expect(css).toMatch(/\.hud-cargo-note\.pack-large \{ border-left-color: #fbbf24; \}/);
    expect(css).toMatch(/\.hud-cargo-note\.pack-gargantuan \{ border-left-color: #f87171; \}/);
  });

  it("renders the HUD without mutating simulation state", () => {
    const sim = new Simulation();
    carry(sim, "gargantuan");
    const before = JSON.stringify(sim.state);
    render(sim);
    expect(JSON.stringify(sim.state)).toBe(before);
  });
});
