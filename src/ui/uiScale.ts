// src/ui/uiScale.ts

/**
 * HUD sizing used to be fixed pixels, so the same layout read as oversized on
 * a 720p window and as a cluster of postage stamps on a 4K display. The scale
 * is published as a CSS custom property and consumed with `zoom`, which scales
 * layout boxes and hit testing together.
 */
export type UiScalePreference = "auto" | "small" | "normal" | "large";

export const UI_SCALE_PREFERENCES: readonly UiScalePreference[] = [
  "auto",
  "small",
  "normal",
  "large"
];

const STORAGE_KEY = "neva.ui.scale";

/** The layout was authored against this window size. */
const REFERENCE_WIDTH = 1440;
const REFERENCE_HEIGHT = 810;

const EXPLICIT_SCALES: Record<Exclude<UiScalePreference, "auto">, number> = {
  small: 0.85,
  normal: 1,
  large: 1.2
};

const AUTO_MINIMUM = 0.85;
const AUTO_MAXIMUM = 1.35;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Quantised so a slow window drag does not restyle the HUD on every pixel. */
export function autoScaleFor(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  const raw = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT);
  return Math.round(clamp(raw, AUTO_MINIMUM, AUTO_MAXIMUM) * 20) / 20;
}

export function resolveUiScale(
  preference: UiScalePreference,
  width: number,
  height: number
): number {
  return preference === "auto" ? autoScaleFor(width, height) : EXPLICIT_SCALES[preference];
}

export function isUiScalePreference(value: unknown): value is UiScalePreference {
  return typeof value === "string" && (UI_SCALE_PREFERENCES as readonly string[]).includes(value);
}

type Listener = (preference: UiScalePreference, scale: number) => void;

class UiScaleController {
  private preference: UiScalePreference = "auto";
  private scale = 1;
  private readonly listeners = new Set<Listener>();
  private started = false;

  public start(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.preference = this.readStoredPreference();
    window.addEventListener("resize", this.handleViewportChange);
    window.visualViewport?.addEventListener("resize", this.handleViewportChange);
    this.apply();
  }

  public get current(): UiScalePreference {
    return this.preference;
  }

  public get resolved(): number {
    return this.scale;
  }

  public set(preference: UiScalePreference): void {
    if (this.preference === preference) return;
    this.preference = preference;
    try {
      window.localStorage?.setItem(STORAGE_KEY, preference);
    } catch {
      // Private browsing and storage-blocked contexts still get the live value.
    }
    this.apply();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.preference, this.scale);
    return () => this.listeners.delete(listener);
  }

  private readStoredPreference(): UiScalePreference {
    try {
      const stored = window.localStorage?.getItem(STORAGE_KEY);
      return isUiScalePreference(stored) ? stored : "auto";
    } catch {
      return "auto";
    }
  }

  private handleViewportChange = (): void => {
    if (this.preference !== "auto") return;
    this.apply();
  };

  private apply(): void {
    const next = resolveUiScale(this.preference, window.innerWidth, window.innerHeight);
    const changed = next !== this.scale;
    this.scale = next;
    document.documentElement.style.setProperty("--ui-scale", String(next));
    if (changed || this.listeners.size > 0) {
      for (const listener of this.listeners) listener(this.preference, this.scale);
    }
  }
}

export const uiScale = new UiScaleController();
