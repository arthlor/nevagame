import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  ROAD_SURFACE_PROGRAM_CACHE_KEY,
  RoadSurfaceMaterial
} from "../../src/render/materials/RoadSurfaceMaterial";

describe("RoadSurfaceMaterial", () => {
  const materials: RoadSurfaceMaterial[] = [];

  afterEach(() => {
    for (const road of materials.splice(0)) road.dispose();
  });

  it("adds compacted worked-ground sampling with a narrow depth-stable coverage edge", () => {
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
    expect(shader.fragmentShader).toContain("nevaRoadWorldUv");
    expect(shader.fragmentShader).toContain("roadPolygonVariationStrength");
    expect(shader.fragmentShader).toContain("roadPolygonFacetLightingStrength");
    expect(shader.fragmentShader).toContain(
      "texture2D(roadSourceColorTexture, roadFineUv, roadSourceLodBias)"
    );
    expect(shader.fragmentShader).toContain(
      "texture2D(roadSourceColorTexture, roadMesoUv, roadSourceLodBias + 0.45)"
    );
    expect(shader.fragmentShader).toContain("roadSourceLuma");
    expect(shader.fragmentShader).toContain(
      "texture2D(roadSourceRoughnessTexture, roadFineUv, roadSourceLodBias)"
    );
    expect(shader.fragmentShader).toContain("roadExternalColorStrength");
    expect(shader.fragmentShader).toContain("roadExternalRoughnessStrength");
    expect(shader.fragmentShader).toContain("roadShoulderGrassColor");
    expect(shader.fragmentShader).toContain("roadEdgeSignal = nevaGroundPolygonCellSignal");
    expect(shader.fragmentShader).toContain("roadEdgeDistance = nevaGroundPolygonCellEdge");
    expect(shader.fragmentShader).toContain("roadEdgeBand = 1.0 - smoothstep(roadEdgeFadeFull, 1.0, vRoadOpacity)");
    expect(shader.fragmentShader).toContain("roadPolygonJaggedStrength * roadEdgeBand");
    expect(shader.fragmentShader).toContain("roadCoverage = smoothstep(");
    expect(shader.fragmentShader).toContain("roadDither = nevaGroundCellJitter(");
    expect(shader.fragmentShader).toContain("roadCoverage + (roadDither - 0.5) * 0.3");
    expect(shader.fragmentShader).toContain("roadCoverage * roadExternalColorStrength");
    expect(shader.fragmentShader).toContain("roadEdgeFadeStart, roadEdgeFadeFull");
    expect(shader.fragmentShader).toContain("smoothstep(0.2, 0.84, roadPolygonSignal)");
    expect(shader.fragmentShader).toContain("roadWearSignal = clamp(");
    expect(shader.fragmentShader).toContain("mix(0.22, 0.88, smoothstep(0.1, 0.9");
    expect(shader.fragmentShader).toContain("roadCoreMix = smoothstep(0.52, 0.88, vRoadOpacity)");
    expect(shader.fragmentShader).not.toContain("roadValueBand = step");
    expect(shader.fragmentShader).toContain("diffuseColor.a = roadCoverage;");
    expect(shader.fragmentShader).not.toContain("if (roadCoverage <= 0.005) discard;");
    expect(shader.fragmentShader).not.toContain("keepDirt = step");
    expect(shader.uniforms.roadEdgeCellScale.value).toBe(1.2);
    expect(shader.uniforms.roadPolygonCellScale.value).toBe(1.05);
    expect(shader.uniforms.roadPolygonVariationStrength.value).toBe(0.28);
    expect(shader.uniforms.roadPolygonFacetLightingStrength.value).toBe(0.048);
    expect(shader.uniforms.roadEdgeFadeStart.value).toBe(0.16);
    expect(shader.uniforms.roadEdgeFadeFull.value).toBe(0.72);
    expect(shader.uniforms.roadSourceSampleScale.value).toBe(3.2);
    expect(shader.uniforms.roadSourceMesoSampleScale.value).toBe(11);
    expect(shader.uniforms.roadSourceRotation.value).toBe(0.37);
    expect(shader.uniforms.roadSourceLodBias.value).toBe(0.2);
    expect(shader.uniforms.roadExternalColorStrength.value).toBe(1);
    expect(shader.uniforms.roadExternalRoughnessStrength.value).toBe(1);
    expect(shader.fragmentShader).not.toContain("displacement");
    expect(road.material.flatShading).toBe(false);
    expect(road.material.transparent).toBe(false);
    expect(road.material.depthWrite).toBe(true);
    expect(road.material.alphaTest).toBe(0.5);
    expect(road.material.alphaToCoverage).toBe(true);
    expect(road.material.customProgramCacheKey()).toBe(ROAD_SURFACE_PROGRAM_CACHE_KEY);
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
