import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import {
  ROAD_SURFACE_PROGRAM_CACHE_KEY,
  RoadSurfaceMaterial
} from "../../src/render/materials/RoadSurfaceMaterial";
import { ROAD_WHEEL_GAUGE_METERS } from "../../src/world/RoadClasses";
import { POLYHAVEN_SURFACE_TEXTURES } from "../../src/render/materials/ExternalSurfaceTextures";
import { GROUND_STONES_GLSL } from "../../src/render/materials/GroundStoneShader";

describe("RoadSurfaceMaterial", () => {
  const materials: RoadSurfaceMaterial[] = [];

  afterEach(() => {
    for (const road of materials.splice(0)) road.dispose();
  });

  it("draws wheel tracks, lane grass and foot lines from each road's own frame", () => {
    const road = new RoadSurfaceMaterial();
    materials.push(road);
    const shader = {
      uniforms: { ...THREE.ShaderLib.standard.uniforms },
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };
    const compile = road.material.onBeforeCompile as unknown as (source: typeof shader) => void;
    compile(shader);

    // The exact across/along frame replaces per-vertex wear.
    expect(shader.vertexShader).toContain("attribute vec2 roadFrame");
    expect(shader.vertexShader).toContain("attribute vec3 roadContext");
    expect(shader.vertexShader).toContain("vRoadFrame = roadFrame");
    expect(shader.vertexShader).not.toContain("roadProfile");
    expect(shader.fragmentShader).toContain("fwidth(vRoadFrame.x)");
    // Both tracks sit at the carriage's gauge and drift together.
    expect(shader.fragmentShader).toContain("abs(abs(roadAcross) - roadWheelGauge * 0.5)");
    expect(shader.fragmentShader).toContain("float roadAcross = vRoadFrame.x - roadDrift;");
    expect(shader.uniforms.roadWheelGauge.value).toBe(ROAD_WHEEL_GAUGE_METERS);
    expect(shader.uniforms.roadTrackHalfWidth.value).toBe(CANONICAL_RENDER_CONFIG.roadSurface.wheelTracks.halfWidthMeters);
    // Junctions and shared surfaces wear the tracks out instead of crossing them.
    expect(shader.fragmentShader).toContain("roadWheelUse = (roadArterial + roadLane * 0.85) * (1.0 - roadJunction)");
    expect(shader.fragmentShader).toContain("roadMedianGrass * roadLaneMedianGrassMix");
    expect(shader.fragmentShader).toContain("roadFootLine * roadFootLineColorMix");
    expect(shader.fragmentShader).toContain("roadTrack * roadTrackColorMix");
    // The same tracks drive roughness, lighting-only relief and rain puddles.
    expect(shader.fragmentShader).toContain("roadTrackWear * roadWearRoughnessReduction");
    expect(shader.fragmentShader).toContain("roadTrackTrough * roadTrackReliefStrength");
    expect(shader.fragmentShader).toContain("mix(roughnessFactor, roadPuddleRoughness, roadPuddle * roadPuddleStrength)");
    expect(shader.fragmentShader).not.toContain("displacement");
    // Broad local palette is packed in RGBA; the material needs no terrain
    // weight attributes and only one supporting-map sample at one scale.
    expect(shader.vertexShader).not.toContain("surfaceWeights");
    expect(shader.vertexShader).not.toContain("surfaceCauses");
    expect(shader.fragmentShader).not.toContain("nevaSurfaceFacetNormal");
    expect(shader.fragmentShader).toContain(
      "texture2D(roadSourceColorTexture, roadSourceUv, roadSourceLodBias)"
    );
    expect(shader.fragmentShader.match(/texture2D\(roadSourceColorTexture/g)).toHaveLength(1);
    expect(shader.fragmentShader).not.toContain("roadSourceRoughnessTexture");
    // Brook gravel is embedded in the existing surface: no new map, geometry
    // displacement or alpha holes, and fine detail fades below pixel scale.
    expect(shader.fragmentShader).toContain(GROUND_STONES_GLSL);
    expect(shader.fragmentShader).toContain("smoothstep(0.35, 1.2, roadStoneFootprint)");
    expect(shader.fragmentShader).toContain("roadStoneMask * roadStoneColorMix");
    expect(shader.fragmentShader).toContain("roadStoneNormalStrength * roadStoneMask");
    expect(shader.uniforms.roadStoneCellScale.value).toBe(CANONICAL_RENDER_CONFIG.roadSurface.stones.cellScaleMeters);
    expect(shader.uniforms.roadStoneCoreDensity.value).toBeLessThan(shader.uniforms.roadStoneShoulderDensity.value as number);
    expect(shader.uniforms.roadSourceSampleScale.value).toBe(CANONICAL_RENDER_CONFIG.roadSurface.externalTexture.sampleScaleMeters);
    expect(shader.fragmentShader).toContain("fwidth(roadEdgeField)");
    expect(shader.fragmentShader).toContain("roadEdgeBand = 1.0 - smoothstep(roadEdgeFadeFull, 1.0, vRoadOpacity)");
    expect(shader.fragmentShader).toContain("roadCoverage + (roadDither - 0.5) * 0.12");
    expect(shader.fragmentShader).toContain("diffuseColor.a = roadCoverage;");
    expect(shader.fragmentShader).not.toContain("diffuseColor.a *= 1.0 - smoothstep(0.25, 0.65, coastalRoadWeight)");
    expect(shader.fragmentShader).toContain("float shoreCrownDissolve");
    expect(shader.uniforms.roadShoreBlendInland.value).toBe(CANONICAL_RENDER_CONFIG.roadSurface.shoreBlendInlandMeters);
    expect(shader.uniforms.roadShoreBlendCrown.value).toBeLessThan(shader.uniforms.roadShoreBlendInland.value);
    expect(shader.uniforms.roadEdgeCellScale.value).toBe(CANONICAL_RENDER_CONFIG.roadSurface.polygonEdgeCellScaleMeters);
    expect(shader.uniforms.roadWetness.value).toBe(0);
    expect(road.material.flatShading).toBe(false);
    expect(road.material.transparent).toBe(false);
    expect(road.material.depthWrite).toBe(true);
    expect(road.material.alphaTest).toBe(0.5);
    expect(road.material.alphaToCoverage).toBe(true);
    expect(road.material.customProgramCacheKey()).toBe(`${ROAD_SURFACE_PROGRAM_CACHE_KEY}:world-atmosphere-v1`);
    road.setWetness(2);
    expect(road.wetness).toBe(1);
    road.setWetness(-1);
    expect(road.wetness).toBe(0);
    road.setWetness(Number.NaN);
    expect(road.wetness).toBe(0);
  });

  it("loads the single supporting map once and disposes its replacement", async () => {
    const road = new RoadSurfaceMaterial();
    materials.push(road);
    const texture = new THREE.Texture<HTMLImageElement>();
    const dispose = vi.spyOn(texture, "dispose");
    const loader = { loadAsync: vi.fn(async () => texture) };
    const first = road.loadExternalTextures(loader);
    expect(road.loadExternalTextures(loader)).toBe(first);
    await first;
    expect(loader.loadAsync).toHaveBeenCalledExactlyOnceWith(POLYHAVEN_SURFACE_TEXTURES.roadColor.url);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    road.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("retains its palette fallback when the supporting map is unavailable", async () => {
    const road = new RoadSurfaceMaterial();
    materials.push(road);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(road.loadExternalTextures({ loadAsync: async () => { throw new Error("unavailable"); } })).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledOnce();
      expect(road.material.vertexColors).toBe(true);
      expect(road.material.transparent).toBe(false);
    } finally {
      log.mockRestore();
    }
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
