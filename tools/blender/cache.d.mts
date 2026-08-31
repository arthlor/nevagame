export interface CachePlan {
  inputHash: string;
  directory: string;
  artifact: string;
  metadata: string;
}

export interface CacheRecord {
  version: number;
  inputHash: string;
  sourceHash?: string;
  id: string;
  file: string;
  blenderVersion?: string;
  artifactPath?: string;
  result?: Record<string, unknown>;
  timestamp?: number;
}

export interface CacheManifest {
  version: number;
  entries: Record<string, { hash: string; file: string; mtimeMs: number }>;
}

export const ART_CACHE_VERSION: number;
export const TOOLCHAIN_EXTENSIONS: ReadonlySet<string>;
export const DEFAULT_CACHE_ROOT: string;

export function sha256(value: string | Buffer): string;
export function stableStringify(value: unknown): string;
export function hashFiles(files: string[], relativeRoot?: string): string;
export function computeToolchainHash(directory?: string): string;
export function computeCommonToolchainHash(commonDir?: string): string;
export function generatorModuleFor(generator: string, repoRoot?: string): string;
export function computeAssetToolchainHash(asset: { generator: string }, repoRoot?: string): string;
export function computeAssetSourceHash(
  assetSpec: Record<string, unknown>,
  generatorCode: string,
  commonToolchainHash: string,
  paletteJson: string | Record<string, unknown>,
  blenderVersion: string,
  optimizeConfig?: Record<string, unknown>
): string;
export function computeAssetInputHash(
  asset: { id: string; file?: string; family?: string; generator: string; palette?: string[]; parameters?: Record<string, unknown> },
  palette: { version: number; tokens: Record<string, unknown> },
  blenderVersion: string,
  optimizeConfig?: Record<string, unknown>,
  repoRoot?: string
): string;
export function computeAssetHash(
  catalogEntry: { id: string; file?: string; family?: string; generator: string; palette?: string[]; parameters?: Record<string, unknown> },
  repoRoot?: string,
  overrides?: { blenderVersion?: string; optimizeConfig?: Record<string, unknown> }
): string;
export function isAssetCurrent(cacheDir: string, assetId: string, sourceHash: string): boolean;
export function isCached(assetId: string, targetHash: string, outputDir?: string, cacheRoot?: string): boolean;
export function assetCachePlan(
  asset: { id: string; file: string; generator: string; palette?: string[] },
  context: { palette: { version: number; tokens: Record<string, unknown> }; optimizeConfig?: Record<string, unknown>; repoRoot?: string },
  blenderInfo: { version: string },
  cacheRoot?: string
): CachePlan;
export function readAssetCache(
  plan: CachePlan,
  spec: { id: string; file: string },
  validatorFn?: ((path: string, spec: unknown, phase: string) => Promise<Record<string, unknown>>) | null
): Promise<Record<string, unknown> | null>;
export function writeAssetCache(
  plan: CachePlan,
  result: Record<string, unknown> & { id: string; file: string },
  optimizedGlbPath: string,
  blenderVersion: string
): void;
export function recordCache(
  assetId: string,
  hash: string,
  metadata: Record<string, unknown>,
  artifactPath?: string | null,
  cacheRoot?: string
): CacheRecord;
export function cleanCache(
  cacheRoot?: string,
  maxAgeMs?: number,
  maxEntries?: number
): { kept: number; removed: number };
export function getCacheManifest(cacheRoot?: string): CacheManifest;
export function saveCacheManifest(cacheRoot?: string, manifest?: CacheManifest): void;
