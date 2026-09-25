import { seasonAmbientTint, updateSeasonalTint } from "../materials/SeasonalTint";
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
import type { WeatherAppearance } from "../weather/WeatherPresentation";
import { updateAerialPerspective } from "../atmosphere/AerialPerspective";
import { ShadowAtlasCompositor, type ShadowAtlasDiagnostics } from "./ShadowAtlasCompositor";

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
  stormStrength: number;
  /** Horizon proximity of the sun (the golden-band envelope). */
  twilight: number;
  /** Sunward horizon radiance at twilight, and how strongly it holds the horizon. */
  sunGlowColor: THREE.Color;
  sunGlow: number;
  /** Anti-solar rose band colour and its strength (clear twilight only). */
  antiTwilightColor: THREE.Color;
  antiTwilight: number;
  /** Key colour the clouds see: the sun's, rose-tinted in the afterglow below the horizon. */
  cloudSunColor: THREE.Color;
  /** Forward-scattered haze radiance toward the sun. */
  sunScatterColor: THREE.Color;
  /** Visible sun colour behind cloud cover: the sky's aureole around the disc. */
  sunAureoleColor: THREE.Color;
  /** Morning valley-mist share, 0–1. */
  valleyMist: number;
  /** Per-strike seed that shapes the visible storm bolt. */
  lightningSeed: number;
}

/**
 * Every sky and fill colour, derived from palette tokens plus the HSL offsets
 * in `VisualRenderConfig`. Resolved per frame into reused colours, so the
 * config stays the one live owner of these values.
 */
const palette = {
  skyDay: new THREE.Color(),
  skyClearDay: new THREE.Color(),
  skyNight: new THREE.Color(),
  horizonDay: new THREE.Color(),
  horizonClearDay: new THREE.Color(),
  horizonNight: new THREE.Color(),
  groundDay: new THREE.Color(),
  skyFillNight: new THREE.Color(),
  groundNight: new THREE.Color(),
  stormSky: new THREE.Color(),
  stormHorizon: new THREE.Color(),
  sunDay: new THREE.Color(),
  sunGolden: new THREE.Color(),
  sunEmber: new THREE.Color(),
  twilightZenith: new THREE.Color(),
  twilightFill: new THREE.Color(),
  antiTwilight: new THREE.Color()
};

function resolveSkyPalette(): typeof palette {
  const config = CANONICAL_RENDER_CONFIG;
  const fill = config.skyFill;
  palette.skyDay.set(fill.skyColorHex);
  palette.skyClearDay.copy(palette.skyDay).offsetHSL(
    fill.clearDayHueOffset,
    fill.clearDaySaturationLift,
    fill.clearDayLightnessOffset
  );
  palette.skyNight.set(PALETTE_HEX.water_deep_01).offsetHSL(fill.nightHueOffset, 0, 0).multiplyScalar(0.36);
  palette.horizonDay.set(PALETTE_HEX.horizon_warm_01);
  palette.horizonClearDay.copy(palette.horizonDay).lerp(palette.skyClearDay, fill.clearDayHorizonBlueMix);
  palette.horizonNight.set(PALETTE_HEX.water_deep_01).offsetHSL(fill.nightHueOffset, 0, 0).multiplyScalar(0.52);
  palette.groundDay.set(fill.groundColorHex);
  palette.skyFillNight.set(fill.nightSkyColorHex).offsetHSL(fill.nightHueOffset, 0, 0)
    .multiplyScalar(fill.nightSkyColorStrength);
  palette.groundNight.set(fill.nightGroundColorHex).multiplyScalar(fill.nightGroundColorStrength);
  palette.stormSky.set(PALETTE_HEX.rock_coastal_dark_01);
  palette.stormHorizon.set(PALETTE_HEX.stone_cool_01);
  palette.sunDay.set(config.sun.colorHex);
  palette.sunGolden.set(config.sun.horizonColorHex);
  const ember = config.sun.ember;
  palette.sunEmber.copy(palette.sunGolden).offsetHSL(ember.hueOffset, ember.saturationLift, ember.lightnessOffset);
  const zenith = fill.twilightZenith;
  palette.twilightZenith.copy(palette.skyClearDay).offsetHSL(zenith.hueOffset, zenith.saturationLift, zenith.lightnessOffset);
  // Shade keeps the twilight hue at the daytime fill's value, so the fill
  // cools without dimming.
  palette.twilightFill.copy(palette.skyClearDay).offsetHSL(zenith.hueOffset, zenith.saturationLift, 0);
  const anti = fill.antiTwilight;
  palette.antiTwilight.copy(palette.horizonDay).offsetHSL(anti.hueOffset, anti.saturationLift, anti.lightnessOffset);
  return palette;
}

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
    ambientDaylight: 0,
    stormStrength: 0,
    twilight: 0,
    sunGlowColor: new THREE.Color(),
    sunGlow: 0,
    antiTwilightColor: new THREE.Color(),
    antiTwilight: 0,
    cloudSunColor: new THREE.Color(),
    sunScatterColor: new THREE.Color(),
    sunAureoleColor: new THREE.Color(),
    valleyMist: 0,
    lightningSeed: 0
  };
}

/**
 * Morning valley-mist envelope: rises from the first configured minute,
 * peaks at the second and has burnt off by the third.
 */
export function dawnMistEnvelope(
  minuteOfDay: number,
  minutes: readonly [number, number, number] = CANONICAL_RENDER_CONFIG.atmosphere.aerialPerspective.dawnMistMinutes
): number {
  const minute = ((minuteOfDay % 1440) + 1440) % 1440;
  const [start, peak, end] = minutes;
  if (minute <= start || minute >= end) return 0;
  return minute < peak
    ? smooth01((minute - start) / Math.max(1, peak - start))
    : 1 - smooth01((minute - peak) / Math.max(1, end - peak));
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
 * Continuous ambient support around the HUD dawn/dusk windows. The shoulder
 * reaches `edgeAmbient` at the label boundary, avoiding a one-minute pop.
 */
export function clockWindowAmbient(
  minuteOfDay: number,
  edgeAmbient: number,
  shoulderMinutes: number = CANONICAL_RENDER_CONFIG.twilight.ambientShoulderMinutes
): number {
  const minute = ((minuteOfDay % 1440) + 1440) % 1440;
  const dawn0 = DAWN_START_HOUR * MINUTES_PER_HOUR;
  const dawn1 = DAY_START_HOUR * MINUTES_PER_HOUR;
  const dusk0 = DUSK_START_HOUR * MINUTES_PER_HOUR;
  const dusk1 = NIGHT_START_HOUR * MINUTES_PER_HOUR;
  const edge = clamp01(edgeAmbient);
  const shoulder = THREE.MathUtils.clamp(shoulderMinutes, 1, 180);
  // Sunset keeps a hair more ambient warmth than the mirrored sunrise sample.
  const duskStartAmbient = edge + (1 - edge) * smooth01(0.52);
  if (minute >= dawn0 - shoulder && minute < dawn0) {
    return edge * smooth01((minute - (dawn0 - shoulder)) / shoulder);
  }
  if (minute >= dawn0 && minute < dawn1) {
    const t = (minute - dawn0) / (dawn1 - dawn0);
    return edge + (1 - edge) * smooth01(t);
  }
  if (minute >= dawn1 && minute < dusk0 - shoulder) return 1;
  if (minute >= dusk0 - shoulder && minute < dusk0) {
    return THREE.MathUtils.lerp(
      1,
      duskStartAmbient,
      smooth01((minute - (dusk0 - shoulder)) / shoulder)
    );
  }
  if (minute >= dusk0 && minute < dusk1) {
    const t = (minute - dusk0) / (dusk1 - dusk0);
    return duskStartAmbient * (1 - smooth01(t));
  }
  return 0;
}

export function advanceWrappedMinute(
  currentMinute: number,
  targetMinute: number,
  deltaSeconds: number,
  responseSeconds: number = CANONICAL_RENDER_CONFIG.transitions.timeOfDayResponseSeconds
): number {
  const current = ((currentMinute % 1440) + 1440) % 1440;
  const target = ((targetMinute % 1440) + 1440) % 1440;
  const wrappedDelta = ((target - current + 720) % 1440 + 1440) % 1440 - 720;
  if (Math.abs(wrappedDelta) <= 0.0001) return target;
  const alpha = 1 - Math.exp(-Math.max(0, deltaSeconds) / Math.max(0.001, responseSeconds));
  return ((current + wrappedDelta * alpha) % 1440 + 1440) % 1440;
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
  target?: LightingFrame,
  presentedMinuteOfDay?: number,
  reducedMotion = false,
  appearance?: Pick<WeatherAppearance, "storm" | "clear">
): LightingFrame {
  const frame = target ?? createLightingFrame();
  const config = CANONICAL_RENDER_CONFIG;
  const {
    skyDay: SKY_DAY, skyClearDay: SKY_CLEAR_DAY, skyNight: SKY_NIGHT, horizonDay: HORIZON_DAY,
    horizonClearDay: HORIZON_CLEAR_DAY, horizonNight: HORIZON_NIGHT, groundDay: GROUND_DAY,
    skyFillNight: SKY_FILL_NIGHT, groundNight: GROUND_NIGHT, stormSky: STORM_SKY,
    stormHorizon: STORM_HORIZON, sunDay: SUN_DAY, sunGolden: SUN_GOLDEN, sunEmber: SUN_EMBER,
    twilightZenith: TWILIGHT_ZENITH, twilightFill: TWILIGHT_FILL, antiTwilight: ANTI_TWILIGHT
  } = resolveSkyPalette();
  const clockMinute = presentedMinuteOfDay ?? state.clock.currentMinute;
  const minuteOfDay = ((clockMinute % 1440) + 1440) % 1440;
  const { sunDirection, moonDirection } = deriveCelestialDirections(
    minuteOfDay,
    frame.sunDirection,
    frame.moonDirection
  );
  const solarHeight = sunDirection.y;
  const daylight = smooth01(
    (solarHeight - config.sun.daylightZeroSolarHeight)
      / Math.max(0.001, config.sun.daylightFullSolarHeight - config.sun.daylightZeroSolarHeight)
  );
  // Proximity to the horizon, in solar height rather than clock time. One
  // envelope owns both the warm sky band and the golden-hour key colour, so the
  // two can never disagree about when the sun is low.
  const twilight = 1 - smooth01(Math.abs(solarHeight) / config.twilight.solarWidth);
  // The deepest note of that band, only in the last minutes either side of it.
  const ember = 1 - smooth01(Math.abs(solarHeight) / config.sun.ember.solarWidth);
  const clockAmbient = clockWindowAmbient(minuteOfDay, config.skyFill.dawnDuskEdgeAmbient);
  const ambientDaylight = Math.max(daylight, clockAmbient);
  const twilightExposure = smooth01(
    (daylight - config.skyFill.twilightExposureHold)
      / Math.max(0.001, 1 - config.skyFill.twilightExposureHold)
  );
  const storm = clamp01(appearance?.storm ?? (state.weather.type === "storm" ? 1 : 0));
  const cloudCover = clamp01(state.weather.cloudCover);
  const visibility = clamp01(state.weather.visibility);
  const clear = clamp01(appearance?.clear ?? (state.weather.type === "clear" ? 1 : 0));
  const clearDaylight = clear * daylight * (1 - twilight);
  // Clear twilight keeps a sky of its own instead of the pale overcast dome.
  const clearTwilight = clear * twilight * ambientDaylight;
  const lightning = !reducedMotion ? storm * lightningEnvelope(state.worldSeed, timeSeconds) : 0;
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
  const sunWeather = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(1, 0.58, sunCloudOcclusion), config.weather.stormSunMultiplier, storm
  );
  const moonWeather = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(1, config.moon.cloudAttenuationFloor, cloudCover), config.moon.stormAttenuation, storm
  );
  // A grazing sun lights open ground at a shallow angle; lift the key across
  // the golden band while it is still above the horizon, so the warm light
  // reaches the land and not only the walls. Sunrise and sunset themselves are
  // unchanged, which keeps dawn/dusk ordering against noon intact.
  const goldenKeyLift = 1 + config.sun.goldenKeyLift * twilight * smooth01(solarHeight / 0.04);
  const sunIntensity = config.sun.intensity * daylight * sunWeather * goldenKeyLift;
  const moonIntensity =
    config.moon.intensity
    * smooth01((-solarHeight + config.twilight.moonHoldSolarHeight) / config.twilight.moonFadeWidth)
    * moonWeather;
  // Clear golden hour while the sun is still up: see `skyFill.twilightFillScale`.
  const goldenHour = clearTwilight * daylight;
  const skyFillIntensity =
    THREE.MathUtils.lerp(
      config.skyFill.nightIntensity,
      config.skyFill.intensity,
      ambientDaylight
    ) * THREE.MathUtils.lerp(0.68, 1, visibility)
    * THREE.MathUtils.lerp(1, config.skyFill.twilightFillScale, goldenHour)
    + twilight * config.skyFill.twilightFillLift * (1 - ambientDaylight)
    + lightning * 0.48;

  // Anchored on the day key and pulled toward gold by horizon proximity, so
  // noon is bit-identical to the approved daylight baseline and only the low-sun
  // window changes colour. The ember is the last minutes either side.
  const sunColor = frame.sunColor.copy(SUN_DAY).lerp(SUN_GOLDEN, twilight).lerp(SUN_EMBER, ember);
  const moonColor = frame.moonColor.set(config.moon.colorHex);
  const skyFillColor = frame.skyFillColor.copy(SKY_FILL_NIGHT).lerp(SKY_DAY, ambientDaylight);
  // Overcast twilight keeps its warm-grey dome; clear twilight gets the
  // deeper zenith below and leaves warmth to the sunward horizon.
  const skyTopColor = frame.skyTopColor.copy(SKY_NIGHT)
    .lerp(SKY_DAY, ambientDaylight)
    .lerp(HORIZON_DAY, twilight * config.skyFill.twilightZenithHorizonMix * (1 - clear));
  const horizonStrength = clamp01(ambientDaylight * 0.76 + twilight * 0.72);
  const skyHorizonColor = frame.skyHorizonColor.copy(HORIZON_NIGHT)
    .lerp(HORIZON_DAY, horizonStrength)
    .lerp(skyTopColor, ambientDaylight * 0.22 * (1 - clearTwilight));
  const groundFillColor = frame.groundFillColor.copy(GROUND_NIGHT).lerp(GROUND_DAY, ambientDaylight);
  // Clear weather has its own clean-sky radiance instead of inheriting the
  // pale overcast color used by cloudy and rainy states. Keep this coupled to
  // the same daylight envelope, sun direction, fog, and hemisphere fill.
  skyTopColor.lerp(SKY_CLEAR_DAY, clearDaylight);
  skyHorizonColor.lerp(HORIZON_CLEAR_DAY, clearDaylight);
  skyTopColor.lerp(TWILIGHT_ZENITH, clearTwilight);
  skyHorizonColor.multiplyScalar(THREE.MathUtils.lerp(1, config.skyFill.twilightHorizonScale, clearTwilight));
  // Cooler hemisphere fill on clear days so ground shade carries summer sky,
  // not the pale overcast ambient of cloudy weather. At clear twilight the
  // shade takes the cooler twilight hue while sunlit ground bounces the key's
  // warmth back up: warm light, cool shade.
  skyFillColor.lerp(SKY_CLEAR_DAY, clearDaylight * 0.42);
  skyFillColor.lerp(TWILIGHT_FILL, clearTwilight * config.skyFill.twilightCoolFillMix);
  groundFillColor.lerp(sunColor, clearTwilight * daylight * config.skyFill.twilightWarmBounceMix);
  if (storm) {
    skyFillColor.lerp(STORM_SKY, 0.22 * storm);
    skyTopColor.lerp(STORM_SKY, 0.56 * storm);
    skyHorizonColor.lerp(STORM_HORIZON, 0.5 * storm);
    groundFillColor.lerp(STORM_SKY, 0.34 * storm);
  }
  if (lightning > 0) {
    skyFillColor.lerp(lightningColor, lightning * 0.2);
    skyTopColor.lerp(lightningColor, lightning * 0.34);
    skyHorizonColor.lerp(lightningColor, lightning * 0.46);
    groundFillColor.lerp(lightningColor, lightning * 0.18);
  }

  // Clear twilight haze sits nearer the warm horizon than the deep zenith.
  const fogColor = frame.fogColor.copy(skyTopColor).lerp(
    skyHorizonColor,
    THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.42, 0.24, clearDaylight), 0.85, clearTwilight),
      0.3,
      storm
    )
  );
  const fogNear = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(config.fog.near, config.fog.clearDayNear, clearDaylight), config.weather.stormFogNear, storm
  );
  const visibilityDistance = THREE.MathUtils.lerp(0.45, 1, visibility);
  const nightDistance = THREE.MathUtils.lerp(0.78, 1, ambientDaylight);
  const daylightFogFar = THREE.MathUtils.lerp(
    config.fog.far,
    config.fog.clearDayFar,
    clearDaylight
  );
  const fogFar = THREE.MathUtils.lerp(
    Math.max(fogNear + 20, daylightFogFar * visibilityDistance * nightDistance), config.weather.stormFogFar, storm
  );
  const practicalLightIntensity = Math.max(
    1 - smooth01(
      (daylight - config.twilight.practicalHoldDaylight)
        / Math.max(0.001, config.twilight.practicalFadeWidth)
    ),
    storm * 0.48
  );
  const starVisibility = (1 - storm) * smooth01((-solarHeight - 0.025) / 0.24) * (1 - cloudCover) * visibility;
  const sunVisibility = smooth01((solarHeight + 0.035) / 0.09) * THREE.MathUtils.lerp(1, 0.4, cloudCover);
  const moonVisibility =
    smooth01((-solarHeight + 0.025) / 0.1) * THREE.MathUtils.lerp(1, 0.3, cloudCover);

  // Directional sky and haze terms that follow the low sun. Cloud and storm
  // fade them, so overcast twilight keeps its soft grey.
  const skyClarity = (1 - storm) * THREE.MathUtils.lerp(1, 0.35, cloudCover);
  const skyShape = config.atmosphere.sky;
  // Sunward horizon light has crossed twice the air the key has, so it takes
  // the key colour squared: a deeper amber that tone mapping cannot wash out.
  const sunGlowColor = frame.sunGlowColor.copy(sunColor).multiply(sunColor).multiplyScalar(skyShape.sunwardGlow);
  const sunGlow = twilight * smooth01((solarHeight + 0.2) / 0.16) * skyClarity;
  const antiTwilightColor = frame.antiTwilightColor.copy(ANTI_TWILIGHT);
  const antiTwilight = clearTwilight * (1 - smooth01(Math.abs(solarHeight) / 0.16)) * skyShape.antiTwilightBand;
  // Clouds keep catching the sun from below for a while after it has set.
  const belowHorizon = -solarHeight;
  const afterglow = smooth01(belowHorizon / 0.04) * (1 - smooth01((belowHorizon - 0.06) / 0.12));
  const cloudSunColor = frame.cloudSunColor.copy(sunColor)
    .lerp(ANTI_TWILIGHT, afterglow * skyShape.cloudAfterglow);
  const sunScatterColor = frame.sunScatterColor.copy(sunColor).multiplyScalar(
    config.atmosphere.aerialPerspective.sunScatter
      * smooth01((solarHeight + 0.05) / 0.1)
      * skyClarity
      * THREE.MathUtils.lerp(0.55, 1, twilight)
  );
  const sunAureoleColor = frame.sunAureoleColor.copy(sunColor)
    .multiplyScalar(sunVisibility * (1 - cloudCover * 0.65));
  const valleyMist = dawnMistEnvelope(minuteOfDay)
    * (1 - storm)
    * (1 - clamp01(state.weather.precipitation * 3));

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
    exposure: THREE.MathUtils.lerp(config.nightExposure, config.exposure, twilightExposure)
      + config.skyFill.twilightExposureLift * goldenHour,
    ambientDaylight,
    stormStrength: storm,
    twilight,
    sunGlowColor,
    sunGlow,
    antiTwilightColor,
    antiTwilight,
    cloudSunColor,
    sunScatterColor,
    sunAureoleColor,
    valleyMist,
    lightningSeed: hash01(state.worldSeed * 0.37 + lightningCycle * 7.13)
  });
  return frame;
}

export class LightingRig {
  public readonly sun: THREE.DirectionalLight;
  public readonly moon: THREE.DirectionalLight;
  public readonly skyFill: THREE.HemisphereLight;
  public readonly lightning: THREE.DirectionalLight;
  /** Dual-map static-atlas compositor that owns the shadow refresh budget. */
  public readonly shadowAtlas: ShadowAtlasCompositor;
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private qualityTier: QualityTier;
  private readonly snappedFocus = new THREE.Vector3();
  private readonly shadowDirection = new THREE.Vector3();
  private readonly shadowRight = new THREE.Vector3();
  private readonly shadowUp = new THREE.Vector3();
  private readonly frame = createLightingFrame();
  private presentedMinuteOfDay: number | null = null;
  private lastPresentationUpdateSeconds = Number.NEGATIVE_INFINITY;
  private readonly originalShadowRender: (lights: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera) => void;
  private readonly shadowRenderWrapper: (lights: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera) => void;

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

    this.shadowAtlas = new ShadowAtlasCompositor(renderer, CANONICAL_RENDER_CONFIG.shadows.atlas);
    this.shadowAtlas.registerScene(scene);
    this.originalShadowRender = this.renderer.shadowMap.render.bind(this.renderer.shadowMap);
    this.shadowRenderWrapper = (lights, shadowScene, camera) => {
      this.shadowAtlas.render(this.originalShadowRender, lights, shadowScene, camera);
    };
    this.renderer.shadowMap.render = this.shadowRenderWrapper;
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
    this.renderer.shadowMap.type = CANONICAL_RENDER_CONFIG.shadows.type[tier];
    this.renderer.shadowMap.needsUpdate = true;
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

  public shadowAtlasDiagnostics(): ShadowAtlasDiagnostics {
    return this.shadowAtlas.diagnostics();
  }

  public dispose(): void {
    if (this.renderer.shadowMap.render === this.shadowRenderWrapper) {
      this.renderer.shadowMap.render = this.originalShadowRender;
    }
    this.shadowAtlas.dispose();
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
    focus: THREE.Vector3,
    reducedMotion = false,
    appearance?: WeatherAppearance
  ): LightingFrame {
    const targetMinute = ((state.clock.currentMinute % 1440) + 1440) % 1440;
    if (this.presentedMinuteOfDay === null || !Number.isFinite(this.lastPresentationUpdateSeconds)) {
      this.presentedMinuteOfDay = targetMinute;
    } else {
      const deltaSeconds = THREE.MathUtils.clamp(
        timeSeconds - this.lastPresentationUpdateSeconds,
        0,
        0.1
      );
      this.presentedMinuteOfDay = advanceWrappedMinute(
        this.presentedMinuteOfDay,
        targetMinute,
        deltaSeconds
      );
    }
    this.lastPresentationUpdateSeconds = timeSeconds;
    const lightingState = appearance ? { clock: state.clock, worldSeed: state.worldSeed, weather: appearance.weather } : state;
    const frame = deriveLightingFrame(lightingState, timeSeconds, this.frame, this.presentedMinuteOfDay, reducedMotion, appearance);
    updateAerialPerspective(frame, lightingState.weather.visibility, this.scene.fog !== null);
    updateSeasonalTint(state.clock);
    frame.skyFillColor.multiply(seasonAmbientTint);
    frame.groundFillColor.multiply(seasonAmbientTint);
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
    // Moonlight is a weaker, softer key than the sun, so the shadow it casts is
    // lighter and broader. These are per-light scalars, so switching between the
    // two recipes costs nothing.
    const shadows = CANONICAL_RENDER_CONFIG.shadows;
    this.moon.shadow.intensity = shadows.nightIntensity;
    this.moon.shadow.radius = shadows.nightRadius;
    // The shadow camera follows the snapped focus above, and the player/mount
    // are live casters. Refreshing less often leaves the current light-space
    // camera sampling a depth map rendered from the previous focus, which
    // produces a one-frame shadow pop whenever movement crosses a texel.
    this.renderer.shadowMap.needsUpdate = true;

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
