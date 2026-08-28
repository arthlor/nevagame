import type { CargoClass, FishBehavior, FishInstance, FishingEncounterState } from "../core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { SeededRng, type Rng } from "../core/Rng";
import type { FishBehaviorProfile, RodDefinition } from "../../content/types";
import {
  FISHING_TUNING as T, FISH_BEHAVIOR_EFFORT, createFishingDynamics,
  fishingEndpoint, fishingAngleDelta, clampFishing as clamp, approachFishing as approach
} from "./FishingTuning";

export function sportFishingStartDistanceMeters(cargoClass: CargoClass): number {
  return { small: 30, medium: 45, large: 50, gargantuan: 55 }[cargoClass];
}

export interface FishingWaterConstraint {
  originX: number;
  originZ: number;
  bearingRadians: number;
  isWater: (x: number, z: number) => boolean;
}

export class FishingEncounter {
  private state: FishingEncounterState;
  private rod: RodDefinition;
  private profile: FishBehaviorProfile;
  private rng: SeededRng;
  private pendingLand = false;
  private water?: FishingWaterConstraint;
  private weightScale: number;

  constructor(fish: FishInstance, rodId: string, rng: Rng, startDistanceMeters = 30, water?: FishingWaterConstraint) {
    const species = ContentRegistry.fishSpecies.get(fish.speciesId);
    if (!species) throw new Error(`Unknown species ID ${fish.speciesId}`);
    const profile = ContentRegistry.fishBehaviors.get(species.behaviorProfileId);
    const rod = ContentRegistry.rods.get(rodId);
    if (!profile || !rod) throw new Error(`Missing fishing profile or rod for ${fish.speciesId}`);
    this.profile = profile;
    this.rod = rod;
    this.water = water;
    this.weightScale = clamp(fish.weightKg / Math.max(0.1, species.weightKg.average), 0.35, 2.5);
    const maxStamina = profile.baseStamina * Math.pow(this.weightScale, 0.75);
    this.state = {
      fish, rodId, stamina: maxStamina, maxStamina, distanceMeters: startDistanceMeters,
      lineTension: 35, lineIntegrity: 100, fishDirection: 0,
      behavior: "rest", behaviorUntilSeconds: 1.4, elapsedSeconds: 0,
      rodDirectionAngle: 0, isReeling: false, isSlacking: false, isBracing: false,
      slackTimerSeconds: 0, snapTimerSeconds: 0, result: "active"
    };
    // A private persisted stream prevents unrelated world RNG draws from changing a fight.
    this.rng = new SeededRng(rng.intInclusive(1, 0xffffffff));
    this.state.dynamics = createFishingDynamics(this.state, water?.originX, water?.originZ, water?.bearingRadians, this.rng.getState());
  }

  public static fromState(state: FishingEncounterState, rng: Rng, water?: FishingWaterConstraint): FishingEncounter {
    const species = ContentRegistry.fishSpecies.get(state.fish.speciesId);
    const rod = ContentRegistry.rods.get(state.rodId);
    const profile = species && ContentRegistry.fishBehaviors.get(species.behaviorProfileId);
    if (!species || !rod || !profile) throw new Error("Cannot restore unknown fishing content");
    const encounter = Object.create(FishingEncounter.prototype) as FishingEncounter;
    encounter.state = state;
    encounter.rod = rod;
    encounter.profile = profile;
    encounter.water = water;
    encounter.weightScale = clamp(state.fish.weightKg / Math.max(0.1, species.weightKg.average), 0.35, 2.5);
    state.dynamics ??= createFishingDynamics(state, water?.originX, water?.originZ, water?.bearingRadians, rng.getState());
    encounter.rng = new SeededRng(1, state.dynamics.rngState);
    encounter.pendingLand = encounter.canLand();
    return encounter;
  }

  public deferLanding(): void {
    this.pendingLand = true;
    this.state.result = "active";
  }

  public getState(): Readonly<FishingEncounterState> { return this.state; }

  public setAnchor(x: number, z: number): void {
    const m = this.state.dynamics!;
    if (m.originX === x && m.originZ === z) return;
    const point = fishingEndpoint(this.state);
    m.originX = x;
    m.originZ = z;
    m.bearingRadians = Math.atan2(point.x - x, point.z - z);
    this.state.distanceMeters = Math.hypot(point.x - x, point.z - z, m.depthMeters);
  }

  public setInput(input: { isReeling: boolean; isSlacking: boolean; isBracing: boolean; rodDirectionAngle: number }): void {
    if (this.state.result !== "active") return;
    this.state.isSlacking = input.isSlacking;
    this.state.isReeling = input.isReeling && !input.isSlacking;
    this.state.isBracing = input.isBracing;
    this.state.rodDirectionAngle = clamp(input.rodDirectionAngle, -1, 1);
  }

  public tick(deltaSeconds: number): FishingEncounterState["result"] {
    if (deltaSeconds <= 0 || !Number.isFinite(deltaSeconds) || this.state.result !== "active") return this.state.result;
    if (this.pendingLand) {
      this.pendingLand = false;
      if (this.canLand()) return this.state.result = "landed";
    }
    const m = this.state.dynamics!;
    m.stepRemainderSeconds += deltaSeconds;
    const steps = Math.floor((m.stepRemainderSeconds + 1e-9) / T.stepSeconds);
    m.stepRemainderSeconds = Math.max(0, m.stepRemainderSeconds - steps * T.stepSeconds);
    for (let i = 0; i < steps && this.state.result === "active"; i++) this.step(T.stepSeconds);
    m.rngState = this.rng.getState();
    return this.state.result;
  }

  private canLand(): boolean {
    const s = this.state;
    return s.lineIntegrity > 0 && s.stamina <= s.maxStamina * T.landingStaminaRatio
      && s.distanceMeters <= T.landingDistance
      && s.lineTension >= T.minimumLandingTension && s.lineTension < this.rod.maxSafeTension;
  }

  private step(dt: number): void {
    const s = this.state;
    const m = s.dynamics!;
    const p = this.profile;
    s.elapsedSeconds += dt;
    s.behaviorUntilSeconds -= dt;
    if (s.behaviorUntilSeconds <= 0) this.pickNextBehavior();
    const age = m.behaviorDurationSeconds - s.behaviorUntilSeconds;
    const progress = clamp(age / m.behaviorDurationSeconds, 0, 1);
    const heavy = p.id === "profile.tuna";
    const anticipation = clamp(age / (heavy ? 0.85 : 0.45), 0, 1);
    const recovery = clamp(s.behaviorUntilSeconds / 0.45, 0, 1);
    const envelope = anticipation * anticipation * (3 - 2 * anticipation) * recovery;
    const tired = clamp(s.stamina / Math.max(1, s.maxStamina), 0, 1);
    const vitality = 0.18 + tired * 0.82;
    const direction = s.behavior === "run-left" ? -1 : s.behavior === "run-right" ? 1 : 0;
    m.rodDirection = approach(m.rodDirection, s.rodDirectionAngle, this.rod.controlResponsiveness * 2.4 * dt);
    s.fishDirection = approach(s.fishDirection, direction, (heavy ? 1.2 : 2.8) * dt);
    const counter = clamp(-m.rodDirection * s.fishDirection, -1, 1);
    const effortTarget = FISH_BEHAVIOR_EFFORT[s.behavior] * (0.16 + envelope * 0.84) * vitality;
    m.effort = approach(m.effort, effortTarget, (heavy ? 1.5 : 2.8) * dt);
    const shakeLoad = s.behavior === "shake" ? 1 + Math.sin(age * 18) * 0.14 : 1;
    const drive = m.effort * (p.burstStrength * 0.065 + p.directionalForce * 0.025)
      * p.tensionSensitivity * Math.pow(this.weightScale, 0.25) * (1 - counter * 0.22) * shakeLoad;
    const tensionRatio = s.lineTension / 100;
    const resistance = tensionRatio * this.rod.reelPower * T.resistancePerPower
      * (s.isBracing ? 1.28 : 1) * (1 + Math.max(0, counter) * 0.15);
    const stall = clamp((this.rod.maxSafeTension * 0.98 - s.lineTension) / (this.rod.maxSafeTension * 0.4), 0, 1);
    m.retrievalMetersPerSecond = s.isReeling && !s.isSlacking
      ? this.rod.reelPower * T.reelMetersPerPower * (0.35 + (1 - tired) * 0.65) * stall : 0;
    m.payoutMetersPerSecond = s.isSlacking
      ? 1.8 + drive * 1.25
      : Math.max(0, s.lineTension - this.rod.maxSafeTension * T.dragThresholdRatio)
        * T.dragPayoutRate * (s.isBracing ? 0.3 : 1) * (s.isReeling ? 0.12 : 1);
    const oldLineLength = m.lineLengthMeters;
    m.lineLengthMeters = clamp(oldLineLength + (m.payoutMetersPerSecond - m.retrievalMetersPerSecond) * dt, T.minimumLineLength, T.maximumDistance + 5);
    // Report actual spool movement, including its end stops, to animation and audio.
    if (m.lineLengthMeters >= oldLineLength) m.retrievalMetersPerSecond = 0;
    else m.retrievalMetersPerSecond = (oldLineLength - m.lineLengthMeters) / dt;
    if (m.lineLengthMeters <= oldLineLength) m.payoutMetersPerSecond = 0;
    else m.payoutMetersPerSecond = (m.lineLengthMeters - oldLineLength) / dt;

    const oldPoint = fishingEndpoint(s);
    const oldDistance = s.distanceMeters;
    const oldBearing = m.bearingRadians;
    const oldDepth = m.depthMeters;
    m.radialVelocity = approach(m.radialVelocity, drive - resistance, (heavy ? 2.0 : 4.2) * dt);
    const turnSpeed = (heavy ? 1.6 : 2.8) * m.effort * (1 - Math.max(0, counter) * 0.55);
    m.angularVelocity = approach(m.angularVelocity, s.fishDirection * turnSpeed / Math.max(3, s.distanceMeters), (heavy ? 0.35 : 0.85) * dt);
    m.bearingRadians += m.angularVelocity * dt;
    s.distanceMeters = clamp(s.distanceMeters + m.radialVelocity * dt, T.minimumDistance, T.maximumDistance);
    const depthTarget = s.behavior === "dive" ? (heavy ? 3.5 : 1.4) * envelope
      : s.behavior === "surface" ? 0.25 - Math.sin(progress * Math.PI) * (heavy ? 0.75 : 1.05)
      : heavy ? 0.65 : 0.25;
    m.verticalVelocity = approach(m.verticalVelocity, clamp((depthTarget - m.depthMeters) * 5, -2, 2), 7 * dt);
    m.depthMeters = clamp(m.depthMeters + m.verticalVelocity * dt,
      -Math.min(0.9, s.distanceMeters * 0.6), Math.min(4, s.distanceMeters * 0.6));
    const nextPoint = fishingEndpoint(s);
    if (this.water && (!this.water.isWater(nextPoint.x, nextPoint.z)
      || !this.water.isWater((nextPoint.x + oldPoint.x) / 2, (nextPoint.z + oldPoint.z) / 2))) {
      // Slide along the bank if turning is possible; otherwise allow inward retrieval.
      const proposedDistance = s.distanceMeters;
      s.distanceMeters = oldDistance;
      m.depthMeters = oldDepth;
      let slide = fishingEndpoint(s);
      if (!this.water.isWater(slide.x, slide.z)) {
        m.bearingRadians = oldBearing;
        s.distanceMeters = Math.min(oldDistance, proposedDistance);
        slide = fishingEndpoint(s);
        if (!this.water.isWater(slide.x, slide.z)) s.distanceMeters = oldDistance;
        m.angularVelocity = approach(m.angularVelocity, 0, dt);
      }
      m.radialVelocity = (s.distanceMeters - oldDistance) / dt;
      m.verticalVelocity = 0;
    }
    const point = fishingEndpoint(s);
    const dx = point.x - oldPoint.x;
    const dz = point.z - oldPoint.z;
    if (Math.hypot(dx, dz) > 0.0001) {
      m.headingRadians += clamp(fishingAngleDelta(m.headingRadians, Math.atan2(dx, dz)), -(heavy ? 1.5 : 3.8) * dt, (heavy ? 1.5 : 3.8) * dt);
    }
    if ((oldDepth > 0) !== (m.depthMeters > 0)) m.surfaceCrossings++;

    const extension = Math.max(0, s.distanceMeters - m.lineLengthMeters);
    const targetTension = extension * T.lineStiffness + Math.max(0, m.radialVelocity) * T.lineDamping
      + (s.isReeling ? m.effort * 9 : 0);
    s.lineTension = clamp(approach(s.lineTension, targetTension,
      (targetTension > s.lineTension ? T.tensionRisePerSecond : T.tensionFallPerSecond) * dt), 0, 100);
    const fatigue = m.effort * (0.45 + tensionRatio * 3.2) * (1 + Math.max(0, counter) * 0.25)
      + m.retrievalMetersPerSecond * 0.4;
    const recoveryStamina = s.behavior === "rest" && !s.isReeling && !s.isBracing && tensionRatio < 0.3
      ? T.restRecoveryPerSecond : 0;
    s.stamina = clamp(s.stamina + (recoveryStamina - fatigue) * dt, 0, s.maxStamina);
    const excess = Math.max(0, s.lineTension - this.rod.maxSafeTension);
    s.lineIntegrity = Math.max(0, s.lineIntegrity - excess * T.overloadDamageRate * dt);
    s.snapTimerSeconds = s.lineTension >= 99 ? s.snapTimerSeconds + dt : Math.max(0, s.snapTimerSeconds - dt * 2);
    s.slackTimerSeconds = s.lineTension <= T.slackTension ? s.slackTimerSeconds + dt : Math.max(0, s.slackTimerSeconds - dt * 2);
    if (s.lineIntegrity <= 0 || s.snapTimerSeconds >= T.snapGraceSeconds) s.result = "line-snapped";
    else if (s.slackTimerSeconds >= p.escapeSlackSeconds) s.result = "escaped";
    else if (this.canLand()) s.result = "landed";
  }

  private pickNextBehavior(): void {
    const s = this.state;
    const p = this.profile;
    const tired = s.stamina / Math.max(1, s.maxStamina);
    const previous = s.behavior;
    const pressure = previous === "burst" || previous === "dive";
    const entries = (Object.keys(p.behaviorWeights) as FishBehavior[]).map((behavior) => {
      let weight = p.behaviorWeights[behavior];
      if (behavior === previous) weight *= 0.12;
      if (pressure && (behavior === "burst" || behavior === "dive")) weight = 0;
      if ((previous === "run-left" && behavior === "run-right") || (previous === "run-right" && behavior === "run-left")) weight *= 0.15;
      if (behavior === "rest") weight += (pressure ? 0.28 : 0.08) + (1 - tired) * 0.3;
      if (behavior === "burst") weight *= 0.3 + tired * 0.7;
      return { value: behavior, weight };
    });
    s.behavior = this.rng.weighted(entries);
    const heavy = p.id === "profile.tuna";
    const running = s.behavior === "run-left" || s.behavior === "run-right" || s.behavior === "dive";
    const duration = this.rng.range(p.minBehaviorDurationSeconds, p.maxBehaviorDurationSeconds)
      * (heavy && running ? 1.55 : s.behavior === "rest" ? (heavy ? 0.75 : 1.15) : 1);
    s.behaviorUntilSeconds = Math.max(1.2, duration);
    s.dynamics!.behaviorDurationSeconds = s.behaviorUntilSeconds;
  }
}
