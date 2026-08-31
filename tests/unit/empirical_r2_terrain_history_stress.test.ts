import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  TerrainSnappingSystem,
  calculateSlopeDegrees,
  isSlopeAcceptable,
  alignNormalToSurface
} from "../../src/layout-editor/TerrainSnapping";
import {
  HistoryManager,
  type IEditorCommand,
  type EditorPoseState
} from "../../src/layout-editor/history/HistoryManager";

describe("Empirical Challenge: TerrainSnapping & HistoryManager (M2 / R2)", () => {
  // =========================================================================
  // 1. Terrain Snapping & Geometric Edge Cases
  // =========================================================================
  describe("Terrain Geometry & Raycasting Stress", () => {
    it("snaps correctly on multi-elevation stepped mesh (upper vs lower plateaus)", () => {
      // Build a stepped geometry:
      // Left side (x < 0): elevation y = 10
      // Right side (x >= 0): elevation y = 30
      const geometry = new THREE.PlaneGeometry(100, 100, 10, 10);
      geometry.rotateX(-Math.PI / 2);
      const pos = geometry.attributes.position!;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setY(i, x >= 0 ? 30.0 : 10.0);
      }
      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      mesh.updateMatrixWorld(true);

      const snapper = new TerrainSnappingSystem();
      snapper.registerTerrain(mesh);

      // Snap on right plateau (x = 20, z = 0)
      const hitRight = snapper.snapToSurface(20, 0);
      expect(hitRight.source).toBe("bvh");
      expect(hitRight.point.y).toBeCloseTo(30.0, 1);

      // Snap on left plateau (x = -20, z = 0)
      const hitLeft = snapper.snapToSurface(0 - 20, 0);
      expect(hitLeft.source).toBe("bvh");
      expect(hitLeft.point.y).toBeCloseTo(10.0, 1);
    });

    it("handles multi-layer / overlapping geometry by returning top-most surface (firstHitOnly)", () => {
      // Build a compound geometry with a lower floor at y=5 and an upper roof at y=25
      const lower = new THREE.PlaneGeometry(40, 40, 2, 2);
      lower.rotateX(-Math.PI / 2);
      const lowerPos = lower.attributes.position!;
      for (let i = 0; i < lowerPos.count; i++) lowerPos.setY(i, 5.0);

      const upper = new THREE.PlaneGeometry(40, 40, 2, 2);
      upper.rotateX(-Math.PI / 2);
      const upperPos = upper.attributes.position!;
      for (let i = 0; i < upperPos.count; i++) upperPos.setY(i, 25.0);

      // Group them into a single parent mesh or merged geometry
      // Let's test a merged geometry
      const mergedGeom = new THREE.BufferGeometry();
      const posArray = new Float32Array(lowerPos.array.length + upperPos.array.length);
      posArray.set(lowerPos.array, 0);
      posArray.set(upperPos.array, lowerPos.array.length);
      mergedGeom.setAttribute("position", new THREE.BufferAttribute(posArray, 3));

      // Recreate indices for both quads
      const lowerIndices = lower.getIndex()?.array || [];
      const upperIndices = upper.getIndex()?.array || [];
      const vertexOffset = lowerPos.count;
      const combinedIndices = new Uint32Array(lowerIndices.length + upperIndices.length);
      combinedIndices.set(lowerIndices, 0);
      for (let i = 0; i < upperIndices.length; i++) {
        combinedIndices[lowerIndices.length + i] = upperIndices[i] + vertexOffset;
      }
      mergedGeom.setIndex(new THREE.BufferAttribute(combinedIndices, 1));
      mergedGeom.computeVertexNormals();

      const mesh = new THREE.Mesh(mergedGeom, new THREE.MeshBasicMaterial());
      mesh.updateMatrixWorld(true);

      const snapper = new TerrainSnappingSystem();
      snapper.registerTerrain(mesh);

      // Raycast from above: should hit upper roof at y = 25
      const hit = snapper.snapToSurface(0, 0);
      expect(hit.source).toBe("bvh");
      expect(hit.point.y).toBeCloseTo(25.0, 1);
    });

    it("correctly handles scaled, rotated, and translated terrain meshes via NormalMatrix and MatrixWorld", () => {
      const geometry = new THREE.PlaneGeometry(50, 50, 4, 4);
      geometry.rotateX(-Math.PI / 2);
      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      // Translate mesh to (100, 20, -50), scale by (2, 1, 2), tilt by 30 deg on X axis
      mesh.position.set(100, 20, -50);
      mesh.scale.set(2, 1, 2);
      mesh.rotation.x = Math.PI / 6; // 30 deg pitch
      mesh.updateMatrixWorld(true);

      const snapper = new TerrainSnappingSystem();
      snapper.registerTerrain(mesh);

      // Center of plane in local space is (0,0,0) -> world position is (100, 20, -50)
      const hit = snapper.snapToSurface(100, -50);
      expect(hit.source).toBe("bvh");
      expect(hit.point.x).toBeCloseTo(100, 1);
      expect(hit.point.z).toBeCloseTo(-50, 1);
      expect(hit.point.y).toBeCloseTo(20, 1);

      // World normal should reflect the 30 deg tilt on X axis: normal = (0, cos(30), -sin(30))
      expect(hit.worldNormal.x).toBeCloseTo(0, 2);
      expect(hit.worldNormal.y).toBeCloseTo(Math.cos(Math.PI / 6), 2); // ~0.866
      expect(hit.worldNormal.z).toBeCloseTo(Math.sin(Math.PI / 6), 2); // ~+0.500
      expect(hit.slopeDegrees).toBeCloseTo(30.0, 1);
    });

    it("applies yOffset cleanly to contact point", () => {
      const geometry = new THREE.PlaneGeometry(10, 10);
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      mesh.position.set(0, 5, 0);
      mesh.updateMatrixWorld(true);

      const snapper = new TerrainSnappingSystem();
      snapper.registerTerrain(mesh);

      const hit = snapper.snapToSurface(0, 0, { yOffset: 1.75 });
      expect(hit.point.y).toBeCloseTo(6.75, 2);
    });
  });

  // =========================================================================
  // 2. Slope Calculations & Boundary Rejection
  // =========================================================================
  describe("Slope Angle Calculation & Boundary Rejection", () => {
    it("evaluates slope angles across complete range from 0° to 180°", () => {
      // 0 degrees (flat horizontal floor)
      expect(calculateSlopeDegrees(new THREE.Vector3(0, 1, 0))).toBeCloseTo(0, 4);

      // 30 degrees
      const n30 = new THREE.Vector3(Math.sin(Math.PI / 6), Math.cos(Math.PI / 6), 0);
      expect(calculateSlopeDegrees(n30)).toBeCloseTo(30.0, 4);

      // 45 degrees
      const n45 = new THREE.Vector3(1, 1, 0).normalize();
      expect(calculateSlopeDegrees(n45)).toBeCloseTo(45.0, 4);

      // 60 degrees
      const n60 = new THREE.Vector3(Math.sin(Math.PI / 3), Math.cos(Math.PI / 3), 0);
      expect(calculateSlopeDegrees(n60)).toBeCloseTo(60.0, 4);

      // 89.9 degrees (nearly vertical cliff)
      const rad899 = (89.9 * Math.PI) / 180;
      const n899 = new THREE.Vector3(Math.sin(rad899), Math.cos(rad899), 0);
      expect(calculateSlopeDegrees(n899)).toBeCloseTo(89.9, 2);

      // 90 degrees (vertical cliff / wall)
      expect(calculateSlopeDegrees(new THREE.Vector3(1, 0, 0))).toBeCloseTo(90.0, 4);
      expect(calculateSlopeDegrees(new THREE.Vector3(0, 0, -1))).toBeCloseTo(90.0, 4);

      // 135 degrees (steep overhang)
      const n135 = new THREE.Vector3(1, -1, 0).normalize();
      expect(calculateSlopeDegrees(n135)).toBeCloseTo(135.0, 4);

      // 180 degrees (inverted ceiling pointing straight down)
      expect(calculateSlopeDegrees(new THREE.Vector3(0, -1, 0))).toBeCloseTo(180.0, 4);
    });

    it("handles zero vector and unnormalized vectors safely", () => {
      // Unnormalized vector (e.g. magnitude 100)
      const unnormalized = new THREE.Vector3(0, 50, 0);
      expect(calculateSlopeDegrees(unnormalized)).toBeCloseTo(0, 4);

      // Zero vector (should not crash or return NaN)
      const zero = new THREE.Vector3(0, 0, 0);
      const slopeZero = calculateSlopeDegrees(zero);
      expect(Number.isNaN(slopeZero)).toBe(false);
      expect(slopeZero).toBeCloseTo(90.0, 2); // clampedY = 0 -> 90 deg
    });

    it("tests strict slope rejection threshold boundaries", () => {
      const threshold = 40.0;

      // 39.99° -> acceptable
      const rad3999 = (39.99 * Math.PI) / 180;
      const n3999 = new THREE.Vector3(Math.sin(rad3999), Math.cos(rad3999), 0);
      expect(isSlopeAcceptable(n3999, threshold)).toBe(true);

      // 40.00° -> acceptable (<= threshold)
      const rad4000 = (40.0 * Math.PI) / 180;
      const n4000 = new THREE.Vector3(Math.sin(rad4000), Math.cos(rad4000), 0);
      expect(isSlopeAcceptable(n4000, threshold)).toBe(true);

      // 40.01° -> unacceptable
      const rad4001 = (40.01 * Math.PI) / 180;
      const n4001 = new THREE.Vector3(Math.sin(rad4001), Math.cos(rad4001), 0);
      expect(isSlopeAcceptable(n4001, threshold)).toBe(false);

      // Overhang / ceiling (180°) -> rejected under normal threshold
      const inverted = new THREE.Vector3(0, -1, 0);
      expect(isSlopeAcceptable(inverted, threshold)).toBe(false);
    });
  });

  // =========================================================================
  // 3. Normal Alignment & Yaw Preservation
  // =========================================================================
  describe("Normal Alignment & Heading Preservation", () => {
    it("preserves yaw orientation when aligning object to sloped surface", () => {
      const yawsToTest = [
        0,
        Math.PI / 6, // 30 deg
        Math.PI / 4, // 45 deg
        Math.PI / 2, // 90 deg
        (3 * Math.PI) / 4, // 135 deg
        Math.PI, // 180 deg
        -Math.PI / 3 // -60 deg
      ];

      // Tilted surface: 30 deg slope in X direction
      const slopeNormal = new THREE.Vector3(
        Math.sin(Math.PI / 6),
        Math.cos(Math.PI / 6),
        0
      ).normalize();

      for (const initialYaw of yawsToTest) {
        const obj = new THREE.Object3D();
        obj.rotation.y = initialYaw;

        alignNormalToSurface(obj, slopeNormal, true);

        // 1. Transformed up vector MUST equal slopeNormal
        const transformedUp = new THREE.Vector3(0, 1, 0).applyQuaternion(obj.quaternion);
        expect(transformedUp.x).toBeCloseTo(slopeNormal.x, 3);
        expect(transformedUp.y).toBeCloseTo(slopeNormal.y, 3);
        expect(transformedUp.z).toBeCloseTo(slopeNormal.z, 3);

        // 2. Transformed forward vector (0, 0, 1) projected onto horizontal plane should maintain heading relative to yaw
        // In local frame before alignment: forward = (sin(yaw), 0, cos(yaw))
        // Aligning (0,1,0) to slopeNormal tilts around Z axis by -30 deg
        // Forward vector's Z component should match cos(yaw)
        const transformedForward = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion);
        expect(transformedForward.z).toBeCloseTo(Math.cos(initialYaw), 2);
      }
    });

    it("resets quaternion when preserveYaw is false and normal is flat", () => {
      const obj = new THREE.Object3D();
      obj.rotation.set(0.5, 1.2, 0.3);

      alignNormalToSurface(obj, new THREE.Vector3(0, 1, 0), false);
      expect(obj.quaternion.x).toBeCloseTo(0, 5);
      expect(obj.quaternion.y).toBeCloseTo(0, 5);
      expect(obj.quaternion.z).toBeCloseTo(0, 5);
      expect(obj.quaternion.w).toBeCloseTo(1, 5);
    });

    it("leaves yaw intact when normal is flat and preserveYaw is true", () => {
      const obj = new THREE.Object3D();
      obj.rotation.y = 1.234;

      alignNormalToSurface(obj, new THREE.Vector3(0, 1, 0), true);
      expect(obj.rotation.y).toBeCloseTo(1.234, 4);
    });
  });

  // =========================================================================
  // 4. HistoryManager Deep Undo/Redo & Stress Tests
  // =========================================================================
  describe("HistoryManager Deep Undo/Redo & Pruning Stress", () => {
    it("handles 100 sequential commands with maxDepth=30 without memory leak or desync", async () => {
      const maxDepth = 30;
      const history = new HistoryManager(maxDepth);
      let count = 0;

      for (let i = 1; i <= 100; i++) {
        await history.execute({
          description: `Increment to ${i}`,
          execute: () => { count++; },
          undo: () => { count--; }
        });
      }

      expect(count).toBe(100);
      expect(history.getUndoStackSize()).toBe(maxDepth); // strictly capped at 30
      expect(history.getRedoStackSize()).toBe(0);

      // Undo all 30 available steps
      for (let step = 0; step < maxDepth; step++) {
        expect(history.canUndo()).toBe(true);
        const ok = await history.undo();
        expect(ok).toBe(true);
      }

      expect(count).toBe(70); // 100 - 30 = 70
      expect(history.canUndo()).toBe(false);
      expect(history.getUndoStackSize()).toBe(0);
      expect(history.getRedoStackSize()).toBe(maxDepth);

      // Redo all 30 steps
      for (let step = 0; step < maxDepth; step++) {
        expect(history.canRedo()).toBe(true);
        const ok = await history.redo();
        expect(ok).toBe(true);
      }

      expect(count).toBe(100);
      expect(history.canRedo()).toBe(false);
      expect(history.getUndoStackSize()).toBe(maxDepth);
      expect(history.getRedoStackSize()).toBe(0);
    });

    it("survives 500-step randomized stress walk of execute/undo/redo", async () => {
      const history = new HistoryManager(50);
      let _simState = 0;

      let valCounter = 1;

      for (let step = 0; step < 500; step++) {
        const rand = (step * 37 + 13) % 100; // Deterministic pseudo-random sequence

        if (rand < 50) {
          // 50% execute new command
          const val = valCounter++;
          await history.execute({
            description: `Add ${val}`,
            execute: () => { _simState += val; },
            undo: () => { _simState -= val; }
          });
        } else if (rand < 80) {
          // 30% undo
          if (history.canUndo()) {
            await history.undo();
          }
        } else {
          // 20% redo
          if (history.canRedo()) {
            await history.redo();
          }
        }

        // Check invariants at every step
        expect(history.getUndoStackSize()).toBeLessThanOrEqual(50);
        expect(history.canUndo()).toBe(history.getUndoStackSize() > 0);
        expect(history.canRedo()).toBe(history.getRedoStackSize() > 0);
      }
    });

    it("correctly handles dirty state across deep undo and redo operations", async () => {
      const history = new HistoryManager(50);
      let state = 0;

      await history.execute({
        description: "Op 1",
        execute: () => { state = 1; },
        undo: () => { state = 0; }
      });
      await history.execute({
        description: "Op 2",
        execute: () => { state = 2; },
        undo: () => { state = 1; }
      });

      // Mark clean at Op 2 (undoStack length = 2)
      history.markClean();
      expect(history.isDirty()).toBe(false);

      // Execute Op 3
      await history.execute({
        description: "Op 3",
        execute: () => { state = 3; },
        undo: () => { state = 2; }
      });
      expect(history.isDirty()).toBe(true);

      // Undo Op 3 -> should return to clean state!
      await history.undo();
      expect(state).toBe(2);
      expect(history.isDirty()).toBe(false);

      // Undo Op 2 -> dirty again
      await history.undo();
      expect(state).toBe(1);
      expect(history.isDirty()).toBe(true);

      // Redo back to Op 2 -> clean again!
      await history.redo();
      expect(state).toBe(2);
      expect(history.isDirty()).toBe(false);
    });
  });

  // =========================================================================
  // 5. Drag Coalescing Edge Cases
  // =========================================================================
  describe("Drag Coalescing Boundary & Multi-Target Cases", () => {
    it("handles multiple concurrent target drag sessions independently", async () => {
      const history = new HistoryManager();
      const poses: Record<string, EditorPoseState> = {
        item_A: { x: 0, z: 0, rotationY: 0 },
        item_B: { x: 10, z: 10, rotationY: 1 }
      };

      // Start drag on A and B
      history.beginDrag("item_A", poses.item_A!);
      history.beginDrag("item_B", poses.item_B!);

      // End drag on A first
      const finalA: EditorPoseState = { x: 5, z: 5, rotationY: 0 };
      const emittedA = await history.endDrag("item_A", finalA, (p) => {
        poses.item_A = { ...p };
      });
      expect(emittedA).toBe(true);
      expect(poses.item_A).toEqual(finalA);

      // End drag on B second
      const finalB: EditorPoseState = { x: 20, z: 20, rotationY: 2 };
      const emittedB = await history.endDrag("item_B", finalB, (p) => {
        poses.item_B = { ...p };
      });
      expect(emittedB).toBe(true);
      expect(poses.item_B).toEqual(finalB);

      expect(history.getUndoStackSize()).toBe(2);

      // Undo B
      await history.undo();
      expect(poses.item_B).toEqual({ x: 10, z: 10, rotationY: 1 });
      expect(poses.item_A).toEqual(finalA);

      // Undo A
      await history.undo();
      expect(poses.item_A).toEqual({ x: 0, z: 0, rotationY: 0 });
    });

    it("coalesces drag with vertical elevation changes (y coordinate)", async () => {
      const history = new HistoryManager();
      let currentPose: EditorPoseState = { x: 0, y: 1.0, z: 0, rotationY: 0 };

      history.beginDrag("cliff_wagon", currentPose);

      const finalPose: EditorPoseState = { x: 0, y: 15.5, z: 0, rotationY: 0 };
      const emitted = await history.endDrag("cliff_wagon", finalPose, (p) => {
        currentPose = { ...p };
      });

      expect(emitted).toBe(true);
      expect(currentPose.y).toBe(15.5);

      await history.undo();
      expect(currentPose.y).toBe(1.0);
    });

    it("gracefully ignores endDrag on unregistered target ID", async () => {
      const history = new HistoryManager();
      const emitted = await history.endDrag(
        "unknown_target",
        { x: 10, z: 10, rotationY: 0 },
        () => {}
      );
      expect(emitted).toBe(false);
      expect(history.getUndoStackSize()).toBe(0);
    });
  });

  // =========================================================================
  // 6. Transaction Rollback & Error Recovery
  // =========================================================================
  describe("Transaction Rollback & Execution Failure Recovery", () => {
    it("recovers and unwinds partially executed commands if a command fails inside a transaction", async () => {
      const history = new HistoryManager();
      const log: string[] = [];

      history.beginTransaction("Failed Batch");

      await history.execute({
        description: "Step 1",
        execute: () => { log.push("step1-exec"); },
        undo: () => { log.push("step1-undo"); }
      });

      await history.execute({
        description: "Step 2",
        execute: () => { log.push("step2-exec"); },
        undo: () => { log.push("step2-undo"); }
      });

      expect(log).toEqual(["step1-exec", "step2-exec"]);

      // Simulate failure on Step 3: client catches error and invokes rollbackTransaction()
      try {
        await history.execute({
          description: "Step 3 (fails)",
          execute: () => {
            throw new Error("Validation failed on step 3");
          },
          undo: () => {}
        });
      } catch {
        // Rollback
        await history.rollbackTransaction();
      }

      // Step 2 and Step 1 must have been undone in reverse order
      expect(log).toEqual(["step1-exec", "step2-exec", "step2-undo", "step1-undo"]);
      expect(history.getUndoStackSize()).toBe(0);
      expect(history.isTransactionActive()).toBe(false);
    });

    it("prevents nested transaction collision with explicit error", () => {
      const history = new HistoryManager();
      history.beginTransaction("Tx1");
      expect(() => history.beginTransaction("Tx2")).toThrow(/already in progress/);
    });

    it("handles empty transaction commit without polluting history", async () => {
      const history = new HistoryManager();
      history.beginTransaction("Empty Tx");
      await history.commitTransaction();
      expect(history.getUndoStackSize()).toBe(0);
      expect(history.canUndo()).toBe(false);
    });

    it("unwraps single-command transaction directly into undoStack", async () => {
      const history = new HistoryManager();
      history.beginTransaction("Single Tx");
      await history.execute({
        description: "Only Command",
        execute: () => {},
        undo: () => {}
      });
      await history.commitTransaction();
      expect(history.getUndoStackSize()).toBe(1);
      expect(history.getUndoDescriptions()[0]).toBe("Only Command");
    });
  });

  // =========================================================================
  // 7. Advanced Re-entrancy, Listener Resilience, & MaxDepth Boundary
  // =========================================================================
  describe("Advanced Edge Conditions & Invariant Integrity", () => {
    it("handles maxDepth = 1 boundary strictly", async () => {
      const history = new HistoryManager(1);
      let val = 0;

      await history.execute({
        description: "Set 1",
        execute: () => { val = 1; },
        undo: () => { val = 0; }
      });
      expect(history.getUndoStackSize()).toBe(1);

      await history.execute({
        description: "Set 2",
        execute: () => { val = 2; },
        undo: () => { val = 1; }
      });
      expect(history.getUndoStackSize()).toBe(1);
      expect(history.getUndoDescriptions()[0]).toBe("Set 2");

      // Undo once takes us from 2 to 1
      await history.undo();
      expect(val).toBe(1);
      expect(history.canUndo()).toBe(false);

      // Redo takes us from 1 to 2
      await history.redo();
      expect(val).toBe(2);
    });

    it("prevents re-entrant execute calls while a command is actively executing", async () => {
      const history = new HistoryManager();
      let secondaryExecuted = false;

      const reentrantCommand: IEditorCommand = {
        description: "Outer Command",
        execute: async () => {
          // Attempt to call execute re-entrantly
          await history.execute({
            description: "Inner Command",
            execute: () => { secondaryExecuted = true; },
            undo: () => {}
          });
        },
        undo: () => {}
      };

      await history.execute(reentrantCommand);
      expect(secondaryExecuted).toBe(false); // Re-entrant execute rejected by isExecuting guard
      expect(history.getUndoStackSize()).toBe(1);
      expect(history.getUndoDescriptions()[0]).toBe("Outer Command");
    });

    it("survives throwing dirty change listeners without crashing or breaking state", async () => {
      const history = new HistoryManager();
      const faultyListener = vi.fn().mockImplementation(() => {
        throw new Error("Broken UI framework in listener");
      });

      const unsub = history.onDirtyChange(faultyListener);

      // Should not throw when executing or undoing
      await expect(history.execute({
        description: "Safe Op",
        execute: () => {},
        undo: () => {}
      })).resolves.not.toThrow();

      expect(history.isDirty()).toBe(true);

      await expect(history.undo()).resolves.not.toThrow();
      expect(history.isDirty()).toBe(false);

      unsub();
    });

    it("properly aligns upside-down surface normals (180° inverted ceiling)", () => {
      const obj = new THREE.Object3D();
      obj.rotation.y = 0;

      const invertedNormal = new THREE.Vector3(0, -1, 0);
      alignNormalToSurface(obj, invertedNormal, true);

      const transformedUp = new THREE.Vector3(0, 1, 0).applyQuaternion(obj.quaternion);
      expect(transformedUp.x).toBeCloseTo(0, 3);
      expect(transformedUp.y).toBeCloseTo(-1, 3);
      expect(transformedUp.z).toBeCloseTo(0, 3);
    });
  });
});
