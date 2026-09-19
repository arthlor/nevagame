import { describe, it, expect } from "vitest";
import { GameClock } from "../../src/simulation/core/GameClock";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { WorldLayout } from "../../src/world/WorldLayout";
import {
  AMBIENT_TOWNSFOLK_ROUTES,
  sampleAmbientTownsfolkPose
} from "../../src/render/scene/ambientTownsfolk";
import { HARBOR_DOCK, VILLAGE_MARKET, HARBOR_MARKET } from "../../src/world/WorldAnchors";
import { WORLD_ARCHITECTURE_PADS } from "../../src/world/WorldLayout";
import { WORLD_STATION_DEFINITIONS } from "../../src/world/WorldGameplayLocations";
import { FARMHOUSE_OUTSIDE_DOOR } from "../../src/world/FarmhouseInterior";
import { MAINLAND_VILLAGES } from "../../src/world/NevaMainland";

const PHASES = [4, 8, 18, 22];
const MAX_WALKABLE_SLOPE_NORMAL_Y = Math.cos((38 * Math.PI) / 180);

function posesAcrossLoop(route: (typeof AMBIENT_TOWNSFOLK_ROUTES)[number], timeOfDay: string) {
  const clock = { timeOfDay } as Parameters<typeof sampleAmbientTownsfolkPose>[1];
  return Array.from({ length: 48 }, (_, step) =>
    sampleAmbientTownsfolkPose(route, clock, (step / 48) * route.loopSeconds)
  );
}

describe("ambient townsfolk", () => {
  it("is presentation only — never registered as an NPC", () => {
    for (const route of AMBIENT_TOWNSFOLK_ROUTES) {
      // Membership of this registry is what grants an interaction prompt,
      // dialogue, quest coupling, barks and telemetry. Staying out of it is
      // the entire opt-out.
      expect(ContentRegistry.npcs.has(route.id), route.id).toBe(false);
    }
  });

  it("keeps every step of every route on supported walkable ground", () => {
    for (const hour of PHASES) {
      const timeOfDay = new GameClock({ currentMinute: hour * 60 }).getState().timeOfDay;
      for (const route of AMBIENT_TOWNSFOLK_ROUTES) {
        for (const pose of posesAcrossLoop(route, timeOfDay)) {
          const label = `${route.id}/${timeOfDay}/${pose.x.toFixed(1)},${pose.z.toFixed(1)}`;
          expect(WorldLayout.isWalkable(pose.x, pose.z), label).toBe(true);
          expect(WorldLayout.isWater(pose.x, pose.z), label).toBe(false);
          expect(WorldLayout.isInterior(pose.x, pose.z), label).toBe(false);
          expect(
            WorldLayout.traversalSurfaceSample(pose.x, pose.z).normal.y,
            label
          ).toBeGreaterThanOrEqual(MAX_WALKABLE_SLOPE_NORMAL_Y);
        }
      }
    }
  });

  it("never stands in a doorway, on a market counter, at a workstation or on the dock boarding point", () => {
    const keepOut: Array<{ label: string; x: number; z: number; radius: number }> = [
      { label: "harbor boarding point", ...HARBOR_DOCK.playerPosition, radius: HARBOR_DOCK.boardRadius },
      { label: "village market", ...VILLAGE_MARKET.position, radius: VILLAGE_MARKET.radiusMeters },
      { label: "harbor market", ...HARBOR_MARKET.position, radius: HARBOR_MARKET.radiusMeters },
      {
        label: "farmhouse door",
        x: FARMHOUSE_OUTSIDE_DOOR.x,
        z: FARMHOUSE_OUTSIDE_DOOR.z,
        radius: FARMHOUSE_OUTSIDE_DOOR.radiusMeters
      },
      ...Object.entries(WORLD_STATION_DEFINITIONS).map(([id, station]) => ({
        label: `station ${id}`,
        x: station.position.x,
        z: station.position.z,
        radius: station.approachDistanceMeters ?? 1.5
      })),
      ...WORLD_ARCHITECTURE_PADS.map((pad) => ({
        label: `building ${pad.id}`,
        x: pad.center.x,
        z: pad.center.z,
        radius: Math.max(pad.envelope[0], pad.envelope[1])
      }))
    ];

    for (const hour of PHASES) {
      const timeOfDay = new GameClock({ currentMinute: hour * 60 }).getState().timeOfDay;
      for (const route of AMBIENT_TOWNSFOLK_ROUTES) {
        for (const pose of posesAcrossLoop(route, timeOfDay)) {
          for (const zone of keepOut) {
            expect(
              Math.hypot(pose.x - zone.x, pose.z - zone.z),
              `${route.id}/${timeOfDay} inside ${zone.label}`
            ).toBeGreaterThan(zone.radius);
          }
        }
      }
    }
  });

  it("is deterministic and freezes under reduced motion", () => {
    const clock = { timeOfDay: "day" } as Parameters<typeof sampleAmbientTownsfolkPose>[1];
    for (const route of AMBIENT_TOWNSFOLK_ROUTES) {
      expect(sampleAmbientTownsfolkPose(route, clock, 12.5))
        .toEqual(sampleAmbientTownsfolkPose(route, clock, 12.5));
      const still = sampleAmbientTownsfolkPose(route, clock, 12.5, 0);
      expect(still.walking).toBe(false);
      expect(still).toEqual(sampleAmbientTownsfolkPose(route, clock, 999, 0));
    }
  });

  it("puts people where the player actually spends time", () => {
    const clock = { timeOfDay: "day" } as Parameters<typeof sampleAmbientTownsfolkPose>[1];
    const near = (x: number, z: number, radius: number) =>
      AMBIENT_TOWNSFOLK_ROUTES.filter((route) => {
        const pose = sampleAmbientTownsfolkPose(route, clock, 0);
        return Math.hypot(pose.x - x, pose.z - z) < radius;
      }).length;

    // Daytime: at least one background figure visible around the market and
    // one around the harbor, on top of the scheduled named cast.
    expect(near(VILLAGE_MARKET.position.x, VILLAGE_MARKET.position.z, 22)).toBeGreaterThanOrEqual(1);
    expect(near(HARBOR_MARKET.position.x, HARBOR_MARKET.position.z, 22)).toBeGreaterThanOrEqual(1);
    for (const village of Object.values(MAINLAND_VILLAGES)) {
      expect(near(village.market.x, village.market.z, 24), village.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("walks for part of its loop and rests for the rest", () => {
    const clock = { timeOfDay: "day" } as Parameters<typeof sampleAmbientTownsfolkPose>[1];
    for (const route of AMBIENT_TOWNSFOLK_ROUTES) {
      const poses = posesAcrossLoop(route, "day");
      expect(poses.some((pose) => pose.walking), route.id).toBe(true);
      expect(poses.some((pose) => !pose.walking), route.id).toBe(true);
      void clock;
    }
  });
});
