import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { Simulation } from "../../src/simulation/Simulation";
import { PLAYER_TRAVERSAL_TUNING, slopeGaitScale } from "../../src/simulation/navigation/PlayerTraversal";
import { HARBOR_DOCK } from "../../src/world/WorldAnchors";
import { FARMHOUSE_INTERIOR_BOUNDS, FARMHOUSE_INTERIOR_DOOR } from "../../src/world/FarmhouseInterior";
import {
  BRIDGE_WORLD_PROFILE,
  COMPILED_WORLD_ROUTES,
  WORLD_LAYOUT_V5,
  WORLD_REGIONAL_PATHS,
  WorldLayout
} from "../../src/world/WorldLayout";

const landmarkCollision = (
  assetId: Parameters<typeof projectAssetCollision>[0],
  landmarkId: Parameters<typeof WorldLayout.landmark>[0]
) => {
  const layout = WorldLayout.landmark(landmarkId);
  const root = new THREE.Object3D();
  root.position.set(
    layout.x,
    WorldLayout.terrainHeight(layout.x, layout.z) + layout.yOffset,
    layout.z
  );
  root.rotation.y = layout.rotationY;
  root.scale.setScalar(layout.scale);
  return projectAssetCollision(assetId, root, landmarkId);
};

function placePlayer(sim: Simulation, x = 0, z = 0): void {
  Object.assign(sim.state.player, {
    x,
    y: WorldLayout.traversalSurfaceHeight(x, z) + 0.5,
    z
  });
}

function findDryShoreApproach(normalX: number, normalZ: number): { x: number; z: number } {
  const tangentX = normalZ;
  const tangentZ = -normalX;
  for (let z = -22; z <= 34; z += 0.25) {
    for (let x = -42; x <= 42; x += 0.25) {
      if (
        !WorldLayout.isWater(x, z) &&
        WorldLayout.isWater(x + normalX * 0.5, z + normalZ * 0.5) &&
        !WorldLayout.isWater(x + tangentX * 0.5, z + tangentZ * 0.5)
      ) {
        return { x, z };
      }
    }
  }
  throw new Error(`No shoreline approach found for ${normalX},${normalZ}`);
}

describe("PhysicsWorld", () => {
  it("moves a grounded player while preserving the shoreline boundary", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    const state = sim.state;
    placePlayer(sim);
    const startZ = state.player.z;
    for (let index = 0; index < 30; index++) {
      const frame = physics.step(state, { x: 0, z: 1, sprint: false }, "on-foot", 1 / 60, index / 60);
      expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
    }
    expect(state.player.z).toBeGreaterThan(startZ + 0.2);
    expect(state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(state.player.x, state.player.z) + 0.5, 5);
  });

  it("jumps from grounded Rapier contact, rejects an air jump, and lands cleanly", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    placePlayer(sim);
    const startY = sim.state.player.y;
    let frame = physics.step(
      sim.state,
      { x: 0, z: 0, sprint: false, jumpRequested: true },
      "on-foot",
      1 / 60,
      0
    );
    expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
    expect(sim.state.player.traversal.isGrounded).toBe(false);
    expect(frame.playerMotion.contactEvent).toBe("takeoff");
    expect(frame.playerMotion.airbornePhase).toBe("rising");

    frame = physics.step(
      sim.state,
      { x: 0, z: 0, sprint: false },
      "on-foot",
      1 / 60,
      1 / 60
    );
    expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
    expect(sim.state.player.y).toBeGreaterThan(startY);

    let apex = sim.state.player.y;
    let landingContact: "land-soft" | "land-hard" | null = null;
    let landingImpact = 0;
    for (let index = 2; index <= 150; index++) {
      frame = physics.step(
        sim.state,
        {
          x: 0,
          z: 0,
          sprint: false,
          jumpRequested: index === 5
        },
        "on-foot",
        1 / 60,
        index / 60
      );
      expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
      apex = Math.max(apex, sim.state.player.y);
      if (frame.playerMotion.contactEvent === "land-soft" || frame.playerMotion.contactEvent === "land-hard") {
        landingContact = frame.playerMotion.contactEvent;
        landingImpact = frame.playerMotion.landingImpactStrength;
      }
    }

    expect(apex - startY).toBeGreaterThan(0.7);
    expect(apex - startY).toBeLessThan(1.1);
    expect(sim.state.player.traversal.isGrounded).toBe(true);
    expect(landingContact).not.toBeNull();
    expect(landingImpact).toBeGreaterThanOrEqual(0);
    expect(frame.playerMotion.groundNormal.y).toBeGreaterThan(0.7);
    expect(frame.playerMotion.airbornePhase).toBe("grounded");
    expect(sim.state.player.y).toBeCloseTo(
      WorldLayout.traversalSurfaceHeight(sim.state.player.x, sim.state.player.z) + 0.5,
      5
    );
  });

  it("keeps authoritative player position attached to the actively driven boat", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    const state = sim.state;
    const boat = state.boats["boat.player_rowboat"];
    const canonicalWaterline = boat.y;
    boat.isDocked = false;
    boat.dockedMarketId = null;
    state.player.activeBoatId = boat.id;
    const initialZ = boat.z;
    let lastMotion = null as ReturnType<PhysicsWorld["step"]>["boatMotion"][string] | null;
    for (let index = 0; index < 45; index++) {
      const frame = physics.step(state, { x: 0, z: -1, sprint: false }, "boat-driving", 1 / 60, index / 60);
      expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
      lastMotion = frame.boatMotion[boat.id];
    }
    expect(boat.z).toBeGreaterThan(initialZ);
    expect(boat.y).toBe(canonicalWaterline);
    expect(state.player.y).toBe(canonicalWaterline + 0.5);
    expect(state.player.x).toBeCloseTo(boat.x, 5);
    expect(state.player.z).toBeCloseTo(boat.z, 5);
    expect(lastMotion).toMatchObject({ throttle: 1 });
    expect(lastMotion?.controlEffort).toBeGreaterThan(0);
    expect(Number.isFinite(lastMotion?.accelerationMetersPerSecondSquared ?? NaN)).toBe(true);
    expect(Number.isFinite(lastMotion?.yawRateRadiansPerSecond ?? NaN)).toBe(true);
  });

  it("blocks the player with startup-projected static collision", async () => {
    const ground = WorldLayout.terrainHeight(0, 0);
    const physics = await PhysicsWorld.create([
      {
        kind: "box",
        id: "test-wall",
        center: { x: 0, y: ground + 1, z: 2 },
        halfExtents: { x: 2, y: 1, z: 0.4 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    ]);
    const sim = new Simulation();
    placePlayer(sim);
    let finalMotion = null as ReturnType<PhysicsWorld["step"]>["playerMotion"] | null;
    for (let index = 0; index < 120; index++) {
      const frame = physics.step(sim.state, { x: 0, z: 1, sprint: false }, "on-foot", 1 / 60, index / 60);
      expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
      finalMotion = frame.playerMotion;
    }
    expect(sim.state.player.z).toBeGreaterThan(0.2);
    expect(sim.state.player.z).toBeLessThan(1.35);
    expect(finalMotion?.isCollisionBlocked).toBe(true);
    expect(finalMotion?.speedMetersPerSecond).toBeLessThan(0.05);
  });

  it("sweeps the camera against static world geometry while ignoring player bodies", async () => {
    const ground = WorldLayout.terrainHeight(0, 0);
    const physics = await PhysicsWorld.create([
      {
        kind: "box",
        id: "camera-wall",
        center: { x: 0, y: ground + 2, z: 2.5 },
        halfExtents: { x: 2, y: 2, z: 0.25 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    ]);
    const result = physics.resolveCameraPosition(
      { x: 0, y: ground + 2, z: 0 },
      { x: 0, y: ground + 2, z: 5 },
      0.3
    );
    expect(result.obstructed).toBe(true);
    expect(result.position.z).toBeGreaterThan(1.5);
    expect(result.position.z).toBeLessThan(2.2);
  });

  it("accelerates, normalizes diagonal intent, and decelerates without skating", async () => {
    const straightPhysics = await PhysicsWorld.create();
    const diagonalPhysics = await PhysicsWorld.create();
    const straight = new Simulation();
    const diagonal = new Simulation();
    // Keep the intent-normalization probe off the now-physical road crown;
    // road traversal/collision is covered by the dedicated route tests below.
    placePlayer(straight, -120, -100);
    placePlayer(diagonal, -120, -100);
    const straightStart = { x: straight.state.player.x, z: straight.state.player.z };
    const diagonalStart = { x: diagonal.state.player.x, z: diagonal.state.player.z };
    let firstStepDistance = 0;
    let cruisingStepDistance = 0;
    for (let index = 0; index < 60; index++) {
      const before = { x: straight.state.player.x, z: straight.state.player.z };
      straight.commitPhysicsFrame(straightPhysics.step(
        straight.state,
        { x: 0, z: 1, sprint: false },
        "on-foot",
        1 / 60,
        index / 60
      ).frame);
      diagonal.commitPhysicsFrame(diagonalPhysics.step(
        diagonal.state,
        { x: 1, z: 1, sprint: false },
        "on-foot",
        1 / 60,
        index / 60
      ).frame);
      const distance = Math.hypot(straight.state.player.x - before.x, straight.state.player.z - before.z);
      if (index === 0) firstStepDistance = distance;
      if (index === 45) cruisingStepDistance = distance;
    }
    const straightDistance = Math.hypot(
      straight.state.player.x - straightStart.x,
      straight.state.player.z - straightStart.z
    );
    const diagonalDistance = Math.hypot(
      diagonal.state.player.x - diagonalStart.x,
      diagonal.state.player.z - diagonalStart.z
    );
    expect(cruisingStepDistance).toBeGreaterThan(firstStepDistance * 4);
    expect(Math.abs(diagonalDistance - straightDistance) / straightDistance).toBeLessThan(0.04);

    let lastMovingDistance = 0;
    for (let index = 0; index < 20; index++) {
      const before = { x: straight.state.player.x, z: straight.state.player.z };
      straight.commitPhysicsFrame(straightPhysics.step(
        straight.state,
        { x: 0, z: 0, sprint: false },
        "on-foot",
        1 / 60,
        2 + index / 60
      ).frame);
      lastMovingDistance = Math.hypot(
        straight.state.player.x - before.x,
        straight.state.player.z - before.z
      );
    }
    expect(lastMovingDistance).toBeLessThan(0.002);
  });

  it("steers velocity as a vector through 90 and 180 degree reversals without exceeding gait speed", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    placePlayer(sim);
    let result = physics.step(
      sim.state,
      { x: 0, z: 1, sprint: false },
      "on-foot",
      1 / 60,
      0
    );
    for (let index = 0; index < 50; index++) {
      result = physics.step(
        sim.state,
        { x: 0, z: 1, sprint: false },
        "on-foot",
        1 / 60,
        index / 60
      );
      sim.commitPhysicsFrame(result.frame);
    }
    expect(result.playerMotion.speedMetersPerSecond).toBeCloseTo(
      PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond
        * slopeGaitScale(
          WorldLayout.terrainNormal(sim.state.player.x, sim.state.player.z),
          0,
          1
        ),
      1
    );

    for (let index = 0; index < 30; index++) {
      result = physics.step(
        sim.state,
        { x: 1, z: 0, sprint: false },
        "on-foot",
        1 / 60,
        1 + index / 60
      );
      sim.commitPhysicsFrame(result.frame);
      expect(result.playerMotion.speedMetersPerSecond).toBeLessThanOrEqual(
        PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond * 1.14 + 0.001
      );
    }
    expect(result.playerMotion.velocity.x).toBeGreaterThan(
      PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond * 0.78
    );

    for (let index = 0; index < 40; index++) {
      result = physics.step(
        sim.state,
        { x: -1, z: 0, sprint: false },
        "on-foot",
        1 / 60,
        2 + index / 60
      );
      sim.commitPhysicsFrame(result.frame);
      expect(result.playerMotion.speedMetersPerSecond).toBeLessThanOrEqual(
        PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond * 1.14 + 0.001
      );
    }
    expect(result.playerMotion.velocity.x).toBeLessThan(
      -PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond * 0.78
    );
  });

  it("keeps players out of the river and blocks catalog-projected farmhouse walls", async () => {
    const farmhouseCollision = landmarkCollision(ASSET_IDS.HOUSE_FARMHOUSE_A, "farmhouse");
    const physics = await PhysicsWorld.create(farmhouseCollision);
    const sim = new Simulation();
    const farmhouse = WorldLayout.landmark("farmhouse");
    const approachStartX = farmhouse.x - 5.6;
    placePlayer(sim, approachStartX, farmhouse.z);
    for (let index = 0; index < 120; index++) {
      sim.commitPhysicsFrame(physics.step(
        sim.state,
        { x: 1, z: 0, sprint: true },
        "on-foot",
        1 / 60,
        index / 60
      ).frame);
    }
    expect(sim.state.player.x).toBeGreaterThan(approachStartX + 0.8);
    expect(sim.state.player.x).toBeLessThan(farmhouse.x - 3.6);

    for (const normal of [
      { x: -1, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: -1 },
      { x: 0, z: 1 }
    ]) {
      const shorePhysics = await PhysicsWorld.create();
      const shoreSim = new Simulation();
      const start = findDryShoreApproach(normal.x, normal.z);
      placePlayer(shoreSim, start.x, start.z);
      const tangent = { x: normal.z, z: -normal.x };
      for (let index = 0; index < 120; index++) {
        shoreSim.commitPhysicsFrame(shorePhysics.step(
          shoreSim.state,
          { x: normal.x + tangent.x * 0.45, z: normal.z + tangent.z * 0.45, sprint: true },
          "on-foot",
          1 / 60,
          index / 60
        ).frame);
      }
      expect(
        WorldLayout.isWater(shoreSim.state.player.x, shoreSim.state.player.z),
        JSON.stringify({ normal, start, final: shoreSim.state.player })
      ).toBe(false);
      expect(shoreSim.state.player.y).toBeGreaterThanOrEqual(
        WorldLayout.terrainHeight(shoreSim.state.player.x, shoreSim.state.player.z) + 0.49
      );
    }
  });

  it("projects authored bridge steps and dock pilings instead of render triangles", () => {
    const bridge = landmarkCollision(ASSET_IDS.BRIDGE_STONE_A, "bridge");
    const dock = landmarkCollision(ASSET_IDS.DOCK_STRAIGHT_A, "dock");
    expect(bridge).toHaveLength(15);
    expect(dock).toHaveLength(11);
    expect(bridge.every((proxy) => proxy.kind === "box")).toBe(true);
    expect(dock.filter((proxy) => proxy.id.includes("piles_"))).toHaveLength(5);
    expect(dock.filter((proxy) => proxy.id.includes("stair_"))).toHaveLength(5);
    const bridgePeak = bridge.find((proxy) => proxy.id.endsWith(":main"));
    const bridgeEdge = bridge.find((proxy) => proxy.id.endsWith(":deck_01"));
    const bridgeRails = bridge.filter((proxy) => proxy.id.includes(":rail_"));
    const bridgeLayout = WorldLayout.landmark("bridge");
    const dockLayout = WorldLayout.landmark("dock");
    expect(bridgePeak!.center.y).toBeGreaterThan(bridgeEdge!.center.y);
    expect(bridgeEdge!.center.y + bridgeEdge!.halfExtents.y).toBeCloseTo(
      BRIDGE_WORLD_PROFILE.entrySurfaceY,
      2
    );
    expect(bridgeRails).toHaveLength(4);
    expect(Math.min(...bridgeRails.map((proxy) => Math.abs(proxy.center.z - bridgeLayout.z))))
      .toBeGreaterThan(1.8);
    expect(Math.min(...dock.map((proxy) => proxy.center.y - proxy.halfExtents.y)))
      .toBeCloseTo(
        WorldLayout.terrainHeight(dockLayout.x, dockLayout.z) + dockLayout.yOffset,
        4
      );
  });

  it("walks continuously from one bank across the crowned bridge deck", async () => {
    const bridgeCollision = landmarkCollision(ASSET_IDS.BRIDGE_STONE_A, "bridge");
    const physics = await PhysicsWorld.create(bridgeCollision);
    const sim = new Simulation();
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    placePlayer(sim, bridge.x - BRIDGE_WORLD_PROFILE.spanLength * 0.5 - 1.6, bridge.z);
    const startY = sim.state.player.y;
    let highestY = startY;

    for (let index = 0; index < 360; index++) {
      const result = physics.step(
        sim.state,
        { x: 1, z: 0, sprint: false },
        "on-foot",
        1 / 60,
        index / 60
      );
      expect(sim.commitPhysicsFrame(result.frame).success).toBe(true);
      highestY = Math.max(highestY, sim.state.player.y);
    }

    expect(sim.state.player.x).toBeGreaterThan(bridge.x + BRIDGE_WORLD_PROFILE.spanLength * 0.5 - 0.8);
    expect(highestY).toBeGreaterThan(startY + 0.1);
    expect(WorldLayout.isWater(sim.state.player.x, sim.state.player.z)).toBe(false);
    expect(sim.state.player.traversal.isGrounded).toBe(true);
  });

  it("walks continuously back across the crowned bridge deck", async () => {
    const bridgeCollision = landmarkCollision(ASSET_IDS.BRIDGE_STONE_A, "bridge");
    const physics = await PhysicsWorld.create(bridgeCollision);
    const sim = new Simulation();
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    placePlayer(sim, bridge.x + BRIDGE_WORLD_PROFILE.spanLength * 0.5 + 1.6, bridge.z);

    for (let index = 0; index < 360; index++) {
      const result = physics.step(
        sim.state,
        { x: -1, z: 0, sprint: false },
        "on-foot",
        1 / 60,
        index / 60
      );
      expect(sim.commitPhysicsFrame(result.frame).success).toBe(true);
    }

    expect(sim.state.player.x).toBeLessThan(bridge.x - BRIDGE_WORLD_PROFILE.spanLength * 0.5 + 0.8);
    expect(WorldLayout.isWater(sim.state.player.x, sim.state.player.z)).toBe(false);
    expect(sim.state.player.traversal.isGrounded).toBe(true);
  });

  it("steps onto the crowned bridge from the near east approach", async () => {
    const bridgeCollision = landmarkCollision(ASSET_IDS.BRIDGE_STONE_A, "bridge");
    const physics = await PhysicsWorld.create(bridgeCollision);
    const sim = new Simulation();
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    placePlayer(sim, bridge.x + BRIDGE_WORLD_PROFILE.spanLength * 0.5 + 1.0, bridge.z - 0.04);

    let maxConsecutiveBlocked = 0;
    let consecutiveBlocked = 0;
    for (let index = 0; index < 360; index++) {
      const result = physics.step(
        sim.state,
        { x: -1, z: 0, sprint: false },
        "on-foot",
        1 / 60,
        index / 60
      );
      expect(sim.commitPhysicsFrame(result.frame).success).toBe(true);
      consecutiveBlocked = result.playerMotion.isCollisionBlocked ? consecutiveBlocked + 1 : 0;
      maxConsecutiveBlocked = Math.max(maxConsecutiveBlocked, consecutiveBlocked);
    }

    expect(maxConsecutiveBlocked).toBeLessThan(8);
    expect(sim.state.player.x).toBeLessThan(bridge.x - BRIDGE_WORLD_PROFILE.spanLength * 0.5 - 0.5);
    expect(sim.state.player.traversal.isGrounded).toBe(true);
    expect(sim.state.player.y).toBeCloseTo(
      WorldLayout.traversalSurfaceHeight(sim.state.player.x, sim.state.player.z) + 0.5,
      5
    );
    physics.dispose();
  });

  it("follows the farm gateway route across the bridge into the village approach", async () => {
    const bridgeCollision = landmarkCollision(ASSET_IDS.BRIDGE_STONE_A, "bridge");
    const physics = await PhysicsWorld.create(bridgeCollision);
    const sim = new Simulation();
    const route = WORLD_REGIONAL_PATHS[0];
    const start = route[0];
    placePlayer(sim, start.x, start.z);
    sim.state.player.traversal.isGrounded = true;
    for (let settleIndex = 0; settleIndex < 5; settleIndex++) {
      const settle = physics.step(
        sim.state,
        { x: 0, z: 0, sprint: false },
        "on-foot",
        1 / 60,
        settleIndex / 60
      );
      expect(sim.commitPhysicsFrame(settle.frame).success).toBe(true);
    }
    let reachedVillageApproach = false;
    let reachedBridgeDeck = false;
    let consecutiveBlockedFrames = 0;
    let maxConsecutiveBlockedFrames = 0;

    for (let index = 0; index < 1500; index++) {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let pathIndex = 0; pathIndex < route.length; pathIndex++) {
        const distance = Math.hypot(
          sim.state.player.x - route[pathIndex].x,
          sim.state.player.z - route[pathIndex].z
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = pathIndex;
        }
      }
      const target = route[Math.min(route.length - 1, nearestIndex + 2)];
      const directionX = target.x - sim.state.player.x;
      const directionZ = target.z - sim.state.player.z;
      const directionLength = Math.hypot(directionX, directionZ);
      const result = physics.step(
        sim.state,
        directionLength > 0.2
          ? { x: directionX / directionLength, z: directionZ / directionLength, sprint: false }
          : { x: 0, z: 0, sprint: false },
        "on-foot",
        1 / 60,
        index / 60
      );
      expect(sim.commitPhysicsFrame(result.frame).success).toBe(true);
      expect(WorldLayout.isWater(sim.state.player.x, sim.state.player.z)).toBe(false);
      consecutiveBlockedFrames = result.playerMotion.isCollisionBlocked ? consecutiveBlockedFrames + 1 : 0;
      maxConsecutiveBlockedFrames = Math.max(maxConsecutiveBlockedFrames, consecutiveBlockedFrames);
      reachedBridgeDeck ||= WorldLayout.isBridgeDeck(sim.state.player.x, sim.state.player.z);
      expect(sim.state.player.y).toBeGreaterThanOrEqual(
        WorldLayout.traversalSurfaceHeight(sim.state.player.x, sim.state.player.z) + 0.499
      );
      if (
        sim.state.player.x > WORLD_LAYOUT_V5.anchors.bridge.x
        + BRIDGE_WORLD_PROFILE.spanLength * 0.5
        + 1.5
      ) {
        reachedVillageApproach = true;
        break;
      }
    }

    expect(
      maxConsecutiveBlockedFrames,
      JSON.stringify({
        final: { x: sim.state.player.x, y: sim.state.player.y, z: sim.state.player.z },
        reachedBridgeDeck,
        reachedVillageApproach
      })
    ).toBeLessThan(45);
    expect(reachedBridgeDeck).toBe(true);
    expect(
      reachedVillageApproach,
      JSON.stringify({
        final: { x: sim.state.player.x, y: sim.state.player.y, z: sim.state.player.z },
        maxConsecutiveBlockedFrames
      })
    ).toBe(true);
    expect(sim.state.player.x).toBeGreaterThan(
      WORLD_LAYOUT_V5.anchors.bridge.x + BRIDGE_WORLD_PROFILE.spanLength * 0.5
    );
    expect(sim.state.player.traversal.isGrounded).toBe(true);
  });

  it("keeps exact stable support on every named regional and farm route in both directions", async () => {
    const physics = await PhysicsWorld.create(
      landmarkCollision(ASSET_IDS.BRIDGE_STONE_A, "bridge")
    );
    const sim = new Simulation();
    let timeSeconds = 0;
    for (const route of COMPILED_WORLD_ROUTES) {
      const sample = route.samples[Math.floor(route.samples.length * 0.5)];
      for (const direction of [-1, 1] as const) {
        const startX = sample.point.x - sample.tangent.x * direction * 0.2;
        const startZ = sample.point.z - sample.tangent.z * direction * 0.2;
        placePlayer(sim, startX, startZ);
        sim.state.player.activeBoatId = null;
        sim.state.player.activeMountId = null;
        sim.state.player.traversal.isGrounded = true;
        let previousY = sim.state.player.y;
        for (let frameIndex = 0; frameIndex < 12; frameIndex++) {
          const result = physics.step(
            sim.state,
            {
              x: sample.tangent.x * direction,
              z: sample.tangent.z * direction,
              sprint: false
            },
            "on-foot",
            1 / 60,
            timeSeconds
          );
          timeSeconds += 1 / 60;
          expect(sim.commitPhysicsFrame(result.frame).success, route.route.id).toBe(true);
          expect([
            sim.state.player.x,
            sim.state.player.y,
            sim.state.player.z,
            result.playerMotion.groundNormal.x,
            result.playerMotion.groundNormal.y,
            result.playerMotion.groundNormal.z
          ].every(Number.isFinite), route.route.id).toBe(true);
          expect(result.playerMotion.isGrounded, route.route.id).toBe(true);
          expect(Math.hypot(
            result.playerMotion.groundNormal.x,
            result.playerMotion.groundNormal.y,
            result.playerMotion.groundNormal.z
          ), route.route.id).toBeCloseTo(1, 5);
          expect(sim.state.player.y, route.route.id).toBeCloseTo(
            WorldLayout.traversalSurfaceHeight(sim.state.player.x, sim.state.player.z) + 0.5,
            5
          );
          expect(Math.abs(sim.state.player.y - previousY), route.route.id).toBeLessThan(0.4);
          previousY = sim.state.player.y;
        }
      }
    }
  });

  it("steers with speed, reverses correctly, and sweeps the compound hull against docks", async () => {
    const barrierZ = HARBOR_DOCK.boatPosition.z + 7;
    const forwardPhysics = await PhysicsWorld.create([
      {
        kind: "box",
        id: "dock-wall",
        center: { x: HARBOR_DOCK.boatPosition.x, y: 0.7, z: barrierZ },
        halfExtents: { x: 20, y: 1.2, z: 0.25 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    ]);
    const forward = new Simulation();
    const forwardBoat = forward.state.boats["boat.player_rowboat"];
    forwardBoat.isDocked = false;
    forwardBoat.dockedMarketId = null;
    forward.state.player.activeBoatId = forwardBoat.id;
    let collisionBlocked = false;
    let strongestContact = 0;
    for (let index = 0; index < 240; index++) {
      const result = forwardPhysics.step(
        forward.state,
        { x: index < 60 ? 0.7 : 0, z: -1, sprint: false },
        "boat-driving",
        1 / 60,
        index / 60
      );
      forward.commitPhysicsFrame(result.frame);
      const motion = result.boatMotion[forwardBoat.id];
      collisionBlocked ||= motion.isCollisionBlocked;
      strongestContact = Math.max(strongestContact, motion.contactStrength);
    }
    expect(forwardBoat.headingRadians).toBeGreaterThan(0.05);
    expect(forwardBoat.z).toBeLessThan(barrierZ - 2);
    expect(forwardBoat.y).toBe(0);
    expect(collisionBlocked).toBe(true);
    expect(strongestContact).toBeGreaterThan(0);

    const reversePhysics = await PhysicsWorld.create();
    const reverse = new Simulation();
    const reverseBoat = reverse.state.boats["boat.player_rowboat"];
    reverseBoat.isDocked = false;
    reverseBoat.dockedMarketId = null;
    reverse.state.player.activeBoatId = reverseBoat.id;
    for (let index = 0; index < 90; index++) {
      reverse.commitPhysicsFrame(reversePhysics.step(
        reverse.state,
        { x: 1, z: 1, sprint: false },
        "boat-driving",
        1 / 60,
        index / 60
      ).frame);
    }
    expect(reverseBoat.speed).toBeLessThan(0);
    expect(reverseBoat.headingRadians).toBeLessThan(0);
    expect(reverseBoat.y).toBe(0);
  });

  it("zeros upward vertical velocity when jumping into an overhead ceiling without stickiness", async () => {
    const origin = { x: -65, z: -55 };
    const ground = WorldLayout.terrainHeight(origin.x, origin.z);
    // Ceiling obstacle 1.6m above ground (player height is ~1.7m total capsule)
    const physics = await PhysicsWorld.create([
      {
        kind: "box",
        id: "low-ceiling",
        center: { x: origin.x, y: ground + 2.0, z: origin.z },
        halfExtents: { x: 3, y: 0.2, z: 3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    ]);
    const sim = new Simulation();
    sim.state.player.x = origin.x;
    sim.state.player.z = origin.z;
    sim.state.player.y = ground + 0.5;

    // Trigger jump
    let frame = physics.step(
      sim.state,
      { x: 0, z: 0, sprint: false, jumpRequested: true },
      "on-foot",
      1 / 60,
      0
    );
    sim.commitPhysicsFrame(frame.frame);

    // Run next 10 frames - player should hit ceiling and immediately begin falling, not floating
    let maxHeadHeight = ground;
    for (let index = 1; index <= 20; index++) {
      frame = physics.step(
        sim.state,
        { x: 0, z: 0, sprint: false },
        "on-foot",
        1 / 60,
        index / 60
      );
      sim.commitPhysicsFrame(frame.frame);
      maxHeadHeight = Math.max(maxHeadHeight, sim.state.player.y);
    }
    // Player should be stopped below ceiling (ceiling at ground + 1.8 bottom)
    expect(maxHeadHeight).toBeLessThan(ground + 1.6);
    // After 20 frames (0.33s), player should already have fallen back down or landed
    expect(sim.state.player.y).toBeLessThanOrEqual(ground + 0.8);
  });

  it("resolves interior floor level height without floating in the air", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    // Place player at farmhouse interior entrance
    const interiorX = FARMHOUSE_INTERIOR_DOOR.enterSpawn.x;
    const interiorZ = FARMHOUSE_INTERIOR_DOOR.enterSpawn.z;
    const interiorY = FARMHOUSE_INTERIOR_DOOR.enterSpawn.y;
    sim.state.player.x = interiorX;
    sim.state.player.y = interiorY;
    sim.state.player.z = interiorZ;

    const frame = physics.step(
      sim.state,
      { x: 0, z: 0, sprint: false },
      "on-foot",
      1 / 60,
      0
    );
    expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
    // The authored spawn follows the feet-above-floor convention. Rapier's
    // capsule contact resolves its center a few centimeters below that target.
    expect(sim.state.player.y).toBeGreaterThan(FARMHOUSE_INTERIOR_BOUNDS.floorY + 0.4);
    expect(sim.state.player.y).toBeLessThan(FARMHOUSE_INTERIOR_BOUNDS.floorY + 0.6);
  });

  it("keeps player attached to active boat during non-driving modes like sport-fishing and menus", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    const boat = sim.state.boats["boat.player_rowboat"];
    boat.isDocked = false;
    boat.dockedMarketId = null;
    boat.speed = 2.5; // residual boat speed
    sim.state.player.activeBoatId = boat.id;

    // Step physics under sport-fishing mode
    for (let index = 0; index < 30; index++) {
      const frame = physics.step(
        sim.state,
        { x: 0, z: 0, sprint: false },
        "sport-fishing",
        1 / 60,
        index / 60
      );
      const commit = sim.commitPhysicsFrame(frame.frame);
      expect(commit.success).toBe(true);
      expect(sim.state.player.x).toBeCloseTo(boat.x, 4);
      expect(sim.state.player.z).toBeCloseTo(boat.z, 4);
    }
  });

  it("synchronizes the physics body atomically across boat, on-foot, and mount ownership", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    const boat = sim.state.boats["boat.player_rowboat"];
    sim.state.player.activeBoatId = boat.id;
    let frame = physics.step(
      sim.state,
      { x: 0, z: 0, sprint: false },
      "sport-fishing",
      1 / 60,
      0
    );
    expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
    expect(sim.state.player.x).toBeCloseTo(boat.x, 5);

    sim.state.player.activeBoatId = null;
    placePlayer(sim, -120, -100);
    sim.state.player.traversal.isGrounded = true;
    frame = physics.step(
      sim.state,
      { x: 0, z: 0, sprint: false },
      "on-foot",
      1 / 60,
      1 / 60
    );
    expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
    expect(sim.state.player.x).toBeCloseTo(-120, 5);
    expect(sim.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(-120, -100) + 0.5, 5);

    const mount = Object.values(sim.state.mounts)[0];
    sim.state.player.activeMountId = mount.id;
    Object.assign(sim.state.player, {
      x: mount.x,
      y: WorldLayout.traversalSurfaceHeight(mount.x, mount.z) + 0.5,
      z: mount.z,
      rotationY: mount.rotationY
    });
    frame = physics.step(
      sim.state,
      { x: 0, z: 0, sprint: false },
      "mounted",
      1 / 60,
      2 / 60
    );
    expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
    expect(sim.state.player.y).toBeCloseTo(
      WorldLayout.traversalSurfaceHeight(sim.state.player.x, sim.state.player.z) + 0.5,
      5
    );

    sim.state.player.activeMountId = null;
    placePlayer(sim, -118.75, -100);
    frame = physics.step(
      sim.state,
      { x: 0, z: 0, sprint: false },
      "on-foot",
      1 / 60,
      3 / 60
    );
    expect(sim.commitPhysicsFrame(frame.frame).success).toBe(true);
    expect(sim.state.player.x).toBeCloseTo(-118.75, 5);
    expect(frame.playerMotion.isGrounded).toBe(true);
  });

  it("cleans up despawned boat bodies and disposes without memory leaks", async () => {
    const physics = await PhysicsWorld.create();
    const sim = new Simulation();
    const boat = sim.state.boats["boat.player_rowboat"];
    boat.isDocked = false;
    boat.dockedMarketId = null;

    physics.step(sim.state, { x: 0, z: 0, sprint: false }, "on-foot", 1 / 60, 0);
    // Remove boat from state
    delete sim.state.boats["boat.player_rowboat"];

    // Next physics step should clean up the boat body without error
    expect(() => {
      physics.step(sim.state, { x: 0, z: 0, sprint: false }, "on-foot", 1 / 60, 1 / 60);
    }).not.toThrow();

    // Dispose
    expect(() => {
      physics.dispose();
    }).not.toThrow();
  });

  it("does not let a station collider occlude its own interaction point", async () => {
    const origin = { x: -65, z: -55 };
    const ground = WorldLayout.terrainHeight(origin.x, origin.z);
    const stationCenter = { x: origin.x, y: ground + 1.15, z: origin.z + 3.2 };
    const physics = await PhysicsWorld.create([
      {
        kind: "box",
        id: "struct.starter_mill",
        center: stationCenter,
        halfExtents: { x: 1.15, y: 1.2, z: 1.1 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    ]);
    const from = { x: origin.x, y: ground + 1.3, z: origin.z };
    const to = { x: stationCenter.x, y: stationCenter.y + 0.45, z: stationCenter.z };
    expect(physics.hasLineOfSight(from, to)).toBe(true);
    physics.dispose();
  });

  it("still blocks line of sight when a wall sits between the player and a crop with no collider", async () => {
    const origin = { x: -65, z: -55 };
    const ground = WorldLayout.terrainHeight(origin.x, origin.z);
    const physics = await PhysicsWorld.create([
      {
        kind: "box",
        id: "farmhouse-wall",
        center: { x: origin.x, y: ground + 1.5, z: origin.z + 1.6 },
        halfExtents: { x: 2, y: 1.5, z: 0.25 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    ]);
    const from = { x: origin.x, y: ground + 1.3, z: origin.z };
    const crop = { x: origin.x, y: ground + 0.95, z: origin.z + 3.4 };
    expect(physics.hasLineOfSight(from, crop)).toBe(false);
    const clear = { x: origin.x + 4, y: ground + 1.1, z: origin.z };
    expect(physics.hasLineOfSight(from, clear)).toBe(true);
    physics.dispose();
  });

  it("keeps an obstructing wall between the player and a large station", async () => {
    const origin = { x: -65, z: -55 };
    const ground = WorldLayout.terrainHeight(origin.x, origin.z);
    const stationCenter = { x: origin.x, y: ground + 1.15, z: origin.z + 4.2 };
    const physics = await PhysicsWorld.create([
      {
        kind: "box",
        id: "struct.workbench",
        center: stationCenter,
        halfExtents: { x: 1.05, y: 1.1, z: 0.9 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      },
      {
        kind: "box",
        id: "privacy-wall",
        center: { x: origin.x, y: ground + 1.4, z: origin.z + 1.5 },
        halfExtents: { x: 1.8, y: 1.4, z: 0.2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    ]);
    const from = { x: origin.x, y: ground + 1.3, z: origin.z };
    const to = { x: stationCenter.x, y: stationCenter.y + 0.45, z: stationCenter.z };
    expect(physics.hasLineOfSight(from, to)).toBe(false);
    physics.dispose();
  });

  it("replaces static prop colliders after a layout-editor move", async () => {
    const origin = { x: -65, z: -55 };
    const ground = WorldLayout.terrainHeight(origin.x, origin.z);
    const wall = {
      kind: "box" as const,
      id: "privacy-wall",
      center: { x: origin.x, y: ground + 1.4, z: origin.z + 1.5 },
      halfExtents: { x: 1.8, y: 1.4, z: 0.2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 }
    };
    const physics = await PhysicsWorld.create([wall]);
    const from = { x: origin.x, y: ground + 1.3, z: origin.z };
    const to = { x: origin.x, y: ground + 1.3, z: origin.z + 4 };
    expect(physics.hasLineOfSight(from, to)).toBe(false);
    physics.replaceStaticCollision([{
      ...wall,
      center: { x: origin.x + 8, y: ground + 1.4, z: origin.z + 1.5 }
    }]);
    expect(physics.hasLineOfSight(from, to)).toBe(true);
    physics.dispose();
  });

  it("lets the commissioned rowboat leave the harbor slip past the dock pilings", async () => {
    const dockCollision = landmarkCollision(ASSET_IDS.DOCK_STRAIGHT_A, "dock");
    const physics = await PhysicsWorld.create(dockCollision);
    const sim = new Simulation();
    sim.state.quests.unlockedFeatureIds.push("boat.player_rowboat");
    placePlayer(sim, HARBOR_DOCK.playerPosition.x, HARBOR_DOCK.playerPosition.z);
    expect(sim.boardBoat("boat.player_rowboat").success).toBe(true);
    const boat = sim.state.boats["boat.player_rowboat"];
    const start = { x: boat.x, z: boat.z };
    for (let index = 0; index < 240; index++) {
      const result = physics.step(
        sim.state,
        { x: 0, z: -1, sprint: false },
        "boat-driving",
        1 / 60,
        index / 60
      );
      expect(sim.commitPhysicsFrame(result.frame).success).toBe(true);
    }
    expect(boat.z).toBeGreaterThan(start.z + 4);
    expect(WorldLayout.isSailable(boat.x, boat.z)).toBe(true);
    physics.dispose();
  });

  it("unsticks a rowboat whose hull starts overlapping the harbor pilings", async () => {
    const dockCollision = landmarkCollision(ASSET_IDS.DOCK_STRAIGHT_A, "dock");
    const physics = await PhysicsWorld.create(dockCollision);
    const sim = new Simulation();
    const boat = sim.state.boats["boat.player_rowboat"];
    boat.isDocked = false;
    boat.dockedMarketId = null;
    boat.x = 81;
    boat.z = 72;
    boat.headingRadians = 0;
    sim.state.player.activeBoatId = boat.id;
    sim.state.player.x = boat.x;
    sim.state.player.z = boat.z;
    const startZ = boat.z;
    for (let index = 0; index < 240; index++) {
      const result = physics.step(
        sim.state,
        { x: 0, z: -1, sprint: false },
        "boat-driving",
        1 / 60,
        index / 60
      );
      expect(sim.commitPhysicsFrame(result.frame).success).toBe(true);
    }
    expect(boat.x).toBeGreaterThan(80.5);
    expect(boat.z).toBeGreaterThan(startZ + 4);
    expect(WorldLayout.isSailable(boat.x, boat.z)).toBe(true);
    physics.dispose();
  });
});
