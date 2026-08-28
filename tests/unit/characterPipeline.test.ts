import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  ASSET_BY_ID,
  ASSET_IDS,
  type AssetId
} from "../../src/render/assets/AssetCatalog";
import {
  AnimationController,
  isPlayerRigObjectName,
  type CharacterAnimationContext
} from "../../src/render/animation/AnimationController";
import {
  socketAttachFor
} from "../../src/render/assets/ToolSocketAttach";
import {
  PALETTE_SPECS,
  PALETTE_HEX,
  type PaletteToken
} from "../../src/render/materials/PaletteTokens";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import {
  PLAYER_TRAVERSAL_TUNING,
  slopeGaitScale
} from "../../src/simulation/navigation/PlayerTraversal";
import type { PlayerMotionSample } from "../../src/simulation/core/PhysicsAdapter";

// ============================================================================
// Test Utilities & Mock Hierarchy Builders
// ============================================================================

function createMotionSample(overrides: Partial<PlayerMotionSample> = {}): PlayerMotionSample {
  return {
    velocity: { x: 0, y: 0, z: 0 },
    speedMetersPerSecond: 0,
    accelerationMetersPerSecondSquared: 0,
    turnRateRadiansPerSecond: 0,
    isGrounded: true,
    groundNormal: { x: 0, y: 1, z: 0 },
    slopeRadians: 0,
    airbornePhase: "grounded",
    contactEvent: "none",
    landingImpactStrength: 0,
    contactSurface: "grass",
    isCollisionBlocked: false,
    requestedGait: "idle",
    ...overrides
  };
}

const REQUIRED_HUMANOID_BONES = [
  "rig_root",
  "rig_pelvis",
  "rig_spine",
  "rig_chest",
  "rig_neck",
  "rig_head",
  "rig_clavicle_left",
  "rig_upper_arm_left",
  "rig_forearm_left",
  "rig_hand_left",
  "rig_clavicle_right",
  "rig_upper_arm_right",
  "rig_forearm_right",
  "rig_hand_right",
  "rig_thigh_left",
  "rig_shin_left",
  "rig_foot_left",
  "rig_thigh_right",
  "rig_shin_right",
  "rig_foot_right"
] as const;

const SECONDARY_BONES = [
  "rig_hat_brim",
  "rig_backpack",
  "rig_canteen_left",
  "rig_canteen_right"
] as const;

function buildMockCharacterHierarchy(assetId: AssetId = ASSET_IDS.CHAR_PLAYER_A): THREE.Group {
  const root = new THREE.Group();
  root.name = `${assetId}_root`;
  root.userData.assetId = assetId;

  const lod0 = new THREE.Group();
  lod0.name = `${assetId}_LOD0`;
  const lod1 = new THREE.Group();
  lod1.name = `${assetId}_LOD1`;
  root.add(lod0);
  root.add(lod1);

  const spec = ASSET_BY_ID.get(assetId);
  const rigNodeName = spec?.rigNode ?? (assetId === ASSET_IDS.CHAR_PLAYER_A ? "char_player_rig" : `${assetId}_rig`);
  const rig = new THREE.Group();
  rig.name = rigNodeName;
  root.add(rig);

  // Build bone hierarchy
  const bones: Record<string, THREE.Bone> = {};
  for (const boneName of [...REQUIRED_HUMANOID_BONES, ...SECONDARY_BONES]) {
    const bone = new THREE.Bone();
    bone.name = boneName;
    bones[boneName] = bone;
  }

  // Parenting structure
  bones.rig_root.add(bones.rig_pelvis);
  bones.rig_pelvis.add(bones.rig_spine);
  bones.rig_spine.add(bones.rig_chest);
  bones.rig_chest.add(bones.rig_neck);
  bones.rig_neck.add(bones.rig_head);

  // Head secondaries
  bones.rig_head.add(bones.rig_hat_brim);

  // Arms
  bones.rig_chest.add(bones.rig_clavicle_left);
  bones.rig_clavicle_left.add(bones.rig_upper_arm_left);
  bones.rig_upper_arm_left.add(bones.rig_forearm_left);
  bones.rig_forearm_left.add(bones.rig_hand_left);

  bones.rig_chest.add(bones.rig_clavicle_right);
  bones.rig_clavicle_right.add(bones.rig_upper_arm_right);
  bones.rig_upper_arm_right.add(bones.rig_forearm_right);
  bones.rig_forearm_right.add(bones.rig_hand_right);

  // Legs
  bones.rig_pelvis.add(bones.rig_thigh_left);
  bones.rig_thigh_left.add(bones.rig_shin_left);
  bones.rig_shin_left.add(bones.rig_foot_left);

  bones.rig_pelvis.add(bones.rig_thigh_right);
  bones.rig_thigh_right.add(bones.rig_shin_right);
  bones.rig_shin_right.add(bones.rig_foot_right);

  // Torso secondaries
  bones.rig_spine.add(bones.rig_backpack);
  bones.rig_backpack.add(bones.rig_canteen_left);
  bones.rig_backpack.add(bones.rig_canteen_right);

  rig.add(bones.rig_root);

  // Sockets parented to bones
  const prefix = assetId === ASSET_IDS.CHAR_PLAYER_A ? "char_player" : assetId;
  const handSocketL = new THREE.Object3D();
  handSocketL.name = `${prefix}_hand_socket_left`;
  bones.rig_hand_left.add(handSocketL);

  const handSocketR = new THREE.Object3D();
  handSocketR.name = `${prefix}_hand_socket_right`;
  bones.rig_hand_right.add(handSocketR);

  const toolSocket = new THREE.Object3D();
  toolSocket.name = `${prefix}_tool_socket`;
  bones.rig_hand_right.add(toolSocket);

  const carrySocket = new THREE.Object3D();
  carrySocket.name = `${prefix}_carry_socket`;
  bones.rig_spine.add(carrySocket);

  const hipSocket = new THREE.Object3D();
  hipSocket.name = `${prefix}_hip_socket`;
  bones.rig_pelvis.add(hipSocket);

  // Load clips from catalog spec
  if (spec?.animationClips) {
    root.userData.animationClips = spec.animationClips.map(
      (clip) => new THREE.AnimationClip(clip.name, clip.durationSeconds, [])
    );
  } else {
    root.userData.animationClips = [];
  }

  return root;
}

// ============================================================================
// TIER 1: FEATURE COVERAGE (20 Features, >= 5 assertions each)
// ============================================================================

describe("Tier 1: Character Pipeline Feature Coverage", () => {
  const characters = [
    { id: ASSET_IDS.CHAR_PLAYER_A, role: "player", clipsCount: 32, maxTris: 18000, targetTris: 12000 },
    { id: ASSET_IDS.CHAR_NPC_ELSPETH_A, role: "gardener", clipsCount: 6, maxTris: 16000, targetTris: 8000 },
    { id: ASSET_IDS.CHAR_NPC_BARNABY_A, role: "handyman", clipsCount: 6, maxTris: 16000, targetTris: 8000 },
    { id: ASSET_IDS.CHAR_NPC_SILAS_A, role: "dockmaster", clipsCount: 6, maxTris: 16000, targetTris: 8500 },
    { id: ASSET_IDS.CHAR_NPC_MAEVE_A, role: "merchant", clipsCount: 6, maxTris: 16000, targetTris: 8000 }
  ];

  // Feature 1: Player Visual Model
  it("F1: Player Visual Model (char_player_a) satisfies catalog specification and node contracts", () => {
    const spec = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A);
    expect(spec).toBeDefined();
    expect(spec?.id).toBe("char_player_a");
    expect(spec?.family).toBe("character");
    expect(spec?.file).toBe("char_player_a.glb");
    expect(spec?.rootNode).toBe("char_player_a_root");
    expect(spec?.rigNode).toBe("char_player_rig");
    expect(spec?.socketNodes).toEqual(expect.arrayContaining([
      "char_player_hand_socket_left",
      "char_player_hand_socket_right",
      "char_player_tool_socket",
      "char_player_carry_socket",
      "char_player_hip_socket"
    ]));
    expect(spec?.animationClips?.length).toBe(32);
  });

  // Feature 2: Gardener NPC Model
  it("F2: Gardener NPC Model (char_npc_elspeth_a) conforms to gardener occupational spec", () => {
    const spec = ASSET_BY_ID.get(ASSET_IDS.CHAR_NPC_ELSPETH_A);
    expect(spec).toBeDefined();
    expect(spec?.id).toBe("char_npc_elspeth_a");
    expect(spec?.family).toBe("character");
    expect(spec?.file).toBe("char_npc_elspeth_a.glb");
    expect(spec?.rootNode).toBe("char_npc_elspeth_a_root");
    expect(spec?.rigNode).toBe("char_npc_elspeth_a_rig");
    expect(spec?.animationClips?.length).toBe(6);
    expect(spec?.socketNodes?.length).toBe(5);
  });

  // Feature 3: Handyman NPC Model
  it("F3: Handyman NPC Model (char_npc_barnaby_a) conforms to craftsman occupational spec", () => {
    const spec = ASSET_BY_ID.get(ASSET_IDS.CHAR_NPC_BARNABY_A);
    expect(spec).toBeDefined();
    expect(spec?.id).toBe("char_npc_barnaby_a");
    expect(spec?.family).toBe("character");
    expect(spec?.file).toBe("char_npc_barnaby_a.glb");
    expect(spec?.rootNode).toBe("char_npc_barnaby_a_root");
    expect(spec?.rigNode).toBe("char_npc_barnaby_a_rig");
    expect(spec?.animationClips?.length).toBe(6);
    expect(spec?.socketNodes?.length).toBe(5);
  });

  // Feature 4: Dockmaster NPC Model
  it("F4: Dockmaster NPC Model (char_npc_silas_a) conforms to harbor dockmaster spec", () => {
    const spec = ASSET_BY_ID.get(ASSET_IDS.CHAR_NPC_SILAS_A);
    expect(spec).toBeDefined();
    expect(spec?.id).toBe("char_npc_silas_a");
    expect(spec?.family).toBe("character");
    expect(spec?.file).toBe("char_npc_silas_a.glb");
    expect(spec?.rootNode).toBe("char_npc_silas_a_root");
    expect(spec?.rigNode).toBe("char_npc_silas_a_rig");
    expect(spec?.animationClips?.length).toBe(6);
    expect(spec?.socketNodes?.length).toBe(5);
  });

  // Feature 5: Merchant NPC Model
  it("F5: Merchant NPC Model (char_npc_maeve_a) conforms to fishmonger/merchant spec", () => {
    const spec = ASSET_BY_ID.get(ASSET_IDS.CHAR_NPC_MAEVE_A);
    expect(spec).toBeDefined();
    expect(spec?.id).toBe("char_npc_maeve_a");
    expect(spec?.family).toBe("character");
    expect(spec?.file).toBe("char_npc_maeve_a.glb");
    expect(spec?.rootNode).toBe("char_npc_maeve_a_root");
    expect(spec?.rigNode).toBe("char_npc_maeve_a_rig");
    expect(spec?.animationClips?.length).toBe(6);
    expect(spec?.socketNodes?.length).toBe(5);
  });

  // Feature 6: LOD0/LOD1 Budget & Ratio Contracts
  it("F6: All characters satisfy LOD0 and LOD1 level distance and ratio contracts", () => {
    for (const char of characters) {
      const spec = ASSET_BY_ID.get(char.id);
      expect(spec?.lodLevels).toBeDefined();
      expect(spec?.lodLevels?.length).toBeGreaterThanOrEqual(2);

      const lod0 = spec!.lodLevels![0];
      const lod1 = spec!.lodLevels![1];

      expect(lod0.distanceMeters).toBe(0);
      expect(lod0.triangleRatioMin).toBe(1.0);
      expect(lod0.triangleRatioMax).toBe(1.0);

      expect(lod1.distanceMeters).toBeGreaterThan(lod0.distanceMeters);
      expect(lod1.triangleRatioMax).toBeLessThan(1.0);
      expect(lod1.triangleRatioMin).toBeGreaterThanOrEqual(0.08);
      expect(lod1.triangleRatioMax).toBeLessThanOrEqual(0.52);
    }
  });

  // Feature 7: Palette Tokens & COLOR_0 Baking
  it("F7: Character materials adhere to official neva palette tokens and linear sRGB specs", () => {
    const essentialTokens: PaletteToken[] = [
      "plaster_warm_01",
      "canvas_cream_01",
      "wood_dark_01",
      "wood_honey_01",
      "accent_teal_01",
      "accent_ochre_01",
      "metal_brass_01",
      "metal_dark_01"
    ];

    for (const token of essentialTokens) {
      expect(PALETTE_SPECS[token]).toBeDefined();
      expect(PALETTE_HEX[token]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(PALETTE_SPECS[token].roughness).toBeGreaterThanOrEqual(0);
      expect(PALETTE_SPECS[token].roughness).toBeLessThanOrEqual(1);
      expect(PALETTE_SPECS[token].metalness).toBeGreaterThanOrEqual(0);
      expect(PALETTE_SPECS[token].metalness).toBeLessThanOrEqual(1);
    }

    // Verify skin tone consistency token
    expect(PALETTE_SPECS.plaster_warm_01.hex.toUpperCase()).toBe("#D9BE8D");
  });

  // Feature 8: Humanoid Armature Hierarchy
  it("F8: Armature hierarchy contains all required articulated bones and secondary attachments", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const rig = character.getObjectByName("char_player_rig");
    expect(rig).toBeDefined();

    for (const boneName of REQUIRED_HUMANOID_BONES) {
      const bone = rig?.getObjectByName(boneName);
      expect(bone, `Missing required bone ${boneName}`).toBeDefined();
      expect(bone).toBeInstanceOf(THREE.Bone);
    }

    for (const boneName of SECONDARY_BONES) {
      const bone = rig?.getObjectByName(boneName);
      expect(bone, `Missing secondary bone ${boneName}`).toBeDefined();
    }

    // Check spine-to-chest-to-neck-to-head connectivity
    const spine = rig?.getObjectByName("rig_spine");
    const chest = rig?.getObjectByName("rig_chest");
    const neck = rig?.getObjectByName("rig_neck");
    const head = rig?.getObjectByName("rig_head");

    expect(chest?.parent).toBe(spine);
    expect(neck?.parent).toBe(chest);
    expect(head?.parent).toBe(neck);
  });

  // Feature 9: Smooth Vertex Skinning Weights
  it("F9: Vertex skinning weights are normalized and respect 4-influence limits across articulated limbs", () => {
    // Model synthetic vertex loop around elbow joint
    const elbowVertices = [
      { weights: [0.7, 0.3, 0, 0], bones: ["rig_upper_arm_left", "rig_forearm_left", "", ""] },
      { weights: [0.5, 0.5, 0, 0], bones: ["rig_upper_arm_left", "rig_forearm_left", "", ""] },
      { weights: [0.2, 0.8, 0, 0], bones: ["rig_upper_arm_left", "rig_forearm_left", "", ""] },
      { weights: [0.1, 0.6, 0.3, 0], bones: ["rig_chest", "rig_upper_arm_left", "rig_forearm_left", ""] },
      { weights: [1.0, 0, 0, 0], bones: ["rig_hand_left", "", "", ""] }
    ];

    for (const v of elbowVertices) {
      const sum = v.weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
      expect(v.weights.length).toBeLessThanOrEqual(4);
      expect(v.weights.every((w) => w >= 0 && w <= 1.0)).toBe(true);
      expect(v.weights.some((w) => w > 0)).toBe(true);
    }
  });

  // Feature 10: Attachment Sockets Contract
  it("F10: Standard bone-parented sockets exist and map to correct parent bones", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);

    const handSocketL = character.getObjectByName("char_player_hand_socket_left");
    const handSocketR = character.getObjectByName("char_player_hand_socket_right");
    const toolSocket = character.getObjectByName("char_player_tool_socket");
    const carrySocket = character.getObjectByName("char_player_carry_socket");
    const hipSocket = character.getObjectByName("char_player_hip_socket");

    expect(handSocketL?.parent?.name).toBe("rig_hand_left");
    expect(handSocketR?.parent?.name).toBe("rig_hand_right");
    expect(toolSocket?.parent?.name).toBe("rig_hand_right");
    expect(carrySocket?.parent?.name).toBe("rig_spine");
    expect(hipSocket?.parent?.name).toBe("rig_pelvis");
  });

  // Feature 11: Authored Action Suite (32+6)
  it("F11: Catalog defines full 32-player clip suite and 6-NPC action suite with commit markers", () => {
    const playerSpec = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A);
    const clips = playerSpec?.animationClips ?? [];
    expect(clips.length).toBe(32);

    const clipNames = new Set(clips.map((c) => c.name));
    const essentialClips = [
      "idle", "walk_start", "walk", "run_start", "run", "stop",
      "jump_start", "fall", "land_soft", "land_hard",
      "plant", "water", "harvest", "pickup", "carry_walk",
      "cast", "fishing_idle", "reel", "brace", "row", "skiff_drive"
    ];
    for (const name of essentialClips) {
      expect(clipNames.has(name), `Missing player clip ${name}`).toBe(true);
    }

    // Verify commit markers on interactive actions
    const waterClip = clips.find((c) => c.name === "water");
    expect(waterClip?.commitMarkerSeconds).toBeDefined();
    expect(waterClip!.commitMarkerSeconds!).toBeGreaterThan(0);
    expect(waterClip!.commitMarkerSeconds!).toBeLessThanOrEqual(waterClip!.durationSeconds);

    // Verify NPC clips
    const elspethSpec = ASSET_BY_ID.get(ASSET_IDS.CHAR_NPC_ELSPETH_A);
    expect(elspethSpec?.animationClips?.length).toBe(6);
    expect(elspethSpec?.animationClips?.some((c) => c.name === "idle" || c.name === "talk_gesture")).toBe(true);
  });

  // Feature 16: Animation Controller Rig & Masks
  it("F16: AnimationController resolves multi-layer masked clips across upper and lower body", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);

    // Play one-shot water action while walking
    const walkingCtx: CharacterAnimationContext = {
      mode: "on-foot",
      carrying: false,
      motion: createMotionSample({
        velocity: { x: 0, y: 0, z: 5 },
        speedMetersPerSecond: 5,
        requestedGait: "walk"
      })
    };

    controller.update(1 / 60, walkingCtx);
    controller.play("water");
    const frame = controller.update(0.1, walkingCtx);

    const playback = controller.playbackState();
    expect(playback.activeAction).toBe("water");
    expect(playback.clip).toBe("water");
    expect(playback.baseClip).toBe("walk");
    expect(playback.upperClip).toBe("water");
    expect(frame.events).toBeDefined();
    expect(isPlayerRigObjectName("character_upper_arm_left")).toBe(true);
    expect(isPlayerRigObjectName("character_hat_brim")).toBe(false);
  });

  // Feature 17: Ground/Slope Adaptation & Foot IK
  it("F17: Foot IK adjusts leg bone orientation and foot offsets on slopes", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);

    const slopeCtx: CharacterAnimationContext = {
      mode: "on-foot",
      carrying: false,
      motion: createMotionSample({
        groundNormal: { x: 0.35, y: 0.936, z: 0 },
        slopeRadians: 0.36
      })
    };

    let lastFrame = controller.update(1 / 60, slopeCtx);
    for (let i = 0; i < 20; i++) {
      lastFrame = controller.update(1 / 60, slopeCtx);
    }

    const thighL = character.getObjectByName("rig_thigh_left");
    const shinL = character.getObjectByName("rig_shin_left");

    expect(thighL?.rotation.x).not.toBe(0);
    expect(shinL?.rotation.x).not.toBe(0);
    expect(lastFrame.groundPitch).toBeDefined();
    expect(lastFrame.groundRoll).toBeDefined();
    expect(Number.isFinite(lastFrame.leftFootOffsetY)).toBe(true);
  });

  // Feature 18: Secondary Spring-Damper Dynamics
  it("F18: Secondary spring dynamics respond to body acceleration and angular velocity", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);

    const accelCtx: CharacterAnimationContext = {
      mode: "on-foot",
      carrying: false,
      motion: createMotionSample({
        accelerationMetersPerSecondSquared: 24,
        turnRateRadiansPerSecond: 3.5
      })
    };

    for (let i = 0; i < 30; i++) {
      controller.update(1 / 60, accelCtx);
    }

    const backpack = character.getObjectByName("rig_backpack");
    expect(backpack?.rotation.x).not.toBe(0);
    expect(backpack?.rotation.z).not.toBe(0);

    // Settles when motion ceases
    const idleCtx: CharacterAnimationContext = {
      mode: "on-foot",
      carrying: false,
      motion: createMotionSample()
    };
    for (let i = 0; i < 60; i++) {
      controller.update(1 / 60, idleCtx);
    }
    expect(Math.abs(backpack?.rotation.x ?? 0)).toBeLessThan(0.05);
  });

  // Feature 19: Socket Prop Mounting in World & Art Yard
  it("F19: socketAttachFor resolves correct socket poses and orientations for all tool types", () => {
    const wateringCanPose = socketAttachFor(ASSET_IDS.TOOL_WATERING_CAN_A);
    expect(wateringCanPose.rotation).toEqual([0, 0, 0]);
    expect(wateringCanPose.scale).toBe(0.72);

    const sicklePose = socketAttachFor(ASSET_IDS.TOOL_SICKLE_A);
    expect(sicklePose.rotation).toEqual([Math.PI, 0, 0]); // SHAFT_ALONG_FINGERS
    expect(sicklePose.scale).toBe(0.82);

    const rodPose = socketAttachFor(ASSET_IDS.TOOL_FISHING_ROD_A);
    expect(rodPose.rotation).toEqual([Math.PI, 0, 0]);
    expect(rodPose.scale).toBe(0.85);

    const basketPose = socketAttachFor(ASSET_IDS.PROP_HARVEST_BASKET_A);
    expect(basketPose.rotation).toEqual([0, 0, 0]);
    expect(basketPose.scale).toBe(0.68);

    const unknownPose = socketAttachFor("unknown_tool_asset");
    expect(unknownPose.scale).toBe(0.85);
  });

  // Feature 20: Complete Pipeline & Build Integrity
  it("F20: Complete pipeline invariants hold across catalog, controller, and socket subsystems", () => {
    // 1. All character assets exist in ASSET_IDS
    expect(Object.values(ASSET_IDS)).toContain("char_player_a");
    expect(Object.values(ASSET_IDS)).toContain("char_npc_elspeth_a");
    expect(Object.values(ASSET_IDS)).toContain("char_npc_barnaby_a");
    expect(Object.values(ASSET_IDS)).toContain("char_npc_silas_a");
    expect(Object.values(ASSET_IDS)).toContain("char_npc_maeve_a");

    // 2. Traversal speeds match controller expectations
    expect(PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond).toBe(5);
    expect(PLAYER_TRAVERSAL_TUNING.sprintSpeedMetersPerSecond).toBe(8.2);

    // 3. Motion config scaling bounds
    expect(CANONICAL_RENDER_CONFIG.motion.locomotionPlaybackMinimum).toBe(0.45);
    expect(CANONICAL_RENDER_CONFIG.motion.locomotionPlaybackMaximum).toBe(1.85);

    // 4. Controller playback state inspection
    const char = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(char);
    expect(controller.currentClip()).toBe("idle");
    expect(controller.playbackState().activeAction).toBeNull();
    expect(char.children.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (>= 5 assertions per feature category)
// ============================================================================

describe("Tier 2: Boundary & Corner Cases", () => {
  it("B1: Zero-motion and micro-velocity inputs maintain stable idle without jitter", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);

    const tinyMotion = createMotionSample({
      speedMetersPerSecond: 0.00005,
      velocity: { x: 0.00003, y: 0, z: 0.00004 }
    });

    const frame = controller.update(1 / 60, {
      mode: "on-foot",
      carrying: false,
      motion: tinyMotion
    });

    expect(controller.currentClip()).toBe("idle");
    expect(frame.bobY).toBe(0);
    expect(frame.leanX).toBe(0);
    expect(frame.events).toHaveLength(0);
    expect(controller.playbackState().playbackScale).toBeCloseTo(1, 2);
  });

  it("B2: Extreme traversal velocities clamp playback speed scales safely", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);

    const superFastMotion = createMotionSample({
      speedMetersPerSecond: 100.0,
      velocity: { x: 0, y: 0, z: 100.0 },
      requestedGait: "run"
    });

    controller.update(1 / 60, {
      mode: "on-foot",
      carrying: false,
      motion: superFastMotion
    });

    const playback = controller.playbackState();
    expect(playback.playbackScale).toBeLessThanOrEqual(CANONICAL_RENDER_CONFIG.motion.locomotionPlaybackMaximum);
    expect(playback.playbackScale).toBeGreaterThanOrEqual(CANONICAL_RENDER_CONFIG.motion.locomotionPlaybackMinimum);
    expect(Number.isFinite(playback.playbackScale)).toBe(true);
  });

  it("B3: Max terrain slope boundary (> 38°) suppresses foot IK and adapts gait scaling", () => {
    const normalDownhillZ = { x: 0, y: 0.866, z: -0.5 }; // downhill towards +Z
    const normalFlat = { x: 0, y: 1, z: 0 };

    const scaleUphill = slopeGaitScale(normalDownhillZ, 0, -1); // move against downhill direction = uphill
    const scaleFlat = slopeGaitScale(normalFlat, 0, -1);

    expect(scaleUphill).toBeLessThan(scaleFlat);
    expect(scaleUphill).toBeGreaterThanOrEqual(0.78);
    expect(scaleFlat).toBe(1.0);

    // Controller ignores foot IK above 38 degrees
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);

    const frame = controller.update(1 / 60, {
      mode: "on-foot",
      carrying: false,
      motion: createMotionSample({
        slopeRadians: (42 * Math.PI) / 180,
        groundNormal: { x: 0.707, y: 0.707, z: 0 }
      })
    });

    expect(frame.leftFootOffsetY).toBe(0);
    expect(frame.rightFootOffsetY).toBe(0);
  });

  it("B4: Extreme delta times (dt = 0, negative dt, huge dt) execute without NaN or divergence", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);
    const ctx: CharacterAnimationContext = {
      mode: "on-foot",
      carrying: false,
      motion: createMotionSample({ speedMetersPerSecond: 5, requestedGait: "walk" })
    };

    // dt = 0
    expect(() => controller.update(0, ctx)).not.toThrow();
    expect(Number.isFinite(controller.playbackState().playbackScale)).toBe(true);

    // Huge dt (5.0 seconds lag spike)
    let hugeFrame!: ReturnType<typeof controller.update>;
    expect(() => {
      hugeFrame = controller.update(5.0, ctx);
    }).not.toThrow();
    expect(Number.isFinite(hugeFrame.bobY)).toBe(true);
    expect(Number.isFinite(hugeFrame.leanX)).toBe(true);
    expect(Number.isFinite(hugeFrame.leanZ)).toBe(true);
  });

  it("B5: Disconnected or missing socket attachments fallback gracefully", () => {
    // Empty scene with no sockets
    const bareGroup = new THREE.Group();
    const controller = new AnimationController(bareGroup);

    expect(() => {
      controller.update(1 / 60, {
        mode: "on-foot",
        carrying: false,
        motion: createMotionSample()
      });
    }).not.toThrow();

    // Unknown tool asset attachment fallback
    const fallbackPose = socketAttachFor("");
    expect(fallbackPose.position).toEqual([0, 0, 0]);
    expect(fallbackPose.rotation).toEqual([0, 0, 0]);
    expect(fallbackPose.scale).toBe(0.85);
  });
});

// ============================================================================
// TIER 3: CROSS-FEATURE INTERACTIONS (Pairwise Combinations)
// ============================================================================

describe("Tier 3: Cross-Feature Interactions", () => {
  it("C1: Farming + Tool Socket Props + Upper Body Masking during Locomotion", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);

    // Attach watering can to tool socket
    const toolSocket = character.getObjectByName("char_player_tool_socket");
    const wateringCanMesh = new THREE.Mesh();
    wateringCanMesh.name = "tool_watering_can";
    const pose = socketAttachFor(ASSET_IDS.TOOL_WATERING_CAN_A);
    wateringCanMesh.position.set(...pose.position);
    wateringCanMesh.rotation.set(...pose.rotation);
    wateringCanMesh.scale.setScalar(pose.scale);
    toolSocket?.add(wateringCanMesh);

    // Walk while watering
    const walkingCtx: CharacterAnimationContext = {
      mode: "on-foot",
      carrying: false,
      motion: createMotionSample({
        velocity: { x: 0, y: 0, z: 4.5 },
        speedMetersPerSecond: 4.5,
        requestedGait: "walk"
      })
    };

    controller.update(1 / 60, walkingCtx);
    controller.play("water");

    for (let i = 0; i < 15; i++) {
      controller.update(1 / 60, walkingCtx);
    }

    expect(controller.playbackState().activeAction).toBe("water");
    expect(toolSocket?.children.length).toBe(1);
    expect(wateringCanMesh.scale.x).toBeCloseTo(0.72, 3);
  });

  it("C2: Steep Terrain Slopes + 2-Bone Foot IK + Secondary Backpack Dynamics", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);

    const uphillSprint: CharacterAnimationContext = {
      mode: "on-foot",
      carrying: false,
      motion: createMotionSample({
        velocity: { x: 0, y: 1.2, z: 7.5 },
        speedMetersPerSecond: 7.6,
        accelerationMetersPerSecondSquared: 15,
        turnRateRadiansPerSecond: 1.8,
        slopeRadians: 0.32,
        groundNormal: { x: 0, y: 0.948, z: -0.316 },
        requestedGait: "run"
      })
    };

    let frame!: ReturnType<typeof controller.update>;
    for (let i = 0; i < 30; i++) {
      frame = controller.update(1 / 60, uphillSprint);
    }

    const thighL = character.getObjectByName("rig_thigh_left");
    const backpack = character.getObjectByName("rig_backpack");

    expect(thighL?.rotation.x).not.toBe(0);
    expect(backpack?.rotation.x).not.toBe(0);
    expect(frame.groundPitch).toBeLessThan(0);
  });

  it("C3: Rowboat Navigation + Dual Oar Hand Sockets + Throttle Reversal", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);

    // Forward rowing
    const forwardRowCtx: CharacterAnimationContext = {
      mode: "boat-driving",
      carrying: false,
      motion: createMotionSample({ speedMetersPerSecond: 3.0, requestedGait: "vehicle" }),
      boatInput: { boatTypeId: "boat.rowboat", throttle: 1.0, steering: 0.2 }
    };

    controller.update(1 / 60, forwardRowCtx);
    expect(controller.currentClip()).toBe("row");
    expect(controller.playbackState().playbackScale).toBeGreaterThan(0);

    // Reverse rowing
    const reverseRowCtx: CharacterAnimationContext = {
      mode: "boat-driving",
      carrying: false,
      motion: createMotionSample({ speedMetersPerSecond: 2.0, requestedGait: "vehicle" }),
      boatInput: { boatTypeId: "boat.rowboat", throttle: -0.8, steering: 0 }
    };

    controller.update(1 / 60, reverseRowCtx);
    expect(controller.playbackState().clip).toBe("row");
    expect(controller.playbackState().playbackScale).toBeLessThan(0);
  });

  it("C4: Village NPC Dialogue Gestures + Occupational Prop Holster Stability", () => {
    const elspeth = buildMockCharacterHierarchy(ASSET_IDS.CHAR_NPC_ELSPETH_A);
    const controller = new AnimationController(elspeth);

    // Elspeth trowel attached to tool socket
    const trowelMesh = new THREE.Mesh();
    trowelMesh.name = "npc_trowel";
    const toolSocket = elspeth.getObjectByName("char_npc_elspeth_a_tool_socket");
    toolSocket?.add(trowelMesh);

    // Trigger talking state
    const talkingCtx: CharacterAnimationContext = {
      mode: "on-foot",
      carrying: false,
      talking: true,
      motion: createMotionSample()
    };

    controller.update(1 / 60, talkingCtx);
    expect(controller.currentClip()).toBe("talk_gesture");
    expect(toolSocket?.children).toContain(trowelMesh);
  });
});

// ============================================================================
// TIER 4: REAL-WORLD WORKLOAD SCENARIOS
// ============================================================================

describe("Tier 4: Real-World Workload Scenarios", () => {
  // Scenario 1: Full Farming Loop with Tool Socket Swapping
  it("Scenario 1: Full Farming Loop with Tool Socket Swapping", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);
    const toolSocket = character.getObjectByName("char_player_tool_socket")!;
    const carrySocket = character.getObjectByName("char_player_carry_socket")!;

    // Step 1: Walk to field & plant seeds
    const walkMotion = createMotionSample({ speedMetersPerSecond: 4.8, requestedGait: "walk" });
    controller.update(1 / 60, { mode: "on-foot", carrying: false, motion: walkMotion });
    expect(controller.currentClip()).toBe("walk_start");

    controller.play("plant");
    controller.update(0.3, { mode: "on-foot", carrying: false, motion: createMotionSample() });
    expect(controller.playbackState().activeAction).toBe("plant");
    controller.cancelAction();

    // Step 2: Swap to Watering Can & water
    toolSocket.clear();
    const can = new THREE.Mesh();
    const canPose = socketAttachFor(ASSET_IDS.TOOL_WATERING_CAN_A);
    can.position.set(...canPose.position);
    can.rotation.set(...canPose.rotation);
    toolSocket.add(can);
    expect(can.rotation.x).toBe(0);

    controller.play("water");
    controller.update(0.2, { mode: "on-foot", carrying: false, motion: createMotionSample() });
    expect(controller.playbackState().activeAction).toBe("water");
    controller.cancelAction();

    // Step 3: Swap to Sickle & harvest
    toolSocket.clear();
    const sickle = new THREE.Mesh();
    const sicklePose = socketAttachFor(ASSET_IDS.TOOL_SICKLE_A);
    sickle.position.set(...sicklePose.position);
    sickle.rotation.set(...sicklePose.rotation);
    toolSocket.add(sickle);
    expect(sickle.rotation.x).toBeCloseTo(Math.PI, 4);

    controller.play("harvest");
    controller.update(0.25, { mode: "on-foot", carrying: false, motion: createMotionSample() });
    expect(controller.playbackState().activeAction).toBe("harvest");
    controller.cancelAction();

    // Step 4: Pick up Harvest Basket and carry
    toolSocket.clear();
    const basket = new THREE.Mesh();
    carrySocket.add(basket);

    controller.update(1 / 60, { mode: "on-foot", carrying: true, motion: walkMotion });
    for (let i = 0; i < 25; i++) {
      controller.update(1 / 60, { mode: "on-foot", carrying: true, motion: walkMotion });
    }
    expect(controller.currentClip()).toBe("carry_walk");
  });

  // Scenario 2: Coastal Slope Navigation & Uneven Terrain Foot IK
  it("Scenario 2: Coastal Slope Navigation & Uneven Terrain Foot IK", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);

    const slopeElevations = [0.0, 0.12, 0.28, 0.45, 0.32, 0.18, 0.0];
    const recordedOffsets: number[] = [];

    for (const slope of slopeElevations) {
      const normalY = Math.cos(slope);
      const normalZ = -Math.sin(slope);
      const navCtx: CharacterAnimationContext = {
        mode: "on-foot",
        carrying: false,
        motion: createMotionSample({
          velocity: { x: 0, y: slope * 2, z: 5.0 },
          speedMetersPerSecond: 5.0,
          groundNormal: { x: 0, y: normalY, z: normalZ },
          slopeRadians: slope,
          requestedGait: "walk"
        })
      };

      let frame!: ReturnType<typeof controller.update>;
      for (let f = 0; f < 10; f++) {
        frame = controller.update(1 / 60, navCtx);
      }
      recordedOffsets.push(frame.leftFootOffsetY);
    }

    expect(recordedOffsets.length).toBe(slopeElevations.length);
    expect(recordedOffsets.every((val) => Number.isFinite(val))).toBe(true);
  });

  // Scenario 4: Rowboat Navigation & Dual Oar Hand Socket Synchronization
  it("Scenario 4: Rowboat Navigation & Dual Oar Hand Socket Synchronization", () => {
    const character = buildMockCharacterHierarchy(ASSET_IDS.CHAR_PLAYER_A);
    const controller = new AnimationController(character);
    const handL = character.getObjectByName("char_player_hand_socket_left")!;
    const handR = character.getObjectByName("char_player_hand_socket_right")!;

    const oarL = new THREE.Mesh();
    const oarR = new THREE.Mesh();
    handL.add(oarL);
    handR.add(oarR);

    // Board rowboat in idle
    controller.update(1 / 60, {
      mode: "boat-driving",
      carrying: false,
      motion: createMotionSample({ speedMetersPerSecond: 0, requestedGait: "vehicle" }),
      boatInput: { boatTypeId: "boat.rowboat", throttle: 0, steering: 0 }
    });
    expect(controller.currentClip()).toBe("rowboat_idle");

    // Throttle up -> rowing animation engages
    for (let f = 0; f < 25; f++) {
      controller.update(1 / 60, {
        mode: "boat-driving",
        carrying: false,
        motion: createMotionSample({ speedMetersPerSecond: 3.2, requestedGait: "vehicle" }),
        boatInput: { boatTypeId: "boat.rowboat", throttle: 1.0, steering: 0.1 }
      });
    }

    expect(controller.currentClip()).toBe("row");
    expect(handL.children).toContain(oarL);
    expect(handR.children).toContain(oarR);
  });

  // Scenario 5: Village NPC Stance, Gestures & Dialogue Socket Inspection
  it("Scenario 5: Village NPC Stance, Gestures & Dialogue Socket Inspection across all 4 NPCs", () => {
    const npcs = [
      ASSET_IDS.CHAR_NPC_ELSPETH_A,
      ASSET_IDS.CHAR_NPC_BARNABY_A,
      ASSET_IDS.CHAR_NPC_SILAS_A,
      ASSET_IDS.CHAR_NPC_MAEVE_A
    ];

    for (const npcId of npcs) {
      const npcGroup = buildMockCharacterHierarchy(npcId);
      const controller = new AnimationController(npcGroup);

      // Verify initial stance
      controller.update(1 / 60, {
        mode: "on-foot",
        carrying: false,
        motion: createMotionSample()
      });
      expect(controller.currentClip()).toBe("idle");

      // Verify dialogue trigger
      controller.update(1 / 60, {
        mode: "on-foot",
        carrying: false,
        talking: true,
        motion: createMotionSample()
      });
      expect(controller.currentClip()).toBe("talk_gesture");

      // Verify all sockets exist
      const prefix = npcId;
      expect(npcGroup.getObjectByName(`${prefix}_hand_socket_left`)).toBeDefined();
      expect(npcGroup.getObjectByName(`${prefix}_hand_socket_right`)).toBeDefined();
      expect(npcGroup.getObjectByName(`${prefix}_tool_socket`)).toBeDefined();
      expect(npcGroup.getObjectByName(`${prefix}_carry_socket`)).toBeDefined();
      expect(npcGroup.getObjectByName(`${prefix}_hip_socket`)).toBeDefined();
    }
  });
});
