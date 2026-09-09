import { beforeAll, describe, expect, it } from 'vitest';
import { Simulation } from '../../src/simulation/Simulation';
import { ContentRegistry } from '../../src/content/ContentRegistry';
import { FishingEncounter, sportFishingStartDistanceForWeight } from '../../src/simulation/fishing/FishingEncounter';
import { FISHING_TUNING as T, fishingEndpoint } from '../../src/simulation/fishing/FishingTuning';
import { SeededRng } from '../../src/simulation/core/Rng';
import type { FishingEncounterState } from '../../src/simulation/core/types';

let sim: Simulation;
beforeAll(() => { sim = new Simulation(); });

function answerPrompt(encounter: FishingEncounter): void {
  sim.state.sportFishing = encounter.getState() as FishingEncounterState;
  const action = sim.inspectSportFishingHud()!.decision.action;
  encounter.setInput({
    isReeling: action === 'reel', isSlacking: action === 'slack', isBracing: action === 'brace',
    rodDirectionAngle: action === 'steer-left' ? -0.6 : action === 'steer-right' ? 0.6 : 0
  });
}

function trout(): FishingEncounter {
  return new FishingEncounter({ instanceId: 'test.trout', speciesId: 'fish.trout', weightKg: 3.2, quality: 'fine' },
    'rod.willow', new SeededRng(42), 30);
}

describe('sport-fishing pacing and approach', () => {
  it('lands every sport species by following its HUD, without fighting beside the angler at 30% energy', () => {
    for (const species of ContentRegistry.fishSpecies.values()) {
      if (!species.isSportFish) continue;
      const rod = [...ContentRegistry.rods.values()].find(candidate => candidate.rodClass === species.minimumRodClass)!;
      for (const seed of [7, 42, 123]) {
        const e = new FishingEncounter({ instanceId: 'test.pacing', speciesId: species.id,
          weightKg: species.weightKg.average, quality: 'fine' }, rod.id, new SeededRng(seed),
          sportFishingStartDistanceForWeight(species.cargoClass, species.weightKg.average, species.weightKg.min, species.weightKg.max));
        let closeSeconds = 0;
        const label = `${species.id}, seed ${seed}`;
        while (e.getState().result === 'active' && e.getState().elapsedSeconds < 120) {
          answerPrompt(e);
          e.tick(0.1);
          const s = e.getState();
          if (s.stamina / s.maxStamina >= 0.3) expect(s.distanceMeters, label).toBeGreaterThan(7.5);
          if (s.distanceMeters < 5) closeSeconds += 0.1;
        }
        expect(e.getState().result, label).toBe('landed');
        expect(e.getState().elapsedSeconds, label).toBeGreaterThan(20);
        expect(closeSeconds, label).toBeLessThan(20);
      }
    }
  });

  it('preserves exact replay across JSON reload and render-step partitioning', () => {
    const original = trout();
    for (let i = 0; i < 160; i++) { answerPrompt(original); original.tick(0.1); }
    const saved = JSON.parse(JSON.stringify(original.getState())) as FishingEncounterState;
    const restored = FishingEncounter.fromState(saved, new SeededRng(999));
    while (original.getState().result === 'active' && original.getState().elapsedSeconds < 100) {
      answerPrompt(original); answerPrompt(restored);
      original.tick(0.1);
      for (let i = 0; i < 6; i++) restored.tick(T.stepSeconds);
      expect(restored.getState().distanceMeters).toBeCloseTo(original.getState().distanceMeters, 9);
      expect(restored.getState().stamina).toBeCloseTo(original.getState().stamina, 9);
      expect(restored.getState().dynamics!.rngState).toBe(original.getState().dynamics!.rngState);
    }
    expect(restored.getState().result).toBe('landed');
  });

  it('yielding relieves tension while an inertial fish coasts out of its drive', () => {
    const e = trout();
    const s = e.getState() as FishingEncounterState;
    s.lineTension = 90;
    s.dynamics!.lineLengthMeters = 27;
    s.dynamics!.radialVelocity = 10;
    e.setInput({ isReeling: false, isSlacking: true, isBracing: false, rodDirectionAngle: 0 });
    e.tick(0.5);
    expect(s.lineTension).toBeLessThan(90);
    expect(s.result).toBe('active');
  });

  it('does not push an already-close saved fish outward to satisfy the fight arc', () => {
    const e = trout();
    const s = e.getState() as FishingEncounterState;
    s.distanceMeters = 4;
    s.dynamics!.lineLengthMeters = 3;
    const restored = FishingEncounter.fromState(JSON.parse(JSON.stringify(s)), new SeededRng(1));
    restored.tick(T.stepSeconds);
    expect(restored.getState().distanceMeters).toBeLessThanOrEqual(4);
    expect(Math.abs(restored.getState().dynamics!.radialVelocity)).toBeLessThan(1);
  });

  it('resets an interrupted landing hold and preserves an uninterrupted hold on reload', () => {
    const e = trout();
    const s = e.getState() as FishingEncounterState;
    s.stamina = 0; s.distanceMeters = 2.6; s.lineTension = 30;
    s.dynamics!.lineLengthMeters = 1.5;
    s.dynamics!.landReadySeconds = 0.3;
    const restored = FishingEncounter.fromState(JSON.parse(JSON.stringify(s)), new SeededRng(1));
    expect(restored.getState().dynamics!.landReadySeconds).toBe(0.3);
    const r = restored.getState() as FishingEncounterState;
    r.lineTension = 0;
    restored.tick(T.stepSeconds);
    expect(r.dynamics!.landReadySeconds).toBe(0);
    expect(r.result).toBe('active');
    r.lineTension = 30;
    restored.tick(0.3);
    expect(r.result).toBe('active');
    restored.tick(0.3);
    expect(r.result).toBe('landed');
  });

  it('cues the final retrieve and landing-band correction instead of another behavior response', () => {
    const e = trout();
    const s = e.getState() as FishingEncounterState;
    sim.state.sportFishing = s;
    s.stamina = s.maxStamina * T.landingStaminaRatio;
    s.behavior = 'dive'; s.distanceMeters = 6; s.lineTension = 40;
    expect(sim.inspectSportFishingHud()!.decision.action).toBe('reel');
    s.distanceMeters = 2.6; s.lineTension = 72;
    expect(sim.inspectSportFishingHud()!.decision.action).toBe('slack');
    s.lineTension = 40;
    expect(sim.inspectSportFishingHud()!.decision.action).toBe('neutral');
  });

  it('keeps the whole line clear when a turning fish slides beside an island', () => {
    const isWater = (x: number, z: number) => !(x > 0.1 && z > 4 && z < 8);
    const e = new FishingEncounter({ instanceId: 'test.water', speciesId: 'fish.trout', weightKg: 3.2, quality: 'fine' },
      'rod.willow', new SeededRng(7), 20, { originX: 0, originZ: 0, bearingRadians: 0, isWater });
    const s = e.getState() as FishingEncounterState;
    s.behavior = 'run-right'; s.behaviorUntilSeconds = 2; s.dynamics!.behaviorDurationSeconds = 3.2;
    for (let i = 0; i < 120 && s.result === 'active'; i++) {
      answerPrompt(e); e.tick(T.stepSeconds);
      const end = fishingEndpoint(s);
      const reach = Math.hypot(end.x, end.z);
      // Exercise the encounter's two-metre water sampling contract through
      // real motion; a wet endpoint alone cannot pass this assertion.
      for (let along = 0.5; along <= reach; along += 2) {
        expect(isWater(end.x * along / reach, end.z * along / reach)).toBe(true);
      }
    }
  });
});
