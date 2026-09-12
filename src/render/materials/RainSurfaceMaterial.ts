import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { PALETTE_SPECS, type PaletteToken } from "./PaletteTokens";

const patched = new WeakSet<THREE.Material>();
export const rainSurfaceUniforms = { nevaRainSurfaceWetness: { value: 0 } };

/** Reuses the ground's rise/dry-down envelope; there is no second weather clock. */
export function setRainSurfaceWetness(wetness: number, outdoors: boolean): void {
  rainSurfaceUniforms.nevaRainSurfaceWetness.value = outdoors
    ? THREE.MathUtils.clamp(wetness, 0, 1) : 0;
}

/** Palette-family response on existing Standard materials, including shared clones. */
export function applyRainSurface(material: THREE.MeshStandardMaterial): void {
  if (patched.has(material)) return;
  const token = material.userData.neva_palette_token ?? material.name;
  const family = typeof token === "string" && Object.hasOwn(PALETTE_SPECS, token)
    ? PALETTE_SPECS[token as PaletteToken].family : null;
  const kind = family === "wood" ? "wood"
    : family === "stone" || family === "rock" ? "stone"
      : family === "foliage" ? "foliage" : null;
  if (!kind) return;
  patched.add(material);
  const response = new THREE.Vector3(...CANONICAL_RENDER_CONFIG.rainSurfaces[kind]);
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, rainSurfaceUniforms, { nevaRainSurfaceResponse: { value: response } });
    const anchor = "#include <normal_fragment_maps>";
    if (!shader.fragmentShader.includes(anchor)) throw new Error("[RainSurfaceMaterial] Standard normal handoff changed");
    shader.fragmentShader = `uniform float nevaRainSurfaceWetness;
      uniform vec3 nevaRainSurfaceResponse;\n${shader.fragmentShader}`.replace(anchor, `${anchor}
      #ifdef USE_FOG
        // Use the resolved normal, including flat facets and instance rotation.
        // Downward faces stay dry; vertical faces receive a weaker runoff response.
        float nevaRainUp = inverseTransformDirection(normal, viewMatrix).y;
        float nevaRainExposure = smoothstep(-0.12, 0.18, nevaRainUp)
          * mix(0.35, 1.0, smoothstep(0.0, 0.75, nevaRainUp));
        float nevaObjectWetness = nevaRainSurfaceWetness * nevaRainExposure;
        diffuseColor.rgb *= 1.0 - nevaObjectWetness * nevaRainSurfaceResponse.x;
        roughnessFactor = mix(roughnessFactor,
          min(roughnessFactor, max(nevaRainSurfaceResponse.z, roughnessFactor - nevaRainSurfaceResponse.y)),
          nevaObjectWetness);
      #endif`);
  };
  material.customProgramCacheKey = () => `${previousKey}:rain-surface-v1`;
  material.needsUpdate = true;
}
