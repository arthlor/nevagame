import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { FarmPlantingGuide } from "../../src/render/scene/FarmPlantingGuide";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { PLAYER_HOMESTEAD_LAYOUT, isPlantableFarmSurface, worldToFarmLocal } from "../../src/world/FarmLayout";
import { WorldLayout } from "../../src/world/WorldLayout";

function commons() {
  // This suite checks presentation buffers; real rendered/Rapier support is
  // exercised by the entrance migration and browser traversal checks.
  vi.spyOn(WorldLayout, "traversalSurfaceHeight").mockImplementation((x, z) => WorldLayout.terrainHeight(x, z));
  const sim = new Simulation();
  Object.assign(sim.state.player, { x: 77, z: -78, y: WorldLayout.traversalSurfaceHeight(77, -78) + 0.5 });
  InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [{ itemId: "seed.wheat", quantity: 2 }]);
  return sim;
}

describe("Seed Belt ground guide", () => {
  afterEach(() => vi.restoreAllMocks());

  it("outlines actual soil, includes crop spacing, and does no ground work while closed", () => {
    const sim = commons();
    const height = vi.spyOn(WorldLayout, "terrainHeight").mockReturnValue(4);
    const guide = new FarmPlantingGuide();
    guide.update(sim.state, false);
    expect(guide.group.children).toHaveLength(0);
    expect(height).not.toHaveBeenCalled();
    guide.update(sim.state, true);
    expect(guide.group.children).toHaveLength(1);
    const fill = guide.group.getObjectByName("planting_soil_fill") as THREE.Mesh;
    const positions = fill.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      expect(isPlantableFarmSurface(PLAYER_HOMESTEAD_LAYOUT.farmId, worldToFarmLocal(PLAYER_HOMESTEAD_LAYOUT.farmId, {
        x: positions.getX(index), z: positions.getZ(index)
      }))).toBe(true);
      expect(positions.getY(index)).toBeCloseTo(4.09, 5);
    }
    const occupied = guide.group.getObjectByName("planting_crop_spacing") as THREE.Mesh;
    expect(occupied.geometry.getAttribute("position").count).toBeGreaterThan(0);
    guide.dispose();
  });

  it("reuses buffers through weather, growth and reopening, then refreshes after a real planting", () => {
    const sim = commons();
    const guide = new FarmPlantingGuide();
    guide.update(sim.state, true);
    const occupied = guide.group.getObjectByName("planting_crop_spacing") as THREE.Mesh;
    const original = occupied.geometry;
    const dispose = vi.spyOn(original, "dispose");
    const height = vi.spyOn(WorldLayout, "terrainHeight");
    sim.state.weather.type = "storm";
    for (let frame = 0; frame < 20; frame++) guide.update(sim.state, true);
    guide.update(sim.state, false);
    guide.update(sim.state, true);
    expect(occupied.geometry).toBe(original);
    expect(height).not.toHaveBeenCalled();
    expect(sim.plantCrop(PLAYER_HOMESTEAD_LAYOUT.farmId, "crop.wheat", 77, -78).success).toBe(true);
    guide.update(sim.state, true);
    expect(occupied.geometry).not.toBe(original);
    expect(dispose).toHaveBeenCalledTimes(1);
    const expectedVertices = (PLAYER_HOMESTEAD_LAYOUT.visualCropDecorations!.length + 1) * (32 + 4) * 6;
    expect(occupied.geometry.getAttribute("position").count).toBe(expectedVertices);
    const definition = ContentRegistry.crops.get("crop.wheat")!;
    const planted = occupied.geometry.getAttribute("position");
    expect(Math.abs(planted.getX(0) - 77)).toBeLessThanOrEqual(definition.footprint.width / 2 + 0.04);
    guide.dispose();
  });

  it("hides distant farms and releases owned geometry and materials", () => {
    const sim = commons();
    const guide = new FarmPlantingGuide();
    guide.update(sim.state, true);
    const farm = guide.group.children[0]!;
    const mesh = farm.children[0] as THREE.Mesh;
    const geometry = vi.spyOn(mesh.geometry, "dispose");
    const material = vi.spyOn(mesh.material as THREE.Material, "dispose");
    Object.assign(sim.state.player, { x: 0, z: 0 });
    guide.update(sim.state, true);
    expect(farm.visible).toBe(false);
    guide.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });
});
