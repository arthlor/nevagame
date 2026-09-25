import type { GameState } from "../simulation/core/types";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

/** Layout revision produced by the derived cove shore, seabed and valley repair. */
export const COVE_SHORE_LAYOUT_REVISION = 30;

/**
 * v59 -> v60. The cove's shore becomes a derived curve with points, bights and
 * a river estuary, its seabed eases from the shelf onto a sheltered floor, and
 * the freshwater valley no longer stops at straight steps. Supported actors
 * keep their X/Z and are re-grounded; a pose left in new water or on newly
 * steep or blocked ground moves to the nearest safe Neva support, and boats
 * stranded by new land return to a compatible mooring. Crops, cargo, economy
 * and quest truth are untouched.
 */
export function migrateCoveShore60(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 60, COVE_SHORE_LAYOUT_REVISION);
}
