import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { PALETTE_SPECS, type PaletteToken } from "../materials/PaletteTokens";

interface ReflectionBinding {
  texture: THREE.Texture;
  materials: Set<THREE.MeshStandardMaterial>;
}

const scenes = new WeakMap<THREE.Scene, ReflectionBinding>();
const installed = new WeakSet<THREE.MeshStandardMaterial>();

/** A shared palette material may also be drawn by a separate preview renderer. */
export function installSkyMaterialReflections(material: THREE.MeshStandardMaterial): void {
  if (installed.has(material) || material.envMap) return;
  const token = material.userData.neva_palette_token as PaletteToken | undefined;
  const family = token && PALETTE_SPECS[token]?.family;
  const weights = CANONICAL_RENDER_CONFIG.atmosphere.materialReflections.familyIntensity;
  const intensity = family ? weights[family] : undefined;
  if (intensity === undefined || intensity <= 0) return;
  installed.add(material);
  material.envMapIntensity = intensity;
  const previous = material.onBeforeRender;
  material.onBeforeRender = function (renderer, scene, camera, geometry, object, group): void {
    previous.call(this, renderer, scene, camera, geometry, object, group);
    const binding = scenes.get(scene);
    const texture = binding?.texture ?? null;
    if (this.envMap !== texture) {
      // Presence changes the shader variant; replacing a PMREM texture does not.
      if (Boolean(this.envMap) !== Boolean(texture)) this.needsUpdate = true;
      this.envMap = texture;
    }
    if (binding) binding.materials.add(this);
    this.envMapIntensity = intensity;
  };
}

/** Room-specific clones retain scene isolation and the same warm-up contract. */
export function inheritSkyMaterialReflections(source: THREE.MeshStandardMaterial, clone: THREE.MeshStandardMaterial): void {
  if (!installed.has(source)) return;
  installed.add(clone);
  clone.envMap = null;
}

export function bindSkyMaterialReflections(scene: THREE.Scene, texture: THREE.Texture): void {
  const binding = scenes.get(scene);
  if (binding) binding.texture = texture;
  else scenes.set(scene, { texture, materials: new Set() });
}

/** compileAsync does not run material.onBeforeRender; prime the same variant. */
export function prepareSkyMaterialReflections(scene: THREE.Scene): void {
  const binding = scenes.get(scene);
  if (!binding) return;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || !installed.has(material)) continue;
      if (!material.envMap) material.needsUpdate = true;
      material.envMap = binding.texture;
      binding.materials.add(material);
    }
  });
}

/** Clear shared material references before the scene's render target is released. */
export function unbindSkyMaterialReflections(scene: THREE.Scene): void {
  const binding = scenes.get(scene);
  if (!binding) return;
  for (const material of binding.materials) {
    if (material.envMap !== binding.texture) continue;
    material.envMap = null;
    material.needsUpdate = true;
  }
  scenes.delete(scene);
}
