import * as THREE from "three";

interface RigidInstance {
  source: THREE.Mesh;
  instanceId: number;
  layers: number;
  matrix: THREE.Matrix4;
  visible: boolean;
}

interface RigidBatch {
  mesh: THREE.BatchedMesh;
  instances: RigidInstance[];
}

export class RigidAnimationBatch {
  private readonly batches: RigidBatch[] = [];
  private readonly inverseRoot = new THREE.Matrix4();
  private readonly instanceMatrix = new THREE.Matrix4();

  public constructor(private readonly root: THREE.Object3D) {
    const groups = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)
        || object instanceof THREE.SkinnedMesh
        || object instanceof THREE.InstancedMesh
        || object instanceof THREE.BatchedMesh
        || Array.isArray(object.material)
        || object.material.transparent
        || object.name.startsWith("COL_")
        || object.layers.mask === 0
        || object.customDepthMaterial || object.customDistanceMaterial
        || object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
        || object.onAfterRender !== THREE.Object3D.prototype.onAfterRender
        || object.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow
        || object.onAfterShadow !== THREE.Object3D.prototype.onAfterShadow
      ) return;
      const geometry: THREE.BufferGeometry = object.geometry;
      const attributes = Object.entries(geometry.attributes);
      if (!geometry.getAttribute("position")
        || geometry.groups.length > 0
        || Object.keys(geometry.morphAttributes).length > 0
        || geometry.drawRange.start !== 0
        || Number.isFinite(geometry.drawRange.count)
      ) return;
      const layout = attributes.map(([name, attribute]) =>
        `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}:${attribute instanceof THREE.BufferAttribute ? attribute.gpuType : THREE.FloatType}`
      ).sort().join("|");
      const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}:${object.layers.mask}:${object.renderOrder}:${!!geometry.index}:${layout}`;
      const sources = groups.get(key) ?? [];
      sources.push(object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>);
      groups.set(key, sources);
    });
    for (const sources of groups.values()) {
      if (sources.length < 2) continue;
      const geometries = [...new Set(sources.map((source) => source.geometry))];
      const vertexCount = geometries.reduce((sum, geometry) => sum + geometry.getAttribute("position").count, 0);
      const indexCount = geometries.reduce((sum, geometry) => sum + (geometry.index?.count ?? 0), 0);
      const first = sources[0];
      const mesh = new THREE.BatchedMesh(sources.length, vertexCount, indexCount, first.material);
      mesh.name = "rigid_animation_batch";
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = first.receiveShadow;
      mesh.layers.mask = first.layers.mask;
      mesh.renderOrder = first.renderOrder;
      mesh.sortObjects = false;
      const geometryIds = new Map(geometries.map((geometry) => [geometry, mesh.addGeometry(geometry)]));
      for (const [name, attribute] of Object.entries(first.geometry.attributes)) {
        if (attribute instanceof THREE.BufferAttribute) {
          (mesh.geometry.getAttribute(name) as THREE.BufferAttribute).gpuType = attribute.gpuType;
        }
      }
      const instances = sources.map((source): RigidInstance => ({
        source,
        instanceId: mesh.addInstance(geometryIds.get(source.geometry)!),
        layers: source.layers.mask,
        matrix: new THREE.Matrix4().makeScale(0, 0, 0),
        visible: true
      }));
      for (const instance of instances) instance.source.layers.mask = 0;
      root.add(mesh);
      this.batches.push({ mesh, instances });
    }
    this.update();
  }

  public update(): void {
    if (this.batches.length === 0) return;
    this.root.updateWorldMatrix(true, true);
    this.inverseRoot.copy(this.root.matrixWorld).invert();
    for (const { mesh, instances } of this.batches) {
      let boundsChanged = false;
      for (const instance of instances) {
        let ancestor: THREE.Object3D | null = instance.source;
        let visible = true;
        while (ancestor && ancestor !== this.root) {
          visible = visible && ancestor.visible;
          ancestor = ancestor.parent;
        }
        visible = visible && ancestor === this.root;
        if (visible !== instance.visible) {
          mesh.setVisibleAt(instance.instanceId, visible);
          instance.visible = visible;
        }
        this.instanceMatrix.multiplyMatrices(this.inverseRoot, instance.source.matrixWorld);
        if (!this.instanceMatrix.equals(instance.matrix)) {
          instance.matrix.copy(this.instanceMatrix);
          mesh.setMatrixAt(instance.instanceId, instance.matrix);
          boundsChanged = true;
        }
      }
      if (boundsChanged) {
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
      }
    }
  }

  public dispose(): void {
    for (const { mesh, instances } of this.batches) {
      for (const instance of instances) instance.source.layers.mask = instance.layers;
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.batches.length = 0;
  }
}
