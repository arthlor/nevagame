import * as THREE from "three";
import type { GameState } from "../../simulation/core/types";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { PALETTE_HEX } from "../materials/PaletteTokens";

export interface LightingFrame {
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  skyFillIntensity: number;
  skyTopColor: THREE.Color;
  skyHorizonColor: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  lightning: number;
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smooth01(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function hash01(value: number): number {
  const sine = Math.sin(value * 12.9898) * 43758.5453;
  return sine - Math.floor(sine);
}

/** Deterministic multi-stroke flash used only for storm presentation. */
export function lightningEnvelope(worldSeed: number, timeSeconds: number): number {
  const config = CANONICAL_RENDER_CONFIG.weather;
  const cycleIndex = Math.floor(timeSeconds / config.lightningCycleSeconds);
  const cycleTime = timeSeconds - cycleIndex * config.lightningCycleSeconds;
  const strikeStart = 1.2 + hash01(worldSeed + cycleIndex * 37.17) * 5.8;
  const phase = cycleTime - strikeStart;
  if (phase < 0 || phase > config.lightningDurationSeconds) return 0;

  const pulse = (start: number, duration: number, strength: number): number => {
    const local = (phase - start) / duration;
    return local >= 0 && local <= 1 ? Math.sin(local * Math.PI) * strength : 0;
  };
  return Math.max(pulse(0, 0.07, 1), pulse(0.13, 0.08, 0.7), pulse(0.29, 0.11, 0.38));
}

export function deriveLightingFrame(
  state: Pick<GameState, "clock" | "weather" | "worldSeed">,
  timeSeconds: number
): LightingFrame {
  const config = CANONICAL_RENDER_CONFIG;
  const minuteOfDay = ((state.clock.currentMinute % 1440) + 1440) % 1440;
  const solarHeight = Math.sin((minuteOfDay / 1440 - 0.25) * Math.PI * 2);
  const daylight = smooth01((solarHeight + 0.12) / 0.34);
  const elevation = THREE.MathUtils.lerp(
    config.sun.minElevationDeg,
    config.sun.maxElevationDeg,
    clamp01(solarHeight)
  );
  const azimuth = config.sun.azimuthDeg + (minuteOfDay / 1440 - 0.5) * 34;
  const elevationRad = THREE.MathUtils.degToRad(elevation);
  const azimuthRad = THREE.MathUtils.degToRad(azimuth);
  const sunDirection = new THREE.Vector3(
    Math.sin(azimuthRad) * Math.cos(elevationRad),
    Math.sin(elevationRad),
    Math.cos(azimuthRad) * Math.cos(elevationRad)
  ).normalize();

  const storm = state.weather.type === "storm";
  const cloudAttenuation = THREE.MathUtils.lerp(1, 0.7, clamp01(state.weather.cloudCover));
  const weatherAttenuation = storm ? config.weather.stormSunMultiplier : cloudAttenuation;
  const sunIntensity = THREE.MathUtils.lerp(config.sun.nightIntensity, config.sun.intensity, daylight) * weatherAttenuation;
  const skyFillIntensity = THREE.MathUtils.lerp(
    config.skyFill.nightIntensity,
    config.skyFill.intensity,
    daylight
  ) * THREE.MathUtils.lerp(0.68, 1, clamp01(state.weather.visibility));

  const sunColor = new THREE.Color(config.sun.horizonColorHex).lerp(
    new THREE.Color(config.sun.colorHex),
    smooth01(clamp01(solarHeight) * 1.4)
  );
  const skyTopColor = new THREE.Color(PALETTE_HEX.water_deep_01).lerp(
    new THREE.Color(config.skyFill.skyColorHex),
    daylight
  );
  const skyHorizonColor = new THREE.Color(PALETTE_HEX.horizon_warm_01).lerp(
    skyTopColor,
    THREE.MathUtils.lerp(0.1, 0.52, daylight)
  );
  if (storm) {
    skyTopColor.lerp(new THREE.Color(PALETTE_HEX.rock_coastal_dark_01), 0.5);
    skyHorizonColor.lerp(new THREE.Color(PALETTE_HEX.stone_cool_01), 0.45);
  }

  const fogColor = skyTopColor.clone().lerp(skyHorizonColor, storm ? 0.3 : 0.42);
  const fogNear = storm ? config.weather.stormFogNear : config.fog.near;
  const fogFar = storm
    ? config.weather.stormFogFar
    : Math.max(fogNear + 20, config.fog.far * THREE.MathUtils.lerp(0.45, 1, clamp01(state.weather.visibility)));
  const lightning = storm ? lightningEnvelope(state.worldSeed, timeSeconds) : 0;

  return {
    sunDirection,
    sunColor,
    sunIntensity,
    skyFillIntensity,
    skyTopColor,
    skyHorizonColor,
    fogColor,
    fogNear,
    fogFar,
    lightning
  };
}

export class LightingRig {
  public readonly sun: THREE.DirectionalLight;
  public readonly skyFill: THREE.HemisphereLight;
  public readonly lightning: THREE.PointLight;
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private qualityTier: QualityTier;
  private readonly snappedFocus = new THREE.Vector3();

  public constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.qualityTier = CANONICAL_RENDER_CONFIG.qualityTier;

    this.sun = new THREE.DirectionalLight(
      CANONICAL_RENDER_CONFIG.sun.colorHex,
      CANONICAL_RENDER_CONFIG.sun.intensity
    );
    this.sun.castShadow = true;
    this.sun.shadow.bias = CANONICAL_RENDER_CONFIG.shadows.bias;
    this.sun.shadow.normalBias = CANONICAL_RENDER_CONFIG.shadows.normalBias;
    this.sun.shadow.radius = CANONICAL_RENDER_CONFIG.shadows.radius;
    this.sun.shadow.camera.near = CANONICAL_RENDER_CONFIG.shadows.near;
    this.sun.shadow.camera.far = CANONICAL_RENDER_CONFIG.shadows.far;
    this.scene.add(this.sun, this.sun.target);

    this.skyFill = new THREE.HemisphereLight(
      CANONICAL_RENDER_CONFIG.skyFill.skyColorHex,
      CANONICAL_RENDER_CONFIG.skyFill.groundColorHex,
      CANONICAL_RENDER_CONFIG.skyFill.intensity
    );
    this.scene.add(this.skyFill);

    this.lightning = new THREE.PointLight(
      CANONICAL_RENDER_CONFIG.weather.lightningColorHex,
      0,
      160,
      1.35
    );
    this.scene.add(this.lightning);
    this.setQuality(this.qualityTier);
  }

  public setQuality(tier: QualityTier): void {
    this.qualityTier = tier;
    const quality = CANONICAL_RENDER_CONFIG.quality[tier];
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = CANONICAL_RENDER_CONFIG.shadows.type;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    const camera = this.sun.shadow.camera;
    camera.left = -quality.shadowCameraSize;
    camera.right = quality.shadowCameraSize;
    camera.top = quality.shadowCameraSize;
    camera.bottom = -quality.shadowCameraSize;
    camera.updateProjectionMatrix();
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  public pixelRatioCap(): number {
    return CANONICAL_RENDER_CONFIG.quality[this.qualityTier].pixelRatioCap;
  }

  public contactShadowsEnabled(): boolean {
    return (
      CANONICAL_RENDER_CONFIG.contact.enabled &&
      CANONICAL_RENDER_CONFIG.quality[this.qualityTier].dynamicContactShadows
    );
  }

  public update(state: Readonly<GameState>, timeSeconds: number, focus: THREE.Vector3): LightingFrame {
    const frame = deriveLightingFrame(state, timeSeconds);
    const quality = CANONICAL_RENDER_CONFIG.quality[this.qualityTier];
    const texelSize = (quality.shadowCameraSize * 2) / quality.shadowMapSize;
    this.snappedFocus.set(
      CANONICAL_RENDER_CONFIG.shadows.followSnap ? Math.round(focus.x / texelSize) * texelSize : focus.x,
      focus.y,
      CANONICAL_RENDER_CONFIG.shadows.followSnap ? Math.round(focus.z / texelSize) * texelSize : focus.z
    );

    this.sun.position.copy(this.snappedFocus).addScaledVector(frame.sunDirection, 120);
    this.sun.target.position.copy(this.snappedFocus);
    this.sun.target.updateMatrixWorld();
    this.sun.color.copy(frame.sunColor);
    this.sun.intensity = frame.sunIntensity;
    this.skyFill.color.copy(frame.skyTopColor);
    this.skyFill.groundColor.set(CANONICAL_RENDER_CONFIG.skyFill.groundColorHex);
    this.skyFill.intensity = frame.skyFillIntensity;

    const cycle = Math.floor(timeSeconds / CANONICAL_RENDER_CONFIG.weather.lightningCycleSeconds);
    const angle = hash01(state.worldSeed + cycle * 19.31) * Math.PI * 2;
    this.lightning.position.copy(this.snappedFocus).add(
      new THREE.Vector3(Math.cos(angle) * 24, 34, Math.sin(angle) * 24)
    );
    this.lightning.intensity = frame.lightning * CANONICAL_RENDER_CONFIG.weather.lightningIntensity;
    this.renderer.toneMappingExposure =
      CANONICAL_RENDER_CONFIG.exposure + frame.lightning * 0.035;

    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.color.copy(frame.fogColor);
      fog.near = frame.fogNear;
      fog.far = frame.fogFar;
    }
    return frame;
  }
}
