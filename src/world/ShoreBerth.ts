import { HARBOR_PIER_DECK } from "./WorldAnchors";
import { HARBOR_WORKING_PIERS, WORKING_PIER } from "./HarborDistrictLayout";
import { mainlandWaterSample } from "./NevaMainland";
import { oceanIsletForId } from "./OceanIslets";
import { WorldLayout } from "./WorldLayout";
import type { ShoreKind } from "./WorldGeographyTypes";
import type { WorldIslandId } from "./WorldIslands";

/**
 * Wild shore mooring. The hull stays in sailable water; the player steps onto
 * dry ground. Authored piers stay on `BOAT_MOORINGS`.
 *
 * `planShoreDock` may nudge an approach pose. `shoreBerthAt` only accepts a
 * pose that is already a hold, so a save can round-trip without a second nudge.
 * A later terrain migration that treats `isDocked && !dockedMooring` as drift
 * must call `shoreBerthAt` and leave a passing pose where it is.
 */

/** Catalog collision reach: bow/stern cuboids, not the beam. */
const HULL_METRICS = {
  "boat.rowboat": { halfLength: 2.1, halfBeam: 0.9, horizontalRadius: 2.3 },
  "boat.skiff": { halfLength: 3.3, halfBeam: 1.2, horizontalRadius: 3.3 },
  "boat.trading_ship": { halfLength: 5.7, halfBeam: 2.05, horizontalRadius: 6 }
} as const;

const DEFAULT_HULL = HULL_METRICS["boat.skiff"];
const PAD_SLOPE = 0.76;
const PIER_MARGIN_METERS = 2.2;
const OPEN_FAIRWAY_METERS = 40;

export const SHORE_DOCK_REFUSAL = {
  approach: "Approach a shore with room to step ashore",
  steep: "This shore is too steep to step ashore",
  dry: "There is no dry ground to step ashore",
  narrow: "This shore is too narrow for this vessel",
  skiff: "This landing is for the Coastal Fishing Skiff",
  occupied: "Another vessel is already moored here"
} as const;

export type ShoreDockRefusal = (typeof SHORE_DOCK_REFUSAL)[keyof typeof SHORE_DOCK_REFUSAL];

export interface ShoreHold {
  x: number;
  z: number;
  headingRadians: number;
  playerX: number;
  playerZ: number;
  /** Meters from the hull center that still count as beside this berth. */
  reachMeters: number;
}

export interface OccupiedHull {
  x: number;
  z: number;
  boatTypeId: string;
}

export type ShorePlan =
  | { ok: true; hold: ShoreHold }
  | { ok: false; reason: ShoreDockRefusal };

interface HullMetrics {
  halfLength: number;
  halfBeam: number;
  horizontalRadius: number;
}

interface BankFrame {
  distance: number;
  waterwardX: number;
  waterwardZ: number;
  tangentX: number;
  tangentZ: number;
  shoreKind: ShoreKind | null;
  islandId: WorldIslandId;
}

export function shoreHullMetrics(boatTypeId: string): HullMetrics {
  return HULL_METRICS[boatTypeId as keyof typeof HULL_METRICS] ?? DEFAULT_HULL;
}

function hypot2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function headingFromForward(forwardX: number, forwardZ: number): number {
  return Math.atan2(forwardX, forwardZ);
}

function forwardFromHeading(headingRadians: number): { x: number; z: number } {
  return { x: Math.sin(headingRadians), z: Math.cos(headingRadians) };
}

/** Nearest river, lake, or ocean edge. The normal is that field's own, not the blended water union. */
function nearestBank(x: number, z: number): BankFrame | null {
  let best: BankFrame | null = null;
  const consider = (frame: BankFrame | null): void => {
    if (!frame || frame.distance <= 0.2 || frame.distance > 36) return;
    if (!best || frame.distance < best.distance) best = frame;
  };
  consider(riverBank(x, z));
  consider(freshwaterBank(x, z));
  consider(coastBank(x, z));
  return best;
}

function riverBank(x: number, z: number): BankFrame | null {
  if (z > WorldLayout.coastlineZ(x) + 1.5) return null;
  const distance = WorldLayout.riverWaterSignedDistance(x, z);
  return frameFromField(x, z, distance, "island.neva", null, (px, pz) => WorldLayout.riverWaterSignedDistance(px, pz));
}

function freshwaterBank(x: number, z: number): BankFrame | null {
  const distance = mainlandWaterSample(x, z).signedDistance;
  if (distance <= -100) return null;
  return frameFromField(x, z, distance, "island.neva", null, (px, pz) => mainlandWaterSample(px, pz).signedDistance);
}

function coastBank(x: number, z: number): BankFrame | null {
  const shore = WorldLayout.shoreProjectionAt(x, z);
  if (shore.signedDistanceMeters <= 0.2 || shore.signedDistanceMeters > 36) return null;
  const waterwardX = shore.waterwardNormalXZ.x;
  const waterwardZ = shore.waterwardNormalXZ.z;
  const length = Math.hypot(waterwardX, waterwardZ);
  if (length < 0.05) return null;
  return {
    distance: shore.signedDistanceMeters,
    waterwardX: waterwardX / length,
    waterwardZ: waterwardZ / length,
    tangentX: -waterwardZ / length,
    tangentZ: waterwardX / length,
    shoreKind: shore.shoreKind,
    islandId: shore.islandId
  };
}

function frameFromField(
  x: number,
  z: number,
  distance: number,
  islandId: WorldIslandId,
  shoreKind: ShoreKind | null,
  sample: (x: number, z: number) => number
): BankFrame | null {
  if (distance <= 0.2 || distance > 36) return null;
  const step = 0.5;
  const dx = sample(x + step, z) - sample(x - step, z);
  const dz = sample(x, z + step) - sample(x, z - step);
  const length = Math.hypot(dx, dz);
  if (length < 0.05) return null;
  const waterwardX = dx / length;
  const waterwardZ = dz / length;
  return {
    distance,
    waterwardX,
    waterwardZ,
    tangentX: -waterwardZ,
    tangentZ: waterwardX,
    shoreKind,
    islandId
  };
}

/** True when the channel from this point out to sea is at least `requiredMeters` wide. */
function fairwayReaches(
  x: number,
  z: number,
  waterwardX: number,
  waterwardZ: number,
  nearDistance: number,
  requiredMeters: number
): boolean {
  if (nearDistance >= requiredMeters) return true;
  const limit = Math.min(OPEN_FAIRWAY_METERS, Math.ceil(requiredMeters - nearDistance));
  let reached = 0;
  for (let step = 1; step <= limit; step += 1) {
    const px = x + waterwardX * step;
    const pz = z + waterwardZ * step;
    if (!WorldLayout.isSailable(px, pz)) return nearDistance + reached >= requiredMeters;
    reached = step;
  }
  return nearDistance + reached >= requiredMeters;
}

function inExpandedMainPier(x: number, z: number): boolean {
  const dock = WorldLayout.landmark("dock");
  const angle = dock.rotationY - Math.PI / 2;
  const dx = x - dock.x;
  const dz = z - dock.z;
  const localX = dx * Math.cos(angle) - dz * Math.sin(angle);
  const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
  return Math.abs(localX) <= HARBOR_PIER_DECK.halfWidthX + PIER_MARGIN_METERS
    && Math.abs(localZ) <= HARBOR_PIER_DECK.halfLengthZ + PIER_MARGIN_METERS;
}

function inExpandedWorkingPier(x: number, z: number): boolean {
  for (const pier of HARBOR_WORKING_PIERS) {
    const dx = x - pier.x;
    const dz = z - pier.z;
    if (Math.abs(dx) > 16 || Math.abs(dz) > 16) continue;
    const c = Math.cos(pier.rotationY);
    const s = Math.sin(pier.rotationY);
    const localX = dx * c - dz * s;
    const localZ = dx * s + dz * c;
    if (Math.abs(localX) <= WORKING_PIER.halfLength + PIER_MARGIN_METERS
      && Math.abs(localZ) <= WORKING_PIER.halfWidth + PIER_MARGIN_METERS) return true;
  }
  return false;
}

function hullMeetsPier(x: number, z: number, headingRadians: number, halfLength: number): boolean {
  const forward = forwardFromHeading(headingRadians);
  const samples = [
    { x, z },
    { x: x + forward.x * halfLength, z: z + forward.z * halfLength },
    { x: x - forward.x * halfLength, z: z - forward.z * halfLength }
  ];
  return samples.some((sample) =>
    WorldLayout.isPierDeck(sample.x, sample.z)
    || inExpandedMainPier(sample.x, sample.z)
    || inExpandedWorkingPier(sample.x, sample.z)
  );
}

function endsAreAfloat(x: number, z: number, headingRadians: number, halfLength: number): boolean {
  const forward = forwardFromHeading(headingRadians);
  const bowX = x + forward.x * halfLength;
  const bowZ = z + forward.z * halfLength;
  const sternX = x - forward.x * halfLength;
  const sternZ = z - forward.z * halfLength;
  return WorldLayout.isSailable(x, z)
    && WorldLayout.isSailable(bowX, bowZ)
    && WorldLayout.isSailable(sternX, sternZ);
}

function dryPad(
  x: number,
  z: number,
  bank: BankFrame,
  hull: HullMetrics
): { x: number; z: number } | "steep" | null {
  let steep = false;
  let closest: { x: number; z: number; distance: number } | null = null;
  const minDistance = hull.horizontalRadius + 0.35;
  const maxDistance = hull.horizontalRadius + 2.6;
  for (let distance = minDistance; distance <= maxDistance + 0.001; distance += 0.4) {
    for (const lateral of [0, -1.5, 1.5]) {
      const px = x - bank.waterwardX * distance + bank.tangentX * lateral;
      const pz = z - bank.waterwardZ * distance + bank.tangentZ * lateral;
      const reached = hypot2(px, pz, x, z);
      if (reached < minDistance || reached > maxDistance + 1.6) continue;
      if (!isDryFooting(px, pz)) {
        if (WorldLayout.isWalkable(px, pz) && !WorldLayout.isWater(px, pz) && WorldLayout.terrainNormalY(px, pz) < PAD_SLOPE) {
          steep = true;
        }
        continue;
      }
      if (!closest || reached < closest.distance) closest = { x: px, z: pz, distance: reached };
    }
  }
  if (closest) return closest;
  return steep ? "steep" : null;
}

function isDryFooting(x: number, z: number): boolean {
  if (!WorldLayout.isWalkable(x, z) || WorldLayout.isWater(x, z)) return false;
  if (WorldLayout.isInterior(x, z) || WorldLayout.isPierDeck(x, z) || WorldLayout.isPierStairs(x, z)) return false;
  if (WorldLayout.isBridgeDeck(x, z) || WorldLayout.isBridgeApproach(x, z)) return false;
  return WorldLayout.terrainNormalY(x, z) >= PAD_SLOPE;
}

function typeRefusal(bank: BankFrame, boatTypeId: string): ShoreDockRefusal | null {
  if (bank.shoreKind === "cliff") return SHORE_DOCK_REFUSAL.steep;
  if (oceanIsletForId(bank.islandId) && boatTypeId !== "boat.skiff") return SHORE_DOCK_REFUSAL.skiff;
  return null;
}

function assess(
  x: number,
  z: number,
  headingRadians: number,
  boatTypeId: string
): { ok: true; hold: ShoreHold } | { ok: false; reason: ShoreDockRefusal } {
  const hull = shoreHullMetrics(boatTypeId);
  if (!endsAreAfloat(x, z, headingRadians, hull.halfLength)) return { ok: false, reason: SHORE_DOCK_REFUSAL.approach };
  const bank = nearestBank(x, z);
  if (!bank || bank.distance > hull.halfLength + 4) return { ok: false, reason: SHORE_DOCK_REFUSAL.approach };
  const typed = typeRefusal(bank, boatTypeId);
  if (typed) return { ok: false, reason: typed };
  if (hullMeetsPier(x, z, headingRadians, hull.halfLength)) return { ok: false, reason: SHORE_DOCK_REFUSAL.dry };
  if (!fairwayReaches(x, z, bank.waterwardX, bank.waterwardZ, bank.distance, hull.halfLength * 2)) {
    return { ok: false, reason: SHORE_DOCK_REFUSAL.narrow };
  }
  const pad = dryPad(x, z, bank, hull);
  if (pad === "steep") return { ok: false, reason: SHORE_DOCK_REFUSAL.steep };
  if (!pad) return { ok: false, reason: SHORE_DOCK_REFUSAL.dry };
  return {
    ok: true,
    hold: {
      x,
      z,
      headingRadians,
      playerX: pad.x,
      playerZ: pad.z,
      reachMeters: hypot2(pad.x, pad.z, x, z) + 0.8
    }
  };
}

function occupiedBy(hold: ShoreHold, boatTypeId: string, occupied: readonly OccupiedHull[]): boolean {
  const hull = shoreHullMetrics(boatTypeId);
  return occupied.some((other) => {
    const otherHull = shoreHullMetrics(other.boatTypeId);
    return hypot2(hold.x, hold.z, other.x, other.z) < hull.horizontalRadius + otherHull.horizontalRadius - 0.4;
  });
}

/**
 * Nudge an approach pose onto a hold parallel to the bank.
 * Overlap with another docked hull is refused here and is not part of save validation.
 */
export function planShoreDock(
  x: number,
  z: number,
  headingRadians: number,
  boatTypeId: string,
  occupied: readonly OccupiedHull[] = []
): ShorePlan {
  const hull = shoreHullMetrics(boatTypeId);
  if (!WorldLayout.isSailable(x, z)) return { ok: false, reason: SHORE_DOCK_REFUSAL.approach };
  const bank = nearestBank(x, z);
  if (!bank || bank.distance > hull.halfLength + 6) return { ok: false, reason: SHORE_DOCK_REFUSAL.approach };
  const typed = typeRefusal(bank, boatTypeId);
  if (typed) return { ok: false, reason: typed };
  if (!fairwayReaches(x, z, bank.waterwardX, bank.waterwardZ, bank.distance, hull.halfLength * 2)) {
    return { ok: false, reason: SHORE_DOCK_REFUSAL.narrow };
  }

  const forward = forwardFromHeading(headingRadians);
  const tangentDot = bank.tangentX * forward.x + bank.tangentZ * forward.z;
  const sign = tangentDot >= 0 ? 1 : -1;
  const alongX = bank.tangentX * sign;
  const alongZ = bank.tangentZ * sign;
  const nextHeading = headingFromForward(alongX, alongZ);
  const boundaryX = x - bank.waterwardX * bank.distance;
  const boundaryZ = z - bank.waterwardZ * bank.distance;
  const minOffshore = hull.halfBeam + 0.55;
  const startOffshore = Math.max(minOffshore, Math.min(bank.distance, minOffshore + 1.5));
  let blocked = false;
  let dry = false;
  let steep = false;
  let sawOccupied = false;

  for (const extra of [0, 0.7, 1.5, 2.6]) {
    for (const lateral of [0, -2.2, 2.2, -4.4, 4.4]) {
      const offshore = startOffshore + extra;
      const cx = boundaryX + bank.waterwardX * offshore + bank.tangentX * lateral;
      const cz = boundaryZ + bank.waterwardZ * offshore + bank.tangentZ * lateral;
      if (hypot2(cx, cz, x, z) > hull.halfLength + 6) continue;
      const planned = assess(cx, cz, nextHeading, boatTypeId);
      if (!planned.ok) {
        if (planned.reason === SHORE_DOCK_REFUSAL.narrow) blocked = true;
        else if (planned.reason === SHORE_DOCK_REFUSAL.steep) steep = true;
        else if (planned.reason === SHORE_DOCK_REFUSAL.dry) dry = true;
        continue;
      }
      if (occupiedBy(planned.hold, boatTypeId, occupied)) {
        sawOccupied = true;
        continue;
      }
      return planned;
    }
  }
  if (sawOccupied) return { ok: false, reason: SHORE_DOCK_REFUSAL.occupied };
  if (steep) return { ok: false, reason: SHORE_DOCK_REFUSAL.steep };
  if (blocked) return { ok: false, reason: SHORE_DOCK_REFUSAL.narrow };
  return { ok: false, reason: dry ? SHORE_DOCK_REFUSAL.dry : SHORE_DOCK_REFUSAL.approach };
}

/** True when a saved hull is already a wild hold. Does not nudge and ignores other boats. */
export function shoreBerthAt(
  x: number,
  z: number,
  headingRadians: number,
  boatTypeId: string
): ShoreHold | null {
  const planned = assess(x, z, headingRadians, boatTypeId);
  return planned.ok ? planned.hold : null;
}
