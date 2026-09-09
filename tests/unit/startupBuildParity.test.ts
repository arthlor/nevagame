import { Vector4 } from "three";
import { describe, expect, it } from "vitest";
import { WorldLayout } from "../../src/world/WorldLayout";
import { runCooperatively, runSync } from "../../src/utils/CooperativeTask";
import { waterDepthMapSteps } from "../../src/render/water/CoastalOptics";

describe("cooperative startup build parity", () => {
  it("retains every terrain vertex, normal, field channel and index", async () => {
    const patch = WorldLayout.terrainPatches()[1];
    const asyncGeometry = await WorldLayout.buildTerrainGeometryAsync(patch.id);
    const syncGeometry = WorldLayout.buildTerrainGeometry(patch.id);
    expect(Object.keys(asyncGeometry.attributes)).toEqual(Object.keys(syncGeometry.attributes));
    for (const name of Object.keys(syncGeometry.attributes)) {
      expect(Buffer.from(asyncGeometry.getAttribute(name).array.buffer)).toEqual(Buffer.from(syncGeometry.getAttribute(name).array.buffer));
    }
    expect(asyncGeometry.getIndex()?.array).toEqual(syncGeometry.getIndex()?.array);
    asyncGeometry.dispose();
    syncGeometry.dispose();
  }, 60_000);

  it("retains water depth texels across task boundaries", async () => {
    const bounds = new Vector4(-20, -20, 40, 40);
    const sync = runSync(waterDepthMapSteps(bounds, 16, 16));
    const asyncMap = await runCooperatively(waterDepthMapSteps(bounds, 16, 16));
    expect(asyncMap.image.data).toEqual(sync.image.data);
    sync.dispose();
    asyncMap.dispose();
  });
});
