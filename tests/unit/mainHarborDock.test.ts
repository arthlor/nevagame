import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { OBB } from "three/examples/jsm/math/OBB.js";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { staticPoseIsClear, type StaticCollisionProxy } from "../../src/physics/StaticCollision";
import { ASSET_IDS, boatAssetId, type AssetId } from "../../src/render/assets/AssetCatalog";
import { Simulation } from "../../src/simulation/Simulation";
import { mainHarborDockDressing } from "../../src/world/HarborDistrictLayout";
import { HARBOR_DOCK, HARBOR_MAIN_PIER, HARBOR_SKIFF_MOORING, HARBOR_TRADE_MOORING } from "../../src/world/WorldAnchors";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import { WORLD_SAILING_ROUTES } from "../../src/world/WorldMoorings";

const berths = [["boat.rowboat", HARBOR_DOCK], ["boat.skiff", HARBOR_SKIFF_MOORING], ["boat.trading_ship", HARBOR_TRADE_MOORING]] as const;
let collision: StaticCollisionProxy[];
beforeAll(() => {
  const dock = WorldLayout.landmark("dock"), root = new THREE.Object3D();
  root.position.set(dock.x, WorldLayout.terrainHeight(dock.x, dock.z) + dock.yOffset, dock.z); root.rotation.y = dock.rotationY;
  collision = projectAssetCollision(ASSET_IDS.DOCK_HARBOR_MAIN_A, root, "main-dock");
  for (const p of createWorldStaticPlacements(42).filter(p => p.x > 35 && p.x < 150 && p.z > 30 && p.z < 125)) {
    const placed = new THREE.Object3D(); placed.position.set(p.x, p.y ?? WorldLayout.terrainHeight(p.x, p.z), p.z);
    placed.rotation.y = p.rotationY; placed.scale.set(...p.scale);
    collision.push(...projectAssetCollision(p.assetId as AssetId, placed, p.id));
  }
}, 300_000);

function place(sim: Simulation, x: number, z: number) {
  Object.assign(sim.state.player, { x, z, y: WorldLayout.traversalSurfaceHeight(x, z) + .5, activeBoatId: null });
  sim.state.player.traversal.isGrounded = true;
}

describe("Neva main harbor pier", () => {
  it("keeps a continuous center lane and each boarding crossway clear of cargo", () => {
    expect(mainHarborDockDressing((x, z) => WorldLayout.terrainHeight(x, z)).length).toBeGreaterThan(15);
    for (let z = 65; z <= 112; z += .4) for (const x of [74.5, 75.5, 76.5])
      expect(staticPoseIsClear(collision, { x, z }, WorldLayout.pierDeckSurfaceY(), .4), `${x}/${z}`).toBe(true);
    for (const [, berth] of berths) for (let fraction = 0; fraction <= 1; fraction += .1) {
      const p = { x: 75.5 + fraction * (berth.playerPosition.x - 75.5), z: berth.playerPosition.z };
      expect(WorldLayout.isPierDeck(p.x, p.z)).toBe(true);
      expect(staticPoseIsClear(collision, p, WorldLayout.pierDeckSurfaceY(), .4)).toBe(true);
    }
    expect(createWorldStaticPlacements(42).some(p => p.id.endsWith("neva.supply-shelter") || p.id.endsWith("neva.freight-sign"))).toBe(false);
  });

  it("keeps every hull clear of the published pier and shore obstacles through departure", () => {
    const obb = (b: StaticCollisionProxy) => new OBB(new THREE.Vector3(b.center.x, b.center.y, b.center.z),
      new THREE.Vector3(b.halfExtents.x, b.halfExtents.y, b.halfExtents.z),
      new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w))));
    const parked = berths.map(([type, berth]) => {
      const root = new THREE.Object3D(); root.position.set(berth.boatPosition.x, 0, berth.boatPosition.z);
      return { type, hulls: projectAssetCollision(boatAssetId(type), root, type) };
    });
    for (const [type, berth] of berths) for (let travel = 0; travel <= 42; travel += 1) {
      const root = new THREE.Object3D(); root.position.set(berth.boatPosition.x, 0, berth.boatPosition.z + travel);
      expect(WorldLayout.isSailable(root.position.x, root.position.z), `${type}/${travel}`).toBe(true);
      for (const hull of projectAssetCollision(boatAssetId(type), root, type)) for (const obstacle of collision)
        expect(obb(hull).intersectsOBB(obb(obstacle)), `${type}/${travel}/${obstacle.id}`).toBe(false);
    }
    for (const route of WORLD_SAILING_ROUTES.filter(r => r.fromMooringId.startsWith("mooring.neva_harbor"))) {
      for (let i = 1; i <= 2; i++) for (let t = 0; t <= 1; t += .02) {
        const a = route.points[i - 1], b = route.points[i];
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        expect(WorldLayout.isSailable(x, z), route.id).toBe(true);
        const root = new THREE.Object3D(); root.position.set(x, 0, z); root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        for (const hull of projectAssetCollision(boatAssetId(route.requiredBoatTypeId), root, route.id))
          for (const other of parked.filter(p => p.type !== route.requiredBoatTypeId)) for (const berthedHull of other.hulls)
            expect(obb(hull).intersectsOBB(obb(berthedHull)), `${route.id}/${other.type}/${t}`).toBe(false);
      }
    }
  });

  it("walks from shore to the outer end and back with the real character controller", async () => {
    const physics = await PhysicsWorld.create(collision), sim = new Simulation();
    try {
      place(sim, HARBOR_MAIN_PIER.x, 61.5);
      for (const targetZ of [111, 61.5]) {
        for (let frame = 0; frame < 1800 && Math.abs(sim.state.player.z - targetZ) > .25; frame++) {
          const result = physics.step(sim.state, { x: 0, z: Math.sign(targetZ - sim.state.player.z), sprint: false }, "on-foot", 1 / 60, frame / 60);
          expect(sim.commitPhysicsFrame(result.frame).success).toBe(true);
        }
        expect(Math.abs(sim.state.player.z - targetZ)).toBeLessThan(.25);
      }
    } finally { physics.dispose(); }
  }, 60_000);

  it("boards only the local berth, sails clear and redocks each vessel parallel to the pier", async () => {
    const physics = await PhysicsWorld.create(collision), sim = new Simulation();
    try {
      sim.prepareDebugHarborBoarding(); expect(sim.prepareDebugSkiffReview()).toBe(true);
      sim.state.player.money = 200_000; sim.state.player.proficiencies.trading = 30_000;
      place(sim, HARBOR_TRADE_MOORING.purchasePosition.x, HARBOR_TRADE_MOORING.purchasePosition.z);
      expect(sim.execute({ type: "vehicle.purchase", vehicleTypeId: "boat.trading_ship" }).success).toBe(true);
      for (const [type, berth] of berths) {
        const boat = Object.values(sim.state.boats).find(b => b.boatTypeId === type)!;
        place(sim, 75.5, 61.5); expect(sim.boardBoat(boat.id).success).toBe(false);
        place(sim, berth.playerPosition.x, berth.playerPosition.z); expect(sim.boardBoat(boat.id).success).toBe(true);
        const startZ = boat.z;
        for (let frame = 0; frame < 80; frame++) {
          const result = physics.step(sim.state, { x: 0, z: -1, sprint: false }, "boat-driving", 1 / 60, frame / 60);
          expect(sim.commitPhysicsFrame(result.frame).success).toBe(true);
        }
        expect(boat.z).toBeGreaterThan(startZ + .4);
        boat.headingRadians = .35;
        expect(sim.dockActiveBoat().success).toBe(true);
        expect(boat.headingRadians).toBe(0);
        expect(sim.state.player.y).toBeCloseTo(WorldLayout.pierDeckSurfaceY() + .5, 3);
      }
    } finally { physics.dispose(); }
  });

  it("casts to nearby open water along both sides and the end instead of back underneath the dock", () => {
    for (const [x, z] of [[72.2, 88], [78.8, 90], [75.5, 111]]) {
      const access = WorldLayout.fishingAccessAt(x, z);
      expect(access.accessible).toBe(true); expect(access.target).not.toBeNull();
      expect(WorldLayout.isWater(access.target!.x, access.target!.z)).toBe(true);
      expect(Math.hypot(access.target!.x - x, access.target!.z - z)).toBeLessThanOrEqual(4.5);
    }
  });
});
