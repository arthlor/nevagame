import { latticeUnit } from "./ProceduralNoise";
import {
  nevaRiverFeatures,
  type RiverBankPlantFeature,
  type RiverLilyPatchFeature,
  type RiverReedBedFeature,
  type RiverSnagFeature,
  type RiverStoneFeature
} from "./NevaRiverFeatures";
import { WorldLayout } from "./WorldLayout";
import type { EnvironmentAssetPlacement } from "./WorldEnvironmentLayout";

/**
 * World dressing for the Silverwater, built from `nevaRiverFeatures()`: each
 * derived feature becomes authored riverside assets sized and seated against
 * the canonical terrain and water surface. In-channel stones stand on the bed
 * and break the surface by their feature's exposure; dry stones sink into the
 * bank; reed beds become mixed stands of reed, cattail and sedge along the
 * bank; lily pads float at the surface; snags lie half-drowned off the cut
 * bank; the mouth gets a rocky west point and a sandy, driftwood-strewn east
 * shoulder. Presentation only: nothing here feeds water membership, fishing
 * or navigation.
 */

/**
 * Catalog footprints (width, depth, height; metres) the dressing sizes stones
 * and logs against. `tests/unit/nevaRiverDressing.test.ts` checks them against
 * the asset catalog so a regenerated asset cannot silently drift.
 */
export const RIVER_DRESSING_ASSET_SIZES = {
  rock_river_boulder_a: [1.0, 0.86, 0.62],
  rock_river_boulder_b: [1.25, 0.95, 0.72],
  rock_river_boulder_c: [1.1, 0.9, 0.55],
  rock_river_ledge_a: [2.4, 1.5, 0.95],
  prop_fallen_log_a: [2.98, 0.93, 0.84],
  rock_coastal_b: [5.8, 3.8, 2.4],
  rock_coastal_boulder_a: [2.4, 1.73, 1.54]
} as const satisfies Record<string, readonly [number, number, number]>;

const STONE_VARIANTS = ["rock_river_boulder_a", "rock_river_boulder_b", "rock_river_boulder_c"] as const;
const DRESSING_SALT = 0x51d3;
/** How far a stone's foot sinks below the bed or bank it rests on. */
const STONE_EMBED_METERS = 0.12;

export type RiverPlacementStability = (placement: EnvironmentAssetPlacement) => boolean;

function unit(index: number, lane: number): number {
  return latticeUnit(index, lane, DRESSING_SALT);
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function surfaceAt(z: number): number {
  return WorldLayout.riverSectionAt(z).surfaceElevation;
}

function waterDepthAt(x: number, z: number): number {
  return surfaceAt(z) - WorldLayout.terrainHeight(x, z);
}

/** Yaw that lays an asset's long local X axis along a compass heading. */
function alongHeading(heading: number): number {
  return heading - Math.PI / 2;
}

function place(
  id: string,
  assetId: string,
  x: number,
  z: number,
  rotationY: number,
  scale: readonly [number, number, number],
  extra: Partial<EnvironmentAssetPlacement> = {}
): EnvironmentAssetPlacement {
  return { id: `authored.river.${id}`, origin: "authored", assetId, x, z, rotationY, scale, ...extra };
}

/**
 * Seats a stone so its top stands `exposure` above the water (or bank) and
 * its foot reaches into the bed. Plan size follows the feature radius; the
 * vertical scale stretches within a believable range, and a stone too short
 * to reach the surface from a deep bed stays submerged on the bed instead of
 * floating.
 */
function stonePlacement(stone: RiverStoneFeature): EnvironmentAssetPlacement {
  const bankBlock = stone.role === "cascade-bank" && stone.radius > 0.95;
  const assetId = bankBlock ? "rock_river_ledge_a" : STONE_VARIANTS[stone.variant % STONE_VARIANTS.length];
  const [width, depth, height] = RIVER_DRESSING_ASSET_SIZES[assetId];
  const plan = (2 * stone.radius) / Math.max(width, depth);
  const ground = WorldLayout.terrainHeight(stone.x, stone.z);
  const top = stone.inWater ? surfaceAt(stone.z) + stone.exposure : ground + stone.exposure;
  const bottom = ground - (stone.inWater ? STONE_EMBED_METERS : Math.max(STONE_EMBED_METERS, height * plan * 0.3));
  const needed = (top - bottom) / height;
  const vertical = clamp(needed, plan * 0.55, plan * 1.5);
  const y = needed > vertical ? bottom : top - height * vertical;
  const squash = 0.9 + unit(hashId(stone.id), 1) * 0.2;
  return place(`stone.${stone.id}`, assetId, stone.x, stone.z, stone.heading, [plan * squash, vertical, plan / squash], { y });
}

/**
 * A reed bed is a stand, not a row of posts: reed clumps overlap along the
 * bank at uneven spacing, cattails mark the wetter ends, and low sedge
 * tussocks take the drier landward edge.
 */
function reedBedPlacements(bed: RiverReedBedFeature): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  const seed = hashId(bed.id);
  const along = { x: Math.sin(bed.heading), z: Math.cos(bed.heading) };
  const landward = bed.side === "left" ? -1 : 1;
  const count = Math.max(3, Math.round(bed.lengthMeters / 1.35));
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0 : index / (count - 1) - 0.5;
    const offset = t * bed.lengthMeters + (unit(seed + index, 2) - 0.5) * 0.6;
    const lateral = (unit(seed + index, 3) - 0.35) * bed.widthMeters * 0.5 * landward;
    const x = bed.x + along.x * offset + lateral;
    const z = bed.z + along.z * offset;
    const depth = waterDepthAt(x, z);
    if (depth > 0.65) continue;
    const end = index === 0 || index === count - 1;
    const size = end ? 0.72 + unit(seed + index, 4) * 0.2 : 0.86 + unit(seed + index, 4) * 0.32;
    placements.push(place(
      `reeds.${bed.id}.${index}`,
      end && unit(seed + index, 5) < 0.6 ? "foliage_cattail_a" : "foliage_reed_bed_a",
      x, z,
      alongHeading(bed.heading) + (unit(seed + index, 6) - 0.5) * 0.7,
      end ? [size * 1.2, size * 1.2, size * 1.2] : [size, size * (0.9 + unit(seed + index, 7) * 0.2), size]
    ));
    // Sedge tussocks on the landward side of every other clump.
    if (index % 2 === 1) {
      const sx = x + landward * (bed.widthMeters * 0.55 + unit(seed + index, 8) * 0.5);
      if (WorldLayout.isWater(sx, z) && waterDepthAt(sx, z) > 0.2) continue;
      const tussock = 0.8 + unit(seed + index, 9) * 0.4;
      placements.push(place(`sedge.${bed.id}.${index}`, "foliage_sedge_tussock_a", sx, z + (unit(seed + index, 10) - 0.5) * 0.8,
        unit(seed + index, 11) * Math.PI * 2, [tussock, tussock, tussock]));
    }
  }
  return placements;
}

/** Pads cluster on the calm margin, each floating at the local surface. */
function lilyPlacements(patch: RiverLilyPatchFeature): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  const seed = hashId(patch.id);
  const pads = 4 + Math.round(patch.radius * 2);
  for (let index = 0; index < pads; index += 1) {
    const angle = index * 2.399963 + unit(seed + index, 12) * 0.6;
    const reach = patch.radius * Math.sqrt((index + 0.5) / pads);
    const x = patch.x + Math.cos(angle) * reach;
    const z = patch.z + Math.sin(angle) * reach * 1.3;
    if (!WorldLayout.isWater(x, z) || waterDepthAt(x, z) < 0.25) continue;
    const size = 0.8 + unit(seed + index, 13) * 0.65;
    placements.push(place(`lily.${patch.id}.${index}`, "foliage_lily_pad_a", x, z,
      unit(seed + index, 14) * Math.PI * 2, [size, 1, size], { y: surfaceAt(z) + 0.035 }));
  }
  return placements;
}

/** A fallen tree lies half-drowned off the cut bank, crown trailing downstream. */
function snagPlacement(snag: RiverSnagFeature): EnvironmentAssetPlacement {
  const [length] = RIVER_DRESSING_ASSET_SIZES.prop_fallen_log_a;
  const scale = snag.lengthMeters / length;
  const ground = WorldLayout.terrainHeight(snag.x, snag.z);
  const y = Math.max(ground - 0.05, surfaceAt(snag.z) - 0.42 * scale);
  return place(`snag.${snag.id}`, "prop_fallen_log_a", snag.x, snag.z, alongHeading(snag.heading),
    [scale, scale * 0.9, scale], { y });
}

function bankPlantPlacements(plant: RiverBankPlantFeature, isStable: RiverPlacementStability): EnvironmentAssetPlacement[] {
  if (plant.kind === "fern") {
    return [place(`plant.${plant.id}`, "foliage_fern_a", plant.x, plant.z, plant.heading, [plant.size, plant.size, plant.size])];
  }
  const willow = place(`plant.${plant.id}`, "foliage_willow_shrub_a", plant.x, plant.z, plant.heading,
    [plant.size, plant.size * 0.95, plant.size], { grounding: [0.95 * plant.size, 0.85 * plant.size] });
  if (!isStable(willow)) return [];
  const placements = [willow];
  // A fern at the willow's damp, shaded foot on the water side.
  const toward = Math.sign(WorldLayout.riverCenterX(plant.z) - plant.x) || 1;
  const fx = plant.x + toward * 1.5 * plant.size;
  const fz = plant.z + (unit(hashId(plant.id), 15) - 0.5) * 1.2;
  if (!WorldLayout.isWater(fx, fz) && WorldLayout.waterSignedDistance(fx, fz) < -0.6) {
    const fern = 0.75 + unit(hashId(plant.id), 16) * 0.3;
    placements.push(place(`plant.${plant.id}.fern`, "foliage_fern_a", fx, fz, unit(hashId(plant.id), 17) * Math.PI * 2, [fern, fern, fern]));
  }
  return placements;
}

function waterEdgeX(z: number, side: -1 | 1): number {
  const section = WorldLayout.riverSectionAt(z);
  return section.centerX + side * (side < 0 ? section.leftWaterWidth : section.rightWaterWidth);
}

/** First station where the open sea reaches past a bank: where that bank meets the coast. */
function bankMeetsCoastZ(side: -1 | 1): number {
  for (let z = 50; z <= 110; z += 0.5) {
    if (WorldLayout.isWater(waterEdgeX(z, side) + side * 2.5, z)) return z;
  }
  return 80;
}

function dryAndOffPath(x: number, z: number): boolean {
  return !WorldLayout.isWater(x, z) && WorldLayout.pathInfluence(x, z) < 0.05;
}

/**
 * The mouth. The west bank ends in a rocky point: a big weathered block at the
 * tip, boulders stepping back up the bank, cobbles at their feet and a few
 * stones awash off the end. The low east shoulder is sand the swell piles up,
 * with driftwood stranded along the high-water line and beach grass holding
 * the dune behind it. Positions follow the estuary banks and the coastline.
 */
function mouthPlacements(): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  const westCoast = bankMeetsCoastZ(-1);
  const eastCoast = bankMeetsCoastZ(1);

  const anchorZ = westCoast - 1.2;
  const anchorX = waterEdgeX(anchorZ, -1) - 1.6;
  const [, , anchorHeight] = RIVER_DRESSING_ASSET_SIZES.rock_coastal_b;
  if (WorldLayout.pathInfluence(anchorX, anchorZ) < 0.05) {
    placements.push(place("mouth.point-block", "rock_coastal_b", anchorX, anchorZ, 0.35, [0.58, 0.62, 0.58],
      { y: WorldLayout.terrainHeight(anchorX, anchorZ) - anchorHeight * 0.62 * 0.3 }));
  }
  const [, , boulderHeight] = RIVER_DRESSING_ASSET_SIZES.rock_coastal_boulder_a;
  for (let index = 0; index < 4; index += 1) {
    const z = westCoast - 3.8 - index * 2.9 - unit(index, 30) * 0.8;
    const x = waterEdgeX(z, -1) - (0.9 + unit(index, 31) * 2.2);
    if (WorldLayout.pathInfluence(x, z) >= 0.05) continue;
    const size = 0.95 - index * 0.12 + unit(index, 32) * 0.15;
    placements.push(place(`mouth.point-boulder-${index}`, "rock_coastal_boulder_a", x, z, unit(index, 33) * Math.PI * 2,
      [size, size * (0.85 + unit(index, 34) * 0.2), size], { y: WorldLayout.terrainHeight(x, z) - boulderHeight * size * 0.28 }));
    const px = x + 1.1 + unit(index, 35) * 0.6;
    const pz = z + (unit(index, 36) - 0.5) * 1.4;
    if (dryAndOffPath(px, pz)) {
      placements.push(place(`mouth.point-cobbles-${index}`, "rock_pebble_cluster_c", px, pz, unit(index, 37) * Math.PI * 2, [1.1, 1, 1.1]));
    }
  }
  // Stones awash off the tip of the point, seated on the bed.
  for (let index = 0; index < 2; index += 1) {
    const z = westCoast + 0.4 + index * 1.7;
    const x = waterEdgeX(z, -1) + 0.5 + index * 0.6;
    placements.push(stonePlacement({
      id: `mouth-awash-${index}`, x, z, radius: 0.5 + unit(index, 38) * 0.2, exposure: 0.12 + unit(index, 39) * 0.15,
      heading: unit(index, 40) * Math.PI * 2, role: "cut-bank", variant: 1 + index, inWater: WorldLayout.isWater(x, z)
    }));
  }

  const driftwood = ["prop_driftwood_log_a", "prop_driftwood_a", "prop_driftwood_b", "prop_driftwood_c"] as const;
  for (let index = 0; index < 5; index += 1) {
    const z = eastCoast - 1.4 - index * 2.1 - unit(index, 41) * 0.6;
    const x = waterEdgeX(z, 1) + 1.4 + unit(index, 42) * 2.6;
    if (!dryAndOffPath(x, z)) continue;
    const size = 0.9 + unit(index, 43) * 0.3;
    // Stranded roughly along the shore, the way the ebb leaves it.
    placements.push(place(`mouth.strand-${index}`, driftwood[index % driftwood.length], x, z,
      (unit(index, 44) - 0.5) * 1.1, [size, size, size]));
  }
  for (let index = 0; index < 10; index += 1) {
    const z = eastCoast - 1 - index * 0.9 - unit(index, 45) * 0.5;
    const x = waterEdgeX(z, 1) + 3 + unit(index, 46) * 3.5;
    if (!dryAndOffPath(x, z)) continue;
    const size = 1 + unit(index, 47) * 0.5;
    placements.push(place(`mouth.dune-grass-${index}`, "foliage_beach_grass_a", x, z, unit(index, 48) * Math.PI * 2, [size, size, size]));
  }
  return placements;
}

let cached: readonly EnvironmentAssetPlacement[] | null = null;

/**
 * All river dressing placements. `isStable` is the environment layout's
 * footprint check, passed in so this module does not import its owner.
 */
export function nevaRiverDressingPlacements(isStable: RiverPlacementStability): readonly EnvironmentAssetPlacement[] {
  if (cached) return cached;
  const features = nevaRiverFeatures();
  cached = [
    ...features.stones.map(stonePlacement),
    ...features.snags.map(snagPlacement),
    ...features.reedBeds.flatMap(reedBedPlacements),
    ...features.lilyPatches.flatMap(lilyPlacements),
    ...features.bankPlants.flatMap((plant) => bankPlantPlacements(plant, isStable)),
    ...mouthPlacements()
  ];
  return cached;
}
