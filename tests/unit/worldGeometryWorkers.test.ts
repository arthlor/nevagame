import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldGeometryWorkers } from "../../src/render/scene/WorldGeometryWorkers";
import { WorldLayout } from "../../src/world/WorldLayout";
import {
  deserializeWorldGeometry,
  runWorldGeometryJob,
  serializeWorldGeometry,
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
});

/** Runs requests on the calling thread, as the worker script would, one message turn later. */
class FakeWorker {
  static created = 0;
  static failNext = false;
  onmessage: ((event: MessageEvent<WorldGeometryWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor() { FakeWorker.created++; }
  postMessage(request: WorldGeometryWorkerRequest): void {
    const fail = FakeWorker.failNext;
    FakeWorker.failNext = false;
    setTimeout(() => {
      if (this.terminated) return;
      if (fail) {
        this.onmessage?.({ data: { id: request.id, type: "error", message: "boom" } } as MessageEvent<WorldGeometryWorkerResponse>);
        return;
      }
      const built = runWorldGeometryJob(request.job, () => this.onmessage?.({ data: { id: request.id, type: "progress" } } as MessageEvent<WorldGeometryWorkerResponse>), 0);
      const { geometry } = serializeWorldGeometry(built);
      this.onmessage?.({ data: { id: request.id, type: "done", geometry } } as MessageEvent<WorldGeometryWorkerResponse>);
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
});
