import * as THREE from "three";
import type { WeatherState } from "../../simulation/core/types";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import type { LightingFrame } from "../lighting/LightingRig";
import { ATMOSPHERE_SKY_FRAGMENT, SKY_DISPLAY_FRAGMENT, SKY_QUAD_VERTEX } from "./atmosphereSkyShader";
import { CloudShadows } from "./CloudShadows";

export interface AtmosphereSkyDiagnostics {
  mode: "volume" | "layered";
  coverage: number;
  storm: number;
  lightning: number;
  windOffset: readonly [number, number];
  primarySteps: number;
  lightSteps: number;
  layerSteps: number;
  history: "none";
}

export function atmosphereTargetSize(width: number, height: number, tier: QualityTier): { width: number; height: number } {
  const quality = CANONICAL_RENDER_CONFIG.atmosphere.quality[tier];
  const scale = Math.min(quality.resolutionScale, quality.maximumWidth / Math.max(1, width));
  return { width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)) };
}

/** A bounded, render-only sky. No cloud history can survive a camera cut. */
export class AtmosphereSky {
  public readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  public readonly target: THREE.WebGLRenderTarget;
  public readonly cloudShadows: CloudShadows;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly previousViewport = new THREE.Vector4();
  private readonly previousScissor = new THREE.Vector4();
  private readonly bufferSize = new THREE.Vector2();
  private lastTime: number | null = null;
  private lastSeed: number | null = null;
  private quality: QualityTier;
  /**
   * Upper-hemisphere reflection probe for water: the same sky, clouds and
   * weather in an equirectangular strip, mipmapped so rough water can read a
   * blurred reflection. Refreshed every few frames — the sky changes slowly.
   */
  public readonly reflectionTarget: THREE.WebGLRenderTarget;
  private readonly reflectionScene = new THREE.Scene();
  private readonly reflectionMaterial: THREE.ShaderMaterial;
  private reflectionFrame = 0;

  constructor(tier: QualityTier) {
    this.quality = tier;
    const config = CANONICAL_RENDER_CONFIG.atmosphere;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false
    });
    this.target.texture.name = "atmosphere.linearSky";
    this.material = new THREE.ShaderMaterial({
      name: "NevaWeatherSky", toneMapped: false, depthTest: false, depthWrite: false,
      uniforms: {
        uInverseProjection: { value: new THREE.Matrix4() },
        uCameraRotation: { value: new THREE.Matrix3() },
        uEye: { value: new THREE.Vector3() },
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunDirection: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
        uMoonDirection: { value: new THREE.Vector3() }, uMoonColor: { value: new THREE.Color() },
        uLightningDirection: { value: new THREE.Vector3() },
        uCloudOffset: { value: new THREE.Vector2() },
        uDiscRadius: { value: new THREE.Vector2(config.sunDiscRadiusRadians, config.moonDiscRadiusRadians) },
        uCloudLayer: { value: new THREE.Vector4(config.cloudBaseMeters, config.cloudHeightMeters, config.cloudScaleMeters, config.cloudExtinction) },
        uSkyState: { value: new THREE.Vector4() }, uWeather: { value: new THREE.Vector4() },
        uErosion: { value: config.cloudErosion }, uMaxDistance: { value: config.cloudMaxDistanceMeters },
        uHaze: { value: config.horizonHaze }, uSeed: { value: 0 },
        uVolumeBlend: { value: tier === "high" ? 1 : 0 }
      },
      vertexShader: SKY_QUAD_VERTEX,
      fragmentShader: ATMOSPHERE_SKY_FRAGMENT
    });
    const quad = new THREE.Mesh(this.geometry, this.material);
    const probe = config.reflectionProbe;
    this.reflectionTarget = new THREE.WebGLRenderTarget(probe.width, probe.height, {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping
    });
    this.reflectionTarget.texture.name = "atmosphere.skyReflection";
    // Shares the sky's uniform objects, so time, weather and light stay in step.
    this.reflectionMaterial = new THREE.ShaderMaterial({
      name: "NevaSkyReflectionProbe", toneMapped: false, depthTest: false, depthWrite: false,
      uniforms: this.material.uniforms,
      vertexShader: SKY_QUAD_VERTEX,
      fragmentShader: ATMOSPHERE_SKY_FRAGMENT
    });
    const probeQuad = new THREE.Mesh(this.geometry, this.reflectionMaterial);
    probeQuad.frustumCulled = false;
    this.reflectionScene.add(probeQuad);
    this.cloudShadows = new CloudShadows(this.material.uniforms, tier);
    quad.frustumCulled = false;
    this.scene.add(quad);
    const stars = CANONICAL_RENDER_CONFIG.stars;
    this.mesh = new THREE.Mesh(this.geometry, new THREE.ShaderMaterial({
      name: "NevaSkyDisplay", depthWrite: false, depthTest: false, fog: false,
      uniforms: {
        uSky: { value: this.target.texture }, uSkyTexel: { value: new THREE.Vector2() },
        uInverseProjection: this.material.uniforms.uInverseProjection,
        uCameraRotation: this.material.uniforms.uCameraRotation,
        uSkyState: this.material.uniforms.uSkyState,
        uMoonColor: this.material.uniforms.uMoonColor,
        uSeed: this.material.uniforms.uSeed,
        uStars: { value: new THREE.Vector4(stars.gridResolution, stars.density, stars.radiusRadians, stars.intensity) }
      },
      vertexShader: SKY_QUAD_VERTEX,
      fragmentShader: SKY_DISPLAY_FRAGMENT
    }));
    this.mesh.name = "world_weather_sky";
    this.mesh.renderOrder = -10000;
    this.mesh.frustumCulled = false;
    this.configureQuality();
  }

  public setQuality(tier: QualityTier): void {
    if (tier === this.quality) return;
    this.quality = tier;
    this.cloudShadows.setQuality(tier);
    this.configureQuality();
  }

  public setVolumeBlend(scale: number): void {
    this.material.uniforms.uVolumeBlend.value = this.quality === "high" ? THREE.MathUtils.clamp(scale, 0, 1) : 0;
  }

  private configureQuality(): void {
    const quality = CANONICAL_RENDER_CONFIG.atmosphere.quality[this.quality];
    this.material.defines = {
      SKY_VOLUME: quality.primarySteps > 0 ? 1 : 0,
      PRIMARY_STEPS: Math.max(1, quality.primarySteps), LIGHT_STEPS: Math.max(1, quality.lightSteps),
      LAYER_STEPS: quality.layerSteps
    };
    this.material.needsUpdate = true;
    this.material.uniforms.uVolumeBlend.value = quality.primarySteps > 0 ? 1 : 0;
    // The probe always uses the layered clouds: at its resolution the volume
    // march adds cost without adding anything a reflection can show.
    this.reflectionMaterial.defines = {
      SKY_EQUIRECT: 1, SKY_VOLUME: 0, PRIMARY_STEPS: 1, LIGHT_STEPS: 1,
      LAYER_STEPS: Math.max(4, Math.min(8, quality.layerSteps))
    };
    this.reflectionMaterial.needsUpdate = true;
    this.reflectionFrame = 0;
  }

  public update(frame: LightingFrame, weather: Readonly<WeatherState>, worldSeed: number, time: number, reducedMotion: boolean): void {
    const u = this.material.uniforms;
    const config = CANONICAL_RENDER_CONFIG.atmosphere;
    const reset = this.lastTime === null || time < this.lastTime || this.lastSeed !== worldSeed;
    const elapsed = reset ? 0 : Math.max(0, time - this.lastTime!);
    const values = u.uWeather.value as THREE.Vector4;
    values.x = weather.cloudCover;
    values.y = Math.max(frame.stormStrength, weather.precipitation * 0.65);
    values.z = reducedMotion ? 0 : frame.lightning;
    u.uSeed.value = ((worldSeed >>> 0) % 8191) * 0.013;
    const direction = THREE.MathUtils.degToRad(weather.windDirectionDeg);
    const speed = (0.12 + weather.windSpeed * config.windSpeedScale) * (reducedMotion ? 0.25 : 1);
    const offset = u.uCloudOffset.value as THREE.Vector2;
    if (reset) offset.set(Math.sin(direction) * time * speed, Math.cos(direction) * time * speed);
    else {
      offset.x += Math.sin(direction) * elapsed * speed;
      offset.y += Math.cos(direction) * elapsed * speed;
    }
    u.uZenith.value.copy(frame.skyTopColor); u.uHorizon.value.copy(frame.skyHorizonColor);
    u.uSunDirection.value.copy(frame.sunDirection); u.uSunColor.value.copy(frame.sunColor);
    u.uMoonDirection.value.copy(frame.moonDirection); u.uMoonColor.value.copy(frame.moonColor);
    u.uLightningDirection.value.copy(frame.lightningDirection);
    u.uSkyState.value.set(frame.ambientDaylight, frame.sunVisibility, frame.moonVisibility, frame.starVisibility);
    this.lastTime = time;
    this.lastSeed = worldSeed;
  }

  public async prepare(renderer: THREE.WebGLRenderer): Promise<void> {
    await renderer.compileAsync(this.scene, this.camera);
    await renderer.compileAsync(this.reflectionScene, this.camera);
    await this.cloudShadows.prepare(renderer);
  }

  public diagnostics(): AtmosphereSkyDiagnostics {
    const quality = CANONICAL_RENDER_CONFIG.atmosphere.quality[this.quality];
    const weather = this.material.uniforms.uWeather.value as THREE.Vector4;
    const offset = this.material.uniforms.uCloudOffset.value as THREE.Vector2;
    return {
      mode: quality.primarySteps > 0 ? "volume" : "layered",
      coverage: weather.x, storm: weather.y, lightning: weather.z,
      windOffset: [offset.x, offset.y], primarySteps: quality.primarySteps,
      lightSteps: quality.lightSteps, layerSteps: quality.layerSteps, history: "none"
    };
  }

  /** Runs inside RendererPipeline's frame timer, before opaque color and water capture. */
  public render(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    renderer.getDrawingBufferSize(this.bufferSize);
    const size = atmosphereTargetSize(this.bufferSize.x, this.bufferSize.y, this.quality);
    if (this.target.width !== size.width || this.target.height !== size.height) this.target.setSize(size.width, size.height);
    this.mesh.material.uniforms.uSkyTexel.value.set(1 / size.width, 1 / size.height);
    camera.updateMatrixWorld();
    this.material.uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.uCameraRotation.value.setFromMatrix4(camera.matrixWorld);
    camera.getWorldPosition(this.material.uniforms.uEye.value);
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousScissorTest = renderer.getScissorTest();
    renderer.getViewport(this.previousViewport);
    renderer.getScissor(this.previousScissor);
    try {
      renderer.autoClear = true;
      renderer.setScissorTest(false);
      this.cloudShadows.render(renderer, this.material.uniforms.uEye.value);
      if (this.reflectionFrame % CANONICAL_RENDER_CONFIG.atmosphere.reflectionProbe.refreshFrames === 0) {
        // The probe ignores the camera projection (its ray comes from its uv),
        // but it is rendered from the camera's position, like the sky itself.
        const volumeBlend = this.material.uniforms.uVolumeBlend.value;
        this.material.uniforms.uVolumeBlend.value = 0;
        renderer.setRenderTarget(this.reflectionTarget);
        renderer.render(this.reflectionScene, this.camera);
        this.material.uniforms.uVolumeBlend.value = volumeBlend;
      }
      this.reflectionFrame += 1;
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(this.previousViewport);
      renderer.setScissor(this.previousScissor);
      renderer.setScissorTest(previousScissorTest);
      renderer.autoClear = previousAutoClear;
    }
  }

  public dispose(): void {
    this.mesh.removeFromParent();
    this.cloudShadows.dispose();
    this.geometry.dispose(); this.material.dispose(); this.mesh.material.dispose(); this.target.dispose();
    this.reflectionMaterial.dispose(); this.reflectionTarget.dispose();
  }
}
