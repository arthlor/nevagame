export interface ArtCliArgs {
  command: string;
  assets: string[];
  families: string[];
  all: boolean;
  publish: boolean;
  strict: boolean;
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
export function safeFilename(value: string): boolean;
export function validateCatalog(): {
  catalog: { assets: CatalogAsset[] };
  palette: { version: number; tokens: Record<string, unknown> };
  specHash: string;
};
export function validateGeneratorParameters(asset: {
  id: string;
  generator: string;
  parameters: Record<string, unknown>;
}): true;
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
): Promise<Record<string, unknown>>;
