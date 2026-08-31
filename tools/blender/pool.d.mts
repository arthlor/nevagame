export interface BlenderPoolProgress {
  assetId: string;
  completed: number;
  total: number;
  workerId?: number;
  durationMs?: number;
  error?: unknown;
}

export interface BlenderPoolTaskResult {
  assetId: string;
  durationMs: number;
  report: { version?: number; assets?: Array<Record<string, unknown>> };
  assetEntry: Record<string, unknown>;
}

export interface BlenderPoolRunResult {
  rawDir: string;
  blenderReport: { version: number; generatedAt: string; assets: Array<Record<string, unknown>> };
  results: BlenderPoolTaskResult[];
  durationMs: number;
}

export interface BlenderWorkerPoolOptions {
  concurrency?: number | null;
  timeoutMs?: number;
  recycleJobLimit?: number;
}

export class BlenderWorkerPool {
  constructor(options?: BlenderWorkerPoolOptions);
  concurrency: number;
  timeoutMs: number;
  recycleJobLimit: number;
  activeProcesses: Set<unknown>;
  scratchDirs: Set<string>;
  aborted: boolean;
  terminateAll(signal?: string): void;
  cleanupScratchDirs(): void;
  dispose(): void;
  runTasks(options: {
    blenderPath: string;
    bootstrapScript: string;
    catalogPath: string;
    assets: Array<{ id: string; file?: string; generator?: string }>;
    outputDir: string;
    strict?: boolean;
    onProgress?: ((progress: BlenderPoolProgress) => void) | null;
    repoRoot?: string;
  }): Promise<BlenderPoolRunResult>;
}

export const DEFAULT_TIMEOUT_MS: number;
export const DEFAULT_RECYCLE_COUNT: number;

export function resolveConcurrency(override?: number | string | null): number;

export function runDynamicBlenderPool(options: {
  blenderPath: string;
  bootstrapScript: string;
  catalogPath: string;
  missAssets: Array<{ id: string; file?: string; generator?: string }>;
  outputDir: string;
  strict?: boolean;
  concurrency?: number | null;
  timeoutMs?: number;
  onProgress?: ((progress: BlenderPoolProgress) => void) | null;
  repoRoot?: string;
}): Promise<BlenderPoolRunResult>;
