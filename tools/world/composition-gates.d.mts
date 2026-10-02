import type { SunreachCompositionSeedAudit, WorldCompositionAuditSummary } from "../../src/world/WorldCompositionAudit";

export function compositionFailures(
  audit: WorldCompositionAuditSummary,
  preservationReference: { compositionPlacementHashes?: Record<string, string> }
): string[];
export function sunreachCompositionFailures(audit: {
  seeds: readonly SunreachCompositionSeedAudit[];
  repeatedSeed42Hash: readonly [string, string];
}): string[];
