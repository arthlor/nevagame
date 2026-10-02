import * as THREE from "three";
import { SunLight } from "three/addons/lights/SunLight.js";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { fitSunReceiverBounds } from "./sunReceiverBounds";

/**
 * Basic/PCF use native depth textures. VSM filters moments into a color
 * texture and must keep the renderer-owned path.
 */
function pcfCompatible(): boolean {
  return Object.values(CANONICAL_RENDER_CONFIG.shadows.type).every((type) => type !== THREE.VSMShadowMap);
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
  width: number;
  height: number;
  cascades: number;
  staticRefreshes: number;
  dynamicRefreshes: number;
  combines: number;
  lastStaticRefreshReason: string | null;
  staticCasters: number;
  dynamicCasters: number;
  committedFocus: { x: number; y: number; z: number } | null;
  receiverHeightRange: { min: number; max: number } | null;
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
type ShadowLight = THREE.DirectionalLight | SunLight;

const COMBINE_VERTEX = /* glsl */`
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMBINE_FRAGMENT = /* glsl */`
uniform sampler2D uStaticDepth;
uniform sampler2D uDynamicDepth;
out vec4 atlasColor;
void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  float staticDepth = texelFetch(uStaticDepth, pixel, 0).r;
  float dynamicDepth = texelFetch(uDynamicDepth, pixel, 0).r;
#ifdef USE_REVERSED_DEPTH
  gl_FragDepth = max(staticDepth, dynamicDepth);
#else
  gl_FragDepth = min(staticDepth, dynamicDepth);
#endif
  atlasColor = vec4(0.0);
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
  private width = 0;
  private height = 0;
  private targetShadowType: THREE.ShadowMapType | null = null;
  private ownerLight: ShadowLight | null = null;
  private committedViewCamera: THREE.Camera | null = null;
  private readonly committedProjection = new THREE.Matrix4();
  private readonly committedViewRotation = new THREE.Quaternion();
  private readonly liveViewRotation = new THREE.Quaternion();

  private scene: THREE.Scene | null = null;
  private readonly casterScene = new THREE.Scene();
  private readonly observedCasterRoots = new Set<THREE.Object3D>();
  private readonly onCasterChildrenChanged = (event: { child: THREE.Object3D }): void => {
    let affectsShadows = false;
    event.child.traverse((object) => {
      if (object.castShadow || object.receiveShadow) affectsShadows = true;
    });
    if (affectsShadows) this.markCastersDirty();
  };
  private readonly onSceneChildAdded = (event: { child: THREE.Object3D }): void => {
    this.observeCasterRoot(event.child);
    this.onCasterChildrenChanged(event);
  };
  private readonly onSceneChildRemoved = (event: { child: THREE.Object3D }): void => {
    this.unobserveCasterRoot(event.child);
    this.onCasterChildrenChanged(event);
  };
  private readonly explicitDynamicRoots = new Set<THREE.Object3D>();
  private staticCasters: THREE.Object3D[] = [];
  private dynamicCasters: THREE.Object3D[] = [];
  private readonly staticCasterSet = new Set<THREE.Object3D>();
  private readonly dynamicCasterSet = new Set<THREE.Object3D>();
  private dynamicReceivers: THREE.Mesh[] = [];
  private staticReceiverMinY = Infinity;
  private staticReceiverMaxY = -Infinity;
  private receiverMinY = -Infinity;
  private receiverMaxY = Infinity;
  private committedReceiverMinY = -Infinity;
  private committedReceiverMaxY = Infinity;
  private readonly receiverBounds = new THREE.Box3();
  private readonly receiverSphere = new THREE.Sphere();
  private readonly instanceBoundsVersions = new WeakMap<THREE.InstancedMesh, { version: number; count: number }>();
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
      glslVersion: THREE.GLSL3,
      defines: this.renderer.capabilities.reversedDepthBuffer ? { USE_REVERSED_DEPTH: 1 } : {},
      vertexShader: COMBINE_VERTEX,
      fragmentShader: COMBINE_FRAGMENT,
      // Every texel, including empty far depth, must replace the previous frame.
      depthTest: true,
      depthFunc: THREE.AlwaysDepth,
      depthWrite: true,
      colorWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.combineMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.quadCamera.updateProjectionMatrix();
    // Native filter changes must still invalidate every world material,
    // including receivers omitted from the bounded depth traversal.
    this.casterScene.traverse = (callback) => this.scene?.traverse(callback);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled && pcfCompatible();
    if (!this.enabled) this.hasCommittedFrame = false;
  }

  public registerScene(scene: THREE.Scene): void {
    if (this.scene === scene) return;
    this.releaseCasterObservers();
    this.scene = scene;
    scene.addEventListener("childadded", this.onSceneChildAdded);
    scene.addEventListener("childremoved", this.onSceneChildRemoved);
    for (const root of scene.children) this.observeCasterRoot(root);
    this.castersDirty = true;
    this.hasCommittedFrame = false;
  }

  /** Registers a live root whose shadows must update every frame. */
  public registerDynamicRoot(root: THREE.Object3D): void {
    if (this.explicitDynamicRoots.has(root)) return;
    this.explicitDynamicRoots.add(root);
    this.castersDirty = true;
    this.hasCommittedFrame = false;
  }

  /** Re-scans caster classification after a load created presentation objects. */
  public markCastersDirty(): void {
    this.castersDirty = true;
    this.hasCommittedFrame = false;
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
    const light = lights.find((candidate): candidate is ShadowLight => (
      candidate.castShadow && ((candidate as THREE.DirectionalLight).isDirectionalLight || candidate instanceof SunLight)
    ));
    if (!this.enabled || this.renderer.shadowMap.type === THREE.VSMShadowMap) {
      // VSM and the disabled atlas retain Three's complete shadow renderer.
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
    this.updateReceiverHeightRange();
    const cascaded = light instanceof SunLight;
    const mapSize = light.shadow.mapSize;
    const extents = light.shadow.getFrameExtents();
    const dimension = Math.max(1, Math.min(
      Math.floor(this.renderer.capabilities.maxTextureSize / Math.max(extents.x, extents.y)),
      Math.floor(Math.max(mapSize.x, mapSize.y))
    ));
    const shadowType = this.renderer.shadowMap.type;
    if (!this.staticTarget || this.dimension !== dimension || this.targetShadowType !== shadowType
      || this.ownerLight !== light || light.shadow.map !== this.combinedTarget) {
      this.rebuildTargets(dimension, shadowType, light);
    }

    const liveLightPosition = this.tempLiveLightPosition.copy(light.position);
    const liveTargetPosition = cascaded
      ? camera.getWorldPosition(this.tempLiveTargetPosition)
      : this.tempLiveTargetPosition.copy(light.target.position);
    const direction = cascaded
      ? this.tempDirection.copy(liveLightPosition).negate().normalize()
      : this.tempDirection.subVectors(liveTargetPosition, liveLightPosition).normalize();
    let policy = shadowAtlasStaticRefreshReason({
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
    if (cascaded && policy === null) {
      const config = CANONICAL_RENDER_CONFIG.shadows.cascades;
      camera.getWorldQuaternion(this.liveViewRotation);
      if (!this.committedViewCamera || this.committedViewCamera.constructor !== camera.constructor
        || !this.committedProjection.equals(camera.projectionMatrix)) policy = "view-projection";
      else if (liveTargetPosition.distanceTo(this.committedTargetPosition) > config.recenterMeters) policy = "view-position";
      else if (this.liveViewRotation.angleTo(this.committedViewRotation) > config.rotationRadians) policy = "view-rotation";
      else if (this.receiverMinY < this.committedReceiverMinY || this.receiverMaxY > this.committedReceiverMaxY) {
        policy = "receiver-height";
      }
    }

    if (policy !== null) {
      this.committedLightPosition.copy(liveLightPosition);
      this.committedTargetPosition.copy(liveTargetPosition);
      this.committedDirection.copy(direction);
      this.hasCommittedFrame = true;
      this.staticAge = 0;
      this.lastStaticRefreshReason = policy;
      this.committedReceiverMinY = this.receiverMinY;
      this.committedReceiverMaxY = this.receiverMaxY;
      if (cascaded) {
        if (!this.committedViewCamera || this.committedViewCamera.constructor !== camera.constructor) {
          this.committedViewCamera = camera.clone();
        } else this.committedViewCamera.copy(camera, false);
        this.committedProjection.copy(camera.projectionMatrix);
        camera.getWorldQuaternion(this.committedViewRotation);
        // Conservative overscan keeps a short-lived committed view covering
        // normal camera drift; cuts, turns and projection changes invalidate it.
        const projection = this.committedViewCamera.projectionMatrix;
        projection.elements[0] /= CANONICAL_RENDER_CONFIG.shadows.cascades.viewPadding;
        projection.elements[5] /= CANONICAL_RENDER_CONFIG.shadows.cascades.viewPadding;
        this.committedViewCamera.projectionMatrixInverse.copy(projection).invert();
      }
    } else {
      this.staticAge += 1;
    }

    light.position.copy(this.committedLightPosition);
    if (!cascaded) light.target.position.copy(this.committedTargetPosition);
    light.updateMatrixWorld();
    if (!cascaded) light.target.updateMatrixWorld();
    const nativeUpdateMatrices = light.shadow.updateMatrices;
    if (cascaded) {
      // Use the public shadow hook; both atlas passes must fit the same view.
      // Fitted matrices are part of the cached static depth frame. Hold them
      // between refreshes, even if moving receivers now occupy a smaller slab.
      let matricesUpdated = policy === null;
      light.shadow.updateMatrices = (owner) => {
        if (matricesUpdated) return;
        nativeUpdateMatrices.call(light.shadow, owner, this.committedViewCamera!);
        fitSunReceiverBounds(light, this.committedViewCamera!, this.committedReceiverMinY, this.committedReceiverMaxY);
        matricesUpdated = true;
      };
    }

    let complete = false;
    try {
      const scope = this.renderer.shadowMap;
      const cpuStart = this.cpuTimingEnabled ? performance.now() : 0;
      if (policy !== null) {
        this.withCastShadowDisabled(this.dynamicCasters, () => {
          light.shadow.map = this.staticTarget;
          scope.needsUpdate = true;
          this.renderCasters(original, lights, scene, camera, this.staticCasters, this.staticCasterSet);
          this.staticTarget = this.adoptRenderedTarget(light, "static");
        });
        this.staticRefreshes += 1;
      }
      const afterStatic = this.cpuTimingEnabled ? performance.now() : 0;
      this.withCastShadowDisabled(this.staticCasters, () => {
        light.shadow.map = this.dynamicTarget;
        scope.needsUpdate = true;
        this.renderCasters(original, lights, scene, camera, this.dynamicCasters, this.dynamicCasterSet);
        this.dynamicTarget = this.adoptRenderedTarget(light, "dynamic");
      });
      this.dynamicRefreshes += 1;
      const afterDynamic = this.cpuTimingEnabled ? performance.now() : 0;

      light.shadow.map = this.combinedTarget;
      scope.needsUpdate = false;
      this.combine();
      this.combines += 1;
      complete = true;
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
      if (!cascaded) light.target.position.copy(liveTargetPosition);
      light.updateMatrixWorld();
      if (!cascaded) light.target.updateMatrixWorld();
      light.shadow.updateMatrices = nativeUpdateMatrices;
      light.shadow.map = this.combinedTarget;
      this.renderer.shadowMap.needsUpdate = !complete;
      if (!complete) this.hasCommittedFrame = false;
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
      width: this.width,
      height: this.height,
      cascades: this.ownerLight?.shadow.getViewportCount() ?? 0,
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
      receiverHeightRange: this.hasCommittedFrame && Number.isFinite(this.committedReceiverMinY)
        && Number.isFinite(this.committedReceiverMaxY)
        ? { min: this.committedReceiverMinY, max: this.committedReceiverMaxY } : null,
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

  /** Releases owned maps before quality settings reset either light's map. */
  public invalidate(): void {
    if (this.ownerLight) this.restoreLegacyShadowMap(this.ownerLight);
    this.staticTarget?.dispose();
    this.dynamicTarget?.dispose();
    this.combinedTarget?.dispose();
    this.staticTarget = null;
    this.dynamicTarget = null;
    this.combinedTarget = null;
    this.ownerLight = null;
    this.targetShadowType = null;
    this.dimension = 0;
    this.width = 0;
    this.height = 0;
    this.committedViewCamera = null;
    this.hasCommittedFrame = false;
    this.staticAge = 0;
  }

  public dispose(): void {
    this.invalidate();
    this.releaseCasterObservers();
    this.scene = null;
    this.combineMaterial.dispose();
    this.quad.geometry.dispose();
    this.explicitDynamicRoots.clear();
    this.staticCasters = [];
    this.dynamicCasters = [];
    this.staticCasterSet.clear();
    this.dynamicCasterSet.clear();
    this.casterScene.children.length = 0;
    this.dynamicReceivers = [];
    this.savedCastShadow.length = 0;
    this.hasCommittedFrame = false;
  }

  private readonly tempLiveLightPosition = new THREE.Vector3();
  private readonly tempLiveTargetPosition = new THREE.Vector3();
  private readonly tempDirection = new THREE.Vector3();

  private observeCasterRoot(root: THREE.Object3D): void {
    this.observedCasterRoots.add(root);
    // Presentation roots can replace direct child meshes without a model-load
    // callback (crop stages/capacity). Deeper edits retain explicit invalidation.
    root.addEventListener("childadded", this.onCasterChildrenChanged);
    root.addEventListener("childremoved", this.onCasterChildrenChanged);
  }

  private unobserveCasterRoot(root: THREE.Object3D): void {
    root.removeEventListener("childadded", this.onCasterChildrenChanged);
    root.removeEventListener("childremoved", this.onCasterChildrenChanged);
    this.observedCasterRoots.delete(root);
  }

  private releaseCasterObservers(): void {
    this.scene?.removeEventListener("childadded", this.onSceneChildAdded);
    this.scene?.removeEventListener("childremoved", this.onSceneChildRemoved);
    for (const root of this.observedCasterRoots) this.unobserveCasterRoot(root);
  }

  private restoreLegacyShadowMap(light: ShadowLight): void {
    if (light.shadow.map === this.combinedTarget
      || light.shadow.map === this.staticTarget
      || light.shadow.map === this.dynamicTarget) {
      light.shadow.map = null;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  private rebuildTargets(dimension: number, shadowType: THREE.ShadowMapType, light: ShadowLight): void {
    this.invalidate();
    const extents = light.shadow.getFrameExtents();
    this.width = dimension * extents.x;
    this.height = dimension * extents.y;
    this.staticTarget = this.createTarget("static", false);
    this.dynamicTarget = this.createTarget("dynamic", false);
    this.combinedTarget = this.createTarget("combined", shadowType === THREE.PCFShadowMap);
    this.ownerLight = light;
    this.targetShadowType = shadowType;
    this.dimension = dimension;
  }

  private createTarget(name: string, comparison: boolean): THREE.WebGLRenderTarget {
    const target = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false
    });
    target.texture.name = `neva_shadow_atlas_${name}`;
    const depth = new THREE.DepthTexture(this.width, this.height, THREE.UnsignedIntType);
    depth.name = `${target.texture.name}_depth`;
    depth.compareFunction = comparison
      ? (this.renderer.capabilities.reversedDepthBuffer ? THREE.GreaterEqualCompare : THREE.LessEqualCompare)
      : null;
    depth.minFilter = comparison ? THREE.LinearFilter : THREE.NearestFilter;
    depth.magFilter = depth.minFilter;
    target.depthTexture = depth;
    return target;
  }

  private adoptRenderedTarget(light: ShadowLight, name: string): THREE.WebGLRenderTarget {
    // Three may replace and dispose the supplied target when the filter changes.
    // Adopt its public result; never alter WebGLShadowMap's private type cache.
    const target = light.shadow.map;
    const depth = target?.depthTexture;
    if (!(target instanceof THREE.WebGLRenderTarget) || !depth
      || target.width !== this.width || target.height !== this.height) {
      throw new Error(`Three r${THREE.REVISION}: shadow atlas ${name} requires a matching native depth target`);
    }
    if (depth.compareFunction !== null || depth.minFilter !== THREE.NearestFilter || depth.magFilter !== THREE.NearestFilter) {
      depth.compareFunction = null;
      depth.minFilter = THREE.NearestFilter;
      depth.magFilter = THREE.NearestFilter;
      depth.needsUpdate = true;
    }
    target.texture.name = `neva_shadow_atlas_${name}`;
    depth.name = `${target.texture.name}_depth`;
    return target;
  }

  private rebuildCasterLists(): void {
    if (!this.scene) return;
    this.staticCasters = [];
    this.dynamicCasters = [];
    this.staticCasterSet.clear();
    this.dynamicCasterSet.clear();
    this.dynamicReceivers = [];
    this.staticReceiverMinY = Infinity;
    this.staticReceiverMaxY = -Infinity;
    this.scene.traverse((object) => {
      const castable = object as THREE.Mesh;
      if ((!castable.isMesh && !(object as THREE.Line).isLine && !(object as THREE.Points).isPoints)
        || object.layers.mask === 0) return;
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
      if (object.castShadow) {
        (dynamic ? this.dynamicCasters : this.staticCasters).push(object);
        (dynamic ? this.dynamicCasterSet : this.staticCasterSet).add(object);
      }
      if (!castable.isMesh) return;
      if (object.receiveShadow) {
        if (dynamic || castable instanceof THREE.InstancedMesh || castable instanceof THREE.SkinnedMesh) {
          this.dynamicReceivers.push(castable);
        }
        else {
          if (castable instanceof THREE.BatchedMesh) {
            castable.computeBoundingBox();
            this.receiverBounds.copy(castable.boundingBox!).applyMatrix4(castable.matrixWorld);
          } else {
            if (!castable.geometry.boundingBox) castable.geometry.computeBoundingBox();
            this.receiverBounds.copy(castable.geometry.boundingBox!).applyMatrix4(castable.matrixWorld);
          }
          this.staticReceiverMinY = Math.min(this.staticReceiverMinY, this.receiverBounds.min.y);
          this.staticReceiverMaxY = Math.max(this.staticReceiverMaxY, this.receiverBounds.max.y);
        }
      }
    });
    this.castersDirty = false;
  }

  private updateReceiverHeightRange(): void {
    let min = this.staticReceiverMinY, max = this.staticReceiverMaxY;
    for (const object of this.dynamicReceivers) {
      // Skinned assets carry the loader's articulated envelope; geometry bounds
      // alone describe their bind pose. Rigid instances retain geometry bounds.
      let sphere: THREE.Sphere | null;
      if (object instanceof THREE.SkinnedMesh) sphere = object.boundingSphere;
      else if (object instanceof THREE.InstancedMesh) {
        const previous = this.instanceBoundsVersions.get(object);
        if (!previous || previous.version !== object.instanceMatrix.version || previous.count !== object.count) {
          object.computeBoundingSphere();
          this.instanceBoundsVersions.set(object, { version: object.instanceMatrix.version, count: object.count });
        }
        sphere = object.boundingSphere;
      } else if (object instanceof THREE.BatchedMesh) {
        // Instance transforms can change without touching geometry bounds.
        object.computeBoundingSphere();
        sphere = object.boundingSphere;
      } else {
        if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere();
        sphere = object.geometry.boundingSphere;
      }
      if (!sphere) { min = -Infinity; max = Infinity; break; }
      this.receiverSphere.copy(sphere).applyMatrix4(object.matrixWorld);
      min = Math.min(min, this.receiverSphere.center.y - this.receiverSphere.radius);
      max = Math.max(max, this.receiverSphere.center.y + this.receiverSphere.radius);
    }
    this.receiverMinY = min;
    this.receiverMaxY = max;
  }

  private renderCasters(
    original: ShadowMapRender,
    lights: THREE.Light[],
    scene: THREE.Scene,
    camera: THREE.Camera,
    casters: readonly THREE.Object3D[],
    casterSet: ReadonlySet<THREE.Object3D>
  ): void {
    // WebGLShadowMap consumes already-updated world matrices. Borrow subtrees
    // only for that call; add()/render() would reparent or recompute them.
    const children = this.casterScene.children;
    this.casterScene.visible = scene.visible;
    try {
      for (const caster of casters) {
        if (!caster.visible) continue;
        let ancestor = caster.parent;
        while (ancestor && ancestor !== scene) {
          // Native traversal hides a subtree under an invisible parent. An
          // indexed ancestor already traverses this caster, so avoid duplicates.
          if (!ancestor.visible || casterSet.has(ancestor)) {
            ancestor = null;
            break;
          }
          ancestor = ancestor.parent;
        }
        // Removed objects and objects reparented to another scene cannot cast.
        if (ancestor === scene) children.push(caster);
      }
      original(lights, this.casterScene, camera);
    } finally {
      children.length = 0;
    }
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
    this.combineMaterial.uniforms.uStaticDepth.value = staticTarget.depthTexture;
    this.combineMaterial.uniforms.uDynamicDepth.value = dynamicTarget.depthTexture;
    const previousTarget = this.renderer.getRenderTarget();
    const previousFace = this.renderer.getActiveCubeFace();
    const previousLevel = this.renderer.getActiveMipmapLevel();
    const previousAutoClear = this.renderer.autoClear;
    const previousXr = this.renderer.xr.enabled;
    const previousShadows = this.renderer.shadowMap.enabled;
    this.insideAtlasRender = true;
    try {
      this.renderer.autoClear = false;
      this.renderer.xr.enabled = false;
      this.renderer.shadowMap.enabled = false;
      this.renderer.setRenderTarget(combinedTarget);
      this.renderer.render(this.quadScene, this.quadCamera);
    } finally {
      this.renderer.setRenderTarget(previousTarget, previousFace, previousLevel);
      this.renderer.autoClear = previousAutoClear;
      this.renderer.xr.enabled = previousXr;
      this.renderer.shadowMap.enabled = previousShadows;
      this.insideAtlasRender = false;
      this.combineMaterial.uniforms.uStaticDepth.value = null;
      this.combineMaterial.uniforms.uDynamicDepth.value = null;
    }
  }
}
