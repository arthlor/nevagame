import type { GameState } from "../simulation/core/types";

/** Existing fish and pending jobs retain their identity and economic snapshots. */
export function migrateFarmPacks64(previous: GameState): GameState {
  return { ...structuredClone(previous), schemaVersion: 64 };
}
