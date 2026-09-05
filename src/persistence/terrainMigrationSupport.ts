import type { GameState } from "../simulation/core/types";
import { findFishingWater } from "../simulation/fishing/FishingTuning";
import { MOUNT_TUNING } from "../simulation/mounts/Mounts";
import { HARBOR_DOCK } from "../world/WorldAnchors";
import { RIVER_FISHING_ACCESS_RESERVES, WorldLayout } from "../world/WorldLayout";

export interface Point { x: number; z: number; }

const WALKING_NORMAL_Y = Math.cos(38 * Math.PI / 180);

function isNevaPoint(point: Point): boolean {
  return !WorldLayout.isInterior(point.x, point.z)
    && WorldLayout.terrainPatchAt(point.x, point.z)?.id === "terrain.neva";
}

export function validLand(point: Point, mounted: boolean): boolean {
  if (!isNevaPoint(point) || !WorldLayout.isWalkable(point.x, point.z)
    || WorldLayout.isWater(point.x, point.z)
    || (mounted && WorldLayout.isPierDeck(point.x, point.z))) return false;
  const support = WorldLayout.traversalSurfaceSample(point.x, point.z);
  return support.normal.y >= (mounted ? MOUNT_TUNING.maximumSlopeNormalY : WALKING_NORMAL_Y);
}

export function nearestPoint(
  origin: Point,
  valid: (point: Point) => boolean,
  fallback: Point
): Point {
  if (valid(origin)) return { ...origin };
  for (let radius = 0.5; radius <= 72; radius += 0.5) {
    const steps = Math.max(16, Math.ceil(radius * 5));
    for (let step = 0; step < steps; step++) {
      const angle = step / steps * Math.PI * 2;
      const point = { x: origin.x + Math.cos(angle) * radius, z: origin.z + Math.sin(angle) * radius };
      if (valid(point)) return point;
    }
  }
  if (valid(fallback)) return { ...fallback };
  throw new Error("Terrain migration could not find safe Neva support");
}

export function groundPlayer(player: GameState["player"], point: Point): void {
  player.x = point.x;
  player.z = point.z;
  player.y = WorldLayout.traversalSurfaceHeight(point.x, point.z) + MOUNT_TUNING.playerPoseGroundOffsetMeters;
  player.traversal = { ...player.traversal, isGrounded: true };
  player.currentRegionId = WorldLayout.regionAt(point.x, point.z);
}

export function clearReach(origin: Point, bearing: number, distance: number): boolean {
  const wetAt = (along: number) => WorldLayout.isSailable(
    origin.x + Math.sin(bearing) * along,
    origin.z + Math.cos(bearing) * along
  );
  if (!wetAt(distance)) return false;
  let entered = false;
  for (let along = 0.5; along <= distance; along += 0.5) {
    const wet = wetAt(along);
    if ((!wet && entered) || (!wet && along > 12)) return false;
    entered ||= wet;
  }
  return true;
}

function fullReachBearing(origin: Point, bearing: number, distance: number): number | null {
  if (clearReach(origin, bearing, distance)) return bearing;
  const water = findFishingWater(origin.x, origin.z, bearing, distance, (x, z) => WorldLayout.isSailable(x, z));
  return water && Math.abs(water.distance - distance) < 1e-8
    && clearReach(origin, water.bearing, distance) ? water.bearing : null;
}

function fishingRefuges(): Point[] {
  return [
    ...RIVER_FISHING_ACCESS_RESERVES.map((reserve) => {
      const section = WorldLayout.riverSectionAt(reserve.z);
      const direction = reserve.side === "left" ? -1 : 1;
      const width = reserve.side === "left" ? section.leftWaterWidth : section.rightWaterWidth;
      return { x: section.centerX + direction * (width + 2), z: reserve.z };
    }),
    HARBOR_DOCK.playerPosition
  ];
}

export function repairAnglerReach(
  state: GameState,
  preferredBearing: number,
  distance: number
): number {
  const currentBearing = fullReachBearing(state.player, preferredBearing, distance);
  if (currentBearing !== null) return currentBearing;
  if (!state.player.activeBoatId) {
    for (const point of fishingRefuges()) {
      if (!validLand(point, false)) continue;
      const bearing = fullReachBearing(point, preferredBearing, distance);
      if (bearing === null) continue;
      groundPlayer(state.player, point);
      return bearing;
    }
  }
  throw new Error("Terrain migration could not preserve the active fishing reach");
}

