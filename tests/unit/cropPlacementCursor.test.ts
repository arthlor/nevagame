import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CropPlacementCursor } from "../../src/render/scene/CropPlacementCursor";
import type { CropPlacementResult } from "../../src/simulation/core/contracts";
import {
  STARTER_FARM_LAYOUT,
  farmLocalToWorld,
  findFarmIdAtWorld,
  findPlantableFarmAtWorld,
  isPlantableFarmSurface,
  worldToFarmLocal
} from "../../src/world/FarmLayout";
import { WorldLayout } from "../../src/world/WorldLayout";

const FARM_ID = STARTER_FARM_LAYOUT.farmId;

function placement(local: { x: number; z: number }, valid: boolean, reasonCode?: CropPlacementResult["reasonCode"]): CropPlacementResult {
  const world = farmLocalToWorld(FARM_ID, local);
  return {
    valid,
    reasonCode,
    farmId: FARM_ID,
    cropId: "crop.wheat",
    worldX: world.x,
    worldZ: world.z,
    localX: local.x,
    localZ: local.z,
    rotationRadians: 0,
    footprint: { width: 1, depth: 1 }
  };
}

function hoopVerticesOnSoil(cursor: CropPlacementCursor, world: { x: number; z: number }): void {
  const hoop = cursor.group.getObjectByName("crop_placement_hoop");
  expect(hoop).toBeInstanceOf(THREE.Mesh);
  const mesh = hoop as THREE.Mesh;
  expect(mesh.visible).toBe(true);
  const position = mesh.geometry.getAttribute("position");
  expect(mesh.geometry.drawRange.count).toBeGreaterThan(0);
  for (let index = 0; index < mesh.geometry.drawRange.count; index += 1) {
    const local = worldToFarmLocal(FARM_ID, {
      x: world.x + position.getX(index),
      z: world.z + position.getZ(index)
    });
    expect(isPlantableFarmSurface(FARM_ID, local)).toBe(true);
  }
}

describe("planting cursor", () => {
  afterEach(() => vi.restoreAllMocks());

  it("treats the yard as part of the farm and not as plantable soil", () => {
    const soil = farmLocalToWorld(FARM_ID, { x: 0, z: 0 });
    const yard = farmLocalToWorld(FARM_ID, { x: 10, z: 0 });
    expect(findPlantableFarmAtWorld(soil.x, soil.z)).toBe(FARM_ID);
    expect(findFarmIdAtWorld(yard.x, yard.z)).toBe(FARM_ID);
    expect(findPlantableFarmAtWorld(yard.x, yard.z)).toBeNull();
  });

  it("draws a closed ring only on soil and leaves the yard unmarked", () => {
    const cursor = new CropPlacementCursor();
    const soil = farmLocalToWorld(FARM_ID, { x: 0, z: 0 });
    cursor.update(placement({ x: 0, z: 0 }, true));
    expect(cursor.group.visible).toBe(true);
    expect(cursor.group.getObjectByName("crop_placement_seed")?.visible).toBe(true);
    expect(cursor.group.getObjectByName("crop_placement_cross")?.visible).toBe(false);
    hoopVerticesOnSoil(cursor, soil);

    cursor.update(placement({ x: 10, z: 0 }, false, "invalid-surface"));
    expect(cursor.group.visible).toBe(false);
    cursor.dispose();
  });

  it("stops the ring at the plot edge instead of drawing it onto the grass", () => {
    const cursor = new CropPlacementCursor();
    const local = { x: 5.8, z: 0 };
    const world = farmLocalToWorld(FARM_ID, local);
    cursor.update(placement({ x: 0, z: 0 }, true));
    cursor.update(placement(local, false, "invalid-surface"));
    expect(cursor.group.visible).toBe(true);
    expect(cursor.group.getObjectByName("crop_placement_seed")?.visible).toBe(false);
    hoopVerticesOnSoil(cursor, world);
    const hoop = cursor.group.getObjectByName("crop_placement_hoop") as THREE.Mesh;
    const position = hoop.geometry.getAttribute("position");
    let maxX = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < hoop.geometry.drawRange.count; index += 1) maxX = Math.max(maxX, position.getX(index));
    expect(maxX).toBeGreaterThan(0.05);
    expect(maxX).toBeLessThanOrEqual(0.21);
    expect(hoop.geometry.boundingBox?.max.x).toBe(maxX);
    const drawnGeometry = new THREE.BufferGeometry();
    drawnGeometry.setAttribute("position", new THREE.Float32BufferAttribute(
      Array.from(position.array).slice(0, hoop.geometry.drawRange.count * 3), 3
    ));
    drawnGeometry.computeBoundingSphere();
    expect(hoop.geometry.boundingSphere).toEqual(drawnGeometry.boundingSphere);
    drawnGeometry.dispose();

    cursor.update(placement({ x: 0, z: 0 }, false, "invalid-surface"));
    expect(cursor.group.getObjectByName("crop_placement_seed")?.visible).toBe(false);
    expect(cursor.group.getObjectByName("crop_placement_cross")?.visible).toBe(true);
    cursor.dispose();
  });

  it("skips unchanged rendering work and refreshes after hiding or moving the cursor", () => {
    const sample = vi.spyOn(WorldLayout, "terrainHeight");
    const cursor = new CropPlacementCursor();
    const result = placement({ x: 0, z: 0 }, true);
    cursor.update(result);
    const hoop = cursor.group.getObjectByName("crop_placement_hoop") as THREE.Mesh;
    const attribute = hoop.geometry.getAttribute("position") as THREE.BufferAttribute;
    const initialVersion = attribute.version;
    sample.mockClear();

    cursor.update({ ...result, footprint: { ...result.footprint } });
    expect(sample).not.toHaveBeenCalled();
    expect(attribute.version).toBe(initialVersion);

    cursor.update(null);
    expect(cursor.group.visible).toBe(false);
    cursor.update(result);
    expect(cursor.group.visible).toBe(true);
    expect(sample).toHaveBeenCalled();
    sample.mockClear();

    result.worldX += 0.05;
    cursor.update(result);
    expect(sample).toHaveBeenCalled();
    expect(cursor.group.position.x).toBe(result.worldX);
    cursor.dispose();
  });

  it("samples shared triangle corners once per moving preview and keeps their terrain height", () => {
    const sample = vi.spyOn(WorldLayout, "terrainHeight");
    const cursor = new CropPlacementCursor();
    cursor.update(placement({ x: 0, z: 0 }, true));
    sample.mockClear();
    const result = placement({ x: 0.1, z: 0.1 }, true);
    cursor.update(result);
    expect(sample.mock.calls.length).toBeGreaterThan(0);
    // A moving ring must sample its distinct vertices, not all duplicated triangle corners.
    expect(sample.mock.calls.length).toBeLessThan(250);

    const hoop = cursor.group.getObjectByName("crop_placement_hoop") as THREE.Mesh;
    const positions = hoop.geometry.getAttribute("position");
    for (let index = 0; index < hoop.geometry.drawRange.count; index += 1) {
      expect(positions.getY(index)).toBeCloseTo(WorldLayout.terrainHeight(
        result.worldX + positions.getX(index),
        result.worldZ + positions.getZ(index)
      ) + 0.07, 4);
    }
    cursor.dispose();
  });

  it("reuses buffers as cues change and disposes them only when the cursor is released", () => {
    const cursor = new CropPlacementCursor();
    const objects = cursor.group.children.filter((object): object is THREE.Mesh | THREE.Line =>
      object instanceof THREE.Mesh || object instanceof THREE.Line
    );
    const buffers = objects.map((object) => ({
      object,
      geometry: object.geometry,
      position: object.geometry.getAttribute("position"),
      dispose: vi.spyOn(object.geometry, "dispose")
    }));
    const hoop = cursor.group.getObjectByName("crop_placement_hoop") as THREE.Mesh;
    const nest = cursor.group.getObjectByName("crop_placement_nest") as THREE.Mesh;
    const cross = cursor.group.getObjectByName("crop_placement_cross") as THREE.Mesh;
    const seed = cursor.group.getObjectByName("crop_placement_seed") as THREE.Mesh;
    const ticks = cursor.group.getObjectByName("crop_placement_ticks") as THREE.Line;
    cursor.update(placement({ x: 0, z: 0 }, true));
    const fullCount = hoop.geometry.drawRange.count;

    cursor.update(placement({ x: 0, z: 0 }, false, "too-far"));
    expect(hoop.geometry.drawRange.count).toBe(fullCount / 2);
    expect([seed.visible, ticks.visible, cross.visible, nest.visible]).toEqual([false, false, false, false]);
    cursor.update(placement({ x: 0, z: 0 }, false, "overlaps-crop"));
    expect(nest.visible).toBe(true);
    expect(nest.geometry.drawRange.count).toBeGreaterThan(0);
    expect(cross.visible).toBe(false);
    cursor.update(placement({ x: 0, z: 0 }, false, "invalid-surface"));
    expect(cross.visible).toBe(true);
    expect(cross.geometry.drawRange.count).toBe(12);
    expect(nest.visible).toBe(false);
    cursor.update(placement({ x: 5.8, z: 0 }, false, "invalid-surface"));
    expect(hoop.geometry.drawRange.count).toBeLessThan(fullCount);
    cursor.update(placement({ x: 0, z: 0 }, true));
    expect(hoop.geometry.drawRange.count).toBe(fullCount);
    expect([seed.visible, ticks.visible, cross.visible, nest.visible]).toEqual([true, true, false, false]);

    for (const buffer of buffers) {
      expect(buffer.object.geometry).toBe(buffer.geometry);
      expect(buffer.object.geometry.getAttribute("position")).toBe(buffer.position);
      expect(buffer.dispose).not.toHaveBeenCalled();
    }
    cursor.dispose();
    for (const buffer of buffers) expect(buffer.dispose).toHaveBeenCalledTimes(1);
  });

  it("refreshes the footprint when the same input object changes", () => {
    const cursor = new CropPlacementCursor();
    const result = placement({ x: 0, z: 0 }, true);
    cursor.update(result);
    result.footprint.width = 2;
    cursor.update(result);
    const hoop = cursor.group.getObjectByName("crop_placement_hoop") as THREE.Mesh;
    const positions = hoop.geometry.getAttribute("position");
    let radius = 0;
    for (let index = 0; index < hoop.geometry.drawRange.count; index += 1) {
      radius = Math.max(radius, Math.hypot(positions.getX(index), positions.getZ(index)));
    }
    expect(radius).toBeCloseTo(1, 6);
    cursor.dispose();
  });
});
