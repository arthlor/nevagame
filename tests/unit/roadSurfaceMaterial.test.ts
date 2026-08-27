import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";

import { RoadSurfaceMaterial } from "../../src/render/materials/RoadSurfaceMaterial";

describe("RoadSurfaceMaterial", () => {
  const materials: RoadSurfaceMaterial[] = [];

  afterEach(() => {
    for (const road of materials.splice(0)) road.dispose();
  });

  it("adds restrained worked-ground cells with a narrow depth-stable coverage edge", () => {
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
    expect(shader.fragmentShader).toContain("nevaGroundPolygonCell");
    expect(shader.fragmentShader).toContain("nevaGroundPolygonCellSignal");
    expect(shader.fragmentShader).toContain("nevaGroundCellJitter");
    expect(shader.fragmentShader).toContain("roadPolygonVariationStrength");
    expect(shader.fragmentShader).toContain("roadEdgeSignal = nevaGroundPolygonCellSignal");
    expect(shader.fragmentShader).toContain("roadCoverage = smoothstep(");
    expect(shader.fragmentShader).toContain("roadEdgeFadeStart, roadEdgeFadeFull");
    expect(shader.fragmentShader).toContain("roadValueBand = step(0.34, roadPolygonSignal)");
    expect(shader.fragmentShader).toContain("diffuseColor.a = roadCoverage;");
    expect(shader.fragmentShader).not.toContain("if (roadCoverage <= 0.005) discard;");
    expect(shader.fragmentShader).not.toContain("keepDirt = step");
    expect(shader.uniforms.roadEdgeCellScale.value).toBe(0.92);
    expect(shader.uniforms.roadPolygonCellScale.value).toBe(1.35);
    expect(shader.uniforms.roadPolygonVariationStrength.value).toBe(0.16);
    expect(shader.uniforms.roadEdgeFadeStart.value).toBe(0.22);
    expect(shader.uniforms.roadEdgeFadeFull.value).toBe(0.42);
    expect(shader.fragmentShader).not.toContain("displacement");
    expect(road.material.flatShading).toBe(false);
    expect(road.material.transparent).toBe(false);
    expect(road.material.depthWrite).toBe(true);
    expect(road.material.alphaTest).toBe(0.5);
    expect(road.material.alphaToCoverage).toBe(true);
    expect(road.material.customProgramCacheKey()).toBe("neva-road-surface-r174-v11");
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
