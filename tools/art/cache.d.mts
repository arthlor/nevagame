export interface CachePlan {
  inputHash: string;
  directory: string;
  artifact: string;
  metadata: string;
}

export interface CacheRecord {
  version: number;
  inputHash: string;
  id: string;
  file: string;
  producerVersion?: string;
  result?: Record<string, unknown>;
}

export const ART_CACHE_VERSION: number;
export const DEFAULT_CACHE_ROOT: string;
export const AUTHORED_GLB_GENERATOR: "authored_glb";
export const PIPELINE_TOOLCHAIN_FILES: readonly string[];

export function sha256(value: string | Buffer | Uint8Array): string;
export function stableStringify(value: unknown): string;
export function hashFiles(files: string[], relativeRoot?: string): string;
export function pipelineToolchainFiles(repoRoot?: string): string[];
export function computeToolchainHash(repoRoot?: string): string;
export function computeAssetToolchainHash(asset: { generator: string }, repoRoot?: string): string;
export function computeAssetInputHash(
  asset: { id: string; file?: string; family?: string; generator: string; seed?: number; palette?: string[]; parameters?: Record<string, unknown> },
  palette: { version: number; tokens: Record<string, unknown> },
  producerVersion: string,
  optimizeConfig?: Record<string, unknown>,
  repoRoot?: string
): string;
export function assetCachePlan(
  asset: { id: string; file: string; generator: string; seed?: number; palette?: string[]; parameters?: Record<string, unknown> },
  context: { palette: { version: number; tokens: Record<string, unknown> }; optimizeConfig?: Record<string, unknown>; repoRoot?: string },
  producer: { version: string },
  cacheRoot?: string
): CachePlan;
export function readAssetCache(
  plan: CachePlan,
  spec: { id: string; file: string },
  validatorFn?: ((filename: string, spec: unknown, phase: string) => Promise<Record<string, unknown>>) | null
): Promise<Record<string, unknown> | null>;
export function writeAssetCache(
  plan: CachePlan,
  result: Record<string, unknown> & { id: string; file: string },
  optimizedGlbPath: string,
  producerVersion: string
): void;
export function cleanCache(
  cacheRoot?: string,
  maxAgeMs?: number,
  maxEntries?: number
): { kept: number; removed: number };
