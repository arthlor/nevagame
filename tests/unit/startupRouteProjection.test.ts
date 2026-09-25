import { describe, expect, it } from "vitest";
import { COMPILED_WORLD_ROUTES, WorldLayout } from "../../src/world/WorldLayout";

// Retain the original unpruned bucket traversal as an independent reference.
// This protects exact nearest-segment and tie order, not just approximate roads.
const buckets = new Map<string, Array<{ routeIndex: number; segmentIndex: number }>>();
COMPILED_WORLD_ROUTES.forEach((route, routeIndex) => route.segments.forEach((segment, segmentIndex) => {
  const radius = route.corridorRadiusMeters + 18;
  for (let x = Math.floor((segment.minX - radius) / 8); x <= Math.floor((segment.maxX + radius) / 8); x++) {
    for (let z = Math.floor((segment.minZ - radius) / 8); z <= Math.floor((segment.maxZ + radius) / 8); z++) {
      const key = `${x}:${z}`, bucket = buckets.get(key) ?? [];
      bucket.push({ routeIndex, segmentIndex });
      buckets.set(key, bucket);
    }
  }
}));

function reference(x: number, z: number) {
  const candidates = new Set<{ routeIndex: number; segmentIndex: number }>();
  for (let cx = Math.floor((x - 18) / 8); cx <= Math.floor((x + 18) / 8); cx++) {
    for (let cz = Math.floor((z - 18) / 8); cz <= Math.floor((z + 18) / 8); cz++) {
      for (const candidate of buckets.get(`${cx}:${cz}`) ?? []) candidates.add(candidate);
    }
  }
  let distance = Infinity;
  let winner: { distance: number; routeIndex: number; segmentIndex: number; point: { x: number; z: number } } | undefined;
  for (const candidate of candidates) {
    const segment = COMPILED_WORLD_ROUTES[candidate.routeIndex].segments[candidate.segmentIndex];
    const t = Math.max(0, Math.min(1, ((x - segment.start.x) * segment.dx
      + (z - segment.start.z) * segment.dz) / segment.lengthSquared));
    const point = { x: segment.start.x + segment.dx * t, z: segment.start.z + segment.dz * t };
    const next = Math.hypot(x - point.x, z - point.z);
    if (next < distance) { distance = next; winner = { ...candidate, distance, point }; }
  }
  return winner;
}

describe("startup route query pruning", () => {
  it("preserves exact projections across routes, junctions, cell edges and distant ground", () => {
    const points: Array<{ x: number; z: number }> = [];
    for (const route of COMPILED_WORLD_ROUTES) {
      for (let i = 0; i < route.segments.length; i += 19) {
        const point = route.segments[i].start;
        points.push(point, { x: point.x + 5.5, z: point.z - 11.2 });
      }
    }
    for (let x = -950; x < 650; x += 71) for (let z = -1450; z < 450; z += 89) {
      points.push({ x, z }, { x: Math.floor(x / 8) * 8 + 2, z: Math.floor(z / 8) * 8 - 2 });
    }
    for (const { x, z } of points) {
      const expected = reference(x, z), actual = WorldLayout.nearestRouteDistance(x, z);
      if (expected) {
        expect({ distance: actual.distance, routeIndex: actual.routeIndex, segmentIndex: actual.segmentIndex, point: actual.point }, `${x},${z}`).toEqual(expected);
      } else expect(actual.distance).toBe(Infinity);
    }
  });
});
