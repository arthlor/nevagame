import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { HARBOR_MARKET, RIVER_CROSSING, VILLAGE_PLAZA, WORLD_SPAWN } from "../../world/WorldAnchors";

/** Hubs whose nearby trees should enter the baked sun-shadow proxy. */
export const VEGETATION_SHADOW_FOCI = [
  WORLD_SPAWN.playerPosition,
  VILLAGE_PLAZA,
  HARBOR_MARKET.position,
  RIVER_CROSSING
] as const;

export function isWithinVegetationCastRange(
  x: number,
  z: number,
  playerX: number,
  playerZ: number,
  maxMeters: number = CANONICAL_RENDER_CONFIG.shadows.vegetationCastDistanceMeters
): boolean {
  if (Math.hypot(x - playerX, z - playerZ) <= maxMeters) return true;
  return VEGETATION_SHADOW_FOCI.some((focus) => Math.hypot(x - focus.x, z - focus.z) <= maxMeters);
}
