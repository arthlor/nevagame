export function constantName(assetId: string): string;
export function renderGeneratedCatalog(catalog: {
  assets: Array<{ id: string; family: string }>;
}): string;
