/**
 * Chore stations that turn skilled play into Work. They attach to already
 * rendered coastal/farm props, so no new world geometry or layout revision is
 * required. Positions are world-space and mirrored into interaction candidates
 * by the app; the simulation still validates proximity.
 */

export interface LaborStationDefinition {
  id: string;
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
    name: "Split Kindling",
    prompt: "Split kindling",
    position: Object.freeze({ x: 64.9, z: -40.1 }),
    reachMeters: 2.6,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.15
  }),
  "labor.racks": Object.freeze({
    id: "labor.racks",
    name: "Turn the Drying Racks",
    prompt: "Turn the racks",
    position: Object.freeze({ x: 61, z: -40.8 }),
    reachMeters: 2.6,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.05
  }),
  "labor.nets": Object.freeze({
    id: "labor.nets",
    name: "Mend the Nets",
    prompt: "Mend the nets",
    position: Object.freeze({ x: 67.5, z: 64.5 }),
    reachMeters: 2.6,
    yield: 20,
    targetMin: 0.72,
    targetMax: 0.88,
    meterSpeed: 1.25
  })
});

export function laborStationAt(stationId: string): LaborStationDefinition | null {
  return LABOR_STATIONS[stationId] ?? null;
}
