import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  attachPracticalGlowNodes,
  createNodePracticalGlow
} from "../../src/render/materials/nodes/PracticalGlowNodes";

describe("bounded practical-glow TSL material", () => {
  it("keeps depth occlusion, additive blending, live opacity and the output contract", () => {
    const source = new THREE.SpriteMaterial({
      color: 0xa47b43, opacity: 0.23, depthTest: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, toneMapped: false, sizeAttenuation: true
    });
    const material = createNodePracticalGlow(source);
    expect(material).toMatchObject({
      type: "SpriteNodeMaterial", opacity: 0.23, depthTest: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, toneMapped: false, sizeAttenuation: true
    });
    expect(material.color.equals(source.color)).toBe(true);
    expect((material as unknown as { fragmentNode: unknown }).fragmentNode).toBeTruthy();
    expect(material.map).toBeNull();
    material.opacity = 0;
    expect(source.opacity).toBe(0.23);
    material.dispose();
    source.dispose();
  });

  it("attaches through the public adapter API and rejects lit nodes outside this pilot", () => {
    const setNodesHandler = vi.fn();
    attachPracticalGlowNodes({ setNodesHandler } as unknown as THREE.WebGLRenderer);
    const handler = setNodesHandler.mock.calls[0][0];
    expect(() => handler.setObject(new THREE.Mesh(), new MeshStandardNodeMaterial())).toThrow("only supports unlit");
  });

  it("reuses shader programs while keeping each sprite's live color and opacity independent", () => {
    const sources = [
      new THREE.SpriteMaterial({ color: 0xa47b43, opacity: 0.23 }),
      new THREE.SpriteMaterial({ color: 0x638acf, opacity: 0.65 })
    ];
    const materials = sources.map(createNodePracticalGlow);
    expect(materials[0].customProgramCacheKey()).toBe(materials[1].customProgramCacheKey());
    materials[0].color.setHex(0xf3b46f);
    materials[0].opacity = 0;
    expect(materials[1].color.equals(sources[1].color)).toBe(true);
    expect(materials[1].opacity).toBe(0.65);
    expect(sources[0].color.getHex()).toBe(0xa47b43);
    expect(sources[0].opacity).toBe(0.23);
    for (const material of [...materials, ...sources]) material.dispose();
  });
});
