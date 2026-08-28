import { describe, expect, it } from "vitest";
import { WaterSurface, waterSpatialProfile } from "../../src/render/water/WaterSurface";
import {
  BRIDGE_WORLD_PROFILE,
  FARM_ROUTES,
  SAILABLE_BOUNDS,
  TERRAIN_RESOLUTION,
  WATER_SURFACE,
  WORLD_BOUNDS,
  WORLD_LAYOUT_V5,
  WORLD_PATHS,
  WORLD_REGIONAL_PATHS,
  WORLD_ROUTE_JUNCTIONS,
  WORLD_ROUTE_NETWORK,
  WORLD_ROUTE_PROFILES,
  WORLD_ROUTES,
  WorldLayout
} from "../../src/world/WorldLayout";
import {
  STARTER_FARM_LAYOUT,
  isPointInsideRect,
  starterFarmsteadAnchor,
  starterStructureAnchor,
  worldToFarmLocal
} from "../../src/world/FarmLayout";
import { FARMHOUSE_OUTSIDE_DOOR } from "../../src/world/FarmhouseInterior";
import { HARBOR_DOCK, VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import { ASSET_BY_ID, ASSET_IDS, type AssetId } from "../../src/render/assets/AssetCatalog";
import { collisionPrimitivesForAsset } from "../../src/physics/CollisionCatalogAdapter";
import {
  createWorldEnvironmentLayout,
  generateEnvironmentClusterPlacements,
  grassPlacementDensityAt,
  groundCoverPatchVariantIndex,
  GROUND_COVER_DENSITY,
  HOMESTEAD_MEADOW_GRASS_COUNT,
  GRASS_MAX_PATH_INFLUENCE,
  hasGroundCoverClearance,
  isPlacementFootprintStable,
  type EnvironmentAssetPlacement
} from "../../src/world/WorldEnvironmentLayout";

function byOrigin(
  placements: readonly EnvironmentAssetPlacement[],
  origin: EnvironmentAssetPlacement["origin"]
): EnvironmentAssetPlacement[] {
  return placements.filter((placement) => placement.origin === origin);
}

const VILLAGE_BUILDING_ASSET_IDS = new Set<string>([
  ASSET_IDS.HOUSE_COTTAGE_A,
  ASSET_IDS.HOUSE_COTTAGE_B,
  ASSET_IDS.HOUSE_COTTAGE_C,
  ASSET_IDS.BUILDING_INN_B,
  ASSET_IDS.BUILDING_VILLAGE_MARKET_HALL_B,
  ASSET_IDS.BUILDING_BARN_B,
  ASSET_IDS.PROP_TOOL_SHED_B,
  ASSET_IDS.BUILDING_OUTHOUSE_B
]);

interface FootprintBox {
  x: number;
  z: number;
  yaw: number;
  halfX: number;
  halfZ: number;
}

function rotateYaw(x: number, z: number, yaw: number): { x: number; z: number } {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return { x: x * cosine - z * sine, z: x * sine + z * cosine };
}

function footprintContainsPoint(box: FootprintBox, x: number, z: number): boolean {
  const local = rotateYaw(x - box.x, z - box.z, -box.yaw);
  return Math.abs(local.x) <= box.halfX && Math.abs(local.z) <= box.halfZ;
}

function footprintCorners(box: FootprintBox): Array<{ x: number; z: number }> {
  return [
    rotateYaw(-box.halfX, -box.halfZ, box.yaw),
    rotateYaw(box.halfX, -box.halfZ, box.yaw),
    rotateYaw(box.halfX, box.halfZ, box.yaw),
    rotateYaw(-box.halfX, box.halfZ, box.yaw)
  ].map((corner) => ({ x: box.x + corner.x, z: box.z + corner.z }));
}

function projectAxis(
  axis: { x: number; z: number },
  corners: Array<{ x: number; z: number }>
): readonly [number, number] {
  const dots = corners.map((corner) => corner.x * axis.x + corner.z * axis.z);
  return [Math.min(...dots), Math.max(...dots)];
}

function intervalsOverlap(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

function footprintsOverlap(a: FootprintBox, b: FootprintBox): boolean {
  const aCorners = footprintCorners(a);
  const bCorners = footprintCorners(b);
  const axes = [
    rotateYaw(1, 0, a.yaw),
    rotateYaw(0, 1, a.yaw),
    rotateYaw(1, 0, b.yaw),
    rotateYaw(0, 1, b.yaw)
  ];
  return axes.every((axis) => intervalsOverlap(projectAxis(axis, aCorners), projectAxis(axis, bCorners)));
}

function villageBuildingFootprints(
  placements: readonly EnvironmentAssetPlacement[]
): Array<FootprintBox & { id: string }> {
  return placements.flatMap((placement) => {
    if (!VILLAGE_BUILDING_ASSET_IDS.has(placement.assetId)) return [];
    const spec = ASSET_BY_ID.get(placement.assetId as AssetId);
    if (!spec || spec.collision === "none") return [];
    const primitives = spec.collisionPrimitives ?? [];
    const scaleX = placement.scale[0];
    const scaleZ = placement.scale[2];
    return primitives.map((primitive) => {
      const local = rotateYaw(primitive.center[0] * scaleX, primitive.center[2] * scaleZ, placement.rotationY);
      return {
        id: placement.id,
        x: placement.x + local.x,
        z: placement.z + local.z,
        yaw: placement.rotationY + ((primitive.yawDegrees ?? 0) * Math.PI) / 180,
        halfX: primitive.halfExtents[0] * Math.abs(scaleX),
        halfZ: primitive.halfExtents[2] * Math.abs(scaleZ)
      };
    });
  });
}

describe("WorldLayout", () => {
  it("uses one deterministic height contract for the authored regional world", () => {
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    expect(WorldLayout.terrainHeight(9.5, -1.5)).toBe(WorldLayout.terrainHeight(9.5, -1.5));
    expect(WorldLayout.isWater(WorldLayout.riverCenterX(0), 0)).toBe(true);
    expect(WorldLayout.isSailable(0, 100)).toBe(true);
    expect(WorldLayout.isSailable(0, 0)).toBe(false);
    expect(WorldLayout.isWalkable(WorldLayout.riverCenterX(0), 0)).toBe(false);
    expect(WorldLayout.isWalkable(bridge.x, bridge.z)).toBe(true);
    expect(WorldLayout.nearbyFishingHabitat(
      WorldLayout.riverCenterX(0) + WorldLayout.riverHalfWidth(0) + 2,
      0
    )).toBe("river");
    expect(WorldLayout.nearbyFishingHabitat(50, 0)).toBe(null);
    expect(WorldLayout.nearbyFishingHabitat(bridge.x, bridge.z)).toBe("river");
    expect(WorldLayout.isBridgeDeck(bridge.x, bridge.z)).toBe(true);
    expect(WorldLayout.fishingHabitatAt(0, WorldLayout.coastlineZ(0) + 5)).toBe("lake");
    expect(WorldLayout.fishingHabitatAt(0, WorldLayout.coastlineZ(0) + 40)).toBe("coast");
    expect(WorldLayout.fishingHabitatAt(18, WorldLayout.coastlineZ(18) + 12)).toBe("lake");
    expect(WorldLayout.fishingHabitatAt(50, WorldLayout.coastlineZ(50) + 8)).toBe("coast");
    expect(WorldLayout.nearbyFishingHabitat(50, WorldLayout.coastlineZ(50) - 2)).toBe("coast");
    expect(WorldLayout.nearbyFishingHabitat(72, WorldLayout.coastlineZ(72) - 2)).not.toBe("lake");
    expect(WORLD_BOUNDS).toEqual({ minX: -180, maxX: 180, minZ: -160, maxZ: 120 });
    expect(SAILABLE_BOUNDS).toEqual({ minX: -260, maxX: 260, minZ: -240, maxZ: 280 });
    expect(WATER_SURFACE).toMatchObject({ width: 750, depth: 750 });
    expect(WorldLayout.terrainHeightfield()).toHaveLength((TERRAIN_RESOLUTION + 1) ** 2);
    expect(WorldLayout.terrainBaseHeightfield()).toHaveLength((TERRAIN_RESOLUTION + 1) ** 2);
  });

  it("keeps the authored district elevations and anchor geography legible", () => {
    expect(WorldLayout.terrainHeight(-65, -55)).toBeLessThan(2.5);
    expect(WorldLayout.terrainHeight(60, -60)).toBeGreaterThan(5);
    expect(WorldLayout.terrainHeight(-92, 74)).toBeGreaterThanOrEqual(12);
    expect(WorldLayout.terrainHeight(-92, 74)).toBeLessThanOrEqual(16);
    expect(WorldLayout.terrainHeight(68, 64)).toBeLessThan(3);
    expect(WORLD_LAYOUT_V5.anchors.villageMarket).toEqual(VILLAGE_MARKET.position);
    expect(WORLD_LAYOUT_V5.anchors.riverCrossing).toEqual({ x: 0, z: -5 });
    expect(WorldLayout.regionAt(VILLAGE_MARKET.position.x, VILLAGE_MARKET.position.z)).toBe("region.village");
    expect(WorldLayout.regionAt(-65, -55)).toBe("region.farm");
    expect(WorldLayout.terrainHeight(VILLAGE_MARKET.position.x, VILLAGE_MARKET.position.z)).toBeGreaterThan(5);
    expect(WorldLayout.terrainHeight(0, -5)).toBeLessThan(
      WorldLayout.terrainHeight(VILLAGE_MARKET.position.x, VILLAGE_MARKET.position.z)
    );
    expect(WorldLayout.isWalkable(WORLD_LAYOUT_V5.anchors.privateHomestead.x, WORLD_LAYOUT_V5.anchors.privateHomestead.z)).toBe(true);
    expect(WorldLayout.isWalkable(WORLD_LAYOUT_V5.anchors.lighthouse.x, WORLD_LAYOUT_V5.anchors.lighthouse.z)).toBe(true);
    expect(WorldLayout.isSailable(WORLD_LAYOUT_V5.anchors.harborDock.x, WORLD_LAYOUT_V5.anchors.harborDock.z)).toBe(true);
  });

  it("keeps the cliffside coastal trail on dry walkable ground", () => {
    const trail = WorldLayout.compiledRouteNetwork().find((route) => route.route.id === "cliffside-coastal-walk");
    expect(trail).toBeDefined();
    for (const sample of trail!.samples) {
      expect(
        WorldLayout.isWalkable(sample.point.x, sample.point.z),
        `${sample.point.x.toFixed(1)},${sample.point.z.toFixed(1)}`
      ).toBe(true);
    }
  });

  it("keeps terrain geometry and landmarks on the same height owner", () => {
    const farmhouse = WorldLayout.landmark("farmhouse");
    expect(WorldLayout.terrainSurface(-65, -55)).toBe("dry-soil");
    expect(WorldLayout.terrainNormal(farmhouse.x, farmhouse.z).length()).toBeCloseTo(1, 5);
    const geometry = WorldLayout.buildTerrainGeometry();
    expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
    const terrainGreenMask = geometry.getAttribute("terrainGreenMask");
    expect(terrainGreenMask.array).toBeInstanceOf(Uint8Array);
    expect(terrainGreenMask.count).toBe(geometry.getAttribute("position").count);
    expect(terrainGreenMask.normalized).toBe(true);
    const maskValues = Array.from(terrainGreenMask.array as Uint8Array);
    expect(maskValues.some((value) => value === 0)).toBe(true);
    expect(maskValues.some((value) => value > 0)).toBe(true);
    const terrainPathBlend = geometry.getAttribute("terrainPathBlend");
    expect(terrainPathBlend.count).toBe(geometry.getAttribute("position").count);
    expect(terrainPathBlend.itemSize).toBe(1);
    expect(geometry.index).toBeNull();
    expect(geometry.userData.terrainNormalPolicy).toEqual({
      continuityStartNormalY: 0.88,
      fullyFacetedNormalY: 0.66,
      cliffWeightStart: 0.08,
      cliffWeightFull: 0.5,
      facetedColorBlend: 0.7
    });

    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const colors = geometry.getAttribute("color");
    let highRouteBlend = false;
    let lowOffRoadBlend = false;
    let blendRangeOk = true;
    for (let index = 0; index < positions.count; index += 29) {
      const blend = terrainPathBlend.getX(index);
      if (blend < 0 || blend > 1) blendRangeOk = false;
      if (blend > 0.9) highRouteBlend = true;
      if (blend < 0.12) lowOffRoadBlend = true;
    }
    expect(blendRangeOk).toBe(true);
    let nearestRouteIndex = 0;
    let nearestRouteDist = Number.POSITIVE_INFINITY;
    let nearestOffRoadIndex = 0;
    let nearestOffRoadDist = Number.POSITIVE_INFINITY;
    for (let index = 0; index < positions.count; index++) {
      const routeDx = positions.getX(index) + 14;
      const routeDz = positions.getZ(index) + 7;
      const routeDist = routeDx * routeDx + routeDz * routeDz;
      if (routeDist < nearestRouteDist) {
        nearestRouteDist = routeDist;
        nearestRouteIndex = index;
      }
      const offDx = positions.getX(index) + 150;
      const offDz = positions.getZ(index) + 120;
      const offDist = offDx * offDx + offDz * offDz;
      if (offDist < nearestOffRoadDist) {
        nearestOffRoadDist = offDist;
        nearestOffRoadIndex = index;
      }
    }
    expect(WorldLayout.pathInfluence(WORLD_LAYOUT_V5.anchors.bridge.x, WORLD_LAYOUT_V5.anchors.bridge.z)).toBeGreaterThan(0.9);
    expect(terrainPathBlend.getX(nearestRouteIndex)).toBeGreaterThan(0.9);
    expect(terrainPathBlend.getX(nearestOffRoadIndex)).toBeLessThan(0.12);
    expect(highRouteBlend || terrainPathBlend.getX(nearestRouteIndex) > 0.9).toBe(true);
    expect(lowOffRoadBlend).toBe(true);
    const sharedVertices = new Map<string, number[]>();
    for (let index = 0; index < positions.count; index++) {
      const key = `${positions.getX(index).toFixed(4)}:${positions.getY(index).toFixed(4)}:${positions.getZ(index).toFixed(4)}`;
      const duplicates = sharedVertices.get(key) ?? [];
      duplicates.push(index);
      sharedVertices.set(key, duplicates);
    }
    let smoothContinuityCount = 0;
    let facetedBreakCount = 0;
    for (const duplicates of sharedVertices.values()) {
      if (duplicates.length < 2) continue;
      const first = duplicates[0];
      const x = positions.getX(first);
      const z = positions.getZ(first);
      const normalY = normals.getY(first);
      const normalSpread = Math.max(...duplicates.map((index) => Math.hypot(
        normals.getX(index) - normals.getX(first),
        normals.getY(index) - normals.getY(first),
        normals.getZ(index) - normals.getZ(first)
      )));
      const colorSpread = Math.max(...duplicates.map((index) => Math.hypot(
        colors.getX(index) - colors.getX(first),
        colors.getY(index) - colors.getY(first),
        colors.getZ(index) - colors.getZ(first)
      )));
      if (normalY >= 0.88 && normalSpread < 0.00001 && colorSpread < 0.00001) {
        smoothContinuityCount++;
      }
      if (normalSpread > 0.001 && colorSpread > 0.00001) {
        const surface = WorldLayout.terrainSurfaceWeights(x, z);
        if (normalY <= 0.66 || surface.cliff >= 0.5) facetedBreakCount++;
      }
      if (smoothContinuityCount > 100 && facetedBreakCount > 5) break;
    }
    expect(smoothContinuityCount).toBeGreaterThan(100);
    expect(facetedBreakCount).toBeGreaterThan(5);
    geometry.dispose();
  });

  it("beds the bridge on the river floor and grades both road approaches into its deck", () => {
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    const halfLength = BRIDGE_WORLD_PROFILE.spanLength * 0.5;
    const foundationY = WorldLayout.terrainHeight(bridge.x, bridge.z);
    expect(foundationY).toBeLessThan(-1.45);

    for (const direction of [-1, 1]) {
      const entryX = bridge.x + direction * (halfLength + 0.08);
      expect(WorldLayout.terrainHeight(entryX, bridge.z)).toBeCloseTo(
        BRIDGE_WORLD_PROFILE.entrySurfaceY,
        1
      );
      expect(WorldLayout.isWalkable(entryX, bridge.z)).toBe(true);
    }

    expect(WorldLayout.terrainHeight(bridge.x, bridge.z)).toBeLessThan(
      BRIDGE_WORLD_PROFILE.entrySurfaceY - 2.5
    );
  });

  it("routes the village lighthouse road through the walkable bridge corridor", () => {
    const route = WORLD_ROUTES.find((candidate) => candidate.id === "village-lighthouse");
    expect(route).toBeDefined();
    expect(route?.linearSegmentIndices).toEqual([4, 5, 6, 7]);
    const bridgeCorridor = route?.points.slice(3, 9);
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    const halfSpan = BRIDGE_WORLD_PROFILE.spanLength * 0.5;
    expect(bridgeCorridor).toHaveLength(6);
    expect(bridgeCorridor?.[0]).toEqual(WORLD_LAYOUT_V5.anchors.riverCrossing);
    expect(bridgeCorridor?.slice(1).every((point) => point.z === bridge.z)).toBe(true);
    expect(bridgeCorridor?.[1]?.x).toBeCloseTo(bridge.x + halfSpan + BRIDGE_WORLD_PROFILE.approachLength, 8);
    expect(bridgeCorridor?.[2]?.x).toBeCloseTo(bridge.x + halfSpan, 8);
    expect(bridgeCorridor?.[3]).toEqual(bridge);
    expect(bridgeCorridor?.[4]?.x).toBeCloseTo(bridge.x - halfSpan, 8);
    expect(bridgeCorridor?.[5]?.x).toBeCloseTo(bridge.x - halfSpan - BRIDGE_WORLD_PROFILE.approachLength, 8);
    expect(route?.points.slice(3, 9).every((point) =>
      !WorldLayout.isWater(point.x, point.z) || WorldLayout.isBridgeDeck(point.x, point.z)
    )).toBe(true);
  });

  it("feathers authored farm, path, and shoreline surfaces instead of using hard material seams", () => {
    expect(WorldLayout.farmSoilInfluence(-65, -55)).toBeGreaterThan(0.9);
    expect(WorldLayout.farmSoilInfluence(0, 0)).toBeLessThan(0.1);
    expect(WorldLayout.pathInfluence(WORLD_LAYOUT_V5.anchors.bridge.x, WORLD_LAYOUT_V5.anchors.bridge.z)).toBeGreaterThan(0.95);
    expect(WorldLayout.pathInfluence(-150, -120)).toBeLessThan(0.1);
    const riverEdge = WorldLayout.riverCenterX(0) + WorldLayout.riverHalfWidth(0);
    expect(WorldLayout.shorelineWetness(riverEdge, 0)).toBeGreaterThan(0.95);
    expect(WorldLayout.shorelineWetness(riverEdge + 8, 0)).toBeLessThan(0.1);

    const path = WorldLayout.buildPathGeometry();
    expect(path.getAttribute("position").count).toBeGreaterThan(50);
    expect(path.getAttribute("color").count).toBe(path.getAttribute("position").count);
    expect(path.index?.count).toBeGreaterThan(100);
    path.dispose();
  });

  it("authors distinct coves, shelves, and cliffs from one continuous coastline owner", () => {
    const headland = WorldLayout.coastProfile(-92);
    const harborCove = WorldLayout.coastProfile(72);
    const easternShelf = WorldLayout.coastProfile(132);
    for (const profile of [headland, harborCove, easternShelf]) {
      expect(profile.beach + profile.rockShelf + profile.cliff).toBeCloseTo(1, 6);
    }
    expect(headland.cliff).toBeGreaterThan(headland.beach);
    expect(harborCove.beach).toBeGreaterThan(harborCove.cliff);
    expect(easternShelf.rockShelf).toBeGreaterThan(easternShelf.beach);

    for (let x = -179; x <= 179; x += 2) {
      expect(Math.abs(WorldLayout.coastlineZ(x + 1) - WorldLayout.coastlineZ(x))).toBeLessThan(1.1);
      expect(WorldLayout.waterSignedDistance(x, WorldLayout.coastlineZ(x) + 1)).toBeGreaterThan(0);
      const landwardZ = WorldLayout.coastlineZ(x) - 1;
      if (WorldLayout.riverDistance(x, landwardZ) > WorldLayout.riverHalfWidth(landwardZ) + 1) {
        expect(WorldLayout.waterSignedDistance(x, landwardZ)).toBeLessThan(0);
      }
    }
  });

  it("preserves the water sign while carrying a continuous river channel through the estuary", () => {
    const mouth = WORLD_LAYOUT_V5.riverMouth;
    expect(mouth).toEqual({ x: 15, z: 82 });
    for (let x = mouth.x - 32; x <= mouth.x + 32; x += 2) {
      for (let z = mouth.z - 24; z <= mouth.z + 36; z += 2) {
        const coast = z - WorldLayout.coastlineZ(x);
        const river = WorldLayout.riverHalfWidth(z) - WorldLayout.riverDistance(x, z);
        const previousHardUnion = Math.max(
          coast,
          z <= WorldLayout.coastlineZ(x) + 1.5 ? river : Number.NEGATIVE_INFINITY
        );
        expect(Math.sign(WorldLayout.waterSignedDistance(x, z))).toBe(Math.sign(previousHardUnion));
      }
    }

    const channelHeights: number[] = [];
    for (let z = mouth.z - 12; z <= mouth.z + 24; z += 2) {
      const x = WorldLayout.riverCenterX(z);
      expect(WorldLayout.isSailable(x, z)).toBe(true);
      channelHeights.push(WorldLayout.naturalTerrainHeight(x, z));
    }
    expect(WorldLayout.naturalTerrainHeight(mouth.x, mouth.z)).toBeLessThan(-1.5);
    expect(WorldLayout.naturalTerrainHeight(mouth.x, mouth.z + 10)).toBeLessThan(-1.4);
    for (let index = 1; index < channelHeights.length; index++) {
      expect(Math.abs(channelHeights[index] - channelHeights[index - 1])).toBeLessThan(0.85);
    }
    expect(WorldLayout.fishingHabitatAt(WorldLayout.riverCenterX(mouth.z - 2), mouth.z - 2)).toBe("river");
    expect(WorldLayout.fishingHabitatAt(mouth.x, mouth.z + 6)).toBe("lake");
    expect(WorldLayout.fishingHabitatAt(mouth.x, mouth.z + 42)).toBe("coast");
    expect(waterSpatialProfile(mouth.x, mouth.z + 10).weights.river).toBeGreaterThan(0.2);
    expect(waterSpatialProfile(mouth.x, mouth.z + 36).weights.river).toBeLessThan(0.05);
  });

  it("grades typed dirt routes and adds deterministic nonnegative physical relief", () => {
    expect(WorldLayout.routeDefinitions().map((route) => route.kind)).toEqual([
      "arterial", "lane", "arterial", "lane", "trail",
      "lane", "trail", "lane"
    ]);
    expect(WORLD_ROUTE_PROFILES.arterial.crownMeters).toBeGreaterThan(WORLD_ROUTE_PROFILES.lane.crownMeters);
    expect(WORLD_ROUTE_PROFILES.lane.crownMeters).toBeGreaterThan(WORLD_ROUTE_PROFILES.trail.crownMeters);

    for (const route of WorldLayout.routeDefinitions()) {
      for (const point of route.points) {
        expect(Math.abs(
          WorldLayout.terrainBaseHeight(point.x, point.z) - WorldLayout.naturalTerrainHeight(point.x, point.z)
        )).toBeLessThanOrEqual(0.450001);
        expect(WorldLayout.terrainHeight(point.x, point.z)).toBeGreaterThanOrEqual(
          WorldLayout.terrainBaseHeight(point.x, point.z)
        );
      }
    }
    for (const path of WORLD_PATHS) {
      for (let index = 0; index < path.length; index += 5) {
        const point = path[index];
        expect(Math.abs(
          WorldLayout.terrainBaseHeight(point.x, point.z) - WorldLayout.naturalTerrainHeight(point.x, point.z)
        )).toBeLessThanOrEqual(0.450001);
      }
    }

    const geometry = WorldLayout.buildPathGeometry();
    const positions = geometry.getAttribute("position");
    const heightDeltaAt = (index: number) => {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      return positions.getY(index) - WorldLayout.terrainHeight(x, z);
    };
    for (const index of [0, 5, 7, 8, 9, 16]) {
      expect(heightDeltaAt(index)).toBeCloseTo(0, 5);
    }
    const routeCenter = WORLD_ROUTE_NETWORK[0].points[0];
    expect(WorldLayout.roadSurfaceSample(routeCenter.x, routeCenter.z).surfaceOffsetMeters).toBeGreaterThan(0);
    expect(geometry.userData.routeProfiles).toHaveLength(WORLD_ROUTE_NETWORK.length);
    geometry.dispose();
  });

  it("owns weighted materials, route topology, and deterministic cover density", () => {
    expect(WorldLayout.routeDefinitions()).toHaveLength(WORLD_ROUTE_NETWORK.length);
    const weights = WorldLayout.terrainSurfaceWeights(-65, -55);
    expect(Object.values(weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 6);
    const first = createWorldEnvironmentLayout(42891).groundCoverPlacements;
    const second = createWorldEnvironmentLayout(42891).groundCoverPlacements;
    expect(second).toEqual(first);
    expect(first.filter((placement) => placement.category === "grass")).toHaveLength(
      GROUND_COVER_DENSITY.high.grass + HOMESTEAD_MEADOW_GRASS_COUNT
    );
    expect(first.filter((placement) => placement.category === "flowers")).toHaveLength(GROUND_COVER_DENSITY.high.flowers);
    expect(first.filter((placement) => placement.category === "bushes")).toHaveLength(GROUND_COVER_DENSITY.high.bushes);
    expect(first.filter((placement) => placement.category === "meadowTall")).toHaveLength(GROUND_COVER_DENSITY.high.meadowTall);
    expect(first.filter((placement) => placement.category === "pebbles")).toHaveLength(GROUND_COVER_DENSITY.high.pebbles);
    expect(first.filter((placement) => placement.category === "paving")).toHaveLength(GROUND_COVER_DENSITY.high.paving);
    expect(first.filter((placement) => placement.category === "driftwood")).toHaveLength(GROUND_COVER_DENSITY.high.driftwood);
  });

  it("biases grass density toward meadow surfaces with deterministic broad patches", () => {
    const meadowSamples: number[] = [];
    const ordinarySamples: number[] = [];
    for (let x = WORLD_BOUNDS.minX + 8; x <= WORLD_BOUNDS.maxX - 8; x += 8) {
      for (let z = WORLD_BOUNDS.minZ + 8; z <= WORLD_BOUNDS.maxZ - 8; z += 8) {
        if (!WorldLayout.isWalkable(x, z) || WorldLayout.isWater(x, z)) continue;
        const weights = WorldLayout.terrainSurfaceWeights(x, z);
        if (weights.meadow > 0.16) meadowSamples.push(grassPlacementDensityAt(x, z));
        if (weights.meadow < 0.04 && weights.grass > 0.7) ordinarySamples.push(grassPlacementDensityAt(x, z));
      }
    }
    const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(meadowSamples.length).toBeGreaterThan(10);
    expect(ordinarySamples.length).toBeGreaterThan(5);
    expect(average(meadowSamples)).toBeGreaterThan(average(ordinarySamples) + 0.12);
    expect(Math.max(...meadowSamples) - Math.min(...meadowSamples)).toBeGreaterThan(0.1);
  });

  it("groups grass variants by deterministic warped world-space patches", () => {
    const seed = 42891;
    const first = groundCoverPatchVariantIndex(32, -48, seed);
    expect(groundCoverPatchVariantIndex(32, -48, seed)).toBe(first);
    expect(groundCoverPatchVariantIndex(33, -47.5, seed)).toBe(first);
    const broadSamples = new Set<number>();
    for (let x = -120; x <= 120; x += 24) {
      for (let z = -120; z <= 72; z += 21) {
        broadSamples.add(groundCoverPatchVariantIndex(x, z, seed));
      }
    }
    expect(broadSamples).toEqual(new Set([0, 1, 2]));
  });

  it("reproduces the complete environment layout for the same world seed", () => {
    expect(createWorldEnvironmentLayout(42891)).toEqual(createWorldEnvironmentLayout(42891));
  });

  it("varies seeded fill while keeping authored and layout-derived anchors fixed", () => {
    const first = createWorldEnvironmentLayout(42891);
    const second = createWorldEnvironmentLayout(98765);

    expect(byOrigin(second.staticPlacements, "authored")).toEqual(
      byOrigin(first.staticPlacements, "authored")
    );
    expect(byOrigin(second.staticPlacements, "layout-derived")).toEqual(
      byOrigin(first.staticPlacements, "layout-derived")
    );
    expect(byOrigin(second.staticPlacements, "seeded-fill")).not.toEqual(
      byOrigin(first.staticPlacements, "seeded-fill")
    );
    expect(second.groundCoverPlacements).not.toEqual(first.groundCoverPlacements);
  });

  it("keeps placement counts, IDs, variants, exclusions, and clearances valid", () => {
    const layout = createWorldEnvironmentLayout(42891);
    const authored = byOrigin(layout.staticPlacements, "authored");
    const layoutDerived = byOrigin(layout.staticPlacements, "layout-derived");
    const seeded = byOrigin(layout.staticPlacements, "seeded-fill");

    expect(authored.length).toBeGreaterThanOrEqual(43);
    expect(layoutDerived).toHaveLength(78);
    expect(seeded).toHaveLength(270);

    const allPlacements = [...layout.staticPlacements, ...layout.groundCoverPlacements];
    const ids = allPlacements.map((placement) => placement.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);

    const seededAssetCounts = new Map<string, number>();
    for (const placement of seeded) {
      seededAssetCounts.set(
        placement.assetId,
        (seededAssetCounts.get(placement.assetId) ?? 0) + 1
      );
      expect(WorldLayout.isWalkable(placement.x, placement.z)).toBe(true);
      expect(WorldLayout.isWater(placement.x, placement.z)).toBe(false);
      expect(WorldLayout.isInterior(placement.x, placement.z)).toBe(false);
      expect(WorldLayout.pathInfluence(placement.x, placement.z)).toBeLessThanOrEqual(0.12);
      expect(Math.hypot(placement.x + 14, placement.z + 7)).toBeGreaterThan(9.4);
      expect(Math.hypot(placement.x - 68, placement.z - 64)).toBeGreaterThan(8.4);
      expect(Math.hypot(placement.x + 92, placement.z - 74)).toBeGreaterThan(7.4);
      expect(Math.hypot(placement.x - 78, placement.z - 67)).toBeGreaterThan(8.4);
      expect(isPlacementFootprintStable(placement)).toBe(true);
    }
    expect(Object.fromEntries(seededAssetCounts)).toEqual({
      tree_oak_a: 43,
      tree_oak_b: 45,
      tree_oak_c: 52,
      tree_apple_a: 30,
      tree_pine_a: 20,
      tree_pine_b: 12,
      foliage_bush_a: 68
    });

    const groundCoverAssetCounts = new Map<string, number>();
    for (const placement of layout.groundCoverPlacements) {
      groundCoverAssetCounts.set(
        placement.assetId,
        (groundCoverAssetCounts.get(placement.assetId) ?? 0) + 1
      );
      expect(placement.origin).toBe("seeded-fill");
      expect(WorldLayout.isWalkable(placement.x, placement.z)).toBe(true);
      expect(WorldLayout.isWater(placement.x, placement.z)).toBe(false);
      expect(WorldLayout.isInterior(placement.x, placement.z)).toBe(false);
      if (placement.category === "grass" || placement.category === "flowers") {
        expect(WorldLayout.pathInfluence(placement.x, placement.z)).toBeLessThan(GRASS_MAX_PATH_INFLUENCE);
      } else if (placement.category === "paving") {
        expect(WorldLayout.pathInfluence(placement.x, placement.z)).toBeGreaterThan(0.34);
      } else if (placement.category === "meadowTall") {
        expect(WorldLayout.pathInfluence(placement.x, placement.z)).toBeLessThan(0.18);
      } else if (placement.category !== "pebbles") {
        expect(WorldLayout.pathInfluence(placement.x, placement.z)).toBeLessThan(0.08);
      }
    }
    const grassVariantCounts = ["foliage_grass_a", "foliage_grass_b", "foliage_grass_c"]
      .map((assetId) => groundCoverAssetCounts.get(assetId) ?? 0);
    const grassTotal = grassVariantCounts.reduce((sum, count) => sum + count, 0);
    expect(grassTotal).toBe(GROUND_COVER_DENSITY.high.grass + HOMESTEAD_MEADOW_GRASS_COUNT);
    expect(grassVariantCounts[0]).toBeGreaterThan(grassVariantCounts[1]);
    expect(grassVariantCounts[0]).toBeGreaterThan(grassVariantCounts[2]);
    expect(grassVariantCounts[0] / grassTotal).toBeGreaterThan(0.6);
    expect(grassVariantCounts[1]).toBeGreaterThan(400);
    expect(grassVariantCounts[2]).toBeGreaterThan(400);
    const otherCover = Object.fromEntries(
      [...groundCoverAssetCounts].filter(([assetId]) => !assetId.startsWith("foliage_grass_"))
    );
    expect(otherCover.foliage_flower_drift_a).toBeGreaterThan(600);
    expect(otherCover.foliage_flower_drift_b).toBeGreaterThan(600);
    expect(otherCover.foliage_flower_drift_c).toBeGreaterThan(600);
    expect(otherCover.foliage_bush_a).toBe(GROUND_COVER_DENSITY.high.bushes);
    expect(
      (otherCover.foliage_meadow_tall_a ?? 0)
        + (otherCover.foliage_meadow_tall_b ?? 0)
        + (otherCover.foliage_reeds_a ?? 0)
        + (otherCover.foliage_cattail_a ?? 0)
        + (otherCover.foliage_beach_grass_a ?? 0)
    ).toBe(GROUND_COVER_DENSITY.high.meadowTall);
    expect(
      (otherCover.prop_path_slab_a ?? 0) + (otherCover.prop_path_slab_b ?? 0)
    ).toBe(GROUND_COVER_DENSITY.high.paving);
    expect(otherCover.prop_driftwood_a).toBe(10);
    expect(otherCover.prop_driftwood_b).toBe(10);
    expect(otherCover.prop_driftwood_c).toBe(10);

    const grass = layout.groundCoverPlacements.filter((placement) => placement.category === "grass");
    expect(grass.filter((placement) => placement.id.includes("ground-cover.grass.homestead"))).toHaveLength(
      HOMESTEAD_MEADOW_GRASS_COUNT
    );
    expect(grass.some((placement) => WorldLayout.pathInfluence(placement.x, placement.z) > 0.08)).toBe(true);
    expect(grass.every((placement) => placement.scale[1] >= 1.05 && placement.scale[1] <= 1.85)).toBe(true);
    expect(grass.every((placement) => placement.scale[0] / placement.scale[1] >= 0.68)).toBe(true);
    expect(grass.every((placement) => placement.scale[0] / placement.scale[1] <= 1.15)).toBe(true);
    expect(grass.every((placement) => placement.scale[2] / placement.scale[1] >= 0.68)).toBe(true);
    expect(grass.every((placement) => placement.scale[2] / placement.scale[1] <= 1.15)).toBe(true);
    expect(grass.every((placement) => WorldLayout.terrainNormal(placement.x, placement.z).y > 0.66)).toBe(true);
    expect(grass.every((placement) => WorldLayout.farmSoilInfluence(placement.x, placement.z) < 0.08)).toBe(true);
    expect(grass.every((placement) => WorldLayout.shorelineWetness(placement.x, placement.z) < 0.62)).toBe(true);
    expect(grass.every((placement) => hasGroundCoverClearance(placement.x, placement.z))).toBe(true);

    const flowers = layout.groundCoverPlacements.filter((placement) => placement.category === "flowers");
    expect(flowers.every((placement) => placement.scale[1] >= 1.59 && placement.scale[1] <= 2.33)).toBe(true);
    expect(flowers.every((placement) => placement.scale[0] / placement.scale[1] >= 1.65)).toBe(true);
    expect(flowers.every((placement) => placement.scale[2] / placement.scale[1] >= 1.65)).toBe(true);

    const tallMeadow = layout.groundCoverPlacements.filter((placement) => placement.category === "meadowTall");
    expect(tallMeadow.every((placement) => placement.scale[1] >= 0.78 && placement.scale[1] <= 1.05)).toBe(true);
    const wetEdgeTall = tallMeadow.filter((placement) =>
      placement.assetId === "foliage_reeds_a" || placement.assetId === "foliage_cattail_a"
    );
    expect(wetEdgeTall.length).toBeGreaterThan(0);
    expect(wetEdgeTall.every((placement) => {
      const waterDistance = WorldLayout.waterSignedDistance(placement.x, placement.z);
      return WorldLayout.shorelineWetness(placement.x, placement.z) > 0.16
        || (waterDistance > -8 && waterDistance < -1.4);
    })).toBe(true);

    const driftwood = layout.groundCoverPlacements.filter((placement) => placement.category === "driftwood");
    expect(driftwood.every((placement) => placement.id.startsWith("seeded-fill.ground-cover.coast.driftwood"))).toBe(true);
    expect(driftwood.every((placement) => {
      const landwardDistance = WorldLayout.coastlineZ(placement.x) - placement.z;
      return landwardDistance >= 0.45 && landwardDistance <= 5.4;
    })).toBe(true);
    expect(
      layout.groundCoverPlacements.filter((placement) =>
        placement.category === "pebbles"
        && placement.id.startsWith("seeded-fill.ground-cover.coast.pebbles")
      )
    ).toHaveLength(Math.round(GROUND_COVER_DENSITY.high.pebbles * 0.42));

    const coastalRocks = authored.filter((placement) => placement.assetId.startsWith("rock_coastal_"));
    expect(coastalRocks).toHaveLength(5);
    for (const placement of coastalRocks) {
      expect(WorldLayout.terrainNormal(placement.x, placement.z).y).toBeGreaterThan(0.8);
      expect(isPlacementFootprintStable(placement, 0.8, 1.1)).toBe(true);
    }
    expect(authored.filter((placement) => placement.id === "authored.spawn.bush-left")).toHaveLength(1);
    expect(authored.filter((placement) => placement.id === "authored.spawn.bush-right")).toHaveLength(1);
    expect(authored.filter((placement) => placement.id === "authored.spawn.rock-foreground")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "fauna_chicken_a")).toHaveLength(2);
    expect(authored.filter((placement) => placement.assetId === "prop_wagon_cart_a")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "fauna_cow_a")).toHaveLength(1);
    const rabbits = authored.filter((placement) => placement.assetId === "fauna_rabbit_a");
    expect(rabbits).toHaveLength(4);
    for (const rabbit of rabbits) {
      expect(WorldLayout.isWalkable(rabbit.x, rabbit.z), rabbit.id).toBe(true);
      expect(WorldLayout.isWater(rabbit.x, rabbit.z), rabbit.id).toBe(false);
      expect(WorldLayout.isInterior(rabbit.x, rabbit.z), rabbit.id).toBe(false);
      expect(WorldLayout.terrainSurfaceWeights(rabbit.x, rabbit.z).meadow, rabbit.id)
        .toBeGreaterThan(0.12);
      expect(WorldLayout.pathInfluence(rabbit.x, rabbit.z), rabbit.id).toBeLessThan(0.05);
      expect(WorldLayout.farmSoilInfluence(rabbit.x, rabbit.z), rabbit.id).toBeLessThan(0.05);
      expect(WorldLayout.terrainNormal(rabbit.x, rabbit.z).y, rabbit.id).toBeGreaterThan(0.98);
    }
    expect(authored.filter((placement) => placement.assetId === "prop_fishing_net_rack_a")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "house_cottage_a")).toHaveLength(2);
    expect(authored.filter((placement) => placement.assetId === "house_cottage_b")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "house_cottage_c")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "building_inn_b")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "building_village_market_hall_b")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "building_barn_b")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "prop_tool_shed_b")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "building_outhouse_b")).toHaveLength(1);
    const kelp = layoutDerived.filter((placement) => placement.assetId === "foliage_kelp_a");
    expect(kelp).toHaveLength(10);
    expect(kelp.every((placement) => WorldLayout.coastlineZ(placement.x) - placement.z > 1.2)).toBe(true);
  });

  it("uses only catalog assets and forbids collision on every seeded-fill placement", () => {
    const layout = createWorldEnvironmentLayout(42891);
    for (const placement of [...layout.staticPlacements, ...layout.groundCoverPlacements]) {
      const spec = ASSET_BY_ID.get(placement.assetId as AssetId);
      expect(spec, placement.id).toBeDefined();
      if (placement.origin === "seeded-fill") {
        expect(spec?.collision, placement.id).toBe("none");
      }
    }
    expect(
      layout.staticPlacements.some((placement) =>
        placement.origin === "authored" &&
        ASSET_BY_ID.get(placement.assetId as AssetId)?.collision !== "none"
      )
    ).toBe(true);
  });

  it("keeps village building colliders off the mill, market, and plaza route waypoints", () => {
    const layout = createWorldEnvironmentLayout(42891);
    const buildings = villageBuildingFootprints(layout.staticPlacements);
    expect(buildings.length).toBeGreaterThanOrEqual(7);

    const mill = WorldLayout.landmark("windmill");
    const millBoxes: FootprintBox[] = collisionPrimitivesForAsset(ASSET_IDS.BUILDING_WINDMILL_A).map((primitive) => {
      const local = rotateYaw(
        primitive.center[0] * mill.scale,
        primitive.center[2] * mill.scale,
        mill.rotationY
      );
      return {
        x: mill.x + local.x,
        z: mill.z + local.z,
        yaw: mill.rotationY + ((primitive.yawDegrees ?? 0) * Math.PI) / 180,
        halfX: primitive.halfExtents[0] * mill.scale,
        halfZ: primitive.halfExtents[2] * mill.scale
      };
    });

    const farmVillage = WORLD_ROUTES.find((route) => route.id === "farm-village")!;
    const homestead = WORLD_ROUTES.find((route) => route.id === "village-homestead")!;
    const protectedPoints = [
      { x: mill.x, z: mill.z, label: "mill" },
      { x: WORLD_LAYOUT_V5.anchors.villageMarket.x, z: WORLD_LAYOUT_V5.anchors.villageMarket.z, label: "market" },
      { x: 46, z: -44, label: "farm-village waypoint" },
      ...homestead.points.map((point, index) => ({ x: point.x, z: point.z, label: `village-homestead[${index}]` })),
      { x: farmVillage.points.at(-2)!.x, z: farmVillage.points.at(-2)!.z, label: "farm-village approach" }
    ];

    for (const building of buildings) {
      for (const point of protectedPoints) {
        expect(footprintContainsPoint(building, point.x, point.z), `${building.id} contains ${point.label}`).toBe(false);
      }
      for (const millBox of millBoxes) {
        expect(footprintsOverlap(building, millBox), `${building.id} overlaps mill collider`).toBe(false);
      }
    }
  });

  it("keeps the mill off the packed plaza and village fronts facing the courtyard", () => {
    const mill = starterStructureAnchor("struct.starter_mill")!;
    expect(Math.hypot(
      mill.x - VILLAGE_MARKET.position.x,
      mill.z - VILLAGE_MARKET.position.z
    )).toBeGreaterThan(20);

    const layout = createWorldEnvironmentLayout(42891);
    const facingIds = new Set([
      "authored.village.cottage-west",
      "authored.village.cottage-southwest",
      "authored.village.cottage-garden",
      "authored.village.cottage-south",
      "authored.village.inn",
      "authored.village.market-hall",
      "authored.village.barn"
    ]);
    const facing = layout.staticPlacements.filter((placement) => facingIds.has(placement.id));
    expect(facing).toHaveLength(facingIds.size);
    for (const placement of facing) {
      expect(Math.hypot(
        placement.x - VILLAGE_MARKET.position.x,
        placement.z - VILLAGE_MARKET.position.z
      )).toBeGreaterThan(14);
      const towardPlazaX = VILLAGE_MARKET.position.x - placement.x;
      const towardPlazaZ = VILLAGE_MARKET.position.z - placement.z;
      const length = Math.hypot(towardPlazaX, towardPlazaZ);
      const doorX = Math.sin(placement.rotationY);
      const doorZ = Math.cos(placement.rotationY);
      expect((doorX * towardPlazaX + doorZ * towardPlazaZ) / length).toBeGreaterThan(0.5);
    }
  });

  it("fails clearly when a seeded cluster cannot reach its declared count", () => {
    expect(() => generateEnvironmentClusterPlacements(42891, {
      id: "test.impossible",
      salt: 1,
      count: 1,
      center: { x: 1000, z: 1000 },
      radiusX: 0,
      radiusZ: 0,
      assetIds: ["tree_oak_a"],
      scaleRange: [1, 1]
    })).toThrowError(
      "[WorldEnvironmentLayout] Could only place 0/1 instances for seeded-fill cluster test.impossible"
    );
  });

  it("keeps all arterial roads and scenic trails continuous and joined at intentional gateways", () => {
    const routes = WorldLayout.regionalRouteDefinitions();
    expect(routes.map((route) => route.id)).toEqual([
      "farm-village",
      "village-homestead",
      "village-harbor",
      "village-lighthouse",
      "cliffside-coastal-walk"
    ]);
    expect(routes.map((route) => route.kind)).toEqual([
      "arterial", "lane", "arterial", "lane", "trail"
    ]);
    for (const path of WORLD_PATHS) {
      for (let index = 1; index < path.length; index++) {
        expect(Math.hypot(path[index].x - path[index - 1].x, path[index].z - path[index - 1].z)).toBeLessThan(4.2);
      }
    }

    const farmVillage = routes[0].points;
    expect(farmVillage.some((point) => Math.hypot(
      point.x - WORLD_LAYOUT_V5.anchors.bridge.x,
      point.z - WORLD_LAYOUT_V5.anchors.bridge.z
    ) < 0.01)).toBe(true);
    expect(farmVillage.at(-1)).toEqual(WORLD_LAYOUT_V5.anchors.villageMarket);
    for (const route of routes.slice(1, 4)) {
      expect(route.points[0]).toEqual(WORLD_LAYOUT_V5.anchors.villageMarket);
    }
    expect(routes[1].points.at(-1)).toEqual(WORLD_LAYOUT_V5.anchors.privateHomestead);
    expect(routes[2].points.at(-1)).toEqual(WORLD_LAYOUT_V5.anchors.fishMarket);
    expect(routes[3].points.at(-1)).toEqual(WORLD_LAYOUT_V5.anchors.lighthouse);
    expect(routes[4].points[0]).toEqual(WORLD_LAYOUT_V5.anchors.lighthouse);
    expect(routes[4].points.at(-1)).toEqual(WORLD_LAYOUT_V5.anchors.fishMarket);
    expect(routes.some((route) => route.id === "riverbank-trail")).toBe(false);
    expect(routes.some((route) => route.id === "orchard-path")).toBe(false);
    for (const junction of WORLD_ROUTE_JUNCTIONS) {
      expect(junction.routeIds.every((routeId) =>
        routes.some((route) => route.id === routeId)
        || FARM_ROUTES.some((route) => route.id === routeId)
      )).toBe(true);
    }
  });

  it("compiles the farmstead paths into the canonical network with shared junctions and a door endpoint", () => {
    expect(WORLD_ROUTE_NETWORK).toEqual([...WORLD_ROUTES, ...FARM_ROUTES]);
    expect(FARM_ROUTES.map((route) => route.id)).toEqual([
      "farm-entry",
      "farm-work-zone",
      "farm-home"
    ]);
    expect(FARM_ROUTES.every((route) => route.scope === "farmstead")).toBe(true);
    expect(WORLD_ROUTE_NETWORK.filter((route) => route.scope === "regional")).toHaveLength(5);

    const farmEntry = FARM_ROUTES.find((route) => route.id === "farm-entry")!;
    const farmWorkZone = FARM_ROUTES.find((route) => route.id === "farm-work-zone")!;
    const farmHome = FARM_ROUTES.find((route) => route.id === "farm-home")!;
    const farmVillage = WORLD_ROUTES.find((route) => route.id === "farm-village")!;
    expect(farmEntry.points.at(-1)).toEqual(farmHome.points[0]);
    expect(farmEntry.points[0]).toEqual(farmWorkZone.points[0]);
    expect(farmVillage.points[0]).toEqual(farmEntry.points.at(-1));
    expect(WORLD_ROUTE_JUNCTIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "starter-farm-field",
        routeIds: ["farm-entry", "farm-work-zone"]
      }),
      expect.objectContaining({
        id: "starter-farm-yard",
        routeIds: ["farm-village", "farm-entry", "farm-home"]
      })
    ]));

    const farmhouseDoor = { x: FARMHOUSE_OUTSIDE_DOOR.x, z: FARMHOUSE_OUTSIDE_DOOR.z };
    expect(farmHome.points.at(-1)).toEqual(farmhouseDoor);
    const localDoor = worldToFarmLocal(STARTER_FARM_LAYOUT.farmId, farmHome.points.at(-1)!);
    expect(localDoor.x).toBeCloseTo(11.24, 6);
    expect(localDoor.z).toBeCloseTo(1.21, 6);
    expect(farmHome.points.at(-1)).not.toEqual({
      x: WorldLayout.landmark("farmhouse").x,
      z: WorldLayout.landmark("farmhouse").z
    });
  });

  it("keeps every regional route endpoint attached to a junction or named anchor", () => {
    const namedAnchors = Object.values(WORLD_LAYOUT_V5.anchors);
    const junctionCenters = WORLD_ROUTE_JUNCTIONS.map((junction) => junction.center);
    const intentionalEndpoints = [...namedAnchors, ...junctionCenters];
    const nearestIntentionalPoint = (point: { x: number; z: number }): number => Math.min(
      ...intentionalEndpoints.map((candidate) => Math.hypot(point.x - candidate.x, point.z - candidate.z))
    );

    for (const route of WORLD_ROUTES) {
      expect(nearestIntentionalPoint(route.points[0]), route.id).toBeLessThan(0.01);
      expect(nearestIntentionalPoint(route.points.at(-1)!), route.id).toBeLessThan(0.01);
    }
  });

  it("keeps the rerouted arterial outside the farmhouse and fence footprint", () => {
    const farmhouse = starterFarmsteadAnchor("farmhouse")!;
    const arterial = WORLD_REGIONAL_PATHS[0];
    const distanceToSegment = (point: { x: number; z: number }, start: { x: number; z: number }, end: { x: number; z: number }) => {
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const lengthSquared = dx * dx + dz * dz;
      const progress = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / Math.max(0.0001, lengthSquared)));
      return Math.hypot(point.x - (start.x + dx * progress), point.z - (start.z + dz * progress));
    };
    let closestFarmhouse = Number.POSITIVE_INFINITY;
    for (let index = 1; index < arterial.length; index++) {
      closestFarmhouse = Math.min(
        closestFarmhouse,
        distanceToSegment(farmhouse, arterial[index - 1], arterial[index])
      );
    }
    expect(closestFarmhouse).toBeGreaterThan(farmhouse.clearanceRadius);

    const localArterial = arterial.map((point) => worldToFarmLocal(STARTER_FARM_LAYOUT.farmId, point));
    const fenceFootprint = { minX: -7.2, maxX: 7.2, minZ: -6.2, maxZ: 6.2 };
    expect(localArterial.every((point) => !isPointInsideRect(point, fenceFootprint, 0.5))).toBe(true);
  });

  it("keeps the farm-to-village bridge corridor straight and clips its deck exactly", () => {
    const farmVillageRoute = WORLD_ROUTE_NETWORK.find((route) => route.id === "farm-village")!;
    expect(farmVillageRoute.linearSegmentIndices).toEqual([4, 5, 6, 7]);
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    const bridgePath = WORLD_REGIONAL_PATHS[0];
    const corridorSamples = bridgePath.slice(40, 80);
    expect(corridorSamples.length).toBeGreaterThan(20);
    expect(corridorSamples.every((point) => Math.abs(point.z - bridge.z) < 0.0001)).toBe(true);

    const geometry = WorldLayout.buildPathGeometry();
    expect(geometry.userData.bridgeGatewayBandCount).toBe(6);
    const positions = geometry.getAttribute("position");
    const index = geometry.getIndex();
    expect(index).not.toBeNull();
    if (index) {
      for (let triangle = 0; triangle < index.count; triangle += 3) {
        const vertexIndices = [index.getX(triangle), index.getX(triangle + 1), index.getX(triangle + 2)];
        const strictlyInsideDeck = vertexIndices.every((vertexIndex) =>
          Math.abs(positions.getX(vertexIndex) - bridge.x) < BRIDGE_WORLD_PROFILE.spanLength * 0.5 &&
          Math.abs(positions.getZ(vertexIndex) - bridge.z) < BRIDGE_WORLD_PROFILE.deckWidth * 0.5
        );
        expect(strictlyInsideDeck).toBe(false);
      }
    }
    geometry.dispose();
  });

  it("keeps both bridge approaches flush and free of one-cell height breaks", () => {
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    const halfSpan = BRIDGE_WORLD_PROFILE.spanLength * 0.5;
    const westStart = bridge.x - halfSpan - BRIDGE_WORLD_PROFILE.approachLength;
    const eastEnd = bridge.x + halfSpan + BRIDGE_WORLD_PROFILE.approachLength;
    expect(WorldLayout.terrainHeight(bridge.x - halfSpan, bridge.z)).toBeCloseTo(BRIDGE_WORLD_PROFILE.entrySurfaceY, 2);
    expect(WorldLayout.terrainHeight(bridge.x + halfSpan, bridge.z)).toBeCloseTo(BRIDGE_WORLD_PROFILE.entrySurfaceY, 2);

    let maximumDelta = 0;
    let maximumDeltaX = westStart;
    const checkContinuity = (x: number) => {
      const delta = Math.abs(WorldLayout.terrainHeight(x + 0.25, bridge.z) - WorldLayout.terrainHeight(x, bridge.z));
      if (delta > maximumDelta) {
        maximumDelta = delta;
        maximumDeltaX = x;
      }
    };
    for (let x = westStart; x < bridge.x - halfSpan - 0.25; x += 0.25) {
      checkContinuity(x);
    }
    for (let x = bridge.x + halfSpan + 0.25; x < eastEnd; x += 0.25) {
      checkContinuity(x);
    }
    expect(maximumDelta, JSON.stringify({ maximumDelta, maximumDeltaX })).toBeLessThan(0.12);
    for (let x = bridge.x - halfSpan; x <= bridge.x + halfSpan; x += 0.25) {
      expect(WorldLayout.isWater(x, bridge.z)).toBe(false);
    }
  });

  it("keeps every interaction anchor valid in its movement domain", () => {
    const { harborDock, ...walkableAnchors } = WORLD_LAYOUT_V5.anchors;
    for (const anchor of Object.values(walkableAnchors)) {
      expect(WorldLayout.isWalkable(anchor.x, anchor.z)).toBe(true);
    }
    expect(WorldLayout.isSailable(harborDock.x, harborDock.z)).toBe(true);
  });

  it("places deterministic reed pockets on both dry estuary banks without closing the mouth", () => {
    const first = createWorldEnvironmentLayout(42891).staticPlacements.filter((placement) =>
      placement.id.startsWith("layout-derived.reeds.estuary.")
    );
    const second = createWorldEnvironmentLayout(98765).staticPlacements.filter((placement) =>
      placement.id.startsWith("layout-derived.reeds.estuary.")
    );
    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
    expect(first.some((placement) => placement.x < WORLD_LAYOUT_V5.riverMouth.x)).toBe(true);
    expect(first.some((placement) => placement.x > WORLD_LAYOUT_V5.riverMouth.x)).toBe(true);
    expect(first.every((placement) => WorldLayout.estuaryInfluence(placement.x, placement.z) > 0)).toBe(true);
    expect(first.every((placement) => placement.z < WORLD_LAYOUT_V5.riverMouth.z)).toBe(true);
  });

  it("keeps the harbor interaction anchor on walkable ground", () => {
    const anchor = HARBOR_DOCK.playerPosition;
    expect(WorldLayout.isWalkable(anchor.x, anchor.z)).toBe(true);
    const dock = WorldLayout.landmark("dock");
    expect(Math.hypot(anchor.x - dock.x, anchor.z - dock.z)).toBeLessThan(5);
    expect(dock.rotationY).toBeCloseTo(Math.PI / 2, 6);
    expect(WorldLayout.isSailable(HARBOR_DOCK.boatPosition.x, HARBOR_DOCK.boatPosition.z)).toBe(true);
    expect(Math.hypot(
      HARBOR_DOCK.boatPosition.x - dock.x,
      HARBOR_DOCK.boatPosition.z - dock.z
    )).toBeLessThan(6);
  });

  it("provides stable low-frequency water samples for render and physics", () => {
    const first = WaterSurface.sample(8, 42, 12, { seaRoughness: 0.6 });
    const second = WaterSurface.sample(8, 42, 12, { seaRoughness: 0.6 });
    expect(first.height).toBe(second.height);
    expect(first.normal.length()).toBeCloseTo(1, 5);
  });

  it("selects smooth river, coastal sea, and wind-shaped ocean profiles", () => {
    const mouth = WORLD_LAYOUT_V5.riverMouth;
    const river = waterSpatialProfile(WorldLayout.riverCenterX(mouth.z - 12), mouth.z - 12);
    const sea = waterSpatialProfile(mouth.x, mouth.z + 28);
    const ocean = waterSpatialProfile(mouth.x, mouth.z + 170);

    expect(river.region).toBe("river");
    expect(sea.region).toBe("sea");
    expect(ocean.region).toBe("ocean");
    expect(river.weights.river).toBeGreaterThan(sea.weights.river);
    expect(sea.weights.sea).toBeGreaterThan(ocean.weights.sea);
    const boundaryA = waterSpatialProfile(mouth.x, mouth.z + 118);
    const boundaryB = waterSpatialProfile(mouth.x, mouth.z + 119);
    expect(Math.abs(boundaryB.weights.ocean - boundaryA.weights.ocean)).toBeLessThan(0.05);

    const calm = WaterSurface.sample(mouth.x, mouth.z + 170, 12, {
      seaRoughness: 0.7,
      windDirectionDeg: 0,
      windSpeed: 8
    });
    const crossWind = WaterSurface.sample(mouth.x, mouth.z + 170, 12, {
      seaRoughness: 0.7,
      windDirectionDeg: 90,
      windSpeed: 8
    });
    expect(calm.height).not.toBeCloseTo(crossWind.height, 6);
  });

  it("aligns mathematical path influence precisely with curved spline samples and keeps road ribbons elevated above terrain", () => {
    // Verify that intermediate Catmull samples have high path influence (ensuring no straight-chord drift)
    for (const path of WORLD_PATHS) {
      for (const point of path) {
        expect(WorldLayout.pathInfluence(point.x, point.z)).toBeGreaterThan(0.90);
      }
    }

    const geometry = WorldLayout.buildPathGeometry();
    const positions = geometry.getAttribute("position");
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    const halfSpan = BRIDGE_WORLD_PROFILE.spanLength * 0.5;
    const halfWidth = BRIDGE_WORLD_PROFILE.deckWidth * 0.6;

    // Verify all indexed road vertices stay elevated above the terrain (no clipping teeth)
    // and that no road geometry plunges underwater under the bridge
    const indices = geometry.getIndex();
    expect(indices).not.toBeNull();
    if (indices) {
      for (let i = 0; i < indices.count; i += 12) {
        const vertexIndex = indices.getX(i);
        const vx = positions.getX(vertexIndex);
        const vy = positions.getY(vertexIndex);
        const vz = positions.getZ(vertexIndex);
        const groundY = WorldLayout.terrainHeight(vx, vz);

        // No indexed road vertex should be in the riverbed (< -1.0) under the bridge
        const inBridgeSpan = Math.abs(vx - bridge.x) < halfSpan && Math.abs(vz - bridge.z) < halfWidth;
        if (!inBridgeSpan) {
          expect(vy).toBeGreaterThanOrEqual(groundY - 0.001);
        } else {
          expect(vy).toBeGreaterThan(0.5); // Deck entry level, never riverbed
        }
      }
    }
    geometry.dispose();
  });
});
