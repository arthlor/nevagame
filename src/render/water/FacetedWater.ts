import * as THREE from "three";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { WaterSurface } from "./WaterSurface";
import type { LightingFrame } from "../lighting/LightingRig";

export interface WaterOptions {
  width?: number;
  depth?: number;
  segmentsX?: number;
  segmentsZ?: number;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uRoughness;

  out vec3 vWorldPosition;
  out float vWaveHeight;

  float waveHeight(vec2 position) {
    float roughnessScale = 1.0 + uRoughness * 1.5;
    float primary = sin(position.x * 0.10 + position.y * 0.05 + uTime * 0.72) * 0.16;
    float crossWave = cos(position.y * 0.17 + position.x * 0.07 - uTime * 1.05) * 0.08;
    float smallWave = sin((position.x + position.y) * 0.31 + uTime * 1.55) * 0.028;
    return (primary + crossWave + smallWave) * roughnessScale;
  }

  void main() {
    vec3 displaced = position;
    displaced.y += waveHeight(position.xz);
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWaveHeight = displaced.y;
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
  uniform vec3 uSkyColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  in vec3 vWorldPosition;
  in float vWaveHeight;
  out vec4 outColor;

  void main() {
    // Derivatives make every displaced triangle read as one authored facet.
    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    if (normal.y < 0.0) normal *= -1.0;

    float heightMix = smoothstep(-0.42, 0.42, vWaveHeight);
    vec3 waterColor = mix(uDeepColor, uMidColor, heightMix);
    waterColor = mix(waterColor, uShallowColor, smoothstep(0.22, 0.52, vWaveHeight));

    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(viewDirection, normal), 0.0), 2.4);
    float sunLight = max(dot(normal, normalize(uSunDirection)), 0.0);
    float sunGlint = pow(sunLight, 52.0) * 0.16;

    // Sparse graphic crest shards; shoreline foam remains a separate world concern.
    float foamBand = smoothstep(0.27, 0.34, vWaveHeight);
    float facetVariation = 0.94 + 0.08 * step(0.0, normal.x + normal.z * 0.7);
    vec3 color = waterColor * facetVariation;

    float riverCenter = sin(vWorldPosition.z * 0.04) * 6.0 - 16.0;
    float riverEdge = smoothstep(4.7, 6.8, abs(vWorldPosition.x - riverCenter));
    riverEdge *= 1.0 - smoothstep(38.0, 44.0, vWorldPosition.z);
    float coastEdge = smoothstep(40.0, 43.5, vWorldPosition.z)
      * (1.0 - smoothstep(43.5, 56.0, vWorldPosition.z));
    float shallowResponse = clamp(max(riverEdge, coastEdge), 0.0, 1.0);
    color = mix(color, uShallowColor, shallowResponse * 0.48);
    color = mix(color, uSkyColor, fresnel * 0.24);
    color += uSunColor * sunGlint;
    color = mix(color, uFoamColor, foamBand * 0.82);

    float cameraDistance = distance(cameraPosition, vWorldPosition);
    float fogFactor = smoothstep(uFogNear, uFogFar, cameraDistance);
    color = mix(color, uFogColor, fogFactor * 0.82);

    outColor = vec4(color, 0.96);
  }
`;

export class FacetedWater {
  public mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor(options: WaterOptions = {}) {
    const width = options.width ?? 200;
    const depth = options.depth ?? 200;
    const segmentsX = options.segmentsX ?? 56;
    const segmentsZ = options.segmentsZ ?? 56;

    const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uRoughness: { value: 0.2 },
        uShallowColor: { value: new THREE.Color(PALETTE_HEX.water_shallow_01) },
        uMidColor: { value: new THREE.Color(PALETTE_HEX.water_mid_01) },
        uDeepColor: { value: new THREE.Color(PALETTE_HEX.water_deep_01) },
        uFoamColor: { value: new THREE.Color(PALETTE_HEX.foam_warm_01) },
        uSunDirection: { value: new THREE.Vector3(0.62, 0.62, 0.48).normalize() },
        uSunColor: { value: new THREE.Color(CANONICAL_RENDER_CONFIG.sun.colorHex) },
        uSkyColor: { value: new THREE.Color(PALETTE_HEX.sky_pale_01) },
        uFogColor: { value: new THREE.Color(CANONICAL_RENDER_CONFIG.fog.colorHex) },
        uFogNear: { value: CANONICAL_RENDER_CONFIG.fog.near },
        uFogFar: { value: CANONICAL_RENDER_CONFIG.fog.far }
      },
      transparent: true,
      opacity: 0.96,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
  }

  public update(timeSeconds: number, seaRoughness: number = 0.2): void {
    this.mesh.material.uniforms.uTime.value = timeSeconds;
    this.mesh.material.uniforms.uRoughness.value = THREE.MathUtils.clamp(seaRoughness, 0, 1);
  }

  public updateLighting(frame: LightingFrame): void {
    const uniforms = this.mesh.material.uniforms;
    (uniforms.uSunDirection.value as THREE.Vector3).copy(frame.sunDirection);
    (uniforms.uSunColor.value as THREE.Color).copy(frame.sunColor);
    (uniforms.uSkyColor.value as THREE.Color).copy(frame.skyTopColor);
    (uniforms.uFogColor.value as THREE.Color).copy(frame.fogColor);
    uniforms.uFogNear.value = frame.fogNear;
    uniforms.uFogFar.value = frame.fogFar;
  }

  public sample(x: number, z: number, timeSeconds: number, seaRoughness: number): ReturnType<typeof WaterSurface.sample> {
    return WaterSurface.sample(x, z, timeSeconds, seaRoughness);
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
