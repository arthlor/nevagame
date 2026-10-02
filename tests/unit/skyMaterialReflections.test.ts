import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  bindSkyMaterialReflections,
  installSkyMaterialReflections,
  prepareSkyMaterialReflections,
  unbindSkyMaterialReflections
} from "../../src/render/atmosphere/SkyMaterialReflections";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";

function material(token = "metal_iron_01"): THREE.MeshStandardMaterial {
  const surface = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  surface.userData.neva_palette_token = token;
  installSkyMaterialReflections(surface);
  return surface;
}

function draw(surface: THREE.MeshStandardMaterial, scene: THREE.Scene): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), surface);
  surface.onBeforeRender({} as THREE.WebGLRenderer, scene, new THREE.Camera(), mesh.geometry, mesh, new THREE.Group());
}

describe("scene-owned material sky reflections", () => {
  it("opts in selected palette families without changing roughness or source environments", () => {
    const scene = new THREE.Scene();
    const texture = new THREE.Texture();
    bindSkyMaterialReflections(scene, texture);
    const metal = material("metal_iron_01");
    const foliage = material("foliage_mid_01");
    const unknown = material("unregistered");
    const authored = new THREE.MeshStandardMaterial({ envMap: texture });
    authored.userData.neva_palette_token = "metal_iron_01";
    const original = authored.onBeforeRender;
    installSkyMaterialReflections(authored);
    draw(metal, scene);
    draw(foliage, scene);
    draw(unknown, scene);
    expect(metal.envMap).toBe(texture);
    expect(metal.envMapIntensity).toBe(CANONICAL_RENDER_CONFIG.atmosphere.materialReflections.familyIntensity.metal);
    expect(metal.roughness).toBe(0.8);
    expect(foliage.envMap).toBeNull();
    expect(unknown.envMap).toBeNull();
    expect(authored.onBeforeRender).toBe(original);
    unbindSkyMaterialReflections(scene);
  });

  it("isolates a shared palette material when a preview or another world draws it", () => {
    const world = new THREE.Scene();
    const otherWorld = new THREE.Scene();
    const preview = new THREE.Scene();
    const first = new THREE.Texture();
    const second = new THREE.Texture();
    bindSkyMaterialReflections(world, first);
    bindSkyMaterialReflections(otherWorld, second);
    const surface = material("metal_iron_01");
    draw(surface, world);
    expect(surface.envMap).toBe(first);
    draw(surface, preview);
    expect(surface.envMap).toBeNull();
    draw(surface, otherWorld);
    expect(surface.envMap).toBe(second);
    unbindSkyMaterialReflections(world);
    expect(surface.envMap).toBe(second);
    unbindSkyMaterialReflections(otherWorld);
    expect(surface.envMap).toBeNull();
  });

  it("primes shader warm-up and clears target references before release", () => {
    const world = new THREE.Scene();
    const texture = new THREE.Texture();
    const surface = material("metal_iron_01");
    world.add(new THREE.Mesh(new THREE.BoxGeometry(), surface));
    bindSkyMaterialReflections(world, texture);
    prepareSkyMaterialReflections(world);
    expect(surface.envMap).toBe(texture);
    const version = surface.version;
    const replacement = new THREE.Texture();
    bindSkyMaterialReflections(world, replacement);
    draw(surface, world);
    expect(surface.envMap).toBe(replacement);
    expect(surface.version).toBe(version);
    unbindSkyMaterialReflections(world);
    expect(surface.envMap).toBeNull();
    expect(surface.version).toBeGreaterThan(version);
  });

  it("preserves earlier render callbacks without installing twice", () => {
    const surface = new THREE.MeshStandardMaterial();
    surface.userData.neva_palette_token = "metal_iron_01";
    const previous = vi.fn();
    surface.onBeforeRender = previous;
    installSkyMaterialReflections(surface);
    installSkyMaterialReflections(surface);
    draw(surface, new THREE.Scene());
    expect(previous).toHaveBeenCalledTimes(1);
  });
});
