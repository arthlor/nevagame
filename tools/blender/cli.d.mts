export interface ArtCliArgs {
  command: string;
  assets: string[];
  families: string[];
  all: boolean;
  publish: boolean;
  strict: boolean;
  stage: string | null;
}

export interface CatalogAsset {
  id: string;
  file: string;
  family: string;
  generator: string;
  palette: string[];
  parameters: Record<string, unknown>;
}

export function parseArgs(argv: string[]): ArtCliArgs;
export function safeFilename(value: string): boolean;
export function validateCatalog(): {
  catalog: { assets: CatalogAsset[] };
  palette: { tokens: Record<string, unknown> };
  specHash: string;
};
export function validateGeneratorParameters(asset: {
  id: string;
  generator: string;
  parameters: Record<string, unknown>;
}): true;
export function selectAssets(
  catalog: { assets: CatalogAsset[] },
  args: ArtCliArgs,
): CatalogAsset[];
export function resolvePreviewSource(
  stageValue: string | null,
  assets: CatalogAsset[],
): { name: string; assetDir: string; report: Record<string, unknown> | null };
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
): Record<string, unknown>;
