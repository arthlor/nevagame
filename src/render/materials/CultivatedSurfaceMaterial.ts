import * as THREE from "three";

import { CANONICAL_RENDER_CONFIG, type VisualRenderConfig } from "../config/VisualRenderConfig";
import { PaletteMaterials } from "./PaletteMaterials";
import { PALETTE_HEX } from "./PaletteTokens";
import {
  SURFACE_FIELD_FRAGMENT_GLSL,
  SURFACE_FIELD_VERTEX_ASSIGNMENTS,
  SURFACE_FIELD_VERTEX_DECLARATIONS
} from "./SurfaceFieldShader";

export const CULTIVATED_SURFACE_PROGRAM_CACHE_KEY = "neva-cultivated-surface-r174-v1";

type CultivatedSurfaceConfig = VisualRenderConfig["groundSurface"];

interface CultivatedSurfaceShaderSource {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
}

function replaceShaderChunk(
  source: string,
  marker: string,
  replacement: string,
  stage: "vertex" | "fragment"
): string {
  const occurrences = source.split(marker).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `[CultivatedSurfaceMaterial] Three.js r174 ${stage} shader chunk drift: expected exactly one ${marker}, found ${occurrences}`
    );
  }
  return source.replace(marker, replacement);
}

function patchCultivatedSurfaceShader(
  shader: CultivatedSurfaceShaderSource,
  uniforms: CultivatedSurfaceShaderSource["uniforms"]
): void {
  const vertexCommon = "#include <common>";
  const vertexBegin = "#include <begin_vertex>";
  const vertexWorldPosition = "#include <worldpos_vertex>";
  const fragmentCommon = "#include <common>";
  const fragmentColor = "#include <color_fragment>";
  const fragmentRoughness = "#include <roughnessmap_fragment>";
  const fragmentNormal = "#include <normal_fragment_begin>";

  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexCommon,
    `${vertexCommon}
${SURFACE_FIELD_VERTEX_DECLARATIONS}
varying vec3 vCultivatedWorldPosition;`,
    "vertex"
  );
  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexBegin,
    `${vertexBegin}
${SURFACE_FIELD_VERTEX_ASSIGNMENTS}`,
    "vertex"
  );
  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexWorldPosition,
    `${vertexWorldPosition}
vCultivatedWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    "vertex"
  );

  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentCommon,
    `${fragmentCommon}
uniform float cultivatedCellScale;
uniform float cultivatedEdgeMix;
uniform float cultivatedWetness;
uniform float cultivatedWetnessMix;
uniform float cultivatedWetnessColorMix;
uniform float cultivatedWetnessRoughnessMix;
uniform vec3 cultivatedSoilDryColor;
uniform vec3 cultivatedSoilWarmColor;
uniform vec3 cultivatedSoilDampColor;
uniform vec3 cultivatedMeadowSageColor;
uniform vec3 cultivatedMeadowGrassColor;
varying vec3 vCultivatedWorldPosition;
${SURFACE_FIELD_FRAGMENT_GLSL}`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentColor,
    `${fragmentColor}
vec4 cultivatedCell = nevaGroundPolygonCell(
  vCultivatedWorldPosition.xz,
  cultivatedCellScale
);
float cultivatedFarm = nevaSurfaceFarmInfluence();
float cultivatedEdge = clamp(
  nevaSurfaceGrassWeight()
    + nevaSurfaceMeadowWeight()
    + nevaSurfaceShoulderWeight()
    + nevaSurfaceWetShorelineWeight() * 0.35,
  0.0,
  1.0
);
float cultivatedWet = nevaSurfaceWeatherWetness(cultivatedWetness);
vec3 cultivatedSoilColor = mix(
  cultivatedSoilDryColor,
  cultivatedSoilWarmColor,
  nevaSurfaceShoulderWeight() * 0.28
);
cultivatedSoilColor = mix(
  cultivatedSoilColor,
  cultivatedSoilDampColor,
  nevaSurfaceDampSoilWeight() * 0.5 + cultivatedWet * 0.14
);
vec3 cultivatedMeadowColor = mix(
  cultivatedMeadowSageColor,
  cultivatedMeadowGrassColor,
  nevaSurfaceMeadowWeight()
);
cultivatedMeadowColor *= mix(0.98, 1.02, cultivatedCell.x);
vec3 cultivatedFieldColor = nevaSurfaceWeightedPalette(
  cultivatedMeadowSageColor,
  cultivatedMeadowGrassColor,
  cultivatedSoilDryColor,
  cultivatedSoilDampColor,
  cultivatedSoilDryColor,
  cultivatedSoilWarmColor,
  cultivatedSoilWarmColor,
  cultivatedSoilDampColor,
  cultivatedSoilDampColor,
  cultivatedSoilDampColor,
  cultivatedSoilColor
);
vec3 cultivatedSurfaceColor = mix(
  cultivatedFieldColor,
  cultivatedMeadowColor,
  cultivatedEdge * 0.55
);
cultivatedSurfaceColor *= mix(0.985, 1.015, cultivatedCell.y);
float cultivatedTransition = clamp(
  cultivatedEdge * cultivatedEdgeMix
    + (1.0 - cultivatedFarm) * cultivatedEdgeMix * 0.65,
  0.0,
  0.24
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  cultivatedSurfaceColor,
  cultivatedTransition
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  cultivatedSoilDampColor,
  cultivatedWet * cultivatedWetnessColorMix * cultivatedWetnessMix * 0.45
);`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentRoughness,
    `${fragmentRoughness}
float cultivatedSurfaceRoughness = nevaSurfaceRoughness(
  0.98,
  0.84,
  cultivatedWetness
);
roughnessFactor = mix(
  roughnessFactor,
  cultivatedSurfaceRoughness,
  cultivatedWet * cultivatedWetnessRoughnessMix * cultivatedWetnessMix
);`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentNormal,
    `${fragmentNormal}
float cultivatedFacetMask = clamp(
  nevaSurfaceShoulderWeight()
    + nevaSurfaceWetShorelineWeight() * 0.35
    + nevaSurfaceCliffWeight() * 0.2,
  0.0,
  1.0
);
normal = nevaSurfaceFacetNormal(
  normal,
  cultivatedCell,
  cultivatedEdgeMix * 0.14,
  cultivatedFacetMask
);`,
    "fragment"
  );

  Object.assign(shader.uniforms, uniforms);
}

/**
 * Render-only material role for the cultivated farm bed. The existing vertex
 * colors, furrows, clods, and bed geometry remain the authored farm accents;
 * this material only lets the shared world surface field soften their edge.
 */
export class CultivatedSurfaceMaterial {
  public readonly material: THREE.MeshStandardMaterial;
  private readonly shaderUniforms: CultivatedSurfaceShaderSource["uniforms"];

  public constructor(config: CultivatedSurfaceConfig = CANONICAL_RENDER_CONFIG.groundSurface) {
    this.shaderUniforms = {
      cultivatedCellScale: { value: config.polygonCellScaleMeters },
      cultivatedEdgeMix: { value: config.cultivatedEdgeMix },
      cultivatedWetness: { value: 0 },
      cultivatedWetnessMix: { value: config.cultivatedWetnessMix },
      cultivatedWetnessColorMix: { value: config.wetness.colorMix },
      cultivatedWetnessRoughnessMix: { value: config.wetness.roughnessMix },
      cultivatedSoilDryColor: { value: new THREE.Color(PALETTE_HEX.soil_dry_01) },
      cultivatedSoilWarmColor: { value: new THREE.Color(PALETTE_HEX.soil_warm_01) },
      cultivatedSoilDampColor: { value: new THREE.Color(PALETTE_HEX.soil_damp_01) },
      cultivatedMeadowSageColor: { value: new THREE.Color(PALETTE_HEX.foliage_sage_01) },
      cultivatedMeadowGrassColor: { value: new THREE.Color(PALETTE_HEX.grass_yellow_01) }
    };

    const canonicalBase = PaletteMaterials.standard("soil_dry_01", {
      vertexColors: true,
      vertexColorMode: "replace",
      roughness: 0.98,
      flatShading: true
    });
    this.material = canonicalBase.clone();
    this.material.name = "cultivated_surface_soil_dry_01";
    this.material.onBeforeCompile = (shader) => {
      patchCultivatedSurfaceShader(shader as CultivatedSurfaceShaderSource, this.shaderUniforms);
    };
    this.material.customProgramCacheKey = () => CULTIVATED_SURFACE_PROGRAM_CACHE_KEY;
    this.material.needsUpdate = true;
  }

  public get wetness(): number {
    return this.shaderUniforms.cultivatedWetness.value as number;
  }

  public setWetness(value: number): void {
    this.shaderUniforms.cultivatedWetness.value = clamp01(value);
  }

  public dispose(): void {
    this.material.dispose();
  }
}
