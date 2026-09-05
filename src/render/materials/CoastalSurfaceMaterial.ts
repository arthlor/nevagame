import type { MeshStandardMaterial } from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";

/** Meter-scaled mineral mottling on the registered coastal stone family.
 * World coordinates keep the scale continuous across LODs and static batches.
 * This modulates albedo/roughness only; illumination remains the shared rig.
 */
export function applyCoastalStoneSurface(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    const config = CANONICAL_RENDER_CONFIG.coastalStone;
    shader.uniforms.uCoastalStoneScale = { value: [config.mineralScale, config.grainScale] };
    shader.uniforms.uCoastalStoneStrength = { value: [config.mineralStrength, config.grainStrength, config.dampHeight, config.dampStrength] };
    shader.vertexShader = `varying vec3 vCoastalSurfacePosition;\n${shader.vertexShader}`.replace(
      "#include <project_vertex>", `#include <project_vertex>
      vec4 coastalPoint = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        coastalPoint = batchingMatrix * coastalPoint;
      #endif
      #ifdef USE_INSTANCING
        coastalPoint = instanceMatrix * coastalPoint;
      #endif
      vCoastalSurfacePosition = (modelMatrix * coastalPoint).xyz;`
    );
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vCoastalSurfacePosition;
      uniform vec2 uCoastalStoneScale;
      uniform vec4 uCoastalStoneStrength;
      float coastalHash(vec3 p) {
        p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float coastalMineral(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(coastalHash(i), coastalHash(i+vec3(1,0,0)), f.x),
          mix(coastalHash(i+vec3(0,1,0)), coastalHash(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(coastalHash(i+vec3(0,0,1)), coastalHash(i+vec3(1,0,1)), f.x),
          mix(coastalHash(i+vec3(0,1,1)), coastalHash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float coastalMineralValue = coastalMineral(vCoastalSurfacePosition * uCoastalStoneScale.x);
      float coastalGrainFilter = 1.0 - smoothstep(0.025, 0.12, length(fwidth(vCoastalSurfacePosition)));
      float coastalGrain = (coastalMineral(vCoastalSurfacePosition * uCoastalStoneScale.y) - 0.5) * coastalGrainFilter;
      diffuseColor.rgb *= 1.0 + (coastalMineralValue - 0.5) * uCoastalStoneStrength.x + coastalGrain * uCoastalStoneStrength.y;
      float coastalDamp = 1.0 - smoothstep(0.05, uCoastalStoneStrength.z, vCoastalSurfacePosition.y);
      diffuseColor.rgb *= 1.0 - coastalDamp * uCoastalStoneStrength.w;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (coastalMineralValue - 0.5) * 0.08 - coastalDamp * uCoastalStoneStrength.w, 0.65, 1.0);`);
  };
  material.customProgramCacheKey = () => "neva-coastal-stone-surface-v1";
}
