import { describe, expect, it, vi } from "vitest";

import {
  HistoryManager,
  type IEditorCommand,
  type EditorPoseState
} from "../../src/layout-editor/history/HistoryManager";

describe("Layout Editor Command Pattern History Manager (HistoryManager.ts)", () => {
  describe("Basic Command Execution, Undo, and Redo", () => {
    it("executes commands, records undo history, and handles undo/redo transitions", async () => {
      const history = new HistoryManager();
      let state = 0;

      const createAddCommand = (val: number): IEditorCommand => ({
        description: `Add ${val}`,
        execute: () => {
          state += val;
        },
        undo: () => {
          state -= val;
        }
      });

      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);

      // Execute Action 1 (+5)
      await history.execute(createAddCommand(5));
      expect(state).toBe(5);
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
      expect(history.getUndoStackSize()).toBe(1);

      // Execute Action 2 (+10)
      await history.execute(createAddCommand(10));
      expect(state).toBe(15);
      expect(history.getUndoStackSize()).toBe(2);

      // Undo Action 2
      const undone2 = await history.undo();
      expect(undone2).toBe(true);
      expect(state).toBe(5);
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(true);
      expect(history.getRedoStackSize()).toBe(1);

      // Undo Action 1
      const undone1 = await history.undo();
      expect(undone1).toBe(true);
      expect(state).toBe(0);
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(true);

      // Redo Action 1
      const redone1 = await history.redo();
      expect(redone1).toBe(true);
      expect(state).toBe(5);
      expect(history.canUndo()).toBe(true);

      // Redo Action 2
      const redone2 = await history.redo();
      expect(redone2).toBe(true);
      expect(state).toBe(15);
      expect(history.canRedo()).toBe(false);
    });

    it("clears redo stack upon executing a new discrete action", async () => {
      const history = new HistoryManager();
      let value = "A";

      await history.execute({
        description: "Set B",
        execute: () => { value = "B"; },
        undo: () => { value = "A"; }
      });
      await history.execute({
        description: "Set C",
        execute: () => { value = "C"; },
        undo: () => { value = "B"; }
      });

      expect(value).toBe("C");
      await history.undo(); // back to B
      expect(value).toBe("B");
      expect(history.canRedo()).toBe(true);

      // Fresh action should clear redo
      await history.execute({
        description: "Set D",
        execute: () => { value = "D"; },
        undo: () => { value = "B"; }
      });
      expect(value).toBe("D");
      expect(history.canRedo()).toBe(false);
      expect(history.getRedoStackSize()).toBe(0);
    });
  });

  describe("Re-entrancy Guard & Failure Safety", () => {
    it("preserves undo stack intact if command undo throws an error", async () => {
      const history = new HistoryManager();

      const failingCommand: IEditorCommand = {
        description: "Fail on undo",
        execute: () => {},
        undo: () => {
          throw new Error("Network / Server commit rejected");
        }
      };

      await history.execute(failingCommand);
      expect(history.getUndoStackSize()).toBe(1);

      await expect(history.undo()).rejects.toThrow("Network / Server commit rejected");

      // Verify failure safety: command must NOT be popped from undo stack
      expect(history.getUndoStackSize()).toBe(1);
      expect(history.getRedoStackSize()).toBe(0);
    });

    it("preserves redo stack intact if command redo execution throws", async () => {
      let failOnNextExecute = false;
      const history = new HistoryManager();

      const flakyCommand: IEditorCommand = {
        description: "Flaky redo",
        execute: () => {
          if (failOnNextExecute) throw new Error("HTTP 500 internal error");
        },
        undo: () => {}
      };

      await history.execute(flakyCommand);
      await history.undo();
      expect(history.getRedoStackSize()).toBe(1);

      failOnNextExecute = true;
      await expect(history.redo()).rejects.toThrow("HTTP 500 internal error");

      // Verify failure safety: command must NOT be popped from redo stack
      expect(history.getRedoStackSize()).toBe(1);
      expect(history.getUndoStackSize()).toBe(0);
    });
  });

  describe("Transaction Batching", () => {
    it("groups multiple operations into a single atomic undo/redo transaction", async () => {
      const history = new HistoryManager();
      const items: string[] = [];

      history.beginTransaction("Add 3 items");

      await history.execute({
        description: "Add Item 1",
        execute: () => { items.push("item1"); },
        undo: () => { items.pop(); }
      });

      await history.execute({
        description: "Add Item 2",
        execute: () => { items.push("item2"); },
        undo: () => { items.pop(); }
      });

      await history.execute({
        description: "Add Item 3",
        execute: () => { items.push("item3"); },
        undo: () => { items.pop(); }
      });

      expect(items).toEqual(["item1", "item2", "item3"]);
      expect(history.getUndoStackSize()).toBe(0); // Inside transaction, not yet committed

      await history.commitTransaction();
      expect(history.getUndoStackSize()).toBe(1);
      expect(history.getUndoDescriptions()[0]).toBe("Add 3 items");

      // Single undo should undo all 3 items in reverse order
      await history.undo();
      expect(items).toEqual([]);
      expect(history.canRedo()).toBe(true);

      // Single redo should redo all 3 items
      await history.redo();
      expect(items).toEqual(["item1", "item2", "item3"]);
    });

    it("rolls back pending uncommitted transaction actions cleanly", async () => {
      const history = new HistoryManager();
      let total = 0;

      history.beginTransaction("Aborted transaction");
      await history.execute({
        description: "Add 100",
        execute: () => { total += 100; },
        undo: () => { total -= 100; }
      });
      expect(total).toBe(100);

      await history.rollbackTransaction();
      expect(total).toBe(0);
      expect(history.getUndoStackSize()).toBe(0);
    });
  });

  describe("Drag Coalescing", () => {
    it("coalesces continuous mouse drag moves into a single discrete undo step", async () => {
      const history = new HistoryManager();
      let currentPose: EditorPoseState = { x: 0, z: 0, rotationY: 0 };

      const applyPose = (pose: EditorPoseState) => {
        currentPose = { ...pose };
      };

      // 1. Begin drag at (0, 0)
      history.beginDrag("wagon_1", { x: 0, z: 0, rotationY: 0 });

      // 2. Simulate 50 intermediate mousemove events
      for (let i = 1; i <= 50; i++) {
        currentPose.x = i * 0.1;
        currentPose.z = i * 0.2;
      }

      // 3. End drag at final position (5.0, 10.0, 0.5)
      const finalPose: EditorPoseState = { x: 5.0, z: 10.0, rotationY: 0.5 };
      const emitted = await history.endDrag("wagon_1", finalPose, applyPose);

      expect(emitted).toBe(true);
      expect(history.getUndoStackSize()).toBe(1);
      expect(currentPose).toEqual(finalPose);

      // Undo should jump directly back to initial pose (0, 0, 0) in one step
      await history.undo();
      expect(currentPose).toEqual({ x: 0, z: 0, rotationY: 0 });

      // Redo should jump back to final pose
      await history.redo();
      expect(currentPose).toEqual(finalPose);
    });

    it("ignores stationary drags where position did not change", async () => {
      const history = new HistoryManager();
      history.beginDrag("prop_static", { x: 10, z: 20, rotationY: 0.5 });

      const emitted = await history.endDrag(
        "prop_static",
        { x: 10, z: 20, rotationY: 0.5 },
        () => {}
      );

      expect(emitted).toBe(false);
      expect(history.getUndoStackSize()).toBe(0);
    });
  });

  describe("Max Depth Pruning & Dirty State Tracking", () => {
    it("prunes oldest commands when exceeding configured max depth", async () => {
      const history = new HistoryManager(3); // maxDepth = 3

      for (let i = 1; i <= 5; i++) {
        await history.execute({
          description: `Action ${i}`,
          execute: () => {},
          undo: () => {}
        });
      }

      expect(history.getUndoStackSize()).toBe(3);
      expect(history.getUndoDescriptions()).toEqual(["Action 3", "Action 4", "Action 5"]);
    });

    it("tracks dirty state and fires listeners accurately", async () => {
      const history = new HistoryManager();
      const listener = vi.fn();
      const unsubscribe = history.onDirtyChange(listener);

      expect(history.isDirty()).toBe(false);

      await history.execute({
        description: "Action 1",
        execute: () => {},
        undo: () => {}
      });

      expect(history.isDirty()).toBe(true);
      expect(listener).toHaveBeenCalledWith(true);

      history.markClean();
      expect(history.isDirty()).toBe(false);
      expect(listener).toHaveBeenCalledWith(false);

      // Performing another action makes it dirty again
      await history.execute({
        description: "Action 2",
        execute: () => {},
        undo: () => {}
      });
      expect(history.isDirty()).toBe(true);

      // Undoing back to clean state returns isDirty to false
      await history.undo();
      expect(history.isDirty()).toBe(false);

      unsubscribe();
      history.clear();
      expect(history.isDirty()).toBe(false);
    });
  });
});
