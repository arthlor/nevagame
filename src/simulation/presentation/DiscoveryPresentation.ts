import { WORLD_DISCOVERIES } from "../../content/discoveries";
import type { GameState } from "../core/types";

export function buildNewDiscoveries(state: GameState) {
  if (state.player.activeBoatId) return [];
  return WORLD_DISCOVERIES.filter((entry) => !state.journal.unlockedKnowledge.includes(entry.id)
    && Math.hypot(state.player.x - entry.position.x, state.player.z - entry.position.z) <= 5);
}
