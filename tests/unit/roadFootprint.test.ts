import { describe, expect, it } from "vitest";
import polygonClipping from "polygon-clipping";
import { ROAD_CLASS_PROFILES } from "../../src/world/RoadClasses";
import { compileRoadFootprint, RoadFootprintRegion, deriveRoadJunctions } from "../../src/world/RoadFootprint";
import { buildOrganicRoadGeometry, roadTransverseStations, sampleRoadCrossSection } from "../../src/world/RoadGeometry";
import type { CompiledWorldRoute, WorldPoint, WorldRouteKind } from "../../src/world/WorldLayout";

function route(id: string, points: WorldPoint[], kind: WorldRouteKind = "lane"): CompiledWorldRoute {
  const profile = ROAD_CLASS_PROFILES[kind];
  let along = 0;
  const samples = points.map((point, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(b.x - a.x, b.z - a.z), tangent = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
    if (i) along += Math.hypot(point.x - points[i - 1].x, point.z - points[i - 1].z);
    return { point, tangent, normal: { x: -tangent.z, z: tangent.x }, distanceAlongRoute: along, segmentIndex: Math.min(i, points.length - 2) };
  });
  const segments = points.slice(1).map((end, i) => {
    const start = points[i], dx = end.x - start.x, dz = end.z - start.z, length = Math.hypot(dx, dz);
    return { start, end, dx, dz, length, lengthSquared: length * length, tangent: { x: dx / length, z: dz / length }, cumulativeStart: samples[i].distanceAlongRoute, cumulativeEnd: samples[i + 1].distanceAlongRoute, minX: Math.min(start.x, end.x), maxX: Math.max(start.x, end.x), minZ: Math.min(start.z, end.z), maxZ: Math.max(start.z, end.z) };
  });
  return { route: { id, kind, scope: "regional", widthMeters: profile.widthMeters, points }, halfWidth: profile.widthMeters / 2, shoulderWidthMeters: profile.shoulderWidthMeters, terrainFeatherMeters: profile.terrainFeatherMeters, corridorRadiusMeters: 3, samples, segments, totalLength: along, minX: Math.min(...points.map(p => p.x)) - 3, maxX: Math.max(...points.map(p => p.x)) + 3, minZ: Math.min(...points.map(p => p.z)) - 3, maxZ: Math.max(...points.map(p => p.z)) + 3 };
}

const bridge = { center: { x: 1000, z: 1000 }, halfSpan: 4, deckWidth: 3.8, entrySurfaceY: 0, westDeckEdge: { x: 996, z: 1000 }, eastDeckEdge: { x: 1004, z: 1000 }, gatewayDepthMeters: 0.7, gatewayInsetMeters: 0.1, gatewaySlabCount: 3, gatewaySlabGapMeters: 0.12 };

function mesh(routes: readonly CompiledWorldRoute[], heightAt: (x: number, z: number) => number = () => 0) {
  const footprint = compileRoadFootprint({ routes, junctions: [], profiles: ROAD_CLASS_PROFILES });
  return { footprint, geometry: buildOrganicRoadGeometry({ footprint, routes, junctions: [], profiles: ROAD_CLASS_PROFILES, bridge, heightAt, isBridgeDeck: () => false }) };
}

function coverageCount(geometry: ReturnType<typeof buildOrganicRoadGeometry>, x: number, z: number, includeEdges = false): number {
  const p = geometry.getAttribute("position"), indices = geometry.getIndex()!;
  let count = 0;
  for (let i = 0; i < (geometry.userData.roadTriangleCount + geometry.userData.junctionTriangleCount) * 3; i += 3) {
    const [a, b, c] = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    const ax = p.getX(a), az = p.getZ(a), bx = p.getX(b), bz = p.getZ(b), cx = p.getX(c), cz = p.getZ(c);
    const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / determinant;
    const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / determinant;
    if (Math.min(wa, wb, 1 - wa - wb) > (includeEdges ? -1e-6 : 1e-6)) count++;
  }
  return count;
}

function polygonArea(polygons: ReturnType<typeof polygonClipping.intersection>): number {
  return polygons.reduce((sum, polygon) => sum + Math.abs(polygon.reduce((total, ring) => {
    const [x0, z0] = ring[0];
    let area = 0;
    for (let i = 1; i < ring.length; i++) area += (ring[i - 1][0] - x0) * (ring[i][1] - z0) - (ring[i][0] - x0) * (ring[i - 1][1] - z0);
    return total + area / 2;
  }, 0)), 0);
}

describe("compiled worked-road footprint", () => {
  it.each(["T", "Y", "mixed"])("matches %s ownership heights and intermediate interface nodes", shape => {
    const roads = shape === "Y"
      ? [route("stem", [{ x: 0, z: -9 }, { x: 0, z: 0 }]), route("left", [{ x: 0, z: 0 }, { x: -8, z: 8 }]), route("right", [{ x: 0, z: 0 }, { x: 8, z: 8 }])]
      : [route("through", [{ x: -9, z: 0 }, { x: 0, z: 0 }, { x: 9, z: 0 }], "arterial"), route("branch", [{ x: 0, z: 0 }, { x: 0, z: 9 }], shape === "mixed" ? "trail" : "arterial")];
    const heightAt = (x: number, z: number): number => 0.004 * (x * x + z * z);
    const { footprint, geometry } = mesh(roads, heightAt);
    const p = geometry.getAttribute("position"), indices = geometry.getIndex()!, heights = new Map<string, number>();
    interface Edge { a: number; b: number; count: number }
    const edges = new Map<string, Edge>();
    const nodeKey = (index: number): string => `${p.getX(index)},${p.getZ(index)}`;
    for (let index = 0; index < geometry.userData.bridgeGatewayVertexStart; index++) {
      const key = nodeKey(index), previous = heights.get(key);
      if (previous !== undefined) expect(p.getY(index), `height at ${key}`).toBe(previous);
      heights.set(key, p.getY(index));
    }
    for (let offset = 0; offset < (geometry.userData.roadTriangleCount + geometry.userData.junctionTriangleCount) * 3; offset += 3) {
      for (let corner = 0; corner < 3; corner++) {
        const a = indices.getX(offset + corner), b = indices.getX(offset + (corner + 1) % 3), ka = nodeKey(a), kb = nodeKey(b), key = ka < kb ? `${ka}/${kb}` : `${kb}/${ka}`;
        const previous = edges.get(key);
        if (previous) previous.count++; else edges.set(key, { a, b, count: 1 });
      }
    }
    const unmatched = [...edges.values()].filter(edge => edge.count === 1);
    let checked = 0;
    for (const edge of unmatched) {
      const x = (p.getX(edge.a) + p.getX(edge.b)) / 2, z = (p.getZ(edge.a) + p.getZ(edge.b)) / 2;
      if (footprint.coverageRegion.signedDistance(x, z) < 0.001) continue;
      const y = (p.getY(edge.a) + p.getY(edge.b)) / 2;
      let closest = Infinity, partnerY = Infinity;
      for (const candidate of unmatched) {
        if (candidate === edge) continue;
        const ax = p.getX(candidate.a), az = p.getZ(candidate.a), dx = p.getX(candidate.b) - ax, dz = p.getZ(candidate.b) - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        const distance = Math.hypot(x - ax - t * dx, z - az - t * dz);
        if (distance < closest) { closest = distance; partnerY = p.getY(candidate.a) + t * (p.getY(candidate.b) - p.getY(candidate.a)); }
      }
      expect(closest, `paired boundary at ${x},${z}`).toBeLessThan(0.00001);
      expect(Math.abs(y - partnerY), `continuous boundary at ${x},${z}`).toBeLessThan(0.00001);
      checked++;
    }
    expect(geometry.userData.interfaceStitching.adjustedVertexCount).toBeGreaterThan(0);
    expect(geometry.userData.interfaceStitching.insertedVertexCount).toBeGreaterThan(0);
    expect(checked + [...edges.values()].filter(edge => edge.count === 2).length).toBeGreaterThan(10);
    const repeat = mesh(roads, heightAt).geometry;
    expect(repeat.getAttribute("position").array).toEqual(p.array);
    expect(repeat.getIndex()!.array).toEqual(indices.array);
    repeat.dispose(); geometry.dispose();
  });

  it("uses nine base stations and keeps cross-section interpolation within five millimetres", () => {
    for (const profile of Object.values(ROAD_CLASS_PROFILES)) {
      const half = profile.widthMeters / 2, stations = roadTransverseStations(profile, half);
      expect(stations.length).toBeGreaterThanOrEqual(9);
      const height = (x: number) => sampleRoadCrossSection({ profile, halfWidthMeters: half, lateralDistanceMeters: x }).surfaceOffsetMeters;
      for (let i = 1; i < stations.length; i++) for (let step = 1; step < 40; step++) {
        const t = step / 40, x = stations[i - 1] + (stations[i] - stations[i - 1]) * t;
        expect(Math.abs(height(x) - (height(stations[i - 1]) * (1 - t) + height(stations[i]) * t))).toBeLessThanOrEqual(0.005);
      }
    }
  });

  it("retains holes and never connects packed cores through overlapping feathers", () => {
    const routes = [route("lower", [{ x: -8, z: 0 }, { x: 8, z: 0 }]), route("upper", [{ x: -8, z: 3.1 }, { x: 8, z: 3.1 }])];
    const footprint = compileRoadFootprint({ routes, junctions: [], profiles: ROAD_CLASS_PROFILES });
    expect(footprint.coverageRegion.contains(0, 1.55)).toBe(true);
    expect(footprint.packedRegion.contains(0, 1.55)).toBe(false);
    expect(footprint.junctions).toHaveLength(0);
    const square = new RoadFootprintRegion([[[[-4, -4], [4, -4], [4, 4], [-4, 4], [-4, -4]], [[-1, -1], [-1, 1], [1, 1], [1, -1], [-1, -1]]]]);
    expect(square.contains(0, 0)).toBe(false);
    expect(square.signedDistance(0, 0)).toBeLessThan(0);
    expect(square.contains(2, 0)).toBe(true);
  });

  it("derives exact endpoint-to-span contacts, including terrace walk joins", () => {
    const routes = [route("service", [{ x: 0, z: -8 }, { x: 0, z: 8 }], "trail"), route("cistern", [{ x: 0, z: 2 }, { x: 7, z: 2 }], "trail")];
    const junctions = deriveRoadJunctions({ routes, junctions: [], profiles: ROAD_CLASS_PROFILES });
    expect(junctions.find(j => j.center.x === 0 && j.center.z === 2)?.routeIds).toEqual(["cistern", "service"]);
    expect(deriveRoadJunctions({ routes: [routes[0], route("near", [{ x: 0.02, z: 2 }, { x: 7, z: 2 }], "trail")], junctions: [], profiles: ROAD_CLASS_PROFILES })).toHaveLength(0);
  });

  it("requires a shared authored knot at an interior crossing", () => {
    const vertical = route("vertical", [{ x: 0, z: -8 }, { x: 0, z: 0 }, { x: 0, z: 8 }]);
    const crossing = route("crossing", [{ x: -8, z: 0 }, { x: 8, z: 0 }]);
    expect(deriveRoadJunctions({ routes: [vertical, crossing], junctions: [], profiles: ROAD_CLASS_PROFILES })).toHaveLength(0);
    const shared = route("shared", [{ x: -8, z: 0 }, { x: 0, z: 0 }, { x: 8, z: 0 }]);
    const junctions = deriveRoadJunctions({ routes: [vertical, shared], junctions: [], profiles: ROAD_CLASS_PROFILES });
    expect(junctions).toHaveLength(1);
    expect(junctions[0].routeIds).toEqual(["shared", "vertical"]);
  });

  it("preserves each disconnected packed core when another road's verge overlaps it", () => {
    const roads = [route("lane", [{ x: -8, z: 0 }, { x: 8, z: 0 }]), route("path", [{ x: -8, z: 2 }, { x: 8, z: 2 }], "trail")];
    const { footprint, geometry } = mesh(roads);
    expect(footprint.junctions).toHaveLength(0);
    expect(footprint.packedRegion.contains(0, 1.3)).toBe(false);
    const sample = footprint.sample(0, 2);
    expect(sample.packed).toBe(1);
    expect(sample.classCode).toBe(2);
    expect(sample.routeIndex).toBe(1);
    expect(sample.frameAcross).toBeCloseTo(0, 8);
    expect(footprint.routeRegions[1].contains(0, 2)).toBe(true);
    expect(footprint.routeRegions[0].contains(0, 2)).toBe(false);
    expect(polygonClipping.intersection(footprint.routeRegions[0].polygons, footprint.routeRegions[1].polygons)).toEqual([]);
    expect(coverageCount(geometry, 0.127, 2.083)).toBe(1);
    geometry.dispose();
  });

  it.each(["T", "Y", "X"])("gives %s joins one geometric coverage and deterministic frames", shape => {
    const roads = shape === "Y"
      ? [route("stem", [{ x: 0, z: -9 }, { x: 0, z: 0 }]), route("left", [{ x: 0, z: 0 }, { x: -8, z: 8 }]), route("right", [{ x: 0, z: 0 }, { x: 8, z: 8 }])]
      : [route("through", [{ x: -9, z: 0 }, { x: 0, z: 0 }, { x: 9, z: 0 }]), route("branch", shape === "X" ? [{ x: 0, z: -9 }, { x: 0, z: 0 }, { x: 0, z: 9 }] : [{ x: 0, z: 0 }, { x: 0, z: 9 }])];
    const { footprint, geometry } = mesh(roads);
    expect(compileRoadFootprint({ routes: roads, junctions: [], profiles: ROAD_CLASS_PROFILES })).toBe(footprint);
    for (let x = -5.83; x < 6; x += 0.41) for (let z = -5.71; z < 6; z += 0.43) {
      const count = coverageCount(geometry, x, z);
      expect(count, `${shape} at ${x},${z}`).toBeLessThanOrEqual(1);
      if (footprint.coverageRegion.signedDistance(x, z) > 0.03) expect(coverageCount(geometry, x, z, true), `${shape} hole at ${x},${z}`).toBeGreaterThanOrEqual(1);
    }
    for (let i = 0; i < footprint.routeRegions.length; i++) for (let j = i + 1; j < footprint.routeRegions.length; j++) {
      expect(polygonArea(polygonClipping.intersection(footprint.routeRegions[i].polygons, footprint.routeRegions[j].polygons))).toBeLessThanOrEqual(1e-12);
    }
    const shared = footprint.sample(0.1, 0.1);
    expect(shared.classCode).toBe(3); expect(shared.routeIndex).not.toBeNull(); expect(Number.isFinite(shared.frameAlong)).toBe(true);
    geometry.dispose();
  });

  it("partitions a near-parallel fork without stacked road triangles", () => {
    const roads = [route("trunk", [{ x: 0, z: 0 }, { x: 16, z: 0 }]), route("fork", [{ x: 0, z: 0 }, { x: 16, z: 3 }], "trail")];
    const { footprint, geometry } = mesh(roads);
    for (let x = 0.27; x < 16; x += 0.37) for (let z = -2.31; z < 5; z += 0.41) {
      expect(coverageCount(geometry, x, z), `${x},${z}`).toBeLessThanOrEqual(1);
      if (footprint.coverageRegion.signedDistance(x, z) > 0.03) expect(coverageCount(geometry, x, z, true)).toBeGreaterThanOrEqual(1);
    }
    geometry.dispose();
  });

  it("gives a sharp return bend one coverage even when its own ribbons overlap", () => {
    const roads = [route("return", [{ x: -8, z: 0 }, { x: 6, z: 0 }, { x: -6, z: 1 }])];
    const { footprint, geometry } = mesh(roads);
    for (let x = -8.17; x < 8; x += 0.43) for (let z = -2.31; z < 4; z += 0.41) {
      expect(coverageCount(geometry, x, z), `${x},${z}`).toBeLessThanOrEqual(1);
      if (footprint.coverageRegion.signedDistance(x, z) > 0.03) expect(coverageCount(geometry, x, z, true), `${x},${z}`).toBeGreaterThanOrEqual(1);
    }
    geometry.dispose();
  });

  it("claims folded curve spans from their transverse cells without cutting holes in a later branch", () => {
    // Retained bridge-approach samples turn back tightly before the declared
    // footpath knot. A full-width diagonal covers more than the actual cells.
    const roads = [route("approach", [
      { x: -5, z: -6 }, { x: -4.2, z: -6 }, { x: -3.4, z: -6 },
      { x: -2.6, z: -6 }, { x: -1.8, z: -6 }, { x: -1, z: -6 },
      { x: -0.2, z: -6 }, { x: -0.16385298705274118, z: -5.9315 },
      { x: -0.1384706494036549, z: -5.832 }, { x: -0.12116181822819802, z: -5.7105 },
      { x: -0.10923532470182744, z: -5.576 }, { x: -0.1, z: -5.4375 },
      { x: -0.09076467529817256, z: -5.304 }, { x: -0.07883818177180205, z: -5.1845 },
      { x: -0.06152935059634515, z: -5.088 }, { x: -0.03614701294725884, z: -5.0235 },
      { x: 0, z: -5 }, { x: 0.8501, z: -5.6185 }, { x: 1.9488, z: -6.448 },
      { x: 3.2487, z: -7.4495 }, { x: 4.7024, z: -8.584 }, { x: 6.2625, z: -9.8125 }
    ], "arterial"), route("branch", [
      { x: 0, z: -5 }, { x: 1.089, z: -4.258 }, { x: 2.512, z: -3.344 },
      { x: 4.203, z: -2.276 }, { x: 6.096, z: -1.072 }
    ], "trail")];
    const { footprint, geometry } = mesh(roads);
    expect(footprint.routeFoldedSpans[0].filter(Boolean).length).toBeGreaterThan(0);
    const x = 0.5253219527717334, z = -4.113984367410866;
    expect(footprint.sample(x, z).packed).toBeGreaterThan(0.99);
    expect(coverageCount(geometry, x, z)).toBe(1);
    let checked = 0;
    for (let x = -0.23; x < 1.6; x += 0.17) for (let z = -4.79; z < -3.2; z += 0.19) {
      expect(coverageCount(geometry, x, z), `overlap at ${x},${z}`).toBeLessThanOrEqual(1);
      if (footprint.coverageRegion.signedDistance(x, z) > 0.03) {
        expect(coverageCount(geometry, x, z, true), `hole at ${x},${z}`).toBeGreaterThanOrEqual(1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(polygonArea(polygonClipping.difference(footprint.packedRegion.polygons, footprint.shoulderRegion.polygons))).toBeLessThan(1e-9);
    expect(polygonArea(polygonClipping.difference(footprint.shoulderRegion.polygons, footprint.coverageRegion.polygons))).toBeLessThan(1e-9);
    geometry.dispose();
  });

  it("merges overlapping junction regions and preserves every crowned gate station after Earcut", () => {
    const roads = [route("through", [{ x: -9, z: 0 }, { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 12, z: 0 }], "arterial"), route("branch", [{ x: 0, z: 0 }, { x: 0, z: 9 }], "trail")];
    const junctions = [
      { id: "fork", center: { x: 0, z: 0 }, radiusMeters: 2.3, blendLengthMeters: 1, surface: "field" as const, routeIds: ["through", "branch"] },
      { id: "bay", center: { x: 4, z: 0 }, radiusMeters: 2.6, blendLengthMeters: 1.2, surface: "field" as const, routeIds: ["through"] }
    ];
    const footprint = compileRoadFootprint({ routes: roads, junctions, profiles: ROAD_CLASS_PROFILES });
    expect(footprint.sharedRegion.polygons).toHaveLength(1);
    const heightAt = (x: number, z: number): number => 0.03 * x + sampleRoadCrossSection({ profile: ROAD_CLASS_PROFILES.arterial, halfWidthMeters: 1.4, lateralDistanceMeters: z }).surfaceOffsetMeters;
    const geometry = buildOrganicRoadGeometry({ footprint, routes: roads, junctions, profiles: ROAD_CLASS_PROFILES, bridge, heightAt, isBridgeDeck: () => false });
    const positions = geometry.getAttribute("position"), classes = geometry.getAttribute("roadClass"), indices = geometry.getIndex()!;
    let checked = 0;
    for (let i = 0; i < positions.count; i++) {
      if (classes.getX(i) === 3) continue;
      const x = positions.getX(i), z = positions.getZ(i);
      if (Math.abs(footprint.sharedRegion.signedDistance(x, z)) > 0.0001) continue;
      let matched = false;
      for (let offset = geometry.userData.roadTriangleCount * 3; offset < (geometry.userData.roadTriangleCount + geometry.userData.junctionTriangleCount) * 3; offset += 3) {
        const a = indices.getX(offset), b = indices.getX(offset + 1), c = indices.getX(offset + 2);
        const ax = positions.getX(a), az = positions.getZ(a), bx = positions.getX(b), bz = positions.getZ(b), cx = positions.getX(c), cz = positions.getZ(c);
        const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / determinant, wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / determinant;
        if (Math.min(wa, wb, 1 - wa - wb) < -0.0001) continue;
        const y = positions.getY(a) * wa + positions.getY(b) * wb + positions.getY(c) * (1 - wa - wb);
        if (Math.abs(y - positions.getY(i)) < 0.00001) { matched = true; break; }
      }
      expect(matched, `gate station ${x},${z}`).toBe(true); checked++;
    }
    expect(checked).toBeGreaterThan(15);
    geometry.dispose();
  });

  it("retains sampled source planes and route frames when the base has an authored discontinuity", () => {
    const roads = [route("through", [{ x: -9, z: 0 }, { x: 0, z: 0 }, { x: 9, z: 0 }], "arterial")];
    const junctions = [{ id: "gate", center: { x: 0, z: 0 }, radiusMeters: 2.3, blendLengthMeters: 1, surface: "field" as const, routeIds: ["through"] }];
    const footprint = compileRoadFootprint({ routes: roads, junctions, profiles: ROAD_CLASS_PROFILES });
    const heightAt = (x: number): number => x > 4 ? 1 : 0;
    const geometry = buildOrganicRoadGeometry({ footprint, routes: roads, junctions, profiles: ROAD_CLASS_PROFILES, bridge, heightAt, isBridgeDeck: () => false });
    const positions = geometry.getAttribute("position"), frames = geometry.getAttribute("roadFrame"), classes = geometry.getAttribute("roadClass");
    const offset = footprint.sample(7, 0).frameAlong - 7;
    let checked = 0;
    for (let i = 0; i < (geometry.userData.bridgeGatewayVertexStart as number); i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      if (x <= 0 || x >= 4 || Math.abs(footprint.sharedRegion.signedDistance(x, z)) > 0.00001) continue;
      // The original row endpoints are at x=0 (Y=0) and x=9 (Y=1).
      // Cutting their plane preserves the intended ramp despite the analytic
      // base's hard guard. Independently resampling a cut would return Y=0.
      expect(positions.getY(i)).toBeCloseTo(x / 9, 6);
      expect(positions.getY(i) - heightAt(x)).toBeGreaterThan(0.2);
      if (classes.getX(i) !== 3) {
        expect(frames.getX(i)).toBeCloseTo(z, 6);
        expect(frames.getY(i)).toBeCloseTo(offset + x, 4);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(8);
    geometry.dispose();
  });
});
