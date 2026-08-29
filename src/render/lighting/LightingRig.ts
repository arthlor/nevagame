import * as THREE from "three";
import type { GameState } from "../../simulation/core/types";
import {
  DAWN_START_HOUR,
  DAY_START_HOUR,
  DUSK_START_HOUR,
  MINUTES_PER_HOUR,
  NIGHT_START_HOUR
} from "../../simulation/core/GameClock";
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
  /** Max of solar daylight and the clock dawn/dusk ramp. Fill, sky, and practicals use this. */
  ambientDaylight: number;
}

const SKY_DAY = new THREE.Color(CANONICAL_RENDER_CONFIG.skyFill.skyColorHex);
const SKY_CLEAR_DAY = SKY_DAY.clone().offsetHSL(
  CANONICAL_RENDER_CONFIG.skyFill.clearDayHueOffset,
  CANONICAL_RENDER_CONFIG.skyFill.clearDaySaturationLift,
  CANONICAL_RENDER_CONFIG.skyFill.clearDayLightnessOffset
);
const SKY_NIGHT = new THREE.Color(PALETTE_HEX.water_deep_01).multiplyScalar(0.36);
const HORIZON_DAY = new THREE.Color(PALETTE_HEX.horizon_warm_01);
const HORIZON_CLEAR_DAY = HORIZON_DAY.clone().lerp(
  SKY_CLEAR_DAY,
  CANONICAL_RENDER_CONFIG.skyFill.clearDayHorizonBlueMix
);
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
const SUN_DAY = new THREE.Color(CANONICAL_RENDER_CONFIG.sun.colorHex);

function createLightingFrame(): LightingFrame {
  return {
    sunDirection: new THREE.Vector3(),
    moonDirection: new THREE.Vector3(),
    sunColor: new THREE.Color(),
    moonColor: new THREE.Color(),
    sunIntensity: 0,
    moonIntensity: 0,
    sunVisibility: 0,
    moonVisibility: 0,
    starVisibility: 0,
    practicalLightIntensity: 0,
    daylight: 0,
    skyFillIntensity: 0,
    skyFillColor: new THREE.Color(),
    skyTopColor: new THREE.Color(),
    skyHorizonColor: new THREE.Color(),
    groundFillColor: new THREE.Color(),
    fogColor: new THREE.Color(),
    fogNear: 0,
    fogFar: 0,
    lightning: 0,
    lightningDirection: new THREE.Vector3(),
    lightningColor: new THREE.Color(),
    exposure: 1,
    ambientDaylight: 0
  };
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

/**
 * Quantizes the shadow receiver center on the directional light's projected
 * texel grid. World X/Z snapping is not stable once the light is angled: a
 * small player movement then crosses several unrelated shadow texels.
 */
export function snapShadowFocus(
  focus: THREE.Vector3,
  lightDirection: THREE.Vector3,
  texelSize: number,
  out = new THREE.Vector3(),
  direction = new THREE.Vector3(),
  right = new THREE.Vector3(),
  up = new THREE.Vector3()
): THREE.Vector3 {
  if (!Number.isFinite(texelSize) || texelSize <= 0 || lightDirection.lengthSq() < 0.000001) {
    return out.copy(focus);
  }

  direction.copy(lightDirection).normalize();
  right.set(0, 1, 0).cross(direction);
  if (right.lengthSq() < 0.000001) return out.copy(focus);
  right.normalize();
  up.copy(direction).cross(right).normalize();
  const lightX = focus.dot(right);
  const lightY = focus.dot(up);
  return out.copy(focus)
    .addScaledVector(right, Math.round(lightX / texelSize) * texelSize - lightX)
    .addScaledVector(up, Math.round(lightY / texelSize) * texelSize - lightY);
}

/**
 * Ambient above night during the HUD dawn/dusk windows. 04:00 starts at
 * `edgeAmbient`; 08:00 reaches day; 18:00 matches sunrise; 22:00 returns to night.
 */
export function clockWindowAmbient(minuteOfDay: number, edgeAmbient: number): number {
  const minute = ((minuteOfDay % 1440) + 1440) % 1440;
  const dawn0 = DAWN_START_HOUR * MINUTES_PER_HOUR;
  const dawn1 = DAY_START_HOUR * MINUTES_PER_HOUR;
  const dusk0 = DUSK_START_HOUR * MINUTES_PER_HOUR;
  const dusk1 = NIGHT_START_HOUR * MINUTES_PER_HOUR;
  const edge = clamp01(edgeAmbient);
  if (minute >= dawn0 && minute < dawn1) {
    const t = (minute - dawn0) / (dawn1 - dawn0);
    return edge + (1 - edge) * smooth01(t);
  }
  if (minute >= dusk0 && minute < dusk1) {
    const t = (minute - dusk0) / (dusk1 - dusk0);
    const sunsetAmbient = edge + (1 - edge) * smooth01(0.5);
    return sunsetAmbient * (1 - t) ** 0.7;
  }
  return 0;
}

export function deriveCelestialDirections(
  minuteOfDay: number,
  sunDirection = new THREE.Vector3(),
  moonDirection = new THREE.Vector3()
): {
  sunDirection: THREE.Vector3;
  moonDirection: THREE.Vector3;
} {
  const normalizedMinute = ((minuteOfDay % 1440) + 1440) % 1440;
  const solarAngle = (normalizedMinute / 1440 - 0.25) * Math.PI * 2;
  const noonAzimuth = THREE.MathUtils.degToRad(CANONICAL_RENDER_CONFIG.sun.noonAzimuthDeg);
  const maxElevation = THREE.MathUtils.degToRad(CANONICAL_RENDER_CONFIG.sun.maxElevationDeg);

  // Two orthogonal axes define one coherent sky orbit: east at sunrise,
  // the configured elevation/azimuth at noon, west at sunset.
  const eastScale = Math.cos(solarAngle);
  const noonScale = Math.sin(solarAngle);
  sunDirection.set(
    Math.cos(noonAzimuth) * eastScale + Math.sin(noonAzimuth) * Math.cos(maxElevation) * noonScale,
    Math.sin(maxElevation) * noonScale,
    -Math.sin(noonAzimuth) * eastScale + Math.cos(noonAzimuth) * Math.cos(maxElevation) * noonScale
  ).normalize();
  moonDirection.copy(sunDirection).multiplyScalar(-1);
  return { sunDirection, moonDirection };
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
  timeSeconds: number,
  target?: LightingFrame
): LightingFrame {
  const frame = target ?? createLightingFrame();
  const config = CANONICAL_RENDER_CONFIG;
  const minuteOfDay = ((state.clock.currentMinute % 1440) + 1440) % 1440;
  const { sunDirection, moonDirection } = deriveCelestialDirections(
    minuteOfDay,
    frame.sunDirection,
    frame.moonDirection
  );
  const solarHeight = sunDirection.y;
  const daylight = smooth01((solarHeight + 0.08) / 0.28);
  const twilight = 1 - smooth01(Math.abs(solarHeight) / 0.24);
  const clockAmbient = clockWindowAmbient(minuteOfDay, config.skyFill.dawnDuskEdgeAmbient);
  const ambientDaylight = Math.max(daylight, clockAmbient);
  const twilightExposure = smooth01(
    (daylight - config.skyFill.twilightExposureHold)
      / Math.max(0.001, 1 - config.skyFill.twilightExposureHold)
  );
  const storm = state.weather.type === "storm";
  const cloudCover = clamp01(state.weather.cloudCover);
  const visibility = clamp01(state.weather.visibility);
  const clearDaylight = state.weather.type === "clear" ? daylight * (1 - twilight) : 0;
  const lightning = storm ? lightningEnvelope(state.worldSeed, timeSeconds) : 0;
  const lightningCycle = Math.floor(timeSeconds / config.weather.lightningCycleSeconds);
  const lightningAngle = hash01(state.worldSeed + lightningCycle * 19.31) * Math.PI * 2;
  const lightningDirection = frame.lightningDirection.set(
    Math.cos(lightningAngle) * 0.72,
    0.62,
    Math.sin(lightningAngle) * 0.72
  ).normalize();
  const lightningColor = frame.lightningColor.set(config.weather.lightningColorHex);

  // Sparse fair-weather clouds leave the direct key intact; keep the existing
  // overcast response and ease back to it as the sun approaches the horizon.
  const sunCloudOcclusion = THREE.MathUtils.lerp(
    cloudCover,
    cloudCover * cloudCover,
    clearDaylight
  );
  const sunWeather = storm
    ? config.weather.stormSunMultiplier
    : THREE.MathUtils.lerp(1, 0.58, sunCloudOcclusion);
  const moonWeather = storm
    ? config.moon.stormAttenuation
    : THREE.MathUtils.lerp(1, config.moon.cloudAttenuationFloor, cloudCover);
  const sunIntensity = config.sun.intensity * daylight * sunWeather;
  const moonIntensity =
    config.moon.intensity
    * smooth01((-solarHeight + config.twilight.moonHoldSolarHeight) / config.twilight.moonFadeWidth)
    * moonWeather;
  const skyFillIntensity =
    THREE.MathUtils.lerp(
      config.skyFill.nightIntensity,
      config.skyFill.intensity,
      ambientDaylight
    ) * THREE.MathUtils.lerp(0.68, 1, visibility)
    + twilight * config.skyFill.twilightFillLift * (1 - ambientDaylight)
    + lightning * 0.48;

  const sunColor = frame.sunColor.set(config.sun.horizonColorHex).lerp(
    SUN_DAY,
    smooth01(Math.max(0, solarHeight) * 1.7)
  );
  const moonColor = frame.moonColor.set(config.moon.colorHex);
  const skyFillColor = frame.skyFillColor.copy(SKY_FILL_NIGHT).lerp(SKY_DAY, ambientDaylight);
  const skyTopColor = frame.skyTopColor.copy(SKY_NIGHT)
    .lerp(SKY_DAY, ambientDaylight)
    .lerp(HORIZON_DAY, twilight * config.skyFill.twilightZenithHorizonMix);
  const horizonStrength = clamp01(ambientDaylight * 0.76 + twilight * 0.72);
  const skyHorizonColor = frame.skyHorizonColor.copy(HORIZON_NIGHT)
    .lerp(HORIZON_DAY, horizonStrength)
    .lerp(skyTopColor, ambientDaylight * 0.22);
  const groundFillColor = frame.groundFillColor.copy(GROUND_NIGHT).lerp(GROUND_DAY, ambientDaylight);
  // Clear weather has its own clean-sky radiance instead of inheriting the
  // pale overcast color used by cloudy and rainy states. Keep this coupled to
  // the same daylight envelope, sun direction, fog, and hemisphere fill.
  skyTopColor.lerp(SKY_CLEAR_DAY, clearDaylight);
  skyHorizonColor.lerp(HORIZON_CLEAR_DAY, clearDaylight);
  skyFillColor.lerp(SKY_CLEAR_DAY, clearDaylight * 0.32);
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

  const fogColor = frame.fogColor.copy(skyTopColor).lerp(
    skyHorizonColor,
    storm ? 0.3 : THREE.MathUtils.lerp(0.42, 0.24, clearDaylight)
  );
  const fogNear = storm
    ? config.weather.stormFogNear
    : THREE.MathUtils.lerp(config.fog.near, config.fog.clearDayNear, clearDaylight);
  const visibilityDistance = THREE.MathUtils.lerp(0.45, 1, visibility);
  const nightDistance = THREE.MathUtils.lerp(0.78, 1, ambientDaylight);
  const daylightFogFar = THREE.MathUtils.lerp(
    config.fog.far,
    config.fog.clearDayFar,
    clearDaylight
  );
  const fogFar = storm
    ? config.weather.stormFogFar
    : Math.max(fogNear + 20, daylightFogFar * visibilityDistance * nightDistance);
  const practicalLightIntensity = Math.max(
    1 - smooth01(
      (daylight - config.twilight.practicalHoldDaylight)
        / Math.max(0.001, config.twilight.practicalFadeWidth)
    ),
    storm ? 0.48 : 0
  );
  const starVisibility = storm
    ? 0
    : smooth01((-solarHeight - 0.025) / 0.24) * (1 - cloudCover) * visibility;
  const sunVisibility = smooth01((solarHeight + 0.035) / 0.09) * THREE.MathUtils.lerp(1, 0.4, cloudCover);
  const moonVisibility =
    smooth01((-solarHeight + 0.025) / 0.1) * THREE.MathUtils.lerp(1, 0.3, cloudCover);

  Object.assign(frame, {
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
    exposure: THREE.MathUtils.lerp(config.nightExposure, config.exposure, twilightExposure),
    ambientDaylight
  });
  return frame;
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
  private readonly shadowDirection = new THREE.Vector3();
  private readonly shadowRight = new THREE.Vector3();
  private readonly shadowUp = new THREE.Vector3();
  private readonly frame = createLightingFrame();
  private lastShadowUpdateSeconds = Number.NEGATIVE_INFINITY;

  public constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.renderer.shadowMap.autoUpdate = false;
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
    light.shadow.intensity = CANONICAL_RENDER_CONFIG.shadows.intensity;
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
    this.renderer.shadowMap.needsUpdate = true;
    this.lastShadowUpdateSeconds = Number.NEGATIVE_INFINITY;
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
    const frame = deriveLightingFrame(state, timeSeconds, this.frame);
    const quality = CANONICAL_RENDER_CONFIG.quality[this.qualityTier];
    const texelSize = (quality.shadowCameraSize * 2) / quality.shadowMapSize;
    const shadowDirection = frame.moonIntensity > frame.sunIntensity
      ? frame.moonDirection
      : frame.sunDirection;
    if (CANONICAL_RENDER_CONFIG.shadows.followSnap) {
      snapShadowFocus(
        focus,
        shadowDirection,
        texelSize,
        this.snappedFocus,
        this.shadowDirection,
        this.shadowRight,
        this.shadowUp
      );
    } else {
      this.snappedFocus.copy(focus);
    }

    this.updateCelestialLight(this.sun, frame.sunDirection, frame.sunColor, frame.sunIntensity);
    this.updateCelestialLight(this.moon, frame.moonDirection, frame.moonColor, frame.moonIntensity);
    const moonOwnsShadows = frame.moonIntensity > frame.sunIntensity;
    this.sun.castShadow = !moonOwnsShadows && frame.sunIntensity > 0.01;
    this.moon.castShadow = moonOwnsShadows && frame.moonIntensity > 0.01;
    if (timeSeconds - this.lastShadowUpdateSeconds >= 0.12) {
      this.renderer.shadowMap.needsUpdate = true;
      this.lastShadowUpdateSeconds = timeSeconds;
    }

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
    light.updateMatrixWorld();
    light.color.copy(color);
    light.intensity = intensity;
  }
}
