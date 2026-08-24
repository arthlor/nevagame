// src/simulation/fishing/FishingEncounter.ts

import { FishBehavior, FishInstance, FishingEncounterState } from "../core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { Rng } from "../core/Rng";
import { FishBehaviorProfile, RodDefinition } from "../../content/types";

export class FishingEncounter {
  private state: FishingEncounterState;
  private rod: RodDefinition;
  private rng: Rng;

  constructor(fish: FishInstance, rodId: string, rng: Rng, startDistanceMeters: number = 30) {
    this.rng = rng;
    const speciesDef = ContentRegistry.fishSpecies.get(fish.speciesId);
    if (!speciesDef) throw new Error(`Unknown species ID ${fish.speciesId}`);

    const behaviorProfile = ContentRegistry.fishBehaviors.get(speciesDef.behaviorProfileId);
    if (!behaviorProfile) throw new Error(`Unknown behavior profile ${speciesDef.behaviorProfileId}`);

    const rodDef = ContentRegistry.rods.get(rodId) || ContentRegistry.rods.get("rod.willow")!;
    this.rod = rodDef;

    const weightRatio = fish.weightKg / Math.max(0.1, speciesDef.weightKg.average);
    const maxStamina = behaviorProfile.baseStamina * Math.pow(weightRatio, 0.75);

    this.state = {
      fish,
      rodId: rodDef.id,
      stamina: maxStamina,
      maxStamina,
      distanceMeters: startDistanceMeters,
      lineTension: 35,
      lineIntegrity: 100,
      fishDirection: 0,
      behavior: "rest",
      behaviorUntilSeconds: 2.5,
      elapsedSeconds: 0,
      rodDirectionAngle: 0,
      isReeling: false,
      isSlacking: false,
      isBracing: false,
      slackTimerSeconds: 0,
      snapTimerSeconds: 0,
      result: "active"
    };

    this.pickNextBehavior(behaviorProfile);
  }

  public static fromState(state: FishingEncounterState, rng: Rng): FishingEncounter {
    const speciesDef = ContentRegistry.fishSpecies.get(state.fish.speciesId);
    if (!speciesDef) throw new Error(`Unknown species ID ${state.fish.speciesId}`);
    const rod = ContentRegistry.rods.get(state.rodId);
    if (!rod) throw new Error(`Unknown rod ID ${state.rodId}`);

    const encounter = Object.create(FishingEncounter.prototype) as FishingEncounter;
    encounter.state = state;
    encounter.rod = rod;
    encounter.rng = rng;
    return encounter;
  }

  public getState(): Readonly<FishingEncounterState> {
    return this.state;
  }

  public setInput(input: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle: number;
  }): void {
    if (this.state.result !== "active") return;
    this.state.isReeling = input.isReeling;
    this.state.isSlacking = input.isSlacking;
    this.state.isBracing = input.isBracing;
    this.state.rodDirectionAngle = input.rodDirectionAngle;
  }

  public tick(deltaSeconds: number): "active" | "landed" | "escaped" | "line-snapped" {
    if (this.state.result !== "active" || deltaSeconds <= 0) {
      return this.state.result;
    }

    this.state.elapsedSeconds += deltaSeconds;
    this.state.behaviorUntilSeconds -= deltaSeconds;

    const speciesDef = ContentRegistry.fishSpecies.get(this.state.fish.speciesId)!;
    const profile = ContentRegistry.fishBehaviors.get(speciesDef.behaviorProfileId)!;

    // 1. Behavior transition
    if (this.state.behaviorUntilSeconds <= 0) {
      this.pickNextBehavior(profile);
    }

    // 2. Calculate base fish pull & directional opposition
    let fishPullTension = 0;
    let fishDistanceDelta = 0;
    let staminaDrain = 0;

    const exhaustionRatio = Math.max(0.1, this.state.stamina / this.state.maxStamina);

    switch (this.state.behavior) {
      case "rest":
        fishPullTension = 4;
        staminaDrain = 2.0 * deltaSeconds;
        break;

      case "run-left":
      case "run-right": {
        const pullDir = this.state.behavior === "run-left" ? -1 : 1;
        this.state.fishDirection = pullDir;
        const angleDiff = Math.abs(this.state.rodDirectionAngle - (-pullDir));
        const oppositionFactor = angleDiff < 0.5 ? 0.4 : 1.2;
        fishPullTension = profile.directionalForce * oppositionFactor;
        fishDistanceDelta = profile.burstStrength * 0.15 * oppositionFactor * exhaustionRatio * deltaSeconds;
        staminaDrain = 4.0 * deltaSeconds;
        break;
      }

      case "dive":
        fishPullTension = profile.directionalForce * (this.state.isBracing ? 0.6 : 1.3);
        fishDistanceDelta = 1.2 * exhaustionRatio * deltaSeconds;
        staminaDrain = 4.5 * deltaSeconds;
        break;

      case "surface":
        fishPullTension = profile.directionalForce * 0.5;
        staminaDrain = 6.0 * deltaSeconds;
        break;

      case "burst":
        fishPullTension = profile.burstStrength * 1.4;
        fishDistanceDelta = 2.5 * exhaustionRatio * deltaSeconds;
        staminaDrain = 8.0 * deltaSeconds;
        break;

      case "shake":
        fishPullTension = (this.rng.nextFloat() - 0.5) * profile.directionalForce * 0.6;
        staminaDrain = 3.0 * deltaSeconds;
        break;
    }

    // 3. Player action effects on tension & distance
    let playerTensionEffect = 0;
    if (this.state.isReeling) {
      const reelPower = this.rod.reelPower;
      playerTensionEffect += 25 * deltaSeconds;
      const reelEfficiency = 0.35 + 0.65 * (1.0 - this.state.stamina / this.state.maxStamina);
      this.state.distanceMeters = Math.max(
        0.5,
        this.state.distanceMeters - reelPower * 0.4 * reelEfficiency * deltaSeconds
      );
      staminaDrain += 3.0 * deltaSeconds;
    }

    if (this.state.isSlacking) {
      playerTensionEffect -= 45 * deltaSeconds;
      this.state.distanceMeters += 1.5 * deltaSeconds;
    }

    if (this.state.isBracing) {
      playerTensionEffect += 8 * deltaSeconds;
      fishDistanceDelta *= 0.25;
    }

    // Apply distance change
    this.state.distanceMeters = Math.max(0.5, this.state.distanceMeters + fishDistanceDelta);

    // 4. Update line tension
    const naturalTensionReturnRate = 18 * deltaSeconds;
    let targetTension = this.state.lineTension + (fishPullTension * 0.4 * deltaSeconds + playerTensionEffect);
    if (!this.state.isReeling && !this.state.isSlacking) {
      if (targetTension > 35) targetTension -= naturalTensionReturnRate;
      if (targetTension < 35) targetTension += naturalTensionReturnRate;
    }
    this.state.lineTension = Math.min(100, Math.max(0, targetTension));

    // Drain stamina
    this.state.stamina = Math.max(0, this.state.stamina - staminaDrain);

    // 5. Tension danger and line integrity
    if (this.state.lineTension >= this.rod.maxSafeTension) {
      const excess = this.state.lineTension - this.rod.maxSafeTension;
      this.state.lineIntegrity -= excess * 0.8 * deltaSeconds;
      this.state.snapTimerSeconds += deltaSeconds;
      if (this.state.lineTension >= 100 && this.state.snapTimerSeconds > 0.8) {
        this.state.result = "line-snapped";
        return "line-snapped";
      }
    } else {
      this.state.snapTimerSeconds = Math.max(0, this.state.snapTimerSeconds - deltaSeconds);
      // Slight integrity recovery during safe reeling
      this.state.lineIntegrity = Math.min(100, this.state.lineIntegrity + 1.0 * deltaSeconds);
    }

    if (this.state.lineIntegrity <= 0) {
      this.state.result = "line-snapped";
      return "line-snapped";
    }

    // 6. Slack escape timer
    if (this.state.lineTension <= 8) {
      this.state.slackTimerSeconds += deltaSeconds;
      if (this.state.slackTimerSeconds >= profile.escapeSlackSeconds) {
        this.state.result = "escaped";
        return "escaped";
      }
    } else {
      this.state.slackTimerSeconds = Math.max(0, this.state.slackTimerSeconds - deltaSeconds * 2);
    }

    // 7. Landing condition: stamina near zero, distance within 3 meters, safe tension
    const landingThreshold = this.state.maxStamina * 0.15;
    if (
      this.state.stamina <= landingThreshold &&
      this.state.distanceMeters <= 3.0 &&
      this.state.lineTension < this.rod.maxSafeTension
    ) {
      this.state.result = "landed";
      return "landed";
    }

    return "active";
  }

  private pickNextBehavior(profile: FishBehaviorProfile): void {
    const entries: Array<{ value: FishBehavior; weight: number }> = [];
    for (const [bh, weight] of Object.entries(profile.behaviorWeights)) {
      entries.push({ value: bh as FishBehavior, weight: weight as number });
    }
    this.state.behavior = this.rng.weighted(entries);
    this.state.behaviorUntilSeconds = this.rng.range(
      profile.minBehaviorDurationSeconds,
      profile.maxBehaviorDurationSeconds
    );
  }
}
