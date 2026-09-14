import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { SEASONAL_TINT_GLSL, seasonalTintUniforms } from "../materials/SeasonalTint";

const meadow = CANONICAL_RENDER_CONFIG.meadow;

/**
 * One set of uniform objects shared by every material that evaluates the
 * meadow field. The terrain and the grass carpet read the same values, so a
 * season, a palette role or the live carpet radius changes both at once.
 */
export const meadowColorUniforms = {
  nevaMeadowRoot: { value: new THREE.Color(meadow.palette.rootHex) },
  nevaMeadowRootCool: { value: new THREE.Color(meadow.palette.rootCoolHex) },
  nevaMeadowBody: { value: new THREE.Color(meadow.palette.bodyHex) },
  nevaMeadowBodyCool: { value: new THREE.Color(meadow.palette.bodyCoolHex) },
  nevaMeadowBodyWarm: { value: new THREE.Color(meadow.palette.bodyWarmHex) },
  nevaMeadowTip: { value: new THREE.Color(meadow.palette.tipHex) },
  nevaMeadowTipWarm: { value: new THREE.Color(meadow.palette.tipWarmHex) },
  nevaMeadowStraw: { value: new THREE.Color(meadow.palette.strawHex) },
  nevaMeadowScales: { value: new THREE.Vector2(1 / meadow.macroScaleMeters, 1 / meadow.mesoScaleMeters) },
  /** x terrain carpet mix, y distant tip share, z thatch share under live blades, w distant carpet value. */
  nevaMeadowCarpet: { value: new THREE.Vector4(
    meadow.terrainCarpetMix, meadow.carpetTipShare, meadow.underCarpetShade, meadow.carpetValue
  ) },
  /** xy player anchor, z live carpet radius (0 = no carpet), w outer fade. */
  nevaMeadowField: { value: new THREE.Vector4(0, 0, 0, 1) }
};

/** Adds the shared meadow and season uniforms to a patched shader. */
export function bindMeadowColorUniforms(target: Record<string, unknown>): void {
  Object.assign(target, meadowColorUniforms, seasonalTintUniforms);
}

/**
 * Publishes where live blades stand so the terrain can darken the ground
 * between them and hand back to the plain carpet colour past their radius.
 */
export function setMeadowLiveField(anchorX: number, anchorZ: number, radiusMeters: number, fadeMeters: number): void {
  meadowColorUniforms.nevaMeadowField.value.set(anchorX, anchorZ, Math.max(0, radiusMeters), Math.max(0.001, fadeMeters));
}

/**
 * Macro palette regions and meso clumps as smooth value noise over world
 * meters. Everything here is palette-token colour: the noise only chooses
 * between approved roles and a bounded value band (Art Bible §7.2.1).
 */
export const MEADOW_COLOR_FIELD_GLSL = /* glsl */ `
${SEASONAL_TINT_GLSL}
uniform vec3 nevaMeadowRoot;
uniform vec3 nevaMeadowRootCool;
uniform vec3 nevaMeadowBody;
uniform vec3 nevaMeadowBodyCool;
uniform vec3 nevaMeadowBodyWarm;
uniform vec3 nevaMeadowTip;
uniform vec3 nevaMeadowTipWarm;
uniform vec3 nevaMeadowStraw;
uniform vec2 nevaMeadowScales;
uniform vec4 nevaMeadowCarpet;
uniform vec4 nevaMeadowField;

float nevaMeadowHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float nevaMeadowNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(nevaMeadowHash(cell), nevaMeadowHash(cell + vec2(1.0, 0.0)), u.x),
    mix(nevaMeadowHash(cell + vec2(0.0, 1.0)), nevaMeadowHash(cell + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float nevaMeadowMacro(vec2 xz) {
  vec2 p = xz * nevaMeadowScales.x;
  return clamp(
    nevaMeadowNoise(p) * 0.62
      + nevaMeadowNoise(p * 2.13 + vec2(7.1, -2.3)) * 0.28
      + nevaMeadowNoise(p * 4.37 + vec2(-3.7, 5.9)) * 0.1,
    0.0,
    1.0
  );
}

float nevaMeadowClump(vec2 xz) {
  vec2 p = xz * nevaMeadowScales.y;
  return nevaMeadowNoise(p) * 0.7 + nevaMeadowNoise(p * 2.7 + vec2(11.3, 4.1)) * 0.3;
}

struct NevaMeadowSample {
  vec3 root;
  vec3 body;
  vec3 tip;
  float clump;
};

NevaMeadowSample nevaMeadowSample(vec2 xz, float meadowShare, float dry, float damp) {
  float warm = nevaMeadowMacro(xz);
  float cool = nevaMeadowMacro(xz * 0.63 + vec2(41.0, -17.0));
  float clump = nevaMeadowClump(xz);
  vec3 root = mix(nevaMeadowRoot, nevaMeadowRootCool, smoothstep(0.3, 0.7, cool));
  // Fresh cool greens carry most of the meadow; olive and leaf warm its drier rises.
  vec3 body = mix(nevaMeadowBody, nevaMeadowBodyCool, smoothstep(0.2, 0.65, cool));
  body = mix(body, nevaMeadowBodyWarm, smoothstep(0.55, 0.9, warm) * (0.4 + 0.4 * meadowShare));
  vec3 tip = mix(nevaMeadowTip, nevaMeadowTipWarm, smoothstep(0.55, 0.9, warm));
  float straw = clamp(meadowShare * smoothstep(0.65, 0.95, warm) * 0.45 + dry * 0.85, 0.0, 1.0);
  tip = mix(tip, nevaMeadowStraw, straw);
  body = mix(body, mix(nevaMeadowBodyWarm, nevaMeadowStraw, 0.35), dry * 0.55);
  // Damp ground holds deeper, cooler greens.
  body = mix(body, root, damp * 0.22);
  tip = mix(tip, body, damp * 0.2);
  float value = mix(0.92, 1.06, clump);
  NevaMeadowSample s;
  s.root = nevaApplySeason(root * value);
  s.body = nevaApplySeason(body * value);
  s.tip = nevaApplySeason(tip * value);
  s.clump = clump;
  return s;
}

vec3 nevaMeadowCarpetColor(NevaMeadowSample s) {
  return mix(s.body, s.tip, nevaMeadowCarpet.y) * nevaMeadowCarpet.w;
}

vec3 nevaMeadowThatchColor(NevaMeadowSample s) {
  return mix(s.root, s.body, 0.5);
}

float nevaMeadowLiveBlades(vec2 xz) {
  if (nevaMeadowField.z <= 0.0) return 0.0;
  float distanceToAnchor = distance(xz, nevaMeadowField.xy);
  return 1.0 - smoothstep(nevaMeadowField.z - nevaMeadowField.w, nevaMeadowField.z, distanceToAnchor);
}
`;
