import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { FARMHOUSE_INTERIOR_BOUNDS } from "../../world/FarmhouseInterior";
import { WorldLayout } from "../../world/WorldLayout";
import { waterHeight, type WaterConditions } from "../water/WaterSurface";

/** Presentation-only kinematic rain. Never mutates gameplay weather or Rapier. */
export type RainHitKind = "terrain" | "water" | "interior";
export type RainStepResult = "falling" | "hit-terrain" | "hit-water" | "hit-interior" | "lost";

export interface RainDropState {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  length: number;
  generation: number;
}

export interface RainSplashState {
  active: boolean;
  x: number;
  y: number;
  z: number;
  bornAt: number;
  duration: number;
  size: number;
  kind: Exclude<RainHitKind, "interior">;
}

export interface RainFocus {
  x: number;
  y: number;
  z: number;
}

export interface RainWindInput {
  directionX: number;
  directionZ: number;
  effectiveWindSpeed: number;
}

export interface RainSurfaceSample {
  height: number;
  kind: RainHitKind;
}

export type RainSurfaceSampler = (x: number, z: number) => RainSurfaceSample;

export type RainPhysicsConfig = typeof CANONICAL_RENDER_CONFIG.weather.rain;

export function rainPhysicsConfig(): RainPhysicsConfig {
  return CANONICAL_RENDER_CONFIG.weather.rain;
}

/** Fog's 0.05 precipitation stays dry; light-rain (0.45) and above read as rain. */
export function rainVisualIntensity(
  precipitation: number,
  floor: number = rainPhysicsConfig().visiblePrecipitationFloor
): number {
  const wet = Number.isFinite(precipitation) ? precipitation : 0;
  if (wet <= floor) return 0;
  return Math.min(1, (wet - floor) / Math.max(0.0001, 1 - floor));
}

export function rainActiveDropCount(
  tier: QualityTier,
  intensity: number,
  reducedMotionScale = 1
): number {
  if (intensity <= 0) return 0;
  const budget = CANONICAL_RENDER_CONFIG.quality[tier].rainDropCount;
  const motionScale = Math.min(1, Math.max(0.2, reducedMotionScale));
  return Math.max(8, Math.round(budget * (0.28 + intensity * 0.72) * motionScale));
}

export function createRainDrop(): RainDropState {
  return {
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    length: rainPhysicsConfig().dropLengthMin,
    generation: 0
  };
}

export function hashedUnit(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function wrapToVolume(value: number, center: number, halfExtent: number): number {
  const extent = halfExtent * 2;
  if (!(extent > 0) || !Number.isFinite(value) || !Number.isFinite(center)) return center;
  let local = (value - center + halfExtent) % extent;
  if (local < 0) local += extent;
  return local + center - halfExtent;
}

export function sampleRainHitSurface(
  x: number,
  z: number,
  timeSeconds: number,
  conditions: WaterConditions
): RainSurfaceSample {
  if (WorldLayout.isInterior(x, z)) {
    return { height: FARMHOUSE_INTERIOR_BOUNDS.ceilingY, kind: "interior" };
  }
  if (WorldLayout.isWater(x, z)) {
    return { height: waterHeight(x, z, timeSeconds, conditions), kind: "water" };
  }
  return { height: WorldLayout.terrainHeight(x, z), kind: "terrain" };
}

export function rainWindVelocity(wind: RainWindInput, config: RainPhysicsConfig): { vx: number; vz: number } {
  return {
    vx: wind.directionX * wind.effectiveWindSpeed * config.windCoupling,
    vz: wind.directionZ * wind.effectiveWindSpeed * config.windCoupling
  };
}

export function respawnRainDrop(
  drop: RainDropState,
  index: number,
  focus: RainFocus,
  wind: RainWindInput,
  config: RainPhysicsConfig
): void {
  drop.generation += 1;
  const seed = index * 17 + drop.generation * 131;
  const radius = config.volumeRadius;
  drop.x = focus.x + (hashedUnit(seed) * 2 - 1) * radius;
  drop.z = focus.z + (hashedUnit(seed + 1) * 2 - 1) * radius;
  drop.y = focus.y + config.recycleClearance + hashedUnit(seed + 2) * config.spawnHeight;
  const windVelocity = rainWindVelocity(wind, config);
  drop.vx = windVelocity.vx;
  drop.vy = -config.terminalSpeed;
  drop.vz = windVelocity.vz;
  drop.length = rainStreakLength(drop, config);
  drop.active = true;
}

export function rainStreakLength(drop: Pick<RainDropState, "vx" | "vy" | "vz">, config: RainPhysicsConfig): number {
  const speed = Math.hypot(drop.vx, drop.vy, drop.vz);
  const amount = Math.min(1.15, speed / Math.max(0.001, config.terminalSpeed));
  return config.dropLengthMin + (config.dropLengthMax - config.dropLengthMin) * amount;
}

export function stepRainDrop(
  drop: RainDropState,
  dt: number,
  focus: RainFocus,
  wind: RainWindInput,
  config: RainPhysicsConfig,
  sampleSurface: RainSurfaceSampler
): RainStepResult {
  if (!drop.active) return "lost";
  const clampedDt = Math.min(0.1, Math.max(0, dt));
  const windVelocity = rainWindVelocity(wind, config);
  const windBlend = 1 - Math.exp(-config.windResponse * clampedDt);
  drop.vx += (windVelocity.vx - drop.vx) * windBlend;
  drop.vz += (windVelocity.vz - drop.vz) * windBlend;
  drop.vy = Math.max(drop.vy + config.gravity * clampedDt, -config.terminalSpeed);
  drop.x += drop.vx * clampedDt;
  drop.y += drop.vy * clampedDt;
  drop.z += drop.vz * clampedDt;
  drop.x = wrapToVolume(drop.x, focus.x, config.volumeRadius);
  drop.z = wrapToVolume(drop.z, focus.z, config.volumeRadius);
  drop.length = rainStreakLength(drop, config);

  if (drop.y < focus.y - config.spawnHeight - 8) return "lost";

  const surface = sampleSurface(drop.x, drop.z);
  if (drop.y > surface.height) return "falling";
  // Wrap/teleport can plant a drop well below a new hill; recycle without a splash.
  if (surface.height - drop.y > 1.5) return "lost";
  if (surface.kind === "interior") return "hit-interior";
  return surface.kind === "water" ? "hit-water" : "hit-terrain";
}

export function activateRainSplash(
  splash: RainSplashState,
  drop: Pick<RainDropState, "x" | "z">,
  surface: RainSurfaceSample,
  timeSeconds: number,
  config: RainPhysicsConfig
): void {
  if (surface.kind === "interior") {
    splash.active = false;
    return;
  }
  splash.active = true;
  splash.x = drop.x;
  splash.y = surface.height + 0.02;
  splash.z = drop.z;
  splash.bornAt = timeSeconds;
  splash.duration = config.splashDuration;
  splash.size = surface.kind === "water" ? config.splashSizeWater : config.splashSizeTerrain;
  splash.kind = surface.kind;
}

export function splashProgress(splash: RainSplashState, timeSeconds: number): number {
  if (!splash.active) return 1;
  return (timeSeconds - splash.bornAt) / Math.max(0.0001, splash.duration);
}
