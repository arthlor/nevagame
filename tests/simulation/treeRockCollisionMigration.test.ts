import { describe, it, expect } from "vitest";
import { Object3D } from "three";
import fixture from "../fixtures/save_v34_layout14.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import { WorldLayout } from "../../src/world/WorldLayout";
import { ASSET_BY_ID, type AssetId } from "../../src/render/assets/AssetCatalog";
import authoringCatalog from "../../assets/specs/asset-catalog.json";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { WORLD_STATION_DEFINITIONS } from "../../src/world/WorldGameplayLocations";
import { HARBOR_DOCK, VILLAGE_MARKET, HARBOR_MARKET } from "../../src/world/WorldAnchors";
import { FARMHOUSE_OUTSIDE_DOOR, FARMHOUSE_INTERIOR_DOOR } from "../../src/world/FarmhouseInterior";
import type { SaveEnvelope } from "../../src/persistence/SaveSchema";
import type { GameState } from "../../src/simulation/core/types";

function legacyEnvelope(): SaveEnvelope {
  return structuredClone(fixture) as unknown as SaveEnvelope;
}

const collision = createWorldStaticPlacements(42891).flatMap((placement) => {
  const root = new Object3D();
  root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
  root.rotation.y = placement.rotationY;
  root.scale.set(...placement.scale);
  return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
});

function clear(point: { x: number; z: number }, radius = 0.45): boolean {
  return staticPoseIsClear(collision, point, WorldLayout.traversalSurfaceHeight(point.x, point.z), radius);
}

/** The assets this change made solid. */
const NEWLY_SOLID = [
  "tree_oak_a", "tree_oak_b", "tree_oak_c", "tree_oak_broadleaf_a", "tree_maple_a",
  "tree_pine_a", "tree_pine_b", "tree_pine_tall_a", "tree_apple_a",
  "rock_field_a", "rock_coastal_boulder_a"
] as const;

const placements = createWorldStaticPlacements(42891);
const placementById = new Map(placements.map((placement) => [placement.id, placement]));
const newCollision = collision.filter((proxy) => {
  const placement = placementById.get(proxy.id.split(":")[0]);
  return placement !== undefined && (NEWLY_SOLID as readonly string[]).includes(placement.assetId);
});

function clearOfNewColliders(point: { x: number; z: number }, radius = 0.45): boolean {
  return staticPoseIsClear(newCollision, point, WorldLayout.traversalSurfaceHeight(point.x, point.z), radius);
}

const authoringById = new Map(
  (authoringCatalog.assets as Array<{ id: string; dimensions: { width: number; depth: number; height: number } }>)
    .map((asset) => [asset.id, asset])
);

describe("tree and rock collision (schema 36 / layout 15)", () => {
  it("gives mature trees a trunk collider and leaves saplings and ground cover passable", () => {
    for (const id of NEWLY_SOLID) {
      const spec = ASSET_BY_ID.get(id as AssetId)!;
      const dimensions = authoringById.get(id)!.dimensions;
      expect(spec.collision, id).toBe("box");
      expect(spec.collisionPrimitives, id).toHaveLength(1);
      const primitive = spec.collisionPrimitives![0];
      // Boxes sit on the ground and clear a standing actor's head
      // (ACTOR_HEAD_METERS 1.9) for trees, and stay inside the visible
      // silhouette so the player never collides with open air.
      expect(primitive.center[1], id).toBeCloseTo(primitive.halfExtents[1], 6);
      if (id.startsWith("tree_")) {
        expect(primitive.center[1] + primitive.halfExtents[1], id).toBeGreaterThanOrEqual(1.9);
      }
      expect(primitive.halfExtents[0], id).toBeLessThanOrEqual(dimensions.width / 2);
      expect(primitive.halfExtents[2], id).toBeLessThanOrEqual(dimensions.depth / 2);
      expect(primitive.halfExtents[1] * 2, id).toBeLessThanOrEqual(dimensions.height + 0.9);
    }

    // Small dressing stays walk-through: a sapling or a pebble is not an obstacle.
    for (const id of ["tree_pine_young_a", "rock_pebble_cluster_a", "rock_reef_small_a"]) {
      expect(ASSET_BY_ID.get(id as AssetId)?.collision, id).toBe("none");
    }
  });

  it("puts real colliders in the world without blocking roads, doors, stalls or the dock", () => {
    expect(collision.length).toBeGreaterThan(200);

    const mustStayReachable: Array<{ label: string; x: number; z: number }> = [
      { label: "harbor boarding point", ...HARBOR_DOCK.playerPosition },
      { label: "village market", ...VILLAGE_MARKET.position },
      { label: "harbor market", ...HARBOR_MARKET.position },
      { label: "farmhouse outside door", x: FARMHOUSE_OUTSIDE_DOOR.x, z: FARMHOUSE_OUTSIDE_DOOR.z },
      { label: "farmhouse interior door", x: FARMHOUSE_INTERIOR_DOOR.x, z: FARMHOUSE_INTERIOR_DOOR.z },
      // The approach point is where the player actually stands; the station
      // position is the workbench itself, which has always had a collider.
      ...Object.entries(WORLD_STATION_DEFINITIONS).flatMap(([id, station]) => {
        const front = getProcessingStationFrontPosition(id, {
          x: station.position.x, z: station.position.z, rotationY: station.rotationY
        } as never);
        return front ? [{ label: `station approach ${id}`, x: front.x, z: front.z }] : [];
      })
    ];
    for (const point of mustStayReachable) {
      expect(clearOfNewColliders(point), `${point.label} is inside a new tree or rock collider`).toBe(true);
    }
  });

  it("blocks no authored route with a newly solid tree or rock", () => {
    // Measured against the new colliders alone. One sample of the 1031 in the
    // network was already blocked before this change, by the authored
    // `rock_spire_a` ridge landmark on Sunreach's scrub-ridge; that is
    // pre-existing world dressing, not something trunks introduced.
    let samples = 0;
    for (const route of WorldLayout.compiledRouteNetwork()) {
      for (const sample of route.samples) {
        samples += 1;
        expect(
          clearOfNewColliders(sample.point),
          `${route.route.id} blocked at ${sample.point.x.toFixed(1)},${sample.point.z.toFixed(1)}`
        ).toBe(true);
      }
    }
    expect(samples).toBeGreaterThan(500);
  });

  it("migrates a legacy save to layout 15 and preserves gameplay truth", () => {
    const before = legacyEnvelope();
    const original = structuredClone(before);
    const after = migrateSaveData(before);

    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(validateSaveEnvelope(after)).toBe(true);

    // `migrateSaveData` backfills market commodities in place, by design, so a
    // fixture written before a commodity was authored is edited as it passes
    // through. Everything else must be left exactly as it was found.
    const { markets: originalMarkets, ...originalRest } = original.state;
    const { markets: passedMarkets, ...passedRest } = before.state;
    expect(passedRest).toEqual(originalRest);
    // The backfill may only add commodities, never drop or rewrite one.
    for (const [marketId, market] of Object.entries(originalMarkets)) {
      for (const [itemId, commodity] of Object.entries(market.commodities)) {
        expect(passedMarkets[marketId].commodities[itemId], `${marketId}/${itemId}`).toEqual(commodity);
      }
    }
    // Repeat loads are stable.
    expect(migrateSaveData(after)).toEqual(after);

    const state = after.state as GameState;
    expect(Object.keys(state.crops)).toEqual(Object.keys(original.state.crops));
    expect(state.inventories).toEqual(original.state.inventories);
    expect(state.player.money).toBe(original.state.player.money);
    expect(state.player.proficiencies).toEqual(original.state.player.proficiencies);
    expect(state.metadata.rngState).toEqual(original.state.metadata.rngState);
  });

  it("moves a player who loads inside a new collider, and only that player", () => {
    const envelope = legacyEnvelope();
    const state = envelope.state as GameState;
    // Drop the player onto a scattered tree trunk.
    const trunk = collision.find((proxy) => proxy.id.includes("tree"));
    expect(trunk, "no tree collider was projected").toBeDefined();
    state.player.x = trunk!.center.x;
    state.player.z = trunk!.center.z;
    state.player.activeBoatId = null;
    state.player.activeMountId = null;
    const inventoriesBefore = structuredClone(state.inventories);

    const after = migrateSaveData(envelope);
    const moved = after.state.player;
    expect(clear({ x: moved.x, z: moved.z }), "player is still inside a collider").toBe(true);
    expect(WorldLayout.isWater(moved.x, moved.z)).toBe(false);
    // Only the pose moves.
    expect(after.state.inventories).toEqual(inventoriesBefore);
    expect(validateSaveEnvelope(after)).toBe(true);
  });
});
