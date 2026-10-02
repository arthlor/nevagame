import fs from "node:fs";
import * as THREE from "three";
import { WorldLayout } from "../../src/world/WorldLayout";
import { createSpatialSurfaceBatch } from "../../src/render/scene/spatialSurfaceBatch";

/** Direct diagnostic: npx vite-node tools/world/profile-roads.ts (no asset-sync hooks). */
const started = performance.now();
const collision = WorldLayout.buildPathCollisionGeometry();
const collisionMs = performance.now() - started;
const renderStarted = performance.now();
const render = WorldLayout.buildPathGeometry();
const renderMs = performance.now() - renderStarted;
const material = new THREE.MeshBasicMaterial();
const batchStarted = performance.now();
const batch = createSpatialSurfaceBatch(render, material, 80);
const batchMs = performance.now() - batchStarted;
const traversalStarted = performance.now();
const route = WorldLayout.compiledRouteNetwork()[0];
WorldLayout.traversalSurfaceSample(route.samples[0].point.x, route.samples[0].point.z);
const traversalMs = performance.now() - traversalStarted;
const buffers = (geometry: THREE.BufferGeometry) => {
  const attributes = Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) => [name, {
    bytes: attribute.array.byteLength, components: attribute.itemSize, normalized: attribute.normalized,
    storage: attribute.array.constructor.name
  }]));
  return {
    vertices: geometry.getAttribute("position").count,
    triangles: geometry.index!.count / 3,
    bytes: Object.values(attributes).reduce((sum, attribute) => sum + attribute.bytes, 0) + geometry.index!.array.byteLength,
    indexBytes: geometry.index!.array.byteLength,
    attributes
  };
};
const diagnostics = (WorldLayout as typeof WorldLayout & {
  roadPreparationDiagnostics?: () => unknown;
}).roadPreparationDiagnostics?.();
const report = {
  kind: "synchronous-node-road-diagnostic",
  node: process.version,
  three: THREE.REVISION,
  timings: { collisionMs, renderMs, batchMs, traversalMs, totalMs: performance.now() - started, phases: diagnostics ?? null },
  collision: buffers(collision), render: buffers(render), spatialBatch: { cells: batch.instanceCount, ...buffers(batch.geometry) },
  generation: render.userData,
  processMemory: process.memoryUsage()
};
const destination = process.env.NEVA_ROAD_DIAGNOSTICS_OUTPUT;
if (destination) fs.writeFileSync(destination, JSON.stringify(report, null, 2));
console.info(JSON.stringify({
  ...report,
  generation: { sourceTriangles: render.userData.terrainConformity?.sourceTriangleCount,
    roadTriangles: render.userData.roadTriangleCount, junctionTriangles: render.userData.junctionTriangleCount }
}, null, 2));
batch.dispose(); material.dispose(); render.dispose(); collision.dispose();
