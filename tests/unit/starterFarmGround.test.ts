import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStarterFarmGround } from "../../src/render/scene/StarterFarmGround";
import { PLAYER_HOMESTEAD_LAYOUT, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("continuous cultivated farm ground", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([STARTER_FARM_LAYOUT, PLAYER_HOMESTEAD_LAYOUT])("has one connected soil surface without detached shoulders on $farmId", (layout) => {
    vi.spyOn(WorldLayout, "terrainSurfaceSample").mockReturnValue({
      weights: { grass: 0, meadow: 0, drySoil: 1, dampSoil: 0, path: 0, shoulder: 0, beach: 0, riverbed: 0, cliff: 0, underwater: 0 },
      farmInfluence: 1, drainage: null
    } as unknown as ReturnType<typeof WorldLayout.terrainSurfaceSample>);
    const ground = buildStarterFarmGround({ origin: layout.origin,
      plantableArea: (layout.visualAreas ?? layout.plantableAreas)[0]!, heightAt: () => 3 });
    const bed = ground.children[0] as THREE.Mesh;
    const positions = bed.geometry.getAttribute("position");
    const links = new Map<string, Set<string>>();
    const key = (index: number) => `${positions.getX(index)}:${positions.getZ(index)}`;
    for (let triangle = 0; triangle < positions.count; triangle += 3) {
      const keys = [key(triangle), key(triangle + 1), key(triangle + 2)];
      for (const point of keys) {
        if (!links.has(point)) links.set(point, new Set());
        for (const other of keys) links.get(point)!.add(other);
      }
    }
    const visited = new Set<string>();
    const pending = [links.keys().next().value!];
    while (pending.length) {
      const point = pending.pop()!;
      if (visited.has(point)) continue;
      visited.add(point);
      pending.push(...links.get(point)!);
    }
    expect(visited.size).toBe(links.size);
    // A raised rectangular overlay would create a second height/color layer.
    for (let index = 0; index < positions.count; index++) {
      expect(positions.getY(index)).toBeGreaterThan(3.017);
      expect(positions.getY(index)).toBeLessThan(3.0391);
    }
    ground.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  });
});
