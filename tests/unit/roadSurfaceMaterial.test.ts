import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";

import { RoadSurfaceMaterial } from "../../src/render/materials/RoadSurfaceMaterial";

describe("RoadSurfaceMaterial", () => {
  const materials: RoadSurfaceMaterial[] = [];

  afterEach(() => {
    for (const road of materials.splice(0)) road.dispose();
  });

  it("adds bounded worked-ground palette cells without displacing the shared surface", () => {
    const road = new RoadSurfaceMaterial();
    materials.push(road);
    const shader = {
      uniforms: { ...THREE.ShaderLib.standard.uniforms },
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };
    const compile = road.material.onBeforeCompile as unknown as (source: typeof shader) => void;
    compile(shader);

    expect(shader.vertexShader).toContain("vRoadWorldPosition");
    expect(shader.vertexShader).toContain("vRoadOpacity");
    expect(shader.fragmentShader).toContain("nevaGroundPolygonCellSignal");
    expect(shader.fragmentShader).toContain("nevaGroundCellJitter");
    expect(shader.fragmentShader).toContain("roadPolygonVariationStrength");
    expect(shader.fragmentShader).toContain("if (keepDirt < 0.5) discard;");
    expect(shader.fragmentShader).not.toContain("displacement");
    expect(road.material.flatShading).toBe(false);
    expect(road.material.transparent).toBe(true);
    expect(road.material.depthWrite).toBe(false);
    expect(road.material.customProgramCacheKey()).toBe("neva-road-surface-r174-v2");
  });

  it("fails loudly when the installed standard-shader contract drifts", () => {
    const road = new RoadSurfaceMaterial();
    materials.push(road);
    const shader = {
      uniforms: {},
      vertexShader: "void main() { #include <common> }",
      fragmentShader: "void main() { #include <common> #include <color_fragment> }"
    };
    const compile = road.material.onBeforeCompile as unknown as (source: typeof shader) => void;
    expect(() => compile(shader)).toThrow(/shader chunk drift/);
  });
});
