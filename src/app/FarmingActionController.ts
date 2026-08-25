import { ASSET_BY_ID, ASSET_IDS } from "../render/assets/AssetCatalog";

export type FarmingPresentationAction =
  | "plant"
  | "water"
  | "harvest"
  | "processing-start"
  | "processing-collect";

export type FarmingActionPhase = "started" | "committed" | "completed" | "cancelled";

export interface FarmingActionTarget {
  x: number;
  y: number;
  z: number;
  entityId?: string;
}

export interface FarmingActionSnapshot {
  id: number;
  action: FarmingPresentationAction;
  phase: FarmingActionPhase;
  target: FarmingActionTarget;
  progress: number;
  committed: boolean;
}

export interface FarmingActionCallbacks {
  commit: () => { success: boolean; reason?: string };
  phaseChanged?: (snapshot: FarmingActionSnapshot) => void;
}

interface FarmingActionTiming {
  durationMs: number;
  commitMs: number;
}

const ACTION_CLIP: Readonly<Record<FarmingPresentationAction, string>> = {
  plant: "plant",
  water: "water",
  harvest: "harvest",
  "processing-start": "workstation",
  "processing-collect": "pickup"
};

const characterClips = new Map(
  ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)?.animationClips?.map((clip) => [clip.name, clip]) ?? []
);

/** Presentation timing is derived from the authored catalog clip contract. */
export const FARMING_ACTION_TIMINGS: Readonly<Record<FarmingPresentationAction, FarmingActionTiming>> =
  Object.fromEntries(Object.entries(ACTION_CLIP).map(([action, clipName]) => {
    const clip = characterClips.get(clipName);
    if (!clip || clip.loop || clip.commitMarkerSeconds === undefined) {
      throw new Error(`[FarmingActionController] ${clipName} requires a one-shot duration and commit marker`);
    }
    return [action, {
      durationMs: clip.durationSeconds * 1000,
      commitMs: clip.commitMarkerSeconds * 1000
    }];
  })) as unknown as Readonly<Record<FarmingPresentationAction, FarmingActionTiming>>;

interface ActiveAction {
  id: number;
  action: FarmingPresentationAction;
  phase: FarmingActionPhase;
  target: FarmingActionTarget;
  startedAtMs: number;
  committed: boolean;
  callbacks: FarmingActionCallbacks;
}

export class FarmingActionController {
  private activeAction: ActiveAction | null = null;
  private nextId = 1;

  constructor(private readonly timingScale: number = 1) {
    if (!Number.isFinite(timingScale) || timingScale <= 0) {
      throw new Error("Farming action timing scale must be positive and finite");
    }
  }

  private timing(action: FarmingPresentationAction): FarmingActionTiming {
    const timing = FARMING_ACTION_TIMINGS[action];
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
    action: FarmingPresentationAction,
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
      startedAtMs: nowMs,
      committed: false,
      callbacks
    };
    callbacks.phaseChanged?.(this.snapshot(nowMs)!);
    return true;
  }

  public update(nowMs: number): void {
    const active = this.activeAction;
    if (!active) return;
    const timing = this.timing(active.action);
    const elapsed = Math.max(0, nowMs - active.startedAtMs);

    if (!active.committed && elapsed >= timing.commitMs) {
      const result = active.callbacks.commit();
      if (!result.success) {
        active.phase = "cancelled";
        active.callbacks.phaseChanged?.(this.snapshot(nowMs)!);
        this.activeAction = null;
        return;
      }
      active.committed = true;
      active.phase = "committed";
      active.callbacks.phaseChanged?.(this.snapshot(nowMs)!);
    }

    if (elapsed >= timing.durationMs) {
      active.phase = "completed";
      active.callbacks.phaseChanged?.(this.snapshot(nowMs)!);
      this.activeAction = null;
    }
  }

  public cancelBeforeCommit(nowMs: number): boolean {
    const active = this.activeAction;
    if (!active || active.committed) return false;
    active.phase = "cancelled";
    active.callbacks.phaseChanged?.(this.snapshot(nowMs)!);
    this.activeAction = null;
    return true;
  }

  public snapshot(nowMs: number): FarmingActionSnapshot | null {
    const active = this.activeAction;
    if (!active) return null;
    const timing = this.timing(active.action);
    return {
      id: active.id,
      action: active.action,
      phase: active.phase,
      target: { ...active.target },
      progress: Math.min(1, Math.max(0, (nowMs - active.startedAtMs) / timing.durationMs)),
      committed: active.committed
    };
  }
}
