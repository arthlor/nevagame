import { bindInteractionPoint } from "../../world/InteractionPlacements";
import { CLOSE_INTERACTION_REACH_METERS } from "../../world/InteractionReach";
import { MAINLAND_VILLAGES } from "../../world/NevaMainland";

export const LABOR_PROP_POSES = {
  "authored.arrival.village.firewood": { x: 66.4, z: -39.8, rotationY: 1.5708 },
  "authored.arrival.village.rack": { x: 61, z: -40.8, rotationY: 3.1416 },
  "authored.prop.net-rack.harbor": { x: 67.5, z: 64.5, rotationY: 0.22 },
  "authored.commons.basket": { x: 84.8, z: -84.4, rotationY: -0.4 },
  "authored.village.produce-crate": { x: 63.8, z: -67.4, rotationY: 0.4 },
  "authored.prop.crate.harbor": { x: 66.5, z: 61.9, rotationY: 0.15 },
  "authored.mainland.pinewatch.working-stock": {
    x: MAINLAND_VILLAGES.pinewatch.market.x + 18, z: MAINLAND_VILLAGES.pinewatch.market.z + 12, rotationY: -0.3
  },
  "authored.mainland.reedhaven.working-stock": {
    x: MAINLAND_VILLAGES.reedhaven.market.x + 18, z: MAINLAND_VILLAGES.reedhaven.market.z + 12, rotationY: -0.3
  },
  "authored.mainland.highridge.working-stock": {
    x: MAINLAND_VILLAGES.highridge.market.x + 18, z: MAINLAND_VILLAGES.highridge.market.z + 12, rotationY: -0.3
  }
} as const;
/**
 * Chore stations that turn skilled play into Work. They attach to already
 * rendered coastal/farm props, so no new world geometry or layout revision is
 * required. Positions are world-space and mirrored into interaction candidates
 * by the app; the simulation still validates proximity.
 */

export interface LaborStationDefinition {
  id: string;
  /** Existing scenery that owns the visible working face and editor binding. */
  placementId: keyof typeof LABOR_PROP_POSES;
  name: string;
  prompt: string;
  position: Readonly<{ x: number; z: number }>;
  reachMeters: number;
  /** Work granted for a clean strike. */
  yield: number;
  /** Sweet-spot band on the 0..1 oscillating meter. */
  targetMin: number;
  targetMax: number;
  /** Meter travel per real second. */
  meterSpeed: number;
}

export const LABOR_STATIONS: Readonly<Record<string, Readonly<LaborStationDefinition>>> = Object.freeze({
  "labor.firewood": Object.freeze({
    id: "labor.firewood",
    placementId: "authored.arrival.village.firewood",
    name: "Split Kindling",
    prompt: "Split kindling",
    position: bindInteractionPoint("authored.arrival.village.firewood", { x: 65.9, z: -41.35 }, LABOR_PROP_POSES["authored.arrival.village.firewood"]),
    reachMeters: CLOSE_INTERACTION_REACH_METERS,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.15
  }),
  "labor.racks": Object.freeze({
    id: "labor.racks",
    placementId: "authored.arrival.village.rack",
    name: "Turn the Drying Racks",
    prompt: "Turn the racks",
    position: bindInteractionPoint("authored.arrival.village.rack", { x: 60.5, z: -41.8 }, LABOR_PROP_POSES["authored.arrival.village.rack"]),
    reachMeters: CLOSE_INTERACTION_REACH_METERS,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.05
  }),
  "labor.nets": Object.freeze({
    id: "labor.nets",
    placementId: "authored.prop.net-rack.harbor",
    name: "Mend the Nets",
    prompt: "Mend the nets",
    position: bindInteractionPoint("authored.prop.net-rack.harbor", { x: 67.5, z: 65.1 }, LABOR_PROP_POSES["authored.prop.net-rack.harbor"]),
    reachMeters: CLOSE_INTERACTION_REACH_METERS,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.25
  }),
  "labor.baskets": Object.freeze({
    id: "labor.baskets",
    placementId: "authored.commons.basket",
    name: "Stack the Harvest Baskets",
    prompt: "Stack harvest baskets",
    position: bindInteractionPoint("authored.commons.basket", { x: 83.3, z: -84.4 }, LABOR_PROP_POSES["authored.commons.basket"]),
    reachMeters: CLOSE_INTERACTION_REACH_METERS,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.05
  }),
  "labor.produce": Object.freeze({
    id: "labor.produce",
    placementId: "authored.village.produce-crate",
    name: "Sort the Market Produce",
    prompt: "Sort market produce",
    position: bindInteractionPoint("authored.village.produce-crate", { x: 62.3, z: -67.4 }, LABOR_PROP_POSES["authored.village.produce-crate"]),
    reachMeters: CLOSE_INTERACTION_REACH_METERS,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.1
  }),
  "labor.crates": Object.freeze({
    id: "labor.crates",
    placementId: "authored.prop.crate.harbor",
    name: "Secure the Harbor Crates",
    prompt: "Secure harbor crates",
    position: bindInteractionPoint("authored.prop.crate.harbor", { x: 65, z: 63.15 }, LABOR_PROP_POSES["authored.prop.crate.harbor"]),
    reachMeters: CLOSE_INTERACTION_REACH_METERS,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.2
  }),
  "labor.pinewatch_timber": Object.freeze({
    id: "labor.pinewatch_timber",
    placementId: "authored.mainland.pinewatch.working-stock",
    name: "Stack Pinewatch Timber",
    prompt: "Stack timber",
    position: bindInteractionPoint("authored.mainland.pinewatch.working-stock", {
      x: LABOR_PROP_POSES["authored.mainland.pinewatch.working-stock"].x - 1.5,
      z: LABOR_PROP_POSES["authored.mainland.pinewatch.working-stock"].z
    }, LABOR_PROP_POSES["authored.mainland.pinewatch.working-stock"]),
    reachMeters: CLOSE_INTERACTION_REACH_METERS,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.15
  }),
  "labor.reedhaven_racks": Object.freeze({
    id: "labor.reedhaven_racks",
    placementId: "authored.mainland.reedhaven.working-stock",
    name: "Tend Reedhaven's Drying Racks",
    prompt: "Tend drying racks",
    position: bindInteractionPoint("authored.mainland.reedhaven.working-stock", {
      x: LABOR_PROP_POSES["authored.mainland.reedhaven.working-stock"].x - 1.75,
      z: LABOR_PROP_POSES["authored.mainland.reedhaven.working-stock"].z
    }, LABOR_PROP_POSES["authored.mainland.reedhaven.working-stock"]),
    reachMeters: CLOSE_INTERACTION_REACH_METERS,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.05
  }),
  "labor.highridge_kindling": Object.freeze({
    id: "labor.highridge_kindling",
    placementId: "authored.mainland.highridge.working-stock",
    name: "Bundle Highridge Kindling",
    prompt: "Bundle kindling",
    position: bindInteractionPoint("authored.mainland.highridge.working-stock", {
      x: LABOR_PROP_POSES["authored.mainland.highridge.working-stock"].x - 1.5,
      z: LABOR_PROP_POSES["authored.mainland.highridge.working-stock"].z
    }, LABOR_PROP_POSES["authored.mainland.highridge.working-stock"]),
    reachMeters: CLOSE_INTERACTION_REACH_METERS,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.1
  })
});

export function laborStationAt(stationId: string): LaborStationDefinition | null {
  return LABOR_STATIONS[stationId] ?? null;
}
