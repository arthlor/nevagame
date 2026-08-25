export function resolveArtYardAssetId(
  requestedAssetId: string | null,
  availableAssetIds: ReadonlySet<string>,
  fallbackAssetId: string
): string {
  return requestedAssetId && availableAssetIds.has(requestedAssetId)
    ? requestedAssetId
    : fallbackAssetId;
}

export function syncArtYardAssetUrl(currentUrl: URL, assetId: string): URL {
  const next = new URL(currentUrl);
  if (assetId.startsWith("__showcase_")) next.searchParams.delete("asset");
  else next.searchParams.set("asset", assetId);
  return next;
}
