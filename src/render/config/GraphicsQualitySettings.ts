import type { QualityTier } from "./VisualRenderConfig";
import {
  NO_AUTO_REDUCTIONS,
  reductionsAtLevel,
  type AutoReductions,
  type ReductionStep
} from "./GraphicsEffectSettings";

export type GraphicsQualityPreference = "auto" | QualityTier;

/** What an Auto decision changed; `false` when nothing did. */
export type AutoQualityChange = "tier" | "effects" | false;

/** Which signal the last Auto decision acted on. */
export type FramePressureSource = "gpu" | "cpu" | "frame-time";

const STORAGE_KEY = "neva.graphics-quality.v1";
const QUALITY_ORDER: readonly QualityTier[] = ["low", "medium", "high"];

/** Frame-time EMA above which a frame counts as slow, and below which as fast. */
const SLOW_FRAME_MS = 22;
const FAST_FRAME_MS = 15.2;
/**
 * A vsync-capped 60 Hz display never averages below `FAST_FRAME_MS`, so frame
 * time alone cannot show headroom there. With GPU timing, a frame rate that
 * holds this EMA while the GPU uses at most `GPU_HEADROOM_SHARE` of the frame
 * also counts as headroom. Without timing, recovery stays frame-time only.
 */
const HOLDING_FRAME_MS = 17.5;
const GPU_HEADROOM_SHARE = 0.6;
/** Sustained pressure needed before one reduction, and headroom before one recovery. */
const SLOW_SECONDS_TO_REDUCE = 2.5;
const FAST_SECONDS_TO_RECOVER = 10;
/** A reduction this soon after a recovery doubles the next recovery wait, up to the cap. */
const RECOVERY_BACKOFF_WINDOW_MS = 20_000;
const MAX_SECONDS_TO_RECOVER = 80;
const ADJUSTMENT_COOLDOWN_MS = 5_000;
/** GPU work at or above this share of the frame marks the frame as GPU-bound. */
const GPU_BOUND_SHARE = 0.7;

function storedPreference(): GraphicsQualityPreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "auto" || value === "low" || value === "medium" || value === "high") return value;
  } catch {
    // Storage can be unavailable without affecting gameplay.
  }
  return "auto";
}

function initialAutoTier(): QualityTier {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency || 8;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches === true
    || (navigator.maxTouchPoints ?? 0) > 0;
  const pixelRatioCap = coarsePointer ? 1.5 : 2;
  const pixelLoad = window.innerWidth * window.innerHeight * Math.min(window.devicePixelRatio, pixelRatioCap) ** 2;
  if (memory <= 4 || cores <= 4 || pixelLoad >= 9_000_000) return "low";
  if (memory <= 8 || cores <= 6 || pixelLoad >= 5_000_000 || coarsePointer) return "medium";
  return "high";
}

/**
 * The single graphics-quality owner: the player's tier preference and the Auto
 * controller. Under sustained pressure Auto walks one reduction ladder — the
 * optional effects first, then scene resolution, then one adjacent tier — and
 * recovers more slowly, one step at a time. Its reductions are temporary: they
 * never rewrite the saved tier or effect preferences, and an explicit tier
 * choice disables them entirely.
 */
export class GraphicsQualitySettings {
  private preferenceValue: GraphicsQualityPreference = storedPreference();
  private effectiveValue: QualityTier = this.preferenceValue === "auto"
    ? initialAutoTier()
    : this.preferenceValue;
  private frameTimeEmaMs = 16.67;
  private slowSeconds = 0;
  private fastSeconds = 0;
  private lastAdjustmentMs = Number.NEGATIVE_INFINITY;
  private holdUntilMs = Number.NEGATIVE_INFINITY;
  private ladderSource: (tier: QualityTier) => readonly ReductionStep[] = () => [];
  private ladder: readonly ReductionStep[] = [];
  private ladderLevel = 0;
  private lastPressureSource: FramePressureSource = "frame-time";
  private secondsToRecover = FAST_SECONDS_TO_RECOVER;
  private lastRecoveryMs = Number.NEGATIVE_INFINITY;

  public get preference(): GraphicsQualityPreference {
    return this.preferenceValue;
  }

  public get effectiveTier(): QualityTier {
    return this.effectiveValue;
  }

  /** Temporary reductions currently applied at the effective tier. */
  public get reductions(): AutoReductions {
    return this.preferenceValue === "auto" ? reductionsAtLevel(this.ladder, this.ladderLevel) : { ...NO_AUTO_REDUCTIONS };
  }

  /**
   * Reductions for the tier the renderer is actually drawing, which lags the
   * effective tier while a quality handoff crosses tiers. A tier Auto is
   * leaving downward stays fully reduced until the handoff completes, and one
   * it is leaving upward had recovered fully before Auto moved on.
   */
  public reductionsFor(tier: QualityTier): AutoReductions {
    if (this.preferenceValue !== "auto") return { ...NO_AUTO_REDUCTIONS };
    const offset = QUALITY_ORDER.indexOf(tier) - QUALITY_ORDER.indexOf(this.effectiveValue);
    if (offset === 0) return this.reductions;
    if (offset < 0) return { ...NO_AUTO_REDUCTIONS };
    const ladder = this.ladderSource(tier);
    return reductionsAtLevel(ladder, ladder.length);
  }

  public get activeReductionSteps(): readonly ReductionStep[] {
    return this.preferenceValue === "auto" ? this.ladder.slice(0, this.ladderLevel) : [];
  }

  public get pressureSource(): FramePressureSource {
    return this.lastPressureSource;
  }

  public setPreference(preference: GraphicsQualityPreference, nowMs: number = performance.now()): boolean {
    this.preferenceValue = preference;
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Keep the setting for this session when storage is unavailable.
    }
    this.slowSeconds = 0;
    this.fastSeconds = 0;
    this.lastAdjustmentMs = nowMs;
    this.secondsToRecover = FAST_SECONDS_TO_RECOVER;
    this.lastRecoveryMs = Number.NEGATIVE_INFINITY;
    const changed = this.setEffective(preference === "auto" ? initialAutoTier() : preference);
    this.enterLadder(false);
    return changed;
  }

  /**
   * Supplies the ordered reductions for a tier under the current preferences.
   * Call `refreshReductionLadder` whenever those preferences change.
   */
  public setReductionLadderSource(source: (tier: QualityTier) => readonly ReductionStep[]): void {
    this.ladderSource = source;
    this.ladder = [...source(this.effectiveValue)];
    this.ladderLevel = 0;
  }

  /**
   * Recomputes the ladder after a preference change. A changed ladder means
   * the player changed what is being reduced, so Auto starts again from the
   * full request rather than guessing a mapping. Returns whether the active
   * reductions changed.
   */
  public refreshReductionLadder(): boolean {
    const next = this.ladderSource(this.effectiveValue);
    if (next.length === this.ladder.length && next.every((step, index) => step === this.ladder[index])) {
      return false;
    }
    const hadReductions = this.ladderLevel > 0;
    this.ladder = [...next];
    this.ladderLevel = 0;
    return hadReductions;
  }

  /**
   * Excludes loading, shader preparation and settings changes from quality
   * decisions: frames inside the hold neither move the average nor count
   * toward sustained pressure.
   */
  public holdSampling(nowMs: number, durationMs: number): void {
    this.holdUntilMs = Math.max(this.holdUntilMs, nowMs + durationMs);
    this.slowSeconds = 0;
    this.fastSeconds = 0;
  }

  /**
   * Auto mode adapts slowly and with asymmetric hysteresis to prevent quality
   * thrashing. `gpuFrameMs` is the recent GPU cost of a frame when timer
   * queries work; without it the controller falls back to frame time alone and
   * walks the ladder conservatively.
   */
  public sampleFrame(rawDeltaSeconds: number, nowMs: number, gpuFrameMs: number | null = null): AutoQualityChange {
    // The caller owns hidden-tab resumption. Frames up to a full second are
    // real, visible work and must move the average: ignoring them behind the
    // simulation clamp hid sustained low-FPS periods from auto quality.
    if (this.preferenceValue !== "auto" || rawDeltaSeconds <= 0 || rawDeltaSeconds >= 1) return false;
    if (nowMs < this.holdUntilMs) return false;
    const frameMs = rawDeltaSeconds * 1000;
    this.frameTimeEmaMs += (frameMs - this.frameTimeEmaMs) * 0.04;
    const headroom = this.frameTimeEmaMs < FAST_FRAME_MS || (
      gpuFrameMs !== null
      && this.frameTimeEmaMs <= HOLDING_FRAME_MS
      && gpuFrameMs <= this.frameTimeEmaMs * GPU_HEADROOM_SHARE
    );
    this.slowSeconds = this.frameTimeEmaMs > SLOW_FRAME_MS ? this.slowSeconds + rawDeltaSeconds : 0;
    this.fastSeconds = headroom ? this.fastSeconds + rawDeltaSeconds : 0;
    if (nowMs - this.lastAdjustmentMs < ADJUSTMENT_COOLDOWN_MS) return false;

    const index = QUALITY_ORDER.indexOf(this.effectiveValue);
    if (this.slowSeconds >= SLOW_SECONDS_TO_REDUCE) {
      const source: FramePressureSource = gpuFrameMs === null
        ? "frame-time"
        : gpuFrameMs >= this.frameTimeEmaMs * GPU_BOUND_SHARE ? "gpu" : "cpu";
      // Effects and resolution only relieve the GPU. When timing shows the CPU
      // is the limit, go straight to the tier, which also sheds scene work.
      if (this.ladderLevel < this.ladder.length && source !== "cpu") {
        return this.reduce(nowMs, source, () => { this.ladderLevel += 1; return "effects"; });
      }
      if (index > 0) {
        return this.reduce(nowMs, source, () => {
          this.setEffective(QUALITY_ORDER[index - 1]);
          this.enterLadder(false);
          return "tier";
        });
      }
      return false;
    }
    if (this.fastSeconds >= this.secondsToRecover) {
      if (this.ladderLevel > 0) {
        return this.recover(nowMs, () => { this.ladderLevel -= 1; return "effects"; });
      }
      if (index < QUALITY_ORDER.length - 1) {
        return this.recover(nowMs, () => {
          // Re-enter the richer tier fully reduced and recover it step by step,
          // so one good stretch cannot restore every effect at once.
          this.setEffective(QUALITY_ORDER[index + 1]);
          this.enterLadder(true);
          return "tier";
        });
      }
    }
    return false;
  }

  /** Seconds of sustained headroom the next recovery step needs. */
  public get recoveryDelaySeconds(): number {
    return this.secondsToRecover;
  }

  private enterLadder(fullyReduced: boolean): void {
    this.ladder = [...this.ladderSource(this.effectiveValue)];
    this.ladderLevel = fullyReduced ? this.ladder.length : 0;
  }

  private reduce(nowMs: number, source: FramePressureSource, change: () => AutoQualityChange): AutoQualityChange {
    // The step just recovered did not hold: wait longer before trying again,
    // once per failed recovery rather than once per reduction that follows it.
    if (nowMs - this.lastRecoveryMs < RECOVERY_BACKOFF_WINDOW_MS) {
      this.secondsToRecover = Math.min(MAX_SECONDS_TO_RECOVER, this.secondsToRecover * 2);
      this.lastRecoveryMs = Number.NEGATIVE_INFINITY;
    }
    this.lastPressureSource = source;
    return this.adjust(nowMs, change);
  }

  private recover(nowMs: number, change: () => AutoQualityChange): AutoQualityChange {
    this.lastRecoveryMs = nowMs;
    return this.adjust(nowMs, change);
  }

  private adjust(nowMs: number, change: () => AutoQualityChange): AutoQualityChange {
    this.lastAdjustmentMs = nowMs;
    this.slowSeconds = 0;
    this.fastSeconds = 0;
    return change();
  }

  private setEffective(tier: QualityTier): boolean {
    if (tier === this.effectiveValue) return false;
    this.effectiveValue = tier;
    return true;
  }
}
