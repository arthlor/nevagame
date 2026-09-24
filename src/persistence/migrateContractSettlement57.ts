import type { GameState } from "../simulation/core/types";

/**
 * v56 -> v57. In-flight deliveries did not retain the grade or fish instance
 * needed to reconstruct an exact sale quote. Mark only those existing units as
 * legacy; future deliveries record their value separately.
 */
export function migrateContractSettlement57(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.contracts = state.contracts.map((contract) => ({
    ...contract,
    deliveredValueMoney: 0,
    legacyUnvaluedQuantity: contract.status === "active" ? contract.quantityFulfilled : 0
  }));
  state.schemaVersion = 57;
  return state;
}
