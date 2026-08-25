import { describe, expect, it } from "vitest";
import { WaterSurface, waterSpatialProfile } from "../../src/render/water/WaterSurface";
import {
  BRIDGE_WORLD_PROFILE,
  SAILABLE_BOUNDS,
  TERRAIN_RESOLUTION,
  WATER_SURFACE,
  WORLD_BOUNDS,
  WORLD_LAYOUT_V3,
  WORLD_PATHS,
  WORLD_ROUTE_PROFILES,
  WorldLayout
} from "../../src/world/WorldLayout";
import { HARBOR_DOCK } from "../../src/world/WorldAnchors";
import { ASSET_BY_ID, type AssetId } from "../../src/render/assets/AssetCatalog";
import {
  createWorldEnvironmentLayout,
  generateEnvironmentClusterPlacements,
  GROUND_COVER_DENSITY,
  isPlacementFootprintStable,
  type EnvironmentAssetPlacement
} from "../../src/world/WorldEnvironmentLayout";

function byOrigin(
  placements: readonly EnvironmentAssetPlacement[],
  origin: EnvironmentAssetPlacement["origin"]
): EnvironmentAssetPlacement[] {
  return placements.filter((placement) => placement.origin === origin);
}

describe("WorldLayout", () => {
  it("uses one deterministic height contract for the authored regional world", () => {
    expect(WorldLayout.terrainHeight(9.5, -1.5)).toBe(WorldLayout.terrainHeight(9.5, -1.5));
    expect(WorldLayout.isWater(WorldLayout.riverCenterX(0), 0)).toBe(true);
    expect(WorldLayout.isSailable(0, 100)).toBe(true);
    expect(WorldLayout.isSailable(0, 0)).toBe(false);
    expect(WorldLayout.isWalkable(WorldLayout.riverCenterX(0), 0)).toBe(false);
    expect(WorldLayout.isWalkable(-14, -7)).toBe(true);
    expect(WorldLayout.nearbyFishingHabitat(
      WorldLayout.riverCenterX(0) + WorldLayout.riverHalfWidth(0) + 2,
      0
    )).toBe("river");
    expect(WorldLayout.nearbyFishingHabitat(50, 0)).toBe(null);
    expect(WorldLayout.fishingHabitatAt(0, WorldLayout.coastlineZ(0) + 5)).toBe("lake");
    expect(WorldLayout.fishingHabitatAt(0, WorldLayout.coastlineZ(0) + 40)).toBe("coast");
    expect(WORLD_BOUNDS).toEqual({ minX: -180, maxX: 180, minZ: -160, maxZ: 120 });
    expect(SAILABLE_BOUNDS).toEqual({ minX: -260, maxX: 260, minZ: -240, maxZ: 280 });
    expect(WATER_SURFACE).toMatchObject({ width: 750, depth: 750 });
    expect(WorldLayout.terrainHeightfield()).toHaveLength((TERRAIN_RESOLUTION + 1) ** 2);
  });

  it("keeps the authored district elevations and anchor geography legible", () => {
    expect(WorldLayout.terrainHeight(-65, -55)).toBeLessThan(2.5);
    expect(WorldLayout.terrainHeight(60, -60)).toBeGreaterThan(5);
    expect(WorldLayout.terrainHeight(-92, 74)).toBeGreaterThanOrEqual(12);
    expect(WorldLayout.terrainHeight(-92, 74)).toBeLessThanOrEqual(16);
    expect(WorldLayout.terrainHeight(68, 64)).toBeLessThan(3);
    expect(WorldLayout.isWalkable(WORLD_LAYOUT_V3.anchors.privateHomestead.x, WORLD_LAYOUT_V3.anchors.privateHomestead.z)).toBe(true);
    expect(WorldLayout.isWalkable(WORLD_LAYOUT_V3.anchors.lighthouse.x, WORLD_LAYOUT_V3.anchors.lighthouse.z)).toBe(true);
    expect(WorldLayout.isSailable(WORLD_LAYOUT_V3.anchors.harborDock.x, WORLD_LAYOUT_V3.anchors.harborDock.z)).toBe(true);
  });

  it("keeps terrain geometry and landmarks on the same height owner", () => {
    const farmhouse = WorldLayout.landmark("farmhouse");
    expect(WorldLayout.terrainSurface(-65, -55)).toBe("dry-soil");
    expect(WorldLayout.terrainNormal(farmhouse.x, farmhouse.z).length()).toBeCloseTo(1, 5);
    const geometry = WorldLayout.buildTerrainGeometry();
    expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
    expect(geometry.index).toBeNull();
    geometry.dispose();
  }, 15000);

  it("beds the bridge on the river floor and grades both road approaches into its deck", () => {
    const bridge = WORLD_LAYOUT_V3.anchors.bridge;
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

  it("feathers authored farm, path, and shoreline surfaces instead of using hard material seams", () => {
    expect(WorldLayout.farmSoilInfluence(-65, -55)).toBeGreaterThan(0.9);
    expect(WorldLayout.farmSoilInfluence(0, 0)).toBeLessThan(0.1);
    expect(WorldLayout.pathInfluence(-14, -7)).toBeGreaterThan(0.95);
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
    const mouth = WORLD_LAYOUT_V3.riverMouth;
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

  it("grades typed dirt routes deterministically without displacing terrain more than 0.45 metres", () => {
    expect(WorldLayout.routeDefinitions().map((route) => route.kind)).toEqual([
      "arterial", "lane", "arterial", "lane", "trail", "trail", "trail"
    ]);
    expect(WORLD_ROUTE_PROFILES.arterial.crownMeters).toBeGreaterThan(WORLD_ROUTE_PROFILES.lane.crownMeters);
    expect(WORLD_ROUTE_PROFILES.lane.crownMeters).toBeGreaterThan(WORLD_ROUTE_PROFILES.trail.crownMeters);

    for (const route of WorldLayout.routeDefinitions()) {
      for (const point of route.points) {
        expect(Math.abs(
          WorldLayout.terrainHeight(point.x, point.z) - WorldLayout.naturalTerrainHeight(point.x, point.z)
        )).toBeLessThanOrEqual(0.450001);
      }
    }
    for (const path of WORLD_PATHS) {
      for (let index = 0; index < path.length; index += 5) {
        const point = path[index];
        expect(Math.abs(
          WorldLayout.terrainHeight(point.x, point.z) - WorldLayout.naturalTerrainHeight(point.x, point.z)
        )).toBeLessThanOrEqual(0.450001);
      }
    }

    const geometry = WorldLayout.buildPathGeometry();
    const positions = geometry.getAttribute("position");
    const liftAt = (index: number) => {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      return positions.getY(index) - WorldLayout.terrainHeight(x, z);
    };
    expect(liftAt(6)).toBeGreaterThan(liftAt(4));
    expect(liftAt(6)).toBeGreaterThan(liftAt(8));
    expect(liftAt(0)).toBeLessThan(liftAt(6));
    expect(geometry.userData.routeProfiles).toHaveLength(7);
    geometry.dispose();
  });

  it("owns weighted materials, route topology, and deterministic cover density", () => {
    expect(WorldLayout.routeDefinitions()).toHaveLength(7);
    const weights = WorldLayout.terrainSurfaceWeights(-65, -55);
    expect(Object.values(weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 6);
    const first = createWorldEnvironmentLayout(42891).groundCoverPlacements;
    const second = createWorldEnvironmentLayout(42891).groundCoverPlacements;
    expect(second).toEqual(first);
    expect(first.filter((placement) => placement.category === "grass")).toHaveLength(GROUND_COVER_DENSITY.high.grass);
    expect(first.filter((placement) => placement.category === "flowers")).toHaveLength(GROUND_COVER_DENSITY.high.flowers);
    expect(first.filter((placement) => placement.category === "pebbles")).toHaveLength(GROUND_COVER_DENSITY.high.pebbles);
    expect(first.filter((placement) => placement.category === "driftwood")).toHaveLength(GROUND_COVER_DENSITY.high.driftwood);
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

    expect(authored).toHaveLength(27);
    expect(layoutDerived).toHaveLength(78);
    expect(seeded).toHaveLength(168);

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
      tree_oak_a: 20,
      tree_oak_b: 23,
      tree_oak_c: 24,
      tree_apple_a: 20,
      tree_pine_a: 13,
      tree_pine_b: 8,
      foliage_bush_a: 60
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
      if (placement.category !== "pebbles") {
        expect(WorldLayout.pathInfluence(placement.x, placement.z)).toBeLessThan(0.08);
      }
    }
    expect(Object.fromEntries(groundCoverAssetCounts)).toEqual({
      foliage_grass_a: 600,
      foliage_grass_b: 600,
      foliage_grass_c: 600,
      foliage_wildflower_a: 100,
      foliage_wildflower_b: 100,
      foliage_wildflower_c: 100,
      rock_pebble_cluster_a: 61,
      rock_pebble_cluster_b: 60,
      rock_pebble_cluster_c: 59,
      prop_driftwood_a: 10,
      prop_driftwood_b: 10,
      prop_driftwood_c: 10
    });

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
    ).toHaveLength(133);

    const coastalRocks = authored.filter((placement) => placement.assetId.startsWith("rock_coastal_"));
    expect(coastalRocks).toHaveLength(4);
    for (const placement of coastalRocks) {
      expect(WorldLayout.terrainNormal(placement.x, placement.z).y).toBeGreaterThan(0.8);
      expect(isPlacementFootprintStable(placement, 0.8, 1.1)).toBe(true);
    }
    expect(authored.filter((placement) => placement.assetId === "fauna_chicken_a")).toHaveLength(2);
    expect(authored.filter((placement) => placement.assetId === "prop_wagon_cart_a")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "fauna_cow_a")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "prop_fishing_net_rack_a")).toHaveLength(1);
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
    const routes = WorldLayout.routeDefinitions();
    expect(routes.map((route) => route.id)).toEqual([
      "farm-village",
      "village-homestead",
      "village-harbor",
      "village-lighthouse",
      "riverbank-trail",
      "cliffside-coastal-walk",
      "orchard-path"
    ]);
    expect(routes.map((route) => route.kind)).toEqual([
      "arterial", "lane", "arterial", "lane", "trail", "trail", "trail"
    ]);
    for (const path of WORLD_PATHS) {
      for (let index = 1; index < path.length; index++) {
        expect(Math.hypot(path[index].x - path[index - 1].x, path[index].z - path[index - 1].z)).toBeLessThan(4.2);
      }
    }

    const farmVillage = routes[0].points;
    expect(farmVillage.some((point) => Math.hypot(point.x + 14, point.z + 7) < 0.01)).toBe(true);
    expect(farmVillage.at(-1)).toEqual(WORLD_LAYOUT_V3.anchors.villageMarket);
    for (const route of routes.slice(1, 4)) {
      expect(route.points[0]).toEqual(WORLD_LAYOUT_V3.anchors.villageMarket);
    }
    expect(routes[5].points[0]).toEqual(WORLD_LAYOUT_V3.anchors.lighthouse);
    expect(routes[5].points.at(-1)).toEqual(WORLD_LAYOUT_V3.anchors.fishMarket);
    expect(routes[6].points[0]).toEqual(WORLD_LAYOUT_V3.anchors.privateHomestead);
  });

  it("keeps every interaction anchor valid in its movement domain", () => {
    const { harborDock, ...walkableAnchors } = WORLD_LAYOUT_V3.anchors;
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
    expect(first.some((placement) => placement.x < WORLD_LAYOUT_V3.riverMouth.x)).toBe(true);
    expect(first.some((placement) => placement.x > WORLD_LAYOUT_V3.riverMouth.x)).toBe(true);
    expect(first.every((placement) => WorldLayout.estuaryInfluence(placement.x, placement.z) > 0)).toBe(true);
    expect(first.every((placement) => placement.z < WORLD_LAYOUT_V3.riverMouth.z)).toBe(true);
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
    const mouth = WORLD_LAYOUT_V3.riverMouth;
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
    const bridge = WORLD_LAYOUT_V3.anchors.bridge;
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
