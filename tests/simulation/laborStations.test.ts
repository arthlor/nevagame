import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { LABOR_STATIONS, type LaborStationDefinition } from "../../src/simulation/labor/LaborStations";
import type { LaborHudDto, LaborStationDto } from "../../src/simulation/core/contracts";
import { collisionPolishProxies } from "../../src/persistence/migrateCollisionPolish76";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { INTERACTION_PLACEMENTS } from "../../src/world/InteractionPlacements";
import { WorldLayout } from "../../src/world/WorldLayout";
import { t } from "../../src/i18n/i18n";

function standAt(sim: Simulation, station: LaborStationDefinition): void {
  sim.state.player.x = station.position.x;
  sim.state.player.z = station.position.z;
  sim.state.player.y = WorldLayout.traversalSurfaceHeight(station.position.x, station.position.z) + 0.5;
}

describe("contextual daily chores", () => {
  it("offers nine distinct stations beside existing visible props with clear standing space", () => {
    const sim = new Simulation();
    const placements = createWorldStaticPlacements(sim.state.worldSeed);
    const boxes = collisionPolishProxies(sim.state);
    const stations = Object.values(LABOR_STATIONS);
    expect(stations).toHaveLength(9);
    expect(new Set(stations.map(station => station.placementId)).size).toBe(9);
    for (const station of stations) {
      const prop = placements.find(placement => placement.id === station.placementId);
      expect(prop, station.id).toBeDefined();
      expect(INTERACTION_PLACEMENTS[station.placementId], station.id).toBeDefined();
      expect(Math.hypot(prop!.x - station.position.x, prop!.z - station.position.z), station.id).toBeLessThanOrEqual(2);
      expect(WorldLayout.isWalkable(station.position.x, station.position.z), station.id).toBe(true);
      const ground = WorldLayout.traversalSurfaceHeight(station.position.x, station.position.z);
      expect(staticPoseIsClear(boxes, station.position, ground, 0.4), station.id).toBe(true);
      for (const locale of ["en", "tr"] as const) {
        const key = `labor.stations.${station.id.slice(6)}`;
        expect(t(`${key}.title`, undefined, locale), `${station.id} ${locale}`).not.toContain("labor.stations");
        expect(t(`${key}.prompt`, undefined, locale), `${station.id} ${locale}`).not.toContain("labor.stations");
      }
    }
  });

  it("grants each chore once, retains the daily claim across reload, and resets at midnight", () => {
    let sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    const stations = Object.values(LABOR_STATIONS);
    for (const [index, station] of stations.entries()) {
      standAt(sim, station);
      expect(sim.execute({ type: "labor.start", stationId: station.id }).success, station.id).toBe(true);
      sim.tick(0.8 / station.meterSpeed);
      expect((sim.query({ type: "labor.get-hud" }) as LaborHudDto).timingGrade, station.id).toBe("clean");
      expect(sim.execute({ type: "labor.strike" }), station.id).toMatchObject({ success: true, yield: station.yield, grade: "clean" });
      expect((sim.query({ type: "labor.get-hud" }) as LaborHudDto).choresRemaining).toBe(8 - index);
      expect(sim.execute({ type: "labor.start", stationId: station.id }), station.id).toMatchObject({ success: false });
    }
    expect(sim.state.player.workCapacity.current).toBe(180);
    sim = new Simulation(JSON.parse(JSON.stringify(sim.state)));
    expect((sim.query({ type: "labor.get-stations" }) as LaborStationDto[]).every(station => station.used)).toBe(true);
    sim.setDebugMinute(1440);
    expect((sim.query({ type: "labor.get-hud" }) as LaborHudDto).choresRemaining).toBe(9);
    expect((sim.query({ type: "labor.get-stations" }) as LaborStationDto[]).every(station => !station.used)).toBe(true);
  });

  it("shows the same near-hit reward that the command grants, and leaves misses and cancellation unclaimed", () => {
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    const station = LABOR_STATIONS["labor.baskets"];
    standAt(sim, station);
    sim.execute({ type: "labor.start", stationId: station.id });
    expect(sim.execute({ type: "labor.strike" }).success).toBe(false);
    expect(sim.progression.hasWorkedLaborStation(station.id)).toBe(false);
    sim.execute({ type: "labor.start", stationId: station.id });
    sim.execute({ type: "labor.cancel" });
    expect(sim.progression.hasWorkedLaborStation(station.id)).toBe(false);
    sim.execute({ type: "labor.start", stationId: station.id });
    sim.tick(0.66 / station.meterSpeed);
    const hud = sim.query({ type: "labor.get-hud" }) as LaborHudDto;
    expect(hud.timingGrade).toBe("glancing");
    expect(sim.execute({ type: "labor.strike" })).toMatchObject({ success: true, yield: hud.glancingYield, grade: "glancing" });
    expect(sim.progression.hasWorkedLaborStation(station.id)).toBe(true);
  });
});
