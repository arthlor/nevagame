import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  FootfallVfxPool,
  footfallChannelForSurface,
  type FootfallSurface
} from "../../src/render/effects/FootfallVfxPool";

describe("footfallChannelForSurface", () => {
  it("splashes on water and flicks leaves on grass", () => {
    expect(footfallChannelForSurface("water")).toBe("water");
    expect(footfallChannelForSurface("grass")).toBe("leaf");
  });

  it("kicks dust on every dry footed surface", () => {
    for (const surface of ["dirt", "wood", "dock", "sand"] as const) {
      expect(footfallChannelForSurface(surface)).toBe("dust");
    }
  });

  it("keeps a channel for every classified surface", () => {
    const surfaces: FootfallSurface[] = ["dirt", "wood", "dock", "grass", "sand", "water"];
    for (const surface of surfaces) {
      expect(["dust", "leaf", "water"]).toContain(footfallChannelForSurface(surface));
    }
  });
});

function meshCounts(pool: FootfallVfxPool): number[] {
  return pool.group.children
    .filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)
    .map((mesh) => mesh.count);
}

describe("FootfallVfxPool", () => {
  it("spawns, renders and expires pooled particles", () => {
    const pool = new FootfallVfxPool();
    expect(pool.group.name).toBe("pooled_footfall_vfx");

    pool.spawn("dirt", { x: 0, y: 0, z: 0 }, 0);
    pool.spawn("grass", { x: 1, y: 0, z: 1 }, 0);
    pool.spawn("water", { x: 2, y: 0, z: 2 }, 0);
    pool.update(0.1);
    expect(meshCounts(pool).some((count) => count > 0)).toBe(true);

    pool.update(10);
    expect(meshCounts(pool).every((count) => count === 0)).toBe(true);

    pool.dispose();
  });

  it("still releases a minimal burst under reduced motion", () => {
    const pool = new FootfallVfxPool();
    pool.spawn("dirt", { x: 0, y: 0, z: 0 }, 0, { reducedMotion: true });
    pool.update(0.05);
    expect(meshCounts(pool).reduce((total, count) => total + count, 0)).toBeGreaterThan(0);
    pool.dispose();
  });
});
