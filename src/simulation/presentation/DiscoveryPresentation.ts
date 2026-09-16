import { WORLD_DISCOVERIES } from "../../content/discoveries";
import type { GameState } from "../core/types";

export function buildNewDiscoveries(state: GameState) {
  return WORLD_DISCOVERIES.filter((entry) => !state.journal.unlockedKnowledge.includes(entry.id)
    && (entry.arrival === "boat" ? Boolean(state.player.activeBoatId) : !state.player.activeBoatId)
    && Math.hypot(state.player.x - entry.position.x, state.player.z - entry.position.z) <= (entry.radiusMeters ?? 5));
}
