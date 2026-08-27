import { describe, expect, it } from "vitest";
import { ASSET_BY_ID } from "../../src/render/assets/AssetCatalog";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog.generated";
import {
  FARMHOUSE_INTERIOR_BOUNDS,
  FARMHOUSE_INTERIOR_DOOR,
  FARMHOUSE_INTERIOR_ORIGIN,
  FARMHOUSE_INTERIOR_PROPS,
  FARMHOUSE_OUTSIDE_DOOR,
  isInsideFarmhouseInterior
} from "../../src/world/FarmhouseInterior";
import { WorldLayout } from "../../src/world/WorldLayout";
import { collisionPrimitivesForAsset } from "../../src/physics/CollisionCatalogAdapter";

describe("Farmhouse Interior System", () => {
  it("defines consistent interior bounds, origin, and containment helpers", () => {
    expect(FARMHOUSE_INTERIOR_BOUNDS.minX).toBeLessThan(FARMHOUSE_INTERIOR_ORIGIN.x);
    expect(FARMHOUSE_INTERIOR_BOUNDS.maxX).toBeGreaterThan(FARMHOUSE_INTERIOR_ORIGIN.x);
    expect(FARMHOUSE_INTERIOR_BOUNDS.minZ).toBeLessThan(FARMHOUSE_INTERIOR_ORIGIN.z);
    expect(FARMHOUSE_INTERIOR_BOUNDS.maxZ).toBeGreaterThan(FARMHOUSE_INTERIOR_ORIGIN.z);

    expect(isInsideFarmhouseInterior(FARMHOUSE_INTERIOR_ORIGIN.x, FARMHOUSE_INTERIOR_ORIGIN.z)).toBe(true);
    expect(WorldLayout.isInterior(FARMHOUSE_INTERIOR_ORIGIN.x, FARMHOUSE_INTERIOR_ORIGIN.z)).toBe(true);

    // Outside starter farm origin should not be interior
    expect(isInsideFarmhouseInterior(8, 0)).toBe(false);
    expect(WorldLayout.isInterior(8, 0)).toBe(false);
  });

  it("places doorway anchors with valid interaction radiuses and safe spawn offsets", () => {
    // Outside door on porch
    expect(FARMHOUSE_OUTSIDE_DOOR.radiusMeters).toBeGreaterThan(1.5);
    expect(FARMHOUSE_OUTSIDE_DOOR.exitSpawn.z).toBeLessThan(FARMHOUSE_OUTSIDE_DOOR.z);

    // Interior door inside room
    expect(FARMHOUSE_INTERIOR_DOOR.radiusMeters).toBeGreaterThan(1.2);
    expect(isInsideFarmhouseInterior(FARMHOUSE_INTERIOR_DOOR.enterSpawn.x, FARMHOUSE_INTERIOR_DOOR.enterSpawn.z)).toBe(true);
    expect(FARMHOUSE_INTERIOR_DOOR.enterSpawn.y).toBe(FARMHOUSE_INTERIOR_BOUNDS.floorY + 0.5);
  });

  it("declares and projects valid collision primitives for all interior catalog assets", () => {
    const interiorAssetIds = [
      ASSET_IDS.INTERIOR_FARMHOUSE_SHELL,
      ASSET_IDS.PROP_BED_COZY_A,
      ASSET_IDS.PROP_FIREPLACE_HEARTH_A,
      ASSET_IDS.PROP_TABLE_DINING_A,
      ASSET_IDS.PROP_CHAIR_RUSTIC_A,
      ASSET_IDS.PROP_CUPBOARD_SHELVES_A,
      ASSET_IDS.PROP_ARMCHAIR_COZY_A
    ] as const;

    for (const assetId of interiorAssetIds) {
      const spec = ASSET_BY_ID.get(assetId);
      expect(spec, `Spec for ${assetId} must exist`).toBeDefined();
      const primitives = collisionPrimitivesForAsset(assetId);
      expect(primitives.length, `${assetId} must declare collision primitives`).toBeGreaterThan(0);
      for (const primitive of primitives) {
        expect(primitive.halfExtents.every((h) => h > 0)).toBe(true);
      }
    }
  });

  it("places all cozy furniture props within the interior room volume", () => {
    expect(FARMHOUSE_INTERIOR_PROPS.length).toBeGreaterThanOrEqual(7);
    for (const prop of FARMHOUSE_INTERIOR_PROPS) {
      expect(
        isInsideFarmhouseInterior(prop.x, prop.z),
        `Prop ${prop.id} at (${prop.x}, ${prop.z}) should be inside interior bounds`
      ).toBe(true);
      expect(ASSET_BY_ID.has(prop.assetId)).toBe(true);
    }
  });
});
