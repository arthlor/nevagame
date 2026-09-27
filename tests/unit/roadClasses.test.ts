import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROAD_CLASS_PROFILES, ROAD_WHEEL_GAUGE_METERS } from "../../src/world/RoadClasses";
import { WORLD_ROUTE_JUNCTIONS, WORLD_ROUTE_NETWORK, WorldLayout } from "../../src/world/WorldLayout";

/** Wheel positions of the published carriage, read from its GLB node graph. */
function publishedCarriageWheels(): { name: string; x: number }[] {
  const glb = readFileSync(new URL("../../public/assets/models/prop_merchant_carriage_a.glb", import.meta.url));
  const length = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + length).toString("utf8")) as {
    nodes: { name: string; translation?: number[] }[];
  };
  return gltf.nodes
    .filter(node => /_(left|right)_wheel$/.test(node.name))
    .map(node => ({ name: node.name, x: node.translation?.[0] ?? 0 }));
}

const CARRIAGE_WIDTH_METERS = 2.05;

describe("road classes", () => {
  it("wear wheel tracks at the published carriage's wheel spacing", () => {
    const wheels = publishedCarriageWheels();
    expect(wheels.length).toBe(4);
    for (const wheel of wheels) expect(Math.abs(wheel.x) * 2, wheel.name).toBeCloseTo(ROAD_WHEEL_GAUGE_METERS, 3);
  });

  it("fit the carriage on cart roads and farm lanes and a walker on footpaths", () => {
    expect(ROAD_CLASS_PROFILES.arterial.widthMeters).toBeGreaterThanOrEqual(CARRIAGE_WIDTH_METERS + 0.6);
    expect(ROAD_CLASS_PROFILES.lane.widthMeters).toBeGreaterThanOrEqual(CARRIAGE_WIDTH_METERS + 0.3);
    expect(ROAD_CLASS_PROFILES.trail.widthMeters).toBeLessThan(ROAD_CLASS_PROFILES.lane.widthMeters);
    // Visible road: packed surface plus a loose shoulder each side stays near human scale.
    for (const profile of Object.values(ROAD_CLASS_PROFILES)) {
      expect(profile.widthMeters + profile.shoulderWidthMeters * 2).toBeLessThan(4);
    }
  });

  it("give every route its class width; no route carries a width of its own", () => {
    for (const route of WORLD_ROUTE_NETWORK) {
      expect(route.widthMeters, route.id).toBe(ROAD_CLASS_PROFILES[route.kind].widthMeters);
    }
  });

  it("never draw one road along another; roads meet only at junctions", () => {
    const compiled = WorldLayout.compiledRouteNetwork();
    const rank = { arterial: 0, lane: 1, trail: 2 } as const;
    const nearJunction = (x: number, z: number) => WORLD_ROUTE_JUNCTIONS.some(junction =>
      Math.hypot(x - junction.center.x, z - junction.center.z) < junction.radiusMeters + junction.blendLengthMeters + 8);
    const centerDistance = (other: (typeof compiled)[number], x: number, z: number) => {
      let nearest = Infinity;
      for (const segment of other.segments) {
        const t = Math.max(0, Math.min(1, ((x - segment.start.x) * segment.dx + (z - segment.start.z) * segment.dz) / segment.lengthSquared));
        nearest = Math.min(nearest, Math.hypot(x - segment.start.x - segment.dx * t, z - segment.start.z - segment.dz * t));
      }
      return nearest;
    };
    const failures: string[] = [];
    for (const [index, route] of compiled.entries()) {
      let alongside = 0, worst = 0;
      for (const sample of route.samples) {
        const { x, z } = sample.point;
        if (nearJunction(x, z) || WorldLayout.isBridgeDeck(x, z)) { alongside = 0; continue; }
        // Two strips are both drawn where they overlap and neither lies on the
        // greater one's surface; a lesser road riding a greater one is hidden.
        const doubled = compiled.some((other, otherIndex) => {
          if (otherIndex === index) return false;
          if (x < other.minX || x > other.maxX || z < other.minZ || z > other.maxZ) return false;
          const distance = centerDistance(other, x, z);
          if (distance >= route.halfWidth + other.halfWidth) return false;
          const otherGreater = rank[other.route.kind] < rank[route.route.kind]
            || (rank[other.route.kind] === rank[route.route.kind] && otherIndex < index);
          return distance > (otherGreater ? other.halfWidth : route.halfWidth) - 0.15;
        });
        alongside = doubled ? alongside + 1 : 0;
        worst = Math.max(worst, alongside);
      }
      // Samples are at most 4.2 m apart; a run of three is a shared stretch, not a crossing.
      if (worst >= 3) failures.push(`${route.route.id} (${worst})`);
    }
    expect(failures).toEqual([]);
  });
});
