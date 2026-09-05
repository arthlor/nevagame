import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { WorldMapModal } from "../../src/ui/components/WorldMapModal";
import type { FishSchoolId } from "../../src/simulation/core/types";

function addSchool(
  sim: Simulation,
  id: string,
  over: Partial<{ x: number; z: number; expiresAtMinute: number; feedingFrenzyUntilMinute: number }> = {}
): void {
  sim.state.world.activeSchools[id as FishSchoolId] = {
    id,
    ecologyId: "ecology.neva",
    habitatId: "habitat.coast",
    x: over.x ?? 40,
    z: over.z ?? 30,
    radius: 12,
    spawnedAtMinute: 0,
    expiresAtMinute: over.expiresAtMinute ?? sim.state.clock.currentMinute + 90,
    remainingCatchPotential: 5,
    ...(over.feedingFrenzyUntilMinute !== undefined
      ? { feedingFrenzyUntilMinute: over.feedingFrenzyUntilMinute }
      : {})
  } as never;
}

const render = (sim: Simulation): string =>
  renderToString(
    React.createElement(WorldMapModal, {
      map: sim.inspectWorldMap(),
      onInspectMarketDemand: () => ({ success: false, marketId: "market.village", reason: "n/a" }),
      onClose: () => {}
    } as React.ComponentProps<typeof WorldMapModal>)
  );

describe("Milestone M5 — Live fishing schools on the chart (F7.2)", () => {
  describe("simulation", () => {
    it("reports no schools on a quiet coast", () => {
      const sim = new Simulation();
      sim.state.world.activeSchools = {} as never;
      expect(sim.inspectWorldMap().activeSchools).toEqual([]);
    });

    it("publishes a working school with its position, water and time left", () => {
      const sim = new Simulation();
      sim.state.world.activeSchools = {} as never;
      addSchool(sim, "school.a", { expiresAtMinute: sim.state.clock.currentMinute + 45 });

      const [school] = sim.inspectWorldMap().activeSchools;
      expect(school.schoolId).toBe("school.a");
      expect(school.x).toBe(40);
      expect(school.minutesRemaining).toBe(45);
      expect(school.waterLabel).toBe("Coast");
      expect(school.feeding).toBe(false);
    });

    it("drops an expired school rather than showing a stale mark", () => {
      // Sailing to a school that has already broken up is a wasted trip.
      const sim = new Simulation();
      sim.state.world.activeSchools = {} as never;
      addSchool(sim, "school.gone", { expiresAtMinute: sim.state.clock.currentMinute - 1 });
      expect(sim.inspectWorldMap().activeSchools).toEqual([]);
    });

    it("flags a feeding frenzy separately from an ordinary school", () => {
      const sim = new Simulation();
      sim.state.world.activeSchools = {} as never;
      addSchool(sim, "school.calm");
      addSchool(sim, "school.frenzy", {
        x: 60,
        feedingFrenzyUntilMinute: sim.state.clock.currentMinute + 10
      });
      const schools = sim.inspectWorldMap().activeSchools;
      expect(schools.find((s) => s.schoolId === "school.calm")!.feeding).toBe(false);
      expect(schools.find((s) => s.schoolId === "school.frenzy")!.feeding).toBe(true);
    });

    it("orders schools nearest first so the closest run reads first", () => {
      const sim = new Simulation();
      sim.state.world.activeSchools = {} as never;
      Object.assign(sim.state.player, { x: 0, z: 0 });
      addSchool(sim, "school.far", { x: 300, z: 300 });
      addSchool(sim, "school.near", { x: 10, z: 10 });

      const schools = sim.inspectWorldMap().activeSchools;
      expect(schools[0].schoolId).toBe("school.near");
      expect(schools[0].distanceMeters).toBeLessThan(schools[1].distanceMeters);
    });

    it("never mutates world state while reading the chart", () => {
      const sim = new Simulation();
      addSchool(sim, "school.a");
      const before = JSON.stringify(sim.state.world.activeSchools);
      sim.inspectWorldMap();
      expect(JSON.stringify(sim.state.world.activeSchools)).toBe(before);
    });
  });

  describe("presentation", () => {
    it("draws a mark per working school", () => {
      const sim = new Simulation();
      sim.state.world.activeSchools = {} as never;
      addSchool(sim, "school.a");
      addSchool(sim, "school.b", { x: 80 });
      const html = render(sim);
      expect(html).toContain('data-testid="map-school-layer"');
      expect((html.match(/data-testid="map-school"/g) ?? []).length).toBe(2);
    });

    it("distinguishes a feeding school on the chart", () => {
      const sim = new Simulation();
      sim.state.world.activeSchools = {} as never;
      addSchool(sim, "school.frenzy", {
        feedingFrenzyUntilMinute: sim.state.clock.currentMinute + 10
      });
      const html = render(sim);
      expect(html).toContain('data-feeding="true"');
      expect(html).toContain("is-feeding");
    });

    it("tallies the schools and the nearest run in the chart header", () => {
      const sim = new Simulation();
      sim.state.world.activeSchools = {} as never;
      Object.assign(sim.state.player, { x: 0, z: 0 });
      addSchool(sim, "school.a", { x: 30, z: 40 });
      const html = render(sim);
      expect(html).toContain('data-testid="map-school-tally"');
      expect(html).toContain("1 school working");
      expect(html).toContain("nearest 50 m");
    });

    it("omits the tally entirely when no school is working", () => {
      const sim = new Simulation();
      sim.state.world.activeSchools = {} as never;
      expect(render(sim)).not.toContain('data-testid="map-school-tally"');
    });
  });
});
