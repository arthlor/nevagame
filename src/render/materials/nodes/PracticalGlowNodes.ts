import * as THREE from "three";
import { SpriteNodeMaterial, type NodeBuilder } from "three/webgpu";
import { Fn, materialColor, materialOpacity, uv, vec4, workingToColorSpace } from "three/tsl";
import { WebGLNodesHandler } from "three/addons/tsl/WebGLNodesHandler.js";

/** This pilot is unlit; native WebGL continues to own every lit world material. */
class PracticalGlowNodesHandler extends WebGLNodesHandler {
  public override updateLights(): void { super.updateLights([]); }

  public override setObject(object: THREE.Object3D, material: THREE.Material): void {
    if ((material as { lights?: boolean }).lights) {
      throw new Error("The practical-glow node adapter only supports unlit materials");
    }
    super.setObject(object, material);
  }
}

export function attachPracticalGlowNodes(renderer: THREE.WebGLRenderer): void {
  renderer.setNodesHandler(new PracticalGlowNodesHandler());
}

// Node identity contributes to the program cache key. Reuse the falloff graph;
// materialColor and materialOpacity still resolve against each drawn sprite.
const glowFragment = Fn((_inputs: unknown, builder: NodeBuilder) => {
  const radius = uv().sub(0.5).mul(2).length().clamp(0, 1);
  const skirt = radius.oneMinus().pow(3);
  const core = radius.mul(3.2).oneMinus().max(0).pow(2).mul(0.55);
  const target = builder.renderer.getRenderTarget();
  const colorSpace = target ? target.texture.colorSpace : builder.renderer.outputColorSpace;
  return workingToColorSpace(vec4(materialColor, skirt.add(core).clamp(0, 1).mul(materialOpacity)), colorSpace);
})();

/** The authored radial falloff becomes continuous instead of a sampled sprite. */
export function createNodePracticalGlow(source: THREE.SpriteMaterial): THREE.SpriteMaterial {
  const material = new SpriteNodeMaterial({
    name: "NevaPracticalGlowNodes", color: source.color, opacity: source.opacity,
    transparent: source.transparent, depthTest: source.depthTest, depthWrite: source.depthWrite,
    blending: source.blending, fog: source.fog, toneMapped: source.toneMapped,
    sizeAttenuation: source.sizeAttenuation, rotation: source.rotation
  });
  // A custom fragment preserves the glow's no-tone-map contract. The adapter's
  // default output callback applies renderer tone mapping even to this sprite.
  material.fragmentNode = glowFragment;
  return material;
}
