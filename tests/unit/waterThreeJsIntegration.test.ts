import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { FacetedWater } from "../../src/render/water/FacetedWater";

describe("WaterThreeJS adaptation linkage", () => {
  it("owns SSR/SSS/boat-foam strengths in VisualRenderConfig water optics", () => {
    const optics = CANONICAL_RENDER_CONFIG.waterSurface.optics;
    expect(optics.ssrStrength).toBeGreaterThan(0);
    expect(optics.ssrStrength).toBeLessThanOrEqual(1);
    expect(optics.sssStrength).toBeGreaterThanOrEqual(0);
    expect(optics.sssStrength).toBeLessThan(1);
    expect(optics.boatFoamStrength).toBeGreaterThan(0);
    expect(optics.boatFoamStrength).toBeLessThanOrEqual(1);
  });

  it("shares SSR capture uniforms instead of shadowing them per material", () => {
    const water = new FacetedWater({ width: 20, depth: 20, segmentsX: 4, segmentsZ: 4 });
    try {
      const uniforms = water.mesh.material.uniforms;
      expect(uniforms.uOpticsProjection).toBe(water.coastalUniforms.uOpticsProjection);
      expect(uniforms.uCameraNear).toBe(water.coastalUniforms.uCameraNear);
      expect(uniforms.uCameraFar).toBe(water.coastalUniforms.uCameraFar);
      expect(uniforms.uSsrEnabled).toBe(water.coastalUniforms.uSsrEnabled);
      expect(water.nearPatch.mesh.material.uniforms.uOpticsProjection).toBe(
        water.coastalUniforms.uOpticsProjection,
      );
    } finally {
      water.dispose();
    }
  });

  it("populates hull state on both water surfaces", () => {
    const water = new FacetedWater({ width: 20, depth: 20, segmentsX: 4, segmentsZ: 4 });
    try {
      water.setFloatingBodies([
        { x: 10, z: 20, radius: 1.4, strength: 0.3, vx: 1.2, vz: 0.5 },
      ]);
      for (const material of [water.mesh.material, water.nearPatch.mesh.material]) {
        expect(material.uniforms.uBodyCount.value).toBe(1);
        const b = material.uniforms.uBodies.value[0] as THREE.Vector4;
        expect([b.x, b.y, b.z, b.w]).toEqual([10, 20, 1.4, 0.3]);
        const v = material.uniforms.uBodyVel.value[0] as THREE.Vector2;
        expect([v.x, v.y]).toEqual([1.2, 0.5]);
      }
    } finally {
      water.dispose();
    }
  });

  it("updates shared SSR projection from the camera and gates SSR by tier", () => {
    const water = new FacetedWater({ width: 20, depth: 20, segmentsX: 4, segmentsZ: 4 });
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 500);
    camera.updateProjectionMatrix();
    try {
      water.updateCamera(camera);
      expect(
        (water.coastalUniforms.uOpticsProjection.value as THREE.Matrix4).elements,
      ).toEqual(camera.projectionMatrix.elements);
      expect(water.coastalUniforms.uCameraNear.value).toBe(0.5);
      expect(water.coastalUniforms.uCameraFar.value).toBe(500);

      water.setQuality("low");
      expect(water.coastalUniforms.uSsrEnabled.value).toBe(0);
      water.setQuality("medium");
      expect(water.coastalUniforms.uSsrEnabled.value).toBe(0);
      water.setQuality("high");
      expect(water.coastalUniforms.uSsrEnabled.value).toBe(1);
    } finally {
      water.dispose();
    }
  });

  it.each(["coarse", "near"] as const)("compares SSR depths in view space on the %s surface", (surface) => {
    const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4 });
    try {
      const shader = surface === "coarse"
        ? water.mesh.material.fragmentShader
        : water.nearPatch.mesh.material.fragmentShader;
      expect(shader).toContain("vec3 viewPos = (viewMat * vec4(worldPos, 1.0)).xyz;");
      expect(shader).toContain("vec3 viewReflect = normalize((viewMat * vec4(reflectDir, 0.0)).xyz);");
      expect(shader).toContain("vec3 p = viewPos + viewReflect * (stepLen * float(i));");
      expect(shader).toContain("vec4 clip = projMat * vec4(p, 1.0);");
      expect(shader).toContain("float rayEye = -p.z;");
      expect(shader).toContain("float diff = rayEye - sceneEye;");
      expect(shader).not.toContain("viewMat * vec4(p, 1.0)");
    } finally {
      water.dispose();
    }
  });

  it("keeps existing contracts while adding the adapted response", () => {
    const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4 });
    try {
      const shader = water.mesh.material.fragmentShader;
      // Preserved contracts.
      expect(shader).toContain("nevaOpticsField(worldPosition.xz)");
      expect(shader).toContain("exp(-uWaterAbsorption");
      expect(shader).toContain("pow(1.0 - ndv, 5.0)");
      expect(shader).toContain("nevaCoastalWash(worldPosition.xz, field.b)");
      expect(shader).toContain("baselineElevation = worldPosition.y - waveHeight");
      // Adapted WaterThreeJS response.
      expect(shader).toContain("oceanContactEnergy");
      expect(shader).toContain("oceanRaymarchSSR");
      expect(shader).toContain("oceanFbm");
      expect(shader).not.toContain("oceanContactFoam(");
      // Refined base still owns the headwater reach; no extra ribbon mesh.
      expect(shader).toContain("!nevaHeadwaterOwnsSurface(vWorldPosition.xz)");
      expect(water.nearPatch.mesh.material.fragmentShader).toContain(
        "nevaHeadwaterOwnsSurface(vWorldPosition.xz)",
      );
    } finally {
      water.dispose();
    }
  });
});
