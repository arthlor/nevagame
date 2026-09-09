export function preservationDifferences(current: Record<string, unknown>, reference: Record<string, unknown>): string[];
export function placementDifferences(seeds: Array<{ seed: number; placementHash: string }>, reference: { compositionPlacementHashes?: Record<string, string> }): string[];
