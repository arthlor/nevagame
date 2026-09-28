import type { GameCommand, InteractionResult } from "../core/contracts";
import type { ProcessingPresentationKind } from "../core/types";

export type AuthoredPresentationAction =
  | "plant"
  | "water"
  | "fertilize"
  | "harvest"
  | "unroot"
  | "processing-start"
  | "processing-collect"
  | "pickup"
  | "place"
  | "workstation"
  | "cast"
  | "board"
  | "dock";

export type FarmingPresentationAction = AuthoredPresentationAction;
export type FarmingActionPhase = "started" | "committed" | "invalidated" | "completed" | "cancelled";
export type AuthoredActionStage = "anticipation" | "commit" | "recovery";

export interface FarmingActionTarget {
  x: number;
  y: number;
  z: number;
  entityId?: string;
  /** Snapshot-only visual selection; it never changes command semantics. */
  presentationKind?: ProcessingPresentationKind | "ready-equipment";
}

export interface FarmingActionSnapshot {
  id: number;
  action: AuthoredPresentationAction;
  /** Quoted Work at admission; replaced by the charged amount when a command returns it. */
  workCost?: number | null;
  phase: FarmingActionPhase;
  stage: AuthoredActionStage;
  target: FarmingActionTarget;
  progress: number;
  committed: boolean;
  commitSucceeded: boolean | null;
  /** Present only after the simulation has attempted the canonical command. */
  commitResult?: Readonly<InteractionResult>;
  interruptible: boolean;
}

export interface FarmingActionCallbacks {
  /** Presentation observer only. It can never authorize or perform the transaction. */
  phaseChanged?: (snapshot: FarmingActionSnapshot) => void;
}

export interface FarmingActionTiming {
  durationMs: number;
  commitMs: number;
}

/**
 * Canonical transient action timings. These values are simulation-owned and
 * the authored animation catalog is validated against them. The timeline is
 * intentionally absent from GameState: reloading cancels an uncommitted
 * action, while a command committed before a save remains committed.
 */
export const SIMULATION_ACTION_TIMINGS: Readonly<Record<AuthoredPresentationAction, FarmingActionTiming>> = {
  plant: { durationMs: 733.333, commitMs: 333.333 },
  water: { durationMs: 833.333, commitMs: 400 },
  fertilize: { durationMs: 733.333, commitMs: 533.333 },
  harvest: { durationMs: 800, commitMs: 366.667 },
  unroot: { durationMs: 800, commitMs: 366.667 },
  "processing-start": { durationMs: 933.333, commitMs: 533.333 },
  "processing-collect": { durationMs: 633.333, commitMs: 333.333 },
  pickup: { durationMs: 633.333, commitMs: 333.333 },
  place: { durationMs: 733.333, commitMs: 533.333 },
  workstation: { durationMs: 933.333, commitMs: 533.333 },
  cast: { durationMs: 933.333, commitMs: 566.667 },
  board: { durationMs: 866.667, commitMs: 633.333 },
  dock: { durationMs: 933.333, commitMs: 666.667 }
};

interface ActiveAction {
  id: number;
  action: AuthoredPresentationAction;
  workCost: number | null;
  phase: FarmingActionPhase;
  target: FarmingActionTarget;
  command: GameCommand;
  elapsedMs: number;
  lastUpdatedAtMs: number;
  committed: boolean;
  commitAttempted: boolean;
  commitResult: InteractionResult | null;
  commitStagePending: boolean;
  callbacks: FarmingActionCallbacks;
}

/**
 * Simulation-owned anticipation -> commit -> recovery clock. Animation and
 * audio merely observe snapshots; the only economic authority is the command
 * executor captured by Simulation itself.
 */
export class SimulationActionTimeline {
  private activeAction: ActiveAction | null = null;
  private nextId = 1;
  private updating = false;

  constructor(
    private readonly executeCommand: (command: GameCommand) => InteractionResult,
    private readonly timingScale: number = 1,
    private readonly canStart: () => boolean = () => true
  ) {
    if (!Number.isFinite(timingScale) || timingScale <= 0) {
      throw new Error("Authored action timing scale must be positive and finite");
    }
  }

  private timing(action: AuthoredPresentationAction): FarmingActionTiming {
    const timing = SIMULATION_ACTION_TIMINGS[action];
    return {
      durationMs: timing.durationMs * this.timingScale,
      commitMs: timing.commitMs * this.timingScale
    };
  }

  public get isActive(): boolean {
    return this.activeAction !== null;
  }

  public get hasCommitted(): boolean {
    return this.activeAction?.committed ?? false;
  }

  public start(
    action: AuthoredPresentationAction,
    target: FarmingActionTarget,
    nowMs: number,
    command: GameCommand,
    callbacks: FarmingActionCallbacks = {},
    workCost: number | null = null
  ): boolean {
    if (this.activeAction || this.updating || !this.canStart()) return false;
    this.activeAction = {
      id: this.nextId++,
      action,
      workCost,
      phase: "started",
      target: { ...target },
      command: structuredClone(command),
      elapsedMs: 0,
      lastUpdatedAtMs: Number.isFinite(nowMs) ? nowMs : 0,
      committed: false,
      commitAttempted: false,
      commitResult: null,
      commitStagePending: false,
      callbacks
    };
    try {
      callbacks.phaseChanged?.(this.snapshot(nowMs)!);
    } catch (error) {
      this.reset();
      throw error;
    }
    return true;
  }

  public update(nowMs: number, paused: boolean = false): void {
    const active = this.activeAction;
    if (!active || this.updating) return;
    this.updating = true;
    try {
      this.advanceClock(active, nowMs, paused);
      const timing = this.timing(active.action);

      if (!active.commitAttempted && active.elapsedMs >= timing.commitMs) {
        // Set this before executing because a successful command may synchronously
        // change mode and ask presentation code to interrupt the current action.
        active.commitAttempted = true;
        const result = this.executeCommand(active.command);
        if (this.activeAction !== active) return;
        if (active.workCost !== null && result.success && typeof result.cost === "number") {
          active.workCost = result.cost;
        }
        active.commitResult = { ...result };
        active.committed = result.success;
        active.phase = result.success ? "committed" : "invalidated";
        active.commitStagePending = true;
        active.callbacks.phaseChanged?.(this.snapshot(nowMs)!);
        active.commitStagePending = false;
      }

      if (this.activeAction === active && active.elapsedMs >= timing.durationMs) {
        this.finish("completed");
      }
    } catch (error) {
      // Ownership must never depend on an animation/UI observer succeeding.
      this.reset();
      throw error;
    } finally {
      this.updating = false;
    }
  }

  public cancelBeforeCommit(_nowMs: number): boolean {
    if (!this.activeAction || this.activeAction.commitAttempted) return false;
    // Cancellation is not a frame update: a delayed frame must not turn an
    // unattempted action into a paid transaction while trying to cancel it.
    this.finish("cancelled");
    return true;
  }

  /** Scene/session teardown drops presentation recovery without replay or undo. */
  public reset(): void {
    if (!this.activeAction) return;
    this.finish(this.activeAction.committed ? "completed" : "cancelled");
  }

  private finish(phase: "completed" | "cancelled"): void {
    const active = this.activeAction;
    if (!active) return;
    active.phase = phase;
    active.commitStagePending = false;
    const snapshot = this.snapshot(0)!;
    this.activeAction = null;
    active.callbacks.phaseChanged?.(snapshot);
  }

  public snapshot(_nowMs: number): FarmingActionSnapshot | null {
    const active = this.activeAction;
    if (!active) return null;
    const timing = this.timing(active.action);
    const stage: AuthoredActionStage = active.commitStagePending
      ? "commit"
      : active.commitAttempted
        ? "recovery"
        : "anticipation";
    return {
      id: active.id,
      action: active.action,
      workCost: active.workCost,
      phase: active.phase,
      stage,
      target: { ...active.target },
      progress: Math.min(1, Math.max(0, active.elapsedMs / timing.durationMs)),
      committed: active.committed,
      commitSucceeded: active.commitResult?.success ?? null,
      ...(active.commitResult ? { commitResult: { ...active.commitResult } } : {}),
      interruptible: !active.commitAttempted
    };
  }

  private advanceClock(active: ActiveAction, nowMs: number, paused: boolean): void {
    const safeNow = Number.isFinite(nowMs) ? nowMs : active.lastUpdatedAtMs;
    const deltaMs = Math.max(0, safeNow - active.lastUpdatedAtMs);
    active.lastUpdatedAtMs = safeNow;
    if (!paused) active.elapsedMs += deltaMs;
  }
}
