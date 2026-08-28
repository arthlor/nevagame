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

export const TERRAIN_SURFACE_PROGRAM_CACHE_KEY = "neva-terrain-surface-r174-v18";
export const TERRAIN_DETAIL_TEXTURE_SIZE = 128;
export const TERRAIN_DETAIL_FACTOR_MIN = 0.94;
export const TERRAIN_DETAIL_FACTOR_MAX = 1.06;

export type TerrainDebugMode = "off" | "surface" | "shoreline" | "slope" | "farm" | "wetness";

const TERRAIN_DEBUG_MODE_VALUE: Readonly<Record<TerrainDebugMode, number>> = Object.freeze({
  off: 0,
  surface: 1,
  shoreline: 2,
  slope: 3,
  farm: 4,
  wetness: 5
});

export function isTerrainDebugMode(value: string | null): value is TerrainDebugMode {
  return value !== null && Object.hasOwn(TERRAIN_DEBUG_MODE_VALUE, value);
}

type TerrainSurfaceConfig = VisualRenderConfig["terrainSurface"];

interface TerrainSurfaceShaderSource {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

export function decodeTerrainDetailFactor(encoded: number): number {
  return THREE.MathUtils.lerp(
    TERRAIN_DETAIL_FACTOR_MIN,
    TERRAIN_DETAIL_FACTOR_MAX,
    clamp01(encoded / 255)
  );
}

/**
 * Creates deterministic low-frequency material signals. Red is the bounded
 * tonal/roughness factor; green and blue address approved palette bands for
 * broad grass and meadow variation. The duplicated last row/column makes the
 * repeat boundary explicit for both tests and filtered sampling.
 */
export function generateTerrainDetailTextureData(size = TERRAIN_DETAIL_TEXTURE_SIZE): Uint8Array {
  if (!Number.isInteger(size) || size < 2) {
    throw new Error(`[TerrainSurfaceMaterial] Texture size must be an integer >= 2, got ${size}`);
  }

  const data = new Uint8Array(size * size * 4);
  const period = size - 1;
  const twoPi = Math.PI * 2;
  for (let y = 0; y < size; y += 1) {
    const v = y / period;
    const phaseY = v * twoPi;
    for (let x = 0; x < size; x += 1) {
      const u = x / period;
      const phaseX = u * twoPi;
      const signal =
        0.54 * Math.sin(phaseX * 2 + 0.35) * Math.cos(phaseY * 2 - 0.25)
        + 0.28 * Math.sin((phaseX + phaseY) * 3 + 1.1)
        + 0.18 * Math.cos(phaseX * 5 - phaseY * 4 - 0.7);
      const factor = THREE.MathUtils.clamp(
        1 + signal * (TERRAIN_DETAIL_FACTOR_MAX - 1),
        TERRAIN_DETAIL_FACTOR_MIN,
        TERRAIN_DETAIL_FACTOR_MAX
      );
      const encodedFactor = Math.round(
        ((factor - TERRAIN_DETAIL_FACTOR_MIN)
          / (TERRAIN_DETAIL_FACTOR_MAX - TERRAIN_DETAIL_FACTOR_MIN)) * 255
      );
      const paletteSignal = THREE.MathUtils.clamp(
        0.5
          + 0.34 * Math.sin(phaseX + 0.6) * Math.cos(phaseY - 0.2)
          + 0.16 * Math.cos((phaseX - phaseY) * 2 + 0.9),
        0.08,
        0.92
      );
      const midScalePaletteSignal = THREE.MathUtils.clamp(
        0.5
          + 0.28 * Math.sin(phaseX * 2 - phaseY + 1.4)
          + 0.22 * Math.cos((phaseX + phaseY) * 3 - 0.3),
        0.08,
        0.92
      );
      const offset = (y * size + x) * 4;
      data[offset] = encodedFactor;
      data[offset + 1] = Math.round(paletteSignal * 255);
      data[offset + 2] = Math.round(midScalePaletteSignal * 255);
      data[offset + 3] = 255;
    }
  }
  return data;
}

export function createTerrainDetailTexture(
  size = TERRAIN_DETAIL_TEXTURE_SIZE
): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    generateTerrainDetailTextureData(size),
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
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
      `[TerrainSurfaceMaterial] Three.js r174 ${stage} shader chunk drift: expected exactly one ${marker}, found ${occurrences}`
    );
  }
  return source.replace(marker, replacement);
}

function patchTerrainSurfaceShader(
  shader: TerrainSurfaceShaderSource,
  uniforms: TerrainSurfaceShaderSource["uniforms"]
): void {
  const vertexCommon = "#include <common>";
  const vertexBegin = "#include <begin_vertex>";
  const vertexWorldPosition = "#include <worldpos_vertex>";
  const fragmentCommon = "#include <common>";
  const fragmentColor = "#include <color_fragment>";
  const fragmentNormal = "#include <normal_fragment_begin>";
  const fragmentRoughness = "#include <roughnessmap_fragment>";

  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexCommon,
    `${vertexCommon}
${SURFACE_FIELD_VERTEX_DECLARATIONS}
attribute float terrainGreenMask;
attribute float terrainPathBlend;
attribute vec3 terrainShoreWeights;
varying float vTerrainGreenMask;
varying float vTerrainPathBlend;
varying vec3 vTerrainShoreWeights;
varying vec3 vTerrainWorldPosition;`,
    "vertex"
  );
  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexBegin,
    `${vertexBegin}
${SURFACE_FIELD_VERTEX_ASSIGNMENTS}
vTerrainGreenMask = terrainGreenMask;
vTerrainPathBlend = clamp(terrainPathBlend, 0.0, 1.0);
vTerrainShoreWeights = clamp(terrainShoreWeights, 0.0, 1.0);`,
    "vertex"
  );
  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexWorldPosition,
    `${vertexWorldPosition}
vTerrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    "vertex"
  );

  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentCommon,
    `${fragmentCommon}
uniform sampler2D terrainDetailTexture;
uniform sampler2D terrainLeafyGrassColorTexture;
uniform sampler2D terrainLeafyGrassRoughnessTexture;
uniform sampler2D terrainSparseGrassColorTexture;
uniform sampler2D terrainSparseGrassRoughnessTexture;
uniform float terrainLargeSampleScale;
uniform float terrainSmallSampleScale;
uniform float terrainLeafyGrassSampleScale;
uniform float terrainSparseGrassSampleScale;
uniform float terrainLeafyGrassRotation;
uniform float terrainSparseGrassRotation;
uniform float terrainExternalColorStrength;
uniform float terrainExternalRoughnessStrength;
uniform float terrainPolygonCellScale;
uniform float terrainSmallLayerRotation;
uniform float terrainColorVariationStrength;
uniform float terrainPaletteVariationStrength;
uniform float terrainPolygonVariationStrength;
uniform float terrainPolygonJaggedStrength;
uniform float terrainPolygonFacetLightingStrength;
uniform float terrainPathShoulderStart;
uniform float terrainPathShoulderFull;
uniform float terrainPathCoreStart;
uniform float terrainPathCoreFull;
uniform float terrainPathUnderlayStrength;
uniform vec3 terrainPaletteShadowColor;
uniform vec3 terrainPaletteOliveColor;
uniform vec3 terrainPaletteSageColor;
uniform vec3 terrainPaletteGrassColor;
uniform vec3 terrainPaletteHighlightColor;
uniform vec3 terrainPathDustColor;
uniform vec3 terrainPathShoulderColor;
uniform vec3 terrainBeachColor;
uniform vec3 terrainShoreWetColor;
uniform vec3 terrainCliffColor;
uniform vec3 terrainRainDarkColor;
uniform float terrainBeachColorMix;
uniform float terrainShoreWetColorMix;
uniform float terrainCliffColorMix;
uniform float terrainShoreRainDarkening;
uniform float terrainBeachRoughness;
uniform float terrainShoreWetRoughness;
uniform float terrainCliffRoughness;
uniform float terrainShoreFacetStrength;
uniform float terrainDebugMode;
uniform float terrainRoughnessVariation;
uniform float terrainWetness;
uniform vec3 terrainWetColor;
uniform float terrainWetColorMix;
uniform float terrainDryRoughness;
uniform float terrainWetRoughness;
uniform float terrainRoughnessMin;
uniform float terrainRoughnessMax;
varying float vTerrainGreenMask;
varying float vTerrainPathBlend;
varying vec3 vTerrainShoreWeights;
varying vec3 vTerrainWorldPosition;
${SURFACE_FIELD_FRAGMENT_GLSL}`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentColor,
    `${fragmentColor}
vec2 terrainLargeUv = vTerrainWorldPosition.xz / terrainLargeSampleScale;
vec2 terrainSmallPosition = vTerrainWorldPosition.xz / terrainSmallSampleScale;
float terrainRotationSin = sin(terrainSmallLayerRotation);
float terrainRotationCos = cos(terrainSmallLayerRotation);
vec2 terrainSmallUv = vec2(
  terrainSmallPosition.x * terrainRotationCos - terrainSmallPosition.y * terrainRotationSin,
  terrainSmallPosition.x * terrainRotationSin + terrainSmallPosition.y * terrainRotationCos
);
vec4 terrainLargeSignals = texture2D(terrainDetailTexture, terrainLargeUv);
vec4 terrainSmallSignals = texture2D(terrainDetailTexture, terrainSmallUv);
float terrainLargeSample = terrainLargeSignals.r;
float terrainSmallSample = terrainSmallSignals.r;
float terrainSample = mix(terrainLargeSample, terrainSmallSample, 0.42);
float terrainSampleFactor = mix(0.94, 1.06, terrainSample);
float terrainSampleStrength = clamp(terrainColorVariationStrength / 0.06, 0.0, 1.0);
float terrainDetail = 1.0 + (terrainSampleFactor - 1.0) * terrainSampleStrength;
float terrainPaletteSignal = mix(terrainLargeSignals.g, terrainSmallSignals.b, 0.42);
float terrainMask = clamp(vTerrainGreenMask, 0.0, 1.0);
vec4 terrainPolygonCell = nevaGroundPolygonCell(
  vTerrainWorldPosition.xz,
  terrainPolygonCellScale
);
float terrainPolygonSignal = terrainPolygonCell.x;
float mosaicMask = smoothstep(
  0.24,
  0.76,
  terrainMask + (terrainPolygonSignal - 0.5) * terrainPolygonJaggedStrength * terrainMask
);
float pathPolygonSignal = nevaGroundPolygonCellSignal(
  vTerrainWorldPosition.xz,
  terrainPolygonCellScale * 1.18
);
float pathJaggedBias = (pathPolygonSignal - 0.5) * terrainPolygonJaggedStrength * 0.72;
float pathField = clamp(
  vTerrainPathBlend + pathJaggedBias * (1.0 - smoothstep(0.48, 0.92, vTerrainPathBlend)),
  0.0,
  1.0
);
float pathShoulderMix = smoothstep(terrainPathShoulderStart, terrainPathShoulderFull, pathField);
float pathCoreMix = smoothstep(terrainPathCoreStart, terrainPathCoreFull, pathField);
float pathUnderlayMix = pathShoulderMix * terrainPathUnderlayStrength;
mosaicMask *= 1.0 - pathUnderlayMix;
vec3 terrainRegionDark = mix(
  terrainPaletteShadowColor,
  terrainPaletteOliveColor,
  smoothstep(0.2, 0.62, terrainPaletteSignal)
);
vec3 terrainRegionLight = terrainPaletteSageColor;
terrainRegionDark = mix(terrainRegionDark, terrainPaletteSageColor, smoothstep(0.28, 0.72, terrainPaletteSignal));
terrainRegionLight = mix(terrainRegionLight, terrainPaletteHighlightColor, smoothstep(0.28, 0.72, terrainPaletteSignal));
terrainRegionLight = mix(terrainRegionLight, terrainPaletteGrassColor, smoothstep(0.7, 0.9, terrainPaletteSignal) * 0.45);
float terrainPaletteBand = step(0.34, terrainPolygonSignal) + step(0.7, terrainPolygonSignal);
vec3 terrainPaletteColor = mix(
  terrainRegionDark,
  terrainRegionLight,
  terrainPaletteBand * 0.5
);
terrainPaletteColor = mix(terrainPaletteSageColor, terrainPaletteColor, terrainPaletteVariationStrength);
terrainPaletteColor *= mix(0.97, 1.03, fract(terrainPolygonSignal * 6.17 + 0.13));
terrainPaletteColor *= mix(vec3(1.0), vec3(terrainDetail), 0.28);
vec2 terrainLeafyGrassPosition = vTerrainWorldPosition.xz / terrainLeafyGrassSampleScale;
float terrainLeafyGrassRotationSin = sin(terrainLeafyGrassRotation);
float terrainLeafyGrassRotationCos = cos(terrainLeafyGrassRotation);
vec2 terrainLeafyGrassUv = vec2(
  terrainLeafyGrassPosition.x * terrainLeafyGrassRotationCos
    - terrainLeafyGrassPosition.y * terrainLeafyGrassRotationSin,
  terrainLeafyGrassPosition.x * terrainLeafyGrassRotationSin
    + terrainLeafyGrassPosition.y * terrainLeafyGrassRotationCos
);
vec2 terrainSparseGrassPosition = vTerrainWorldPosition.xz / terrainSparseGrassSampleScale;
float terrainSparseGrassRotationSin = sin(terrainSparseGrassRotation);
float terrainSparseGrassRotationCos = cos(terrainSparseGrassRotation);
vec2 terrainSparseGrassUv = vec2(
  terrainSparseGrassPosition.x * terrainSparseGrassRotationCos
    - terrainSparseGrassPosition.y * terrainSparseGrassRotationSin,
  terrainSparseGrassPosition.x * terrainSparseGrassRotationSin
    + terrainSparseGrassPosition.y * terrainSparseGrassRotationCos
);
float terrainMeadowBlend = smoothstep(0.22, 0.8, terrainPaletteSignal);
vec3 terrainLeafyGrassSample = texture2D(
  terrainLeafyGrassColorTexture,
  terrainLeafyGrassUv
).rgb;
vec3 terrainSparseGrassSample = texture2D(
  terrainSparseGrassColorTexture,
  terrainSparseGrassUv
).rgb;
float terrainLeafyGrassLuma = dot(terrainLeafyGrassSample, vec3(0.299, 0.587, 0.114));
float terrainLeafyGrassSignal = clamp(
  (terrainLeafyGrassSample.g - terrainLeafyGrassSample.r * 0.58) * 2.2 + 0.42,
  0.0,
  1.0
);
float terrainLeafyValue = smoothstep(0.16, 0.82, terrainLeafyGrassLuma);
vec3 terrainLeafyGrassColor = mix(
  terrainPaletteOliveColor,
  terrainPaletteSageColor,
  smoothstep(0.18, 0.72, terrainLeafyGrassSignal)
);
terrainLeafyGrassColor = mix(
  terrainPaletteShadowColor,
  terrainLeafyGrassColor,
  0.72 + terrainLeafyValue * 0.28
);
terrainLeafyGrassColor = mix(
  terrainLeafyGrassColor,
  terrainPaletteGrassColor,
  smoothstep(0.68, 0.94, terrainLeafyGrassSignal) * 0.2
);
terrainLeafyGrassColor *= mix(0.92, 1.08, terrainLeafyValue);
float terrainSparseGrassLuma = dot(terrainSparseGrassSample, vec3(0.299, 0.587, 0.114));
float terrainSparseGrassSignal = clamp(
  (terrainSparseGrassSample.g - terrainSparseGrassSample.r * 0.52) * 2.1 + 0.44,
  0.0,
  1.0
);
float terrainSparseValue = smoothstep(0.14, 0.78, terrainSparseGrassLuma);
vec3 terrainSparseGrassColor = mix(
  terrainPaletteOliveColor,
  terrainPaletteSageColor,
  smoothstep(0.16, 0.7, terrainSparseGrassSignal)
);
terrainSparseGrassColor = mix(
  terrainPaletteShadowColor,
  terrainSparseGrassColor,
  0.76 + terrainSparseValue * 0.24
);
terrainSparseGrassColor = mix(
  terrainSparseGrassColor,
  terrainPaletteGrassColor,
  smoothstep(0.68, 0.94, terrainSparseGrassSignal) * 0.15
);
terrainSparseGrassColor *= mix(0.93, 1.07, terrainSparseValue);
vec3 terrainExternalColor = mix(
  terrainLeafyGrassColor,
  terrainSparseGrassColor,
  terrainMeadowBlend
);
terrainExternalColor = mix(terrainPaletteColor, terrainExternalColor, 0.76);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  terrainPaletteColor,
  mosaicMask * terrainPolygonVariationStrength
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  terrainExternalColor,
  mosaicMask * terrainExternalColorStrength
);
vec3 terrainShoreWeights = clamp(vTerrainShoreWeights, 0.0, 1.0);
float terrainShoreWeight = clamp(
  terrainShoreWeights.x + terrainShoreWeights.y + terrainShoreWeights.z,
  0.0,
  1.0
);
vec3 terrainShoreColor = (
  terrainBeachColor * terrainShoreWeights.x
  + terrainShoreWetColor * terrainShoreWeights.y
  + terrainCliffColor * terrainShoreWeights.z
) / max(terrainShoreWeight, 0.0001);
float terrainShoreColorMix = clamp(
  terrainShoreWeights.x * terrainBeachColorMix
  + terrainShoreWeights.y * terrainShoreWetColorMix
  + terrainShoreWeights.z * terrainCliffColorMix,
  0.0,
  1.0
);
float terrainShoreValue = mix(0.965, 1.035, terrainLargeSample);
terrainShoreColor *= terrainShoreValue;
diffuseColor.rgb = mix(diffuseColor.rgb, terrainShoreColor, terrainShoreColorMix);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  terrainRainDarkColor,
  terrainShoreWeight * clamp(terrainWetness, 0.0, 1.0) * terrainShoreRainDarkening
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  terrainWetColor,
  mosaicMask * clamp(terrainWetness, 0.0, 1.0) * terrainWetColorMix
);
vec3 pathCellColor = mix(terrainPathShoulderColor, terrainPathDustColor, pathCoreMix);
float pathValueBand = step(0.34, pathPolygonSignal) + step(0.72, pathPolygonSignal);
pathCellColor *= mix(0.98, 1.025, pathValueBand * 0.5);
diffuseColor.rgb = mix(diffuseColor.rgb, pathCellColor, pathUnderlayMix);
vec3 terrainSharedPaletteColor = nevaSurfaceWeightedPalette(
  terrainPaletteSageColor,
  terrainPaletteGrassColor,
  terrainPathShoulderColor,
  terrainWetColor,
  terrainPathDustColor,
  terrainPathShoulderColor,
  terrainBeachColor,
  terrainCliffColor,
  terrainShoreWetColor,
  terrainCliffColor,
  diffuseColor.rgb
);
float terrainSharedTransition = nevaSurfaceTransitionWeight(0.08, 0.06);
terrainSharedPaletteColor *= mix(0.985, 1.015, terrainPolygonSignal);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  terrainSharedPaletteColor,
  terrainSharedTransition * 0.42
);
float terrainSharedWetness = nevaSurfaceWeatherWetness(terrainWetness);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  terrainWetColor,
  terrainSharedWetness * terrainSharedTransition * 0.03
);
float terrainFacetMask = max(
  max(mosaicMask, pathUnderlayMix * 0.36),
  terrainShoreWeights.z * terrainShoreFacetStrength
);
float terrainDebugSlope = 1.0 - abs(normalize(cross(
  dFdx(vTerrainWorldPosition),
  dFdy(vTerrainWorldPosition)
)).y);
if (terrainDebugMode > 0.5 && terrainDebugMode < 1.5) {
  diffuseColor.rgb = vec3(terrainMask, vTerrainPathBlend, terrainShoreWeight);
  } else if (terrainDebugMode >= 1.5 && terrainDebugMode < 2.5) {
    diffuseColor.rgb = terrainShoreWeights;
  } else if (terrainDebugMode >= 2.5 && terrainDebugMode < 3.5) {
    diffuseColor.rgb = vec3(terrainDebugSlope);
  } else if (terrainDebugMode >= 3.5 && terrainDebugMode < 4.5) {
    diffuseColor.rgb = vec3(
      nevaSurfaceFarmInfluence(),
      nevaSurfaceDrySoilWeight(),
      nevaSurfaceDampSoilWeight()
    );
  } else if (terrainDebugMode >= 4.5) {
    diffuseColor.rgb = vec3(
      nevaSurfaceWetness(),
      nevaSurfaceWetShorelineWeight(),
      nevaSurfaceCliffWeight()
    );
  }`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentNormal,
    `${fragmentNormal}
normal = nevaSurfaceFacetNormal(
  normal,
  terrainPolygonCell,
  terrainPolygonFacetLightingStrength,
  terrainFacetMask
);`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentRoughness,
    `${fragmentRoughness}
float terrainWetRoughnessValue = mix(terrainDryRoughness, terrainWetRoughness, clamp(terrainWetness, 0.0, 1.0));
float terrainRoughnessDelta = (terrainSampleFactor - 1.0) * (terrainRoughnessVariation / 0.06);
float terrainSurfaceRoughness = clamp(
  terrainWetRoughnessValue + terrainRoughnessDelta,
  terrainRoughnessMin,
  terrainRoughnessMax
);
float terrainExternalRoughnessSignal = mix(
  texture2D(terrainLeafyGrassRoughnessTexture, terrainLeafyGrassUv).r,
  texture2D(terrainSparseGrassRoughnessTexture, terrainSparseGrassUv).r,
  terrainMeadowBlend
);
float terrainExternalRoughness = mix(
  0.86,
  0.97,
  clamp(terrainExternalRoughnessSignal, 0.0, 1.0)
);
terrainSurfaceRoughness = mix(
  terrainSurfaceRoughness,
  terrainExternalRoughness,
  terrainExternalRoughnessStrength
);
roughnessFactor = mix(
  roughnessFactor,
  terrainSurfaceRoughness,
  max(mosaicMask, pathUnderlayMix * 0.65)
);
float terrainShoreRoughness = (
  terrainBeachRoughness * terrainShoreWeights.x
  + terrainShoreWetRoughness * terrainShoreWeights.y
  + terrainCliffRoughness * terrainShoreWeights.z
) / max(terrainShoreWeight, 0.0001);
terrainShoreRoughness = mix(
  terrainShoreRoughness,
  min(terrainShoreRoughness, terrainShoreWetRoughness),
  clamp(terrainWetness, 0.0, 1.0) * terrainShoreWeight
);
roughnessFactor = mix(roughnessFactor, terrainShoreRoughness, terrainShoreWeight);
roughnessFactor = mix(
  roughnessFactor,
  nevaSurfaceRoughness(terrainDryRoughness, terrainWetRoughness, terrainWetness),
  terrainSharedTransition * 0.08
);`,
    "fragment"
  );

  Object.assign(shader.uniforms, uniforms);
}

export class TerrainSurfaceMaterial {
  public readonly material: THREE.MeshStandardMaterial;
  public readonly detailTexture: THREE.DataTexture;
  private readonly config: TerrainSurfaceConfig;
  private readonly shaderUniforms: TerrainSurfaceShaderSource["uniforms"];
  private readonly ownedExternalTextures = new Set<THREE.Texture>();
  private externalTextureLoadPromise: Promise<void> | null = null;
  private initialized = false;
  private lastTimeSeconds = 0;
  private targetWetness = 0;
  private transitionStartTime = 0;
  private transitionStartWetness = 0;
  private wetnessValue = 0;

  public constructor(config: TerrainSurfaceConfig = CANONICAL_RENDER_CONFIG.terrainSurface) {
    this.config = config;
    this.detailTexture = createTerrainDetailTexture(config.textureSize);
    const leafyGrassColorFallback = createSurfaceFallbackTexture("color");
    const leafyGrassRoughnessFallback = createSurfaceFallbackTexture("roughness");
    const sparseGrassColorFallback = createSurfaceFallbackTexture("color");
    const sparseGrassRoughnessFallback = createSurfaceFallbackTexture("roughness");
    this.ownedExternalTextures.add(leafyGrassColorFallback);
    this.ownedExternalTextures.add(leafyGrassRoughnessFallback);
    this.ownedExternalTextures.add(sparseGrassColorFallback);
    this.ownedExternalTextures.add(sparseGrassRoughnessFallback);
    this.shaderUniforms = {
      terrainDetailTexture: { value: this.detailTexture },
      terrainLeafyGrassColorTexture: { value: leafyGrassColorFallback },
      terrainLeafyGrassRoughnessTexture: { value: leafyGrassRoughnessFallback },
      terrainSparseGrassColorTexture: { value: sparseGrassColorFallback },
      terrainSparseGrassRoughnessTexture: { value: sparseGrassRoughnessFallback },
      terrainLargeSampleScale: { value: config.largeSampleScaleMeters },
      terrainSmallSampleScale: { value: config.smallSampleScaleMeters },
      terrainLeafyGrassSampleScale: { value: config.externalTextures.leafySampleScaleMeters },
      terrainSparseGrassSampleScale: { value: config.externalTextures.sparseSampleScaleMeters },
      terrainLeafyGrassRotation: { value: config.externalTextures.leafyRotationRadians },
      terrainSparseGrassRotation: { value: config.externalTextures.sparseRotationRadians },
      terrainExternalColorStrength: { value: config.externalTextures.colorStrength },
      terrainExternalRoughnessStrength: { value: config.externalTextures.roughnessStrength },
      terrainPolygonCellScale: { value: config.polygonCellScaleMeters },
      terrainSmallLayerRotation: { value: config.smallLayerRotationRadians },
      terrainColorVariationStrength: { value: config.colorVariationStrength },
      terrainPaletteVariationStrength: { value: config.paletteVariationStrength },
      terrainPolygonVariationStrength: { value: config.polygonVariationStrength },
      terrainPolygonJaggedStrength: { value: config.polygonJaggedStrength },
      terrainPolygonFacetLightingStrength: { value: config.polygonFacetLightingStrength },
      terrainPathShoulderStart: { value: config.pathTransition.shoulderStart },
      terrainPathShoulderFull: { value: config.pathTransition.shoulderFull },
      terrainPathCoreStart: { value: config.pathTransition.coreStart },
      terrainPathCoreFull: { value: config.pathTransition.coreFull },
      terrainPathUnderlayStrength: { value: config.pathTransition.underlayStrength },
      terrainPaletteShadowColor: { value: new THREE.Color(PALETTE_HEX.foliage_shadow_01) },
      terrainPaletteOliveColor: { value: new THREE.Color(PALETTE_HEX.foliage_olive_01) },
      terrainPaletteSageColor: { value: new THREE.Color(PALETTE_HEX.foliage_sage_01) },
      terrainPaletteGrassColor: { value: new THREE.Color(PALETTE_HEX.grass_yellow_01) },
      terrainPaletteHighlightColor: { value: new THREE.Color(PALETTE_HEX.foliage_highlight_01) },
      terrainPathDustColor: { value: new THREE.Color(PALETTE_HEX.path_dust_01) },
      terrainPathShoulderColor: { value: new THREE.Color(PALETTE_HEX.soil_dry_01) },
      terrainBeachColor: { value: new THREE.Color(PALETTE_HEX.sand_warm_01) },
      terrainShoreWetColor: { value: new THREE.Color(PALETTE_HEX.shore_wet_01) },
      terrainCliffColor: { value: new THREE.Color(PALETTE_HEX.stone_cool_01) },
      terrainRainDarkColor: { value: new THREE.Color(PALETTE_HEX.soil_warm_01) },
      terrainBeachColorMix: { value: config.shoreline.beachColorMix },
      terrainShoreWetColorMix: { value: config.shoreline.wetColorMix },
      terrainCliffColorMix: { value: config.shoreline.cliffColorMix },
      terrainShoreRainDarkening: { value: config.shoreline.rainDarkening },
      terrainBeachRoughness: { value: config.shoreline.beachRoughness },
      terrainShoreWetRoughness: { value: config.shoreline.wetRoughness },
      terrainCliffRoughness: { value: config.shoreline.cliffRoughness },
      terrainShoreFacetStrength: { value: config.shoreline.facetStrength },
      terrainDebugMode: { value: TERRAIN_DEBUG_MODE_VALUE.off },
      terrainRoughnessVariation: { value: config.roughnessVariation },
      terrainWetness: { value: this.wetnessValue },
      terrainWetColor: { value: new THREE.Color(PALETTE_HEX.foliage_shadow_01) },
      terrainWetColorMix: { value: config.wetness.colorMix },
      terrainDryRoughness: { value: config.roughness.dry },
      terrainWetRoughness: { value: config.roughness.wet },
      terrainRoughnessMin: { value: config.roughness.min },
      terrainRoughnessMax: { value: config.roughness.max }
    };

    const canonicalBase = PaletteMaterials.standard("foliage_sage_01", {
      vertexColors: true,
      vertexColorMode: "replace",
      flatShading: false,
      roughness: config.roughness.dry
    });
    this.material = canonicalBase.clone();
    this.material.name = "terrain_surface_foliage_sage_01";
    this.material.onBeforeCompile = (shader) => {
      patchTerrainSurfaceShader(shader as TerrainSurfaceShaderSource, this.shaderUniforms);
    };
    this.material.customProgramCacheKey = () => TERRAIN_SURFACE_PROGRAM_CACHE_KEY;
    this.material.needsUpdate = true;
  }

  public loadExternalTextures(
    loader: Pick<THREE.TextureLoader, "loadAsync"> = new THREE.TextureLoader()
  ): Promise<void> {
    if (this.externalTextureLoadPromise) return this.externalTextureLoadPromise;

    const jobs = [
      {
        uniformName: "terrainLeafyGrassColorTexture",
        spec: POLYHAVEN_SURFACE_TEXTURES.leafyGrassColor
      },
      {
        uniformName: "terrainLeafyGrassRoughnessTexture",
        spec: POLYHAVEN_SURFACE_TEXTURES.leafyGrassRoughness
      },
      {
        uniformName: "terrainSparseGrassColorTexture",
        spec: POLYHAVEN_SURFACE_TEXTURES.sparseGrassColor
      },
      {
        uniformName: "terrainSparseGrassRoughnessTexture",
        spec: POLYHAVEN_SURFACE_TEXTURES.sparseGrassRoughness
      }
    ] as const;

    this.externalTextureLoadPromise = Promise.all(
      jobs.map(async ({ uniformName, spec }) => {
        const texture = await loadSurfaceTexture(spec, loader);
        if (!texture) return;

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
    return this.wetnessValue;
  }

  public setDebugMode(mode: TerrainDebugMode): void {
    this.shaderUniforms.terrainDebugMode.value = TERRAIN_DEBUG_MODE_VALUE[mode];
  }

  /**
   * Moves the render-only wetness between precipitation targets using an
   * absolute time transition, making the response deterministic across FPS.
   */
  public updateWeather(precipitation: number, timeSeconds: number): void {
    const target = clamp01(Number.isFinite(precipitation) ? precipitation : 0);
    let time = Number.isFinite(timeSeconds) ? timeSeconds : this.lastTimeSeconds;
    if (this.initialized && time < this.lastTimeSeconds) time = this.lastTimeSeconds;

    if (!this.initialized) {
      this.initialized = true;
      this.targetWetness = target;
      this.transitionStartTime = time;
      this.transitionStartWetness = this.wetnessValue;
    } else {
      this.wetnessValue = this.transitionWetness(time);
      if (target !== this.targetWetness) {
        this.targetWetness = target;
        this.transitionStartTime = time;
        this.transitionStartWetness = this.wetnessValue;
      }
    }

    this.wetnessValue = this.transitionWetness(time);
    this.lastTimeSeconds = time;
    this.shaderUniforms.terrainWetness.value = this.wetnessValue;
  }

  public dispose(): void {
    this.material.dispose();
    this.detailTexture.dispose();
    for (const texture of this.ownedExternalTextures) texture.dispose();
    this.ownedExternalTextures.clear();
  }

  private transitionWetness(timeSeconds: number): number {
    const duration = this.targetWetness >= this.transitionStartWetness
      ? this.config.wetness.riseSeconds
      : this.config.wetness.fallSeconds;
    if (duration <= 0) return this.targetWetness;
    const progress = clamp01((timeSeconds - this.transitionStartTime) / duration);
    return THREE.MathUtils.lerp(this.transitionStartWetness, this.targetWetness, progress);
  }
}
