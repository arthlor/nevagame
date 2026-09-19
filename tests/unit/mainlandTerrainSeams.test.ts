import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { WorldLayout } from "../../src/world/WorldLayout";
import type { WorldTerrainPatchDefinition } from "../../src/world/WorldIslands";

function gridHeight(patch: WorldTerrainPatchDefinition, x: number, z: number): number {
  const step = patch.sizeMeters / patch.resolution;
  const row = Math.round((x - patch.bounds.minX) / step);
  const column = Math.round((z - patch.bounds.minZ) / step);
  return WorldLayout.terrainBaseHeightfieldForPatch(patch.id)[row * (patch.resolution + 1) + column];
}

describe("mainland terrain patch seams", () => {
  const fine = WorldLayout.terrainPatches().find(patch => patch.id === "terrain.neva")!;
  const edges = [
    { id: "terrain.neva_west", point: (t: number) => ({ x: -300, z: t }) },
    { id: "terrain.neva_north", point: (t: number) => ({ x: t, z: -300 }) },
    { id: "terrain.neva_south", point: (t: number) => ({ x: t, z: 300 }) }
  ];

  it("stitches every fine boundary T junction to its coarse neighbour", () => {
    const fineStep = fine.sizeMeters / fine.resolution;
    for (const edge of edges) {
      const coarse = WorldLayout.terrainPatches().find(patch => patch.id === edge.id)!;
      for (let index = 1; index < fine.resolution; index += 2) {
        const t = -300 + index * fineStep;
        const point = edge.point(t), before = edge.point(t - fineStep), after = edge.point(t + fineStep);
        const coarseEdgeHeight = (gridHeight(coarse, before.x, before.z) + gridHeight(coarse, after.x, after.z)) / 2;
        expect(Math.abs(gridHeight(fine, point.x, point.z) - coarseEdgeHeight), `${edge.id} ${t}`).toBeLessThan(0.00001);
      }
    }
  });

  it("renders the exact stitched collider vertices", () => {
    const geometry = WorldLayout.buildTerrainGeometry("terrain.neva");
    try {
      const positions = geometry.getAttribute("position");
      let edgeCount = 0;
      for (let index = 0; index < positions.count; index++) {
        const x = positions.getX(index), z = positions.getZ(index);
        if (x !== -300 && z !== -300 && z !== 300) continue;
        edgeCount++;
        expect(positions.getY(index), `${x},${z}`).toBe(gridHeight(fine, x, z));
      }
      expect(edgeCount).toBeGreaterThan(1000);
    } finally { geometry.dispose(); }
  }, 60_000);

  it("keeps off-road Rapier and CPU support continuous across the former cracks", async () => {
    const physics = await PhysicsWorld.create();
    const { default: RAPIER } = await import("@dimforge/rapier3d-compat");
    const internal = physics as unknown as { world: InstanceType<typeof RAPIER.World>; playerBody: InstanceType<typeof RAPIER.RigidBody> };
    try {
      for (const seam of [{ x: -300, z: -4.6875, axis: "x" }, { x: 51.5625, z: -300, axis: "z" }] as const) {
        const contacts = [];
        for (const offset of [-0.001, 0, 0.001]) {
          const point = { x: seam.x, z: seam.z };
          point[seam.axis] += offset;
          const ray = new RAPIER.Ray({ ...point, y: 180 }, { x: 0, y: -1, z: 0 });
          const hit = internal.world.castRay(ray, 240, true, undefined, undefined, undefined, internal.playerBody);
          expect(hit).not.toBeNull();
          const contact = 180 - hit!.timeOfImpact;
          contacts.push(contact);
          expect(Math.abs(contact - WorldLayout.traversalSurfaceHeight(point.x, point.z))).toBeLessThan(0.001);
        }
        expect(Math.max(...contacts) - Math.min(...contacts)).toBeLessThan(0.005);
      }
    } finally { physics.dispose(); }
  }, 60_000);
});
