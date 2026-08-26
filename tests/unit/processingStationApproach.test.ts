import { describe, expect, it } from "vitest";
import { starterStructureAnchor } from "../../src/world/FarmLayout";
import { HARBOR_FISH_TABLE } from "../../src/world/WorldAnchors";
import {
  assessProcessingStationApproach,
  getProcessingStationApproach,
  getProcessingStationFrontPosition,
  PROCESSING_STATION_IDS,
  PROCESSING_STATION_INTERACTION_RADIUS
} from "../../src/world/ProcessingStationApproach";

const STATIONS = [
  { stationId: "struct.starter_mill", center: starterStructureAnchor("struct.starter_mill")! },
  { stationId: "struct.workbench", center: starterStructureAnchor("struct.workbench")! },
  { stationId: "struct.starter_compost", center: starterStructureAnchor("struct.starter_compost")! },
  {
    stationId: HARBOR_FISH_TABLE.structureId,
    center: { x: HARBOR_FISH_TABLE.position.x, z: HARBOR_FISH_TABLE.position.z }
  }
] as const;

describe("processing station front approach", () => {
  it("defines exactly the four interactive station fronts", () => {
    expect(PROCESSING_STATION_IDS).toEqual([
      "struct.starter_mill",
      "struct.workbench",
      "struct.starter_compost",
      HARBOR_FISH_TABLE.structureId
    ]);
  });

  it("transforms every authored local -Z face into a world-space target", () => {
    for (const { stationId, center } of STATIONS) {
      const approach = getProcessingStationApproach(stationId);
      const front = getProcessingStationFrontPosition(stationId, center);
      expect(approach).toBeDefined();
      expect(front).not.toBeNull();

      const expected = {
        x: center.x - Math.sin(approach!.rotationY) * approach!.frontApproachDistanceMeters,
        z: center.z - Math.cos(approach!.rotationY) * approach!.frontApproachDistanceMeters
      };
      expect(front).toMatchObject({
        x: expect.closeTo(expected.x, 8),
        z: expect.closeTo(expected.z, 8)
      });
      expect(Math.hypot(front!.x - center.x, front!.z - center.z))
        .toBeCloseTo(approach!.frontApproachDistanceMeters, 8);
    }
  });

  it("accepts a close front approach and rejects center, side, rear, and distant positions", () => {
    for (const { stationId, center } of STATIONS) {
      const approach = getProcessingStationApproach(stationId)!;
      const front = getProcessingStationFrontPosition(stationId, center)!;
      const frontDirection = {
        x: -Math.sin(approach.rotationY),
        z: -Math.cos(approach.rotationY)
      };
      const sideDirection = { x: -frontDirection.z, z: frontDirection.x };

      expect(assessProcessingStationApproach(stationId, front, center)).toMatchObject({
        valid: true,
        distanceMeters: expect.closeTo(0, 8)
      });
      expect(assessProcessingStationApproach(stationId, center, center).valid).toBe(false);
      expect(assessProcessingStationApproach(
        stationId,
        {
          x: center.x + sideDirection.x * Math.min(approach.frontApproachDistanceMeters, 1),
          z: center.z + sideDirection.z * Math.min(approach.frontApproachDistanceMeters, 1)
        },
        center
      ).valid).toBe(false);
      expect(assessProcessingStationApproach(
        stationId,
        {
          x: center.x - frontDirection.x * approach.frontApproachDistanceMeters,
          z: center.z - frontDirection.z * approach.frontApproachDistanceMeters
        },
        center
      ).valid).toBe(false);
      expect(assessProcessingStationApproach(
        stationId,
        {
          x: front.x + frontDirection.x * (PROCESSING_STATION_INTERACTION_RADIUS + 0.01),
          z: front.z + frontDirection.z * (PROCESSING_STATION_INTERACTION_RADIUS + 0.01)
        },
        center
      )).toMatchObject({ valid: false, reason: "too-far" });
    }
  });

  it("rejects an unknown station without falling back to its center", () => {
    expect(assessProcessingStationApproach("struct.unknown", { x: 0, z: 0 }, { x: 0, z: 0 }))
      .toMatchObject({ valid: false, reason: "unknown-station", frontPosition: null });
  });
});
