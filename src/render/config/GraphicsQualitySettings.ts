import type { QualityTier } from "./VisualRenderConfig";

export type GraphicsQualityPreference = "auto" | QualityTier;

const STORAGE_KEY = "neva.graphics-quality.v1";
const QUALITY_ORDER: readonly QualityTier[] = ["low", "medium", "high"];

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
  const pixelLoad = window.innerWidth * window.innerHeight * Math.min(window.devicePixelRatio, 2) ** 2;
  if (memory <= 4 || cores <= 4 || pixelLoad >= 9_000_000) return "low";
  if (memory <= 8 || cores <= 6 || pixelLoad >= 5_000_000) return "medium";
  return "high";
}

export class GraphicsQualitySettings {
  private preferenceValue: GraphicsQualityPreference = storedPreference();
  private effectiveValue: QualityTier = this.preferenceValue === "auto"
    ? initialAutoTier()
    : this.preferenceValue;
  private frameTimeEmaMs = 16.67;
  private slowSeconds = 0;
  private fastSeconds = 0;
  private lastAdjustmentMs = Number.NEGATIVE_INFINITY;

  public get preference(): GraphicsQualityPreference {
    return this.preferenceValue;
  }

  public get effectiveTier(): QualityTier {
    return this.effectiveValue;
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
    return this.setEffective(preference === "auto" ? initialAutoTier() : preference);
  }

  /** Auto mode adapts slowly and with asymmetric hysteresis to prevent quality thrashing. */
  public sampleFrame(deltaSeconds: number, nowMs: number): boolean {
    if (this.preferenceValue !== "auto" || deltaSeconds <= 0 || deltaSeconds >= 0.1) return false;
    const frameMs = deltaSeconds * 1000;
    this.frameTimeEmaMs += (frameMs - this.frameTimeEmaMs) * 0.04;
    this.slowSeconds = this.frameTimeEmaMs > 22 ? this.slowSeconds + deltaSeconds : 0;
    this.fastSeconds = this.frameTimeEmaMs < 15.2 ? this.fastSeconds + deltaSeconds : 0;
    if (nowMs - this.lastAdjustmentMs < 5_000) return false;

    const index = QUALITY_ORDER.indexOf(this.effectiveValue);
    if (this.slowSeconds >= 2.5 && index > 0) {
      this.lastAdjustmentMs = nowMs;
      this.slowSeconds = 0;
      this.fastSeconds = 0;
      return this.setEffective(QUALITY_ORDER[index - 1]);
    }
    if (this.fastSeconds >= 10 && index < QUALITY_ORDER.length - 1) {
      this.lastAdjustmentMs = nowMs;
      this.slowSeconds = 0;
      this.fastSeconds = 0;
      return this.setEffective(QUALITY_ORDER[index + 1]);
    }
    return false;
  }

  private setEffective(tier: QualityTier): boolean {
    if (tier === this.effectiveValue) return false;
    this.effectiveValue = tier;
    return true;
  }
}
