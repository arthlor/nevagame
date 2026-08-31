export interface IEditorCommand {
  execute(): Promise<void> | void;
  undo(): Promise<void> | void;
  description: string;
}

export type Command = IEditorCommand;

export interface EditorPoseState {
  x: number;
  z: number;
  rotationY: number;
  y?: number;
}

export interface TransactionInfo {
  name: string;
  commands: IEditorCommand[];
}

/**
 * Robust Command Pattern undo/redo history engine for the layout editor.
 * Features:
 * - Transaction batching (coalescing multi-step or multi-object edits into a single atomic undo item)
 * - Drag coalescing (collapsing continuous pointermove events into a single discrete command)
 * - Dirty state tracking and listener notifications
 * - Re-entrancy execution guards with failure safety (maintains stack integrity if a command fails)
 * - Configurable maximum stack depth
 */
export class HistoryManager {
  private undoStack: IEditorCommand[] = [];
  private redoStack: IEditorCommand[] = [];
  private maxDepth: number;
  private isExecuting = false;

  // Drag coalescing state map: targetId -> initialPose
  private dragInitialState = new Map<string, EditorPoseState>();

  // Transaction state
  private activeTransaction: TransactionInfo | null = null;

  // Dirty state tracking (index into undoStack at which state was marked clean)
  private cleanIndex: number = 0;
  private dirtyChangeListeners = new Set<(isDirty: boolean) => void>();

  public constructor(maxDepth: number = 100) {
    this.maxDepth = Math.max(1, maxDepth);
  }

  public getUndoStackSize(): number {
    return this.undoStack.length;
  }

  public getRedoStackSize(): number {
    return this.redoStack.length;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0 && !this.isExecuting;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0 && !this.isExecuting;
  }

  public isBusy(): boolean {
    return this.isExecuting;
  }

  public getUndoDescriptions(): string[] {
    return this.undoStack.map((cmd) => cmd.description);
  }

  public getRedoDescriptions(): string[] {
    return this.redoStack.map((cmd) => cmd.description);
  }

  public isTransactionActive(): boolean {
    return this.activeTransaction !== null;
  }

  /**
   * Execute a command and push it to the history stack (or record into active transaction).
   * Automatically clears the redo stack upon new discrete actions.
   */
  public async execute(command: IEditorCommand): Promise<void> {
    if (this.isExecuting) return;

    if (this.activeTransaction) {
      this.isExecuting = true;
      try {
        await command.execute();
        this.activeTransaction.commands.push(command);
      } finally {
        this.isExecuting = false;
      }
      return;
    }

    this.isExecuting = true;
    try {
      await command.execute();
      this.recordExecuted(command);
    } finally {
      this.isExecuting = false;
    }
  }

  /** Records an action that the caller has already applied successfully. */
  public recordExecuted(command: IEditorCommand): void {
    if (this.activeTransaction) {
      this.activeTransaction.commands.push(command);
      return;
    }
    if (this.redoStack.length > 0 && this.cleanIndex > this.undoStack.length) {
      this.cleanIndex = -1;
    }
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
      this.cleanIndex = Math.max(-1, this.cleanIndex - 1);
    }
    this.redoStack = [];
    this.notifyDirtyChange();
  }

  /**
   * Undo the most recent command on the undo stack.
   * If command.undo() rejects or fails, the stack remains intact and the item is not popped.
   */
  public async undo(): Promise<boolean> {
    if (this.isExecuting || this.undoStack.length === 0) return false;

    const command = this.undoStack[this.undoStack.length - 1]!;
    this.isExecuting = true;
    try {
      await command.undo();
      this.undoStack.pop();
      this.redoStack.push(command);
      this.notifyDirtyChange();
      return true;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Redo the most recently undone command on the redo stack.
   * If command.execute() rejects or fails, the stack remains intact and the item is not popped.
   */
  public async redo(): Promise<boolean> {
    if (this.isExecuting || this.redoStack.length === 0) return false;

    const command = this.redoStack[this.redoStack.length - 1]!;
    this.isExecuting = true;
    try {
      await command.execute();
      this.redoStack.pop();
      this.undoStack.push(command);
      if (this.undoStack.length > this.maxDepth) {
        this.undoStack.shift();
        this.cleanIndex = Math.max(-1, this.cleanIndex - 1);
      }
      this.notifyDirtyChange();
      return true;
    } finally {
      this.isExecuting = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Transaction Batching
  // ---------------------------------------------------------------------------

  public beginTransaction(name: string = "Batch Transaction"): void {
    if (this.activeTransaction) {
      throw new Error(`Transaction "${this.activeTransaction.name}" is already in progress`);
    }
    this.activeTransaction = { name, commands: [] };
  }

  public async commitTransaction(): Promise<void> {
    if (!this.activeTransaction) return;

    const tx = this.activeTransaction;
    this.activeTransaction = null;

    if (tx.commands.length === 0) return;

    if (tx.commands.length === 1) {
      this.undoStack.push(tx.commands[0]!);
    } else {
      const composite: IEditorCommand = {
        description: tx.name,
        execute: async () => {
          for (const cmd of tx.commands) {
            await cmd.execute();
          }
        },
        undo: async () => {
          for (let i = tx.commands.length - 1; i >= 0; i--) {
            await tx.commands[i]!.undo();
          }
        }
      };
      this.undoStack.push(composite);
    }

    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
      this.cleanIndex = Math.max(-1, this.cleanIndex - 1);
    }
    this.redoStack = [];
    this.notifyDirtyChange();
  }

  public async rollbackTransaction(): Promise<void> {
    if (!this.activeTransaction) return;

    const tx = this.activeTransaction;
    this.activeTransaction = null;

    for (let i = tx.commands.length - 1; i >= 0; i--) {
      try {
        await tx.commands[i]!.undo();
      } catch (err) {
        console.error("Error during transaction rollback:", err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Drag Coalescing
  // ---------------------------------------------------------------------------

  public beginDrag(targetId: string, initialPose: EditorPoseState): void {
    this.dragInitialState.set(targetId, { ...initialPose });
  }

  public cancelDrag(targetId: string): void {
    this.dragInitialState.delete(targetId);
  }

  public async endDrag(
    targetId: string,
    finalPose: EditorPoseState,
    applyFn: (pos: EditorPoseState) => Promise<void> | void,
    description?: string
  ): Promise<boolean> {
    if (!this.dragInitialState.has(targetId)) return false;

    const initial = this.dragInitialState.get(targetId)!;
    this.dragInitialState.delete(targetId);

    const changed =
      Math.abs(initial.x - finalPose.x) > 1e-4 ||
      Math.abs(initial.z - finalPose.z) > 1e-4 ||
      Math.abs(initial.rotationY - finalPose.rotationY) > 1e-4 ||
      (initial.y !== undefined && finalPose.y !== undefined && Math.abs(initial.y - finalPose.y) > 1e-4);

    if (changed) {
      await this.execute({
        description: description ?? `Move ${targetId}`,
        execute: async () => {
          await applyFn(finalPose);
        },
        undo: async () => {
          await applyFn(initial);
        }
      });
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Dirty State Management
  // ---------------------------------------------------------------------------

  public isDirty(): boolean {
    return this.undoStack.length !== this.cleanIndex;
  }

  public markClean(): void {
    this.cleanIndex = this.undoStack.length;
    this.notifyDirtyChange();
  }

  public onDirtyChange(listener: (isDirty: boolean) => void): () => void {
    this.dirtyChangeListeners.add(listener);
    return () => {
      this.dirtyChangeListeners.delete(listener);
    };
  }

  private notifyDirtyChange(): void {
    const dirty = this.isDirty();
    for (const listener of this.dirtyChangeListeners) {
      try {
        listener(dirty);
      } catch (err) {
        console.error("Error in dirty change listener:", err);
      }
    }
  }

  /**
   * Reset all history stacks and drag states.
   */
  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.activeTransaction = null;
    this.dragInitialState.clear();
    this.cleanIndex = 0;
    this.notifyDirtyChange();
  }
}
