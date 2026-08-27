/**
 * Pure approach geometry for the processing stations.
 *
 * Station positions live in the serializable simulation state, but their
 * authored facing and working-face offsets belong to the static world layout.
 * Keep this module free of rendering and mutable simulation state so the app
 * and simulation validate the same physical approach contract.
 */
import { starterStructureAnchor } from "./FarmLayout";
import { HARBOR_FISH_TABLE } from "./WorldAnchors";

export const PROCESSING_STATION_INTERACTION_RADIUS = 1.5;
export const PROCESSING_STATION_FRONT_ALIGNMENT_MIN = 0.5;

/**
 * The Blender generators author station working faces on local negative depth.
 * The Y-up GLB conversion maps that depth to runtime positive Z, so the
 * placed asset needs one half-turn to make its authored face runtime -Z.
 * This is presentation/layout metadata only; it never enters WorldState.
 */
export const PROCESSING_STATION_ASSET_YAW_CORRECTION = Math.PI;

export const PROCESSING_STATION_IDS = [
  "struct.starter_mill",
  "struct.workbench",
  "struct.starter_compost",
  HARBOR_FISH_TABLE.structureId
] as const;

export type ProcessingStationId = (typeof PROCESSING_STATION_IDS)[number];

export interface ProcessingStationApproachDefinition {
  stationId: ProcessingStationId;
  rotationY: number;
  frontApproachDistanceMeters: number;
}

export interface ProcessingStationPoint {
  x: number;
  z: number;
}

export type ProcessingStationApproachFailure = "unknown-station" | "too-far" | "wrong-side";

export interface ProcessingStationApproachAssessment {
  valid: boolean;
  reason?: ProcessingStationApproachFailure;
  frontPosition: ProcessingStationPoint | null;
  distanceMeters: number;
  frontAlignment: number;
}

const MILL = starterStructureAnchor("struct.starter_mill")!;
const WORKBENCH = starterStructureAnchor("struct.workbench")!;
const COMPOST = starterStructureAnchor("struct.starter_compost")!;

export const PROCESSING_STATION_APPROACHES: readonly ProcessingStationApproachDefinition[] = [
  {
    stationId: "struct.starter_mill",
    rotationY: MILL.rotationY,
    frontApproachDistanceMeters: MILL.frontApproachDistanceMeters
  },
  {
    stationId: "struct.workbench",
    rotationY: WORKBENCH.rotationY,
    frontApproachDistanceMeters: WORKBENCH.frontApproachDistanceMeters
  },
  {
    stationId: "struct.starter_compost",
    rotationY: COMPOST.rotationY,
    frontApproachDistanceMeters: COMPOST.frontApproachDistanceMeters
  },
  {
    stationId: HARBOR_FISH_TABLE.structureId,
    rotationY: HARBOR_FISH_TABLE.rotationY,
    frontApproachDistanceMeters: HARBOR_FISH_TABLE.frontApproachDistanceMeters
  }
] as const;

const APPROACH_BY_STATION_ID = new Map<string, ProcessingStationApproachDefinition>(
  PROCESSING_STATION_APPROACHES.map((approach) => [approach.stationId, approach])
);

export function getProcessingStationApproach(stationId: string): ProcessingStationApproachDefinition | undefined {
  return APPROACH_BY_STATION_ID.get(stationId);
}

/** DEV layout editor: session-only facing update. Does not persist and is not a schema migration. */
export function debugRelocateProcessingStationApproach(stationId: string, rotationY: number): boolean {
  const approach = APPROACH_BY_STATION_ID.get(stationId);
  if (!approach) return false;
  (approach as { rotationY: number }).rotationY = rotationY;
  return true;
}

/** Returns the runtime yaw that aligns the published GLB working face with the authored approach. */
export function getProcessingStationRuntimeRotationY(stationId: ProcessingStationId): number {
  const approach = getProcessingStationApproach(stationId);
  if (!approach) throw new Error(`Missing processing station approach for ${stationId}`);
  return approach.rotationY + PROCESSING_STATION_ASSET_YAW_CORRECTION;
}

function authoredFrontDirection(rotationY: number): ProcessingStationPoint {
  return {
    x: -Math.sin(rotationY),
    z: -Math.cos(rotationY)
  };
}

/** Returns the world-space point in front of the station's authored local -Z face. */
export function getProcessingStationFrontPosition(
  stationId: string,
  station: ProcessingStationPoint
): ProcessingStationPoint | null {
  const approach = getProcessingStationApproach(stationId);
  if (!approach) return null;

  const frontDirection = authoredFrontDirection(approach.rotationY);
  return {
    x: station.x + frontDirection.x * approach.frontApproachDistanceMeters,
    z: station.z + frontDirection.z * approach.frontApproachDistanceMeters
  };
}

export function assessProcessingStationApproach(
  stationId: string,
  player: ProcessingStationPoint,
  station: ProcessingStationPoint
): ProcessingStationApproachAssessment {
  const approach = getProcessingStationApproach(stationId);
  const frontPosition = getProcessingStationFrontPosition(stationId, station);
  if (!approach || !frontPosition) {
    return {
      valid: false,
      reason: "unknown-station",
      frontPosition: null,
      distanceMeters: Number.POSITIVE_INFINITY,
      frontAlignment: -1
    };
  }

  const distanceMeters = Math.hypot(player.x - frontPosition.x, player.z - frontPosition.z);
  if (distanceMeters > PROCESSING_STATION_INTERACTION_RADIUS) {
    return {
      valid: false,
      reason: "too-far",
      frontPosition,
      distanceMeters,
      frontAlignment: -1
    };
  }

  const centerToPlayerX = player.x - station.x;
  const centerToPlayerZ = player.z - station.z;
  const centerDistance = Math.hypot(centerToPlayerX, centerToPlayerZ);
  const frontDirection = authoredFrontDirection(approach.rotationY);
  const frontAlignment = centerDistance > 0.0001
    ? (centerToPlayerX * frontDirection.x + centerToPlayerZ * frontDirection.z) / centerDistance
    : -1;

  if (frontAlignment < PROCESSING_STATION_FRONT_ALIGNMENT_MIN) {
    return {
      valid: false,
      reason: "wrong-side",
      frontPosition,
      distanceMeters,
      frontAlignment
    };
  }

  return {
    valid: true,
    frontPosition,
    distanceMeters,
    frontAlignment
  };
}
