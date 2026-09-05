import { describe, expect, it } from "vitest";

import {
  NPC_STATION_BEAT_RADIUS_METERS,
  NPC_STATION_BEATS,
  advanceNpcStationBeat,
  createNpcStationBeatState,
  assertNpcStationBeatRadius,
  sampleNpcStationBeat
} from "../../src/render/scene/npcStationBeat";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { WorldLayout } from "../../src/world/WorldLayout";

const TALK_RADIUS_METERS = 3.5;

describe("npcStationBeat", () => {
  it("pauses dialogue in place and resumes without replaying elapsed wall time", () => {
    const spec = NPC_STATION_BEATS["npc.elspeth"];
    const state = createNpcStationBeatState();
    const before = advanceNpcStationBeat(spec, state, 0.25, false, () => true);
    const paused = advanceNpcStationBeat(spec, state, 30, true, () => true);
    expect(paused).toEqual({ ...before, walking: false });
    expect(state.elapsedSeconds).toBe(0.25);
    const resumed = advanceNpcStationBeat(spec, state, 1 / 60, false, () => true);
    expect(Math.hypot(resumed.dx - before.dx, resumed.dz - before.dz)).toBeLessThanOrEqual(spec.walkSpeedMetersPerSecond / 60 + 1e-8);
  });

  it("retains the last supported pose instead of returning to the station anchor", () => {
    const spec = NPC_STATION_BEATS["npc.elspeth"];
    const state = createNpcStationBeatState();
    const before = advanceNpcStationBeat(spec, state, 0.2, false, () => true);
    const blocked = advanceNpcStationBeat(spec, state, 0.2, false, () => false);
    expect(blocked).toEqual({ ...before, walking: false });
    expect(state.elapsedSeconds).toBe(0.2);
    expect(before.dx).toBeGreaterThan(0);
  });

  it("checks intermediate path support even when a long frame returns near its start", () => {
    const state = createNpcStationBeatState();
    const spec = { waypoints: [{ dx: 0, dz: 0 }, { dx: 1, dz: 0 }], pauseSeconds: 0, walkSpeedMetersPerSecond: 1 };
    const result = advanceNpcStationBeat(spec, state, 2, false, (x) => x < 0.5);
    expect(result.dx).toBe(0);
    expect(state.elapsedSeconds).toBe(0);
  });
  it("keeps every authored waypoint inside the station radius and far inside talk range", () => {
    expect(NPC_STATION_BEAT_RADIUS_METERS).toBeLessThan(TALK_RADIUS_METERS);
    for (const [npcId, spec] of Object.entries(NPC_STATION_BEATS)) {
      expect(spec.waypoints.length, npcId).toBeGreaterThanOrEqual(2);
      expect(spec.waypoints.length, npcId).toBeLessThanOrEqual(3);
      expect(() => assertNpcStationBeatRadius(spec)).not.toThrow();
      for (const waypoint of spec.waypoints) {
        expect(Math.hypot(waypoint.dx, waypoint.dz), npcId).toBeLessThanOrEqual(
          NPC_STATION_BEAT_RADIUS_METERS + 1e-6
        );
      }
    }
  });

  it("loops walk-then-pause without leaving the station disk", () => {
    for (const spec of Object.values(NPC_STATION_BEATS)) {
      const samples: Array<ReturnType<typeof sampleNpcStationBeat>> = [];
      for (let step = 0; step < 240; step += 1) {
        const sample = sampleNpcStationBeat(spec, step * 0.25);
        expect(Math.hypot(sample.dx, sample.dz)).toBeLessThanOrEqual(
          NPC_STATION_BEAT_RADIUS_METERS + 1e-6
        );
        expect(Number.isFinite(sample.heading)).toBe(true);
        samples.push(sample);
      }
      expect(samples.some((sample) => sample.walking)).toBe(true);
      expect(samples.some((sample) => !sample.walking)).toBe(true);
      expect(sampleNpcStationBeat(spec, 0)).toEqual(sampleNpcStationBeat(spec, 0));
    }
  });

  it("keeps authored station waypoints on canonical walkable support", () => {
    const minimumGroundNormalY = Math.cos((38 * Math.PI) / 180);
    for (const [npcId, spec] of Object.entries(NPC_STATION_BEATS)) {
      const npc = ContentRegistry.npcs.get(npcId);
      expect(npc, npcId).toBeDefined();
      for (const waypoint of spec.waypoints) {
        const x = npc!.anchor.x + waypoint.dx;
        const z = npc!.anchor.z + waypoint.dz;
        const surface = WorldLayout.traversalSurfaceSample(x, z);
        expect(WorldLayout.isWalkable(x, z), npcId).toBe(true);
        expect(WorldLayout.isWater(x, z), npcId).toBe(false);
        expect(surface.normal.y, npcId).toBeGreaterThanOrEqual(minimumGroundNormalY);
        expect(surface.height).toBeCloseTo(WorldLayout.traversalSurfaceHeight(x, z), 8);
      }
    }
  });
});
