import * as THREE from "three";
import { inheritSkyMaterialReflections } from "../atmosphere/SkyMaterialReflections";

export interface ShelterProbeUniforms {
  nevaShelterSH: THREE.IUniform<THREE.Texture | null>;
  nevaShelterMin: THREE.IUniform<THREE.Vector3>;
  nevaShelterMax: THREE.IUniform<THREE.Vector3>;
  nevaShelterResolution: THREE.IUniform<THREE.Vector3>;
  nevaShelterRoomMin: THREE.IUniform<THREE.Vector3>;
  nevaShelterRoomMax: THREE.IUniform<THREE.Vector3>;
  nevaShelterReady: THREE.IUniform<number>;
}

function requireOnce(source: string, anchor: string): void {
  if (source.split(anchor).length !== 2) throw new Error(`[ShelterProbeMaterial] Expected one ${anchor}`);
}

/** Reuse r186's public SH sampling chunk, scoped to this room's materials. */
export function shelterProbeSamplingChunk(): string {
  let chunk = THREE.ShaderChunk.lightprobes_pars_fragment;
  requireOnce(chunk, "#ifdef USE_LIGHT_PROBES_GRID");
  if (!chunk.trimEnd().endsWith("#endif")) throw new Error("[ShelterProbeMaterial] SH chunk wrapper changed");
  chunk = chunk.replace("#ifdef USE_LIGHT_PROBES_GRID", "").replace(/#endif\s*$/, "");
  const names = {
    probesSH: "nevaShelterSH", probesMin: "nevaShelterMin", probesMax: "nevaShelterMax",
    probesResolution: "nevaShelterResolution", getLightProbeGridIrradiance: "nevaShelterIrradiance"
  };
  for (const [original, replacement] of Object.entries(names)) {
    if (!chunk.includes(original)) throw new Error(`[ShelterProbeMaterial] Missing ${original}`);
    chunk = chunk.replace(new RegExp(`\\b${original}\\b`, "g"), replacement);
  }
  return `${chunk}
uniform vec3 nevaShelterRoomMin;
uniform vec3 nevaShelterRoomMax;
uniform float nevaShelterReady;
float nevaShelterBlend(vec3 worldPosition) {
  vec3 inside = min(worldPosition - nevaShelterRoomMin, nevaShelterRoomMax - worldPosition);
  return nevaShelterReady * smoothstep(0.0, 0.1, min(inside.x, min(inside.y, inside.z)));
}`;
}

export function cloneShelterReceiver(
  source: THREE.MeshStandardMaterial,
  uniforms: ShelterProbeUniforms
): THREE.MeshStandardMaterial {
  const material = source.clone();
  material.name = `${source.name}:shelter`;
  material.userData.nevaShelterReceiver = true;
  material.onBeforeRender = source.onBeforeRender;
  inheritSkyMaterialReflections(source, material);
  const previous = source.onBeforeCompile;
  const key = source.customProgramCacheKey();
  const sampling = shelterProbeSamplingChunk();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    const vertexAnchor = "#include <worldpos_vertex>";
    requireOnce(shader.vertexShader, vertexAnchor);
    shader.vertexShader = `varying vec3 vNevaShelterWorldPosition;\n${shader.vertexShader}`.replace(vertexAnchor, `${vertexAnchor}
      vec4 nevaShelterPosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        nevaShelterPosition = batchingMatrix * nevaShelterPosition;
      #endif
      #ifdef USE_INSTANCING
        nevaShelterPosition = instanceMatrix * nevaShelterPosition;
      #endif
      vNevaShelterWorldPosition = (modelMatrix * nevaShelterPosition).xyz;`);
    const pars = "#include <lights_pars_begin>";
    requireOnce(shader.fragmentShader, pars);
    let fragment = `varying vec3 vNevaShelterWorldPosition;\n${shader.fragmentShader}`;
    fragment = fragment.replace(pars, `${pars}\n${sampling}`);
    if (fragment.includes("#include <lights_fragment_begin>")) {
      fragment = fragment.replace("#include <lights_fragment_begin>", THREE.ShaderChunk.lights_fragment_begin);
    }
    const indirect = "#ifdef USE_LIGHT_PROBES_GRID";
    requireOnce(fragment, indirect);
    fragment = fragment.replace(indirect, `
      float nevaShelterWeight = nevaShelterBlend(vNevaShelterWorldPosition);
      if (nevaShelterWeight > 0.0) {
        vec3 nevaShelterNormal = transformNormalByInverseViewMatrix(geometryNormal, viewMatrix);
        irradiance = mix(irradiance, nevaShelterIrradiance(vNevaShelterWorldPosition, nevaShelterNormal), nevaShelterWeight);
      }
      ${indirect}`);
    const end = "#include <lights_fragment_end>";
    requireOnce(fragment, end);
    // Replace ambient and diffuse IBL energy; specular sky reflections remain.
    shader.fragmentShader = fragment.replace(end, `
      #if defined(RE_IndirectDiffuse)
        iblIrradiance *= 1.0 - nevaShelterWeight;
      #endif
      ${end}`);
  };
  material.customProgramCacheKey = () => `${key}:shelter-probes-r186-v1`;
  return material;
}
