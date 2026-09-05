import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import type { LightingFrame } from "../lighting/LightingRig";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { WaterSurface, type WaterConditions } from "./WaterSurface";

type DisturbanceKind = "hull" | "paddle";

interface WakeEntry {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  active: boolean;
  kind: DisturbanceKind;
  spawnedAt: number;
  duration: number;
  x: number;
  z: number;
  conditions: WaterConditions;
  baseScale: number;
}

function geometryFromQuads(quads: readonly (readonly [number, number, number, number])[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const [index, [innerX, innerZ, outerX, outerZ]] of quads.entries()) {
    const base = index * 4;
    const width = 0.055 + Math.abs(outerX - innerX) * 0.07;
    positions.push(
      innerX - width, 0, innerZ,
      innerX + width, 0, innerZ,
      outerX - width * 0.58, 0, outerZ,
      outerX + width * 0.58, 0, outerZ
    );
    uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
    indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createHullWakeGeometry(): THREE.BufferGeometry {
  return geometryFromQuads([
    [-0.12, 0.32, -0.48, -0.22],
    [-0.55, -0.42, -0.86, -0.92],
    [0.12, 0.32, 0.48, -0.22],
    [0.55, -0.42, 0.86, -0.92]
  ]);
}

function createPaddleGeometry(): THREE.BufferGeometry {
  return geometryFromQuads([
    [-0.03, 0.04, -0.34, -0.12],
    [0.03, -0.02, 0.28, -0.22],
    [-0.04, -0.08, -0.18, -0.38]
  ]);
}

function createDisturbanceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uDaylight: { value: 1 },
      uKeyLightStrength: { value: 1 },
      uFoamColor: { value: new THREE.Color(PALETTE_HEX.foam_warm_01) },
      uWaterColor: { value: new THREE.Color(PALETTE_HEX.water_shallow_01) },
      uFogColor: { value: new THREE.Color(CANONICAL_RENDER_CONFIG.fog.colorHex) },
      uFogNear: { value: CANONICAL_RENDER_CONFIG.fog.near },
      uFogFar: { value: CANONICAL_RENDER_CONFIG.fog.far },
      uFogDistanceDesaturation: { value: CANONICAL_RENDER_CONFIG.fog.distanceDesaturation }
    },
    vertexShader: `
      out vec2 vUv;
      out vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uDaylight;
      uniform float uKeyLightStrength;
      uniform vec3 uFoamColor;
      uniform vec3 uWaterColor;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uFogDistanceDesaturation;
      in vec2 vUv;
      in vec3 vWorldPosition;
      out vec4 outColor;
      void main() {
        float rippleBand = sin(vUv.y * 28.0 - (uTime - vUv.x * 2.0) * 5.0) * 0.5 + 0.5;
        float ripple = mix(0.85, 1.15, rippleBand);
        float tapered = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
        float crossFade = smoothstep(0.0, 0.34, vUv.x) * (1.0 - smoothstep(0.66, 1.0, vUv.x));
        float alpha = uOpacity * mix(0.46, 1.0, tapered) * mix(0.62, 1.0, crossFade) * ripple;
        if (alpha < 0.012) discard;
        float lightResponse = clamp(mix(0.14, 0.92, uDaylight) + uKeyLightStrength * 0.08, 0.12, 1.0);
        vec3 color = mix(uWaterColor, uFoamColor, 0.54 + 0.12 * rippleBand) * lightResponse;
        float fogFactor = smoothstep(uFogNear, uFogFar, distance(cameraPosition, vWorldPosition));
        float wakeLuma = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(color, vec3(wakeLuma), fogFactor * uFogDistanceDesaturation);
        color = mix(color, uFogColor, fogFactor * 0.82);
        outColor = vec4(color, alpha);
      }
    `
  });
}

export class BoatWakePool {
  public readonly group = new THREE.Group();
  private readonly entries: WakeEntry[] = [];
  private readonly hullGeometry = createHullWakeGeometry();
  private readonly paddleGeometry = createPaddleGeometry();
  private cursor = 0;

  constructor(size: number = 28) {
    for (let index = 0; index < size; index += 1) {
      const mesh = new THREE.Mesh(this.hullGeometry, createDisturbanceMaterial());
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.entries.push({
        mesh,
        active: false,
        kind: "hull",
        spawnedAt: 0,
        duration: 1,
        x: 0,
        z: 0,
        conditions: { seaRoughness: 0.2, windDirectionDeg: 0, windSpeed: 0 },
        baseScale: 1
      });
    }
    this.group.name = "pooled_boat_water_disturbances";
  }

  public spawn(
    x: number,
    z: number,
    headingRadians: number,
    speed: number,
    timeSeconds: number,
    conditions: WaterConditions
  ): void {
    const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 8, 0, 1);
    this.activate(
      "hull",
      x,
      z,
      headingRadians,
      timeSeconds,
      conditions,
      THREE.MathUtils.lerp(0.95, 1.55, speedRatio),
      0.58 + speedRatio * 0.42,
      0.22 + speedRatio * 0.12
    );
  }

  public spawnPaddle(
    x: number,
    z: number,
    headingRadians: number,
    timeSeconds: number,
    conditions: WaterConditions
  ): void {
    this.activate("paddle", x, z, headingRadians, timeSeconds, conditions, 0.72, 0.48, 0.24);
  }

  private activate(
    kind: DisturbanceKind,
    x: number,
    z: number,
    headingRadians: number,
    timeSeconds: number,
    conditions: WaterConditions,
    duration: number,
    baseScale: number,
    opacity: number
  ): void {
    const entry = this.entries[this.cursor];
    this.cursor = (this.cursor + 1) % this.entries.length;
    entry.active = true;
    entry.kind = kind;
    entry.spawnedAt = timeSeconds;
    entry.duration = duration;
    entry.x = x;
    entry.z = z;
    entry.conditions = { ...conditions };
    entry.baseScale = baseScale;
    entry.mesh.geometry = kind === "hull" ? this.hullGeometry : this.paddleGeometry;
    entry.mesh.position.set(
      x,
      WaterSurface.sample(x, z, timeSeconds, conditions).height + 0.015,
      z
    );
    entry.mesh.rotation.set(0, headingRadians, 0);
    entry.mesh.scale.setScalar(baseScale);
    entry.mesh.material.uniforms.uOpacity.value = opacity;
    entry.mesh.visible = true;
  }

  public update(timeSeconds: number): void {
    for (const entry of this.entries) {
      if (!entry.active) continue;
      const progress = (timeSeconds - entry.spawnedAt) / entry.duration;
      if (progress >= 1) {
        entry.active = false;
        entry.mesh.visible = false;
        continue;
      }
      const eased = 1 - Math.pow(1 - THREE.MathUtils.clamp(progress, 0, 1), 2);
      entry.mesh.position.y = WaterSurface.sample(
        entry.x,
        entry.z,
        timeSeconds,
        entry.conditions
      ).height + 0.015;
      const expansion = entry.kind === "hull" ? 0.66 : 0.42;
      entry.mesh.scale.setScalar(entry.baseScale * (1 + eased * expansion));
      const peakOpacity = entry.kind === "hull" ? 0.34 : 0.24;
      entry.mesh.material.uniforms.uOpacity.value = (1 - eased) * peakOpacity;
      entry.mesh.material.uniforms.uTime.value = timeSeconds;
    }
  }

  public updateLighting(frame: LightingFrame): void {
    const keyStrength = THREE.MathUtils.clamp(
      Math.max(frame.sunIntensity, frame.moonIntensity, frame.lightning) / 3.2,
      0,
      1
    );
    for (const entry of this.entries) {
      entry.mesh.material.uniforms.uDaylight.value = frame.daylight;
      entry.mesh.material.uniforms.uKeyLightStrength.value = keyStrength;
      (entry.mesh.material.uniforms.uFogColor.value as THREE.Color).copy(frame.fogColor);
      entry.mesh.material.uniforms.uFogNear.value = frame.fogNear;
      entry.mesh.material.uniforms.uFogFar.value = frame.fogFar;
      entry.mesh.material.uniforms.uFogDistanceDesaturation.value =
        CANONICAL_RENDER_CONFIG.fog.distanceDesaturation;
    }
  }

  public dispose(): void {
    for (const entry of this.entries) entry.mesh.material.dispose();
    this.hullGeometry.dispose();
    this.paddleGeometry.dispose();
  }
}
