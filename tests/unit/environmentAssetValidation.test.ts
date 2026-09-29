import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { ASSET_BY_ID, ASSET_IDS, type AssetId } from "../../src/render/assets/AssetCatalog";
import { NEW_GAME_WORLD_SEED } from "../../src/simulation/core/createInitialState";
import { validateEnvironmentPlacementAsset } from "../../src/world/EnvironmentAssetValidation";
import { createWorldEnvironmentLayout } from "../../src/world/WorldEnvironmentLayout";
import { decodeEnvironmentLayoutBake, encodeEnvironmentLayoutBake } from "../../src/world/EnvironmentLayoutBake";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import { WorldLayout } from "../../src/world/WorldLayout";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { BOAT_MOORINGS } from "../../src/world/WorldMoorings";
import { WORLD_STATION_DEFINITIONS } from "../../src/world/WorldGameplayLocations";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { FARMHOUSE_OUTSIDE_DOOR, FARMHOUSE_INTERIOR_DOOR } from "../../src/world/FarmhouseInterior";

describe("world startup environment asset validation", () => {
  it.each([NEW_GAME_WORLD_SEED, 0, 17, 42, 63])("accepts the complete layout for seed %s with ground cover still passable", seed => {
    const layout = createWorldEnvironmentLayout(seed);
    const rejected: string[] = [];
    for (const placement of [...layout.staticPlacements, ...layout.groundCoverPlacements]) {
      try { validateEnvironmentPlacementAsset(placement); }
      catch (error) { rejected.push(String(error)); }
    }
    expect(rejected).toEqual([]);
    expect(layout.groundCoverPlacements.filter(p => ASSET_BY_ID.get(p.assetId as AssetId)?.collision !== "none")).toEqual([]);
  }, 60_000);

  it("accepts the reported fallen-log placement with its collider intact, including a production bake", () => {
    const layout = createWorldEnvironmentLayout(NEW_GAME_WORLD_SEED);
    const log = layout.staticPlacements.find(p => p.id === "seeded-fill.mainland.understory.-27.-70")!;
    expect(log).toBeDefined();
    expect(log.assetId).toBe(ASSET_IDS.PROP_FALLEN_LOG_A);
    expect(validateEnvironmentPlacementAsset(log).collision).not.toBe("none");
    const decoded = decodeEnvironmentLayoutBake(encodeEnvironmentLayoutBake({
      worldSeed: NEW_GAME_WORLD_SEED, staticPlacements: [log], groundCoverPlacements: []
    }, WORLD_LAYOUT_REVISION), { worldSeed: NEW_GAME_WORLD_SEED, layoutRevision: WORLD_LAYOUT_REVISION });
    expect(decoded.staticPlacements).toEqual([log]);
    expect(validateEnvironmentPlacementAsset(decoded.staticPlacements[0]).id).toBe(log.assetId);
  });

  it.each([ASSET_IDS.BUILDING_MEDIEVAL_TIMBER_COTTAGE_A, ASSET_IDS.DOCK_HARBOR_MAIN_A, ASSET_IDS.PROP_CARGO_CRATE_LARGE_A])(
    "continues to reject an unreviewed seeded %s while accepting its authored placement", assetId => {
      const placement = { id: "seeded-fill.invalid", assetId, origin: "seeded-fill" as const };
      expect(ASSET_BY_ID.get(assetId)?.collision).not.toBe("none");
      expect(() => validateEnvironmentPlacementAsset(placement)).toThrow("cannot use colliding asset");
      expect(validateEnvironmentPlacementAsset({ ...placement, origin: "authored" }).id).toBe(assetId);
    }
  );

  it("continues to reject unknown catalog assets", () => {
    expect(() => validateEnvironmentPlacementAsset({ id: "authored.invalid", assetId: "prop.missing", origin: "authored" }))
      .toThrow("Unknown environment asset");
  });

  it("keeps the admitted solid props off route samples, workshop approaches, doors and boarding points", () => {
    const layout = createWorldEnvironmentLayout(NEW_GAME_WORLD_SEED);
    const boxes = layout.staticPlacements.flatMap(p => {
      const spec = validateEnvironmentPlacementAsset(p);
      if (p.origin !== "seeded-fill" || spec.family !== "prop" || spec.collision === "none") return [];
      const root = new Object3D();
      root.position.set(p.x, p.y ?? WorldLayout.terrainHeight(p.x, p.z), p.z);
      root.rotation.y = p.rotationY;
      root.scale.set(...p.scale);
      return projectAssetCollision(spec.id, root, p.id);
    });
    expect(boxes.length).toBeGreaterThan(0);
    const points = [
      ...WorldLayout.compiledRouteNetwork().flatMap(r => r.samples.map(s => ({ ...s.point, label: r.route.id }))),
      ...Object.entries(WORLD_STATION_DEFINITIONS).flatMap(([id, station]) => {
        const front = getProcessingStationFrontPosition(id, { ...station.position, rotationY: station.rotationY } as never);
        return front ? [{ ...front, label: id }] : [];
      }),
      ...BOAT_MOORINGS.map(m => ({ ...m.playerPosition, label: m.id })),
      { ...FARMHOUSE_OUTSIDE_DOOR, label: "farmhouse outside door" },
      { ...FARMHOUSE_INTERIOR_DOOR.enterSpawn, label: "farmhouse entry" }
    ];
    const blocked = points.filter(p => !staticPoseIsClear(boxes, p, WorldLayout.traversalSurfaceHeight(p.x, p.z), .4))
      .map(p => ({ label: p.label, x: p.x, z: p.z, blockedBy: boxes.filter(b =>
        !staticPoseIsClear([b], p, WorldLayout.traversalSurfaceHeight(p.x, p.z), .4)).map(b => b.id) }));
    expect(blocked).toEqual([]);
  });
});
