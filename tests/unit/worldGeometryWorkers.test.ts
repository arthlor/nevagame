import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldGeometryWorkers } from "../../src/render/scene/WorldGeometryWorkers";
import { WorldLayout } from "../../src/world/WorldLayout";
import {
  deserializeWorldGeometry,
  runWorldGeometryJob,
  serializeWorldGeometry,
  worldGeometryTransferBuffers,
  type WorldGeometryWorkerRequest,
  type WorldGeometryWorkerResponse
} from "../../src/world/worldGeometryTransfer";

const SMALL_PATCH = "terrain.gull_rest" as const;

function expectSameGeometry(actual: THREE.BufferGeometry, expected: THREE.BufferGeometry): void {
  expect(Object.keys(actual.attributes).sort()).toEqual(Object.keys(expected.attributes).sort());
  for (const [name, attribute] of Object.entries(expected.attributes) as [string, THREE.BufferAttribute][]) {
    const other = actual.getAttribute(name) as THREE.BufferAttribute;
    expect([name, other.itemSize, other.normalized, other.array.constructor]).toEqual([name, attribute.itemSize, attribute.normalized, attribute.array.constructor]);
    expect(Buffer.from(other.array.buffer, other.array.byteOffset, other.array.byteLength))
      .toEqual(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  }
  expect(Array.from(actual.index?.array ?? [])).toEqual(Array.from(expected.index?.array ?? []));
  expect(actual.userData).toEqual(expected.userData);
  expect(actual.boundingSphere).toEqual(expected.boundingSphere);
  expect(actual.boundingBox).toEqual(expected.boundingBox);
}

describe("world geometry across the worker boundary", () => {
  it("rebuilds a terrain patch attribute for attribute, with its index, userData and bounds", () => {
    const expected = WorldLayout.buildTerrainGeometry(SMALL_PATCH);
    let heartbeats = 0;
    const built = runWorldGeometryJob({ kind: "terrain", patchId: SMALL_PATCH }, () => heartbeats++, 0);
    expect(heartbeats).toBeGreaterThan(0);
    const { geometry, transfer } = serializeWorldGeometry(built);
    expect(transfer.length).toBe(Object.keys(built.attributes).length + 1);
    expectSameGeometry(deserializeWorldGeometry(structuredClone(geometry)), expected);
  });

  it("refuses geometry it would not carry intact", () => {
    const grouped = new THREE.BoxGeometry();
    expect(() => serializeWorldGeometry(grouped)).toThrow("only plain geometries");
    const interleaved = new THREE.BufferGeometry();
    interleaved.setAttribute("position", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array(6), 3), 3, 0));
    expect(() => serializeWorldGeometry(interleaved)).toThrow("not a plain buffer attribute");
  });

  it("transfers a backing buffer once when plain attributes share views", () => {
    const source = new THREE.BufferGeometry();
    const shared = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    source.setAttribute("position", new THREE.BufferAttribute(shared, 3));
    source.setAttribute("normal", new THREE.BufferAttribute(shared.subarray(0, 9), 3));
    source.setIndex([0, 2, 1]);
    source.computeBoundingBox();
    source.computeBoundingSphere();
    const expected = source.clone();
    const { geometry, transfer } = serializeWorldGeometry(source);
    expect(transfer).toHaveLength(2);
    expect(worldGeometryTransferBuffers(geometry)).toEqual(transfer);
    const received = structuredClone(geometry, { transfer });
    expect(shared.byteLength).toBe(0);
    expectSameGeometry(deserializeWorldGeometry(received), expected);
  });
});

/** Runs requests on the calling thread, as the worker script would, one message turn later. */
class FakeWorker {
  static created = 0;
  static failNext = false;
  onmessage: ((event: MessageEvent<WorldGeometryWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor() { FakeWorker.created++; }
  postMessage(request: WorldGeometryWorkerRequest, transfer: ArrayBuffer[] = []): void {
    const received = structuredClone(request, { transfer });
    const fail = FakeWorker.failNext;
    FakeWorker.failNext = false;
    setTimeout(() => {
      if (this.terminated) return;
      if (fail) {
        this.onmessage?.({ data: { id: received.id, type: "error", message: "boom" } } as MessageEvent<WorldGeometryWorkerResponse>);
        return;
      }
      const built = runWorldGeometryJob(received.job, () => this.onmessage?.({ data: { id: received.id, type: "progress" } } as MessageEvent<WorldGeometryWorkerResponse>), 0);
      const { geometry, transfer: resultTransfer } = serializeWorldGeometry(built);
      const result = structuredClone(geometry, { transfer: resultTransfer });
      this.onmessage?.({ data: { id: received.id, type: "done", geometry: result } } as MessageEvent<WorldGeometryWorkerResponse>);
    }, 0);
  }
  terminate(): void { this.terminated = true; }
}

describe("world geometry worker pool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWorker.created = 0;
    FakeWorker.failNext = false;
  });

  it("builds every job on at most the given workers and hands back owned geometry", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const pool = new WorldGeometryWorkers([
      { kind: "terrain", patchId: SMALL_PATCH },
      { kind: "terrain", patchId: "terrain.driftwood" }
    ], 1);
    expect(FakeWorker.created).toBe(1);
    let progress = 0;
    const geometry = await pool.result({ kind: "terrain", patchId: SMALL_PATCH }, () => progress++);
    expectSameGeometry(geometry, WorldLayout.buildTerrainGeometry(SMALL_PATCH));
    await expect(pool.result({ kind: "terrain", patchId: "terrain.driftwood" })).resolves.toBeInstanceOf(THREE.BufferGeometry);
    expect(progress).toBeGreaterThan(0);
    await expect(pool.result({ kind: "path" })).rejects.toThrow("was not scheduled");
  });

  it("rejects a failed job so the caller can build it on the main thread", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.failNext = true;
    const pool = new WorldGeometryWorkers([{ kind: "terrain", patchId: SMALL_PATCH }], 2);
    await expect(pool.result({ kind: "terrain", patchId: SMALL_PATCH })).rejects.toThrow("boom");
  });

  it("stops every worker and rejects waiting jobs when startup is cancelled", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const controller = new AbortController();
    const pool = new WorldGeometryWorkers([{ kind: "terrain", patchId: SMALL_PATCH }], 1, controller.signal);
    const waiting = pool.result({ kind: "terrain", patchId: SMALL_PATCH });
    controller.abort(new Error("cancelled"));
    await expect(waiting).rejects.toThrow("cancelled");
  });

  it("keeps prepared buffers attached when startup was already cancelled", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const controller = new AbortController();
    const reason = new Error("already cancelled");
    controller.abort(reason);
    const source = smallRoadSource();
    const { geometry } = serializeWorldGeometry(source);
    const buffers = worldGeometryTransferBuffers(geometry);
    const lengths = buffers.map(buffer => buffer.byteLength);
    const pool = new WorldGeometryWorkers([{ kind: "path", source: geometry }], 1, controller.signal);
    await expect(pool.result({ kind: "path" })).rejects.toBe(reason);
    expect(FakeWorker.created).toBe(0);
    expect(buffers.map(buffer => buffer.byteLength)).toEqual(lengths);
    source.dispose();
  });
});

function smallRoadSource(): THREE.BufferGeometry {
  const source = new THREE.BufferGeometry();
  source.setAttribute("position", new THREE.Float32BufferAttribute([40, 3, -66, 41, 3.05, -66, 40, 3.02, -65], 3));
  source.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  source.setAttribute("color", new THREE.Float32BufferAttribute([0.4, 0.3, 0.2, 1, 0.4, 0.3, 0.2, 1, 0.4, 0.3, 0.2, 1], 4));
  source.setAttribute("roadFrame", new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0, 1], 2));
  source.setAttribute("roadClass", new THREE.Float32BufferAttribute([0, 0, 0], 1));
  source.setIndex([0, 2, 1]);
  source.userData = { roadTriangleCount: 1, junctionTriangleCount: 0, terrainPatchCount: 1 };
  source.computeBoundingBox();
  source.computeBoundingSphere();
  return source;
}

/** These tests exercise the real render bake without generating the full world. */
function prepareSmallRoad() {
  const builder = vi.spyOn(WorldLayout as unknown as { buildPathGeometryBase(): THREE.BufferGeometry }, "buildPathGeometryBase")
    .mockImplementation(smallRoadSource);
  WorldLayout.buildPathCollisionGeometry().dispose();
  builder.mockClear().mockImplementation(() => { throw new Error("prepared roads must not be regenerated"); });
  vi.spyOn(WorldLayout, "roadFootprintSample").mockReturnValue({
    packedSignedDistance: 1, shoulderSignedDistance: 2, coverageSignedDistance: 3,
    packed: 0.8, shoulder: 0.15, coverage: 0.9, junctionTraffic: 0.25,
    routeIndex: 0, classCode: 0, frameAcross: 0, frameAlong: 0, tangent: { x: 1, z: 0 }
  });
  vi.spyOn(WorldLayout, "terrainSurfaceSample").mockReturnValue({
    weights: { grass: 1, meadow: 0, drySoil: 0, dampSoil: 0, path: 0, shoulder: 0, beach: 0, riverbed: 0, wetShoreline: 0, cliff: 0 }
  } as ReturnType<typeof WorldLayout.terrainSurfaceSample>);
  vi.stubGlobal("Worker", FakeWorker);
  return builder;
}

describe("prepared road worker ownership", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeWorker.created = 0;
    FakeWorker.failNext = false;
  });

  it("keeps the normal generator for a path job without prepared input", () => {
    const expected = smallRoadSource();
    const work = vi.spyOn(WorldLayout, "pathGeometryWork").mockImplementation(function* () { return expected; });
    expect(runWorldGeometryJob({ kind: "path" })).toBe(expected);
    expect(work).toHaveBeenCalledWith(undefined);
  });

  it("bakes a transferred prepared road without rebuilding or detaching canonical support", async () => {
    const builder = prepareSmallRoad();
    const expected = runWorldGeometryJob({
      kind: "path", source: serializeWorldGeometry(WorldLayout.preparedPathGeometrySource()!).geometry
    });
    const source = WorldLayout.preparedPathGeometrySource()!;
    const original = source.clone();
    const { geometry: serialized, transfer } = serializeWorldGeometry(source);
    expect(transfer).toHaveLength(Object.keys(source.attributes).length + 1);
    const pool = new WorldGeometryWorkers([{ kind: "path", source: serialized }], 1);
    expect(serialized.attributes.every(({ array }) => array.byteLength === 0)).toBe(true);
    expect(serialized.index?.byteLength).toBe(0);
    const result = await pool.result({ kind: "path" });
    expectSameGeometry(result, expected);
    expectSameGeometry(WorldLayout.preparedPathGeometrySource()!, original);
    expect(result.getAttribute("color").array).toBeInstanceOf(Uint8Array);
    expect(result.getAttribute("roadContext").array).toBeInstanceOf(Uint8Array);
    expect(builder).not.toHaveBeenCalled();
    pool.dispose();
  });

  it("retains canonical support for cooperative fallback and cancellation after transfer", async () => {
    const builder = prepareSmallRoad();
    const original = WorldLayout.preparedPathGeometrySource()!;
    const { geometry: serialized } = serializeWorldGeometry(original.clone());
    FakeWorker.failNext = true;
    const failed = new WorldGeometryWorkers([{ kind: "path", source: serialized }], 1);
    await expect(failed.result({ kind: "path" })).rejects.toThrow("boom");
    const fallback = await WorldLayout.buildPathGeometryAsync();
    expectSameGeometry(fallback, WorldLayout.buildPathGeometry());
    expectSameGeometry(WorldLayout.preparedPathGeometrySource()!, original);
    const controller = new AbortController();
    const cancelled = new WorldGeometryWorkers([{ kind: "path", source: serializeWorldGeometry(original.clone()).geometry }], 1, controller.signal);
    const waiting = cancelled.result({ kind: "path" });
    controller.abort(new Error("cancelled prepared road"));
    await expect(waiting).rejects.toThrow("cancelled prepared road");
    expectSameGeometry(WorldLayout.preparedPathGeometrySource()!, original);
    expect(builder).not.toHaveBeenCalled();
    failed.dispose();
  });
});
