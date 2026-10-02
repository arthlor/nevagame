import { CANONICAL_RENDER_CONFIG, type QualityTier } from "./VisualRenderConfig";

/**
 * Player graphics-effect preferences, the policy that resolves them for the
 * active quality tier, and the reduction ladder Auto quality walks under
 * sustained frame pressure.
 *
 * These are local presentation preferences: they are stored in
 * `localStorage`, never in the game save, and changing them never touches
 * simulation state. `VisualRenderConfig.postProcessing` owns every bound.
 */

export type PostProcessingMode = "auto" | "off" | "custom";
export type AmbientOcclusionChoice = "off" | "auto" | "high";
export type GlowChoice = "off" | "subtle" | "hdr";
export type EdgeSmoothingChoice = "auto" | "off" | "fast";
/** `"auto"`, or one of `postProcessing.renderResolution.manualScales`. */
export type RenderResolutionChoice = "auto" | number;

export interface ColorFinish {
  saturation: number;
  contrast: number;
  warmth: number;
}

export interface CustomEffectChoices {
  ambientOcclusion: AmbientOcclusionChoice;
  aoStrength: number;
  glow: GlowChoice;
  sunShafts: boolean;
  edgeSmoothing: EdgeSmoothingChoice;
  colorFinish: ColorFinish;
}

export interface GraphicsEffectPreferences {
  postProcessing: PostProcessingMode;
  /** Individual choices, applied only while `postProcessing` is `"custom"`. */
  custom: CustomEffectChoices;
  /** Multiplies the time/weather exposure. Applies on every tier. */
  brightness: number;
  renderResolution: RenderResolutionChoice;
}

export const NEUTRAL_COLOR_FINISH: Readonly<ColorFinish> = Object.freeze({ saturation: 1, contrast: 1, warmth: 0 });

export const DEFAULT_GRAPHICS_EFFECTS: Readonly<GraphicsEffectPreferences> = Object.freeze({
  postProcessing: "auto",
  custom: Object.freeze({
    ambientOcclusion: "auto",
    aoStrength: 1,
    glow: "subtle",
    sunShafts: true,
    edgeSmoothing: "auto",
    colorFinish: NEUTRAL_COLOR_FINISH
  }) as CustomEffectChoices,
  brightness: 1,
  renderResolution: "auto"
}) as GraphicsEffectPreferences;

/** What the renderer actually applies for one tier. */
export interface ResolvedGraphicsEffects {
  ambientOcclusion: "off" | "contact" | "gtao";
  aoStrength: number;
  /** Auto frame pacing is running AO gather/denoise at the reduced scale. */
  aoReduced: boolean;
  practicalGlow: boolean;
  hdrBloom: boolean;
  sunShafts: boolean;
  fxaa: boolean;
  colorFinish: ColorFinish;
  brightness: number;
  /** Share of the tier's scene pixel ratio. */
  resolutionScale: number;
}

export type ReductionStep = "sun-shafts" | "bloom" | "ambient-occlusion" | "resolution";

/** Temporary Auto-quality reductions. They never change saved preferences. */
export interface AutoReductions {
  sunShafts: boolean;
  bloom: boolean;
  ambientOcclusion: boolean;
  /** Index into `postProcessing.renderResolution.autoScales`. */
  resolutionStep: number;
}

export const NO_AUTO_REDUCTIONS: Readonly<AutoReductions> = Object.freeze({
  sunShafts: false,
  bloom: false,
  ambientOcclusion: false,
  resolutionStep: 0
});

const STORAGE_KEY = "neva.graphics-effects.v1";
const STORAGE_VERSION = 1;

const POST_MODES: readonly PostProcessingMode[] = ["auto", "off", "custom"];
const AO_CHOICES: readonly AmbientOcclusionChoice[] = ["off", "auto", "high"];
const GLOW_CHOICES: readonly GlowChoice[] = ["off", "subtle", "hdr"];
const EDGE_CHOICES: readonly EdgeSmoothingChoice[] = ["auto", "off", "fast"];

function oneOf<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && (choices as readonly string[]).includes(value) ? value as T : fallback;
}

function bounded(value: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, value));
}

function parseColorFinish(value: unknown): ColorFinish {
  const bounds = CANONICAL_RENDER_CONFIG.postProcessing.colorFinish;
  const candidate = value && typeof value === "object" ? value as Partial<ColorFinish> : {};
  return {
    saturation: bounded(candidate.saturation, bounds.saturation, NEUTRAL_COLOR_FINISH.saturation),
    contrast: bounded(candidate.contrast, bounds.contrast, NEUTRAL_COLOR_FINISH.contrast),
    warmth: bounded(candidate.warmth, bounds.warmth, NEUTRAL_COLOR_FINISH.warmth)
  };
}

function parseResolution(value: unknown): RenderResolutionChoice {
  if (value === "auto") return "auto";
  const scales = CANONICAL_RENDER_CONFIG.postProcessing.renderResolution.manualScales;
  return typeof value === "number" && scales.includes(value) ? value : "auto";
}

/**
 * Validates untrusted stored data field by field. Anything unknown, out of
 * range or from another storage version falls back to the default rather than
 * rejecting the whole record, so one bad field never resets every choice.
 */
export function parseGraphicsEffectPreferences(value: unknown): GraphicsEffectPreferences {
  if (!value || typeof value !== "object") return cloneGraphicsEffectPreferences(DEFAULT_GRAPHICS_EFFECTS);
  const candidate = value as Partial<GraphicsEffectPreferences> & { version?: unknown };
  if (candidate.version !== undefined && candidate.version !== STORAGE_VERSION) {
    return cloneGraphicsEffectPreferences(DEFAULT_GRAPHICS_EFFECTS);
  }
  const bounds = CANONICAL_RENDER_CONFIG.postProcessing;
  const custom = candidate.custom && typeof candidate.custom === "object"
    ? candidate.custom as Partial<CustomEffectChoices>
    : {};
  const defaults = DEFAULT_GRAPHICS_EFFECTS.custom;
  return {
    postProcessing: oneOf(candidate.postProcessing, POST_MODES, DEFAULT_GRAPHICS_EFFECTS.postProcessing),
    custom: {
      ambientOcclusion: oneOf(custom.ambientOcclusion, AO_CHOICES, defaults.ambientOcclusion),
      aoStrength: bounded(custom.aoStrength, bounds.ambientOcclusion.strength, defaults.aoStrength),
      glow: oneOf(custom.glow, GLOW_CHOICES, defaults.glow),
      sunShafts: typeof custom.sunShafts === "boolean" ? custom.sunShafts : defaults.sunShafts,
      edgeSmoothing: oneOf(custom.edgeSmoothing, EDGE_CHOICES, defaults.edgeSmoothing),
      colorFinish: parseColorFinish(custom.colorFinish)
    },
    brightness: bounded(candidate.brightness, bounds.brightness, DEFAULT_GRAPHICS_EFFECTS.brightness),
    renderResolution: parseResolution(candidate.renderResolution)
  };
}

export function cloneGraphicsEffectPreferences(value: Readonly<GraphicsEffectPreferences>): GraphicsEffectPreferences {
  return { ...value, custom: { ...value.custom, colorFinish: { ...value.custom.colorFinish } } };
}

export function isNeutralColorFinish(finish: Readonly<ColorFinish>): boolean {
  return finish.saturation === 1 && finish.contrast === 1 && finish.warmth === 0;
}

export function isDefaultGraphicsEffectPreferences(value: Readonly<GraphicsEffectPreferences>): boolean {
  const defaults = DEFAULT_GRAPHICS_EFFECTS;
  return value.postProcessing === defaults.postProcessing
    && value.brightness === defaults.brightness
    && value.renderResolution === defaults.renderResolution
    && value.custom.ambientOcclusion === defaults.custom.ambientOcclusion
    && value.custom.aoStrength === defaults.custom.aoStrength
    && value.custom.sunShafts === defaults.custom.sunShafts
    && value.custom.glow === defaults.custom.glow
    && value.custom.edgeSmoothing === defaults.custom.edgeSmoothing
    && isNeutralColorFinish(value.custom.colorFinish);
}

/** The individual choices a post-processing mode stands for. */
export function effectiveCustomChoices(preferences: Readonly<GraphicsEffectPreferences>): CustomEffectChoices {
  switch (preferences.postProcessing) {
    case "custom":
      return { ...preferences.custom, colorFinish: { ...preferences.custom.colorFinish } };
    case "off":
      return {
        ambientOcclusion: "off",
        aoStrength: preferences.custom.aoStrength,
        glow: "subtle",
        sunShafts: false,
        edgeSmoothing: "off",
        colorFinish: { ...NEUTRAL_COLOR_FINISH }
      };
    case "auto":
      return { ...DEFAULT_GRAPHICS_EFFECTS.custom, colorFinish: { ...NEUTRAL_COLOR_FINISH } };
  }
}

/**
 * Resolves preferences for a tier. Full-screen effects exist only on a tier
 * whose `enhancedPostPath` is set; elsewhere a choice that needs it resolves to
 * the tier's own behaviour, and the settings UI explains why.
 */
export function resolveGraphicsEffects(
  preferences: Readonly<GraphicsEffectPreferences>,
  tier: QualityTier,
  reductions: Readonly<AutoReductions> = NO_AUTO_REDUCTIONS
): ResolvedGraphicsEffects {
  const config = CANONICAL_RENDER_CONFIG;
  const quality = config.quality[tier];
  const enhanced = quality.enhancedPostPath;
  const choices = effectiveCustomChoices(preferences);
  const offMode = preferences.postProcessing === "off";

  let ambientOcclusion: ResolvedGraphicsEffects["ambientOcclusion"];
  if (choices.ambientOcclusion === "off") {
    // Post-processing Off removes full-screen AO only; the contact disc is
    // scene geometry. An explicit Custom "off" removes both.
    ambientOcclusion = offMode && quality.ambientOcclusion === "contact" ? "contact" : "off";
  } else if (choices.ambientOcclusion === "high" && enhanced) {
    ambientOcclusion = "gtao";
  } else {
    ambientOcclusion = quality.ambientOcclusion;
  }
  if (ambientOcclusion === "gtao" && !enhanced) ambientOcclusion = "off";

  const wantsBloom = choices.glow === "hdr" && enhanced;
  const hdrBloom = wantsBloom && !reductions.bloom;
  const fxaa = enhanced && (choices.edgeSmoothing === "fast" || choices.edgeSmoothing === "auto");
  const autoScales = config.postProcessing.renderResolution.autoScales;
  const resolutionScale = preferences.renderResolution === "auto"
    ? autoScales[Math.min(autoScales.length - 1, Math.max(0, reductions.resolutionStep))] ?? 1
    : preferences.renderResolution;

  return {
    ambientOcclusion,
    aoStrength: choices.aoStrength,
    aoReduced: ambientOcclusion === "gtao" && reductions.ambientOcclusion,
    // A suspended HDR bloom falls back to the sprites so lamps still glow.
    practicalGlow: choices.glow === "subtle" || (choices.glow === "hdr" && !hdrBloom),
    hdrBloom,
    sunShafts: enhanced && choices.sunShafts && !reductions.sunShafts,
    fxaa,
    colorFinish: enhanced ? { ...choices.colorFinish } : { ...NEUTRAL_COLOR_FINISH },
    brightness: preferences.brightness,
    resolutionScale
  };
}

/** Ordered Auto-quality reductions that apply before a tier drop. */
export function reductionLadder(
  preferences: Readonly<GraphicsEffectPreferences>,
  tier: QualityTier
): ReductionStep[] {
  const requested = resolveGraphicsEffects(preferences, tier);
  const ladder: ReductionStep[] = [];
  if (requested.sunShafts) ladder.push("sun-shafts");
  if (requested.hdrBloom) ladder.push("bloom");
  if (requested.ambientOcclusion === "gtao") ladder.push("ambient-occlusion");
  if (preferences.renderResolution === "auto") {
    const steps = CANONICAL_RENDER_CONFIG.postProcessing.renderResolution.autoScales.length - 1;
    for (let step = 0; step < steps; step += 1) ladder.push("resolution");
  }
  return ladder;
}

export function reductionsAtLevel(ladder: readonly ReductionStep[], level: number): AutoReductions {
  const applied = ladder.slice(0, Math.max(0, Math.min(ladder.length, level)));
  return {
    sunShafts: applied.includes("sun-shafts"),
    bloom: applied.includes("bloom"),
    ambientOcclusion: applied.includes("ambient-occlusion"),
    resolutionStep: applied.filter((step) => step === "resolution").length
  };
}

type Listener<T> = (value: Readonly<T>) => void;

function readStoredPreferences(): GraphicsEffectPreferences {
  if (typeof window === "undefined") return cloneGraphicsEffectPreferences(DEFAULT_GRAPHICS_EFFECTS);
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored
      ? parseGraphicsEffectPreferences(JSON.parse(stored) as unknown)
      : cloneGraphicsEffectPreferences(DEFAULT_GRAPHICS_EFFECTS);
  } catch {
    return cloneGraphicsEffectPreferences(DEFAULT_GRAPHICS_EFFECTS);
  }
}

export class GraphicsEffectSettingsStore {
  private value: GraphicsEffectPreferences;
  private readonly listeners = new Set<Listener<GraphicsEffectPreferences>>();

  constructor(initial: GraphicsEffectPreferences = readStoredPreferences()) {
    this.value = initial;
  }

  public get(): Readonly<GraphicsEffectPreferences> {
    return this.value;
  }

  public set(patch: Partial<GraphicsEffectPreferences>): Readonly<GraphicsEffectPreferences> {
    return this.commit(parseGraphicsEffectPreferences({ ...this.value, ...patch }));
  }

  /**
   * Changes individual effects. From Auto or Off this first adopts the choices
   * that mode stood for, so the edit starts from what the player was seeing.
   */
  public customize(patch: Partial<CustomEffectChoices>): Readonly<GraphicsEffectPreferences> {
    const base = effectiveCustomChoices(this.value);
    return this.commit(parseGraphicsEffectPreferences({
      ...this.value,
      postProcessing: "custom",
      custom: { ...base, ...patch, colorFinish: { ...base.colorFinish, ...patch.colorFinish } }
    }));
  }

  /** Restores every graphics-effect default. Audio, interface and saves are untouched. */
  public reset(): Readonly<GraphicsEffectPreferences> {
    return this.commit(cloneGraphicsEffectPreferences(DEFAULT_GRAPHICS_EFFECTS));
  }

  public subscribe(listener: Listener<GraphicsEffectPreferences>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: GraphicsEffectPreferences): Readonly<GraphicsEffectPreferences> {
    if (JSON.stringify(next) === JSON.stringify(this.value)) return this.value;
    this.value = next;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...next }));
      } catch {
        // Keep the choice for this session when storage is unavailable.
      }
    }
    for (const listener of this.listeners) listener(this.value);
    return this.value;
  }
}

export const graphicsEffectSettings = new GraphicsEffectSettingsStore();

/**
 * What the renderer is doing right now, for the settings UI. Published by the
 * application; the UI never derives availability or cost from rules of its own.
 */
export interface GraphicsRuntimeStatus {
  tier: QualityTier;
  /** The world is being drawn; `active` describes real frames only while this is true. */
  rendering: boolean;
  enhancedPath: boolean;
  /** Preferences resolved for the tier without Auto's temporary reductions. */
  requested: ResolvedGraphicsEffects;
  /** What is actually rendering, including reductions and pending changes. */
  active: ResolvedGraphicsEffects;
  reductions: readonly ReductionStep[];
  /** Scene render size in device pixels, or null before the first frame. */
  renderSize: { width: number; height: number; pixelRatio: number } | null;
  /** A pass change is compiling and will take over when ready. */
  preparing: boolean;
  /** Whether Auto can separate GPU from CPU pressure on this device. */
  pressureSignal: "gpu-timing" | "frame-time";
  /** Why the enhanced path is unavailable on this device, when it is. */
  fallbackReason: string | null;
  /** Optional stages that failed to compile and stay off until requested again. */
  failedStages: readonly string[];
}

export class GraphicsRuntimeStatusStore {
  private value: GraphicsRuntimeStatus | null = null;
  private serialized = "";
  private readonly listeners = new Set<Listener<GraphicsRuntimeStatus | null>>();

  public get(): Readonly<GraphicsRuntimeStatus> | null {
    return this.value;
  }

  /** Publishes only real changes, so a per-frame caller costs one comparison. */
  public publish(status: GraphicsRuntimeStatus): void {
    const serialized = JSON.stringify(status);
    if (serialized === this.serialized) return;
    this.serialized = serialized;
    this.value = status;
    for (const listener of this.listeners) listener(this.value);
  }

  public subscribe(listener: Listener<GraphicsRuntimeStatus | null>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const graphicsRuntimeStatus = new GraphicsRuntimeStatusStore();
