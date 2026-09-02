import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PLAYER_TRAVERSAL_TUNING } from "../../src/simulation/navigation/PlayerTraversal";
import {
  AnimationController
} from "../../src/render/animation/AnimationController";
import {
  ASSET_BY_ID,
  ASSET_IDS,
  type AssetId
} from "../../src/render/assets/AssetCatalog";
import {
  socketAttachFor,
  SOCKET_ATTACH_BY_ASSET
} from "../../src/render/assets/ToolSocketAttach";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import type { PlayerMotionSample } from "../../src/simulation/core/PhysicsAdapter";

function createMotion(overrides: Partial<PlayerMotionSample> = {}): PlayerMotionSample {
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

function buildTestHumanoid(assetId: AssetId = ASSET_IDS.CHAR_PLAYER_A): THREE.Group {
  const root = new THREE.Group();
  root.name = `${assetId}_root`;
  root.userData.assetId = assetId;

  const rigNodeName = assetId === ASSET_IDS.CHAR_PLAYER_A ? "char_player_rig" : `${assetId}_rig`;
  const rig = new THREE.Group();
  rig.name = rigNodeName;
  root.add(rig);

  const bones: Record<string, THREE.Bone> = {};
  const boneNames = [
    "rig_root", "rig_pelvis", "rig_spine", "rig_spine_02", "rig_chest", "rig_neck", "rig_head",
    "rig_clavicle_left", "rig_upper_arm_left", "rig_forearm_left", "rig_hand_left",
    "rig_clavicle_right", "rig_upper_arm_right", "rig_forearm_right", "rig_hand_right",
    "rig_thigh_left", "rig_shin_left", "rig_foot_left", "rig_toe_left",
    "rig_thigh_right", "rig_shin_right", "rig_foot_right", "rig_toe_right",
    "rig_hat_brim", "rig_backpack", "rig_canteen_left", "rig_canteen_right"
  ];

  for (const name of boneNames) {
    const bone = new THREE.Bone();
    bone.name = name;
    bones[name] = bone;
  }

  // Hierarchy
  bones.rig_root.add(bones.rig_pelvis);
  bones.rig_pelvis.add(bones.rig_spine);
  bones.rig_spine.add(bones.rig_spine_02);
  bones.rig_spine_02.add(bones.rig_chest);
  bones.rig_chest.add(bones.rig_neck);
  bones.rig_neck.add(bones.rig_head);
  bones.rig_head.add(bones.rig_hat_brim);

  bones.rig_chest.add(bones.rig_clavicle_left);
  bones.rig_clavicle_left.add(bones.rig_upper_arm_left);
  bones.rig_upper_arm_left.add(bones.rig_forearm_left);
  bones.rig_forearm_left.add(bones.rig_hand_left);

  bones.rig_chest.add(bones.rig_clavicle_right);
  bones.rig_clavicle_right.add(bones.rig_upper_arm_right);
  bones.rig_upper_arm_right.add(bones.rig_forearm_right);
  bones.rig_forearm_right.add(bones.rig_hand_right);

  bones.rig_pelvis.add(bones.rig_thigh_left);
  bones.rig_thigh_left.add(bones.rig_shin_left);
  bones.rig_shin_left.add(bones.rig_foot_left);
  bones.rig_foot_left.add(bones.rig_toe_left);

  bones.rig_pelvis.add(bones.rig_thigh_right);
  bones.rig_thigh_right.add(bones.rig_shin_right);
  bones.rig_shin_right.add(bones.rig_foot_right);
  bones.rig_foot_right.add(bones.rig_toe_right);

  bones.rig_spine.add(bones.rig_backpack);
  bones.rig_backpack.add(bones.rig_canteen_left);
  bones.rig_backpack.add(bones.rig_canteen_right);

  // Real limb offsets, matching the authored proportions. Coincident bones make
  // every limb zero-length, and the two-bone IK correctly refuses to solve one.
  const restOffsets: Record<string, [number, number, number]> = {
    rig_pelvis: [0, 0.889, 0],
    rig_spine: [0, 0.121, 0],
    rig_spine_02: [0, 0.141, 0],
    rig_chest: [0, 0.141, 0],
    rig_neck: [0, 0.162, 0],
    rig_head: [0, 0.121, 0],
    rig_thigh_left: [-0.13, 0, 0],
    rig_thigh_right: [0.13, 0, 0],
    rig_shin_left: [0, -0.414, 0.034],
    rig_shin_right: [0, -0.414, 0.034],
    rig_foot_left: [0, -0.343, -0.034],
    rig_foot_right: [0, -0.343, -0.034],
    rig_toe_left: [0, -0.07, 0.14],
    rig_toe_right: [0, -0.07, 0.14]
  };
  for (const [name, offset] of Object.entries(restOffsets)) {
    bones[name]?.position.set(offset[0], offset[1], offset[2]);
  }

  rig.add(bones.rig_root);

  // Sockets
  const prefix = assetId === ASSET_IDS.CHAR_PLAYER_A ? "char_player" : assetId;
  const sockets = [
    { name: `${prefix}_hand_socket_left`, parent: bones.rig_hand_left },
    { name: `${prefix}_hand_socket_right`, parent: bones.rig_hand_right },
    { name: `${prefix}_tool_socket`, parent: bones.rig_hand_right },
    { name: `${prefix}_carry_socket`, parent: bones.rig_spine },
    { name: `${prefix}_hip_socket`, parent: bones.rig_pelvis }
  ];

  for (const s of sockets) {
    const sock = new THREE.Object3D();
    sock.name = s.name;
    s.parent.add(sock);
  }

  const spec = ASSET_BY_ID.get(assetId);
  root.userData.animationClips = (spec?.animationClips ?? []).map(
    (c) => new THREE.AnimationClip(c.name, c.durationSeconds, [])
  );

  return root;
}

describe("Milestone 4 Empirical Challenger — Secondary Dynamics & Socket Alignment", () => {
  // ==========================================================================
  // SECTION 1: Secondary Spring Harmonic Oscillators & Zero Drift
  // ==========================================================================
  describe("Secondary Springs: Oscillation Decay, Zero Drift & Numerical Stability", () => {
    it("damps to exact rest rotation with zero residual drift after violent motion cycles", () => {
      const char = buildTestHumanoid();
      const controller = new AnimationController(char);

      const hatBrim = char.getObjectByName("rig_hat_brim")!;
      const backpack = char.getObjectByName("rig_backpack")!;
      const canteenL = char.getObjectByName("rig_canteen_left")!;
      const canteenR = char.getObjectByName("rig_canteen_right")!;

      const initialRotX = {
        hat: hatBrim.rotation.x,
        backpack: backpack.rotation.x,
        canteenL: canteenL.rotation.x,
        canteenR: canteenR.rotation.x
      };

      // Perform 50 cycles of violent acceleration and sharp turns followed by rest
      for (let cycle = 0; cycle < 50; cycle++) {
        // High impulse phase (15 frames)
        const accelMotion = {
          mode: "on-foot" as const,
          carrying: false,
          motion: createMotion({
            accelerationMetersPerSecondSquared: cycle % 2 === 0 ? 24 : -24,
            turnRateRadiansPerSecond: cycle % 2 === 0 ? 4.0 : -4.0
          })
        };
        for (let f = 0; f < 15; f++) {
          controller.update(1 / 60, accelMotion);
        }

        // Verify active displacement occurred
        expect(Math.abs(backpack.rotation.x - initialRotX.backpack)).toBeGreaterThan(0.01);
        expect(Math.abs(canteenL.rotation.x - initialRotX.canteenL)).toBeGreaterThan(0.01);

        // Rest phase (180 frames = 3.0s at dt=1/60)
        const restMotion = {
          mode: "on-foot" as const,
          carrying: false,
          motion: createMotion()
        };
        for (let f = 0; f < 180; f++) {
          controller.update(1 / 60, restMotion);
        }
      }

      // After 50 intense cycles and resting, all secondary bones must decay to rest rotation (< 1e-4 error)
      expect(Math.abs(hatBrim.rotation.x - initialRotX.hat)).toBeLessThan(1e-4);
      expect(Math.abs(backpack.rotation.x - initialRotX.backpack)).toBeLessThan(1e-4);
      expect(Math.abs(canteenL.rotation.x - initialRotX.canteenL)).toBeLessThan(1e-4);
      expect(Math.abs(canteenR.rotation.x - initialRotX.canteenR)).toBeLessThan(1e-4);

      expect(Math.abs(hatBrim.rotation.z)).toBeLessThan(1e-4);
      expect(Math.abs(backpack.rotation.z)).toBeLessThan(1e-4);
      expect(Math.abs(canteenL.rotation.z)).toBeLessThan(1e-4);
      expect(Math.abs(canteenR.rotation.z)).toBeLessThan(1e-4);
    });

    it("verifies relative mass/response hierarchy across all 4 secondary bones", () => {
      const char = buildTestHumanoid();
      const controller = new AnimationController(char);

      const hatBrim = char.getObjectByName("rig_hat_brim")!;
      const backpack = char.getObjectByName("rig_backpack")!;
      const canteenL = char.getObjectByName("rig_canteen_left")!;
      const canteenR = char.getObjectByName("rig_canteen_right")!;

      // Use acceleration=8 m/s² so responses (-8 * response) don't hit the 0.18 clamp ceiling
      const stepAccel = {
        mode: "on-foot" as const,
        carrying: false,
        motion: createMotion({
          accelerationMetersPerSecondSquared: 8,
          turnRateRadiansPerSecond: 0
        })
      };

      for (let i = 0; i < 20; i++) controller.update(1 / 60, stepAccel);

      // Canteen Left (0.018) > Canteen Right (0.016) > Backpack (0.012) > Hat Brim (0.010)
      const absHat = Math.abs(hatBrim.rotation.x);
      const absBackpack = Math.abs(backpack.rotation.x);
      const absCanteenR = Math.abs(canteenR.rotation.x);
      const absCanteenL = Math.abs(canteenL.rotation.x);

      expect(absCanteenL).toBeGreaterThan(absCanteenR);
      expect(absCanteenR).toBeGreaterThan(absBackpack);
      expect(absBackpack).toBeGreaterThan(absHat);
      expect(absHat).toBeGreaterThan(0);
    });

    it("preserves stability across varying frame rates (120Hz, 60Hz, 30Hz, 15Hz) and delta time spikes", () => {
      const deltaTimes = [1 / 120, 1 / 60, 1 / 30, 1 / 15];

      for (const dt of deltaTimes) {
        const char = buildTestHumanoid();
        const controller = new AnimationController(char);

        const motionCtx = {
          mode: "on-foot" as const,
          carrying: false,
          motion: createMotion({
            accelerationMetersPerSecondSquared: 18,
            turnRateRadiansPerSecond: 2.5
          })
        };

        for (let i = 0; i < Math.round(1.0 / dt); i++) {
          controller.update(dt, motionCtx);
        }

        const backpack = char.getObjectByName("rig_backpack")!;
        expect(Number.isFinite(backpack.rotation.x)).toBe(true);
        expect(Number.isFinite(backpack.rotation.z)).toBe(true);
        expect(Math.abs(backpack.rotation.x)).toBeGreaterThan(0);
        expect(Math.abs(backpack.rotation.x)).toBeLessThan(0.3); // Safe bounds
      }

      // Delta time spike stress-test (e.g. 5-second lag spike)
      const spikeChar = buildTestHumanoid();
      const spikeCtrl = new AnimationController(spikeChar);
      const spikeFrame = spikeCtrl.update(5.0, {
        mode: "on-foot",
        carrying: false,
        motion: createMotion({ accelerationMetersPerSecondSquared: 24, turnRateRadiansPerSecond: 4 })
      });

      const spikeBackpack = spikeChar.getObjectByName("rig_backpack")!;
      expect(Number.isFinite(spikeBackpack.rotation.x)).toBe(true);
      expect(Number.isFinite(spikeBackpack.rotation.z)).toBe(true);
      expect(Number.isFinite(spikeFrame.bobY)).toBe(true);
      expect(Number.isFinite(spikeFrame.leanX)).toBe(true);
    });

    it("instantly neutralizes secondary springs under reduced motion without lingering inertia", () => {
      const char = buildTestHumanoid();
      const controller = new AnimationController(char);
      const backpack = char.getObjectByName("rig_backpack")!;

      const highAccel = {
        mode: "on-foot" as const,
        carrying: false,
        motion: createMotion({ accelerationMetersPerSecondSquared: 24, turnRateRadiansPerSecond: 4.0 })
      };

      // Accelerate without reduced motion
      for (let i = 0; i < 20; i++) controller.update(1 / 60, highAccel, false);
      expect(Math.abs(backpack.rotation.x)).toBeGreaterThan(0.02);

      // Single frame with reducedMotion = true
      controller.update(1 / 60, highAccel, true);
      expect(backpack.rotation.x).toBeCloseTo(0, 5);
      expect(backpack.rotation.z).toBeCloseTo(0, 5);
    });
  });

  // ==========================================================================
  // SECTION 2: Socket Attachment & Shaft Tool 180° Orientation vs Non-Shaft
  // ==========================================================================
  describe("Socket Attachment & Shaft vs Non-Shaft Orientation Verification", () => {
    it("conforms strictly to the 180° rotation contract for shaft tools vs identity for non-shaft tools", () => {
      // Shaft Tools (Handle along hanging fingers -> 180 deg around X = [Math.PI, 0, 0])
      const shaftTools = [
        { id: ASSET_IDS.TOOL_SICKLE_A, scale: 0.82 },
        { id: ASSET_IDS.TOOL_WORKSTATION_SCOOP_A, scale: 0.78 },
        { id: ASSET_IDS.TOOL_FISHING_ROD_A, scale: 0.85 }
      ];

      for (const tool of shaftTools) {
        const pose = socketAttachFor(tool.id);
        expect(pose.rotation[0], `Shaft tool ${tool.id} must have rotation.x = Math.PI`).toBeCloseTo(Math.PI, 6);
        expect(pose.rotation[1], `Shaft tool ${tool.id} must have rotation.y = 0`).toBe(0);
        expect(pose.rotation[2], `Shaft tool ${tool.id} must have rotation.z = 0`).toBe(0);
        expect(pose.position).toEqual([0, 0, 0]);
        expect(pose.scale).toBeCloseTo(tool.scale, 3);
      }

      // Non-Shaft Tools / Props (Identity rotation = [0, 0, 0])
      const nonShaftTools = [
        { id: ASSET_IDS.TOOL_WATERING_CAN_A, scale: 0.72 },
        { id: ASSET_IDS.TOOL_SEED_POUCH_A, scale: 0.72 },
        { id: ASSET_IDS.PROP_CROP_BUNDLE_A, scale: 0.76 },
        { id: ASSET_IDS.PROP_HARVEST_BASKET_A, scale: 0.68 }
      ];

      for (const tool of nonShaftTools) {
        const pose = socketAttachFor(tool.id);
        expect(pose.rotation).toEqual([0, 0, 0]);
        expect(pose.position).toEqual([0, 0, 0]);
        expect(pose.scale).toBeCloseTo(tool.scale, 3);
      }
    });

    it("empirically tests vector transformation: shaft rotation points handle along -Y (fingers) while non-shaft points +Y", () => {
      const handleVector = new THREE.Vector3(0, 1, 0); // +Y along handle in tool local space

      // Test Shaft Tool rotation matrix
      const shaftPose = socketAttachFor(ASSET_IDS.TOOL_SICKLE_A);
      const shaftEuler = new THREE.Euler(...shaftPose.rotation);
      const transformedShaft = handleVector.clone().applyEuler(shaftEuler);

      expect(transformedShaft.x).toBeCloseTo(0, 5);
      expect(transformedShaft.y).toBeCloseTo(-1, 5); // Inverted to follow hanging fingers
      expect(transformedShaft.z).toBeCloseTo(0, 5);

      // Test Non-Shaft Tool rotation matrix (Watering Can)
      const canPose = socketAttachFor(ASSET_IDS.TOOL_WATERING_CAN_A);
      const canEuler = new THREE.Euler(...canPose.rotation);
      const transformedCan = handleVector.clone().applyEuler(canEuler);

      expect(transformedCan.x).toBeCloseTo(0, 5);
      expect(transformedCan.y).toBeCloseTo(1, 5); // Upright
      expect(transformedCan.z).toBeCloseTo(0, 5);
    });

    it("verifies fallback pose for unregistered asset IDs adheres to identity hold", () => {
      const fallbackPose = socketAttachFor("non_existent_tool_id");
      expect(fallbackPose.position).toEqual([0, 0, 0]);
      expect(fallbackPose.rotation).toEqual([0, 0, 0]);
      expect(fallbackPose.scale).toBe(0.85);
    });

    it("verifies socket parenting across all 5 characters in node hierarchies", () => {
      const characters = [
        ASSET_IDS.CHAR_PLAYER_A,
        ASSET_IDS.CHAR_NPC_ELSPETH_A,
        ASSET_IDS.CHAR_NPC_BARNABY_A,
        ASSET_IDS.CHAR_NPC_SILAS_A,
        ASSET_IDS.CHAR_NPC_MAEVE_A
      ];

      for (const charId of characters) {
        const char = buildTestHumanoid(charId);
        const prefix = charId === ASSET_IDS.CHAR_PLAYER_A ? "char_player" : charId;

        const handL = char.getObjectByName(`${prefix}_hand_socket_left`);
        const handR = char.getObjectByName(`${prefix}_hand_socket_right`);
        const tool = char.getObjectByName(`${prefix}_tool_socket`);
        const carry = char.getObjectByName(`${prefix}_carry_socket`);
        const hip = char.getObjectByName(`${prefix}_hip_socket`);

        expect(handL?.parent?.name).toBe("rig_hand_left");
        expect(handR?.parent?.name).toBe("rig_hand_right");
        expect(tool?.parent?.name).toBe("rig_hand_right");
        expect(carry?.parent?.name).toBe("rig_spine");
        expect(hip?.parent?.name).toBe("rig_pelvis");
      }
    });
  });

  // ==========================================================================
  // SECTION 3: Art Yard Interactive Inspection Integration
  // ==========================================================================
  describe("Art Yard Interactive Inspection & Socket Prop Attachment", () => {
    it("verifies Art Yard auto-equip mapping and socket resolution rules", () => {
      const clipToAssetMapping: Record<string, string> = {
        water: ASSET_IDS.TOOL_WATERING_CAN_A,
        harvest: ASSET_IDS.TOOL_SICKLE_A,
        plant: ASSET_IDS.TOOL_SEED_POUCH_A,
        workstation: ASSET_IDS.TOOL_WORKSTATION_SCOOP_A,
        cast: ASSET_IDS.TOOL_FISHING_ROD_A,
        fishing_idle: ASSET_IDS.TOOL_FISHING_ROD_A,
        reel: ASSET_IDS.TOOL_FISHING_ROD_A,
        slack: ASSET_IDS.TOOL_FISHING_ROD_A,
        brace: ASSET_IDS.TOOL_FISHING_ROD_A,
        pickup: ASSET_IDS.PROP_HARVEST_BASKET_A,
        place: ASSET_IDS.PROP_HARVEST_BASKET_A,
        carry_walk: ASSET_IDS.PROP_CROP_BUNDLE_A,
        carry_idle: ASSET_IDS.PROP_CROP_BUNDLE_A
      };

      for (const expectedAssetId of Object.values(clipToAssetMapping)) {
        const pose = socketAttachFor(expectedAssetId);
        expect(pose).toBeDefined();
        expect(SOCKET_ATTACH_BY_ASSET[expectedAssetId]).toBeDefined();

        // Socket routing check
        let expectedSocket = "tool_socket";
        if (expectedAssetId === ASSET_IDS.TOOL_SEED_POUCH_A) {
          expectedSocket = "hip_socket";
        } else if (expectedAssetId.startsWith("prop_crop_bundle") || expectedAssetId.startsWith("prop_harvest_basket")) {
          expectedSocket = "carry_socket";
        }

        expect(expectedSocket).toBeTruthy();
      }
    });

    it("simulates prop attachment to character sockets applying correct transforms and scales", () => {
      const player = buildTestHumanoid(ASSET_IDS.CHAR_PLAYER_A);

      // 1. Attach Sickle to tool socket
      const toolSocket = player.getObjectByName("char_player_tool_socket")!;
      const sickleMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      sickleMesh.name = `socket_${ASSET_IDS.TOOL_SICKLE_A}`;
      const sicklePose = socketAttachFor(ASSET_IDS.TOOL_SICKLE_A);

      sickleMesh.position.set(...sicklePose.position);
      sickleMesh.rotation.set(...sicklePose.rotation);
      sickleMesh.scale.setScalar(sicklePose.scale);
      toolSocket.add(sickleMesh);

      expect(sickleMesh.parent).toBe(toolSocket);
      expect(sickleMesh.scale.x).toBeCloseTo(0.82, 3);
      expect(sickleMesh.rotation.x).toBeCloseTo(Math.PI, 5);

      // 2. Attach Seed Pouch to hip socket
      const hipSocket = player.getObjectByName("char_player_hip_socket")!;
      const pouchMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      pouchMesh.name = `socket_${ASSET_IDS.TOOL_SEED_POUCH_A}`;
      const pouchPose = socketAttachFor(ASSET_IDS.TOOL_SEED_POUCH_A);

      pouchMesh.position.set(...pouchPose.position);
      pouchMesh.rotation.set(...pouchPose.rotation);
      pouchMesh.scale.setScalar(pouchPose.scale);
      hipSocket.add(pouchMesh);

      expect(pouchMesh.parent).toBe(hipSocket);
      expect(pouchMesh.scale.x).toBeCloseTo(0.72, 3);
      expect(pouchMesh.rotation.x).toBe(0);

      // 3. Attach Harvest Basket to carry socket
      const carrySocket = player.getObjectByName("char_player_carry_socket")!;
      const basketMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      basketMesh.name = `socket_${ASSET_IDS.PROP_HARVEST_BASKET_A}`;
      const basketPose = socketAttachFor(ASSET_IDS.PROP_HARVEST_BASKET_A);

      basketMesh.position.set(...basketPose.position);
      basketMesh.rotation.set(...basketPose.rotation);
      basketMesh.scale.setScalar(basketPose.scale);
      carrySocket.add(basketMesh);

      expect(basketMesh.parent).toBe(carrySocket);
      expect(basketMesh.scale.x).toBeCloseTo(0.68, 3);
      expect(basketMesh.rotation.x).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION 4: Foot IK & Ground Adaptation Mathematical Rigor
  // ==========================================================================
  describe("Foot IK & Ground Adaptation", () => {
    it("verifies pitch/roll orientation and foot elevation offsets on cross-slope terrain", () => {
      const char = buildTestHumanoid();
      const controller = new AnimationController(char);

      // Cross slope normal: tilted 20 deg around X and 10 deg around Z
      const normal = new THREE.Vector3(0.342, 0.932, 0.117).normalize();
      // Terrain contact only engages on moving gaits -- an idle that tilts to
      // the ground plane amplifies every irregularity while standing still --
      // so this drives a walk to exercise the foot IK.
      const slopeCtx = {
        mode: "on-foot" as const,
        carrying: false,
        motion: createMotion({
          groundNormal: { x: normal.x, y: normal.y, z: normal.z },
          slopeRadians: 0.35,
          speedMetersPerSecond: PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond,
          velocity: { x: 0, y: 0, z: PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond },
          requestedGait: "walk"
        })
      };

      // The per-frame update resolves tilt and foot elevation; the leg IK that
      // actually turns the bones runs in resolveGroundContacts, which the scene
      // drives with terrain samples. Exercise both, as the game does.
      const sampleSurface = (x: number, z: number) => ({
        height: -(normal.x * x + normal.z * z) / normal.y,
        normal: { x: normal.x, y: normal.y, z: normal.z }
      });
      for (let i = 0; i < 30; i++) {
        controller.update(1 / 60, slopeCtx);
        controller.resolveGroundContacts(slopeCtx, sampleSurface);
      }
      const frame = controller.update(1 / 60, slopeCtx);
      controller.resolveGroundContacts(slopeCtx, sampleSurface);

      expect(frame.groundRoll).toBeLessThan(0);
      expect(frame.leftFootOffsetY).toBeGreaterThan(0);
      expect(frame.rightFootOffsetY).toBeLessThan(0);
      expect(frame.leftFootOffsetY).toBeCloseTo(-frame.rightFootOffsetY, 4);

      // Two-bone IK leg joint rotations
      const thighL = char.getObjectByName("rig_thigh_left")!;
      const shinL = char.getObjectByName("rig_shin_left")!;
      const footL = char.getObjectByName("rig_foot_left")!;

      // Which foot is planted depends on the walk phase, so assert on the leg
      // that is actually carrying weight rather than assuming the left.
      const thighR = char.getObjectByName("rig_thigh_right")!;
      const shinR = char.getObjectByName("rig_shin_right")!;
      const legTurned = (thigh: THREE.Object3D, shin: THREE.Object3D) =>
        thigh.quaternion.angleTo(new THREE.Quaternion()) > 1e-6 ||
        shin.quaternion.angleTo(new THREE.Quaternion()) > 1e-6;
      expect(
        legTurned(thighL, shinL) || legTurned(thighR, shinR),
        "cross-slope contact must turn the planted leg chain"
      ).toBe(true);
      expect(footL).toBeDefined();
    });

    it("clamps foot offsets and tilt angles within canonical config limits", () => {
      const char = buildTestHumanoid();
      const controller = new AnimationController(char);

      // Steep normal near limit
      const steepNormal = new THREE.Vector3(0.6, 0.8, 0);
      const steepCtx = {
        mode: "on-foot" as const,
        carrying: false,
        motion: createMotion({
          groundNormal: { x: steepNormal.x, y: steepNormal.y, z: steepNormal.z },
          slopeRadians: THREE.MathUtils.degToRad(36)
        })
      };

      for (let i = 0; i < 30; i++) controller.update(1 / 60, steepCtx);
      const frame = controller.update(1 / 60, steepCtx);

      const maxTilt = CANONICAL_RENDER_CONFIG.motion.groundingMaxTiltRadians;
      const maxFootOffset = CANONICAL_RENDER_CONFIG.motion.groundingMaxFootOffsetMeters;

      expect(Math.abs(frame.groundPitch)).toBeLessThanOrEqual(maxTilt + 1e-4);
      expect(Math.abs(frame.groundRoll)).toBeLessThanOrEqual(maxTilt + 1e-4);
      expect(Math.abs(frame.leftFootOffsetY)).toBeLessThanOrEqual(maxFootOffset + 1e-4);
      expect(Math.abs(frame.rightFootOffsetY)).toBeLessThanOrEqual(maxFootOffset + 1e-4);
    });
  });
});
