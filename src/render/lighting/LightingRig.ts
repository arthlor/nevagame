import * as THREE from "three";
import type { GameState } from "../../simulation/core/types";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { PALETTE_HEX } from "../materials/PaletteTokens";

export interface LightingFrame {
  sunDirection: THREE.Vector3;
  moonDirection: THREE.Vector3;
  sunColor: THREE.Color;
  moonColor: THREE.Color;
  sunIntensity: number;
  moonIntensity: number;
  sunVisibility: number;
  moonVisibility: number;
  starVisibility: number;
  practicalLightIntensity: number;
  daylight: number;
  skyFillIntensity: number;
  skyFillColor: THREE.Color;
  skyTopColor: THREE.Color;
  skyHorizonColor: THREE.Color;
  groundFillColor: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  lightning: number;
  lightningDirection: THREE.Vector3;
  lightningColor: THREE.Color;
  exposure: number;
}

const SKY_DAY = new THREE.Color(CANONICAL_RENDER_CONFIG.skyFill.skyColorHex);
const SKY_NIGHT = new THREE.Color(PALETTE_HEX.water_deep_01).multiplyScalar(0.36);
const HORIZON_DAY = new THREE.Color(PALETTE_HEX.horizon_warm_01);
const HORIZON_NIGHT = new THREE.Color(PALETTE_HEX.water_deep_01).multiplyScalar(0.52);
const GROUND_DAY = new THREE.Color(CANONICAL_RENDER_CONFIG.skyFill.groundColorHex);
const SKY_FILL_NIGHT = new THREE.Color(
  CANONICAL_RENDER_CONFIG.skyFill.nightSkyColorHex
).multiplyScalar(CANONICAL_RENDER_CONFIG.skyFill.nightSkyColorStrength);
const GROUND_NIGHT = new THREE.Color(
  CANONICAL_RENDER_CONFIG.skyFill.nightGroundColorHex
).multiplyScalar(CANONICAL_RENDER_CONFIG.skyFill.nightGroundColorStrength);
const STORM_SKY = new THREE.Color(PALETTE_HEX.rock_coastal_dark_01);
const STORM_HORIZON = new THREE.Color(PALETTE_HEX.stone_cool_01);

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

export function deriveCelestialDirections(minuteOfDay: number): {
  sunDirection: THREE.Vector3;
  moonDirection: THREE.Vector3;
} {
  const normalizedMinute = ((minuteOfDay % 1440) + 1440) % 1440;
  const solarAngle = (normalizedMinute / 1440 - 0.25) * Math.PI * 2;
  const noonAzimuth = THREE.MathUtils.degToRad(CANONICAL_RENDER_CONFIG.sun.noonAzimuthDeg);
  const maxElevation = THREE.MathUtils.degToRad(CANONICAL_RENDER_CONFIG.sun.maxElevationDeg);

  // Two orthogonal axes define one coherent sky orbit: east at sunrise,
  // the configured elevation/azimuth at noon, west at sunset.
  const eastAxis = new THREE.Vector3(Math.cos(noonAzimuth), 0, -Math.sin(noonAzimuth));
  const noonAxis = new THREE.Vector3(
    Math.sin(noonAzimuth) * Math.cos(maxElevation),
    Math.sin(maxElevation),
    Math.cos(noonAzimuth) * Math.cos(maxElevation)
  );
  const sunDirection = eastAxis
    .multiplyScalar(Math.cos(solarAngle))
    .addScaledVector(noonAxis, Math.sin(solarAngle))
    .normalize();
  return { sunDirection, moonDirection: sunDirection.clone().multiplyScalar(-1) };
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
  const { sunDirection, moonDirection } = deriveCelestialDirections(minuteOfDay);
  const solarHeight = sunDirection.y;
  const daylight = smooth01((solarHeight + 0.08) / 0.28);
  const twilight = 1 - smooth01(Math.abs(solarHeight) / 0.24);
  const storm = state.weather.type === "storm";
  const cloudCover = clamp01(state.weather.cloudCover);
  const visibility = clamp01(state.weather.visibility);
  const lightning = storm ? lightningEnvelope(state.worldSeed, timeSeconds) : 0;
  const lightningCycle = Math.floor(timeSeconds / config.weather.lightningCycleSeconds);
  const lightningAngle = hash01(state.worldSeed + lightningCycle * 19.31) * Math.PI * 2;
  const lightningDirection = new THREE.Vector3(
    Math.cos(lightningAngle) * 0.72,
    0.62,
    Math.sin(lightningAngle) * 0.72
  ).normalize();
  const lightningColor = new THREE.Color(config.weather.lightningColorHex);

  const sunWeather = storm
    ? config.weather.stormSunMultiplier
    : THREE.MathUtils.lerp(1, 0.58, cloudCover);
  const moonWeather = storm
    ? config.moon.stormAttenuation
    : THREE.MathUtils.lerp(1, config.moon.cloudAttenuationFloor, cloudCover);
  const sunIntensity = config.sun.intensity * daylight * sunWeather;
  const moonIntensity =
    config.moon.intensity * smooth01((-solarHeight + 0.04) / 0.3) * moonWeather;
  const skyFillIntensity = THREE.MathUtils.lerp(
    config.skyFill.nightIntensity,
    config.skyFill.intensity,
    daylight
  ) * THREE.MathUtils.lerp(0.68, 1, visibility) + lightning * 0.48;

  const sunColor = new THREE.Color(config.sun.horizonColorHex).lerp(
    new THREE.Color(config.sun.colorHex),
    smooth01(Math.max(0, solarHeight) * 1.7)
  );
  const moonColor = new THREE.Color(config.moon.colorHex);
  const skyFillColor = SKY_FILL_NIGHT.clone().lerp(SKY_DAY, daylight);
  const skyTopColor = SKY_NIGHT.clone().lerp(SKY_DAY, daylight);
  const horizonStrength = clamp01(daylight * 0.76 + twilight * 0.72);
  const skyHorizonColor = HORIZON_NIGHT.clone()
    .lerp(HORIZON_DAY, horizonStrength)
    .lerp(skyTopColor, daylight * 0.22);
  const groundFillColor = GROUND_NIGHT.clone().lerp(GROUND_DAY, daylight);
  if (storm) {
    skyFillColor.lerp(STORM_SKY, 0.22);
    skyTopColor.lerp(STORM_SKY, 0.56);
    skyHorizonColor.lerp(STORM_HORIZON, 0.5);
    groundFillColor.lerp(STORM_SKY, 0.34);
  }
  if (lightning > 0) {
    skyFillColor.lerp(lightningColor, lightning * 0.2);
    skyTopColor.lerp(lightningColor, lightning * 0.34);
    skyHorizonColor.lerp(lightningColor, lightning * 0.46);
    groundFillColor.lerp(lightningColor, lightning * 0.18);
  }

  const fogColor = skyTopColor.clone().lerp(skyHorizonColor, storm ? 0.3 : 0.42);
  const fogNear = storm ? config.weather.stormFogNear : config.fog.near;
  const visibilityDistance = THREE.MathUtils.lerp(0.45, 1, visibility);
  const nightDistance = THREE.MathUtils.lerp(0.78, 1, daylight);
  const fogFar = storm
    ? config.weather.stormFogFar
    : Math.max(fogNear + 20, config.fog.far * visibilityDistance * nightDistance);
  const practicalLightIntensity = Math.max(
    smooth01((0.18 - solarHeight) / 0.38),
    storm ? 0.48 : 0
  );
  const starVisibility = storm
    ? 0
    : smooth01((-solarHeight - 0.025) / 0.24) * (1 - cloudCover) * visibility;
  const sunVisibility = smooth01((solarHeight + 0.035) / 0.09) * THREE.MathUtils.lerp(1, 0.4, cloudCover);
  const moonVisibility =
    smooth01((-solarHeight + 0.025) / 0.1) * THREE.MathUtils.lerp(1, 0.3, cloudCover);

  return {
    sunDirection,
    moonDirection,
    sunColor,
    moonColor,
    sunIntensity,
    moonIntensity,
    sunVisibility,
    moonVisibility,
    starVisibility,
    practicalLightIntensity,
    daylight,
    skyFillIntensity,
    skyFillColor,
    skyTopColor,
    skyHorizonColor,
    groundFillColor,
    fogColor,
    fogNear,
    fogFar,
    lightning,
    lightningDirection,
    lightningColor,
    exposure: THREE.MathUtils.lerp(config.nightExposure, config.exposure, daylight)
  };
}

export class LightingRig {
  public readonly sun: THREE.DirectionalLight;
  public readonly moon: THREE.DirectionalLight;
  public readonly skyFill: THREE.HemisphereLight;
  public readonly lightning: THREE.DirectionalLight;
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
    this.moon = new THREE.DirectionalLight(
      CANONICAL_RENDER_CONFIG.moon.colorHex,
      0
    );
    this.configureShadowLight(this.sun);
    this.configureShadowLight(this.moon);
    this.moon.castShadow = false;
    this.scene.add(this.sun, this.sun.target, this.moon, this.moon.target);

    this.skyFill = new THREE.HemisphereLight(
      CANONICAL_RENDER_CONFIG.skyFill.skyColorHex,
      CANONICAL_RENDER_CONFIG.skyFill.groundColorHex,
      CANONICAL_RENDER_CONFIG.skyFill.intensity
    );
    this.scene.add(this.skyFill);

    this.lightning = new THREE.DirectionalLight(
      CANONICAL_RENDER_CONFIG.weather.lightningColorHex,
      0
    );
    this.lightning.castShadow = false;
    this.scene.add(this.lightning, this.lightning.target);
    this.setQuality(this.qualityTier);
  }

  private configureShadowLight(light: THREE.DirectionalLight): void {
    light.castShadow = true;
    light.shadow.bias = CANONICAL_RENDER_CONFIG.shadows.bias;
    light.shadow.normalBias = CANONICAL_RENDER_CONFIG.shadows.normalBias;
    light.shadow.radius = CANONICAL_RENDER_CONFIG.shadows.radius;
    light.shadow.camera.near = CANONICAL_RENDER_CONFIG.shadows.near;
    light.shadow.camera.far = CANONICAL_RENDER_CONFIG.shadows.far;
  }

  public setQuality(tier: QualityTier): void {
    this.qualityTier = tier;
    const quality = CANONICAL_RENDER_CONFIG.quality[tier];
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = CANONICAL_RENDER_CONFIG.shadows.type;
    for (const light of [this.sun, this.moon]) {
      light.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      const camera = light.shadow.camera;
      camera.left = -quality.shadowCameraSize;
      camera.right = quality.shadowCameraSize;
      camera.top = quality.shadowCameraSize;
      camera.bottom = -quality.shadowCameraSize;
      camera.updateProjectionMatrix();
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
  }

  public pixelRatioCap(): number {
    return CANONICAL_RENDER_CONFIG.quality[this.qualityTier].pixelRatioCap;
  }

  public contactShadowsEnabled(): boolean {
    return (
      CANONICAL_RENDER_CONFIG.contact.enabled &&
      CANONICAL_RENDER_CONFIG.quality[this.qualityTier].dynamicContactShadows &&
      CANONICAL_RENDER_CONFIG.quality[this.qualityTier].ambientOcclusion === "contact"
    );
  }

  public update(
    state: Readonly<Pick<GameState, "clock" | "weather" | "worldSeed">>,
    timeSeconds: number,
    focus: THREE.Vector3
  ): LightingFrame {
    const frame = deriveLightingFrame(state, timeSeconds);
    const quality = CANONICAL_RENDER_CONFIG.quality[this.qualityTier];
    const texelSize = (quality.shadowCameraSize * 2) / quality.shadowMapSize;
    this.snappedFocus.set(
      CANONICAL_RENDER_CONFIG.shadows.followSnap ? Math.round(focus.x / texelSize) * texelSize : focus.x,
      focus.y,
      CANONICAL_RENDER_CONFIG.shadows.followSnap ? Math.round(focus.z / texelSize) * texelSize : focus.z
    );

    this.updateCelestialLight(this.sun, frame.sunDirection, frame.sunColor, frame.sunIntensity);
    this.updateCelestialLight(this.moon, frame.moonDirection, frame.moonColor, frame.moonIntensity);
    const moonOwnsShadows = frame.moonIntensity > frame.sunIntensity;
    this.sun.castShadow = !moonOwnsShadows && frame.sunIntensity > 0.01;
    this.moon.castShadow = moonOwnsShadows && frame.moonIntensity > 0.01;

    this.skyFill.color.copy(frame.skyFillColor);
    this.skyFill.groundColor.copy(frame.groundFillColor);
    this.skyFill.intensity = frame.skyFillIntensity;

    this.updateCelestialLight(
      this.lightning,
      frame.lightningDirection,
      frame.lightningColor,
      frame.lightning * CANONICAL_RENDER_CONFIG.weather.lightningIntensity
    );
    this.renderer.toneMappingExposure = frame.exposure;

    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.color.copy(frame.fogColor);
      fog.near = frame.fogNear;
      fog.far = frame.fogFar;
    }
    return frame;
  }

  private updateCelestialLight(
    light: THREE.DirectionalLight,
    direction: THREE.Vector3,
    color: THREE.Color,
    intensity: number
  ): void {
    light.position.copy(this.snappedFocus).addScaledVector(direction, 120);
    light.target.position.copy(this.snappedFocus);
    light.target.updateMatrixWorld();
    light.color.copy(color);
    light.intensity = intensity;
  }
}
