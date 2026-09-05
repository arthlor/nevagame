import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import {
  AlmanacPage,
  formatAlmanacDuration,
  waterNeedLabel
} from "../../src/ui/components/AlmanacPage";
import type { AlmanacDto } from "../../src/simulation/core/contracts";

const almanacOf = (sim: Simulation): AlmanacDto => sim.inspectAlmanac();
const render = (almanac: AlmanacDto): string =>
  renderToString(React.createElement(AlmanacPage, { almanac }));

describe("Milestone M5 — Coastal Almanac (F7.1)", () => {
  describe("simulation", () => {
    it("lists every species and crop the world contains, not only caught ones", () => {
      const sim = new Simulation();
      const almanac = almanacOf(sim);
      // An almanac that only listed your catches would be a trophy shelf.
      expect(almanac.totalFish).toBe(ContentRegistry.fishSpecies.size);
      expect(almanac.totalCrops).toBe(ContentRegistry.crops.size);
      expect(almanac.fish.length).toBe(almanac.totalFish);
    });

    it("takes species facts from the same registry the fishing systems use", () => {
      const sim = new Simulation();
      const entry = almanacOf(sim).fish.find((f) => f.speciesId === "fish.trout")!;
      const species = ContentRegistry.fishSpecies.get("fish.trout")!;
      expect(entry.weightKg).toEqual(species.weightKg);
      expect(entry.baseMarketValue).toBe(species.baseMarketValue);
      expect(entry.isSportFish).toBe(species.isSportFish);
      for (const habitat of species.habitats) {
        expect(entry.habitatsLabel.toLowerCase()).toContain(habitat.toLowerCase());
      }
    });

    it("withholds a personal record until the species has actually been met", () => {
      const sim = new Simulation();
      const before = almanacOf(sim).fish.find((f) => f.speciesId === "fish.trout")!;
      expect(before.discovered).toBe(false);
      expect(before.caughtCount).toBe(0);
      expect(before.bestWeightKg).toBeNull();

      sim.state.journal.fishRecords["fish.trout"] = {
        discovered: true,
        catchCount: 4,
        largestWeightKg: 3.6
      } as never;

      const after = almanacOf(sim).fish.find((f) => f.speciesId === "fish.trout")!;
      expect(after.discovered).toBe(true);
      expect(after.caughtCount).toBe(4);
      expect(after.bestWeightKg).toBeCloseTo(3.6, 5);
    });

    it("counts discoveries so the folio can show collection progress", () => {
      const sim = new Simulation();
      expect(almanacOf(sim).discoveredFish).toBe(0);
      sim.state.journal.fishRecords["fish.carp"] = {
        discovered: true, catchCount: 1, largestWeightKg: 1
      } as never;
      expect(almanacOf(sim).discoveredFish).toBe(1);
    });

    it("still shows where and when to look for an unrecorded species", () => {
      // The almanac is a guide, so a lead must be readable before the catch.
      const sim = new Simulation();
      const entry = almanacOf(sim).fish.find((f) => !f.discovered)!;
      expect(entry.habitatsLabel.length).toBeGreaterThan(0);
      expect(entry.seasonsLabel.length).toBeGreaterThan(0);
      expect(entry.timeWindowsLabel.length).toBeGreaterThan(0);
      expect(entry.rodClassLabel.length).toBeGreaterThan(0);
    });

    it("carries the crop's real growing requirements", () => {
      const sim = new Simulation();
      const crop = ContentRegistry.crops.get("crop.wheat")!;
      const entry = almanacOf(sim).crops.find((c) => c.cropId === "crop.wheat")!;
      expect(entry.growthMinutes).toBe(crop.baseGrowthMinutes);
      expect(entry.waterNeed).toBe(crop.waterNeed);
      expect(entry.yieldMin).toBe(crop.baseYield.min);
      expect(entry.regrows).toBe(crop.regrows);
    });

    it("never mutates state while building the almanac", () => {
      const sim = new Simulation();
      const before = JSON.stringify(sim.state.journal);
      sim.inspectAlmanac();
      sim.inspectAlmanac();
      expect(JSON.stringify(sim.state.journal)).toBe(before);
    });
  });

  describe("presentation", () => {
    it("renders both strands with their discovery progress", () => {
      const sim = new Simulation();
      const html = render(almanacOf(sim));
      expect(html).toContain('data-testid="almanac-strand-fish"');
      expect(html).toContain('data-testid="almanac-strand-crops"');
      expect(html).toContain('data-testid="almanac-fish-progress"');
    });

    it("marks unrecorded entries distinctly from landed ones", () => {
      const sim = new Simulation();
      const html = render(almanacOf(sim));
      expect(html).toContain('data-discovered="false"');
      expect(html).toContain("is-unrecorded");
      expect(html).toContain("Not yet landed");
    });

    it("shows the personal record once a species is discovered", () => {
      const sim = new Simulation();
      sim.state.journal.fishRecords["fish.carp"] = {
        discovered: true, catchCount: 7, largestWeightKg: 2.5
      } as never;
      const html = render(almanacOf(sim));
      expect(html).toContain('data-testid="almanac-personal-record"');
      expect(html).toContain("Landed 7");
      expect(html).toContain("best 2.5 kg");
    });

    it("offers a search across species, water and season", () => {
      const sim = new Simulation();
      expect(render(almanacOf(sim))).toContain('data-testid="almanac-search"');
    });

    it("reads growth time in days and hours, and bands water need", () => {
      expect(formatAlmanacDuration(2880)).toBe("2d");
      expect(formatAlmanacDuration(90)).toBe("2h");
      expect(formatAlmanacDuration(0)).toBe("—");
      expect(waterNeedLabel(70)).toBe("Thirsty");
      expect(waterNeedLabel(40)).toBe("Steady");
      expect(waterNeedLabel(10)).toBe("Hardy");
    });
  });
});
