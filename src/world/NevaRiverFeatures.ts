import { NEVA_HEADWATERS } from "./NevaHeadwaters";
import { latticeUnit } from "./ProceduralNoise";
import {
  RIVER_FISHING_ACCESS_RESERVES,
  WORLD_LAYOUT_V5,
  WorldLayout,
  type RiverSectionProfile,
  type RiverSide
} from "./WorldLayout";

/**
 * Discrete features of the Silverwater's channel, derived once from the
 * canonical river profile (`WorldLayout.riverSectionAt`) and the headwater
 * cascade. They follow the same causes a real river sorts its bed by:
 *
 * - the step-pool staircase below the pool is held up by boulder sills, with
 *   chutes where the water finds a way through, and rock-armoured banks;
 * - riffles at the crossings between bends are coarse and shallow, so stones
 *   break the surface in their margins while the thalweg stays open;
 * - the outside of a bend undercuts its bank, dropping stones and the odd
 *   fallen tree at the toe of the cut;
 * - the inside of a bend is slack and depositional: reed beds on the bar edge
 *   and, in the lower meadow pools, lily pads on the calm margin;
 * - riparian zonation above the waterline: willow scrub on the bank top, where
 *   the water table is shallow and floods reach, and ferns in the waterfall's
 *   spray zone around the plunge pool and the cascade.
 *
 * This is presentation layout, never gameplay truth. Water membership, fishing
 * access and navigation stay with `WorldLayout`. Every feature keeps clear of
 * the bridge crossing, the reserved fishing approaches and a boat lane along
 * the thalweg of the sailable river, and the same list feeds world dressing
 * and the river water's foam field so rocks and their wakes cannot disagree.
 */

export type RiverStoneRole = "cascade-sill" | "cascade-bank" | "riffle" | "cut-bank" | "pool-margin" | "bar-edge";

export interface RiverStoneFeature {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Plan radius of the stone in metres. */
  readonly radius: number;
  /** Height of the stone's top above the local water surface (dry stones: above ground). */
  readonly exposure: number;
  readonly heading: number;
  readonly role: RiverStoneRole;
  /** 0..2, selects the river boulder variant. */
  readonly variant: number;
  /** True when the stone stands in the channel and throws a wake. */
  readonly inWater: boolean;
}

export interface RiverSnagFeature {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Yaw of the log's long axis; the root end sits on the bank. */
  readonly heading: number;
  readonly lengthMeters: number;
}

export interface RiverReedBedFeature {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Yaw of the bed's long axis, following the bank. */
  readonly heading: number;
  readonly lengthMeters: number;
  readonly widthMeters: number;
  readonly side: RiverSide;
}

export interface RiverLilyPatchFeature {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** Gap in a cascade sill where the step's water pours through as a tongue. */
export interface RiverChuteFeature {
  readonly id: string;
  readonly x: number;
  /** The step lip the chute cuts through. */
  readonly z: number;
  readonly halfWidthMeters: number;
}

export type RiverBankPlantKind = "willow" | "fern";

export interface RiverBankPlantFeature {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly kind: RiverBankPlantKind;
  /** Uniform size factor around 1. */
  readonly size: number;
}

export interface RiverFeatureSet {
  readonly stones: readonly RiverStoneFeature[];
  readonly snags: readonly RiverSnagFeature[];
  readonly reedBeds: readonly RiverReedBedFeature[];
  readonly lilyPatches: readonly RiverLilyPatchFeature[];
  readonly bankPlants: readonly RiverBankPlantFeature[];
  readonly chutes: readonly RiverChuteFeature[];
}

/** Half-width of the lane kept free of stones either side of the thalweg. */
export const RIVER_BOAT_LANE_HALF_WIDTH_METERS = 2.1;

const FEATURE_SALT = 0x5117;
/** Meadow reach that carries riffles, cut banks and bar dressing. */
const MEADOW_START_Z = -114;
const MEADOW_END_Z = 56;

let cached: RiverFeatureSet | null = null;

export function nevaRiverFeatures(): RiverFeatureSet {
  if (!cached) cached = buildRiverFeatures();
  return cached;
}

function unit(index: number, lane: number): number {
  return latticeUnit(index, lane, FEATURE_SALT);
}

function sideSign(side: RiverSide): number {
  return side === "left" ? -1 : 1;
}

function sideWidth(section: RiverSectionProfile, side: RiverSide): number {
  return side === "left" ? section.leftWaterWidth : section.rightWaterWidth;
}

function sideErosion(section: RiverSectionProfile, side: RiverSide): number {
  return side === "left" ? section.leftErosion : section.rightErosion;
}

function sideDeposition(section: RiverSectionProfile, side: RiverSide): number {
  return side === "left" ? section.leftDeposition : section.rightDeposition;
}

/**
 * Point `lateral` metres across the channel from its centreline at `z`. River
 * widths are measured along x at a fixed z, so the offset is too; this keeps
 * a feature's side and water membership identical to `WorldLayout`'s.
 */
function crossChannel(section: RiverSectionProfile, lateral: number): { x: number; z: number } {
  return { x: section.centerX + lateral, z: section.z };
}

function nearBridge(z: number, marginMeters: number): boolean {
  return Math.abs(z - WORLD_LAYOUT_V5.anchors.bridge.z) < marginMeters;
}

function inFishingReserve(z: number, side: RiverSide, marginMeters: number): boolean {
  return RIVER_FISHING_ACCESS_RESERVES.some((reserve) =>
    reserve.side === side && Math.abs(z - reserve.z) < reserve.halfLengthMeters + marginMeters);
}

function clearOfBoatLane(section: RiverSectionProfile, lateral: number, radius: number): boolean {
  if (section.z < NEVA_HEADWATERS.endZ) return true;
  return Math.abs(lateral - section.thalwegOffset) - radius >= RIVER_BOAT_LANE_HALF_WIDTH_METERS;
}

function flowHeading(section: RiverSectionProfile): number {
  return Math.atan2(section.tangent.x, section.tangent.z);
}

function buildRiverFeatures(): RiverFeatureSet {
  const stones: RiverStoneFeature[] = [];
  const snags: RiverSnagFeature[] = [];
  const reedBeds: RiverReedBedFeature[] = [];
  const lilyPatches: RiverLilyPatchFeature[] = [];
  const bankPlants: RiverBankPlantFeature[] = [];
  const chutes: RiverChuteFeature[] = [];
  const spaced = (x: number, z: number, radius: number): boolean =>
    stones.every((stone) => Math.hypot(stone.x - x, stone.z - z) >= stone.radius + radius + 0.35);
  const addStone = (stone: RiverStoneFeature): void => {
    if (spaced(stone.x, stone.z, stone.radius)) stones.push(stone);
  };

  // --- Step-pool staircase -------------------------------------------------
  // Each step is held by a line of boulders just above its lip. The water
  // pours through one or two chutes between them; the chute moves from step
  // to step as it does in a real staircase, so the steps never line up.
  NEVA_HEADWATERS.cascade.steps.forEach((step, stepIndex) => {
    const section = WorldLayout.riverSectionAt(step.lipZ - 0.3);
    const left = section.leftWaterWidth;
    const right = section.rightWaterWidth;
    const chute = stepIndex % 2 === 0 ? 0.28 : -0.32;
    const chuteCentre = crossChannel(section, chute * (chute < 0 ? left : right));
    chutes.push({ id: `chute-${stepIndex}`, x: chuteCentre.x, z: step.lipZ, halfWidthMeters: 0.2 * (chute < 0 ? left : right) });
    const slots = [-0.82, -0.5, -0.18, 0.16, 0.48, 0.8];
    slots.forEach((slot, slotIndex) => {
      if (Math.abs(slot - chute) < 0.2) return;
      const width = slot < 0 ? left : right;
      const lateral = slot * width + (unit(stepIndex * 17 + slotIndex, 1) - 0.5) * 0.25;
      const point = crossChannel(section, lateral);
      addStone({
        id: `cascade-sill-${stepIndex}-${slotIndex}`,
        x: point.x,
        z: point.z + (unit(stepIndex * 17 + slotIndex, 2) - 0.5) * 0.3,
        radius: 0.42 + unit(stepIndex * 17 + slotIndex, 3) * 0.26,
        exposure: 0.12 + unit(stepIndex * 17 + slotIndex, 4) * 0.26,
        heading: unit(stepIndex * 17 + slotIndex, 5) * Math.PI * 2,
        role: "cascade-sill",
        variant: (stepIndex + slotIndex) % 3,
        inWater: true
      });
    });
    // Armoured banks: large blocks shouldering each step.
    for (const side of ["left", "right"] as const) {
      const bankSection = WorldLayout.riverSectionAt(step.footZ);
      const lateral = sideSign(side) * (sideWidth(bankSection, side) + 0.55 + unit(stepIndex * 5 + (side === "left" ? 0 : 1), 6) * 0.6);
      const point = crossChannel(bankSection, lateral);
      addStone({
        id: `cascade-bank-${stepIndex}-${side}`,
        x: point.x,
        z: point.z,
        radius: 0.85 + unit(stepIndex * 5 + (side === "left" ? 0 : 1), 7) * 0.4,
        exposure: 0.7 + unit(stepIndex * 5 + (side === "left" ? 0 : 1), 8) * 0.45,
        heading: unit(stepIndex * 5 + (side === "left" ? 0 : 1), 9) * Math.PI * 2,
        role: "cascade-bank",
        variant: (stepIndex * 2 + (side === "left" ? 0 : 1)) % 3,
        inWater: false
      });
    }
  });

  // --- Plunge pool margins -------------------------------------------------
  // Blocks fallen from the face settle on the shallow west shelf and against
  // the east wall; the impact itself stays open for the falling sheet.
  const pool = NEVA_HEADWATERS.pool;
  [
    { z: pool.centerZ + 1.2, slot: -0.86, radius: 0.7 },
    { z: pool.centerZ + 3.4, slot: -0.8, radius: 0.55 },
    { z: pool.centerZ - 1.6, slot: 0.88, radius: 0.8 },
    { z: pool.centerZ + 4.8, slot: 0.78, radius: 0.5 }
  ].forEach((entry, index) => {
    const section = WorldLayout.riverSectionAt(entry.z);
    const width = entry.slot < 0 ? section.leftWaterWidth : section.rightWaterWidth;
    const point = crossChannel(section, entry.slot * width);
    addStone({
      id: `pool-margin-${index}`,
      x: point.x,
      z: point.z,
      radius: entry.radius,
      exposure: 0.25 + unit(index, 10) * 0.3,
      heading: unit(index, 11) * Math.PI * 2,
      role: "pool-margin",
      variant: index % 3,
      inWater: true
    });
  });

  // --- Meadow reach: riffles, cut banks and bars --------------------------
  let index = 0;
  for (let z = MEADOW_START_Z; z <= MEADOW_END_Z; z += 1.6, index += 1) {
    if (nearBridge(z, 13)) continue;
    const section = WorldLayout.riverSectionAt(z);
    if (section.estuaryInfluence > 0.2) continue;

    // Riffle margins: coarse stones break the surface either side of the lane.
    for (const side of section.riffle > 0.4 ? (["left", "right"] as const) : []) {
      const lane = side === "left" ? 20 : 60;
      if (unit(index, lane) > 0.4 + section.riffle * 0.45) continue;
      const width = sideWidth(section, side);
      const radius = 0.28 + unit(index, lane + 2) * 0.3;
      const lateral = sideSign(side) * width * (0.4 + unit(index, lane + 3) * 0.48);
      if (clearOfBoatLane(section, lateral, radius) && !inFishingReserve(z, side, 2)) {
        const point = crossChannel(section, lateral);
        addStone({
          id: `riffle-${side}-${index}`,
          x: point.x,
          z: point.z + (unit(index, lane + 1) - 0.5) * 0.8,
          radius,
          exposure: -0.05 + unit(index, lane + 4) * 0.3,
          heading: unit(index, lane + 5) * Math.PI * 2,
          role: "riffle",
          variant: (index + (side === "left" ? 0 : 1)) % 3,
          inWater: true
        });
      }
    }

    for (const side of ["left", "right"] as const) {
      const sideLane = side === "left" ? 30 : 40;
      const width = sideWidth(section, side);
      const erosion = sideErosion(section, side);
      const deposition = sideDeposition(section, side);

      // Cut-bank toe: stones dropped from the undercut face at the waterline.
      if (erosion > 0.62 && index % 3 === 0 && unit(index, sideLane) < 0.8 && !inFishingReserve(z, side, 3)) {
        const radius = 0.5 + unit(index, sideLane + 1) * 0.42;
        const lateral = sideSign(side) * (width - 0.35 + unit(index, sideLane + 2) * 0.7);
        if (clearOfBoatLane(section, lateral, radius)) {
          const point = crossChannel(section, lateral);
          addStone({
            id: `cut-bank-${side}-${index}`,
            x: point.x,
            z: point.z,
            radius,
            exposure: 0.2 + unit(index, sideLane + 3) * 0.4,
            heading: unit(index, sideLane + 4) * Math.PI * 2,
            role: "cut-bank",
            variant: (index + 1) % 3,
            inWater: WorldLayout.isWater(point.x, point.z)
          });
        }
      }

      // Bar edge: a few larger cobbles stranded on the dry gravel bar.
      if (deposition > 0.66 && index % 4 === 1 && unit(index, sideLane + 5) < 0.55
        && !inFishingReserve(z, side, 3)) {
        const lateral = sideSign(side) * (width + 1 + unit(index, sideLane + 6) * 2.2);
        const point = crossChannel(section, lateral);
        if (!WorldLayout.isWater(point.x, point.z) && WorldLayout.isWalkable(point.x, point.z)
          && WorldLayout.pathInfluence(point.x, point.z) < 0.05) {
          addStone({
            id: `bar-edge-${side}-${index}`,
            x: point.x,
            z: point.z,
            radius: 0.34 + unit(index, sideLane + 7) * 0.22,
            exposure: 0.22 + unit(index, sideLane + 8) * 0.18,
            heading: unit(index, sideLane + 9) * Math.PI * 2,
            role: "bar-edge",
            variant: (index + 2) % 3,
            inWater: false
          });
        }
      }
    }
  }

  // --- Bend apexes: snags, reed beds and lily pads -------------------------
  const apexes = findBendApexes();
  apexes.forEach((apex, apexIndex) => {
    const section = WorldLayout.riverSectionAt(apex.z);
    const outside: RiverSide = apex.bend > 0 ? "left" : "right";
    const inside: RiverSide = outside === "left" ? "right" : "left";
    const heading = flowHeading(section);

    // A tree the cut bank undermined: root end on the bank, crown trailing
    // downstream into the pool, angled off the current.
    if (!inFishingReserve(apex.z, outside, 5) && apex.z > -108 && apex.z < 48) {
      const width = sideWidth(section, outside);
      const lateral = sideSign(outside) * (width - 0.9);
      if (clearOfBoatLane(section, lateral, 0.5)) {
        const point = crossChannel(section, lateral);
        snags.push({
          id: `snag-${apexIndex}`,
          x: point.x,
          z: point.z + 1.2,
          heading: heading + sideSign(outside) * -0.62,
          lengthMeters: 3.4 + unit(apexIndex, 50) * 1.2
        });
      }
    }

    // Reed bed straddling the inside bank's waterline, following the bank.
    if (!inFishingReserve(apex.z, inside, 5)) {
      const width = sideWidth(section, inside);
      const lateral = sideSign(inside) * (width - 0.15);
      const point = crossChannel(section, lateral);
      reedBeds.push({
        id: `reed-bed-${apexIndex}`,
        x: point.x,
        z: point.z,
        heading,
        lengthMeters: 4.5 + unit(apexIndex, 51) * 3,
        widthMeters: 1.7 + unit(apexIndex, 52) * 0.6,
        side: inside
      });
    }

    // Lily pads rest only on slack pools of the lower meadow, well off the lane.
    if (apex.z > -64 && apex.z < 34 && section.riffle < 0.2 && !inFishingReserve(apex.z, inside, 4)) {
      const width = sideWidth(section, inside);
      const lateral = sideSign(inside) * width * 0.7;
      if (clearOfBoatLane(section, lateral, 1.2)) {
        const point = crossChannel(section, lateral);
        lilyPatches.push({ id: `lily-${apexIndex}`, x: point.x, z: point.z - 1.5, radius: 1.1 + unit(apexIndex, 53) * 0.5 });
      }
    }
  });

  // Smaller stands fill the depositional margins between the apexes: broken
  // pockets wherever the inside bank stays slack, never a continuous hedge.
  let marginIndex = 0;
  for (let z = MEADOW_START_Z + 3; z <= MEADOW_END_Z - 2; z += 3.2, marginIndex += 1) {
    if (nearBridge(z, 15)) continue;
    const section = WorldLayout.riverSectionAt(z);
    if (section.estuaryInfluence > 0.15) continue;
    for (const side of ["left", "right"] as const) {
      const lane = side === "left" ? 110 : 120;
      const deposition = sideDeposition(section, side);
      if (deposition < 0.5 || unit(marginIndex, lane) > 0.3 + (deposition - 0.5) * 0.9) continue;
      if (inFishingReserve(z, side, 4)) continue;
      if (reedBeds.some((bed) => bed.side === side && Math.abs(bed.z - z) < bed.lengthMeters * 0.5 + 3)) continue;
      const lateral = sideSign(side) * (sideWidth(section, side) - 0.1 - unit(marginIndex, lane + 1) * 0.3);
      const point = crossChannel(section, lateral);
      reedBeds.push({
        id: `reed-margin-${side}-${marginIndex}`,
        x: point.x,
        z: point.z,
        heading: flowHeading(section),
        lengthMeters: 2.4 + unit(marginIndex, lane + 2) * 2,
        widthMeters: 1.3 + unit(marginIndex, lane + 3) * 0.5,
        side
      });
    }
  }

  // --- Riparian bank plants ----------------------------------------------
  // Willow scrub keeps to the bank top just above the reach of the water,
  // commonest on the low depositional inside banks, thinning on the high cut
  // banks, and never on a path, a fishing approach or the bridge landings.
  let plantIndex = 0;
  const plantClear = (x: number, z: number, spacing: number): boolean =>
    !WorldLayout.isWater(x, z) && WorldLayout.isWalkable(x, z)
    && WorldLayout.waterSignedDistance(x, z) < -1
    && WorldLayout.pathInfluence(x, z) < 0.02
    && WorldLayout.terrainNormal(x, z).y > 0.84
    && bankPlants.every((plant) => Math.hypot(plant.x - x, plant.z - z) >= spacing)
    && stones.every((stone) => Math.hypot(stone.x - x, stone.z - z) >= stone.radius + 1.2);
  for (let z = MEADOW_START_Z + 2; z <= MEADOW_END_Z - 4; z += 4.5, plantIndex += 1) {
    if (nearBridge(z, 16)) continue;
    const section = WorldLayout.riverSectionAt(z);
    if (section.estuaryInfluence > 0.1) continue;
    for (const side of ["left", "right"] as const) {
      const lane = side === "left" ? 70 : 80;
      const deposition = sideDeposition(section, side);
      if (unit(plantIndex, lane) > 0.3 + deposition * 0.45) continue;
      if (inFishingReserve(z, side, 6)) continue;
      const bankRun = side === "left" ? section.leftBankRun : section.rightBankRun;
      const lateral = sideSign(side) * (sideWidth(section, side) + bankRun * 0.85 + 1.1 + unit(plantIndex, lane + 1) * 1.8);
      const point = crossChannel(section, lateral);
      const pz = point.z + (unit(plantIndex, lane + 2) - 0.5) * 2;
      if (!plantClear(point.x, pz, 7)) continue;
      bankPlants.push({
        id: `willow-${side}-${plantIndex}`,
        x: point.x,
        z: pz,
        heading: unit(plantIndex, lane + 3) * Math.PI * 2,
        kind: "willow",
        size: 0.72 + unit(plantIndex, lane + 4) * 0.4
      });
    }
  }
  // Ferns crowd the spray zone: the damp shelves round the plunge pool and
  // the rock banks of the cascade, where the mist keeps the ground wet.
  const sprayStart = NEVA_HEADWATERS.fall.landingZ + 0.8;
  const sprayEnd = NEVA_HEADWATERS.endZ + 2;
  for (let z = sprayStart; z <= sprayEnd; z += 1.3, plantIndex += 1) {
    const section = WorldLayout.riverSectionAt(z);
    for (const side of ["left", "right"] as const) {
      const lane = side === "left" ? 90 : 100;
      if (unit(plantIndex, lane) > 0.62) continue;
      const lateral = sideSign(side) * (sideWidth(section, side) + 0.9 + unit(plantIndex, lane + 1) * 2.6);
      const point = crossChannel(section, lateral);
      const pz = point.z + (unit(plantIndex, lane + 2) - 0.5) * 0.9;
      if (!plantClear(point.x, pz, 1.5)) continue;
      bankPlants.push({
        id: `fern-${side}-${plantIndex}`,
        x: point.x,
        z: pz,
        heading: unit(plantIndex, lane + 3) * Math.PI * 2,
        kind: "fern",
        size: 0.8 + unit(plantIndex, lane + 4) * 0.45
      });
    }
  }

  return { stones, snags, reedBeds, lilyPatches, bankPlants, chutes };
}

/** Local maxima of meander curvature along the sailable meadow reach. */
function findBendApexes(): Array<{ z: number; bend: number }> {
  const samples: Array<{ z: number; bend: number }> = [];
  for (let z = MEADOW_START_Z + 4; z <= MEADOW_END_Z; z += 1) {
    if (nearBridge(z, 14)) continue;
    samples.push({ z, bend: WorldLayout.riverSectionAt(z).curvature * 42 });
  }
  const apexes: Array<{ z: number; bend: number }> = [];
  for (let index = 1; index < samples.length - 1; index++) {
    const sample = samples[index];
    if (Math.abs(sample.bend) < 0.45) continue;
    if (Math.abs(sample.bend) >= Math.abs(samples[index - 1].bend)
      && Math.abs(sample.bend) > Math.abs(samples[index + 1].bend)
      && samples[index + 1].z - samples[index - 1].z <= 2.01
      && apexes.every((apex) => Math.abs(apex.z - sample.z) > 12)) {
      apexes.push(sample);
    }
  }
  return apexes;
}
