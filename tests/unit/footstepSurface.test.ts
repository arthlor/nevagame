import { describe, expect, it } from "vitest";

import { footstepBankForSurface, footstepSurfaceAt } from "../../src/audio/footstepSurface";
import { FARMHOUSE_INTERIOR_ORIGIN } from "../../src/world/FarmhouseInterior";
import { VILLAGE_CROSSING, WORLD_SPAWN } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("footstep surface banks", () => {
  it("maps interior, bridge, dock, packed road, and grass to adaptable banks", () => {
    expect(footstepSurfaceAt(WORLD_SPAWN.playerPosition.x, WORLD_SPAWN.playerPosition.z)).toBe("grass");
    expect(footstepBankForSurface("grass")).toBe("footstep-grass");

    // The packed sample point is the village crossing where the four routes meet. The market
    // stall stands beside the road on the court's south lip, so its own footprint reads grass.
    expect(footstepSurfaceAt(VILLAGE_CROSSING.x, VILLAGE_CROSSING.z)).toBe("dirt");
    expect(footstepBankForSurface("dirt")).toBe("footstep-dirt");

    expect(footstepSurfaceAt(FARMHOUSE_INTERIOR_ORIGIN.x, FARMHOUSE_INTERIOR_ORIGIN.z)).toBe("wood");
    expect(footstepBankForSurface("wood")).toBe("footstep-wood");

    expect(WorldLayout.isBridgeDeck(-14, -7)).toBe(true);
    expect(footstepSurfaceAt(-14, -7)).toBe("wood");

    const dock = WorldLayout.landmark("dock");
    expect(footstepSurfaceAt(dock.x, dock.z)).toBe("dock");
    expect(footstepBankForSurface("dock")).toBe("footstep-dock");
  });
});
