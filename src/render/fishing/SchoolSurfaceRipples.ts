import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { PaletteMaterials } from "../materials/PaletteMaterials";

/** Bounded, world-anchored feeding rings. Each fish owns one reusable slot. */
export class SchoolSurfaceRipples {
  readonly root = new THREE.Group();
  private readonly geometry = new THREE.RingGeometry(0.94, 1, 28, 1, 0.2, Math.PI * 1.65);
  private readonly slots: Array<{
    mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshStandardMaterial>;
    born: number;
    strength: number;
  }>;

  constructor(count: number) {
    this.root.name = "school_feeding_ripples";
    this.geometry.rotateX(-Math.PI / 2);
    this.slots = Array.from({ length: count }, (_, index) => {
      const material = PaletteMaterials.standard("foam_warm_01", {
        transparent: true, opacity: 0, roughness: 0.8
      }).clone();
      material.depthWrite = false;
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.name = `school_ripple_${index}`;
      mesh.rotation.y = index * 2.399963;
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.root.add(mesh);
      return { mesh, born: -Infinity, strength: 0 };
    });
  }

  emit(index: number, x: number, z: number, time: number, strength: number): void {
    const slot = this.slots[index]!;
    slot.mesh.position.set(x, 0, z);
    slot.born = time;
    slot.strength = strength;
  }

  update(time: number, waterHeight: (x: number, z: number) => number, reducedMotion: boolean): void {
    const tuning = CANONICAL_RENDER_CONFIG.fishSchools;
    for (const { mesh, born, strength } of this.slots) {
      const age = (time - born) / tuning.rippleLifetimeSeconds;
      mesh.visible = age >= 0 && age < 1;
      if (!mesh.visible) continue;
      const radius = reducedMotion ? 0.65 : 0.2 + age * 1.05;
      mesh.scale.set(radius, 1, radius * 0.82);
      mesh.position.y = waterHeight(mesh.position.x, mesh.position.z) + 0.025;
      mesh.material.opacity = Math.sin(Math.PI * age) * (1 - age)
        * tuning.rippleOpacity * strength;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    for (const { mesh } of this.slots) mesh.material.dispose();
    this.root.removeFromParent();
  }
}
