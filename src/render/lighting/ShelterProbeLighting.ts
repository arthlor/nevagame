import * as THREE from "three";
import { SunLight } from "three/addons/lights/SunLight.js";
import { LightProbeGridWebGL } from "three/addons/lighting/LightProbeGridWebGL.js";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { cloneShelterReceiver, type ShelterProbeUniforms } from "./ShelterProbeMaterial";
import type { LightingFrame } from "./LightingRig";

interface RoomMaterial {
  source: THREE.MeshStandardMaterial;
  receiver: THREE.MeshStandardMaterial;
  capture: THREE.MeshStandardMaterial;
}

/** Bakes actual room geometry off-scene; only scoped receiver materials sample it. */
export class ShelterProbeLighting {
  private readonly capture = new THREE.Scene();
  private readonly roomMaterials = new Map<THREE.MeshStandardMaterial, RoomMaterial>();
  private readonly originals = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  private readonly lights = new Map<THREE.Light, THREE.Light>();
  private readonly grids: [LightProbeGridWebGL, LightProbeGridWebGL];
  private readonly uniforms: ShelterProbeUniforms;
  private actor: THREE.Object3D | null = null;
  private actorDirty = false;
  private active = false;
  private enabled: boolean;
  private cycle = false;
  private writeGrid = 0;
  private cursor = 0;
  private published = 0;
  private lastBake = -Infinity;
  private lastStep = -Infinity;
  private disposed = false;
  private lightingKey = "";
  private readonly center = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly world: THREE.Scene,
    private readonly room: THREE.Box3,
    tier: QualityTier,
    private readonly withNativeShadows: (run: () => void) => void,
    private readonly skyTexture: () => THREE.Texture | null
  ) {
    const config = CANONICAL_RENDER_CONFIG.shelteredLighting;
    this.enabled = config.enabled[tier];
    const size = room.getSize(new THREE.Vector3()).addScalar(-2 * config.probeInsetMeters);
    room.getCenter(this.center);
    const create = (): LightProbeGridWebGL => {
      const grid = new LightProbeGridWebGL(size.x, size.y, size.z, 2, 2, 2);
      grid.position.copy(this.center);
      grid.updateBoundingBox();
      return grid;
    };
    this.grids = [create(), create()];
    this.uniforms = {
      nevaShelterSH: { value: null },
      nevaShelterMin: { value: this.grids[0].boundingBox.min.clone() },
      nevaShelterMax: { value: this.grids[0].boundingBox.max.clone() },
      nevaShelterResolution: { value: this.grids[0].resolution.clone() },
      // Include the actual floor/ceiling surfaces, fading only at the room edge.
      nevaShelterRoomMin: { value: room.min.clone().addScalar(-0.1) },
      nevaShelterRoomMax: { value: room.max.clone().addScalar(0.1) },
      nevaShelterReady: { value: 0 }
    };
  }

  private material(source: THREE.Material): THREE.Material {
    if (!(source instanceof THREE.MeshStandardMaterial)) return source;
    const original = this.originals.get(source);
    if (original) return source;
    let binding = this.roomMaterials.get(source);
    if (!binding) {
      const receiver = cloneShelterReceiver(source, this.uniforms);
      const capture = source.clone();
      capture.fog = false;
      capture.envMap = null;
      binding = { source, receiver, capture };
      this.roomMaterials.set(source, binding);
      this.originals.set(receiver, source);
    }
    return binding.receiver;
  }

  private mapMaterials(mesh: THREE.Mesh, receive: boolean): void {
    const convert = (source: THREE.Material): THREE.Material => receive
      ? this.material(source)
      : source instanceof THREE.MeshStandardMaterial ? this.originals.get(source) ?? source : source;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  }

  /** Call before static batching retires source hierarchies. Geometry remains borrowed. */
  public addRoomRoot(root: THREE.Object3D): void {
    root.updateWorldMatrix(true, true);
    root.traverse(object => {
      if (object instanceof THREE.Mesh && !object.name.startsWith("COL_")) this.mapMaterials(object, true);
    });
    const visit = (object: THREE.Object3D): void => {
      if (object.name.startsWith("COL_")) return;
      if (object instanceof THREE.LOD) {
        if (object.levels[0]) visit(object.levels[0].object);
        return;
      }
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const captureMaterials = materials.map(material => {
          const original = material instanceof THREE.MeshStandardMaterial ? this.originals.get(material) : null;
          return original ? this.roomMaterials.get(original)!.capture : material;
        });
        const mesh = new THREE.Mesh(object.geometry, Array.isArray(object.material) ? captureMaterials : captureMaterials[0]);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(object.matrixWorld);
        mesh.castShadow = object.castShadow;
        mesh.receiveShadow = object.receiveShadow;
        this.capture.add(mesh);
      }
      for (const child of object.children) visit(child);
    };
    visit(root);
    this.lastBake = -Infinity;
  }

  public setActor(root: THREE.Object3D): void { this.actor = root; this.actorDirty = true; }
  public markActorDirty(): void { this.actorDirty = true; }

  public setQuality(tier: QualityTier): void {
    this.enabled = CANONICAL_RENDER_CONFIG.shelteredLighting.enabled[tier];
    if (!this.enabled) this.uniforms.nevaShelterReady.value = 0;
    else if (this.published > 0) this.uniforms.nevaShelterReady.value = 1;
    this.actorDirty = true;
  }

  /** Outside the room, actors use their original materials and baking is idle. */
  public update(focus: THREE.Vector3, frame: LightingFrame): void {
    const active = this.enabled && this.room.containsPoint(focus);
    if (this.actor && (this.actorDirty || this.active !== active)) {
      this.actor.traverse(object => { if (object instanceof THREE.Mesh) this.mapMaterials(object, active); });
      this.actorDirty = false;
    }
    this.active = active;
    const key = [frame.ambientDaylight, frame.stormStrength, frame.practicalLightIntensity]
      .map(value => Math.round(value * 8)).join(":");
    if (key !== this.lightingKey) {
      this.lightingKey = key;
      this.cycle = false;
      this.lastBake = -Infinity;
    }
    if (!this.active) return;
    for (const { source, receiver } of this.roomMaterials.values()) {
      receiver.color.copy(source.color);
      receiver.emissive.copy(source.emissive);
      receiver.emissiveIntensity = source.emissiveIntensity;
    }
  }

  private snapshotLighting(): void {
    this.capture.background = this.skyTexture() ?? this.world.background;
    for (const light of this.lights.values()) light.visible = false;
    this.world.traverse(object => {
      if (!(object instanceof THREE.Light)) return;
      let visible = true;
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
        if (!parent.visible) { visible = false; break; }
      }
      // Keep local point-light slots stable across daytime and distance budgets.
      // Hidden sources contribute zero energy, without compiling a new capture
      // program when their existing practical light becomes visible at night.
      if (!visible && !(object instanceof THREE.PointLight)) return;
      if (object instanceof THREE.PointLight && !this.room.clone().expandByScalar(object.distance || 5).containsPoint(
        object.getWorldPosition(this.direction)
      )) return;
      if (!(object instanceof SunLight || object instanceof THREE.DirectionalLight
        || object instanceof THREE.HemisphereLight || object instanceof THREE.PointLight || object instanceof THREE.AmbientLight)) return;
      let light = this.lights.get(object);
      if (!light) {
        light = object instanceof SunLight ? new THREE.DirectionalLight() : object.clone(false);
        this.lights.set(object, light);
        this.capture.add(light);
        if (light instanceof THREE.DirectionalLight) {
          this.capture.add(light.target);
          light.shadow.mapSize.set(64, 64);
          Object.assign(light.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8, near: 0.1, far: 48 });
          light.shadow.camera.updateProjectionMatrix();
        }
      }
      light.visible = true;
      light.color.copy(object.color);
      light.intensity = visible ? object.intensity : 0;
      light.castShadow = visible && object.castShadow;
      if (light instanceof THREE.DirectionalLight) {
        if (object instanceof SunLight) this.direction.copy(object.position).normalize();
        else {
          (object as THREE.DirectionalLight).getWorldPosition(this.direction);
          this.direction.sub((object as THREE.DirectionalLight).target.getWorldPosition(new THREE.Vector3())).normalize();
        }
        light.position.copy(this.center).addScaledVector(this.direction, 20);
        light.target.position.copy(this.center);
        const shadow = (object as SunLight | THREE.DirectionalLight).shadow;
        light.shadow.bias = shadow.bias;
        light.shadow.normalBias = shadow.normalBias;
        light.shadow.intensity = shadow.intensity;
      } else if (light instanceof THREE.PointLight && object instanceof THREE.PointLight) {
        light.position.copy(object.getWorldPosition(this.direction));
        light.distance = object.distance;
        light.decay = object.decay;
      } else if (light instanceof THREE.HemisphereLight && object instanceof THREE.HemisphereLight) {
        light.groundColor.copy(object.groundColor);
        light.position.copy(object.position);
      }
    });
    for (const { source, capture } of this.roomMaterials.values()) {
      capture.color.copy(source.color);
      capture.emissive.copy(source.emissive);
      capture.emissiveIntensity = source.emissiveIntensity;
    }
  }

  /** Called inside the pipeline's measured frame, before atmosphere/world draws. */
  public render(force = false): void {
    if (this.disposed || (!this.active && !force) || !this.enabled || this.capture.children.length === 0) return;
    const now = performance.now() / 1000;
    const config = CANONICAL_RENDER_CONFIG.shelteredLighting;
    if (!this.cycle) {
      if (now - this.lastBake < config.updateIntervalSeconds) return;
      this.snapshotLighting();
      this.cursor = 0;
      this.cycle = true;
    }
    if (!force && now - this.lastStep < config.probeStepSeconds) return;
    const grid = this.grids[this.writeGrid];
    this.withNativeShadows(() => grid.bake(this.renderer, this.capture, {
      start: this.cursor, count: 1, pass: 0, bounces: 0,
      cubemapSize: config.cubemapSize, near: 0.05, far: 24
    }));
    this.cursor++;
    this.lastStep = now;
    if (this.cursor === 8) {
      // Publish a complete grid; displayed materials never see a partial bake.
      this.uniforms.nevaShelterSH.value = grid.texture;
      this.uniforms.nevaShelterReady.value = 1;
      this.writeGrid = 1 - this.writeGrid;
      this.published++;
      this.lastBake = now;
      this.cycle = false;
    }
  }

  public async prepareForEntry(): Promise<void> {
    if (!this.enabled || this.published > 0 || this.capture.children.length === 0) return;
    this.snapshotLighting();
    this.capture.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(90, 1, 0.05, 24);
    camera.position.copy(this.center);
    camera.updateMatrixWorld(true);
    const target = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
    const previousTarget = this.renderer.getRenderTarget();
    const previousFace = this.renderer.getActiveCubeFace();
    const previousLevel = this.renderer.getActiveMipmapLevel();
    let pending!: ReturnType<THREE.WebGLRenderer["compileAsync"]>;
    try {
      this.withNativeShadows(() => {
        this.renderer.setRenderTarget(target);
        try { pending = this.renderer.compileAsync(this.capture, camera); }
        finally { this.renderer.setRenderTarget(previousTarget, previousFace, previousLevel); }
      });
      await pending;
    } finally {
      target.dispose();
    }
    if (this.disposed) return;
    for (let index = 0; index < 8; index++) this.render(true);
  }

  /** Submit the actor's sheltered variant without leaving a temporary material live. */
  public prepareActorVariant(compile: () => Promise<void>): Promise<void> {
    if (!this.actor || !this.enabled) return Promise.resolve();
    const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    this.actor.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      saved.set(object, object.material);
      this.mapMaterials(object, true);
    });
    try { return compile(); }
    finally { for (const [mesh, material] of saved) mesh.material = material; }
  }

  public reset(): void {
    this.uniforms.nevaShelterSH.value = null;
    this.uniforms.nevaShelterReady.value = 0;
    for (const grid of this.grids) grid.dispose();
    for (const light of this.lights.values()) {
      if (light instanceof THREE.DirectionalLight) {
        light.shadow.dispose();
        light.shadow.map = null;
        light.shadow.mapPass = null;
      }
    }
    this.published = 0;
    this.cycle = false;
    this.cursor = 0;
    this.lastStep = this.lastBake = -Infinity;
  }

  public diagnostics() {
    return { enabled: this.enabled, active: this.active, published: this.published,
      pendingProbes: this.cycle ? 8 - this.cursor : 0, materials: this.roomMaterials.size,
      captureMeshes: this.capture.children.filter(object => object instanceof THREE.Mesh).length,
      atlasBytes: this.grids.filter(grid => grid.texture).length * 2 * 2 * (2 + 2) * 7 * 16 };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    if (this.actor) this.actor.traverse(object => { if (object instanceof THREE.Mesh) this.mapMaterials(object, false); });
    for (const { receiver, capture } of this.roomMaterials.values()) { receiver.dispose(); capture.dispose(); }
    for (const light of this.lights.values()) light.dispose();
    this.capture.clear();
    this.capture.background = null;
    this.roomMaterials.clear();
    this.originals.clear();
    this.lights.clear();
    this.actor = null;
  }
}
