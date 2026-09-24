import { farmWellWorldAnchor } from "./FarmLayout";
import type { EnvironmentAssetPlacement } from "./WorldEnvironmentLayout";
import { SUNREACH_DRESSING, sunreachDressingRadius } from "./SunreachLivingLayout";

/** Existing static-prefab batching, collision and lamp-budget paths own these. */
export function createSunreachDressingPlacements(): EnvironmentAssetPlacement[] {
  return SUNREACH_DRESSING.map(spec => ({
    id: spec.id,
    origin: "authored",
    islandId: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    assetId: spec.assetId,
    x: spec.x,
    z: spec.z,
    rotationY: spec.rotationY,
    scale: [spec.scale, spec.scale, spec.scale],
    grounding: spec.footprint,
    clearanceRadiusMeters: sunreachDressingRadius(spec),
    practicalLight: spec.practicalLight
  }));
}

// FarmLayout, not presentation coordinates, owns the irrigation interaction.
export function sunreachCisternPlacement(): EnvironmentAssetPlacement {
  const well = farmWellWorldAnchor("farm.sunreach_terraces");
  if (!well) throw new Error("[SunreachDressing] Missing canonical terrace well");
  return {
    id: "authored.sunreach.terrace-cistern",
    origin: "authored",
    islandId: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    assetId: "prop_water_well_a",
    x: well.x, z: well.z, rotationY: well.rotationY,
    scale: [well.scale, well.scale, well.scale],
    grounding: [1.8, 1.8]
  };
}
