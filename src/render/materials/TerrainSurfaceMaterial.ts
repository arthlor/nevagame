import * as THREE from "three";

import { CANONICAL_RENDER_CONFIG, type VisualRenderConfig } from "../config/VisualRenderConfig";
import { PaletteMaterials } from "./PaletteMaterials";
import { PALETTE_HEX } from "./PaletteTokens";

export const TERRAIN_SURFACE_PROGRAM_CACHE_KEY = "neva-terrain-surface-r174-v2";
export const TERRAIN_DETAIL_TEXTURE_SIZE = 128;
export const TERRAIN_DETAIL_FACTOR_MIN = 0.94;
export const TERRAIN_DETAIL_FACTOR_MAX = 1.06;

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
  const fragmentRoughness = "#include <roughnessmap_fragment>";

  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexCommon,
    `${vertexCommon}
attribute float terrainGreenMask;
varying float vTerrainGreenMask;
varying vec3 vTerrainWorldPosition;`,
    "vertex"
  );
  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexBegin,
    `${vertexBegin}
vTerrainGreenMask = terrainGreenMask;`,
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
uniform float terrainLargeSampleScale;
uniform float terrainSmallSampleScale;
uniform float terrainSmallLayerRotation;
uniform float terrainColorVariationStrength;
uniform float terrainPaletteVariationStrength;
uniform vec3 terrainPaletteOliveColor;
uniform vec3 terrainPaletteSageColor;
uniform vec3 terrainPaletteGrassColor;
uniform float terrainRoughnessVariation;
uniform float terrainWetness;
uniform vec3 terrainWetColor;
uniform float terrainWetColorMix;
uniform float terrainDryRoughness;
uniform float terrainWetRoughness;
uniform float terrainRoughnessMin;
uniform float terrainRoughnessMax;
varying float vTerrainGreenMask;
varying vec3 vTerrainWorldPosition;`,
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
float terrainPaletteLower = smoothstep(0.08, 0.5, terrainPaletteSignal);
float terrainPaletteUpper = smoothstep(0.5, 0.92, terrainPaletteSignal);
vec3 terrainPaletteColor = mix(terrainPaletteOliveColor, terrainPaletteSageColor, terrainPaletteLower);
terrainPaletteColor = mix(terrainPaletteColor, terrainPaletteGrassColor, terrainPaletteUpper);
float terrainMask = clamp(vTerrainGreenMask, 0.0, 1.0);
diffuseColor.rgb *= mix(vec3(1.0), vec3(terrainDetail), terrainMask);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  terrainPaletteColor,
  terrainMask * terrainPaletteVariationStrength
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  terrainWetColor,
  terrainMask * clamp(terrainWetness, 0.0, 1.0) * terrainWetColorMix
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
roughnessFactor = mix(roughnessFactor, terrainSurfaceRoughness, terrainMask);`,
    "fragment"
  );

  Object.assign(shader.uniforms, uniforms);
}

export class TerrainSurfaceMaterial {
  public readonly material: THREE.MeshStandardMaterial;
  public readonly detailTexture: THREE.DataTexture;
  private readonly config: TerrainSurfaceConfig;
  private readonly shaderUniforms: TerrainSurfaceShaderSource["uniforms"];
  private initialized = false;
  private lastTimeSeconds = 0;
  private targetWetness = 0;
  private transitionStartTime = 0;
  private transitionStartWetness = 0;
  private wetnessValue = 0;

  public constructor(config: TerrainSurfaceConfig = CANONICAL_RENDER_CONFIG.terrainSurface) {
    this.config = config;
    this.detailTexture = createTerrainDetailTexture(config.textureSize);
    this.shaderUniforms = {
      terrainDetailTexture: { value: this.detailTexture },
      terrainLargeSampleScale: { value: config.largeSampleScaleMeters },
      terrainSmallSampleScale: { value: config.smallSampleScaleMeters },
      terrainSmallLayerRotation: { value: config.smallLayerRotationRadians },
      terrainColorVariationStrength: { value: config.colorVariationStrength },
      terrainPaletteVariationStrength: { value: config.paletteVariationStrength },
      terrainPaletteOliveColor: { value: new THREE.Color(PALETTE_HEX.foliage_olive_01) },
      terrainPaletteSageColor: { value: new THREE.Color(PALETTE_HEX.foliage_sage_01) },
      terrainPaletteGrassColor: { value: new THREE.Color(PALETTE_HEX.grass_yellow_01) },
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
      flatShading: true,
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

  public get wetness(): number {
    return this.wetnessValue;
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
