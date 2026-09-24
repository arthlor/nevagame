import * as THREE from "three";
import { applyWorldAtmosphere } from "../atmosphere/AtmosphereMaterial";
import { PaletteMaterials } from "../materials/PaletteMaterials";
import { bindMeadowColorUniforms, MEADOW_COLOR_FIELD_GLSL } from "./MeadowColorField";

export const MEADOW_GROUND_PROGRAM_CACHE_KEY = "neva-meadow-ground-r174-v2-patch-response";

/**
 * Flat review ground that wears the shared meadow field exactly as the world
 * terrain does across uniform grass: the carpet colour, dropping to thatch
 * under live blades. Used where no world terrain exists, such as the Art Yard.
 */
export function createMeadowGroundMaterial(cover: { meadowShare: number; dry: number; damp: number }): THREE.MeshStandardMaterial {
  const material = PaletteMaterials.standard("foliage_sage_01", { flatShading: false, roughness: 0.92, metalness: 0 }).clone();
  material.name = "meadow_ground_foliage_sage_01";
  material.color.setRGB(1, 1, 1);
  const uniforms: Record<string, unknown> = {
    meadowGroundCover: { value: new THREE.Vector3(cover.meadowShare, cover.dry, cover.damp) }
  };
  bindMeadowColorUniforms(uniforms);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vMeadowGroundWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvMeadowGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vMeadowGroundWorld;\nuniform vec3 meadowGroundCover;\n${MEADOW_COLOR_FIELD_GLSL}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
NevaMeadowSample meadowGround = nevaMeadowSample(vMeadowGroundWorld.xz, meadowGroundCover.x, meadowGroundCover.y, meadowGroundCover.z);
diffuseColor.rgb = mix(
  nevaMeadowCarpetColor(meadowGround),
  nevaMeadowThatchColor(meadowGround),
  nevaMeadowLiveBlades(vMeadowGroundWorld.xz) * nevaMeadowCarpet.z
);`);
  };
  material.customProgramCacheKey = () => MEADOW_GROUND_PROGRAM_CACHE_KEY;
  applyWorldAtmosphere(material);
  return material;
}
