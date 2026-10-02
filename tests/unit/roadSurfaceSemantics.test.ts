import * as THREE from "three";
import { afterAll, describe, expect, it, vi } from "vitest";
import { footstepSurfaceAt } from "../../src/audio/footstepSurface";
import { CARRIAGE_TUNING, carriageGroundResponseAt } from "../../src/simulation/mounts/Carriage";
import { createUniformMeadowPatchData, sampleMeadowExclusion, stampRoadCoverageSteps } from "../../src/render/vegetation/MeadowFieldSource";
import { runSync } from "../../src/utils/CooperativeTask";
import { WORLD_ROUTE_JUNCTIONS, WorldLayout } from "../../src/world/WorldLayout";
import { deserializeWorldGeometry, runWorldGeometryJob, serializeWorldGeometry } from "../../src/world/worldGeometryTransfer";

/** Samples the actual render triangles, independent of the footprint query. */
function surfaceAt(geometry: THREE.BufferGeometry, x: number, z: number): { opacity: number; interiors: number } {
  const p = geometry.getAttribute("position"), color = geometry.getAttribute("color"), index = geometry.index!;
  let opacity = 0, interiors = 0;
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset), b = index.getX(offset + 1), c = index.getX(offset + 2);
    const ax = p.getX(a), az = p.getZ(a), bx = p.getX(b), bz = p.getZ(b), cx = p.getX(c), cz = p.getZ(c);
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    const wc = 1 - wa - wb;
    const minimumWeight = Math.min(wa, wb, wc);
    if (minimumWeight > 1e-7) interiors++;
    if (minimumWeight >= -1e-7) opacity = Math.max(opacity, wa * color.getW(a) + wb * color.getW(b) + wc * color.getW(c));
  }
  return { opacity, interiors };
}

describe("shared worked-road surface semantics", () => {
  let renderCache: THREE.BufferGeometry | null = null;
  const renderGeometry = () => renderCache ??= WorldLayout.buildPathGeometry();
  afterAll(() => renderCache?.dispose());

  it("answers the derived footprint without building render or traversal geometry", () => {
    const collision = vi.spyOn(WorldLayout, "buildPathCollisionGeometry");
    const mesh = vi.spyOn(WorldLayout, "buildPathGeometry");
    try {
      for (const point of [{ x: 70.127, z: -70.917 }, { x: -24.623, z: 22.083 }, { x: -400, z: 400 }]) {
        expect(Number.isFinite(WorldLayout.roadFootprintSample(point.x, point.z).coverage)).toBe(true);
      }
      expect(collision).not.toHaveBeenCalled();
      expect(mesh).not.toHaveBeenCalled();
    } finally { collision.mockRestore(); mesh.mockRestore(); }
  });

  it("agrees at audited forks, compound junctions and the east bridge approach", () => {
    const render = renderGeometry();
    let packedSamples = 0;
    // The bridge points come from independent camera/terrain rays through the
    // green seam. Both lie in the packed core; the second lacked source faces.
    const points = [
      [70.127, -70.917, false], [-24.623, 22.083, false], [-90.123, 70.333, false],
      [1.8269421, -5.3587926, true], [0.5253220, -4.1139844, true],
      // Final camera rays exposed alpha interpolation through a packed join.
      [-0.406611537, -7.209597284, true], [0.021229853, -7.276470793, true]
    ] as const;
    for (const [x, z, requirePacked] of points) {
      const footprint = WorldLayout.roadFootprintSample(x, z);
      if (requirePacked) expect(footprint.packed, `${x},${z}: east bridge packed core`).toBeGreaterThan(0.99);
      const { opacity, interiors } = surfaceAt(render, x, z);
      expect(interiors, `${x},${z}: stacked road triangles`).toBeLessThanOrEqual(1);
      if (opacity > 0.95) {
        expect(footprint.coverage, `${x},${z}: opaque surface classified outside roads`).toBeGreaterThan(0.8);
      }
      if (footprint.packed > 0.8) {
        expect(opacity, `${x},${z}: missing packed road`).toBeGreaterThan(0.8);
        expect(WorldLayout.pathInfluence(x, z)).toBeGreaterThan(0.8);
        expect(footstepSurfaceAt(x, z)).toBe("dirt");
        const support = WorldLayout.traversalSurfaceSample(x, z);
        expect(WorldLayout.terrainSurface(x, z, support.normal.y)).toBe("path");
        expect(footprint.routeIndex).not.toBeNull();
        const roadClass = WorldLayout.compiledRouteNetwork()[footprint.routeIndex!].route.kind;
        // Travel across the grade so this asserts road response independently
        // of the retained uphill/downhill speed adjustment.
        const levelHeading = Math.atan2(support.normal.z, -support.normal.x);
        const response = carriageGroundResponseAt(x, z, levelHeading);
        expect(response.speedScale).toBeCloseTo(CARRIAGE_TUNING.groundResponse.roadSpeedScale[roadClass], 8);
        expect(response.accelerationScale).toBe(1);
        packedSamples++;
      } else if (footprint.coverage === 0) {
        expect(opacity).toBeLessThan(0.1);
        expect(WorldLayout.pathInfluence(x, z)).toBe(0);
        expect(footstepSurfaceAt(x, z)).toBe("grass");
      }
      const response = carriageGroundResponseAt(x, z, 0);
      expect(Number.isFinite(response.speedScale)).toBe(true);
      expect(Number.isFinite(response.accelerationScale)).toBe(true);
    }
    expect(packedSamples).toBeGreaterThan(0);
    // Shoreline wetness dilutes the supporting terrain's palette mix while
    // the bridge approach remains fully packed. It must retain full response.
    const wetCore = { x: 0.5253220, z: -4.1139844 };
    const wetSupport = WorldLayout.traversalSurfaceSample(wetCore.x, wetCore.z);
    expect(WorldLayout.roadFootprintSample(wetCore.x, wetCore.z).packed).toBe(1);
    expect(WorldLayout.terrainSurfaceWeights(wetCore.x, wetCore.z, wetSupport.normal.y).path)
      .toBeLessThan(CARRIAGE_TUNING.groundResponse.packedCoreFullWeight);
  });

  it("keeps a coincident shoulder and outer boundary opaque without filling the outer feather", () => {
    // This exact stored fork vertex gave the surrounding packed triangle an
    // alpha of 0.39 because the outer boundary took priority over its shoulder.
    const edge = WorldLayout.roadFootprintSample(-0.9427495002746582, -7.400000095367432);
    expect(edge.shoulderSignedDistance).toBe(0);
    expect(edge.coverageSignedDistance).toBe(0);
    expect(edge.coverage).toBe(1);
    const render = renderGeometry(), positions = render.getAttribute("position"), colors = render.getAttribute("color");
    let outerEdgeSamples = 0;
    for (let index = 0; index < positions.count; index++) {
      const sample = WorldLayout.roadFootprintSample(positions.getX(index), positions.getZ(index));
      if (sample.coverageSignedDistance <= 0 && sample.shoulderSignedDistance < -0.2) {
        expect(sample.coverage).toBe(0);
        expect(colors.getW(index)).toBe(0);
        outerEdgeSamples++;
      }
    }
    expect(outerEdgeSamples).toBeGreaterThan(100);
  });

  it("clears packed junctions and lets meadow return just outside the shoulder", () => {
    const render = renderGeometry();
    const center = WORLD_ROUTE_JUNCTIONS.find(junction => junction.id === "village-commons")!.center;
    const patch = createUniformMeadowPatchData({ id: "joined-road", islandId: "island.neva", center, sizeMeters: 32, resolution: 16 },
      { density: 1, meadowShare: 1, dry: 0, damp: 0 }, 0.5);
    runSync(stampRoadCoverageSteps(patch, render, (x, z) => WorldLayout.roadCoverage(x, z)));
    let packed = 0, meadow = 0;
    for (let z = center.z - 10; z <= center.z + 10; z += 0.5) for (let x = center.x - 10; x <= center.x + 10; x += 0.5) {
      const sx = x + 0.25, sz = z + 0.25;
      const footprint = WorldLayout.roadFootprintSample(sx, sz);
      if (footprint.packedSignedDistance > 0.25) {
        expect(sampleMeadowExclusion(patch, sx, sz)).toBeGreaterThan(0.95);
        packed++;
      } else if (footprint.coverageSignedDistance < -0.1 && footprint.coverageSignedDistance > -0.6) {
        expect(sampleMeadowExclusion(patch, sx, sz)).toBe(0);
        meadow++;
      }
    }
    expect(packed).toBeGreaterThan(20);
    expect(meadow).toBeGreaterThan(10);
  });

  it("keeps physical buffers identical and removes render-only data from collider clones", () => {
    const render = renderGeometry();
    const collision = WorldLayout.buildPathCollisionGeometry();
    try {
      expect(collision.getAttribute("position").array).toEqual(render.getAttribute("position").array);
      expect(collision.index!.array).toEqual(render.index!.array);
      expect(Object.keys(collision.attributes)).toEqual(["position"]);
      expect(render.getAttribute("color").array).toBeInstanceOf(Uint8Array);
      expect(render.getAttribute("color").normalized).toBe(true);
      for (const name of ["surfaceWeights0", "surfaceWeights1", "surfaceCauses"]) expect(render.getAttribute(name)).toBeUndefined();
    } finally { collision.dispose(); }
  });

  it("carries the byte palette and profile frames unchanged through a worker transfer", () => {
    const render = renderGeometry();
    const worker = runWorldGeometryJob({ kind: "path" });
    const serialized = serializeWorldGeometry(worker);
    const transferred = deserializeWorldGeometry(structuredClone(serialized.geometry, { transfer: serialized.transfer }));
    try {
      expect(Object.keys(transferred.attributes)).toEqual(Object.keys(render.attributes));
      for (const [name, expected] of Object.entries(render.attributes)) {
        const actual = transferred.getAttribute(name);
        expect([actual.itemSize, actual.normalized, actual.array.constructor]).toEqual([expected.itemSize, expected.normalized, expected.array.constructor]);
        expect(Buffer.from(actual.array.buffer, actual.array.byteOffset, actual.array.byteLength))
          .toEqual(Buffer.from(expected.array.buffer, expected.array.byteOffset, expected.array.byteLength));
      }
      expect(transferred.index!.array).toEqual(render.index!.array);
      expect(transferred.userData).toEqual(render.userData);
    } finally { transferred.dispose(); worker.dispose(); }
  });
});
