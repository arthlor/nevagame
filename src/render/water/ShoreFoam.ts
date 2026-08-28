import * as THREE from "three";
import { WORLD_BOUNDS, WORLD_LAYOUT_V5, WorldLayout } from "../../world/WorldLayout";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import type { LightingFrame } from "../lighting/LightingRig";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { waterHeight, type WaterConditions } from "./WaterSurface";

export interface ShoreFoamPatch {
  source: "coast";
  center: Readonly<{ x: number; z: number }>;
  tangent: Readonly<{ x: number; z: number }>;
  waterNormal: Readonly<{ x: number; z: number }>;
  length: number;
  width: number;
  phase: number;
  exposure: number;
}

export const SHORE_FOAM_STYLE = Object.freeze({
  coastSpacing: 4.6,
  minLength: 1.8,
  maxLength: 5.2,
  minWidth: 0.22,
  maxWidth: 0.64,
  maxAlpha: 0.42
});

function deterministicUnit(index: number, salt: number): number {
  const value = Math.sin(index * 91.731 + salt * 37.113) * 43758.5453;
  return value - Math.floor(value);
}

/** Deterministic broken coastal wash; river banks deliberately stay foam-free. */
export function buildShoreFoamPatches(): ShoreFoamPatch[] {
  const patches: ShoreFoamPatch[] = [];
  const mouth = WORLD_LAYOUT_V5.riverMouth;
  const openingHalfWidth = WorldLayout.riverHalfWidth(mouth.z) + 6.5;
  let index = 0;
  for (
    let x = WORLD_BOUNDS.minX + SHORE_FOAM_STYLE.coastSpacing * 0.5;
    x <= WORLD_BOUNDS.maxX;
    x += SHORE_FOAM_STYLE.coastSpacing
  ) {
    const shoreline = WorldLayout.coastlineZ(x);
    if (
      Math.abs(x - mouth.x) < openingHalfWidth
      && WorldLayout.estuaryInfluence(x, shoreline) > 0.06
    ) {
      index += 1;
      continue;
    }
    const coast = WorldLayout.coastProfile(x);
    const exposure = THREE.MathUtils.clamp(
      0.28
        + coast.rockShelf * 0.4
        + coast.headland * 0.34
        + coast.beach * 0.16
        - coast.harborCove * 0.12,
      0.2,
      1
    );
    const includeThreshold = 0.34 + exposure * 0.34;
    if (deterministicUnit(index, 1) > includeThreshold) {
      index += 1;
      continue;
    }

    const sampleDistance = 1.2;
    const slope = (
      WorldLayout.coastlineZ(x + sampleDistance) - WorldLayout.coastlineZ(x - sampleDistance)
    ) / (sampleDistance * 2);
    const tangentLength = Math.hypot(1, slope);
    const tangent = { x: 1 / tangentLength, z: slope / tangentLength };
    const waterNormal = { x: -tangent.z, z: tangent.x };
    const length = THREE.MathUtils.lerp(
      SHORE_FOAM_STYLE.minLength,
      SHORE_FOAM_STYLE.maxLength,
      deterministicUnit(index, 2) * (0.56 + exposure * 0.44)
    );
    const width = THREE.MathUtils.lerp(
      SHORE_FOAM_STYLE.minWidth,
      SHORE_FOAM_STYLE.maxWidth,
      deterministicUnit(index, 3) * exposure
    );
    const waterOffset = 0.24 + deterministicUnit(index, 4) * 0.68;
    const alongOffset = (deterministicUnit(index, 5) - 0.5) * 1.2;
    patches.push({
      source: "coast",
      center: {
        x: x + tangent.x * alongOffset + waterNormal.x * waterOffset,
        z: shoreline + tangent.z * alongOffset + waterNormal.z * waterOffset
      },
      tangent,
      waterNormal,
      length,
      width,
      phase: deterministicUnit(index, 6) * Math.PI * 2,
      exposure
    });
    index += 1;
  }

  return patches;
}

function appendPatch(
  patch: ShoreFoamPatch,
  positions: number[],
  uvs: number[],
  phases: number[],
  exposures: number[],
  indices: number[]
): void {
  const base = positions.length / 3;
  const halfLength = patch.length * 0.5;
  const halfWidth = patch.width * 0.5;
  for (const along of [-1, 1]) {
    for (const across of [-1, 1]) {
      positions.push(
        patch.center.x + patch.tangent.x * halfLength * along + patch.waterNormal.x * halfWidth * across,
        0,
        patch.center.z + patch.tangent.z * halfLength * along + patch.waterNormal.z * halfWidth * across
      );
      uvs.push((along + 1) * 0.5, (across + 1) * 0.5);
      phases.push(patch.phase);
      exposures.push(patch.exposure);
    }
  }
  indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
}

export class ShoreFoam {
  public readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly basePositions: Float32Array;

  constructor() {
    const positions: number[] = [];
    const uvs: number[] = [];
    const phases: number[] = [];
    const exposures: number[] = [];
    const indices: number[] = [];
    for (const patch of buildShoreFoamPatches()) {
      appendPatch(patch, positions, uvs, phases, exposures, indices);
    }

    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.Float32BufferAttribute(positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("patchPhase", new THREE.Float32BufferAttribute(phases, 1));
    geometry.setAttribute("patchExposure", new THREE.Float32BufferAttribute(exposures, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    this.basePositions = new Float32Array(positionAttribute.array);

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uRoughness: { value: 0.2 },
        uMaxAlpha: { value: SHORE_FOAM_STYLE.maxAlpha },
        uDaylight: { value: 1 },
        uKeyLightStrength: { value: 1 },
        uFoamColor: { value: new THREE.Color(PALETTE_HEX.foam_warm_01) },
        uShallowColor: { value: new THREE.Color(PALETTE_HEX.water_shallow_01) }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uRoughness;
        in float patchPhase;
        in float patchExposure;
        out vec2 vUv;
        out float vPhase;
        out float vExposure;
        void main() {
          vec3 displaced = position;
          displaced.y += sin(uTime * 0.38 + patchPhase) * (0.004 + uRoughness * 0.006);
          vUv = uv;
          vPhase = patchPhase;
          vExposure = patchExposure;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uFoamColor;
        uniform vec3 uShallowColor;
        uniform float uTime;
        uniform float uRoughness;
        uniform float uMaxAlpha;
        uniform float uDaylight;
        uniform float uKeyLightStrength;
        in vec2 vUv;
        in float vPhase;
        in float vExposure;
        out vec4 outColor;
        void main() {
          float alongEdge = smoothstep(0.02, 0.25, vUv.x) * (1.0 - smoothstep(0.75, 0.98, vUv.x));
          float acrossEdge = smoothstep(0.02, 0.34, vUv.y) * (1.0 - smoothstep(0.66, 0.98, vUv.y));
          float staticShard = sin(vUv.x * 11.0 + vUv.y * 4.7 + vPhase) * 0.5 + 0.5;
          float breakup = smoothstep(0.22, 0.78, staticShard);
          float pulse = 0.9 + sin(uTime * 0.34 + vPhase) * 0.1;
          float weather = mix(0.58, 1.0, uRoughness);
          float alpha = alongEdge * acrossEdge * mix(0.38, 1.0, breakup)
            * uMaxAlpha * vExposure * pulse * weather;
          if (alpha < 0.018) discard;
          float lightResponse = clamp(mix(0.16, 0.92, uDaylight) + uKeyLightStrength * 0.08, 0.12, 1.0);
          vec3 color = mix(uShallowColor, uFoamColor, 0.62) * lightResponse;
          outColor = vec4(color, alpha);
        }
      `
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "authored_broken_shore_foam";
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = true;
  }

  public update(timeSeconds: number, conditions: WaterConditions): void {
    this.mesh.material.uniforms.uTime.value = timeSeconds;
    this.mesh.material.uniforms.uRoughness.value = THREE.MathUtils.clamp(conditions.seaRoughness, 0, 1);
    const positions = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const heightOffset = CANONICAL_RENDER_CONFIG.waterSurface.shoreline.foamHeightOffsetMeters;
    for (let index = 0; index < positions.count; index += 1) {
      const sourceOffset = index * 3;
      const x = this.basePositions[sourceOffset];
      const z = this.basePositions[sourceOffset + 2];
      positions.setY(index, waterHeight(x, z, timeSeconds, conditions) + heightOffset);
    }
    positions.needsUpdate = true;
  }

  public updateLighting(frame: LightingFrame): void {
    this.mesh.material.uniforms.uDaylight.value = frame.daylight;
    this.mesh.material.uniforms.uKeyLightStrength.value = THREE.MathUtils.clamp(
      Math.max(frame.sunIntensity, frame.moonIntensity, frame.lightning) / 3.2,
      0,
      1
    );
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
