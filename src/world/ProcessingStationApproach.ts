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

/** Returns the world-space point in front of the station's authored local -Z face. */
export function getProcessingStationFrontPosition(
  stationId: string,
  station: ProcessingStationPoint
): ProcessingStationPoint | null {
  const approach = getProcessingStationApproach(stationId);
  if (!approach) return null;

  // Three.js/glTF yaw maps the authored local -Z working face to this world
  // direction. Keep the sign here aligned with the runtime model transform.
  const frontX = -Math.sin(approach.rotationY);
  const frontZ = -Math.cos(approach.rotationY);
  return {
    x: station.x + frontX * approach.frontApproachDistanceMeters,
    z: station.z + frontZ * approach.frontApproachDistanceMeters
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
  const frontDirectionX = -Math.sin(approach.rotationY);
  const frontDirectionZ = -Math.cos(approach.rotationY);
  const frontAlignment = centerDistance > 0.0001
    ? (centerToPlayerX * frontDirectionX + centerToPlayerZ * frontDirectionZ) / centerDistance
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
