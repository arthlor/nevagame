import { describe, expect, it } from "vitest";
import { farmLocalToWorld, STARTER_FARM_LAYOUT, starterStructureAnchor } from "../../src/world/FarmLayout";
import { HARBOR_DOCK, HARBOR_FISH_TABLE, VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { collisionPrimitivesForAsset } from "../../src/physics/CollisionCatalogAdapter";
import {
  assessProcessingStationApproach,
  getProcessingStationApproach,
  getProcessingStationFrontPosition,
  getProcessingStationRuntimeRotationY,
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

function nearestPointOnPath(point: { x: number; z: number }, path: typeof STARTER_FARM_LAYOUT.paths[number]) {
  const points = path.points.map((candidate) => farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, candidate));
  let closest = points[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const progress = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared))
      : 0;
    const candidate = { x: start.x + dx * progress, z: start.z + dz * progress };
    const distance = Math.hypot(point.x - candidate.x, point.z - candidate.z);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

function directionFromCenter(center: { x: number; z: number }, point: { x: number; z: number }) {
  const x = point.x - center.x;
  const z = point.z - center.z;
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}

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

  it("authors each front onto a usable approach corridor", () => {
    const compost = starterStructureAnchor("struct.starter_compost")!;
    const workPath = STARTER_FARM_LAYOUT.paths.find((path) => path.id === "farm-work-zone")!;
    const workbenchAccess = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, workPath.points.at(-2)!);
    const compostAccess = nearestPointOnPath(compost, workPath);
    const millAccess = VILLAGE_MARKET.position;
    const accessPoints = new Map([
      ["struct.workbench", workbenchAccess],
      ["struct.starter_compost", compostAccess],
      ["struct.starter_mill", millAccess],
      [HARBOR_FISH_TABLE.structureId, HARBOR_DOCK.playerPosition]
    ]);

    for (const { stationId, center } of STATIONS) {
      const approach = getProcessingStationApproach(stationId)!;
      const front = getProcessingStationFrontPosition(stationId, center)!;
      const accessDirection = directionFromCenter(center, accessPoints.get(stationId)!);
      const authoredDirection = {
        x: -Math.sin(approach.rotationY),
        z: -Math.cos(approach.rotationY)
      };
      expect(WorldLayout.isWalkable(front.x, front.z), stationId).toBe(true);
      expect(WorldLayout.isWater(front.x, front.z), stationId).toBe(false);
      expect(
        authoredDirection.x * accessDirection.x + authoredDirection.z * accessDirection.z,
        stationId
      ).toBeGreaterThan(0.75);
    }
  });

  it("keeps the workbench collider in runtime Y-up axes", () => {
    const [primitive] = collisionPrimitivesForAsset(ASSET_IDS.PROP_FARM_WORKBENCH_A);
    expect(primitive).toMatchObject({
      center: [0, 0, 0.8],
      halfExtents: [1.05, 0.48, 0.8]
    });
  });

  it("aligns each published GLB working face with the authored local -Z approach", () => {
    for (const { stationId } of STATIONS) {
      const approach = getProcessingStationApproach(stationId)!;
      const runtimeRotationY = getProcessingStationRuntimeRotationY(stationId)!;
      // A published station mesh exposes its working side on runtime +Z. The
      // adapter half-turn makes that side equal to the authored approach -Z.
      const publishedWorkingDirection = {
        x: Math.sin(runtimeRotationY),
        z: Math.cos(runtimeRotationY)
      };
      expect(publishedWorkingDirection.x).toBeCloseTo(-Math.sin(approach.rotationY), 8);
      expect(publishedWorkingDirection.z).toBeCloseTo(-Math.cos(approach.rotationY), 8);
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
