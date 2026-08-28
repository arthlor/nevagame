import * as THREE from "three";

import { CANONICAL_RENDER_CONFIG, type VisualRenderConfig } from "../config/VisualRenderConfig";
import {
  createSurfaceFallbackTexture,
  loadSurfaceTexture,
  POLYHAVEN_SURFACE_TEXTURES
} from "./ExternalSurfaceTextures";
import { PaletteMaterials } from "./PaletteMaterials";
import { PALETTE_HEX } from "./PaletteTokens";
import {
  SURFACE_FIELD_FRAGMENT_GLSL,
  SURFACE_FIELD_VERTEX_ASSIGNMENTS,
  SURFACE_FIELD_VERTEX_DECLARATIONS
} from "./SurfaceFieldShader";

export const ROAD_SURFACE_PROGRAM_CACHE_KEY = "neva-road-surface-r174-v23";

type RoadSurfaceConfig = VisualRenderConfig["roadSurface"];

interface RoadSurfaceShaderSource {
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
  const vertexBegin = "#include <begin_vertex>";
  const vertexColor = "#include <color_vertex>";
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
varying vec3 vRoadWorldPosition;
varying float vRoadOpacity;`,
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
uniform sampler2D roadSourceColorTexture;
uniform sampler2D roadSourceRoughnessTexture;
uniform float roadPolygonCellScale;
uniform float roadEdgeCellScale;
uniform float roadSourceSampleScale;
uniform float roadSourceMesoSampleScale;
uniform float roadSourceRotation;
uniform float roadSourceLodBias;
uniform float roadExternalColorStrength;
uniform float roadExternalRoughnessStrength;
uniform float roadPolygonVariationStrength;
uniform float roadPolygonJaggedStrength;
uniform float roadPolygonFacetLightingStrength;
uniform float roadSharedCellScale;
uniform float roadEdgeFadeStart;
uniform float roadEdgeFadeFull;
uniform float roadRoughness;
uniform float roadRoughnessVariation;
uniform float roadWetness;
uniform float roadWetnessColorMix;
uniform float roadWetnessRoughnessMix;
uniform float roadSharedTransitionMix;
uniform vec3 roadPackedColor;
uniform vec3 roadDryColor;
uniform vec3 roadLightColor;
uniform vec3 roadShoulderGrassColor;
varying vec3 vRoadWorldPosition;
varying float vRoadOpacity;
${SURFACE_FIELD_FRAGMENT_GLSL}

vec2 nevaRoadWorldUv(float sampleScale) {
  vec2 position = vRoadWorldPosition.xz / max(sampleScale, 0.001);
  float rotationSin = sin(roadSourceRotation);
  float rotationCos = cos(roadSourceRotation);
  return vec2(
    position.x * rotationCos - position.y * rotationSin,
    position.x * rotationSin + position.y * rotationCos
  );
}`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentColor,
    `${fragmentColor}
float roadEdgeSignal = nevaGroundPolygonCellSignal(vRoadWorldPosition.xz, roadEdgeCellScale);
float roadEdgeDistance = nevaGroundPolygonCellEdge(vRoadWorldPosition.xz, roadEdgeCellScale);
float roadEdgeBand = 1.0 - smoothstep(roadEdgeFadeFull, 1.0, vRoadOpacity);
float roadEdgeField = clamp(
  vRoadOpacity
    + (roadEdgeSignal - 0.5) * roadPolygonJaggedStrength * 0.55 * roadEdgeBand
    + (roadEdgeDistance - 0.16) * roadPolygonJaggedStrength * roadEdgeBand,
  0.0,
  1.0
);
float roadCoverage = smoothstep(roadEdgeFadeStart, roadEdgeFadeFull, roadEdgeField);
float roadDither = nevaGroundCellJitter(floor(vRoadWorldPosition.xz * 16.0 + 3.1)).x;
roadCoverage = clamp(roadCoverage + (roadDither - 0.5) * 0.3, 0.0, 1.0);
diffuseColor.a = roadCoverage;
vec4 roadPolygonCell = nevaGroundPolygonCell(vRoadWorldPosition.xz, roadPolygonCellScale);
float roadPolygonSignal = roadPolygonCell.x;
vec3 roadPolygonColor = mix(
  roadPackedColor,
  roadLightColor,
  smoothstep(0.2, 0.84, roadPolygonSignal)
);
roadPolygonColor = mix(roadPolygonColor, roadDryColor, 0.22);
roadPolygonColor *= mix(0.96, 1.05, fract(roadPolygonSignal * 6.17 + 0.13));
vec2 roadFineUv = nevaRoadWorldUv(roadSourceSampleScale);
vec2 roadMesoUv = nevaRoadWorldUv(roadSourceMesoSampleScale);
vec3 roadFineSample = texture2D(roadSourceColorTexture, roadFineUv, roadSourceLodBias).rgb;
vec3 roadMesoSample = texture2D(roadSourceColorTexture, roadMesoUv, roadSourceLodBias + 0.45).rgb;
float roadFineLuma = dot(roadFineSample, vec3(0.299, 0.587, 0.114));
float roadMesoLuma = dot(roadMesoSample, vec3(0.299, 0.587, 0.114));
vec3 roadWearSample = mix(roadMesoSample, roadFineSample, 0.28);
float roadWearSignal = clamp(
  (roadWearSample.r - roadWearSample.b * 0.52) * 2.8 + 0.32,
  0.0,
  1.0
);
float roadFineDelta = clamp((roadFineLuma - roadMesoLuma) * 3.6, -0.24, 0.24);
float roadLightFleck = smoothstep(0.035, 0.16, roadFineDelta);
float roadDarkFleck = smoothstep(0.035, 0.16, -roadFineDelta);
float roadSourceLuma = mix(0.38, 0.68, smoothstep(0.1, 0.9, mix(roadMesoLuma, roadFineLuma, 0.35)));
float roadWarmSignal = clamp(roadWearSignal * 0.45 + roadSourceLuma * 0.55, 0.0, 1.0);
float roadCoreMix = smoothstep(0.52, 0.88, vRoadOpacity);
vec3 roadSourceColor = mix(
  roadPackedColor,
  roadDryColor,
  0.28 + (1.0 - roadWarmSignal) * 0.08
);
roadSourceColor = mix(roadSourceColor, roadLightColor, roadWarmSignal * 0.2);
roadSourceColor = mix(roadSourceColor, roadLightColor, roadLightFleck * 0.25);
roadSourceColor = mix(roadSourceColor, roadDryColor, roadDarkFleck * 0.2);
roadSourceColor = mix(roadSourceColor, roadPackedColor, roadCoreMix * 0.18);
roadSourceColor = mix(roadSourceColor, roadLightColor, (1.0 - roadCoreMix) * 0.04);
roadSourceColor *= mix(0.95, 1.05, roadSourceLuma);
vec3 roadGreenSample = mix(roadMesoSample, roadFineSample, 0.42);
float roadGreenHint = clamp(
  (roadGreenSample.g - max(roadGreenSample.r, roadGreenSample.b)) * 5.5,
  0.0,
  1.0
);
float roadShoulderMix = (1.0 - smoothstep(roadEdgeFadeFull, 0.88, vRoadOpacity)) * roadCoverage;
roadSourceColor = mix(
  roadSourceColor,
  roadShoulderGrassColor,
  max(roadGreenHint, 0.22) * roadShoulderMix * 0.46
);
roadSourceColor = mix(roadPolygonColor, roadSourceColor, 0.94);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  roadPolygonColor,
  roadPolygonVariationStrength * smoothstep(roadEdgeFadeStart, roadEdgeFadeFull, vRoadOpacity)
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  roadSourceColor,
  roadCoverage * roadExternalColorStrength
);
float sharedRoadWetness = nevaSurfaceWeatherWetness(roadWetness);
float sharedRoadBoundary = nevaSurfaceTransitionWeight(1.0, 0.72);
float sharedRoadCellSignal = nevaGroundPolygonCellSignal(
  vRoadWorldPosition.xz,
  roadSharedCellScale
);
vec3 sharedRoadIdentity = mix(
  roadLightColor,
  roadPackedColor,
  clamp(nevaSurfacePathWeight() + nevaSurfaceShoulderWeight() * 0.28, 0.0, 1.0)
);
sharedRoadIdentity = mix(
  sharedRoadIdentity,
  nevaSurfaceWeightedPalette(
    roadLightColor,
    roadLightColor,
    roadDryColor,
    roadDryColor,
    roadPackedColor,
    roadDryColor,
    roadLightColor,
    roadPackedColor,
    roadDryColor,
    roadPackedColor,
    sharedRoadIdentity
  ),
  0.28
);
sharedRoadIdentity = mix(
  sharedRoadIdentity,
  roadDryColor,
  nevaSurfaceShoulderWeight() * 0.22
);
sharedRoadIdentity *= mix(0.98, 1.02, sharedRoadCellSignal);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  sharedRoadIdentity,
  roadCoverage * roadSharedTransitionMix * sharedRoadBoundary
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  roadDryColor,
  sharedRoadWetness * roadWetnessColorMix * roadSharedTransitionMix * sharedRoadBoundary
);`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentRoughness,
    `${fragmentRoughness}
float roadSourceRoughness = mix(
  texture2D(roadSourceRoughnessTexture, roadMesoUv, roadSourceLodBias + 0.45).r,
  texture2D(roadSourceRoughnessTexture, roadFineUv, roadSourceLodBias).r,
  0.28
);
roadSourceRoughness = mix(0.90, 0.97, mix(0.42, 0.72, smoothstep(0.18, 0.82, roadSourceRoughness)));
roughnessFactor = clamp(
  mix(
    roadRoughness + (roadPolygonSignal - 0.5) * roadRoughnessVariation,
    roadSourceRoughness,
    roadExternalRoughnessStrength
  ),
  0.88,
  0.98
);
roughnessFactor = mix(
  roughnessFactor,
  max(0.84, roughnessFactor - sharedRoadWetness * 0.08),
  roadCoverage * roadWetnessRoughnessMix * roadSharedTransitionMix
);`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentNormal,
    `${fragmentNormal}
normal = nevaSurfaceFacetNormal(
  normal,
  roadPolygonCell,
  roadPolygonFacetLightingStrength,
  roadCoverage
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
  private readonly ownedExternalTextures = new Set<THREE.Texture>();
  private externalTextureLoadPromise: Promise<void> | null = null;

  public constructor(config: RoadSurfaceConfig = CANONICAL_RENDER_CONFIG.roadSurface) {
    const roadColorFallback = createSurfaceFallbackTexture("color");
    const roadRoughnessFallback = createSurfaceFallbackTexture("roughness");
    this.ownedExternalTextures.add(roadColorFallback);
    this.ownedExternalTextures.add(roadRoughnessFallback);
    this.shaderUniforms = {
      roadSourceColorTexture: { value: roadColorFallback },
      roadSourceRoughnessTexture: { value: roadRoughnessFallback },
      roadPolygonCellScale: { value: config.polygonCellScaleMeters },
      roadEdgeCellScale: { value: config.polygonEdgeCellScaleMeters },
      roadSourceSampleScale: { value: config.externalTexture.sampleScaleMeters },
      roadSourceMesoSampleScale: { value: config.externalTexture.mesoSampleScaleMeters },
      roadSourceRotation: { value: config.externalTexture.rotationRadians },
      roadSourceLodBias: { value: config.externalTexture.lodBias },
      roadExternalColorStrength: { value: config.externalTexture.colorStrength },
      roadExternalRoughnessStrength: { value: config.externalTexture.roughnessStrength },
      roadPolygonVariationStrength: { value: config.polygonVariationStrength },
      roadPolygonJaggedStrength: { value: config.polygonJaggedStrength },
      roadPolygonFacetLightingStrength: { value: config.polygonFacetLightingStrength },
      roadSharedCellScale: { value: CANONICAL_RENDER_CONFIG.groundSurface.polygonCellScaleMeters },
      roadEdgeFadeStart: { value: config.edgeFadeStart },
      roadEdgeFadeFull: { value: config.edgeFadeFull },
      roadRoughness: { value: config.roughness },
      roadRoughnessVariation: { value: config.roughnessVariation },
      roadWetness: { value: 0 },
      roadWetnessColorMix: { value: CANONICAL_RENDER_CONFIG.groundSurface.wetness.colorMix },
      roadWetnessRoughnessMix: { value: CANONICAL_RENDER_CONFIG.groundSurface.wetness.roughnessMix },
      roadSharedTransitionMix: { value: CANONICAL_RENDER_CONFIG.groundSurface.roadWetnessMix },
      roadPackedColor: { value: new THREE.Color(PALETTE_HEX.path_dust_01) },
      roadDryColor: { value: new THREE.Color(PALETTE_HEX.soil_dry_01) },
      roadLightColor: { value: new THREE.Color(PALETTE_HEX.sand_warm_01) },
      roadShoulderGrassColor: { value: new THREE.Color(PALETTE_HEX.foliage_sage_01) }
    };

    const canonicalBase = PaletteMaterials.standard("path_dust_01", {
      vertexColors: true,
      vertexColorMode: "replace",
      flatShading: false,
      roughness: config.roughness
    });
    this.material = canonicalBase.clone();
    this.material.name = "road_surface_path_dust_01";
    // Keep the worked-ground ribbon in the opaque pass. Its vertex alpha now
    // feeds a narrow alpha-tested, alpha-to-coverage edge instead of a broad
    // transparent overlay, so camera order cannot change the merge.
    this.material.transparent = false;
    this.material.depthWrite = true;
    this.material.alphaTest = 0.5;
    this.material.alphaToCoverage = true;
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -3;
    this.material.polygonOffsetUnits = -3;
    this.material.onBeforeCompile = (shader) => {
      patchRoadSurfaceShader(shader as RoadSurfaceShaderSource, this.shaderUniforms);
    };
    this.material.customProgramCacheKey = () => ROAD_SURFACE_PROGRAM_CACHE_KEY;
    this.material.needsUpdate = true;
  }

  public loadExternalTextures(
    loader: Pick<THREE.TextureLoader, "loadAsync"> = new THREE.TextureLoader()
  ): Promise<void> {
    if (this.externalTextureLoadPromise) return this.externalTextureLoadPromise;

    const jobs = [
      {
        uniformName: "roadSourceColorTexture",
        spec: POLYHAVEN_SURFACE_TEXTURES.roadColor
      },
      {
        uniformName: "roadSourceRoughnessTexture",
        spec: POLYHAVEN_SURFACE_TEXTURES.roadRoughness
      }
    ] as const;

    this.externalTextureLoadPromise = Promise.all(
      jobs.map(async ({ uniformName, spec }) => {
        const texture = await loadSurfaceTexture(spec, loader);
        if (!texture) return;
        texture.anisotropy = 8;

        const uniform = this.shaderUniforms[uniformName];
        const previous = uniform.value;
        uniform.value = texture;
        if (previous instanceof THREE.Texture) {
          this.ownedExternalTextures.delete(previous);
          previous.dispose();
        }
        this.ownedExternalTextures.add(texture);
      })
    ).then(() => {
      this.material.needsUpdate = true;
    });

    return this.externalTextureLoadPromise;
  }

  public get wetness(): number {
    return this.shaderUniforms.roadWetness.value as number;
  }

  public setWetness(value: number): void {
    this.shaderUniforms.roadWetness.value = clamp01(value);
  }

  public dispose(): void {
    this.material.dispose();
    for (const texture of this.ownedExternalTextures) texture.dispose();
    this.ownedExternalTextures.clear();
  }
}
