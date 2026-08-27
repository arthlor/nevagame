export interface PracticalLightFocus {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PracticalLightPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function isPracticalLightSourceName(name: string): boolean {
  return name.endsWith("_glow") || name.endsWith("_beacon");
}

export function uniquePracticalLightSourceNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const sources: string[] = [];
  for (const name of names) {
    if (!isPracticalLightSourceName(name) || seen.has(name)) continue;
    seen.add(name);
    sources.push(name);
  }
  return sources;
}

function distanceSquared(position: PracticalLightPosition, focus: PracticalLightFocus): number {
  const dx = position.x - focus.x;
  const dy = position.y - focus.y;
  const dz = position.z - focus.z;
  return dx * dx + dy * dy + dz * dz;
}

/** Nearest lights to the gameplay focus, then original index for a stable tie-break. */
export function selectNearestPracticalLightIndices(
  positions: readonly PracticalLightPosition[],
  focus: PracticalLightFocus,
  budget: number
): number[] {
  const cap = Math.max(0, Math.floor(budget));
  if (cap === 0 || positions.length === 0) return [];
  return positions
    .map((_, index) => index)
    .sort((left, right) => {
      const distanceDelta = distanceSquared(positions[left]!, focus) - distanceSquared(positions[right]!, focus);
      return distanceDelta !== 0 ? distanceDelta : left - right;
    })
    .slice(0, Math.min(cap, positions.length));
}
