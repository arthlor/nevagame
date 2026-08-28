import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { beforeAll, describe, expect, it } from "vitest";
import { ASSET_BY_ID, ASSET_IDS, type AssetId } from "../../src/render/assets/AssetCatalog";

const ROOT = path.resolve(import.meta.dirname, "../..");

const CHARACTER_ASSET_IDS: AssetId[] = [
  ASSET_IDS.CHAR_PLAYER_A,
  ASSET_IDS.CHAR_NPC_ELSPETH_A,
  ASSET_IDS.CHAR_NPC_BARNABY_A,
  ASSET_IDS.CHAR_NPC_SILAS_A,
  ASSET_IDS.CHAR_NPC_MAEVE_A
];

const REQUIRED_20_HUMANOID_BONES = [
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

const SECONDARY_4_BONES = [
  "rig_hat_brim",
  "rig_backpack",
  "rig_canteen_left",
  "rig_canteen_right"
] as const;

const ALL_24_BONES = [...REQUIRED_20_HUMANOID_BONES, ...SECONDARY_4_BONES] as const;

const EXPECTED_SOCKET_SUFFIXES = [
  "hand_socket_left",
  "hand_socket_right",
  "tool_socket",
  "carry_socket",
  "hip_socket"
] as const;

describe("Milestone 2 Empirical Challenger — Rigging, Skinning & Sockets Adversarial Verification", () => {
  const loadedDocs = new Map<AssetId, Document>();

  beforeAll(async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        "meshopt.decoder": MeshoptDecoder,
        "meshopt.encoder": MeshoptEncoder
      });

    for (const charId of CHARACTER_ASSET_IDS) {
      const spec = ASSET_BY_ID.get(charId)!;
      const glbPath = path.join(ROOT, "public/assets/models", spec.file);
      expect(fs.existsSync(glbPath), `File not found: ${glbPath}`).toBe(true);
      const doc = await io.read(glbPath);
      loadedDocs.set(charId, doc);
    }
  }, 120000);

  // --------------------------------------------------------------------------
  // TEST 1: Skin & Armature Hierarchy Structure
  // --------------------------------------------------------------------------
  it("TC1: All character GLBs contain valid skins with 24 canonical joints, non-singular IBMs, and correct parent tree", () => {
    for (const charId of CHARACTER_ASSET_IDS) {
      const doc = loadedDocs.get(charId)!;
      const root = doc.getRoot();

      const skins = root.listSkins();
      expect(skins.length, `Expected at least 1 skin in ${charId}`).toBeGreaterThan(0);

      // Verify each skin in the glTF binds all 24 bones and has non-singular IBMs
      for (const skin of skins) {
        const joints = skin.listJoints();
        expect(joints.length, `Expected 24 joints in ${charId} skin ${skin.getName()}, found ${joints.length}`).toBe(24);

        const jointNames = new Set(joints.map((j) => j.getName()));
        for (const boneName of ALL_24_BONES) {
          expect(jointNames.has(boneName), `Missing bone ${boneName} in ${charId} skin ${skin.getName()}`).toBe(true);
        }

        // Check Inverse Bind Matrices (IBM)
        const ibmAccessor = skin.getInverseBindMatrices();
        expect(ibmAccessor, `Missing Inverse Bind Matrices accessor in ${charId}`).not.toBeNull();
        expect(ibmAccessor!.getCount()).toBe(joints.length);
        expect(ibmAccessor!.getElementSize()).toBe(16); // 4x4 matrix

        const ibmArray = ibmAccessor!.getArray();
        expect(ibmArray).not.toBeNull();
        expect(ibmArray!.length).toBe(joints.length * 16);

        // Verify each 4x4 matrix has finite numbers and non-zero determinant
        for (let j = 0; j < joints.length; j++) {
          const offset = j * 16;
          const matElements: number[] = [];
          for (let k = 0; k < 16; k++) {
            const val = ibmArray![offset + k];
            expect(Number.isFinite(val), `Non-finite IBM value at joint ${j} element ${k} in ${charId}`).toBe(true);
            matElements.push(val);
          }

          const threeMat = new THREE.Matrix4().fromArray(matElements);
          const det = threeMat.determinant();
          expect(Number.isFinite(det), `Non-finite determinant at joint ${j} (${joints[j].getName()}) in ${charId}`).toBe(true);
          expect(Math.abs(det), `Singular IBM (det == 0) at joint ${j} (${joints[j].getName()}) in ${charId}`).toBeGreaterThan(1e-7);
        }
      }

      // Verify Canonical Bone Hierarchy Tree on node graph
      const nodeMap = new Map(root.listNodes().map((n) => [n.getName(), n]));
      const rigRoot = nodeMap.get("rig_root")!;
      const pelvis = nodeMap.get("rig_pelvis")!;
      const spine = nodeMap.get("rig_spine")!;
      const chest = nodeMap.get("rig_chest")!;
      const neck = nodeMap.get("rig_neck")!;
      const head = nodeMap.get("rig_head")!;
      const backpack = nodeMap.get("rig_backpack")!;
      const hatBrim = nodeMap.get("rig_hat_brim")!;

      expect(pelvis.getParentNode()).toBe(rigRoot);
      expect(spine.getParentNode()).toBe(pelvis);
      expect(chest.getParentNode()).toBe(spine);
      expect(neck.getParentNode()).toBe(chest);
      expect(head.getParentNode()).toBe(neck);
      expect(hatBrim.getParentNode()).toBe(head);
      expect(backpack.getParentNode()).toBe(spine);

      for (const side of ["left", "right"]) {
        const clavicle = nodeMap.get(`rig_clavicle_${side}`)!;
        const upperArm = nodeMap.get(`rig_upper_arm_${side}`)!;
        const forearm = nodeMap.get(`rig_forearm_${side}`)!;
        const hand = nodeMap.get(`rig_hand_${side}`)!;
        const thigh = nodeMap.get(`rig_thigh_${side}`)!;
        const shin = nodeMap.get(`rig_shin_${side}`)!;
        const foot = nodeMap.get(`rig_foot_${side}`)!;
        const canteen = nodeMap.get(`rig_canteen_${side}`)!;

        expect(clavicle.getParentNode()).toBe(chest);
        expect(upperArm.getParentNode()).toBe(clavicle);
        expect(forearm.getParentNode()).toBe(upperArm);
        expect(hand.getParentNode()).toBe(forearm);
        expect(thigh.getParentNode()).toBe(pelvis);
        expect(shin.getParentNode()).toBe(thigh);
        expect(foot.getParentNode()).toBe(shin);
        expect(canteen.getParentNode()).toBe(backpack);
      }
    }
  });

  // --------------------------------------------------------------------------
  // TEST 2: Mathematical Rigor of Skin Weights & Influences
  // --------------------------------------------------------------------------
  it("TC2: Every vertex across all LOD0 and LOD1 primitives satisfies strict partition of unity, <= 4 influences, and no NaN/Inf", () => {
    for (const charId of CHARACTER_ASSET_IDS) {
      const doc = loadedDocs.get(charId)!;
      const root = doc.getRoot();
      const skin = root.listSkins()[0];
      const joints = skin.listJoints();

      let totalVerticesTested = 0;
      let totalPrimitivesTested = 0;

      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          const weightsAttr = prim.getAttribute("WEIGHTS_0");
          const jointsAttr = prim.getAttribute("JOINTS_0");
          const posAttr = prim.getAttribute("POSITION");

          // Both skinning attributes must be present on character primitives
          expect(weightsAttr, `Mesh ${mesh.getName()} primitive missing WEIGHTS_0 in ${charId}`).not.toBeNull();
          expect(jointsAttr, `Mesh ${mesh.getName()} primitive missing JOINTS_0 in ${charId}`).not.toBeNull();
          expect(posAttr, `Mesh ${mesh.getName()} primitive missing POSITION in ${charId}`).not.toBeNull();

          const vertexCount = posAttr!.getCount();
          expect(weightsAttr!.getCount()).toBe(vertexCount);
          expect(jointsAttr!.getCount()).toBe(vertexCount);
          expect(weightsAttr!.getElementSize()).toBe(4);
          expect(jointsAttr!.getElementSize()).toBe(4);

          const weightsArray = weightsAttr!.getArray()!;
          const jointsArray = jointsAttr!.getArray()!;
          const posArray = posAttr!.getArray()!;

          const weightComponentType = weightsAttr!.getComponentType();
          const weightNormalized = weightsAttr!.getNormalized();
          const weightDivisor = weightComponentType === 5121 ? 255 : weightComponentType === 5123 ? 65535 : 1.0;

          for (let v = 0; v < vertexCount; v++) {
            const vOffset = v * 4;
            let sumWeight = 0;
            let nonZeroCount = 0;

            for (let i = 0; i < 4; i++) {
              const rawWeight = weightsArray[vOffset + i];
              const jointIndex = jointsArray[vOffset + i];

              expect(Number.isFinite(rawWeight), `Non-finite raw weight at vertex ${v} in ${mesh.getName()} (${charId})`).toBe(true);
              expect(Number.isInteger(jointIndex), `Non-integer joint index at vertex ${v} in ${mesh.getName()} (${charId})`).toBe(true);

              const normalizedWeight = weightNormalized || weightComponentType !== 5126 ? rawWeight / weightDivisor : rawWeight;

              expect(normalizedWeight).toBeGreaterThanOrEqual(0.0);
              expect(normalizedWeight).toBeLessThanOrEqual(1.0 + 1e-4);

              if (normalizedWeight > 0.0001) {
                nonZeroCount++;
                expect(jointIndex).toBeGreaterThanOrEqual(0);
                expect(jointIndex).toBeLessThan(joints.length);
              }

              sumWeight += normalizedWeight;
            }

            expect(nonZeroCount).toBeLessThanOrEqual(4);
            expect(nonZeroCount).toBeGreaterThan(0);
            expect(sumWeight).toBeCloseTo(1.0, 3);

            // Bounding box vertex coordinate sanity
            const pOffset = v * 3;
            const px = posArray[pOffset];
            const py = posArray[pOffset + 1];
            const pz = posArray[pOffset + 2];
            expect(Number.isFinite(px)).toBe(true);
            expect(Number.isFinite(py)).toBe(true);
            expect(Number.isFinite(pz)).toBe(true);

            totalVerticesTested++;
          }
          totalPrimitivesTested++;
        }
      }

      expect(totalPrimitivesTested).toBeGreaterThanOrEqual(2);
      expect(totalVerticesTested).toBeGreaterThan(1500);
    }
  }, 60000);

  // --------------------------------------------------------------------------
  // TEST 3: Bone Influence Coverage Across Skeletal Regions
  // --------------------------------------------------------------------------
  it("TC3: Skeletal bone influences actively bind across all anatomical regions (head, torso, arms, legs)", () => {
    for (const charId of CHARACTER_ASSET_IDS) {
      const doc = loadedDocs.get(charId)!;
      const root = doc.getRoot();
      const skin = root.listSkins()[0];
      const joints = skin.listJoints();
      const jointNames = joints.map((j) => j.getName());

      const activeBones = new Set<string>();

      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          const weightsAttr = prim.getAttribute("WEIGHTS_0")!;
          const jointsAttr = prim.getAttribute("JOINTS_0")!;

          const vertexCount = weightsAttr.getCount();
          const weightsArray = weightsAttr.getArray()!;
          const jointsArray = jointsAttr.getArray()!;

          const weightComponentType = weightsAttr.getComponentType();
          const weightNormalized = weightsAttr.getNormalized();
          const weightDivisor = weightComponentType === 5121 ? 255 : weightComponentType === 5123 ? 65535 : 1.0;

          for (let v = 0; v < vertexCount; v++) {
            for (let i = 0; i < 4; i++) {
              const rawWeight = weightsArray[v * 4 + i];
              const normalizedWeight = weightNormalized || weightComponentType !== 5126 ? rawWeight / weightDivisor : rawWeight;
              if (normalizedWeight > 0.05) {
                const jointIdx = jointsArray[v * 4 + i];
                activeBones.add(jointNames[jointIdx]);
              }
            }
          }
        }
      }

      // Essential anatomical bones that MUST have vertex influences
      const essentialBones = [
        "rig_head",
        "rig_neck",
        "rig_chest",
        "rig_spine",
        "rig_pelvis",
        "rig_upper_arm_left",
        "rig_upper_arm_right",
        "rig_forearm_left",
        "rig_forearm_right",
        "rig_hand_left",
        "rig_hand_right",
        "rig_thigh_left",
        "rig_thigh_right",
        "rig_shin_left",
        "rig_shin_right",
        "rig_foot_left",
        "rig_foot_right"
      ];

      for (const bone of essentialBones) {
        expect(activeBones.has(bone), `Essential bone ${bone} has 0 vertex influences in ${charId}`).toBe(true);
      }
    }
  });

  // --------------------------------------------------------------------------
  // TEST 4: Socket Node Hierarchy & Matrix Transformations
  // --------------------------------------------------------------------------
  it("TC4: All 5 sockets are present, properly parented to bones, and transform synchronously under skeletal rotations", () => {
    for (const charId of CHARACTER_ASSET_IDS) {
      const spec = ASSET_BY_ID.get(charId)!;
      const doc = loadedDocs.get(charId)!;
      const root = doc.getRoot();

      const prefix = charId === ASSET_IDS.CHAR_PLAYER_A ? "char_player" : charId;
      const nodeMap = new Map(root.listNodes().map((n) => [n.getName(), n]));

      // 1. Verify socket nodes exist
      for (const suffix of EXPECTED_SOCKET_SUFFIXES) {
        const socketName = `${prefix}_${suffix}`;
        const socketNode = nodeMap.get(socketName);
        expect(socketNode, `Missing socket ${socketName} in ${charId}`).toBeDefined();

        // 2. Verify bone parenting in glTF node graph
        const parentNode = socketNode!.getParentNode();
        expect(parentNode, `Socket ${socketName} has no parent in ${charId}`).not.toBeNull();

        if (suffix === "hand_socket_left") {
          expect(parentNode!.getName()).toBe("rig_hand_left");
        } else if (suffix === "hand_socket_right" || suffix === "tool_socket") {
          expect(parentNode!.getName()).toBe("rig_hand_right");
        } else if (suffix === "carry_socket") {
          expect(parentNode!.getName()).toBe("rig_spine");
        } else if (suffix === "hip_socket") {
          expect(parentNode!.getName()).toBe("rig_pelvis");
        }
      }

      // 3. Three.js Matrix Transformation Simulation
      // Build Three.js node hierarchy for this character
      const sceneRoot = new THREE.Group();
      const threeNodes = new Map<string, THREE.Object3D>();

      for (const node of root.listNodes()) {
        const obj = node.getName().startsWith("rig_") ? new THREE.Bone() : new THREE.Group();
        obj.name = node.getName();
        const trans = node.getTranslation();
        const rot = node.getRotation();
        const scale = node.getScale();
        obj.position.set(trans[0], trans[1], trans[2]);
        obj.quaternion.set(rot[0], rot[1], rot[2], rot[3]);
        obj.scale.set(scale[0], scale[1], scale[2]);
        threeNodes.set(node.getName(), obj);
      }

      // Connect parent-child
      for (const node of root.listNodes()) {
        const obj = threeNodes.get(node.getName())!;
        for (const child of node.listChildren()) {
          const childObj = threeNodes.get(child.getName());
          if (childObj) {
            obj.add(childObj);
          }
        }
      }

      const rootNodeObj = threeNodes.get(spec.rootNode) || threeNodes.get(`${charId}_root`);
      if (rootNodeObj) {
        sceneRoot.add(rootNodeObj);
      }

      sceneRoot.updateMatrixWorld(true);

      const toolSocket = threeNodes.get(`${prefix}_tool_socket`)!;
      const carrySocket = threeNodes.get(`${prefix}_carry_socket`)!;
      const hipSocket = threeNodes.get(`${prefix}_hip_socket`)!;
      const handRight = threeNodes.get("rig_hand_right")!;
      const spine = threeNodes.get("rig_spine")!;
      const pelvis = threeNodes.get("rig_pelvis")!;

      expect(toolSocket).toBeDefined();
      expect(carrySocket).toBeDefined();
      expect(hipSocket).toBeDefined();

      const initialToolPos = new THREE.Vector3().setFromMatrixPosition(toolSocket.matrixWorld);
      const initialCarryPos = new THREE.Vector3().setFromMatrixPosition(carrySocket.matrixWorld);
      const initialHipPos = new THREE.Vector3().setFromMatrixPosition(hipSocket.matrixWorld);

      // Apply rotation to hand bone
      handRight.rotateX(Math.PI / 4);
      handRight.rotateZ(Math.PI / 3);
      sceneRoot.updateMatrixWorld(true);

      const rotatedToolPos = new THREE.Vector3().setFromMatrixPosition(toolSocket.matrixWorld);
      expect(rotatedToolPos.distanceTo(initialToolPos)).toBeGreaterThan(0.01);

      // Apply rotation to spine
      spine.rotateX(Math.PI / 6);
      sceneRoot.updateMatrixWorld(true);

      const rotatedCarryPos = new THREE.Vector3().setFromMatrixPosition(carrySocket.matrixWorld);
      expect(rotatedCarryPos.distanceTo(initialCarryPos)).toBeGreaterThan(0.01);

      // Apply rotation to pelvis
      pelvis.rotateY(Math.PI / 4);
      sceneRoot.updateMatrixWorld(true);

      const rotatedHipPos = new THREE.Vector3().setFromMatrixPosition(hipSocket.matrixWorld);
      expect(rotatedHipPos.distanceTo(initialHipPos)).toBeGreaterThan(0.01);
    }
  });

  // --------------------------------------------------------------------------
  // TEST 5: Action Clips & Animation Data Integrity
  // --------------------------------------------------------------------------
  it("TC5: Animation clips articulate required joints with valid keyframe times and finite transform values", () => {
    for (const charId of CHARACTER_ASSET_IDS) {
      const spec = ASSET_BY_ID.get(charId)!;
      const doc = loadedDocs.get(charId)!;
      const root = doc.getRoot();

      const animations = root.listAnimations();
      const expectedClips = [
        ...(spec.animationClips || []),
        ...(spec.additionalAnimationClips || [])
      ];
      const expectedCount = expectedClips.length;
      expect(animations.length, `Expected ${expectedCount} animations in ${charId}, found ${animations.length}`).toBe(expectedCount);

      const clipNames = new Set(animations.map((a) => a.getName()));
      for (const specClip of expectedClips) {
        expect(clipNames.has(specClip.name), `Missing animation clip ${specClip.name} in ${charId}`).toBe(true);
      }

      for (const anim of animations) {
        const channels = anim.listChannels();
        expect(channels.length, `Animation ${anim.getName()} has 0 channels in ${charId}`).toBeGreaterThan(0);

        const targetNodeNames = new Set<string>();
        for (const channel of channels) {
          const targetNode = channel.getTargetNode();
          expect(targetNode, `Channel in ${anim.getName()} has null target node`).not.toBeNull();
          if (targetNode) {
            targetNodeNames.add(targetNode.getName());
          }

          const sampler = channel.getSampler();
          expect(sampler, `Channel in ${anim.getName()} has null sampler`).not.toBeNull();

          const input = sampler!.getInput(); // Timestamps
          const output = sampler!.getOutput(); // Values

          expect(input, `Sampler input missing in ${anim.getName()}`).not.toBeNull();
          expect(output, `Sampler output missing in ${anim.getName()}`).not.toBeNull();

          const times = input!.getArray()!;
          const values = output!.getArray()!;

          expect(times.length).toBeGreaterThan(0);
          expect(values.length).toBeGreaterThan(0);

          // Verify monotonicity of keyframe timestamps
          for (let t = 0; t < times.length; t++) {
            expect(Number.isFinite(times[t])).toBe(true);
            if (t > 0) {
              expect(times[t]).toBeGreaterThanOrEqual(times[t - 1]);
            }
          }

          // Verify finite values
          for (let v = 0; v < values.length; v++) {
            expect(Number.isFinite(values[v]), `Non-finite keyframe value in ${anim.getName()} channel`).toBe(true);
          }
        }

        // Active clips should articulate multiple bones
        if (anim.getName() === "walk" || anim.getName() === "idle") {
          expect(targetNodeNames.size).toBeGreaterThanOrEqual(5);
        }
      }
    }
  });
});
