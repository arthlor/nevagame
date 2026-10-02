import type * as THREE from "three";
import {
  deserializeWorldGeometry,
  worldGeometryJobKey,
  worldGeometryTransferBuffers,
  type WorldGeometryJob,
  type WorldGeometryWorkerRequest,
  type WorldGeometryWorkerResponse
} from "../../world/worldGeometryTransfer";

interface PendingResult {
  promise: Promise<THREE.BufferGeometry>;
  resolve: (geometry: THREE.BufferGeometry) => void;
  reject: (reason: unknown) => void;
  settled: boolean;
}

/**
 * Builds the startup world geometry (terrain patches and the road overlay) on
 * a small pool of Web Workers from entry, so it overlaps the asset transfers,
 * layout and water bake instead of following them on the main thread. Jobs run
 * longest first; a worker terminates when the queue is empty. A job that
 * fails, or a pool that cannot start, is the caller's cue to build that piece
 * on the main thread as before.
 */
export class WorldGeometryWorkers {
  /**
   * Production builds only. DEV's layout editor edits world module state live,
   * which a worker's own copy of those modules would not see.
   */
  public static supported(): boolean {
    return !import.meta.env.DEV && typeof Worker !== "undefined";
  }

  public static defaultConcurrency(): number {
    const cores = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
    // Leave the main thread and AssetLoader's Meshopt decoders their cores.
    return Math.max(1, Math.min(3, cores - 2));
  }

  private readonly results = new Map<string, PendingResult>();
  private readonly queue: WorldGeometryWorkerRequest[] = [];
  private readonly keys: string[] = [];
  private readonly workers = new Set<Worker>();
  private readonly busy = new Map<Worker, number>();
  private progressListener: (() => void) | null = null;
  private disposed = false;

  public constructor(jobs: readonly WorldGeometryJob[], concurrency: number, signal?: AbortSignal) {
    jobs.forEach((job, id) => {
      const key = worldGeometryJobKey(job);
      let resolve!: PendingResult["resolve"];
      let reject!: PendingResult["reject"];
      const promise = new Promise<THREE.BufferGeometry>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
      });
      // A job nobody awaits (a cancelled startup) must not surface as unhandled.
      promise.catch(() => undefined);
      this.results.set(key, { promise, resolve, reject, settled: false });
      this.keys[id] = key;
      this.queue.push({ id, job });
    });
    if (signal?.aborted) {
      this.dispose(signal.reason);
      return;
    }
    signal?.addEventListener("abort", () => this.dispose(signal.reason), { once: true });
    for (let index = 0; index < Math.min(Math.max(1, concurrency), jobs.length); index++) this.spawn();
  }

  /** The finished geometry of `job`, which the caller then owns. */
  public result(job: WorldGeometryJob, onProgress?: () => void): Promise<THREE.BufferGeometry> {
    const entry = this.results.get(worldGeometryJobKey(job));
    if (!entry) return Promise.reject(new Error(`[WorldGeometryWorkers] ${worldGeometryJobKey(job)} was not scheduled`));
    // Any worker's heartbeat keeps the waiting stage's stall deadline alive.
    this.progressListener = onProgress ?? null;
    return entry.promise;
  }

  public dispose(reason: unknown = new Error("[WorldGeometryWorkers] disposed")): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const worker of this.workers) worker.terminate();
    this.workers.clear();
    this.busy.clear();
    this.queue.length = 0;
    for (const entry of this.results.values()) this.settle(entry, () => entry.reject(reason));
  }

  private spawn(): void {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../../world/worldGeometry.worker.ts", import.meta.url), {
        type: "module",
        name: "neva-world-geometry"
      });
    } catch (error) {
      this.failQueued(error);
      return;
    }
    worker.onmessage = (event: MessageEvent<WorldGeometryWorkerResponse>) => this.receive(worker, event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      const id = this.busy.get(worker);
      this.retire(worker);
      const reason = new Error(`[WorldGeometryWorkers] worker failed: ${event.message}`);
      if (id !== undefined) this.fail(id, reason);
      // A worker that cannot load its script cannot take the rest either.
      if (!this.workers.size) this.failQueued(reason);
    };
    this.workers.add(worker);
    this.next(worker);
  }

  private next(worker: Worker): void {
    const request = this.queue.shift();
    if (!request) {
      this.retire(worker);
      return;
    }
    this.busy.set(worker, request.id);
    const transfer = request.job.kind === "path" && request.job.source
      ? worldGeometryTransferBuffers(request.job.source) : [];
    worker.postMessage(request, transfer);
  }

  private receive(worker: Worker, message: WorldGeometryWorkerResponse): void {
    if (this.disposed) return;
    if (message.type === "progress") {
      this.progressListener?.();
      return;
    }
    this.busy.delete(worker);
    const entry = this.results.get(this.keys[message.id]);
    if (entry && message.type === "done") {
      const geometry = deserializeWorldGeometry(message.geometry);
      this.settle(entry, () => entry.resolve(geometry));
    } else {
      this.fail(message.id, new Error(`[WorldGeometryWorkers] ${this.keys[message.id]}: ${message.type === "error" ? message.message : "no result"}`));
    }
    this.next(worker);
  }

  private retire(worker: Worker): void {
    worker.terminate();
    this.workers.delete(worker);
    this.busy.delete(worker);
  }

  private fail(id: number, reason: unknown): void {
    const entry = this.results.get(this.keys[id]);
    if (entry) this.settle(entry, () => entry.reject(reason));
  }

  private failQueued(reason: unknown): void {
    for (const request of this.queue.splice(0)) this.fail(request.id, reason);
  }

  private settle(entry: PendingResult, settle: () => void): void {
    if (entry.settled) return;
    entry.settled = true;
    settle();
  }
}
