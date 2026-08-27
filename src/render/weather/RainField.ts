import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { WorldLayout } from "../../world/WorldLayout";
import type { WaterConditions } from "../water/WaterSurface";
import type { WeatherMotionSignal } from "../motion/WeatherMotionSignal";
import {
  activateRainSplash,
  createRainDrop,
  rainActiveDropCount,
  rainPhysicsConfig,
  rainVisualIntensity,
  respawnRainDrop,
  sampleRainHitSurface,
  splashProgress,
  stepRainDrop,
  type RainDropState,
  type RainSplashState
} from "./rainPhysics";

export interface RainFieldUpdate {
  focus: THREE.Vector3;
  timeSeconds: number;
  precipitation: number;
  wind: Readonly<WeatherMotionSignal>;
  waterConditions: WaterConditions;
  reducedMotion: boolean;
  daylight: number;
}

function createStreakGeometry(width: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, 1, width);
  // Origin at the leading tip so streaks sit above the hit, not through it.
  geometry.translate(0, -0.5, 0);
  return geometry;
}

function createStreakMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: PALETTE_HEX.sky_pale_01,
    transparent: true,
    opacity,
    depthWrite: false,
    fog: true,
    toneMapped: true
  });
}

function createSplashMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: PALETTE_HEX.foam_warm_01,
    transparent: true,
    opacity,
    depthWrite: false,
    fog: true,
    toneMapped: true
  });
}

/** Camera-local falling rain with gravity, wind, and terrain/water hits. */
export class RainField {
  public readonly group = new THREE.Group();
  private readonly drops: RainDropState[];
  private readonly splashes: RainSplashState[];
  private readonly dropMesh: THREE.InstancedMesh;
  private readonly splashMesh: THREE.InstancedMesh;
  private readonly dropMaterial: THREE.MeshBasicMaterial;
  private readonly splashMaterial: THREE.MeshBasicMaterial;
  private readonly dummy = new THREE.Object3D();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly velocity = new THREE.Vector3();
  private qualityTier: QualityTier;
  private splashCursor = 0;
  private lastTimeSeconds = Number.NEGATIVE_INFINITY;

  constructor(qualityTier: QualityTier = CANONICAL_RENDER_CONFIG.qualityTier) {
    const config = rainPhysicsConfig();
    const high = CANONICAL_RENDER_CONFIG.quality.high;
    this.qualityTier = qualityTier;
    this.group.name = "weather_rain_field";
    this.drops = Array.from({ length: high.rainDropCount }, () => createRainDrop());
    this.splashes = Array.from({ length: high.rainSplashCount }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      bornAt: 0,
      duration: config.splashDuration,
      size: config.splashSizeTerrain,
      kind: "terrain" as const
    }));

    this.dropMaterial = createStreakMaterial(config.streakOpacity);
    this.splashMaterial = createSplashMaterial(config.splashOpacity);
    this.dropMesh = new THREE.InstancedMesh(
      createStreakGeometry(config.dropWidth),
      this.dropMaterial,
      this.drops.length
    );
    this.splashMesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      this.splashMaterial,
      this.splashes.length
    );
    this.dropMesh.name = "weather_rain_drops";
    this.splashMesh.name = "weather_rain_splashes";
    this.dropMesh.count = 0;
    this.splashMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.splashMesh.frustumCulled = false;
    this.dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.splashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dropMesh.castShadow = false;
    this.dropMesh.receiveShadow = false;
    this.splashMesh.castShadow = false;
    this.splashMesh.receiveShadow = false;
    this.dropMesh.renderOrder = 2;
    this.splashMesh.renderOrder = 2;
    this.group.add(this.dropMesh);
    this.group.add(this.splashMesh);
    this.group.visible = false;
  }

  public setQuality(tier: QualityTier): void {
    this.qualityTier = tier;
  }

  public update(input: RainFieldUpdate): void {
    const config = rainPhysicsConfig();
    const interior = WorldLayout.isInterior(input.focus.x, input.focus.z);
    const intensity = interior ? 0 : rainVisualIntensity(input.precipitation, config.visiblePrecipitationFloor);
    const reducedMotionScale = input.reducedMotion
      ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
      : CANONICAL_RENDER_CONFIG.motion.ambientScale;
    const desiredCount = rainActiveDropCount(this.qualityTier, intensity, reducedMotionScale);
    const dt = this.lastTimeSeconds === Number.NEGATIVE_INFINITY
      ? 1 / 60
      : THREE.MathUtils.clamp(input.timeSeconds - this.lastTimeSeconds, 0, 0.1);
    this.lastTimeSeconds = input.timeSeconds;

    this.dropMaterial.opacity = config.streakOpacity * THREE.MathUtils.lerp(0.32, 0.78, input.daylight);
    this.splashMaterial.opacity = config.splashOpacity * THREE.MathUtils.lerp(0.3, 0.72, input.daylight);

    if (interior) {
      this.deactivateAll();
      this.group.visible = false;
      return;
    }

    const sampleSurface = (x: number, z: number) =>
      sampleRainHitSurface(x, z, input.timeSeconds, input.waterConditions);

    let visibleDrops = 0;
    for (let index = 0; index < this.drops.length; index += 1) {
      const drop = this.drops[index];
      const allowed = index < desiredCount;
      if (!drop.active) {
        if (!allowed) continue;
        respawnRainDrop(drop, index, input.focus, input.wind, config);
      }

      const result = stepRainDrop(drop, dt, input.focus, input.wind, config, sampleSurface);
      if (result !== "falling") {
        if (result === "hit-terrain" || result === "hit-water") {
          this.spawnSplash(drop, sampleSurface(drop.x, drop.z), input.timeSeconds, config);
        }
        if (allowed) respawnRainDrop(drop, index, input.focus, input.wind, config);
        else {
          drop.active = false;
          continue;
        }
      }

      this.writeDropMatrix(drop, visibleDrops);
      visibleDrops += 1;
    }

    let visibleSplashes = 0;
    const splashBudget = CANONICAL_RENDER_CONFIG.quality[this.qualityTier].rainSplashCount;
    for (const splash of this.splashes) {
      if (!splash.active) continue;
      const progress = splashProgress(splash, input.timeSeconds);
      if (progress >= 1) {
        splash.active = false;
        continue;
      }
      if (visibleSplashes >= splashBudget) {
        splash.active = false;
        continue;
      }
      const scale = splash.size * Math.sin(Math.min(1, progress) * Math.PI);
      this.dummy.position.set(splash.x, splash.y, splash.z);
      this.dummy.quaternion.identity();
      this.dummy.scale.set(scale * 1.6, scale * 0.55, scale * 1.6);
      this.dummy.updateMatrix();
      this.splashMesh.setMatrixAt(visibleSplashes, this.dummy.matrix);
      visibleSplashes += 1;
    }

    this.dropMesh.count = visibleDrops;
    this.splashMesh.count = visibleSplashes;
    if (visibleDrops > 0) this.dropMesh.instanceMatrix.needsUpdate = true;
    if (visibleSplashes > 0) this.splashMesh.instanceMatrix.needsUpdate = true;
    this.group.visible = visibleDrops > 0 || visibleSplashes > 0;
  }

  public dispose(): void {
    this.dropMesh.geometry.dispose();
    this.splashMesh.geometry.dispose();
    this.dropMaterial.dispose();
    this.splashMaterial.dispose();
  }

  private spawnSplash(
    drop: RainDropState,
    surface: ReturnType<typeof sampleRainHitSurface>,
    timeSeconds: number,
    config: ReturnType<typeof rainPhysicsConfig>
  ): void {
    const splash = this.splashes[this.splashCursor];
    this.splashCursor = (this.splashCursor + 1) % this.splashes.length;
    activateRainSplash(splash, drop, surface, timeSeconds, config);
  }

  private writeDropMatrix(drop: RainDropState, index: number): void {
    this.velocity.set(drop.vx, drop.vy, drop.vz);
    const speed = this.velocity.length();
    this.dummy.position.set(drop.x, drop.y, drop.z);
    if (speed > 0.001) {
      this.dummy.quaternion.setFromUnitVectors(this.up, this.velocity.multiplyScalar(1 / speed));
    } else {
      this.dummy.quaternion.identity();
    }
    this.dummy.scale.set(1, drop.length, 1);
    this.dummy.updateMatrix();
    this.dropMesh.setMatrixAt(index, this.dummy.matrix);
  }

  private deactivateAll(): void {
    for (const drop of this.drops) drop.active = false;
    for (const splash of this.splashes) splash.active = false;
    this.dropMesh.count = 0;
    this.splashMesh.count = 0;
  }
}
