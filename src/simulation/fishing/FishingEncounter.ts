import type { CargoClass, FishBehavior, FishInstance, FishingEncounterState } from "../core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { SeededRng, type Rng } from "../core/Rng";
import type { FishBehaviorProfile, RodDefinition } from "../../content/types";
import {
  FISHING_TUNING as T, FISH_BEHAVIOR_EFFORT, createFishingDynamics,
  fishingEndpoint, fishingAngleDelta, fishingBehaviorReadout, fishingDepthBounds,
  FISHING_STEER_INPUT_MAX, clampFishing as clamp, approachFishing as approach
} from "./FishingTuning";

const TAU = Math.PI * 2;

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
  private inertia: number;

  constructor(
    fish: FishInstance,
    rodId: string,
    rng: Rng,
    startDistanceMeters = 30,
    water?: FishingWaterConstraint,
    snapshot?: Pick<FishingEncounterState, "tackleSnapshot" | "seaConditionSnapshot">
  ) {
    const species = ContentRegistry.fishSpecies.get(fish.speciesId);
    if (!species) throw new Error(`Unknown species ID ${fish.speciesId}`);
    const profile = ContentRegistry.fishBehaviors.get(species.behaviorProfileId);
    const rod = ContentRegistry.rods.get(rodId);
    if (!profile || !rod) throw new Error(`Missing fishing profile or rod for ${fish.speciesId}`);
    this.profile = profile;
    this.rod = rod;
    this.water = water;
    this.weightScale = clamp(fish.weightKg / Math.max(0.1, species.weightKg.average), 0.35, 2.5);
    this.inertia = clamp((profile.inertia ?? 0.35) + (this.weightScale - 1) * 0.08, 0.08, 1.1);
    const maxStamina = profile.baseStamina * Math.pow(this.weightScale, 0.75);
    this.state = {
      fish, rodId,
      tackleSnapshot: snapshot?.tackleSnapshot ?? { lureItemId: null },
      seaConditionSnapshot: snapshot?.seaConditionSnapshot ?? { weatherType: "clear", seaRoughness: 0 },
      stamina: maxStamina, maxStamina, distanceMeters: startDistanceMeters,
      lineTension: 35, lineIntegrity: 100, fishDirection: 0,
      behavior: "rest", behaviorUntilSeconds: 2.4, elapsedSeconds: 0,
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
    encounter.inertia = clamp((profile.inertia ?? 0.35) + (encounter.weightScale - 1) * 0.08, 0.08, 1.1);
    state.tackleSnapshot ??= { lureItemId: null };
    state.seaConditionSnapshot ??= { weatherType: "clear", seaRoughness: 0 };
    // Backfill any dynamics field a pre-rebuild save predates (rodLoad, fishSpeed,
    // shake oscillator, landReadySeconds) while keeping every persisted value.
    state.dynamics = {
      ...createFishingDynamics(
        state, water?.originX, water?.originZ, water?.bearingRadians,
        state.dynamics?.rngState ?? rng.getState()
      ),
      ...(state.dynamics ?? {})
    };
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
    this.state.rodDirectionAngle = clamp(
      input.rodDirectionAngle,
      -FISHING_STEER_INPUT_MAX,
      FISHING_STEER_INPUT_MAX
    );
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

  /** Instantaneous check: a beaten fish, in range, held in the green tension band. */
  private landingWindowOpen(): boolean {
    const s = this.state;
    return s.lineIntegrity > 0
      && s.stamina <= s.maxStamina * T.landingStaminaRatio
      && s.distanceMeters <= T.landingDistance
      && s.lineTension >= T.minimumLandingTension
      && s.lineTension < this.rod.maxSafeTension * T.landingTensionCeilRatio;
  }

  /** The fish is only truly landed once the window has been held for landReadySeconds. */
  private canLand(): boolean {
    return this.state.dynamics!.landReadySeconds >= T.landReadySeconds && this.landingWindowOpen();
  }

  /** Keep both the fish and the taut line on one continuous reach of water. */
  private waterPathIsClear(point: Readonly<{ x: number; z: number }>): boolean {
    if (!this.water || !this.water.isWater(point.x, point.z)) return this.water === undefined;
    const m = this.state.dynamics!;
    const dx = point.x - m.originX;
    const dz = point.z - m.originZ;
    const distance = Math.hypot(dx, dz);
    let enteredWater = false;
    for (let along = 0.5; along <= distance; along += 2) {
      const t = Math.min(1, along / Math.max(0.001, distance));
      const wet = this.water.isWater(m.originX + dx * t, m.originZ + dz * t);
      // A short dry bank below an on-foot angler is allowed. Once the line has
      // entered water it cannot pass through an island and reappear offshore.
      if ((!wet && enteredWater) || (!wet && along > 12)) return false;
      enteredWater ||= wet;
    }
    return true;
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
    const phase = fishingBehaviorReadout(s, p);
    const phaseEnvelope = phase.phase === "tell"
      ? phase.progress * phase.progress * (3 - 2 * phase.progress)
      : phase.phase === "recovery"
        ? 1 - phase.progress * phase.progress * (3 - 2 * phase.progress)
        : 1;
    const tired = clamp(s.stamina / Math.max(1, s.maxStamina), 0, 1);
    const vitality = 0.18 + tired * 0.82;
    const direction = s.behavior === "run-left" ? -1 : s.behavior === "run-right" ? 1 : 0;
    m.rodDirection = approach(m.rodDirection, s.rodDirectionAngle,
      this.rod.controlResponsiveness * (2.7 - this.inertia * 0.45) * dt);
    s.fishDirection = approach(s.fishDirection, direction,
      (1.05 + (p.turnRate ?? 1) * 1.55) * (1.15 - this.inertia * 0.35) * dt);
    const counter = clamp(-m.rodDirection * s.fishDirection, -1, 1);
    const effortTarget = FISH_BEHAVIOR_EFFORT[s.behavior] * (0.12 + phaseEnvelope * 0.88) * vitality;
    m.effort = approach(m.effort, effortTarget, (2.9 - this.inertia * 1.45) * dt);
    // Persistent head-shake oscillator: a shaking fish rings the line, and the
    // amplitude also drives rod-tip jitter and camera trauma via presentation.
    const shakeTarget = s.behavior === "shake" ? (p.shakeAmplitude ?? 0.55) : 0;
    m.shakeAmplitude = approach(m.shakeAmplitude, shakeTarget, 4 * dt);
    m.shakePhase = (m.shakePhase + (p.shakeHz ?? 2.7) * TAU * dt) % TAU;
    const shakeWave = Math.sin(m.shakePhase) * m.shakeAmplitude;
    const shakeLoad = 1 + shakeWave * 0.2;
    const seaPressure = 1 + clamp(s.seaConditionSnapshot.seaRoughness, 0, 1) * T.roughSeaDriveScale;
    const lureForgiveness = s.tackleSnapshot.lureItemId ? T.preparedLureDriveMultiplier : 1;
    const drive = m.effort * (p.burstStrength * 0.065 + p.directionalForce * 0.025)
      * p.tensionSensitivity * Math.pow(this.weightScale, 0.25) * (1 - counter * 0.22)
      * shakeLoad * seaPressure * lureForgiveness;
    const tensionRatio = s.lineTension / 100;
    const resistance = tensionRatio * this.rod.reelPower * T.resistancePerPower
      * (s.isBracing ? 1 + (p.pumpResistance ?? 1) * 0.34 : 1)
      * (1 + Math.max(0, counter) * 0.18);
    const stall = clamp((this.rod.maxSafeTension * 0.98 - s.lineTension) / (this.rod.maxSafeTension * 0.4), 0, 1);
    // Reeling straight across a running fish loses purchase; countering the run
    // with the rod (A/D) restores it. The same cross-load surges tension below.
    const crossRun = clamp(Math.abs(s.fishDirection) * (1 - Math.max(0, counter)), 0, 1);
    const reelEfficiency = 1 - crossRun * T.pumpCrossPenalty;
    // A loaded rod blank returns stored energy as you wind it down: the gap
    // between last step's rod load and the eased tension becomes free retrieval.
    if (s.isBracing && !s.isSlacking) {
      const pumpHeadroom = clamp(1 - Math.max(0, tensionRatio - 0.82) / 0.18, 0.12, 1);
      const counterGain = 0.72 + Math.max(0, counter) * 0.28;
      m.rodLoad = clamp(m.rodLoad + T.pumpLoadPerSecond * pumpHeadroom * counterGain * dt,
        0, T.pumpMaximumLoad);
    } else {
      m.rodLoad = approach(m.rodLoad, tensionRatio, T.rodLoadResponse * dt);
    }
    const rodAssist = s.isReeling && !s.isSlacking && !s.isBracing
      ? Math.max(0, m.rodLoad - tensionRatio) * T.rodAssistPerLoad
      : 0;
    const recoveryMultiplier = phase.phase === "recovery" ? T.recoveryReelMultiplier : 1;
    m.retrievalMetersPerSecond = s.isReeling && !s.isSlacking
      ? (this.rod.reelPower * T.reelMetersPerPower * (0.35 + (1 - tired) * 0.65)
        * stall * reelEfficiency * recoveryMultiplier + rodAssist)
        * (s.isBracing ? T.pumpingReelScale : 1)
      : 0;
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
    m.radialVelocity = approach(m.radialVelocity, drive - resistance, (4.4 - this.inertia * 2.2) * dt);
    const turnSpeed = (1.5 + (p.turnRate ?? 1) * 1.45) * m.effort * (1 - Math.max(0, counter) * 0.58);
    m.angularVelocity = approach(m.angularVelocity, s.fishDirection * turnSpeed / Math.max(3, s.distanceMeters),
      (0.92 - this.inertia * 0.5) * dt);
    m.bearingRadians += m.angularVelocity * dt;
    s.distanceMeters = clamp(s.distanceMeters + m.radialVelocity * dt, T.minimumDistance, T.maximumDistance);
    const depthTarget = s.behavior === "dive" ? (p.diveDepthMeters ?? 1.8) * phaseEnvelope
      : s.behavior === "surface" ? 0.18 - Math.sin(progress * Math.PI) * (p.surfaceLeapMeters ?? 0.7) * phaseEnvelope
      : 0.2 + this.inertia * 0.62;
    m.verticalVelocity = approach(m.verticalVelocity, clamp((depthTarget - m.depthMeters) * 5, -2, 2), 7 * dt);
    const depthBounds = fishingDepthBounds(p, s.distanceMeters);
    m.depthMeters = clamp(
      m.depthMeters + m.verticalVelocity * dt,
      depthBounds.minimum,
      depthBounds.maximum
    );
    const nextPoint = fishingEndpoint(s);
    if (this.water && !this.waterPathIsClear(nextPoint)) {
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
      const headingRate = (1.35 + (p.turnRate ?? 1) * 2.2) * (1.05 - this.inertia * 0.38);
      m.headingRadians += clamp(fishingAngleDelta(m.headingRadians, Math.atan2(dx, dz)), -headingRate * dt, headingRate * dt);
    }
    if ((oldDepth > 0) !== (m.depthMeters > 0)) m.surfaceCrossings++;

    const extension = Math.max(0, s.distanceMeters - m.lineLengthMeters);
    const targetTension = extension * T.lineStiffness + Math.max(0, m.radialVelocity) * T.lineDamping
      + (s.isReeling ? m.effort * 9 : 0) + crossRun * m.effort * 6
      + (s.isBracing && !s.isSlacking ? T.pumpTensionGain * (0.3 + m.effort * 0.7) : 0);
    s.lineTension = clamp(approach(s.lineTension, targetTension,
      (targetTension > s.lineTension ? T.tensionRisePerSecond : T.tensionFallPerSecond) * dt), 0, 100);
    // A smoothed world-speed read feeds fish animation and camera presentation.
    m.fishSpeed = approach(m.fishSpeed,
      Math.hypot(m.radialVelocity, m.angularVelocity * s.distanceMeters), T.fishAccelResponse * dt);
    const fatigue = m.effort * (0.45 + tensionRatio * 3.2) * (1 + Math.max(0, counter) * 0.25)
      + m.retrievalMetersPerSecond * 0.4;
    const recoveryStamina = s.behavior === "rest" && !s.isReeling && !s.isBracing && tensionRatio < 0.3
      ? T.restRecoveryPerSecond : 0;
    s.stamina = clamp(s.stamina + (recoveryStamina - fatigue) * dt, 0, s.maxStamina);
    const excess = Math.max(0, s.lineTension - this.rod.maxSafeTension);
    const shakeBite = m.shakeAmplitude * Math.abs(shakeWave) * T.shakeDamageScale
      * (s.isBracing ? T.bracedShakeDamageMultiplier : 1)
      * (s.tackleSnapshot.lureItemId ? T.preparedLureShakeDamageMultiplier : 1);
    s.lineIntegrity = Math.max(0, s.lineIntegrity - (excess * T.overloadDamageRate + shakeBite) * dt);
    s.snapTimerSeconds = s.lineTension >= 99 ? s.snapTimerSeconds + dt : Math.max(0, s.snapTimerSeconds - dt * 2);
    s.slackTimerSeconds = s.lineTension <= T.slackTension ? s.slackTimerSeconds + dt : Math.max(0, s.slackTimerSeconds - dt * 2);
    m.landReadySeconds = this.landingWindowOpen()
      ? m.landReadySeconds + dt
      : Math.max(0, m.landReadySeconds - dt * 2);
    if (s.lineIntegrity <= 0 || s.snapTimerSeconds >= T.snapGraceSeconds) s.result = "line-snapped";
    else if (s.slackTimerSeconds >= Math.max(p.escapeSlackSeconds, T.minimumSlackEscapeSeconds)) s.result = "escaped";
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
    const heavy = this.inertia >= 0.58;
    const running = s.behavior === "run-left" || s.behavior === "run-right" || s.behavior === "dive";
    const duration = this.rng.range(p.minBehaviorDurationSeconds, p.maxBehaviorDurationSeconds)
      * (heavy && running ? 1.2 + this.inertia * 0.5 : s.behavior === "rest" ? (heavy ? 0.82 : 1.15) : 1);
    s.behaviorUntilSeconds = Math.max(T.minimumBehaviorSeconds, duration);
    s.dynamics!.behaviorDurationSeconds = s.behaviorUntilSeconds;
  }
}
