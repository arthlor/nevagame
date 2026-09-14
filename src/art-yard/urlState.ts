export function resolveArtYardAssetId(
  requestedAssetId: string | null,
  availableAssetIds: ReadonlySet<string>,
  fallbackAssetId: string
): string {
  return requestedAssetId && availableAssetIds.has(requestedAssetId)
    ? requestedAssetId
    : fallbackAssetId;
}

/** Ground beds that may be requested with `?ground=`; `grass` is the default and stays implicit. */
export const ART_YARD_GROUND_KINDS = ["grass", "meadow", "sand", "rock", "grid", "none"] as const;
export type ArtYardGroundKind = typeof ART_YARD_GROUND_KINDS[number];

export function resolveArtYardGround(requested: string | null): ArtYardGroundKind {
  return (ART_YARD_GROUND_KINDS as readonly string[]).includes(requested ?? "")
    ? requested as ArtYardGroundKind
    : "grass";
}

export function syncArtYardGroundUrl(currentUrl: URL, ground: ArtYardGroundKind): URL {
  const next = new URL(currentUrl);
  if (ground === "grass") next.searchParams.delete("ground");
  else next.searchParams.set("ground", ground);
  return next;
}

export function syncArtYardAssetUrl(currentUrl: URL, assetId: string): URL {
  const next = new URL(currentUrl);
  if (assetId.startsWith("__showcase_")) next.searchParams.delete("asset");
  else next.searchParams.set("asset", assetId);
  return next;
}
