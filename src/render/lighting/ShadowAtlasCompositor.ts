import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";

/**
 * The combine step unpacks and repacks RGBA depth, which matches PCF/PCFSoft
 * shadow maps only. VSM stores linear depth and must keep the legacy path.
 */
function pcfCompatible(): boolean {
  return CANONICAL_RENDER_CONFIG.shadows.type !== THREE.VSMShadowMap;
}

function percentiles(ring: Float32Array, count: number): { p50: number; p95: number } {
  const values = Array.from(ring.slice(0, count)).sort((left, right) => left - right);
  const at = (fraction: number): number => values[Math.min(values.length - 1, Math.floor(fraction * values.length))];
  return { p50: Number(at(0.5).toFixed(2)), p95: Number(at(0.95).toFixed(2)) };
}

export interface ShadowAtlasConfig {
  enabled: boolean;
  staticRefreshFrames: number;
  recenterMeters: number;
  directionEpsilonRadians: number;
}

export interface ShadowAtlasDiagnostics {
  enabled: boolean;
  dimension: number;
  staticRefreshes: number;
  dynamicRefreshes: number;
  combines: number;
  lastStaticRefreshReason: string | null;
  staticCasters: number;
  dynamicCasters: number;
  committedFocus: { x: number; y: number; z: number } | null;
  /** Debug-only CPU cost rings for the atlas passes (p50 over the last 120 frames). */
  cpu: {
    frames: number;
    staticP50Ms: number;
    dynamicP50Ms: number;
    combineP50Ms: number;
    totalP50Ms: number;
  } | null;
}

export interface ShadowAtlasPolicyInput {
  hasFrame: boolean;
  age: number;
  refreshFrames: number;
  directionDot: number;
  directionEpsilonRadians: number;
  focusDistanceMeters: number;
  recenterMeters: number;
}

/** Pure refresh policy so the cache lifetime is testable without a GL context. */
export function shadowAtlasStaticRefreshReason(input: ShadowAtlasPolicyInput): string | null {
  if (!input.hasFrame) return "first-frame";
  if (input.age >= input.refreshFrames) return "age";
  if (input.directionDot < Math.cos(input.directionEpsilonRadians)) return "direction";
  if (input.focusDistanceMeters > input.recenterMeters) return "recenter";
  return null;
}

type ShadowMapRender = (lights: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera) => void;

const COMBINE_VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMBINE_FRAGMENT = /* glsl */`
#include <common>
#include <packing>
uniform sampler2D uStaticDepth;
uniform sampler2D uDynamicDepth;
varying vec2 vUv;
void main() {
  float staticDepth = unpackRGBAToDepth(texture2D(uStaticDepth, vUv));
  float dynamicDepth = unpackRGBAToDepth(texture2D(uDynamicDepth, vUv));
  gl_FragColor = packDepthToRGBA(min(staticDepth, dynamicDepth));
}
`;

/**
 * Dual-map shadow compositing.
 *
 * The owner light keeps a single sampled shadow map, but the depth content is
 * assembled from two maps with the same committed light-space frame:
 * - a static atlas (non-dynamic casters) re-rendered on a bounded age and on
 *   direction/recenter invalidation;
 * - a per-frame dynamic map (characters, fauna, boats, packs).
 *
 * The committed light transform is held between static refreshes so map
 * content and the matrix sampled by materials always agree. This is what lets
 * the static pass run less often without the focus-mismatch pop.
 */
export class ShadowAtlasCompositor {
  private enabled: boolean;
  private readonly staticRefreshFrames: number;
  private readonly recenterMeters: number;
  private readonly directionEpsilonRadians: number;

  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly combineMaterial: THREE.ShaderMaterial;

  private staticTarget: THREE.WebGLRenderTarget | null = null;
  private dynamicTarget: THREE.WebGLRenderTarget | null = null;
  private combinedTarget: THREE.WebGLRenderTarget | null = null;
  private dimension = 0;

  private scene: THREE.Scene | null = null;
  private readonly explicitDynamicRoots = new Set<THREE.Object3D>();
  private staticCasters: THREE.Object3D[] = [];
  private dynamicCasters: THREE.Object3D[] = [];
  private readonly savedCastShadow: boolean[] = [];
  private castersDirty = true;

  private readonly committedLightPosition = new THREE.Vector3();
  private readonly committedTargetPosition = new THREE.Vector3();
  private readonly committedDirection = new THREE.Vector3(0, -1, 0);
  private hasCommittedFrame = false;
  private staticAge = 0;
  private insideAtlasRender = false;

  private staticRefreshes = 0;
  private dynamicRefreshes = 0;
  private combines = 0;
  private lastStaticRefreshReason: string | null = null;
  private cpuTimingEnabled = false;
  private readonly cpuRings = {
    staticMs: new Float32Array(120),
    dynamicMs: new Float32Array(120),
    combineMs: new Float32Array(120),
    totalMs: new Float32Array(120),
    count: 0,
    cursor: 0
  };

  public constructor(private readonly renderer: THREE.WebGLRenderer, config: ShadowAtlasConfig) {
    this.enabled = config.enabled && pcfCompatible();
    this.staticRefreshFrames = Math.max(1, Math.floor(config.staticRefreshFrames));
    this.recenterMeters = Math.max(1, config.recenterMeters);
    this.directionEpsilonRadians = Math.max(0.0001, config.directionEpsilonRadians);
    this.combineMaterial = new THREE.ShaderMaterial({
      name: "neva_shadow_atlas_combine",
      uniforms: {
        uStaticDepth: { value: null },
        uDynamicDepth: { value: null }
      },
      vertexShader: COMBINE_VERTEX,
      fragmentShader: COMBINE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.combineMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.quadCamera.updateProjectionMatrix();
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled && pcfCompatible();
    if (!this.enabled) this.hasCommittedFrame = false;
  }

  public registerScene(scene: THREE.Scene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.castersDirty = true;
  }

  /** Registers a live root whose shadows must update every frame. */
  public registerDynamicRoot(root: THREE.Object3D): void {
    if (this.explicitDynamicRoots.has(root)) return;
    this.explicitDynamicRoots.add(root);
    this.castersDirty = true;
  }

  /** Re-scans caster classification after a load created presentation objects. */
  public markCastersDirty(): void {
    this.castersDirty = true;
  }

  /**
   * Drop-in replacement for `renderer.shadowMap.render`. Three calls this once
   * per `renderer.render`; the inner guard prevents the combine's own
   * `renderer.render` from recursing into the atlas.
   */
  public render(original: ShadowMapRender, lights: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.insideAtlasRender) {
      original(lights, scene, camera);
      return;
    }
    const light = lights.find((candidate): candidate is THREE.DirectionalLight => (
      candidate.castShadow && (candidate as THREE.DirectionalLight).shadow !== undefined
    ));
    if (!this.enabled) {
      // Hand the light back a renderer-owned map: the combined atlas target is
      // color-only and cannot depth-test casters on the legacy path.
      if (light) this.restoreLegacyShadowMap(light);
      original(lights, scene, camera);
      return;
    }
    if (!this.renderer.shadowMap.autoUpdate && !this.renderer.shadowMap.needsUpdate) {
      original(lights, scene, camera);
      return;
    }
    if (!this.renderer.shadowMap.enabled) {
      // Scenes that disable shadows entirely must not pay for either atlas pass.
      original(lights, scene, camera);
      return;
    }
    if (!light) {
      original(lights, scene, camera);
      return;
    }
    this.registerScene(scene);
    if (this.castersDirty) this.rebuildCasterLists();
    const mapSize = light.shadow.mapSize;
    const dimension = Math.max(1, Math.floor(Math.max(mapSize.x, mapSize.y)));
    if (!this.staticTarget || this.dimension !== dimension) this.rebuildTargets(dimension);

    const liveLightPosition = this.tempLiveLightPosition.copy(light.position);
    const liveTargetPosition = this.tempLiveTargetPosition.copy(light.target.position);
    const direction = this.tempDirection.subVectors(liveTargetPosition, liveLightPosition).normalize();
    const policy = shadowAtlasStaticRefreshReason({
      hasFrame: this.hasCommittedFrame,
      age: this.staticAge,
      refreshFrames: this.staticRefreshFrames,
      directionDot: direction.dot(this.committedDirection),
      directionEpsilonRadians: this.directionEpsilonRadians,
      focusDistanceMeters: this.hasCommittedFrame
        ? liveTargetPosition.distanceTo(this.committedTargetPosition)
        : Number.POSITIVE_INFINITY,
      recenterMeters: this.recenterMeters
    });

    if (policy !== null) {
      this.committedLightPosition.copy(liveLightPosition);
      this.committedTargetPosition.copy(liveTargetPosition);
      this.committedDirection.copy(direction);
      this.hasCommittedFrame = true;
      this.staticAge = 0;
      this.lastStaticRefreshReason = policy;
    } else {
      this.staticAge += 1;
    }

    light.position.copy(this.committedLightPosition);
    light.target.position.copy(this.committedTargetPosition);
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();

    try {
      const scope = this.renderer.shadowMap;
      const cpuStart = this.cpuTimingEnabled ? performance.now() : 0;
      if (policy !== null) {
        this.withCastShadowDisabled(this.dynamicCasters, () => {
          light.shadow.map = this.staticTarget;
          scope.needsUpdate = true;
          original(lights, scene, camera);
        });
        this.staticRefreshes += 1;
      }
      const afterStatic = this.cpuTimingEnabled ? performance.now() : 0;
      this.withCastShadowDisabled(this.staticCasters, () => {
        light.shadow.map = this.dynamicTarget;
        scope.needsUpdate = true;
        original(lights, scene, camera);
      });
      this.dynamicRefreshes += 1;
      const afterDynamic = this.cpuTimingEnabled ? performance.now() : 0;

      light.shadow.map = this.combinedTarget;
      scope.needsUpdate = false;
      this.combine();
      this.combines += 1;
      if (this.cpuTimingEnabled) {
        const end = performance.now();
        const { cpuRings } = this;
        cpuRings.staticMs[cpuRings.cursor] = policy !== null ? afterStatic - cpuStart : 0;
        cpuRings.dynamicMs[cpuRings.cursor] = afterDynamic - afterStatic;
        cpuRings.combineMs[cpuRings.cursor] = end - afterDynamic;
        cpuRings.totalMs[cpuRings.cursor] = end - cpuStart;
        cpuRings.cursor = (cpuRings.cursor + 1) % cpuRings.totalMs.length;
        cpuRings.count = Math.min(cpuRings.count + 1, cpuRings.totalMs.length);
      }
    } finally {
      light.position.copy(liveLightPosition);
      light.target.position.copy(liveTargetPosition);
      light.updateMatrixWorld();
      light.target.updateMatrixWorld();
      light.shadow.map = this.combinedTarget;
      this.renderer.shadowMap.needsUpdate = false;
    }
  }

  /** Enables the debug-only CPU rings for the atlas passes. */
  public setCpuTimingEnabled(enabled: boolean): void {
    this.cpuTimingEnabled = enabled;
    if (!enabled) {
      this.cpuRings.count = 0;
      this.cpuRings.cursor = 0;
    }
  }

  public diagnostics(): ShadowAtlasDiagnostics {
    if (this.castersDirty && this.scene) this.rebuildCasterLists();
    return {
      enabled: this.enabled,
      dimension: this.dimension,
      staticRefreshes: this.staticRefreshes,
      dynamicRefreshes: this.dynamicRefreshes,
      combines: this.combines,
      lastStaticRefreshReason: this.lastStaticRefreshReason,
      staticCasters: this.staticCasters.length,
      dynamicCasters: this.dynamicCasters.length,
      committedFocus: this.hasCommittedFrame
        ? {
            x: Number(this.committedTargetPosition.x.toFixed(2)),
            y: Number(this.committedTargetPosition.y.toFixed(2)),
            z: Number(this.committedTargetPosition.z.toFixed(2))
          }
        : null,
      cpu: this.cpuTimingEnabled && this.cpuRings.count > 0
        ? {
            frames: this.cpuRings.count,
            staticP50Ms: percentiles(this.cpuRings.staticMs, this.cpuRings.count).p50,
            dynamicP50Ms: percentiles(this.cpuRings.dynamicMs, this.cpuRings.count).p50,
            combineP50Ms: percentiles(this.cpuRings.combineMs, this.cpuRings.count).p50,
            totalP50Ms: percentiles(this.cpuRings.totalMs, this.cpuRings.count).p50
          }
        : null
    };
  }

  public dispose(): void {
    this.staticTarget?.dispose();
    this.dynamicTarget?.dispose();
    this.combinedTarget?.dispose();
    this.staticTarget = null;
    this.dynamicTarget = null;
    this.combinedTarget = null;
    this.dimension = 0;
    this.combineMaterial.dispose();
    this.quad.geometry.dispose();
    this.explicitDynamicRoots.clear();
    this.staticCasters = [];
    this.dynamicCasters = [];
    this.savedCastShadow.length = 0;
    this.hasCommittedFrame = false;
  }

  private readonly tempLiveLightPosition = new THREE.Vector3();
  private readonly tempLiveTargetPosition = new THREE.Vector3();
  private readonly tempDirection = new THREE.Vector3();

  private restoreLegacyShadowMap(light: THREE.DirectionalLight): void {
    if (light.shadow.map === this.combinedTarget
      || light.shadow.map === this.staticTarget
      || light.shadow.map === this.dynamicTarget) {
      light.shadow.map = null;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  private rebuildTargets(dimension: number): void {
    for (const target of [this.staticTarget, this.dynamicTarget, this.combinedTarget]) target?.dispose();
    const parameters: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat
    };
    this.staticTarget = new THREE.WebGLRenderTarget(dimension, dimension, parameters);
    this.staticTarget.texture.name = "neva_shadow_atlas_static";
    this.dynamicTarget = new THREE.WebGLRenderTarget(dimension, dimension, parameters);
    this.dynamicTarget.texture.name = "neva_shadow_atlas_dynamic";
    this.combinedTarget = new THREE.WebGLRenderTarget(dimension, dimension, { ...parameters, depthBuffer: false });
    this.combinedTarget.texture.name = "neva_shadow_atlas_combined";
    this.dimension = dimension;
    this.hasCommittedFrame = false;
    this.staticAge = 0;
  }

  private rebuildCasterLists(): void {
    if (!this.scene) return;
    this.staticCasters = [];
    this.dynamicCasters = [];
    this.scene.traverse((object) => {
      const castable = object as THREE.Mesh;
      if (!castable.isMesh || !object.castShadow || object.layers.mask === 0) return;
      let dynamic = object.userData.dynamicPresentation === true
        || this.explicitDynamicRoots.has(object);
      if (!dynamic) {
        let cursor: THREE.Object3D | null = object.parent;
        while (cursor) {
          if (cursor.userData.dynamicPresentation === true || this.explicitDynamicRoots.has(cursor)) {
            dynamic = true;
            break;
          }
          cursor = cursor.parent;
        }
      }
      (dynamic ? this.dynamicCasters : this.staticCasters).push(object);
    });
    this.castersDirty = false;
  }

  private withCastShadowDisabled(casters: readonly THREE.Object3D[], run: () => void): void {
    for (let index = 0; index < casters.length; index += 1) {
      const object = casters[index];
      this.savedCastShadow[index] = object.castShadow;
      object.castShadow = false;
    }
    try {
      run();
    } finally {
      for (let index = 0; index < casters.length; index += 1) {
        casters[index].castShadow = this.savedCastShadow[index];
      }
    }
  }

  private combine(): void {
    const staticTarget = this.staticTarget;
    const dynamicTarget = this.dynamicTarget;
    const combinedTarget = this.combinedTarget;
    if (!staticTarget || !dynamicTarget || !combinedTarget) return;
    this.combineMaterial.uniforms.uStaticDepth.value = staticTarget.texture;
    this.combineMaterial.uniforms.uDynamicDepth.value = dynamicTarget.texture;
    const previousTarget = this.renderer.getRenderTarget();
    this.insideAtlasRender = true;
    try {
      this.renderer.setRenderTarget(combinedTarget);
      this.renderer.render(this.quadScene, this.quadCamera);
    } finally {
      this.insideAtlasRender = false;
      this.renderer.setRenderTarget(previousTarget);
    }
  }
}
