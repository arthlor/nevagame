import * as THREE from "three";

import { CANONICAL_RENDER_CONFIG, type VisualRenderConfig } from "../config/VisualRenderConfig";
import { GROUND_POLYGON_CELL_GLSL } from "./GroundPolygonCells";
import { PaletteMaterials } from "./PaletteMaterials";
import { PALETTE_HEX } from "./PaletteTokens";

export const ROAD_SURFACE_PROGRAM_CACHE_KEY = "neva-road-surface-r174-v2";

type RoadSurfaceConfig = VisualRenderConfig["roadSurface"];

interface RoadSurfaceShaderSource {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
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
      `[RoadSurfaceMaterial] Three.js r174 ${stage} shader chunk drift: expected exactly one ${marker}, found ${occurrences}`
    );
  }
  return source.replace(marker, replacement);
}

function patchRoadSurfaceShader(
  shader: RoadSurfaceShaderSource,
  uniforms: RoadSurfaceShaderSource["uniforms"]
): void {
  const vertexCommon = "#include <common>";
  const vertexColor = "#include <color_vertex>";
  const vertexWorldPosition = "#include <worldpos_vertex>";
  const fragmentCommon = "#include <common>";
  const fragmentColor = "#include <color_fragment>";
  const fragmentRoughness = "#include <roughnessmap_fragment>";

  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexCommon,
    `${vertexCommon}
varying vec3 vRoadWorldPosition;
varying float vRoadOpacity;`,
    "vertex"
  );
  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexColor,
    `${vertexColor}
#ifdef USE_COLOR_ALPHA
vRoadOpacity = vColor.a;
#else
vRoadOpacity = 1.0;
#endif`,
    "vertex"
  );
  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexWorldPosition,
    `${vertexWorldPosition}
vRoadWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    "vertex"
  );

  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentCommon,
    `${fragmentCommon}
uniform float roadPolygonCellScale;
uniform float roadEdgeCellScale;
uniform float roadPolygonVariationStrength;
uniform float roadPolygonJaggedStrength;
uniform float roadRoughness;
uniform float roadRoughnessVariation;
uniform vec3 roadPackedColor;
uniform vec3 roadDryColor;
uniform vec3 roadLightColor;
varying vec3 vRoadWorldPosition;
varying float vRoadOpacity;
${GROUND_POLYGON_CELL_GLSL}`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentColor,
    `${fragmentColor}
float roadPolygonSignal = nevaGroundPolygonCellSignal(vRoadWorldPosition.xz, roadPolygonCellScale);
float roadEdgeSignal = nevaGroundPolygonCellSignal(vRoadWorldPosition.xz, roadEdgeCellScale);
float keepDirt = step(
  0.5,
  vRoadOpacity + (roadEdgeSignal - 0.5) * roadPolygonJaggedStrength
);
if (keepDirt < 0.5) discard;
diffuseColor.a = 1.0;
vec3 roadPolygonColor = roadPackedColor;
roadPolygonColor = mix(roadPolygonColor, roadDryColor, step(0.38, roadPolygonSignal));
roadPolygonColor = mix(roadPolygonColor, roadLightColor, step(0.72, roadPolygonSignal));
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  roadPolygonColor,
  roadPolygonVariationStrength
);`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentRoughness,
    `${fragmentRoughness}
roughnessFactor = clamp(
  roadRoughness + (roadPolygonSignal - 0.5) * roadRoughnessVariation,
  0.82,
  0.98
);`,
    "fragment"
  );

  Object.assign(shader.uniforms, uniforms);
}

/**
 * Render-only worked-ground color breakup for the canonical shared road mesh.
 * It changes material response only; geometry and Rapier keep using the exact
 * indexed surface produced by WorldLayout.buildPathGeometry().
 */
export class RoadSurfaceMaterial {
  public readonly material: THREE.MeshStandardMaterial;
  private readonly shaderUniforms: RoadSurfaceShaderSource["uniforms"];

  public constructor(config: RoadSurfaceConfig = CANONICAL_RENDER_CONFIG.roadSurface) {
    this.shaderUniforms = {
      roadPolygonCellScale: { value: config.polygonCellScaleMeters },
      roadEdgeCellScale: { value: CANONICAL_RENDER_CONFIG.terrainSurface.polygonCellScaleMeters },
      roadPolygonVariationStrength: { value: config.polygonVariationStrength },
      roadPolygonJaggedStrength: { value: config.polygonJaggedStrength },
      roadRoughness: { value: config.roughness },
      roadRoughnessVariation: { value: config.roughnessVariation },
      roadPackedColor: { value: new THREE.Color(PALETTE_HEX.path_dust_01) },
      roadDryColor: { value: new THREE.Color(PALETTE_HEX.soil_dry_01) },
      roadLightColor: { value: new THREE.Color(PALETTE_HEX.sand_warm_01) }
    };

    const canonicalBase = PaletteMaterials.standard("path_dust_01", {
      vertexColors: true,
      vertexColorMode: "replace",
      flatShading: false,
      roughness: config.roughness
    });
    this.material = canonicalBase.clone();
    this.material.name = "road_surface_path_dust_01";
    this.material.transparent = true;
    this.material.depthWrite = false;
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -3;
    this.material.polygonOffsetUnits = -3;
    this.material.onBeforeCompile = (shader) => {
      patchRoadSurfaceShader(shader as RoadSurfaceShaderSource, this.shaderUniforms);
    };
    this.material.customProgramCacheKey = () => ROAD_SURFACE_PROGRAM_CACHE_KEY;
    this.material.needsUpdate = true;
  }

  public dispose(): void {
    this.material.dispose();
  }
}
