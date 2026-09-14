import * as THREE from "three";
import type { ClockState } from "../../simulation/core/types";
import { buildSeasonPresentation } from "../../simulation/presentation/SeasonPresentation";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";

const uniforms = {
  nevaSeasonTint: { value: new THREE.Color(1, 1, 1) },
  nevaSeasonDesaturation: { value: 0 }
};
const prior = new THREE.Color();
const current = new THREE.Color();
const neutral = new THREE.Color(1, 1, 1);
export const seasonAmbientTint = new THREE.Color(1, 1, 1);

function tintColor(hex: string, mix: number, target: THREE.Color): THREE.Color {
  target.set(hex);
  const luminance = target.r * 0.2126 + target.g * 0.7152 + target.b * 0.0722;
  target.multiplyScalar(1 / Math.max(0.001, luminance));
  return target.lerp(neutral, 1 - mix);
}

export function updateSeasonalTint(clock: Pick<ClockState, "season" | "currentMinute">): void {
  const sample = buildSeasonPresentation(clock);
  const a = CANONICAL_RENDER_CONFIG.seasons[sample.previous];
  const b = CANONICAL_RENDER_CONFIG.seasons[sample.current];
  tintColor(a.tintHex, a.tintMix, prior);
  tintColor(b.tintHex, b.tintMix, current);
  uniforms.nevaSeasonTint.value.copy(prior).lerp(current, sample.blend);
  uniforms.nevaSeasonDesaturation.value = THREE.MathUtils.lerp(a.desaturation, b.desaturation, sample.blend);
  tintColor(a.tintHex, a.ambientMix, prior);
  tintColor(b.tintHex, b.ambientMix, current);
  seasonAmbientTint.copy(prior).lerp(current, sample.blend);
}

/** The shared season uniforms, for materials that apply the season through `nevaApplySeason`. */
export const seasonalTintUniforms: Readonly<typeof uniforms> = uniforms;

/**
 * The same season transform as `patchSeasonalTint`, as a callable GLSL helper.
 * The meadow colour field applies it once to the palette it hands both the
 * terrain and the grass, so a season cannot grey the blades but not the ground.
 */
export const SEASONAL_TINT_GLSL = /* glsl */ `
#ifndef NEVA_SEASON_UNIFORMS
#define NEVA_SEASON_UNIFORMS
uniform vec3 nevaSeasonTint;
uniform float nevaSeasonDesaturation;
#endif
vec3 nevaApplySeason(vec3 color) {
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(color, vec3(luminance), nevaSeasonDesaturation) * nevaSeasonTint;
}
`;

export function patchSeasonalTint(shader: { fragmentShader: string; uniforms: Record<string, unknown> }): void {
  const anchor = "#include <color_fragment>";
  if (shader.fragmentShader.split(anchor).length !== 2) throw new Error("SeasonalTint: color shader chunk drift");
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = `#ifndef NEVA_SEASON_UNIFORMS\n#define NEVA_SEASON_UNIFORMS\nuniform vec3 nevaSeasonTint;\nuniform float nevaSeasonDesaturation;\n#endif\n${shader.fragmentShader}`;
  shader.fragmentShader = shader.fragmentShader.replace(anchor, `${anchor}
  float nevaLeafLuminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(nevaLeafLuminance), nevaSeasonDesaturation) * nevaSeasonTint;`);
}
