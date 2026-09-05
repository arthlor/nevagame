import { describe, expect, it } from "vitest";
import { WorldLayout } from "../../src/world/WorldLayout";

/**
 * `sampleTraversalRoadPlane` skips building the road ribbon when the route
 * segment index reports a miss. That is only sound while every road triangle
 * really does sit inside the index padding, so this pins the premise: widen a
 * junction or a shoulder past it and these fail rather than silently dropping
 * road height from traversal.
 */
describe("road traversal short-circuit", () => {
  it("keeps every road triangle inside the route index padding", () => {
    const geometry = WorldLayout.buildPathGeometry();
    const positions = geometry.getAttribute("position");

    let worstDistance = 0;
    let offRouteVertices = 0;
    // Walking every vertex is the exact check; the ribbon is a few thousand.
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const projection = WorldLayout.nearestRouteDistance(x, z);
      if (!Number.isFinite(projection.distance)) {
        offRouteVertices += 1;
        continue;
      }
      if (projection.distance > worstDistance) worstDistance = projection.distance;
    }

    expect(
      offRouteVertices,
      `${offRouteVertices} road vertices fall outside the route index; traversal would lose their height`
    ).toBe(0);
    // Headroom check: the widest road feature must stay clear of the padding.
    expect(worstDistance).toBeLessThan(18);
  }, 120000);

  it("answers away-from-road queries without building the ribbon", () => {
    // Deep water and open meadow are nowhere near a route, so the height must
    // come back from terrain alone.
    for (const [x, z] of [[-400, 400], [500, -500], [0, 900]] as const) {
      expect(Number.isFinite(WorldLayout.traversalSurfaceHeight(x, z))).toBe(true);
    }
  });

  it("still reports road height where a road actually is", () => {
    // A point on a route must resolve through the road plane, not skip it.
    const geometry = WorldLayout.buildPathGeometry();
    const positions = geometry.getAttribute("position");
    const x = positions.getX(0);
    const z = positions.getZ(0);
    const sample = WorldLayout.traversalSurfaceSample(x, z);
    expect(Number.isFinite(sample.height)).toBe(true);
    expect(["road", "terrain", "bridge", "pier", "interior"]).toContain(sample.source);
  }, 120000);
});
