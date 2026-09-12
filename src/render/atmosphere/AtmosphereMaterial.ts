import * as THREE from "three";
import { cloudShadowUniforms, CLOUD_SHADOW_RECEIVER_GLSL } from "./CloudShadows";
import { aerialPerspectiveUniforms, AERIAL_PERSPECTIVE_GLSL } from "./AerialPerspective";
import { applyRainSurface } from "../materials/RainSurfaceMaterial";

const patched = new WeakSet<THREE.Material>();

/** Composes solar cloud shade and linear-radiance haze around authored surface shading. */
export function applyWorldAtmosphere(
  material: THREE.MeshStandardMaterial,
  options: { rainSurface?: boolean } = {}
): void {
  if (patched.has(material)) return;
  patched.add(material);
  if (options.rainSurface !== false) applyRainSurface(material);
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  const key = previousKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, cloudShadowUniforms, aerialPerspectiveUniforms);
    shader.vertexShader = `varying vec3 vNevaCloudWorldPosition;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
      vec4 nevaCloudPosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        nevaCloudPosition = batchingMatrix * nevaCloudPosition;
      #endif
      #ifdef USE_INSTANCING
        nevaCloudPosition = instanceMatrix * nevaCloudPosition;
      #endif
      vNevaCloudWorldPosition = (modelMatrix * nevaCloudPosition).xyz;`);
    shader.fragmentShader = `varying vec3 vNevaCloudWorldPosition;\n${CLOUD_SHADOW_RECEIVER_GLSL}\n${AERIAL_PERSPECTIVE_GLSL}\n${shader.fragmentShader}`;
    // Scene fog is the atmosphere opt-in. Fogless UI previews must not sample
    // a world render target owned by another WebGL context.
    if (material.fog) {
      if (!shader.fragmentShader.includes("#include <opaque_fragment>")) {
        throw new Error("[AtmosphereMaterial] Linear output shader contract changed");
      }
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <opaque_fragment>", "#ifdef USE_FOG\noutgoingLight = nevaAerialPerspective(outgoingLight, vNevaCloudWorldPosition);\n#endif\n#include <opaque_fragment>")
        .replace("#include <fog_fragment>", "");
    }
    const anchor = "getDirectionalLightInfo( directionalLight, directLight );";
    const lights = THREE.ShaderChunk.lights_fragment_begin;
    if (!lights.includes(anchor) || !shader.fragmentShader.includes("#include <lights_fragment_begin>")) {
      throw new Error("[CloudShadows] Directional lighting shader contract changed");
    }
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_begin>", lights.replace(anchor, `${anchor}
      #ifdef USE_FOG
      directLight.color *= mix(1.0, nevaCloudSunlight(vNevaCloudWorldPosition),
        step(0.999, dot(directionalLight.direction, normalize((viewMatrix * vec4(nevaCloudSunDirection, 0.0)).xyz))));
      #endif`));
  };
  material.customProgramCacheKey = () => `${key}:world-atmosphere-v1`;
  material.needsUpdate = true;
}
