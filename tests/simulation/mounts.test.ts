import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { Simulation } from "../../src/simulation/Simulation";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import {
  isValidPlayerMountGround,
  mountDismountPoseCandidates,
  MOUNT_TUNING,
  playerPoseFromMount,
  STARTER_DONKEY_ID
} from "../../src/simulation/mounts/Mounts";
import { BRIDGE_WORLD_PROFILE, WORLD_LAYOUT_V5, WorldLayout } from "../../src/world/WorldLayout";

function placePlayerAtMount(simulation: Simulation, mountId = STARTER_DONKEY_ID): void {
  const mount = simulation.state.mounts[mountId];
  if (!mount) throw new Error(`Missing mount ${mountId}`);
  Object.assign(simulation.state.player, playerPoseFromMount(mount), {
    activeBoatId: null,
    activeMountId: null,
    carriedFishCargoId: null,
    traversal: { ...simulation.state.player.traversal, isGrounded: true }
  });
}

function setMountedPose(simulation: Simulation, x: number, z: number, rotationY = 0): void {
  const mount = simulation.state.mounts[STARTER_DONKEY_ID];
  if (!mount) throw new Error("Missing starter donkey");
  const y = WorldLayout.traversalSurfaceHeight(x, z);
  Object.assign(mount, { x, y, z, rotationY });
  Object.assign(simulation.state.player, {
    x,
    y: y + 0.5,
    z,
    rotationY,
    activeBoatId: null,
    activeMountId: STARTER_DONKEY_ID,
    carriedFishCargoId: null,
    traversal: { ...simulation.state.player.traversal, isGrounded: true }
  });
}

afterEach(() => vi.restoreAllMocks());

describe("starter donkey mount", () => {
  it("initializes one persistent starter donkey in every fresh save", () => {
    const state = createInitialGameState(42891);
    expect(Object.keys(state.mounts)).toEqual([STARTER_DONKEY_ID]);
    expect(state.mounts[STARTER_DONKEY_ID]).toMatchObject({
      id: STARTER_DONKEY_ID,
      mountTypeId: "mount.donkey",
      x: -57,
      z: -65.4
    });
    expect(state.player.activeMountId).toBeNull();
    expect(validateSaveEnvelope({ schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state })).toBe(true);
  });

  it("migrates v17 saves to v18 without replacing existing player or world data", () => {
    const legacy = createInitialGameState(42891);
    legacy.schemaVersion = 17;
    legacy.player.money = 731;
    const preservedPosition = { x: legacy.player.x, y: legacy.player.y, z: legacy.player.z };
    delete (legacy as Partial<typeof legacy>).mounts;
    delete (legacy.player as Partial<typeof legacy.player>).activeMountId;

    const migrated = migrateSaveData({ schemaVersion: 17, savedAtUtcMs: 1, state: legacy });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.player.money).toBe(731);
    // Migration re-grounds land truth, so Y is resolved from terrain rather
    // than copied. X and Z are the claim here — that the player was not moved
    // back to spawn — and Y only has to land on the same ground.
    expect(migrated.state.player.x).toBe(preservedPosition.x);
    expect(migrated.state.player.z).toBe(preservedPosition.z);
    expect(migrated.state.player.y).toBeCloseTo(preservedPosition.y, 3);
    expect(migrated.state.player.activeMountId).toBeNull();
    expect(migrated.state.mounts[STARTER_DONKEY_ID]).toBeDefined();
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("round-trips a mounted pose while keeping the active mount as the only mounted authority", () => {
    const simulation = new Simulation();
    placePlayerAtMount(simulation);
    expect(simulation.execute({ type: "mount.board", mountId: STARTER_DONKEY_ID }).success).toBe(true);
    const envelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: structuredClone(simulation.state)
    };
    expect(envelope.state.player.activeMountId).toBe(STARTER_DONKEY_ID);
    expect(validateSaveEnvelope(envelope)).toBe(true);

    const restored = new Simulation(structuredClone(envelope.state));
    expect(restored.state.player.activeMountId).toBe(STARTER_DONKEY_ID);
    expect(restored.state.mounts[STARTER_DONKEY_ID]).toEqual(envelope.state.mounts[STARTER_DONKEY_ID]);
  });

  it("boards and dismounts atomically and rejects invalid preconditions", () => {
    const simulation = new Simulation();
    const before = structuredClone(simulation.state);
    expect(simulation.execute({ type: "mount.board", mountId: STARTER_DONKEY_ID })).toMatchObject({
      success: false,
      reason: "Move closer to the donkey"
    });
    expect(simulation.state.player.activeMountId).toBe(before.player.activeMountId);
    expect(simulation.state.mounts).toEqual(before.mounts);

    placePlayerAtMount(simulation);
    simulation.state.player.traversal.isGrounded = false;
    expect(simulation.canBoardMount()).toBe(false);
    expect(simulation.boardMount().reason).toBe("Land before mounting");
    simulation.state.player.traversal.isGrounded = true;
    simulation.state.player.activeBoatId = "boat.player_rowboat";
    expect(simulation.canBoardMount()).toBe(false);
    expect(simulation.execute({ type: "mount.board", mountId: STARTER_DONKEY_ID }).success).toBe(false);
    simulation.state.player.activeBoatId = null;

    expect(simulation.execute({ type: "mount.board", mountId: STARTER_DONKEY_ID }).success).toBe(true);
    expect(simulation.state.player.activeMountId).toBe(STARTER_DONKEY_ID);
    expect(simulation.canBoardBoat("boat.player_rowboat")).toBe(false);
    expect(simulation.boardBoat("boat.player_rowboat").success).toBe(false);
    expect(simulation.resetPlayerToSafeSpawn()).toMatchObject({
      success: false,
      reason: "Dismount first before using Safe Return"
    });

    const mountedPlayer = { ...simulation.state.player };
    const [leftDismount] = mountDismountPoseCandidates(mountedPlayer);
    expect(isValidPlayerMountGround(leftDismount)).toBe(true);
    expect(simulation.execute({ type: "mount.dismount" }).success).toBe(true);
    expect(simulation.state.player.activeMountId).toBeNull();
    expect(simulation.state.player).toMatchObject(leftDismount);
    expect(Math.hypot(
      simulation.state.player.x - simulation.state.mounts[STARTER_DONKEY_ID]!.x,
      simulation.state.player.z - simulation.state.mounts[STARTER_DONKEY_ID]!.z
    )).toBeCloseTo(MOUNT_TUNING.dismountClearanceMeters, 8);
    expect(simulation.state.mounts[STARTER_DONKEY_ID]).toMatchObject({
      x: mountedPlayer.x,
      z: mountedPlayer.z,
      rotationY: mountedPlayer.rotationY
    });
    expect(simulation.execute({ type: "mount.dismount" })).toMatchObject({
      success: false,
      reason: "You are not riding the donkey"
    });
  });

  it("falls back to the right side when the left dismount position is unsafe", () => {
    const simulation = new Simulation();
    setMountedPose(simulation, -32, -100, Math.PI);
    const [left, right] = mountDismountPoseCandidates(simulation.state.player);
    expect(isValidPlayerMountGround(left)).toBe(false);
    expect(isValidPlayerMountGround(right)).toBe(true);

    expect(simulation.dismountMount().success).toBe(true);
    expect(simulation.state.player).toMatchObject(right);
    expect(simulation.state.mounts[STARTER_DONKEY_ID]).toMatchObject({
      x: -32,
      z: -100,
      rotationY: Math.PI
    });
  });

  it("rejects a dismount atomically when neither lateral side is safe", () => {
    const simulation = new Simulation();
    placePlayerAtMount(simulation);
    expect(simulation.boardMount().success).toBe(true);
    expect(simulation.canDismountMount()).toBe(true);
    const [left, right] = mountDismountPoseCandidates(simulation.state.player);
    const isWalkable = WorldLayout.isWalkable.bind(WorldLayout);
    const blockedSides = vi.spyOn(WorldLayout, "isWalkable").mockImplementation((x, z) => {
      if ([left, right].some((pose) => Math.hypot(pose.x - x, pose.z - z) < 0.000001)) return false;
      return isWalkable(x, z);
    });
    expect(isValidPlayerMountGround(simulation.state.player)).toBe(true);
    expect(isValidPlayerMountGround(left)).toBe(false);
    expect(isValidPlayerMountGround(right)).toBe(false);
    const before = structuredClone(simulation.state);
    const disembarked = vi.fn();
    simulation.events.on("MountDisembarked", disembarked);

    expect(simulation.canDismountMount()).toBe(false);
    expect(simulation.execute({ type: "mount.dismount" })).toMatchObject({
      success: false,
      reason: "There is no safe ground to dismount here"
    });
    expect(simulation.state).toEqual(before);
    expect(disembarked).not.toHaveBeenCalled();
    blockedSides.mockRestore();
    expect(simulation.canDismountMount()).toBe(true);
    expect(simulation.execute({ type: "mount.dismount" }).success).toBe(true);
    expect(disembarked).toHaveBeenCalledTimes(1);
  });

  it("rejects a mounted water pose and an unsafe dismount", () => {
    const simulation = new Simulation();
    placePlayerAtMount(simulation);
    expect(simulation.boardMount().success).toBe(true);
    const mount = simulation.state.mounts[STARTER_DONKEY_ID]!;
    const waterPoint = (() => {
      for (let z = -20; z <= 30; z += 0.25) {
        for (let x = -35; x <= 35; x += 0.25) {
          if (WorldLayout.isWater(x, z)) return { x, z };
        }
      }
      throw new Error("No water point found");
    })();
    expect(simulation.setDebugPlayerPose({
      x: waterPoint.x,
      y: WorldLayout.terrainHeight(waterPoint.x, waterPoint.z) + 0.5,
      z: waterPoint.z,
      rotationY: 0
    })).toBe(false);
    Object.assign(mount, { x: waterPoint.x, y: 0.5, z: waterPoint.z });
    expect(simulation.canDismountMount()).toBe(false);
    expect(simulation.dismountMount().success).toBe(false);
  });

  it("moves deterministically on a mounted route without jumping or changing sprint stamina", async () => {
    const physics = await PhysicsWorld.create();
    const simulation = new Simulation();
    placePlayerAtMount(simulation);
    expect(simulation.boardMount().success).toBe(true);
    const staminaBefore = simulation.state.player.traversal.sprintStamina;
    const first = physics.step(
      simulation.state,
      { x: 0, z: 0, sprint: true, jumpRequested: true },
      "mounted",
      1 / 60,
      0
    );
    expect(first.playerMotion.requestedGait).toBe("idle");
    expect(first.playerMotion.airbornePhase).toBe("grounded");
    expect(first.playerMotion.contactEvent).toBe("none");
    expect(simulation.commitPhysicsFrame(first.frame).success).toBe(true);
    expect(simulation.state.player.traversal.sprintStamina).toBe(staminaBefore);
    expect(simulation.state.player.traversal.isGrounded).toBe(true);

    const start = { x: simulation.state.player.x, z: simulation.state.player.z };
    for (let index = 1; index <= 30; index++) {
      const frame = physics.step(
        simulation.state,
        { x: 0, z: 1, sprint: true },
        "mounted",
        1 / 60,
        index / 60
      );
      // Sprinting on a mount is a gallop, spent from the mount's own gallop
      // stamina. The claim this test guards is that the rider's sprint
      // stamina is untouched, asserted after the loop.
      expect(frame.playerMotion.requestedGait).toBe("gallop");
      expect(frame.playerMotion.airbornePhase).toBe("grounded");
      const commit = simulation.commitPhysicsFrame(frame.frame);
      expect(commit.success, JSON.stringify({
        reason: commit.reason,
        position: frame.frame.player,
        mount: simulation.state.mounts[STARTER_DONKEY_ID]
      })).toBe(true);
      expect(simulation.state.player.y).toBeCloseTo(
        WorldLayout.traversalSurfaceHeight(simulation.state.player.x, simulation.state.player.z) + 0.5,
        5
      );
      expect(WorldLayout.isWater(simulation.state.player.x, simulation.state.player.z)).toBe(false);
    }
    expect(Math.hypot(simulation.state.player.x - start.x, simulation.state.player.z - start.z)).toBeGreaterThan(0.2);
    expect(simulation.state.mounts[STARTER_DONKEY_ID]).toMatchObject({
      x: simulation.state.player.x,
      z: simulation.state.player.z
    });
    expect(simulation.state.player.traversal.sprintStamina).toBe(staminaBefore);
  });

  it("accepts a bridge deck as a dry mounted traversal surface", async () => {
    const layout = WorldLayout.landmark("bridge");
    const bridgeRoot = new THREE.Object3D();
    bridgeRoot.position.set(
      layout.x,
      WorldLayout.terrainHeight(layout.x, layout.z) + layout.yOffset,
      layout.z
    );
    bridgeRoot.rotation.y = layout.rotationY;
    bridgeRoot.scale.setScalar(layout.scale);
    const bridgeCollision = projectAssetCollision(ASSET_IDS.BRIDGE_STONE_A, bridgeRoot, "bridge");
    const physics = await PhysicsWorld.create(bridgeCollision);
    const simulation = new Simulation();
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    const startX = bridge.x - BRIDGE_WORLD_PROFILE.spanLength * 0.5 - 1.2;
    setMountedPose(simulation, startX, bridge.z);
    expect(simulation.canDismountMount()).toBe(true);

    let reachedDeck = false;
    for (let index = 0; index < 180; index++) {
      const frame = physics.step(
        simulation.state,
        { x: 1, z: 0, sprint: false },
        "mounted",
        1 / 60,
        index / 60
      );
      const commit = simulation.commitPhysicsFrame(frame.frame);
      expect(commit.success, JSON.stringify({
        reason: commit.reason,
        position: frame.frame.player,
        mount: simulation.state.mounts[STARTER_DONKEY_ID]
      })).toBe(true);
      reachedDeck ||= WorldLayout.isBridgeDeck(simulation.state.player.x, simulation.state.player.z);
      expect(WorldLayout.isWater(simulation.state.player.x, simulation.state.player.z)).toBe(false);
    }
    expect(reachedDeck).toBe(true);
    expect(simulation.state.player.traversal.isGrounded).toBe(true);
  });

  it("climbs the next bridge box before the donkey capsule catches its vertical edge", async () => {
    const layout = WorldLayout.landmark("bridge");
    const bridgeRoot = new THREE.Object3D();
    bridgeRoot.position.set(
      layout.x,
      WorldLayout.terrainHeight(layout.x, layout.z) + layout.yOffset,
      layout.z
    );
    bridgeRoot.rotation.y = layout.rotationY;
    bridgeRoot.scale.setScalar(layout.scale);
    const physics = await PhysicsWorld.create(
      projectAssetCollision(ASSET_IDS.BRIDGE_STONE_A, bridgeRoot, "bridge")
    );
    const simulation = new Simulation();
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    const startX = bridge.x - 6.12;
    setMountedPose(simulation, startX, bridge.z, Math.PI / 2);
    const start = simulation.state.player.x;

    // 30 frames is half a second, which the mount spends accelerating from a
    // standstill — it covers ~0.54 m and never reaches the bridge at all, so
    // "moved more than a metre" stopped being evidence of anything once the
    // gallop ramp changed. Run the approach out and assert what the test is
    // named for: the capsule climbs onto the deck instead of catching its
    // vertical edge, staying grounded and out of the water the whole way.
    let reachedDeck = false;
    for (let index = 0; index < 240; index++) {
      const frame = physics.step(
        simulation.state,
        { x: 1, z: 0, sprint: true },
        "mounted",
        1 / 60,
        index / 60
      );
      expect(simulation.commitPhysicsFrame(frame.frame).success).toBe(true);
      expect(frame.playerMotion.isCollisionBlocked).toBe(false);
      expect(WorldLayout.isWater(simulation.state.player.x, simulation.state.player.z)).toBe(false);
      expect(simulation.state.player.traversal.isGrounded).toBe(true);
      if (WorldLayout.isBridgeDeck(simulation.state.player.x, simulation.state.player.z)) reachedDeck = true;
    }

    expect(reachedDeck).toBe(true);
    expect(simulation.state.player.x).toBeGreaterThan(start + 1);
    physics.dispose();
  });

  it("keeps the mounted collider on the bridge when crossing at playable lane offsets", async () => {
    const layout = WorldLayout.landmark("bridge");
    const bridgeRoot = new THREE.Object3D();
    bridgeRoot.position.set(
      layout.x,
      WorldLayout.terrainHeight(layout.x, layout.z) + layout.yOffset,
      layout.z
    );
    bridgeRoot.rotation.y = layout.rotationY;
    bridgeRoot.scale.setScalar(layout.scale);
    const bridgeCollision = projectAssetCollision(ASSET_IDS.BRIDGE_STONE_A, bridgeRoot, "bridge");
    for (const laneOffset of [-1.15, 0, 1.15]) {
      const physics = await PhysicsWorld.create(bridgeCollision);
      const simulation = new Simulation();
      const bridge = WORLD_LAYOUT_V5.anchors.bridge;
      setMountedPose(
        simulation,
        bridge.x - BRIDGE_WORLD_PROFILE.spanLength * 0.5 - 8.0,
        bridge.z + laneOffset,
        Math.PI / 2
      );
      let farthestX = simulation.state.player.x;
      for (let index = 0; index < 420; index++) {
        const frame = physics.step(
          simulation.state,
          { x: 1, z: 0, sprint: true },
          "mounted",
          1 / 60,
          index / 60
        );
        const commit = simulation.commitPhysicsFrame(frame.frame);
        expect(commit.success, JSON.stringify({ laneOffset, index, frame: frame.frame.player })).toBe(true);
        farthestX = Math.max(farthestX, simulation.state.player.x);
        expect(WorldLayout.isWater(simulation.state.player.x, simulation.state.player.z)).toBe(false);
        expect(simulation.state.player.traversal.isGrounded).toBe(true);
      }
      expect(farthestX, JSON.stringify({ laneOffset, farthestX })).toBeGreaterThan(
        bridge.x + BRIDGE_WORLD_PROFILE.spanLength * 0.5
      );
      physics.dispose();
    }
  });
});
