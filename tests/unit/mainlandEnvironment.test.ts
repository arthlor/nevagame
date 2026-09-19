import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import catalog from "../../assets/specs/asset-catalog.json";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import type { AssetId } from "../../src/render/assets/AssetCatalog";
import { runSync } from "../../src/utils/CooperativeTask";
import { mainlandSettlementClearanceAt } from "../../src/world/MainlandSettlementLayout";
import { MAINLAND_VILLAGES } from "../../src/world/NevaMainland";
import { mainlandSettlementPlacements, mainlandStructuralPlacementSteps, mainlandGroundCoverSteps } from "../../src/world/MainlandEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import { createWorldStaticPlacements, isPlacementFootprintStable } from "../../src/world/WorldEnvironmentLayout";

describe("mainland environment", () => {
  it("grounds village buildings and keeps the market customer and NPC stations outside building footprints", () => {
    const placements = mainlandSettlementPlacements();
    for (const placement of placements) {
      expect(catalog.assets.some((asset) => asset.id === placement.assetId), placement.assetId).toBe(true);
      expect(WorldLayout.isWater(placement.x, placement.z), placement.id).toBe(false);
      if (placement.id.endsWith(".waymark") || placement.id.endsWith(".bench") || placement.id.includes(".waystation.")) {
        const road = WorldLayout.nearestRouteDistance(placement.x, placement.z);
        const radius = placement.assetId === "prop_bench_wood_a" ? 1.6 : 0.9;
        expect(road.distance, placement.id).toBeGreaterThan(road.halfWidth + road.shoulderWidthMeters + radius);
      }
      if (!placement.grounding) continue;
      expect(isPlacementFootprintStable(placement), placement.id).toBe(true);
      for (const route of WorldLayout.compiledRouteNetwork()) {
        for (const sample of route.samples) {
          const dx = sample.point.x - placement.x, dz = sample.point.z - placement.z;
          if (Math.hypot(dx, dz) > 16) continue;
          const localX = dx * Math.cos(placement.rotationY) - dz * Math.sin(placement.rotationY);
          const localZ = dx * Math.sin(placement.rotationY) + dz * Math.cos(placement.rotationY);
          const distance = Math.hypot(Math.max(0, Math.abs(localX) - placement.grounding[0]),
            Math.max(0, Math.abs(localZ) - placement.grounding[1]));
          expect(distance, `${placement.id} blocks ${route.route.id}`).toBeGreaterThan(route.halfWidth + 0.6);
        }
      }
      for (const village of Object.values(MAINLAND_VILLAGES)) {
        for (const anchor of [village.market, village.npc]) {
          const dx = anchor.x - placement.x, dz = anchor.z - placement.z;
          const localX = dx * Math.cos(placement.rotationY) - dz * Math.sin(placement.rotationY);
          const localZ = dx * Math.sin(placement.rotationY) + dz * Math.cos(placement.rotationY);
          const distance = Math.hypot(Math.max(0, Math.abs(localX) - placement.grounding[0]),
            Math.max(0, Math.abs(localZ) - placement.grounding[1]));
          expect(distance, `${placement.id} approach`).toBeGreaterThan(1);
        }
      }
    }
  });

  it.each([0, 17, 42, 63])("keeps seed %s biome dressing deterministic, bounded, dry and clear of freight roads and villages", (seed) => {
    const placements = runSync(mainlandStructuralPlacementSteps(seed));
    if (seed === 42) expect(placements).toEqual(runSync(mainlandStructuralPlacementSteps(seed)));
    expect(placements.length).toBeGreaterThan(7_000);
    expect(placements.length).toBeLessThan(11_000);
    expect(new Set(placements.map((placement) => placement.id)).size).toBe(placements.length);
    for (const placement of placements) {
      expect(catalog.assets.some((asset) => asset.id === placement.assetId), placement.assetId).toBe(true);
      expect(WorldLayout.isWater(placement.x, placement.z), placement.id).toBe(false);
      const route = WorldLayout.nearestRouteDistance(placement.x, placement.z);
      expect(route.distance, placement.id).toBeGreaterThan(route.halfWidth + route.shoulderWidthMeters + 0.7);
      expect(mainlandSettlementClearanceAt(placement.x, placement.z), placement.id).toBeGreaterThan(0.7);
    }
    const forest = placements.filter((p) => p.biomeId === "biome.pine_forest" && p.assetId.startsWith("tree_pine"));
    const marsh = placements.filter((p) => p.biomeId === "biome.reed_marsh");
    const highlands = placements.filter((p) => p.biomeId === "biome.highlands");
    expect(forest.length).toBeGreaterThan(2_000);
    expect(marsh.length).toBeGreaterThan(700);
    expect(highlands.length).toBeGreaterThan(1_500);
    const trees = placements.filter((p) => p.compositionTag?.category === "tree");
    expect(trees.length).toBeGreaterThan(4_500);
    const lodAssetIds = new Set(catalog.assets.filter((asset) => "lodLevels" in asset && (asset.lodLevels?.length ?? 0) > 1).map((asset) => asset.id));
    expect(trees.filter((p) => lodAssetIds.has(p.assetId)).length / trees.length).toBeGreaterThan(0.85);
    // The walk into Pinewatch reads as woodland; working clearances no longer empty the whole village.
    expect(trees.filter((p) => Math.hypot(p.x + 410, p.z + 85) < 100).length).toBeGreaterThan(120);
    expect(trees.filter((p) => Object.values(MAINLAND_VILLAGES).some((village) =>
      Math.hypot(p.x - village.market.x, p.z - village.market.z) < 43)).length).toBeGreaterThan(15);
  }, 60_000);

  it("leaves carriage-width road centers and interaction stations clear of actual catalog collision", () => {
    const collision = createWorldStaticPlacements(42).flatMap((placement) => {
      const root = new Object3D();
      root.position.set(placement.x, WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
      root.rotation.y = placement.rotationY;
      root.scale.set(...placement.scale);
      return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
    });
    for (const route of WorldLayout.compiledRouteNetwork().filter((route) => route.route.id.startsWith("mainland-"))) {
      for (const sample of route.samples) {
        expect(staticPoseIsClear(collision, sample.point, WorldLayout.terrainHeight(sample.point.x, sample.point.z), 1.2),
          `${route.route.id} at ${sample.point.x}, ${sample.point.z}`).toBe(true);
      }
    }
    for (const village of Object.values(MAINLAND_VILLAGES)) {
      for (const anchor of [village.market, village.npc,
        { x: village.market.x - 15, z: village.market.z - 7 },
        { x: village.market.x + 15, z: village.market.z - 8 }]) {
        expect(staticPoseIsClear(collision, anchor, WorldLayout.terrainHeight(anchor.x, anchor.z), 0.7), village.id).toBe(true);
      }
    }
  });

  it("reuses bounded catalog accents over the terrain-driven meadow carpet", () => {
    const cover = runSync(mainlandGroundCoverSteps(42));
    expect(cover.length).toBeGreaterThan(10_000);
    expect(cover.length).toBeLessThan(20_000);
    for (const placement of cover) {
      expect(placement.category).not.toBe("grass");
      expect(WorldLayout.isWater(placement.x, placement.z)).toBe(false);
      expect(WorldLayout.pathInfluence(placement.x, placement.z)).toBeLessThan(0.08);
    }
  }, 60_000);
});
