import { ASSET_BY_ID, ASSET_IDS } from "../render/assets/AssetCatalog";

export type AuthoredPresentationAction =
  | "plant"
  | "water"
  | "harvest"
  | "processing-start"
  | "processing-collect"
  | "pickup"
  | "place"
  | "workstation"
  | "cast"
  | "board"
  | "dock";

/** Kept as an API alias while the farming-only controller becomes shared. */
export type FarmingPresentationAction = AuthoredPresentationAction;

export type FarmingActionPhase =
  | "started"
  | "committed"
  | "invalidated"
  | "completed"
  | "cancelled";

export type AuthoredActionStage = "anticipation" | "commit" | "recovery";

export interface FarmingActionTarget {
  x: number;
  y: number;
  z: number;
  entityId?: string;
}

export interface FarmingActionSnapshot {
  id: number;
  action: AuthoredPresentationAction;
  phase: FarmingActionPhase;
  stage: AuthoredActionStage;
  target: FarmingActionTarget;
  progress: number;
  committed: boolean;
  commitSucceeded: boolean | null;
  interruptible: boolean;
}

export interface FarmingActionCallbacks {
  commit: () => { success: boolean; reason?: string };
  phaseChanged?: (snapshot: FarmingActionSnapshot) => void;
}

interface FarmingActionTiming {
  durationMs: number;
  commitMs: number;
}

const ACTION_CLIP: Readonly<Record<AuthoredPresentationAction, string>> = {
  plant: "plant",
  water: "water",
  harvest: "harvest",
  "processing-start": "workstation",
  "processing-collect": "pickup",
  pickup: "pickup",
  place: "place",
  workstation: "workstation",
  cast: "cast",
  board: "board",
  dock: "dock"
};

const characterClips = new Map(
  ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)?.animationClips?.map((clip) => [clip.name, clip]) ?? []
);

/** Presentation timing is derived only from authored catalog clip contracts. */
export const AUTHORED_ACTION_TIMINGS: Readonly<Record<AuthoredPresentationAction, FarmingActionTiming>> =
  Object.fromEntries(Object.entries(ACTION_CLIP).map(([action, clipName]) => {
    const clip = characterClips.get(clipName);
    if (!clip || clip.loop || clip.commitMarkerSeconds === undefined) {
      throw new Error(`[AuthoredActionTimeline] ${clipName} requires a one-shot duration and commit marker`);
    }
    if (clip.commitMarkerSeconds <= 0 || clip.commitMarkerSeconds >= clip.durationSeconds) {
      throw new Error(`[AuthoredActionTimeline] ${clipName} commit marker must sit inside its clip`);
    }
    return [action, {
      durationMs: clip.durationSeconds * 1000,
      commitMs: clip.commitMarkerSeconds * 1000
    }];
  })) as unknown as Readonly<Record<AuthoredPresentationAction, FarmingActionTiming>>;

export const FARMING_ACTION_TIMINGS = AUTHORED_ACTION_TIMINGS;

interface ActiveAction {
  id: number;
  action: AuthoredPresentationAction;
  phase: FarmingActionPhase;
  target: FarmingActionTarget;
  elapsedMs: number;
  lastUpdatedAtMs: number;
  committed: boolean;
  commitAttempted: boolean;
  commitSucceeded: boolean | null;
  commitStagePending: boolean;
  callbacks: FarmingActionCallbacks;
}

/**
 * Shared anticipation -> commit -> recovery clock. It never owns gameplay
 * mutations: the callback revalidates and commits once in simulation.
 */
export class FarmingActionController {
  private activeAction: ActiveAction | null = null;
  private nextId = 1;
  private paused = false;

  constructor(private readonly timingScale: number = 1) {
    if (!Number.isFinite(timingScale) || timingScale <= 0) {
      throw new Error("Authored action timing scale must be positive and finite");
    }
  }

  private timing(action: AuthoredPresentationAction): FarmingActionTiming {
    const timing = AUTHORED_ACTION_TIMINGS[action];
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
    callbacks: FarmingActionCallbacks
  ): boolean {
    if (this.activeAction) return false;
    this.activeAction = {
      id: this.nextId++,
      action,
      phase: "started",
      target: { ...target },
      elapsedMs: 0,
      lastUpdatedAtMs: nowMs,
      committed: false,
      commitAttempted: false,
      commitSucceeded: null,
      commitStagePending: false,
      callbacks
    };
    callbacks.phaseChanged?.(this.snapshot(nowMs)!);
    return true;
  }

  public update(nowMs: number, paused: boolean = false): void {
    this.paused = paused;
    const active = this.activeAction;
    if (!active) return;
    this.advanceClock(active, nowMs, paused);
    const timing = this.timing(active.action);

    if (!active.commitAttempted && active.elapsedMs >= timing.commitMs) {
      active.commitAttempted = true;
      const result = active.callbacks.commit();
      active.commitSucceeded = result.success;
      active.committed = result.success;
      active.phase = result.success ? "committed" : "invalidated";
      active.commitStagePending = true;
      active.callbacks.phaseChanged?.(this.snapshot(nowMs)!);
      active.commitStagePending = false;
    }

    if (active.elapsedMs >= timing.durationMs) {
      active.phase = "completed";
      active.callbacks.phaseChanged?.(this.snapshot(nowMs)!);
      this.activeAction = null;
    }
  }

  public cancelBeforeCommit(nowMs: number): boolean {
    if (!this.activeAction) return false;
    this.update(nowMs, this.paused);
    const active = this.activeAction;
    if (!active || active.commitAttempted) return false;
    active.phase = "cancelled";
    active.callbacks.phaseChanged?.(this.snapshot(nowMs)!);
    this.activeAction = null;
    return true;
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
      phase: active.phase,
      stage,
      target: { ...active.target },
      progress: Math.min(1, Math.max(0, active.elapsedMs / timing.durationMs)),
      committed: active.committed,
      commitSucceeded: active.commitSucceeded,
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

export { FarmingActionController as AuthoredActionTimeline };
