import * as THREE from "three";
import {
  CANONICAL_RENDER_CONFIG,
  qualityTierLevel,
  qualityValueAtLevel,
  type QualityTier
} from "../config/VisualRenderConfig";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { WORLD_BOUNDS, WORLD_LAYOUT_V5, WorldLayout } from "../../world/WorldLayout";

export interface FireflyFieldUpdate {
  focus: THREE.Vector3;
  timeSeconds: number;
  nightVisibility: number;
  reducedMotion: boolean;
}

export interface FireflyInstance {
  x: number;
  y: number;
  z: number;
  phase: number;
  drift: number;
  lift: number;
  size: number;
}

const TAU = Math.PI * 2;
const WORLD_MARGIN_METERS = 8;
const POCKET_RADIUS_METERS = 20;
const MINIMUM_SPACING_METERS = 3.5;
const MAX_CANDIDATE_ATTEMPTS_PER_INSTANCE = 48;
const FIREFLY_POCKET_ANCHORS = [
  WORLD_LAYOUT_V5.anchors.starterFarm,
  WORLD_LAYOUT_V5.anchors.privateHomestead,
  WORLD_LAYOUT_V5.anchors.riverCrossing
] as const;

function hash01(index: number, salt: number): number {
  const value = Math.sin((index + 1) * (91.731 + salt * 17.113)) * 43758.5453;
  return value - Math.floor(value);
}

function candidatePosition(index: number, pocketCount: number): { x: number; z: number } {
  if (index < pocketCount) {
    const anchor = FIREFLY_POCKET_ANCHORS[index % FIREFLY_POCKET_ANCHORS.length]!;
    const angle = hash01(index, 1) * TAU;
    const radius = Math.sqrt(hash01(index, 2)) * POCKET_RADIUS_METERS;
    return {
      x: anchor.x + Math.cos(angle) * radius,
      z: anchor.z + Math.sin(angle) * radius
    };
  }

  return {
    x: THREE.MathUtils.lerp(
      WORLD_BOUNDS.minX + WORLD_MARGIN_METERS,
      WORLD_BOUNDS.maxX - WORLD_MARGIN_METERS,
      hash01(index, 3)
    ),
    z: THREE.MathUtils.lerp(
      WORLD_BOUNDS.minZ + WORLD_MARGIN_METERS,
      WORLD_BOUNDS.maxZ - WORLD_MARGIN_METERS,
      hash01(index, 4)
    )
  };
}

function isValidFireflySurface(x: number, z: number): boolean {
  return WorldLayout.isWalkable(x, z)
    && !WorldLayout.isWater(x, z)
    && !WorldLayout.isInterior(x, z);
}

function isSpacedFromExisting(
  x: number,
  z: number,
  instances: readonly FireflyInstance[]
): boolean {
  return instances.every((instance) =>
    Math.hypot(instance.x - x, instance.z - z) >= MINIMUM_SPACING_METERS
  );
}

/** Builds a stable world-anchored prefix so quality tiers never reshuffle it. */
export function buildFireflyInstances(
  count: number = CANONICAL_RENDER_CONFIG.quality.high.fireflyCount
): FireflyInstance[] {
  const instances: FireflyInstance[] = [];
  const targetCount = Math.max(0, Math.floor(count));
  const pocketCount = Math.ceil(targetCount * 0.58);
  const maxAttempts = Math.max(1, targetCount * MAX_CANDIDATE_ATTEMPTS_PER_INSTANCE);

  for (let candidate = 0; candidate < maxAttempts && instances.length < targetCount; candidate += 1) {
    const point = candidatePosition(candidate, pocketCount);
    if (!isValidFireflySurface(point.x, point.z) || !isSpacedFromExisting(point.x, point.z, instances)) {
      continue;
    }

    const baseHeight = WorldLayout.terrainHeight(point.x, point.z);
    instances.push({
      x: point.x,
      y: baseHeight + THREE.MathUtils.lerp(0.72, 2.1, hash01(candidate, 5)),
      z: point.z,
      phase: hash01(candidate, 6),
      drift: hash01(candidate, 7),
      lift: THREE.MathUtils.lerp(0.2, 0.52, hash01(candidate, 8)),
      size: THREE.MathUtils.lerp(0.84, 1.18, hash01(candidate, 9))
    });
  }

  return instances;
}

export function fireflyNightVisibility(ambientDaylight: number): number {
  const config = CANONICAL_RENDER_CONFIG.fireflies;
  const daylight = THREE.MathUtils.clamp(ambientDaylight, 0, 1);
  return 1 - THREE.MathUtils.smoothstep(
    daylight,
    config.nightFullAmbient,
    config.nightStartAmbient
  );
}

export function fireflyCountAtQuality(level: number): number {
  return Math.round(qualityValueAtLevel(level, (quality) => quality.fireflyCount));
}

const FIREFLY_VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute float aDrift;
  attribute float aLift;
  attribute float aSize;

  uniform float uTime;
  uniform float uMotionScale;
  uniform float uMotionSpeed;
  uniform float uMotionRadius;
  uniform float uVerticalMotion;
  uniform float uPulseScale;
  uniform float uPulseSpeed;
  uniform float uSizeMeters;
  uniform vec3 uFocus;
  uniform float uFadeStart;
  uniform float uFadeEnd;

  varying float vPulse;
  varying float vDistanceFade;

  void main() {
    float phase = aPhase * 6.28318530718;
    float localTime = uTime * uMotionSpeed * (0.8 + aDrift * 0.26);
    float horizontalRadius = uMotionRadius * (0.78 + aDrift * 0.42);
    vec3 worldPosition = position;
    worldPosition.x += sin(localTime * 0.73 + phase * 1.7) * horizontalRadius * uMotionScale;
    worldPosition.z += cos(localTime * 0.61 + phase * 1.3) * horizontalRadius * uMotionScale;
    worldPosition.y += (
      sin(localTime * 0.91 + phase) * aLift
      + cos(localTime * 0.43 + phase * 0.61) * aLift * 0.42
    ) * uVerticalMotion * uMotionScale;

    vec4 mvPosition = modelViewMatrix * vec4(worldPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(
      aSize * uSizeMeters * 300.0 / max(1.0, -mvPosition.z),
      1.5,
      9.0
    );

    float distanceToFocus = distance(worldPosition.xz, uFocus.xz);
    vDistanceFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distanceToFocus);
    float pulseWave = 0.5 + 0.5 * sin(
      uTime * uPulseSpeed * (0.82 + aDrift * 0.36) + phase * 1.37
    );
    vPulse = mix(1.0, 0.68 + pulseWave * 0.48, uPulseScale);
  }
`;

const FIREFLY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uNightVisibility;
  uniform float uOpacity;

  varying float vPulse;
  varying float vDistanceFade;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radiusSquared = dot(centered, centered);
    float core = 1.0 - smoothstep(0.0, 0.15, radiusSquared);
    float halo = 1.0 - smoothstep(0.05, 0.25, radiusSquared);
    float alpha = (core * 0.92 + halo * 0.22)
      * vDistanceFade
      * uNightVisibility
      * uOpacity;
    if (alpha < 0.003) discard;

    float radiance = (core * 1.35 + halo * 0.42) * vPulse;
    gl_FragColor = vec4(uColor * radiance, alpha);
  }
`;

export class FireflyField {
  public readonly group = new THREE.Group();
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;
  private qualityLevel: number;

  public constructor(qualityTier: QualityTier = CANONICAL_RENDER_CONFIG.qualityTier) {
    this.qualityLevel = qualityTierLevel(qualityTier);
    this.group.name = "ambient_fireflies";

    const instances = buildFireflyInstances();
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(
      instances.flatMap((instance) => [instance.x, instance.y, instance.z]),
      3
    ));
    this.geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(
      instances.map((instance) => instance.phase),
      1
    ));
    this.geometry.setAttribute("aDrift", new THREE.Float32BufferAttribute(
      instances.map((instance) => instance.drift),
      1
    ));
    this.geometry.setAttribute("aLift", new THREE.Float32BufferAttribute(
      instances.map((instance) => instance.lift),
      1
    ));
    this.geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(
      instances.map((instance) => instance.size),
      1
    ));
    this.geometry.computeBoundingSphere();

    const config = CANONICAL_RENDER_CONFIG.fireflies;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMotionScale: { value: CANONICAL_RENDER_CONFIG.motion.ambientScale },
        uMotionSpeed: { value: config.motionSpeed },
        uMotionRadius: { value: config.motionRadiusMeters },
        uVerticalMotion: { value: config.verticalMotionMeters },
        uPulseScale: { value: CANONICAL_RENDER_CONFIG.motion.ambientScale },
        uPulseSpeed: { value: config.pulseSpeed },
        uSizeMeters: { value: config.sizeMeters },
        uFocus: { value: new THREE.Vector3() },
        uFadeStart: { value: config.fadeStartMeters },
        uFadeEnd: { value: config.maxDistanceMeters },
        uColor: { value: new THREE.Color(PALETTE_HEX.emissive_window_01) },
        uNightVisibility: { value: 0 },
        uOpacity: { value: config.baseOpacity }
      },
      vertexShader: FIREFLY_VERTEX_SHADER,
      fragmentShader: FIREFLY_FRAGMENT_SHADER
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = "ambient_firefly_points";
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.group.add(this.points);
    this.group.visible = false;
  }

  public setQuality(tier: QualityTier): void {
    this.setQualityLevel(qualityTierLevel(tier));
  }

  public setQualityLevel(level: number): void {
    this.qualityLevel = THREE.MathUtils.clamp(level, 0, 2);
  }

  public update(input: FireflyFieldUpdate): void {
    const nightVisibility = THREE.MathUtils.clamp(input.nightVisibility, 0, 1);
    const count = fireflyCountAtQuality(this.qualityLevel);
    const motionScale = input.reducedMotion
      ? CANONICAL_RENDER_CONFIG.motion.reducedMotionSecondaryScale
      : CANONICAL_RENDER_CONFIG.motion.ambientScale;

    this.geometry.setDrawRange(0, count);
    this.material.uniforms.uTime.value = input.timeSeconds;
    this.material.uniforms.uFocus.value.copy(input.focus);
    this.material.uniforms.uNightVisibility.value = nightVisibility;
    this.material.uniforms.uMotionScale.value = motionScale;
    this.material.uniforms.uPulseScale.value = motionScale;
    this.group.visible = !WorldLayout.isInterior(input.focus.x, input.focus.z)
      && count > 0
      && nightVisibility > 0.002;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
