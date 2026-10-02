import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { HdrBloomStage } from "../../src/render/pipeline/HdrBloomStage";

function recordFrame(stage: HdrBloomStage, width: number, height: number) {
  const source = new THREE.WebGLRenderTarget(width, height);
  const draws: Array<{ name: string; texel: number[]; shader: string; scatter?: number; target: THREE.WebGLRenderTarget | null }> = [];
  let target: THREE.WebGLRenderTarget | null = null;
  const renderer = {
    autoClear: true,
    setRenderTarget: (next: THREE.WebGLRenderTarget) => { target = next; },
    render: (quad: THREE.Mesh) => {
      const material = quad.material as THREE.RawShaderMaterial;
      draws.push({
        name: material.name,
        texel: (material.uniforms.uSourceTexel.value as THREE.Vector2).toArray(),
        shader: material.fragmentShader,
        scatter: material.uniforms.uScatter?.value as number | undefined,
        target
      });
    }
  };
  try {
    stage.setSize(width, height);
    const result = stage.render(renderer as unknown as THREE.WebGLRenderer, source, 1);
    expect(result).toBe(stage.targets[0]!.texture);
    expect(renderer.autoClear).toBe(true);
    return draws;
  } finally { source.dispose(); }
}

describe("bounded HDR bloom spread", () => {
  it.each([[1920, 1080], [1365, 767], [1, 1]])(
    "redistributes glow at %ix%i with identical shaders, sample locations, targets and draw count",
    (width, height) => {
      const config = CANONICAL_RENDER_CONFIG.postProcessing.hdrBloom;
      const original = new HdrBloomStage({ ...config, scatter: 0.68, strength: 0.14 });
      const wider = new HdrBloomStage(config);
      try {
        const before = recordFrame(original, width, height);
        const after = recordFrame(wider, width, height);
        expect(after).toHaveLength(config.levels * 2 - 1);
        expect(wider.targets.map((target) => [target.width, target.height, target.texture.type, target.depthBuffer]))
          .toEqual(original.targets.map((target) => [target.width, target.height, target.texture.type, target.depthBuffer]));
        after.forEach((draw, index) => {
          const previous = before[index]!;
          expect(draw.name).toBe(previous.name);
          expect(draw.shader).toBe(previous.shader);
          expect(draw.texel).toEqual(previous.texel);
        });
        // A constant extracted highlight stays constant through each normalized
        // blur; reconstruct the actual additive chain's DC response from its
        // submitted scatter uniforms, then apply the final composite strength.
        const response = (draws: typeof before, strength: number) => {
          let energy = 1;
          for (const draw of draws) if (draw.scatter !== undefined) energy = 1 + energy * draw.scatter;
          return energy * strength;
        };
        expect(response(after, wider.strength)).toBeCloseTo(response(before, original.strength), 6);
        const coarseShare = (draws: typeof before, strength: number) =>
          draws.reduce((weight, draw) => weight * (draw.scatter ?? 1), strength);
        expect(coarseShare(after, wider.strength)).toBeGreaterThan(coarseShare(before, original.strength));
        // Repeated frames borrow the same targets; changing the halo does not
        // introduce a scene copy or a separately allocated wide-blur chain.
        const targets = [...wider.targets];
        recordFrame(wider, width, height);
        expect(wider.targets.every((target, index) => target === targets[index])).toBe(true);
        const disposals = targets.map((target) => vi.spyOn(target, "dispose"));
        wider.dispose();
        disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
      } finally { original.dispose(); }
    }
  );
});
