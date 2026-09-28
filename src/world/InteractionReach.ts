import { WorldLayout } from "./WorldLayout";

/**
 * Close-range reach shared by farming prompts, planting, chore stations and
 * workshop commits. Measured to the interaction point or the near surface of
 * a crop, not to the center of a large asset and not across a whole farm.
 */
export const CLOSE_INTERACTION_REACH_METERS = 1.75;

/** Player stance sits this far above the traversal surface. */
export const INTERACTION_STANCE_OFFSET_METERS = 0.5;

/**
 * How far the player's stance may sit off the target's surface. A step and a
 * slope stay usable; another floor or a cliff does not.
 */
export const INTERACTION_VERTICAL_BAND_METERS = 2;

export type InteractionReachFailure = "too-far" | "wrong-level";

export function interactionVerticalGap(playerY: number, x: number, z: number): number {
  return Math.abs(
    playerY - WorldLayout.traversalSurfaceHeight(x, z) - INTERACTION_STANCE_OFFSET_METERS
  );
}

export function assessInteractionReach(
  player: { x: number; y: number; z: number },
  point: { x: number; z: number },
  reachMeters: number
): { ok: boolean; failure?: InteractionReachFailure; distanceMeters: number } {
  const distanceMeters = Math.hypot(player.x - point.x, player.z - point.z);
  if (distanceMeters > reachMeters) return { ok: false, failure: "too-far", distanceMeters };
  if (interactionVerticalGap(player.y, point.x, point.z) > INTERACTION_VERTICAL_BAND_METERS) {
    return { ok: false, failure: "wrong-level", distanceMeters };
  }
  return { ok: true, distanceMeters };
}
