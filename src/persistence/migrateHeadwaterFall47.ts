import type { GameState } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";
import { HARBOR_SKIFF_MOORING } from "../world/WorldAnchors";
import { isInHeadwaterGrayboxEnvelope } from "../world/HeadwaterWaterfallGraybox";
import { playerPoseFromMount } from "../simulation/mounts/Mounts";
import { groundPlayer, nearestPoint, validLand, type Point } from "./terrainMigrationSupport";

/** Layout revision this migration produces. */
export const HEADWATER_FALL_LAYOUT_REVISION = 21;

/**
 * The spring rest stop is the authored safe standing place inside the
 * envelope; it is used only when local recovery cannot find ground.
 */
const HEADWATER_RECOVERY_ANCHOR: Point = Object.freeze({ x: -37.8, z: -147.1 });

/**
 * v46 -> v47, layout 20 -> 21. The headwater reach stops being a smooth ramp:
 * a lip crest at z = -136, an explicit fall face down to the landing at
 * -134.5, and a level plunge pool that drains to the sea-level handoff, set
 * in a raised cirque (east crag, northern headwall) that leaves the locked
 * source, lip, landing, pool and handoff numbers untouched. This step
 * re-authors only that envelope.
 *
 * Only persistent positional state inside the envelope may change:
 * - the pose is preserved when it is still valid standing ground (Y re-derived);
 * - otherwise it moves the shortest distance to the nearest valid standing
 *   ground, staying inside the same island and reach;
 * - the authored spring rest stop is the last resort, and every other field
 *   (inventory, cargo, farm, quests, clock, RNG, IDs, ownership) is untouched.
 */
export function migrateHeadwaterFall47(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = 47;
  state.world.layoutRevision = HEADWATER_FALL_LAYOUT_REVISION;

  const inEnvelope = (pose: { x: number; z: number }): boolean =>
    isInHeadwaterGrayboxEnvelope(pose.x, pose.z);

  // Mounts first: a mounted player is re-derived from the animal's resolved
  // pose, so the rider never separates from the mount it is sitting on.
  const riddenMountId = state.player.activeMountId;
  for (const [mountId, mount] of Object.entries(state.mounts ?? {})) {
    if (!inEnvelope(mount)) continue;
    const point = nearestPoint(mount, (candidate) => validLand(candidate, true), HEADWATER_RECOVERY_ANCHOR);
    mount.x = point.x;
    mount.z = point.z;
    mount.y = WorldLayout.traversalSurfaceHeight(point.x, point.z);
    if (mountId === riddenMountId) Object.assign(state.player, playerPoseFromMount(mount));
  }

  if (inEnvelope(state.player) && !(riddenMountId && inEnvelope(state.mounts[riddenMountId] ?? {}))) {
    const point = nearestPoint(state.player, (candidate) => validLand(candidate, false), HEADWATER_RECOVERY_ANCHOR);
    groundPlayer(state.player, point);
  }

  for (const structure of Object.values(state.world.structures ?? {})) {
    if (!inEnvelope(structure)) continue;
    const point = nearestPoint(structure, (candidate) => validLand(candidate, false), HEADWATER_RECOVERY_ANCHOR);
    structure.x = point.x;
    structure.z = point.z;
    structure.y = WorldLayout.terrainHeight(point.x, point.z);
  }

  // Boats cannot reach the headwater: it is not sailable water, upstream of
  // the estuary. If a development build ever wrote one inside the envelope,
  // re-dock it at the harbor mooring rather than leaving a hull on land.
  for (const boat of Object.values(state.boats ?? {})) {
    if (!inEnvelope(boat)) continue;
    boat.x = HARBOR_SKIFF_MOORING.boatPosition.x;
    boat.z = HARBOR_SKIFF_MOORING.boatPosition.z;
    boat.y = 0;
    boat.isDocked = true;
    boat.dockedMarketId = HARBOR_SKIFF_MOORING.marketId;
  }

  return state;
}
