export interface ArtCliArgs {
  command: string;
  assets: string[];
  families: string[];
  all: boolean;
  publish: boolean;
  strict: boolean;
  useCache?: boolean;
}

export interface SourceProvenance {
  provider: "poly-pizza" | "quaternius" | "tripo";
  modelId: string;
  sourceUrl: string;
  author: string;
  license: "CC0-1.0" | "CC-BY-3.0" | "Tripo-Terms";
  licenseUrl: string;
  /** The adapted library or committed source the asset derives from (`.blend` or `.glb`). */
  sourceFile: string;
  /** SHA-256 of the sourceFile bytes, not the provider download. */
  sourceSha256: string;
  /** Optional immutable provider-source capture bundle, verified as an all-or-none group. */
  sourceCapture?: string;
  sourceCaptureSha256?: string;
  sourceCaptureReport?: string;
  licenseEvidence?: string;
  attribution: string;
}

export interface CatalogAsset {
  id: string;
  file: string;
  family: string;
  generator: string;
  seed: number;
  palette: string[];
  dimensions: { width: number; depth: number; height: number };
  budget: { trianglesMin: number; trianglesTarget: number; trianglesMax: number; materialsMax: number };
  pivot: "ground_center" | "center" | "buoyancy";
  collision: "none" | "box" | "compound";
  collisionPrimitives?: Array<{
    id: string;
    center: [number, number, number];
    halfExtents: [number, number, number];
    yawDegrees?: number;
  }>;
  instancing: boolean;
  lod: "none" | "small" | "medium" | "hero";
  rootNode: string;
  requiredNodes: string[];
  readDistanceMeters: number;
  parameters: Record<string, unknown>;
  lodLevels?: Array<{ node: string; distanceMeters: number; triangleRatioMin: number; triangleRatioMax: number }>;
  rigNode?: string;
  socketNodes?: string[];
  animationClips?: Array<{
    name: string;
    durationSeconds: number;
    commitMarkerSeconds?: number;
    loop: boolean;
    referenceSpeedMetersPerSecond?: number;
    optional?: boolean;
    fallbackClip?: string;
    events?: Array<{ name: string; timeSeconds: number }>;
  }>;
  additionalAnimationClips?: Array<{
    name: string;
    durationSeconds: number;
    commitMarkerSeconds?: number;
    loop: boolean;
    referenceSpeedMetersPerSecond?: number;
    optional?: boolean;
    fallbackClip?: string;
    events?: Array<{ name: string; timeSeconds: number }>;
  }>;
  referenceAuthoring?: ReferenceAuthoring;
  sourceProvenance?: SourceProvenance;
}

export interface ReferenceAuthoring {
  status: "draft" | "ready";
  subject: string;
  sources: Array<{
    id: string;
    kind: "canonical" | "visual_reference" | "structural_study" | "method_study";
    uri: string;
    use: string[];
    notes?: string;
  }>;
  components: Array<{
    id: string;
    parent: string;
    importance: "primary" | "secondary" | "tertiary";
    role: string;
    shape: string;
    count: string;
    cues: string[];
  }>;
  silhouette: string[];
  negativeSpace: string[];
  hiddenSurfaces: { strategy: string; confidence: string; requirements: string[] };
  criticalFeatures: Array<{ id: string; componentIds: string[]; requirement: string; priority: "must" | "should" }>;
  parameterBindings: Array<{ parameter: string; componentIds: string[]; purpose: string }>;
  failureModes: string[];
  reviewViews: string[];
}

export type ProducerKind = "authored" | "authored_glb" | "frozen";

export const ART_CACHE_VERSION: number;
export const AUTHORED_GLB_GENERATOR: "authored_glb";

export function parseArgs(argv: string[]): ArtCliArgs;
export function producerKind(asset: Pick<CatalogAsset, "id" | "generator">, repoRoot?: string): ProducerKind;
export function computeAssetInputHash(
  asset: CatalogAsset,
  palette: { version: number; tokens: Record<string, unknown> },
  producerVersion: string,
): string;
export function computeAssetToolchainHash(asset: Pick<CatalogAsset, "generator">, repoRoot?: string): string;
export function computeToolchainHash(repoRoot?: string): string;
export function cleanCache(
  cacheRoot?: string,
  maxAgeMs?: number,
  maxEntries?: number
): { kept: number; removed: number };
export function mayJoinStaticNode(node: unknown, spec: unknown): boolean;
export function optimizeAsset(
  source: string | Uint8Array,
  destination: string | null,
  spec?: Record<string, unknown>,
): Promise<string | Uint8Array>;
export function safeFilename(value: string): boolean;
export function stableStringify(value: unknown): string;
export function semanticHash(bytes: Uint8Array): Promise<string>;
export function validateCatalog(stagingSelection?: Pick<ArtCliArgs, "assets" | "families" | "all"> | null): {
  catalog: { assets: CatalogAsset[] };
  palette: { version: number; tokens: Record<string, unknown> };
  specHash: string;
};
export function validateGeneratorParameters(asset: {
  id: string;
  generator: string;
  parameters: Record<string, unknown>;
}, repoRoot?: string, verifySourceFiles?: boolean): true;
export function validateLodContract(asset: CatalogAsset): boolean;
export function validateAnimationContract(asset: CatalogAsset): boolean;
export function validateReferenceAuthoring(asset: CatalogAsset): true | null;
export function referenceBriefHash(asset: CatalogAsset): string | null;
export function referenceAuthoringSummary(asset: CatalogAsset): {
  status: "draft" | "ready";
  briefHash: string;
  sources: number;
  components: number;
  criticalFeatures: number;
  reviewViews: number;
} | null;
export function referenceBriefMarkdown(asset: CatalogAsset): string;
export function selectAssets(
  catalog: { assets: CatalogAsset[] },
  args: Pick<ArtCliArgs, "assets" | "families" | "all">,
): CatalogAsset[];
export function artYardUrl(assetId: string): string;
export function pruneStagingRuns(
  stagingRoot?: string,
  keep?: number,
  preserve?: string[],
): { kept: string[]; removed: string[] };
export function promoteFilesAtomically(
  copies: Array<{ source: string; destination: string }>,
  removals: string[],
  backupRoot: string,
): void;
export function validatePublishedManifest(
  manifest: Record<string, unknown>,
  catalog: { assets: CatalogAsset[] },
  specHash: string,
  paletteHash: string,
  label?: string,
  selectedAssets?: CatalogAsset[],
): Record<string, unknown>;
export function validateGlb(
  filename: string,
  spec: CatalogAsset,
  phase: string,
  repoRoot?: string,
): Promise<Record<string, unknown>>;
export function resolveRepositorySource(source: string, extension: string, repoRoot?: string): string;
export function validateSourceProvenance(asset: CatalogAsset, repoRoot?: string, verifySourceFiles?: boolean): SourceProvenance | null;
export function produceAuthoredGlb(
  spec: CatalogAsset,
  outputDir: string,
  repoRoot?: string,
): Promise<Record<string, unknown> & { id: string; artContractStatus: "passed" }>;
export function packageAuthoredGlb(
  raw: string,
  optimized: string,
  spec: CatalogAsset,
): Promise<"source-compression" | "lossless-compression" | "static-optimization">;
