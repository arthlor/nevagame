import { Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { WORLD_ARCHITECTURE_PADS, WorldLayout } from "../../src/world/WorldLayout";

describe("architecture rain shelter", () => {
  it("covers each rotated pad's footprint the way the building is rendered", () => {
    const rotated = WORLD_ARCHITECTURE_PADS.filter((pad) => Math.abs(Math.sin(2 * pad.rotationY)) > 0.05);
    expect(rotated.length).toBeGreaterThan(0);
    for (const pad of rotated) {
      // The building renders at `rotation.y = pad.rotationY`; three.js places
      // each local footprint corner in the world.
      const building = new Object3D();
      building.position.set(pad.center.x, 0, pad.center.z);
      building.rotation.y = pad.rotationY;
      building.updateMatrixWorld(true);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const corner = building.localToWorld(new Vector3(sx * pad.envelope[0] * 0.9, 0, sz * pad.envelope[1] * 0.9));
        expect(WorldLayout.rainShelterHit(corner.x, corner.z), `${pad.id} corner ${sx},${sz}`).not.toBeNull();
      }
    }
  });
});
