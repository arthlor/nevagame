import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createSportFishingPresentationSample,
  sampleSportFishingPresentation
} from "../../src/render/fishing/FishingPresentation";
import { createFishingDynamics } from "../../src/simulation/fishing/FishingTuning";
import type { FishingEncounterState } from "../../src/simulation/core/types";
import { FishingRodBend } from "../../src/render/fishing/FishingRodBend";

function encounter(overrides: Partial<FishingEncounterState> = {}): FishingEncounterState {
  return {
    fish: { instanceId: "fish.test", speciesId: "fish.trout", weightKg: 2, quality: "common" },
    rodId: "rod.willow",
    tackleSnapshot: { lureItemId: null },
    seaConditionSnapshot: { weatherType: "clear", seaRoughness: 0 },
    stamina: 40,
    maxStamina: 80,
    distanceMeters: 18,
    lineTension: 35,
    lineIntegrity: 100,
    fishDirection: 0,
    behavior: "rest",
    behaviorUntilSeconds: 1,
    elapsedSeconds: 3,
    rodDirectionAngle: 0,
    isReeling: false,
    isSlacking: false,
    isBracing: false,
    slackTimerSeconds: 0,
    snapTimerSeconds: 0,
    result: "active",
    ...overrides
  };
}

describe("sport fishing presentation", () => {
  it("aims an authored rod line exit at the fish independently of its parent transform", () => {
    const parent = new THREE.Group();
    parent.position.set(4, 1, -3);
    parent.rotation.set(0.2, -0.7, 0.1);
    const rod = new THREE.Group();
    parent.add(rod);
    for (const [name, position] of [
      ["rod_primary_grip", [0, 0, 0]],
      ["rod_secondary_grip", [0.03, 0.18, 0.08]],
      ["rod_line_exit", [0, 2.2, 0]],
      ["rod_reel_spool", [0, 0.15, 0.08]]
    ] as const) {
      const marker = new THREE.Object3D();
      marker.name = name;
      marker.position.set(position[0], position[1], position[2]);
      rod.add(marker);
    }
    const blank = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.2, 0.02));
    blank.position.y = 1.1;
    rod.add(blank);
    parent.updateMatrixWorld(true);
    const presentation = new FishingRodBend(rod);
    const endpoint = new THREE.Vector3(13, -0.5, 8);
    presentation.aimToward(endpoint, 1 / 60);
    const grip = rod.getObjectByName("rod_primary_grip")!.getWorldPosition(new THREE.Vector3());
    const tip = presentation.getTipWorld(new THREE.Vector3());
    expect(tip.clone().sub(grip).normalize().dot(endpoint.clone().sub(grip).normalize())).toBeCloseTo(1, 5);
    presentation.dispose();
  });

  it("maps fish distance and direction without changing the authoritative encounter", () => {
    const state = encounter({ fishDirection: 1, behavior: "run-right" });
    const result = sampleSportFishingPresentation(
      state,
      4,
      7,
      0,
      1,
      createSportFishingPresentationSample()
    );
    expect(Math.hypot(result.endpointX - 4, result.endpointZ - 7)).toBeCloseTo(18, 5);
    expect(result.endpointX).toBeGreaterThan(4);
    expect(state.distanceMeters).toBe(18);
    expect(state.fishDirection).toBe(1);
  });

  it("tightens line sag and bends the rod from encounter tension", () => {
    const low = sampleSportFishingPresentation(
      encounter({ lineTension: 12 }), 0, 0, 0, 1, createSportFishingPresentationSample()
    );
    const high = sampleSportFishingPresentation(
      encounter({ lineTension: 92, lineIntegrity: 28 }), 0, 0, 0, 1,
      createSportFishingPresentationSample()
    );
    expect(high.lineSagMeters).toBeLessThan(low.lineSagMeters);
    expect(high.rodBendRadians).toBeGreaterThan(low.rodBendRadians);
  });

  it("keeps essential fish position while reduced motion removes secondary response", () => {
    const state = encounter({ behavior: "surface", lineTension: 80, fishDirection: -1 });
    state.dynamics = {
      ...createFishingDynamics(state),
      angularVelocity: 0.5,
      effort: 0.7
    };
    const full = sampleSportFishingPresentation(
      state, 0, 0, 0.4, 1, createSportFishingPresentationSample()
    );
    const reduced = sampleSportFishingPresentation(
      state, 0, 0, 0.4, 0, createSportFishingPresentationSample()
    );
    expect(reduced.endpointX).toBeCloseTo(full.endpointX, 8);
    expect(reduced.endpointZ).toBeCloseTo(full.endpointZ, 8);
    expect(reduced.depthMeters).toBe(full.depthMeters);
    expect(reduced.rodBendRadians).toBe(full.rodBendRadians);
    expect(reduced.surfaceStrength).toBe(full.surfaceStrength);
    expect(full.fishRollRadians).not.toBe(0);
    expect(reduced.fishRollRadians).toBe(0);
  });

  it("derives finite, bounded rebuild signals for the renderer", () => {
    const state = encounter({ behavior: "shake", lineTension: 70, distanceMeters: 4, stamina: 6 });
    state.dynamics = {
      ...createFishingDynamics(state),
      shakeAmplitude: 0.8,
      shakePhase: 1.2,
      fishSpeed: 3.5,
      rodLoad: 0.66,
      rodDirection: 0.4,
      angularVelocity: 0.6,
      effort: 0.9
    };
    const s = sampleSportFishingPresentation(state, 0, 0, 0, 1, createSportFishingPresentationSample());
    for (const v of [s.shakeAmplitude, s.rodLoad, s.fishSpeedMps, s.rodDirection,
      s.fishTailBeatHz, s.fishBendRadians, s.fishFlashIntensity]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(s.shakeAmplitude).toBeCloseTo(0.8, 5);
    expect(s.rodLoad).toBeCloseTo(0.66, 5);
    expect(s.fishTailBeatHz).toBeGreaterThan(1.6); // faster than idle when the fish is driving
    expect(s.fishTailBeatHz).toBeLessThanOrEqual(6);
    expect(s.fishFlashIntensity).toBeGreaterThan(0); // near-beaten + close to the boat
    expect(s.fishFlashIntensity).toBeLessThanOrEqual(1);
    // Reduced motion scales the shake signal to zero.
    const reduced = sampleSportFishingPresentation(state, 0, 0, 0, 0, createSportFishingPresentationSample());
    expect(reduced.shakeAmplitude).toBe(0);
  });
});
