export interface ArtCliArgs {
  command: string;
  assets: string[];
  families: string[];
  all: boolean;
  publish: boolean;
  strict: boolean;
  concurrency?: number | null;
  timeoutMs?: number;
  useCache?: boolean;
  source?: string | null;
}

export interface SourceProvenance {
  provider: "poly-pizza" | "quaternius";
  modelId: string;
  sourceUrl: string;
  author: string;
  license: "CC0-1.0" | "CC-BY-3.0";
  licenseUrl: string;
  sourceBlend: string;
  /** SHA-256 of adapted sourceBlend bytes, not the provider download. */
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
  staticAuthoring?: {
    sourceFile: string;
    sourceSha256: string;
    sourceNode: string;
    scaleReference: { axis: "width" | "depth" | "height"; meters: number };
    yawDegrees: number;
    materialMap: Record<string, {
      token: string;
      value: number;
      texturePolicy: "none" | "preserve";
    }>;
    addedGeometryNodes?: string[];
  };
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

export function parseArgs(argv: string[]): ArtCliArgs;
export function computeAssetInputHash(
  asset: CatalogAsset,
  palette: { version: number; tokens: Record<string, unknown> },
  blenderVersion: string,
): string;
export function computeAssetToolchainHash(asset: CatalogAsset): string;
export function computeToolchainHash(directory?: string): string;
export function computeCommonToolchainHash(commonDir?: string): string;
export function computeAssetHash(
  catalogEntry: CatalogAsset,
  repoRoot?: string,
  overrides?: { blenderVersion?: string; optimizeConfig?: Record<string, unknown> }
): string;
export function isAssetCurrent(cacheDir: string, assetId: string, sourceHash: string): boolean;
export function isCached(assetId: string, targetHash: string, outputDir?: string, cacheRoot?: string): boolean;
export function recordCache(
  assetId: string,
  hash: string,
  metadata: Record<string, unknown>,
  artifactPath?: string | null,
  cacheRoot?: string
): Record<string, unknown>;
export function cleanCache(
  cacheRoot?: string,
  maxAgeMs?: number,
  maxEntries?: number
): { kept: number; removed: number };
export function mayJoinStaticNode(node: unknown, spec: unknown): boolean;
export function safeFilename(value: string): boolean;
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
  args: ArtCliArgs,
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
export function resolveAdmissionSource(source: string, extension: string, repoRoot?: string): string;
export function validateSourceProvenance(asset: CatalogAsset, repoRoot?: string, verifySourceFiles?: boolean): SourceProvenance | null;
export function validateStaticAuthoring(
  asset: CatalogAsset,
  repoRoot?: string,
  verifySourceFiles?: boolean,
): CatalogAsset["staticAuthoring"] | null;
export function validateStaticSourceContract(
  filename: string,
  spec: CatalogAsset,
  repoRoot?: string,
): Promise<Record<string, unknown> | null>;
export function validateAdmissionGlb(
  filename: string,
  spec: CatalogAsset,
  palette: { tokens: Record<string, unknown> },
  repoRoot?: string,
): Promise<Record<string, unknown>>;
export function admitAsset(
  spec: CatalogAsset,
  sourcePath: string,
  catalog: { assets: CatalogAsset[]; downloadBudgetBytes: number },
  palette: { tokens: Record<string, unknown> },
  options?: { publish?: boolean; repoRoot?: string },
): Promise<{ stage: string; report: { assets: Array<Record<string, unknown>> }; published: boolean }>;
