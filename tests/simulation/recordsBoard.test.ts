import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { RECORD_TIERS, RECORD_TUNING } from "../../src/content/records";
import { buildRecordMilestones } from "../../src/simulation/presentation/buildRecordMilestones";
import { Simulation } from "../../src/simulation/Simulation";

/**
 * The Records Board is derived from `state.journal`, which already persisted
 * discovery, catch counts, largest weight and best grade — and which nothing
 * read as a goal, so the game had no answer to "what now" once the authored
 * chain ended. These assertions pin the derivation, not a hand-written table.
 */
describe("records board", () => {
  it("derives a milestone for every species, crop and sweep, with no duplicates", () => {
    ContentRegistry.initializeAndValidate();
    const records = buildRecordMilestones(new Simulation().state);
    const ids = records.map((record) => record.id);
    expect(new Set(ids).size).toBe(ids.length);

    const sportFish = [...ContentRegistry.fishSpecies.values()].filter((fish) => fish.isSportFish);
    for (const fish of sportFish) {
      expect(ids).toContain(`record.weight.${fish.id}`);
      expect(ids).toContain(`record.grade.${fish.id}`);
    }
    for (const crop of ContentRegistry.crops.values()) {
      expect(ids).toContain(`record.harvest.${crop.id}`);
    }
    // A basic-only species never records a weight, so it must not be asked for one.
    for (const fish of ContentRegistry.fishSpecies.values()) {
      if (fish.isSportFish) continue;
      expect(ids).not.toContain(`record.weight.${fish.id}`);
    }
    expect(records.every((record) => RECORD_TIERS.some((tier) => tier.id === record.tier))).toBe(true);
  });

  it("starts a new save with everything open and nothing claimed", () => {
    const records = buildRecordMilestones(new Simulation().state);
    expect(records.length).toBeGreaterThan(20);
    expect(records.every((record) => !record.achieved)).toBe(true);
    expect(records.every((record) => record.progress >= 0 && record.progress <= 1)).toBe(true);
  });

  it("advances discovery, weight, grade and harvest records from journal truth", () => {
    const sim = new Simulation();
    const trout = ContentRegistry.fishSpecies.get("fish.trout")!;
    const threshold = trout.weightKg.average
      + (trout.weightKg.max - trout.weightKg.average) * RECORD_TUNING.weightRecordFraction;

    sim.state.journal.fishRecords["fish.trout"] = {
      discovered: true,
      catchCount: 3,
      largestWeightKg: threshold,
      bestQuality: RECORD_TUNING.trophyFishQuality,
      firstCaughtMinute: 10
    };
    sim.state.journal.cropRecords["crop.wheat"] = {
      harvestedCount: RECORD_TUNING.cropMasteryHarvests,
      bestQuality: RECORD_TUNING.prizeCropQuality
    };

    const byId = new Map(buildRecordMilestones(sim.state).map((record) => [record.id, record]));
    expect(byId.get("record.weight.fish.trout")?.achieved).toBe(true);
    expect(byId.get("record.grade.fish.trout")?.achieved).toBe(true);
    expect(byId.get("record.harvest.crop.wheat")?.achieved).toBe(true);
    expect(byId.get("record.sweep.prize_crop")?.achieved).toBe(true);
    // One species short of the ecology, and only one of four habitats fished.
    expect(byId.get("record.discovery.ecology.neva")?.achieved).toBe(false);
    expect(byId.get("record.sweep.habitats")?.currentLabel).toBe("2 / 4");
  });

  it("does not claim a weight record for a specimen under the threshold", () => {
    const sim = new Simulation();
    const trout = ContentRegistry.fishSpecies.get("fish.trout")!;
    sim.state.journal.fishRecords["fish.trout"] = {
      discovered: true,
      catchCount: 1,
      largestWeightKg: trout.weightKg.average,
      bestQuality: "common",
      firstCaughtMinute: 10
    };
    const byId = new Map(buildRecordMilestones(sim.state).map((record) => [record.id, record]));
    expect(byId.get("record.weight.fish.trout")?.achieved).toBe(false);
    expect(byId.get("record.grade.fish.trout")?.achieved).toBe(false);
  });

  it("reaches every milestone through the journal query surface", () => {
    const sim = new Simulation();
    const pages = sim.query({ type: "journal.get-pages" }) as unknown as { records: unknown[] };
    expect(Array.isArray(pages.records)).toBe(true);
    expect(pages.records.length).toBe(buildRecordMilestones(sim.state).length);
  });
});
