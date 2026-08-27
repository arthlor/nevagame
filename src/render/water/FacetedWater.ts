import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import type { LightingFrame } from "../lighting/LightingRig";
import { GROUND_POLYGON_CELL_GLSL } from "../materials/GroundPolygonCells";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { WATER_SURFACE } from "../../world/WorldLayout";
import {
  WATER_WAVE_CONFIG,
  WaterSurface,
  waterSpatialProfile,
  type WaterConditions
} from "./WaterSurface";

export interface WaterOptions {
  width?: number;
  depth?: number;
  segmentsX?: number;
  segmentsZ?: number;
  centerX?: number;
  centerZ?: number;
}

export const SHORE_MASK_RESOLUTION = 512;

function createWaterProfileMap(
  bounds: THREE.Vector4,
  size: number = SHORE_MASK_RESOLUTION
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = bounds.x + (column / (size - 1)) * bounds.z;
      const z = bounds.y + (row / (size - 1)) * bounds.w;
      const profile = waterSpatialProfile(x, z);
      const offset = (row * size + column) * 4;
      data[offset] = Math.round(
        THREE.MathUtils.clamp((profile.signedWaterDistance + 16) / 32, 0, 1) * 255
      );
      data[offset + 1] = Math.round(profile.weights.river * 255);
      data[offset + 2] = Math.round(profile.weights.ocean * 255);
      const angle = Math.atan2(profile.localDirection.y, profile.localDirection.x);
      data[offset + 3] = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uRoughness;
  uniform float uWindSpeed;
  uniform vec2 uWindDirection;
  uniform sampler2D uWaterProfileMap;
  uniform vec4 uWaterProfileBounds;
  uniform vec3 uPrimaryAmplitude;
  uniform vec3 uPrimaryFrequency;
  uniform vec3 uPrimarySpeed;
  uniform vec3 uCrossAmplitude;
  uniform vec3 uCrossFrequency;
  uniform vec3 uCrossSpeed;
  uniform vec3 uDetailAmplitude;
  uniform vec3 uDetailFrequency;
  uniform vec3 uDetailSpeed;
  uniform vec3 uRoughnessGain;
  uniform float uOceanWindGain;

  out vec3 vWorldPosition;
  out float vWaveHeight;
  out float vSignedWaterDistance;
  out vec3 vRegionWeights;

  vec4 profileAt(vec2 worldPosition) {
    vec2 uv = (worldPosition - uWaterProfileBounds.xy) / uWaterProfileBounds.zw;
    return texture(uWaterProfileMap, clamp(uv, vec2(0.0), vec2(1.0)));
  }

  float weightedValue(vec3 values, vec3 weights) {
    return dot(values, weights);
  }

  float bandHeight(
    vec3 amplitude,
    vec3 frequency,
    vec3 speed,
    vec3 weights,
    float projectedPosition,
    float phase
  ) {
    return sin(
      projectedPosition * weightedValue(frequency, weights)
      + uTime * weightedValue(speed, weights)
      + phase
    ) * weightedValue(amplitude, weights);
  }

  float waveHeight(vec2 worldPosition, vec4 profile) {
    float riverWeight = profile.g;
    float oceanWeight = profile.b;
    float seaWeight = max(0.0, 1.0 - riverWeight - oceanWeight);
    vec3 weights = vec3(riverWeight, seaWeight, oceanWeight);
    float localAngle = profile.a * 6.28318530718 - 3.14159265359;
    vec2 localDirection = vec2(cos(localAngle), sin(localAngle));
    vec2 direction = normalize(mix(localDirection, uWindDirection, oceanWeight));
    vec2 crossDirection = vec2(-direction.y, direction.x);
    float primaryPosition = dot(worldPosition, direction);
    float crossPosition = dot(worldPosition, crossDirection);
    float detailPosition = dot(worldPosition, direction * 0.72 + crossDirection * 0.28);
    float roughnessScale = 1.0
      + uRoughness * weightedValue(uRoughnessGain, weights)
      + uWindSpeed * oceanWeight * uOceanWindGain;
    return (
      bandHeight(uPrimaryAmplitude, uPrimaryFrequency, uPrimarySpeed, weights, primaryPosition, 0.0)
      + bandHeight(uCrossAmplitude, uCrossFrequency, uCrossSpeed, weights, crossPosition, 1.7)
      + bandHeight(uDetailAmplitude, uDetailFrequency, uDetailSpeed, weights, detailPosition, 4.1)
    ) * roughnessScale;
  }

  void main() {
    vec4 baseWorldPosition = modelMatrix * vec4(position, 1.0);
    vec4 profile = profileAt(baseWorldPosition.xz);
    float height = waveHeight(baseWorldPosition.xz, profile);
    vec3 displaced = position;
    displaced.y += height;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    float riverWeight = profile.g;
    float oceanWeight = profile.b;
    vRegionWeights = vec3(riverWeight, max(0.0, 1.0 - riverWeight - oceanWeight), oceanWeight);
    vSignedWaterDistance = profile.r * 32.0 - 16.0;
    vWorldPosition = worldPosition.xyz;
    vWaveHeight = height;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uShallowColor;
  uniform vec3 uMidColor;
  uniform vec3 uDeepColor;
  uniform vec3 uFoamColor;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uKeyLightStrength;
  uniform float uDaylight;
  uniform float uRoughness;
  uniform vec3 uSkyColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uPolygonCellScale;
  uniform float uPolygonColorVariation;
  uniform float uPolygonNormalStrength;
  uniform float uFresnelStrength;
  uniform float uSunGlintStrength;

  in vec3 vWorldPosition;
  in float vWaveHeight;
  in float vSignedWaterDistance;
  in vec3 vRegionWeights;
  out vec4 outColor;

  ${GROUND_POLYGON_CELL_GLSL}

  void main() {
    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    if (normal.y < 0.0) normal *= -1.0;
    vec4 waterPolygonCell = nevaGroundPolygonCell(vWorldPosition.xz, uPolygonCellScale);
    normal = normalize(normal + vec3(
      waterPolygonCell.y - 0.5,
      0.0,
      waterPolygonCell.z - 0.5
    ) * uPolygonNormalStrength);

    float waterDepth = max(0.0, vSignedWaterDistance);
    float shallowMix = 1.0 - smoothstep(0.35, 8.5, waterDepth);
    vec3 waterColor = mix(uMidColor, uShallowColor, shallowMix * 0.74);
    waterColor = mix(waterColor, uDeepColor, vRegionWeights.z * 0.82);
    float waterFacetBand = step(0.34, waterPolygonCell.x) + step(0.7, waterPolygonCell.x);
    waterColor *= mix(
      1.0 - uPolygonColorVariation,
      1.0 + uPolygonColorVariation,
      waterFacetBand * 0.5
    );

    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(viewDirection, normal), 0.0), 2.5);
    float sunLight = max(dot(normal, normalize(uSunDirection)), 0.0);
    float sunGlint = pow(sunLight, 58.0) * uSunGlintStrength * uKeyLightStrength;
    float facetVariation = 0.95 + 0.07 * step(0.0, normal.x + normal.z * 0.7);
    float environmentLight = mix(0.24, 1.0, uDaylight);
    vec3 color = waterColor * facetVariation * environmentLight;
    color = mix(color, uSkyColor * environmentLight, fresnel * uFresnelStrength);
    color += uSunColor * sunGlint;

    float steepness = 1.0 - normal.y;
    float roughOcean = vRegionWeights.z * smoothstep(0.62, 0.9, uRoughness);
    float crest = smoothstep(0.16, 0.29, vWaveHeight) * smoothstep(0.018, 0.075, steepness);
    float brokenA = sin(vWorldPosition.x * 0.31 + vWorldPosition.z * 0.17) * 0.5 + 0.5;
    float brokenB = sin(vWorldPosition.x * -0.13 + vWorldPosition.z * 0.37 + 1.9) * 0.5 + 0.5;
    float brokenMask = smoothstep(0.72, 0.91, brokenA * 0.62 + brokenB * 0.38);
    float whitecap = roughOcean * crest * brokenMask;
    float foamLight = clamp(mix(0.12, 0.92, uDaylight) + uKeyLightStrength * 0.08, 0.1, 1.0);
    color = mix(color, uFoamColor * foamLight, whitecap * 0.34);

    float cameraDistance = distance(cameraPosition, vWorldPosition);
    float fogFactor = smoothstep(uFogNear, uFogFar, cameraDistance);
    color = mix(color, uFogColor, fogFactor * 0.82);
    outColor = vec4(color, 0.96);
  }
`;

function vector(values: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(values[0], values[1], values[2]);
}

export class FacetedWater {
  public mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly waterProfileMap: THREE.DataTexture;
  private conditions: WaterConditions = {
    seaRoughness: 0.2,
    windDirectionDeg: 0,
    windSpeed: 0
  };

  constructor(options: WaterOptions = {}) {
    const width = options.width ?? WATER_SURFACE.width;
    const depth = options.depth ?? WATER_SURFACE.depth;
    const segmentsX = options.segmentsX ?? WATER_SURFACE.segmentsX;
    const segmentsZ = options.segmentsZ ?? WATER_SURFACE.segmentsZ;
    const centerX = options.centerX ?? WATER_SURFACE.centerX;
    const centerZ = options.centerZ ?? WATER_SURFACE.centerZ;
    const profileBounds = new THREE.Vector4(
      centerX - width * 0.5,
      centerZ - depth * 0.5,
      width,
      depth
    );

    const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
    geometry.rotateX(-Math.PI / 2);
    this.waterProfileMap = createWaterProfileMap(profileBounds);
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uRoughness: { value: 0.2 },
        uWindSpeed: { value: 0 },
        uWindDirection: { value: new THREE.Vector2(0, 1) },
        uWaterProfileMap: { value: this.waterProfileMap },
        uWaterProfileBounds: { value: profileBounds },
        uPrimaryAmplitude: { value: vector(WATER_WAVE_CONFIG.primary.amplitude) },
        uPrimaryFrequency: { value: vector(WATER_WAVE_CONFIG.primary.frequency) },
        uPrimarySpeed: { value: vector(WATER_WAVE_CONFIG.primary.speed) },
        uCrossAmplitude: { value: vector(WATER_WAVE_CONFIG.cross.amplitude) },
        uCrossFrequency: { value: vector(WATER_WAVE_CONFIG.cross.frequency) },
        uCrossSpeed: { value: vector(WATER_WAVE_CONFIG.cross.speed) },
        uDetailAmplitude: { value: vector(WATER_WAVE_CONFIG.detail.amplitude) },
        uDetailFrequency: { value: vector(WATER_WAVE_CONFIG.detail.frequency) },
        uDetailSpeed: { value: vector(WATER_WAVE_CONFIG.detail.speed) },
        uRoughnessGain: { value: vector(WATER_WAVE_CONFIG.roughnessGain) },
        uOceanWindGain: { value: WATER_WAVE_CONFIG.oceanWindGainPerMeterSecond },
        uShallowColor: { value: new THREE.Color(PALETTE_HEX.water_shallow_01) },
        uMidColor: { value: new THREE.Color(PALETTE_HEX.water_mid_01) },
        uDeepColor: { value: new THREE.Color(PALETTE_HEX.water_deep_01) },
        uFoamColor: { value: new THREE.Color(PALETTE_HEX.foam_warm_01) },
        uSunDirection: { value: new THREE.Vector3(0.62, 0.62, 0.48).normalize() },
        uSunColor: { value: new THREE.Color(CANONICAL_RENDER_CONFIG.sun.colorHex) },
        uKeyLightStrength: { value: 1 },
        uDaylight: { value: 1 },
        uSkyColor: { value: new THREE.Color(PALETTE_HEX.sky_pale_01) },
        uFogColor: { value: new THREE.Color(CANONICAL_RENDER_CONFIG.fog.colorHex) },
        uFogNear: { value: CANONICAL_RENDER_CONFIG.fog.near },
        uFogFar: { value: CANONICAL_RENDER_CONFIG.fog.far },
        uPolygonCellScale: { value: CANONICAL_RENDER_CONFIG.waterSurface.polygonCellScaleMeters },
        uPolygonColorVariation: { value: CANONICAL_RENDER_CONFIG.waterSurface.polygonColorVariationStrength },
        uPolygonNormalStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.polygonNormalStrength },
        uFresnelStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.fresnelStrength },
        uSunGlintStrength: { value: CANONICAL_RENDER_CONFIG.waterSurface.sunGlintStrength }
      },
      transparent: true,
      opacity: 0.96,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(centerX, 0, centerZ);
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
  }

  public update(timeSeconds: number, conditions: WaterConditions): void {
    this.conditions = {
      seaRoughness: THREE.MathUtils.clamp(conditions.seaRoughness, 0, 1),
      windDirectionDeg: conditions.windDirectionDeg,
      windSpeed: Math.max(0, conditions.windSpeed)
    };
    const uniforms = this.mesh.material.uniforms;
    const windRadians = THREE.MathUtils.degToRad(this.conditions.windDirectionDeg);
    uniforms.uTime.value = timeSeconds;
    uniforms.uRoughness.value = this.conditions.seaRoughness;
    uniforms.uWindSpeed.value = this.conditions.windSpeed;
    (uniforms.uWindDirection.value as THREE.Vector2).set(
      Math.sin(windRadians),
      Math.cos(windRadians)
    );
  }

  public updateLighting(frame: LightingFrame): void {
    const uniforms = this.mesh.material.uniforms;
    const lightningOwnsKey = frame.lightning > 0.025;
    const moonOwnsKey = !lightningOwnsKey && frame.moonIntensity > frame.sunIntensity;
    (uniforms.uSunDirection.value as THREE.Vector3).copy(
      lightningOwnsKey
        ? frame.lightningDirection
        : moonOwnsKey ? frame.moonDirection : frame.sunDirection
    );
    (uniforms.uSunColor.value as THREE.Color).copy(
      lightningOwnsKey ? frame.lightningColor : moonOwnsKey ? frame.moonColor : frame.sunColor
    );
    uniforms.uKeyLightStrength.value = THREE.MathUtils.clamp(
      Math.max(
        frame.sunIntensity,
        frame.moonIntensity,
        frame.lightning * CANONICAL_RENDER_CONFIG.sun.intensity * 0.82
      ) / CANONICAL_RENDER_CONFIG.sun.intensity,
      0,
      1
    );
    uniforms.uDaylight.value = frame.daylight;
    (uniforms.uSkyColor.value as THREE.Color).copy(frame.skyTopColor);
    (uniforms.uFogColor.value as THREE.Color).copy(frame.fogColor);
    uniforms.uFogNear.value = frame.fogNear;
    uniforms.uFogFar.value = frame.fogFar;
  }

  public sample(x: number, z: number, timeSeconds: number): ReturnType<typeof WaterSurface.sample> {
    return WaterSurface.sample(x, z, timeSeconds, this.conditions);
  }

  public dispose(): void {
    this.waterProfileMap.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
