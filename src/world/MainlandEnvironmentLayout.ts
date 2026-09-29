import {
  MAINLAND_BROOK_CULVERT_FACE_METERS, mainlandBrookAt, mainlandBrookCourses, mainlandBrookFloorHalfWidth, mainlandBrookHalfWidth
} from "./MainlandBrooks";
import { MAINLAND_BOUNDS, MAINLAND_VILLAGES, mainlandBiomeAt, mainlandBlendAt, mainlandBrookRoadCrossings } from "./NevaMainland";
import { MAINLAND_SETTLEMENT_BUILDINGS, mainlandSettlementClearanceAt } from "./MainlandSettlementLayout";
import { MAINLAND_WORK_SITES, mainlandWorkSiteClearanceAt, mainlandWorkSitePoint } from "./MainlandWorkSites";
import { WorldLayout } from "./WorldLayout";
import type { EnvironmentAssetPlacement, GroundCoverPlacement } from "./WorldEnvironmentLayout";
import { sampleWorldComposition, type WorldCompositionSample, type CompositionCategory } from "./WorldCompositionField";

/** Retains the old working district's authored scatter addresses as the continent grows. */
export const STARTER_DRESSING_BOUNDS = { minX: -220, maxX: 200, minZ: -250, maxZ: 130 } as const;

function hash(seed: number, address: number, salt: number): number {
  let value = Math.imul(seed ^ salt, 0x9e3779b1) ^ Math.imul(address + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0x100000000;
}

function inMainlandDressingArea(x: number, z: number): boolean {
  return (x < STARTER_DRESSING_BOUNDS.minX || x > STARTER_DRESSING_BOUNDS.maxX
    || z < STARTER_DRESSING_BOUNDS.minZ || z > STARTER_DRESSING_BOUNDS.maxZ)
    && mainlandBlendAt(x, z) > 0.1 && WorldLayout.islandAt(x, z) === "island.neva"
    && !WorldLayout.isWater(x, z);
}

function workingSpaceIsClear(x: number, z: number, margin: number): boolean {
  return mainlandSettlementClearanceAt(x, z) > margin;
}

function authored(id: string, assetId: string, x: number, z: number, rotationY: number = 0): EnvironmentAssetPlacement {
  return { id: `authored.mainland.${id}`, origin: "authored", islandId: "island.neva",
    biomeId: mainlandBiomeAt(x, z), assetId, x, z, rotationY, scale: [1, 1, 1] };
}

/** The summit crown in the overlook screenshot, and the harbor it looks toward. */
const OVERLOOK_LOOKOUT = { x: -435.8, z: -606 } as const;
const OVERLOOK_HARBOR_VIEW = { x: 64, z: 60 } as const;
const OVERLOOK_SCATTER_RADIUS = 3.5;
export const OVERLOOK_NOTE_PLACEMENT_ID = "authored.mainland.overlook.note";

const OVERLOOK_CAMP_LOCAL = [
  { id: "overlook.bench", assetId: "prop_bench_wood_a", localX: 0, localZ: -1.2, yaw: 0 },
  { id: "overlook.fire", assetId: "prop_fire_pit_a", localX: 1.85, localZ: -0.35, yaw: 0.35 },
  { id: "overlook.bread", assetId: "item_bread_loaf_a", localX: 0.72, localZ: 0.08, yaw: 0.5 },
  { id: "overlook.pie", assetId: "item_pie_a", localX: 1.02, localZ: 0.4, yaw: -0.4 },
  { id: "overlook.apple", assetId: "item_apple_a", localX: 0.46, localZ: 0.36, yaw: 1.2 },
  { id: "overlook.note", assetId: "prop_ground_note_a", localX: -0.55, localZ: 0.35, yaw: 0.65 }
] as const;

function overlookFacing(x: number, z: number): number {
  return Math.atan2(OVERLOOK_HARBOR_VIEW.x - x, OVERLOOK_HARBOR_VIEW.z - z);
}

function overlookWorld(originX: number, originZ: number, facing: number, localX: number, localZ: number): { x: number; z: number } {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  return {
    x: originX + localX * cos + localZ * sin,
    z: originZ - localX * sin + localZ * cos
  };
}

/** Prefer the flattest dry patch within a couple of metres of the screenshot spot. */
function overlookCampOrigin(): { x: number; z: number; facing: number } {
  let best: { x: number; z: number; facing: number; score: number } | null = null;
  for (let radius = 0; radius <= 2.001; radius += 0.5) {
    const steps = radius === 0 ? 1 : 12;
    for (let step = 0; step < steps; step += 1) {
      const angle = (step / steps) * Math.PI * 2;
      const x = OVERLOOK_LOOKOUT.x + Math.sin(angle) * radius;
      const z = OVERLOOK_LOOKOUT.z + Math.cos(angle) * radius;
      const facing = overlookFacing(x, z);
      const heights: number[] = [];
      let minNormal = 1;
      let blocked = false;
      for (const piece of OVERLOOK_CAMP_LOCAL) {
        const world = overlookWorld(x, z, facing, piece.localX, piece.localZ);
        if (WorldLayout.isWater(world.x, world.z) || !WorldLayout.isWalkable(world.x, world.z)) {
          blocked = true;
          break;
        }
        minNormal = Math.min(minNormal, WorldLayout.terrainNormalY(world.x, world.z));
        heights.push(WorldLayout.terrainHeight(world.x, world.z));
      }
      if (blocked || heights.length === 0) continue;
      const delta = Math.max(...heights) - Math.min(...heights);
      const distance = Math.hypot(x - OVERLOOK_LOOKOUT.x, z - OVERLOOK_LOOKOUT.z);
      const score = minNormal - delta * 0.12 - distance * 0.02;
      if (!best || score > best.score) best = { x, z, facing, score };
    }
  }
  const facing = overlookFacing(OVERLOOK_LOOKOUT.x, OVERLOOK_LOOKOUT.z);
  return best ?? { x: OVERLOOK_LOOKOUT.x, z: OVERLOOK_LOOKOUT.z, facing };
}

interface OverlookCamp {
  placements: EnvironmentAssetPlacement[];
  anchor: { x: number; z: number };
  reservation: { x: number; z: number; radius: number };
}

let overlookCampCache: OverlookCamp | null = null;

function overlookCamp(): OverlookCamp {
  if (overlookCampCache) return overlookCampCache;
  const origin = overlookCampOrigin();
  const placements = OVERLOOK_CAMP_LOCAL.map((piece) => {
    const world = overlookWorld(origin.x, origin.z, origin.facing, piece.localX, piece.localZ);
    return authored(piece.id, piece.assetId, world.x, world.z, origin.facing + piece.yaw);
  });
  const note = placements.find((placement) => placement.id === OVERLOOK_NOTE_PLACEMENT_ID);
  if (!note) throw new Error("Overlook camp is missing its note");
  overlookCampCache = {
    placements,
    anchor: { x: note.x, z: note.z },
    reservation: { x: origin.x, z: origin.z, radius: OVERLOOK_SCATTER_RADIUS }
  };
  return overlookCampCache;
}

/** Chair, fire, food and the readable note on the high ocean overlook. */
export function mainlandOverlookCampPlacements(): EnvironmentAssetPlacement[] {
  return overlookCamp().placements;
}

export function overlookNoteAnchor(): { x: number; z: number } {
  return overlookCamp().anchor;
}

/** Keeps highland scatter off the camp. The side boulders stay when they sit outside this disc. */
export function overlookCampScatterReservation(): { x: number; z: number; radius: number } {
  return overlookCamp().reservation;
}

/** Keep furniture beside the travel shoulder when an authored road bends through its old address. */
function roadsideVillageDetail(id: string, assetId: string, x: number, z: number, rotationY = 0): EnvironmentAssetPlacement {
  const footprintRadius = assetId === "prop_bench_wood_a" ? 1.6 : 0.9;
  for (const radius of [0, 3, 5, 7, 10, 13]) {
    for (let direction = 0; direction < (radius === 0 ? 1 : 12); direction++) {
      const angle = direction * Math.PI / 6;
      const candidateX = x + Math.sin(angle) * radius, candidateZ = z + Math.cos(angle) * radius;
      const road = WorldLayout.nearestRouteDistance(candidateX, candidateZ);
      if (road.distance <= road.halfWidth + road.shoulderWidthMeters + footprintRadius
        || WorldLayout.isWater(candidateX, candidateZ)
        || WorldLayout.terrainNormalY(candidateX, candidateZ) < 0.94
        || !workingSpaceIsClear(candidateX, candidateZ, footprintRadius)) continue;
      return authored(id, assetId, candidateX, candidateZ, rotationY);
    }
  }
  throw new Error(`No clear roadside position for ${id}`);
}

export function mainlandSettlementPlacements(): EnvironmentAssetPlacement[] {
  const placements = MAINLAND_SETTLEMENT_BUILDINGS.map(({ assetId, pad }) => ({
    ...authored(pad.id.replace(/^mainland\./, ""), assetId, pad.center.x, pad.center.z, pad.rotationY),
    grounding: pad.envelope,
    clearanceRadiusMeters: pad.frontageClearanceMeters,
    frontApproachMeters: pad.frontApproachMeters,
    practicalLight: pad.id.endsWith(".market")
  }));
  const details: EnvironmentAssetPlacement[] = [];
  for (const village of Object.values(MAINLAND_VILLAGES)) {
    const { x, z } = village.market;
    const stall = MAINLAND_SETTLEMENT_BUILDINGS.find((building) =>
      building.villageId === village.id && building.pad.id.endsWith(".market"))!.pad;
    const stallRear = (side: number) => ({
      x: stall.center.x + side * Math.cos(stall.rotationY) - 4.2 * Math.sin(stall.rotationY),
      z: stall.center.z - side * Math.sin(stall.rotationY) - 4.2 * Math.cos(stall.rotationY)
    });
    const crates = stallRear(-2.2), supplies = stallRear(2.2);
    // Furniture lives on the plaza edge; the market apron and NPC station stay open.
    details.push(
      authored(`${village.id}.well`, "prop_water_well_a", x - 12, z + 6),
      roadsideVillageDetail(`${village.id}.bench`, "prop_bench_wood_a", x + 15, z + 8, -Math.PI / 2),
      roadsideVillageDetail(`${village.id}.waymark`, "prop_signpost_trail_a", x - 7, z + 16, 0.3),
      authored(`${village.id}.market-crates`, "prop_crate_wood_a", crates.x, crates.z, 0.2),
      authored(`${village.id}.supplies`, "prop_barrel_wood_a", supplies.x, supplies.z, -0.2)
    );
    const work = village.id === "reedhaven" ? "prop_fish_drying_rack_a" : "prop_firewood_stack_a";
    details.push(authored(`${village.id}.working-stock`, work, x + 18, z + 12, -0.3));
    if (village.id === "pinewatch") {
      details.push(authored(`${village.id}.cart`, "prop_wagon_cart_a", x + 27, z + 9, 0.4));
    } else if (village.id === "highridge") {
      details.push(authored(`${village.id}.wheelbarrow`, "prop_wheelbarrow_a", x + 24, z + 12, 0.6));
    }
    if ("landing" in village) {
      details.push(
        authored(`${village.id}.landing-sign`, "prop_signpost_trail_a", village.landing.x - 5, village.landing.z - 3),
        authored(`${village.id}.landing-stock`, "prop_crate_wood_a", village.landing.x - 5, village.landing.z - 6, 0.4)
      );
    }
  }
  for (const { villageId, pad } of MAINLAND_SETTLEMENT_BUILDINGS) {
    if (pad.id.endsWith(".market")) continue;
    const at = (localX: number, localZ: number) => ({
      x: pad.center.x + localX * Math.cos(pad.rotationY) + localZ * Math.sin(pad.rotationY),
      z: pad.center.z - localX * Math.sin(pad.rotationY) + localZ * Math.cos(pad.rotationY)
    });
    const rear = -pad.envelope[1] - 1.7;
    const isWorkshop = pad.id.endsWith("work-shed");
    const garden = villageId === "reedhaven"
      ? ["prop_lobster_trap_a", "prop_fishing_net_rack_a", "prop_cargo_sack_a"]
      : isWorkshop ? ["prop_firewood_stack_a", "prop_fallen_log_a", "prop_garden_hoe_a"]
        : ["prop_potting_bench_a", "prop_harvest_basket_a", "prop_watering_can_rustic_a"];
    for (let index = 0; index < garden.length; index++) {
      const point = at((index - 1) * 2.3, rear - (index === 1 ? 1 : 0));
      const road = WorldLayout.nearestRouteDistance(point.x, point.z);
      if (WorldLayout.isWater(point.x, point.z) || road.distance < road.halfWidth + road.shoulderWidthMeters + 1.6
        || WorldLayout.terrainNormalY(point.x, point.z) < 0.92) continue;
      details.push(authored(`${pad.id}.garden.${index}`, garden[index], point.x, point.z, pad.rotationY));
    }
    if (!isWorkshop) {
      for (const side of [-1, 1]) {
        const point = at(side * (pad.envelope[0] + 0.8), rear);
        const road = WorldLayout.nearestRouteDistance(point.x, point.z);
        if (!WorldLayout.isWater(point.x, point.z) && road.distance > road.halfWidth + road.shoulderWidthMeters + 1.5
          && WorldLayout.terrainNormalY(point.x, point.z) > 0.94) {
          details.push(authored(`${pad.id}.garden-fence.${side}`, "prop_fence_section_a", point.x, point.z, pad.rotationY + Math.PI / 2));
        }
      }
    }
  }
  return [...placements, ...details, ...mainlandWorkSitePlacements(), ...mainlandRouteLandmarks(), ...mainlandCulvertPlacements(),
    ...mainlandBrookDressingPlacements()];
}

/** Coping top of `prop_culvert_headwall_a` above its floor, before any height scale. */
const CULVERT_HEADWALL_HEIGHT_METERS = 1.34;
const CULVERT_HEADWALL_WIDTH_SCALE = 1.3;

/**
 * Where a road crosses a brook, the water passes under it in a culvert: a
 * stone headwall stands at each side of the road deck, parallel to the road,
 * where the brook's course reaches the line its carve stops at
 * (`MAINLAND_BROOK_CULVERT_FACE_METERS` past the deck), so the pipe mouth
 * sits on the water. Its foot stands on the ground the terrain grid renders
 * at the face, which a 3.125 m grid cannot cut as sharply as the analytic
 * floor, so neither the ground nor the water draped on it buries the pipe;
 * it is tall enough to hold the road's edge.
 */
function mainlandCulvertPlacements(): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  const seen = new Map<string, number>();
  for (const crossing of mainlandBrookRoadCrossings()) {
    const { point, route } = crossing;
    // A brook that meets the same road twice gets a culvert at each crossing.
    const key = `${crossing.brookId}.${route.id}`;
    const ordinal = seen.get(key) ?? 0;
    seen.set(key, ordinal + 1);
    const name = ordinal === 0 ? key : `${key}.${ordinal + 1}`;
    const course = mainlandBrookCourses().find(candidate => candidate.id === crossing.brookId)!;
    for (const side of [-1, 1] as const) {
      const wall = headwallOnCourse(course.knots, point, side);
      if (!wall) continue;
      const { x, z, out } = wall;
      const floor = mainlandBrookAt(x, z, 3);
      if (!floor) continue;
      const foot = WorldLayout.terrainGridSurfaceHeight(x + out.x * 0.05, z + out.z * 0.05) - 0.02;
      const lift = crossing.roadElevation + 0.06 - foot;
      const end = side < 0 ? "upstream" : "downstream";
      placements.push({
        ...authored(`culvert.${name}.${end}`, "prop_culvert_headwall_a", x, z, Math.atan2(out.x, out.z)),
        y: foot,
        // Wide enough that the wing walls reach the channel's banks.
        scale: [CULVERT_HEADWALL_WIDTH_SCALE, Math.max(0.7, Math.min(2.2, lift / CULVERT_HEADWALL_HEIGHT_METERS)), 1]
      });
      // Riprap: loose stones laid either side of the water below the wall,
      // where the spill scours the banks, along the brook however it meets the road.
      const water = floor.halfWidth;
      const away = { x: floor.direction.x * side, z: floor.direction.z * side };
      ([[-(water + 0.55), 1.0, "rock_pebble_cluster_d"], [water + 0.6, 1.25, "rock_pebble_cluster_d"],
        [-(water + 0.9), 2.1, "rock_pebble_cluster_d"]] as const)
        .forEach(([across, ahead, assetId], k) => {
          const px = x + away.x * ahead - away.z * across, pz = z + away.z * ahead + away.x * across;
          placements.push({ ...authored(`culvert.${name}.${end}.riprap.${k}`, assetId, px, pz, k * 1.9 + side),
            scale: [1.1, 1, 1.1] });
        });
    }
  }
  return placements;
}

/**
 * Where a course, followed from a road crossing upstream (`side` -1) or
 * downstream (+1), first stands `MAINLAND_BROOK_CULVERT_FACE_METERS` clear of
 * the road deck's edge, with the direction out from the road there; null when
 * the course ends first. Measured against the road itself, so a bend never
 * brings a wall onto the deck.
 */
function headwallOnCourse(
  knots: readonly (readonly number[])[], crossing: { x: number; z: number }, side: -1 | 1
): { x: number; z: number; out: { x: number; z: number } } | null {
  const arc = [0];
  for (let i = 1; i < knots.length; i++) arc.push(arc[i - 1] + Math.hypot(knots[i][0] - knots[i - 1][0], knots[i][1] - knots[i - 1][1]));
  const pointAt = (s: number): { x: number; z: number } => {
    let i = 1;
    while (i < knots.length - 1 && arc[i] < s) i++;
    const t = Math.max(0, Math.min(1, (s - arc[i - 1]) / Math.max(1e-9, arc[i] - arc[i - 1])));
    return { x: knots[i - 1][0] + (knots[i][0] - knots[i - 1][0]) * t, z: knots[i - 1][1] + (knots[i][1] - knots[i - 1][1]) * t };
  };
  let start = 0, nearest = Infinity;
  for (let s = 0; s <= arc[arc.length - 1]; s += 0.05) {
    const p = pointAt(s), distance = Math.hypot(p.x - crossing.x, p.z - crossing.z);
    if (distance < nearest) { nearest = distance; start = s; }
  }
  const clear = (s: number): boolean => {
    const p = pointAt(s), road = WorldLayout.nearestRouteDistance(p.x, p.z);
    return road.distance - road.halfWidth >= MAINLAND_BROOK_CULVERT_FACE_METERS;
  };
  let inside = start;
  for (let step = 0.25; step <= 16; step += 0.25) {
    const s = start + side * step;
    if (s < 0 || s > arc[arc.length - 1]) return null;
    if (!clear(s)) { inside = s; continue; }
    let low = inside, high = s;
    for (let k = 0; k < 16; k++) { const mid = (low + high) / 2; if (clear(mid)) high = mid; else low = mid; }
    const p = pointAt(high), road = WorldLayout.nearestRouteDistance(p.x, p.z);
    const length = Math.max(1e-6, Math.hypot(p.x - road.point.x, p.z - road.point.z));
    return { x: p.x, z: p.z, out: { x: (p.x - road.point.x) / length, z: (p.z - road.point.z) / length } };
  }
  return null;
}

/** Deterministic per-brook dressing roll in [0, 1). */
const BROOK_DRESSING_SEED = 0x62726f6f;
/** Bed grade above which a brook tumbles between boulders, and the turn that makes a tight bend. */
const BROOK_BOULDER_GRADE = 0.22;
const BROOK_BEND_TURN = 0.35;

let brookDressing: EnvironmentAssetPlacement[] | null = null;

/**
 * Stones and wood that make a channel read as a mountain brook: pebbles along
 * the water's edge, boulders on steep reaches and the outer bank of tight
 * bends, a few rocks where each brook rises, the odd fallen log across a small
 * forest brook, and a spread of pebbles where it meets open water. Every
 * placement is derived from the traced course and kept off the water, the
 * roads, village work space and the work sites.
 */
function mainlandBrookDressingPlacements(): EnvironmentAssetPlacement[] {
  if (brookDressing) return brookDressing;
  const placements: EnvironmentAssetPlacement[] = [];
  const clear = (x: number, z: number, margin: number): boolean => {
    if (mainlandBlendAt(x, z) < 0.999 || WorldLayout.isWater(x, z)) return false;
    const road = WorldLayout.nearestRouteDistance(x, z);
    return road.distance > road.halfWidth + road.shoulderWidthMeters + margin
      && mainlandSettlementClearanceAt(x, z) > margin && mainlandWorkSiteClearanceAt(x, z) > margin;
  };
  const place = (id: string, assetId: string, x: number, z: number, rotationY: number, scale: number, margin: number): void => {
    if (!clear(x, z, margin)) return;
    placements.push({ ...authored(id, assetId, x, z, rotationY), scale: [scale, scale * 0.9, scale] });
  };
  // Washed stream stones are the grey set: the golden and warm field stones
  // read as dry ground and the coastal basalt sets black away from the sea.
  const pebbles = "rock_pebble_cluster_d";
  mainlandBrookCourses().forEach((course, courseIndex) => {
    const knots = course.knots;
    const roll = (address: number, salt: number): number => hash(BROOK_DRESSING_SEED, courseIndex * 100_003 + address, salt);
    // Walk the course in metre steps, with position, direction, grade and catchment.
    const steps: { x: number; z: number; fx: number; fz: number; grade: number; hectares: number; turn: number }[] = [];
    for (let i = 1; i < knots.length; i++) {
      const [ax, az, aBed, aHa] = knots[i - 1], [bx, bz, bBed, bHa] = knots[i];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 1e-3) continue;
      const fx = (bx - ax) / length, fz = (bz - az) / length;
      const after = knots[Math.min(knots.length - 1, i + 1)];
      const afterLength = Math.hypot(after[0] - bx, after[1] - bz) || 1;
      const turn = fx * (after[1] - bz) / afterLength - fz * (after[0] - bx) / afterLength;
      for (let d = 0; d < length; d += 1) {
        const t = d / length;
        steps.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, fx, fz,
          grade: Math.max(0, (aBed - bBed) / length), hectares: aHa + (bHa - aHa) * t, turn });
      }
    }
    if (steps.length < 6) return;
    const name = (kind: string, n: number) => `brook.${course.id}.${kind}.${n}`;
    // Pebbles at the water's edge, now on one bank, now the other.
    let n = 0;
    for (let at = 3 + roll(0, 0x11) * 6; at < steps.length - 3; at += 7 + roll(Math.floor(at), 0x12) * 7) {
      const step = steps[Math.floor(at)], r = roll(Math.floor(at), 0x13);
      const side = r < 0.5 ? -1 : 1;
      const lateral = side * (mainlandBrookHalfWidth(step.hectares) + 0.35 + roll(Math.floor(at), 0x14) * 0.6);
      place(name("pebbles", n++), pebbles, step.x - step.fz * lateral, step.z + step.fx * lateral,
        r * Math.PI * 2, 0.85 + roll(Math.floor(at), 0x15) * 0.55, 0.4);
    }
    // Boulders where the brook tumbles, and on the outer bank of a tight bend.
    n = 0;
    for (let at = 4; at < steps.length - 4; at += 1) {
      const step = steps[at];
      const steep = step.grade > BROOK_BOULDER_GRADE && roll(at, 0x21) < 0.1;
      const bend = Math.abs(step.turn) > BROOK_BEND_TURN && roll(at, 0x22) < 0.06;
      if (!steep && !bend) continue;
      const side = bend ? -Math.sign(step.turn) : roll(at, 0x23) < 0.5 ? -1 : 1;
      const lateral = side * (mainlandBrookFloorHalfWidth(step.hectares) + 0.2 + roll(at, 0x24) * 0.7);
      const big = roll(at, 0x25) > 0.7;
      place(name("boulder", n++), "rock_boulder_large_a", step.x - step.fz * lateral, step.z + step.fx * lateral,
        roll(at, 0x26) * Math.PI * 2, big ? 0.55 + roll(at, 0x27) * 0.25 : 0.32 + roll(at, 0x27) * 0.18, 1.2);
      at += 5;
    }
    // A fallen log across a small forest brook, now and then.
    const forest = (x: number, z: number) => mainlandBiomeAt(x, z) === "biome.pine_forest";
    n = 0;
    for (let at = 20 + Math.floor(roll(0, 0x31) * 30); at < steps.length - 10; at += 55 + Math.floor(roll(at, 0x32) * 40)) {
      const step = steps[at];
      if (!forest(step.x, step.z) || mainlandBrookHalfWidth(step.hectares) > 0.7 || step.grade > 0.3) continue;
      place(name("log", n++), "prop_fallen_log_a", step.x, step.z,
        Math.atan2(-step.fx, -step.fz) + (roll(at, 0x33) - 0.5) * 0.5, 0.9 + roll(at, 0x34) * 0.2, 0.8);
    }
    // Where it rises: a few rocks round the spring.
    const source = steps[0];
    ([[-1.7, -0.8, 0.36], [1.5, -1.3, 0.5]] as const).forEach(([across, ahead, size], k) => {
      place(name("spring", k), "rock_boulder_large_a", source.x - source.fz * across + source.fx * ahead,
        source.z + source.fx * across + source.fz * ahead, roll(k, 0x41) * Math.PI * 2, size + roll(k, 0x42) * 0.2, 1);
    });
    ([[0.2, 0.9]] as const).forEach(([across, ahead], k) => {
      place(name("spring", k + 2), "rock_pebble_cluster_d", source.x - source.fz * across + source.fx * ahead,
        source.z + source.fx * across + source.fz * ahead, roll(k + 2, 0x41) * Math.PI * 2, 1.2, 1);
    });
    // Where it meets open water: washed pebbles either side of the spreading water.
    if (course.outlet === "lake" || course.outlet === "river" || course.outlet === "sea") {
      for (let k = 0; k < 3; k++) {
        const step = steps[Math.max(0, steps.length - 3 - k * 2)];
        const lateral = (k === 1 ? -1 : 1) * (mainlandBrookHalfWidth(step.hectares) * 1.8 + 0.7 + k * 0.3);
        place(name("mouth", k), pebbles, step.x - step.fz * lateral, step.z + step.fx * lateral, roll(k, 0x51) * Math.PI * 2, 1.1, 0.2);
      }
    }
  });
  brookDressing = placements;
  return placements;
}

/**
 * The adit, ice house, salt pans and timber yard that supply the villages'
 * goods, with the everyday props that dress their working ground. A level
 * site keeps the footprint-stability check; a companion that no longer finds
 * dry, open, gentle ground is left out rather than floated or buried.
 */
function mainlandWorkSitePlacements(): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  for (const site of MAINLAND_WORK_SITES) {
    const [minX, maxX, minZ, maxZ] = site.footprint;
    placements.push({
      ...authored(`worksite.${site.id}`, site.assetId, site.center.x, site.center.z, site.rotationY),
      ...(site.level ? { grounding: [(maxX - minX) * 0.4, (maxZ - minZ) * 0.4] as [number, number] } : {})
    });
    for (const companion of site.companions) {
      const point = mainlandWorkSitePoint(site, companion.local[0], companion.local[1]);
      const road = WorldLayout.nearestRouteDistance(point.x, point.z);
      if (WorldLayout.isWater(point.x, point.z) || road.distance < road.halfWidth + road.shoulderWidthMeters + 1.6
        || WorldLayout.terrainNormalY(point.x, point.z) < 0.9) continue;
      placements.push(authored(`worksite.${site.id}.${companion.key}`, companion.assetId, point.x, point.z,
        site.rotationY + companion.rotationY));
    }
  }
  return placements;
}

/**
 * Roadside furniture stands where travel needs it: a signpost at each fork,
 * in the widest gap between the roads leaving it, and a resting spot beside
 * each passing place, where a carriage pulls over.
 */
function mainlandRouteLandmarks(): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  const routes = WorldLayout.compiledRouteNetwork();
  for (const junction of WorldLayout.routeJunctions()) {
    if (!junction.id.startsWith("mainland-")) continue;
    const passing = junction.id.startsWith("mainland-passing:");
    // Headings of the arms leaving the junction, eight metres out.
    const arms: number[] = [];
    for (const route of routes) {
      if (!junction.routeIds.includes(route.route.id)) continue;
      let nearest = 0;
      route.samples.forEach((sample, index) => {
        if (Math.hypot(sample.point.x - junction.center.x, sample.point.z - junction.center.z)
          < Math.hypot(route.samples[nearest].point.x - junction.center.x, route.samples[nearest].point.z - junction.center.z)) nearest = index;
      });
      for (const step of [-1, 1]) {
        let k = nearest + step;
        while (k >= 0 && k < route.samples.length
          && Math.hypot(route.samples[k].point.x - junction.center.x, route.samples[k].point.z - junction.center.z) < 8) k += step;
        if (k < 0 || k >= route.samples.length) continue;
        arms.push(Math.atan2(route.samples[k].point.z - junction.center.z, route.samples[k].point.x - junction.center.x));
      }
    }
    if (arms.length < (passing ? 2 : 3)) continue;
    arms.sort((a, b) => a - b);
    let gap = 0, heading = 0;
    for (let i = 0; i < arms.length; i++) {
      const next = i === arms.length - 1 ? arms[0] + Math.PI * 2 : arms[i + 1];
      if (next - arms[i] > gap) { gap = next - arms[i]; heading = arms[i] + gap * 0.5; }
    }
    const setback = junction.radiusMeters + junction.blendLengthMeters + (passing ? 2.2 : 1.4);
    const x = junction.center.x + Math.cos(heading) * setback;
    const z = junction.center.z + Math.sin(heading) * setback;
    const nearest = WorldLayout.nearestRouteDistance(x, z);
    if (!inMainlandDressingArea(x, z) || !workingSpaceIsClear(x, z, passing ? 3 : 2)
      || nearest.distance < nearest.halfWidth + nearest.shoulderWidthMeters + 0.8
      || WorldLayout.isWater(x, z) || WorldLayout.terrainNormalY(x, z) < 0.9) continue;
    const facing = Math.atan2(junction.center.x - x, junction.center.z - z);
    const key = junction.id.replace(/[^a-z0-9]+/gi, "-");
    if (!passing) {
      placements.push(authored(`junction.${key}.signpost`, "prop_signpost_trail_a", x, z, facing));
      continue;
    }
    const biome = mainlandBiomeAt(x, z);
    const rest = biome === "biome.highlands" ? "prop_bench_wood_a"
      : biome === "biome.reed_marsh" ? "prop_lobster_trap_a" : "prop_fallen_log_a";
    placements.push(authored(`passing.${key}.rest`, rest, x, z, facing + Math.PI * 0.5));
  }
  // Milestones mark each measured stage of a cart road from where it starts,
  // on the verge with their carved face to the road, clear of forks, culverts,
  // passing places and water.
  const culverts = mainlandBrookRoadCrossings();
  for (const route of routes) {
    if (!route.route.id.startsWith("mainland-") || route.route.kind !== "arterial") continue;
    for (let stage = MILESTONE_SPACING_METERS; stage < route.totalLength - 30; stage += MILESTONE_SPACING_METERS) {
      // The stone stands at the stage, or as near it as the verge allows.
      search: for (const shift of [0, 15, -15, 30, -30, 45, -45]) {
        const sample = route.samples.find(candidate => candidate.distanceAlongRoute >= stage + shift);
        if (!sample) continue;
        const clear = (point: { x: number; z: number }) => Math.hypot(point.x - sample.point.x, point.z - sample.point.z) > 25;
        if (!WorldLayout.routeJunctions().every(junction => clear(junction.center)) || !culverts.every(crossing => clear(crossing.point))) continue;
        for (const side of [-1, 1]) {
          const setback = route.halfWidth + route.shoulderWidthMeters + 0.9;
          const x = sample.point.x + sample.normal.x * setback * side;
          const z = sample.point.z + sample.normal.z * setback * side;
          const nearest = WorldLayout.nearestRouteDistance(x, z);
          if (!inMainlandDressingArea(x, z) || WorldLayout.isWater(x, z) || !workingSpaceIsClear(x, z, 1.5)
            || nearest.distance < nearest.halfWidth + nearest.shoulderWidthMeters + 0.5 || WorldLayout.terrainNormalY(x, z) < 0.9) continue;
          placements.push(authored(`milestone.${route.route.id}.${Math.round(stage)}`, "prop_milestone_a", x, z,
            Math.atan2(-sample.normal.x * side, -sample.normal.z * side)));
          break search;
        }
      }
    }
  }
  return placements;
}

/** A cart road's milestones stand this far apart, measured from where it starts. */
const MILESTONE_SPACING_METERS = 250;

interface ScatterSpec {
  key: string;
  cellMeters: number;
  spacing: number;
  salt: number;
  category: "tree" | "bush" | "rock" | "reed";
}

// Each habitat has its own spatial address space. Extending a biome cannot
// exhaust a global quota before another part of the continent gets dressed.
const STRUCTURAL_SCATTER: readonly ScatterSpec[] = [
  { key: "canopy", cellMeters: 6.8, spacing: 4.8, salt: 0x5a21, category: "tree" },
  { key: "understory", cellMeters: 10, spacing: 2, salt: 0x5b32, category: "bush" },
  { key: "outcrops", cellMeters: 15, spacing: 4.5, salt: 0x5c43, category: "rock" },
  { key: "wet-margin", cellMeters: 5.8, spacing: 1.5, salt: 0x5d54, category: "reed" }
];

function scatterChoice(spec: ScatterSpec, sample: WorldCompositionSample, roll: number): { assetId: string; density: number } {
  const marsh = sample.biomeId === "biome.reed_marsh";
  const highlands = sample.biomeId === "biome.highlands";
  const forest = sample.biomeId === "biome.pine_forest";
  if (spec.category === "tree") {
    // Most canopy uses published LOD families; un-LODed identity variants are accents.
    const assetId = marsh ? roll > 0.88 ? "tree_dead_a" : roll < 0.48 ? "tree_oak_b" : "tree_oak_a"
      : forest || highlands ? roll > 0.97 ? "tree_pine_young_a" : roll > 0.93 ? "tree_pine_tall_a"
        : roll > 0.88 ? "tree_oak_c" : roll < 0.46 ? "tree_pine_a" : "tree_pine_b"
        : sample.habitat.orchard > 0.4 ? roll < 0.8 ? "tree_apple_a" : "tree_oak_b"
          : roll > 0.94 ? "tree_maple_a" : roll < 0.35 ? "tree_oak_a" : roll < 0.7 ? "tree_oak_b" : "tree_oak_c";
    return { assetId, density: sample.density.tree };
  }
  if (spec.category === "bush") return {
    assetId: sample.habitat.woodland > 0.4 && roll < 0.12 ? "foliage_mushroom_cluster_a"
      : sample.habitat.woodland > 0.3 && roll > 0.93 ? "prop_fallen_log_a"
        : roll < 0.58 ? "foliage_bush_a" : "foliage_bush_round_a",
    density: sample.density.bush
  };
  if (spec.category === "rock") return {
    assetId: highlands && roll > 0.78 ? "rock_boulder_large_a" : roll > 0.42 ? "rock_boulder_a" : "rock_field_a",
    density: sample.density.rock
  };
  return { assetId: roll < 0.64 ? "foliage_reeds_a" : "foliage_cattail_a", density: sample.density.reed };
}

function placementTag(sample: WorldCompositionSample, category: CompositionCategory, address: string, priority: number) {
  return {
    address, islandId: sample.islandId, biomeId: sample.biomeId, category,
    district: sample.district.dominant, habitat: sample.habitat.dominant,
    role: sample.habitat.riparian > 0.6 ? "riparian" as const
      : sample.route.frame > 0.3 ? "route-frame" as const
        : sample.habitat.woodland > 0.45 ? "core" as const : "edge" as const,
    priority
  };
}

/** Local grove density with finite map area; never stored as gameplay state. */
export function* mainlandStructuralPlacementSteps(worldSeed: number): Generator<void, EnvironmentAssetPlacement[], void> {
  const placements: EnvironmentAssetPlacement[] = [];
  const occupied = new Map<string, { x: number; z: number; radius: number }[]>();
  const bucketMeters = 10;
  // Keep working/resting places usable when the surrounding grove is regenerated.
  for (const landmark of mainlandSettlementPlacements().filter((placement) => !placement.grounding)) {
    const key = `${Math.floor(landmark.x / bucketMeters)}:${Math.floor(landmark.z / bucketMeters)}`;
    const bucket = occupied.get(key) ?? [];
    bucket.push({ x: landmark.x, z: landmark.z, radius: 1.8 });
    occupied.set(key, bucket);
  }
  const campClearance = overlookCampScatterReservation();
  const campKey = `${Math.floor(campClearance.x / bucketMeters)}:${Math.floor(campClearance.z / bucketMeters)}`;
  const campBucket = occupied.get(campKey) ?? [];
  campBucket.push(campClearance);
  occupied.set(campKey, campBucket);
  for (const spec of STRUCTURAL_SCATTER) {
    const minCellX = Math.floor(MAINLAND_BOUNDS.minX / spec.cellMeters);
    const maxCellX = Math.ceil(MAINLAND_BOUNDS.maxX / spec.cellMeters);
    const minCellZ = Math.floor(MAINLAND_BOUNDS.minZ / spec.cellMeters);
    const maxCellZ = Math.ceil(MAINLAND_BOUNDS.maxZ / spec.cellMeters);
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      yield;
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const address = Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663);
        const x = (cx + 0.12 + hash(worldSeed, address, spec.salt) * 0.76) * spec.cellMeters;
        const z = (cz + 0.12 + hash(worldSeed, address, spec.salt ^ 0x1573) * 0.76) * spec.cellMeters;
        if (!inMainlandDressingArea(x, z)) continue;
        const roll = hash(worldSeed, address, spec.salt ^ 0x6835);
        const sample = sampleWorldComposition(worldSeed, x, z);
        const choice = scatterChoice(spec, sample, roll);
        if (hash(worldSeed, address, spec.salt ^ 0x3571) > choice.density) continue;
        const scaleRoll = hash(worldSeed, address, spec.salt ^ 0x2387);
        const scale = spec.category === "tree" ? 1.12 + scaleRoll * 0.75
          : spec.category === "rock" ? 0.78 + scaleRoll * (sample.biomeId === "biome.highlands" ? 1.5 : 0.7)
            : 0.82 + scaleRoll * 0.7;
        const margin = spec.category === "tree" ? 2.8 * scale : spec.category === "rock" ? 1.8 * scale : 0.7;
        if (!workingSpaceIsClear(x, z, margin) || sample.route.clearance > 0.015) continue;
        const route = WorldLayout.nearestRouteDistance(x, z);
        if (route.distance <= route.halfWidth + route.shoulderWidthMeters + margin) continue;
        const normalY = WorldLayout.terrainNormalY(x, z);
        if (normalY < (spec.category === "rock" ? 0.7 : spec.category === "reed" ? 0.86 : 0.81)) continue;
        const height = WorldLayout.terrainHeight(x, z);
        if (height < 0.25 || (spec.category === "tree" && height > 85)) continue;
        const gx = Math.floor(x / bucketMeters), gz = Math.floor(z / bucketMeters);
        const radius = spec.category === "tree" ? spec.spacing * 0.5
          : spec.category === "rock" ? 1.7 * scale : spec.spacing * 0.5;
        let crowded = false;
        for (let dx = -1; dx <= 1 && !crowded; dx++) {
          for (let dz = -1; dz <= 1 && !crowded; dz++) {
            crowded = (occupied.get(`${gx + dx}:${gz + dz}`) ?? []).some((other) =>
              Math.hypot(other.x - x, other.z - z) < radius + other.radius);
          }
        }
        if (crowded) continue;
        const id = `seeded-fill.mainland.${spec.key}.${cx}.${cz}`;
        placements.push({
          id, origin: "seeded-fill", islandId: "island.neva", biomeId: sample.biomeId,
          assetId: choice.assetId, x, z, rotationY: roll * Math.PI * 2,
          scale: [scale, scale * (0.95 + scaleRoll * 0.17), scale],
          compositionTag: placementTag(sample, spec.category, id, roll)
        });
        const key = `${gx}:${gz}`;
        const bucket = occupied.get(key) ?? [];
        bucket.push({ x, z, radius });
        occupied.set(key, bucket);
      }
    }
  }
  return placements;
}

/** Dense local accents share the instanced, distance-limited cover renderer. */
export function* mainlandGroundCoverSteps(worldSeed: number): Generator<void, GroundCoverPlacement[], void> {
  const placements: GroundCoverPlacement[] = [];
  const cellMeters = 4.2;
  const minX = Math.floor(MAINLAND_BOUNDS.minX / cellMeters), maxX = Math.ceil(MAINLAND_BOUNDS.maxX / cellMeters);
  const minZ = Math.floor(MAINLAND_BOUNDS.minZ / cellMeters), maxZ = Math.ceil(MAINLAND_BOUNDS.maxZ / cellMeters);
  for (let cz = minZ; cz <= maxZ; cz++) {
    yield;
    for (let cx = minX; cx <= maxX; cx++) {
      const address = Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663);
      const x = (cx + hash(worldSeed, address, 0x6331)) * cellMeters;
      const z = (cz + hash(worldSeed, address, 0x6887)) * cellMeters;
      if (!inMainlandDressingArea(x, z) || !workingSpaceIsClear(x, z, 0.3)) continue;
      const sample = sampleWorldComposition(worldSeed, x, z);
      if (sample.route.clearance > 0.04 || WorldLayout.pathInfluence(x, z) > 0.03) continue;
      const roll = hash(worldSeed, address, 0x6911);
      const flower = roll < sample.density.flower;
      const density = flower ? sample.density.flower * 1.6 : sample.density["short-cover"] * 0.85 + sample.habitat.riparian * 0.25;
      if (hash(worldSeed, address, 0x6921) > density || WorldLayout.terrainNormalY(x, z) < 0.79) continue;
      const woodland = sample.habitat.woodland > 0.48;
      const wet = sample.habitat.riparian > 0.55;
      const assetId = flower ? roll < 0.14 ? "foliage_flower_drift_a" : roll < 0.28 ? "foliage_flower_drift_b" : "foliage_flower_drift_c"
        : woodland && roll < 0.18 ? "foliage_mushroom_cluster_a" : wet && roll > 0.72 ? "foliage_reeds_a" : "foliage_meadow_tall_a";
      const scale = 0.72 + hash(worldSeed, address, 0x6937) * 0.72;
      const id = `seeded-fill.mainland.cover.${cx}.${cz}`;
      placements.push({
        id, origin: "seeded-fill", islandId: "island.neva", biomeId: sample.biomeId,
        category: flower ? "flowers" : "meadowTall", assetId, x, z,
        rotationY: hash(worldSeed, address, 0x6959) * Math.PI * 2,
        scale: [scale, scale * (flower ? 0.62 : wet ? 1.12 : 0.88), scale],
        compositionTag: placementTag(sample, flower ? "flower" : "short-cover", id, roll)
      });
    }
  }
  return placements;
}
