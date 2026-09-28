import * as THREE from "three";
import { WorldLayout } from "./WorldLayout";
import type { WorldTerrainPatchDefinition } from "./WorldIslands";

/** One world geometry build a worker can run: a terrain patch or the road overlay. */
export type WorldGeometryJob =
  | { kind: "terrain"; patchId: WorldTerrainPatchDefinition["id"] }
  | { kind: "path" };

export interface SerializedWorldGeometry {
  attributes: { name: string; array: THREE.TypedArray; itemSize: number; normalized: boolean }[];
  index: Uint16Array | Uint32Array | null;
  userData: Record<string, unknown>;
}

export type WorldGeometryWorkerRequest = { id: number; job: WorldGeometryJob };
export type WorldGeometryWorkerResponse =
  | { id: number; type: "progress" }
  | { id: number; type: "done"; geometry: SerializedWorldGeometry }
  | { id: number; type: "error"; message: string };

export function worldGeometryJobKey(job: WorldGeometryJob): string {
  return job.kind === "terrain" ? `terrain:${job.patchId}` : "path";
}

/**
 * Runs one job to completion on this thread, reporting a heartbeat at most
 * every `heartbeatMs`. It uses the same steps as the main thread's cooperative
 * build, so the geometry is identical; only the scheduling differs.
 */
export function runWorldGeometryJob(job: WorldGeometryJob, onHeartbeat?: () => void, heartbeatMs = 500): THREE.BufferGeometry {
  const work = job.kind === "terrain" ? WorldLayout.terrainGeometryWork(job.patchId) : WorldLayout.pathGeometryWork();
  let beat = performance.now();
  for (let step = work.next(); ; step = work.next()) {
    if (step.done) return step.value;
    if (!onHeartbeat) continue;
    const now = performance.now();
    if (now - beat >= heartbeatMs) {
      onHeartbeat();
      beat = now;
    }
  }
}

/**
 * Detaches a world geometry into transferable arrays. The world builders
 * produce plain, non-interleaved attributes with an optional index and
 * JSON-safe `userData`, and nothing else; anything more is refused rather
 * than dropped.
 */
export function serializeWorldGeometry(geometry: THREE.BufferGeometry): { geometry: SerializedWorldGeometry; transfer: ArrayBuffer[] } {
  if (geometry.groups.length || Object.keys(geometry.morphAttributes).length
    || geometry.drawRange.start !== 0 || Number.isFinite(geometry.drawRange.count)) {
    throw new Error("[WorldGeometry] only plain geometries cross the worker boundary");
  }
  const transfer: ArrayBuffer[] = [];
  const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => {
    if (!(attribute instanceof THREE.BufferAttribute) || attribute instanceof THREE.InstancedBufferAttribute) {
      throw new Error(`[WorldGeometry] attribute ${name} is not a plain buffer attribute`);
    }
    transfer.push(attribute.array.buffer as ArrayBuffer);
    return { name, array: attribute.array, itemSize: attribute.itemSize, normalized: attribute.normalized };
  });
  const index = geometry.index ? geometry.index.array as Uint16Array | Uint32Array : null;
  if (index) transfer.push(index.buffer as ArrayBuffer);
  return { geometry: { attributes, index, userData: structuredClone(geometry.userData) }, transfer };
}

export function deserializeWorldGeometry(serialized: SerializedWorldGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const { name, array, itemSize, normalized } of serialized.attributes) {
    geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize, normalized));
  }
  if (serialized.index) geometry.setIndex(new THREE.BufferAttribute(serialized.index, 1));
  geometry.userData = serialized.userData;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
