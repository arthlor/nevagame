import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CROP_GROWTH_MODIFIERS } from "../../src/simulation/farming/calculateCropGrowth";
import {
  FRESHNESS_PRICE_BRACKETS,
  FRESHNESS_STORAGE_MODIFIERS
} from "../../src/simulation/fishing/calculateFreshness";
import {
  CROP_QUALITY_PRICE_MULTIPLIER,
  DAILY_TREND_AMPLITUDE,
  DEMAND_ELASTICITY,
  DEMAND_MAX,
  DEMAND_MIN,
  HOURLY_NOISE_AMPLITUDE,
  RETAIL_MARKUP
} from "../../src/simulation/economy/marketPricing";
import {
  FERTILITY_MAX,
  FERTILITY_MIN,
  FERTILITY_RESTORE
} from "../../src/simulation/domains/FarmingDomain";

/**
 * Tuning tables may stay in prose, but the code owns the values.
 *
 * The crop growth modifiers were the inverse of the Work Capacity case: the
 * simulation held them as bare literals behind a comment reading
 * `// LIVE 02: preferred 1.20 | neutral 1.00 | poor 0.80`, which made the
 * *document* the de-facto owner of live tuning. They are now
 * `CROP_GROWTH_MODIFIERS`, and this test holds `02` §2's table to them — so the
 * table can keep explaining the model without being free to drift from it.
 */

const ROOT = path.resolve(__dirname, "../..");
const GAMEPLAY_DOC = "LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md";

/** `label 1.20 | other label 0.80` → { label: 1.2, "other label": 0.8 } */
function parseRow(row: string): Record<string, number> {
  const entries: Record<string, number> = {};
  for (const cell of row.split("|")) {
    const match = cell.trim().match(/^(.*?)\s+(\d+(?:\.\d+)?)$/);
    if (match) entries[match[1].trim().toLowerCase()] = Number(match[2]);
  }
  return entries;
}

function growthTable(): Record<string, Record<string, number>> {
  const text = fs.readFileSync(path.join(ROOT, GAMEPLAY_DOC), "utf8");
  const table: Record<string, Record<string, number>> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^(climate|moisture|fertility|weather):\s*(.+)$/);
    if (match) table[match[1]] = parseRow(match[2]);
  }
  const clamp = text.match(/total clamp:\s*([\d.]+)x[–-]([\d.]+)x/);
  if (clamp) table.totalClamp = { minimum: Number(clamp[1]), maximum: Number(clamp[2]) };
  return table;
}

describe("gameplay tuning tables agree with the simulation", () => {
  const table = growthTable();

  it("finds the growth table it is checking", () => {
    // Guards the guard: a parse that quietly returned nothing would make every
    // assertion below pass without comparing anything.
    expect(Object.keys(table).sort()).toEqual(
      ["climate", "fertility", "moisture", "totalClamp", "weather"].sort()
    );
  });

  it("states the crop growth modifiers the simulation actually applies", () => {
    const { climate, moisture, fertility, weather, totalClamp } = CROP_GROWTH_MODIFIERS;
    expect(table.climate).toEqual({
      preferred: climate.preferred,
      neutral: climate.neutral,
      poor: climate.poor
    });
    expect(table.moisture).toEqual({
      healthy: moisture.healthy,
      dry: moisture.dry,
      "very dry": moisture.veryDry
    });
    expect(table.fertility).toEqual({
      excellent: fertility.excellent,
      normal: fertility.normal,
      poor: fertility.poor
    });
    expect(table.weather).toEqual({
      "light-rain": weather.wet,
      "heavy-rain": weather.wet,
      storm: weather.wet,
      drought: weather.drought,
      other: weather.other
    });
    expect(table.totalClamp).toEqual({
      minimum: totalClamp.minimum,
      maximum: totalClamp.maximum
    });
  });
});

describe("cargo freshness tables agree with the simulation", () => {
  const text = fs.readFileSync(path.join(ROOT, GAMEPLAY_DOC), "utf8");

  it("states the storage modifiers the simulation applies", () => {
    const row = text.match(/^carried openly .+$/m);
    expect(row).not.toBeNull();
    expect(parseRow(row![0])).toEqual({
      "carried openly": FRESHNESS_STORAGE_MODIFIERS.player,
      "transom hook": FRESHNESS_STORAGE_MODIFIERS["boat-hook"],
      "boat hold": FRESHNESS_STORAGE_MODIFIERS["boat-hold"],
      "ice box": FRESHNESS_STORAGE_MODIFIERS.iced,
      "cold storage": FRESHNESS_STORAGE_MODIFIERS["cold-storage"],
      crate: FRESHNESS_STORAGE_MODIFIERS.crate,
      carriage: FRESHNESS_STORAGE_MODIFIERS.carriage,
      ground: FRESHNESS_STORAGE_MODIFIERS.ground
    });
  });

  it("states the freshness price bands the simulation applies", () => {
    // `90–100 1.00`, `75–89 0.95`, … — the band's floor is what selects it.
    const bands = [...text.matchAll(/^(\d+)[–-](?:\d+)\s+(\d+\.\d+)$/gm)]
      .map((match) => ({ atOrAbove: Number(match[1]), multiplier: Number(match[2]) }));
    expect(bands.length).toBeGreaterThan(0);
    expect(bands).toEqual(FRESHNESS_PRICE_BRACKETS.map((bracket) => ({ ...bracket })));
  });
});

describe("market and soil figures agree with the simulation", () => {
  const text = fs.readFileSync(path.join(ROOT, GAMEPLAY_DOC), "utf8");
  /** The first bolded number following `label` in the prose. */
  const boldAfter = (label: string): number | null => {
    const match = text.match(new RegExp(`${label}[^.]*?\\*\\*(?:±)?(\\d+(?:\\.\\d+)?)`, "i"));
    return match ? Number(match[1]) : null;
  };

  it("states the demand curve the market prices with", () => {
    expect(boldAfter("elasticity")).toBe(DEMAND_ELASTICITY);
    expect(boldAfter("item/day trend")).toBe(DAILY_TREND_AMPLITUDE);
    expect(boldAfter("item/hour noise")).toBe(HOURLY_NOISE_AMPLITUDE);
    // This one reads "**1.25 retail multiplier**" — number before the label.
    const retail = text.match(/\*\*(\d+(?:\.\d+)?) retail multiplier\*\*/);
    expect(retail).not.toBeNull();
    expect(Number(retail![1])).toBe(RETAIL_MARKUP);
  });

  it("states the demand clamp the market enforces", () => {
    const clamp = text.match(/Demand clamp:\s*\*\*(\d+\.\d+)x[–-](\d+\.\d+)x\*\*/);
    expect(clamp).not.toBeNull();
    expect([Number(clamp![1]), Number(clamp![2])]).toEqual([DEMAND_MIN, DEMAND_MAX]);
  });

  it("states the produce grade price ladder the market applies", () => {
    const ladder = text.match(
      /Crop grade:\*\* Common ×(\d+\.\d+), Fine ×(\d+\.\d+), Exceptional ×(\d+\.\d+), Prize ×(\d+\.\d+)/
    );
    expect(ladder).not.toBeNull();
    expect(ladder!.slice(1).map(Number)).toEqual([
      CROP_QUALITY_PRICE_MULTIPLIER.common,
      CROP_QUALITY_PRICE_MULTIPLIER.fine,
      CROP_QUALITY_PRICE_MULTIPLIER.exceptional,
      CROP_QUALITY_PRICE_MULTIPLIER.prize
    ]);
  });

  it("states the soil fertility floor, restore and ceiling", () => {
    const line = text.match(/^Harvest reduces fertility.+$/m);
    expect(line).not.toBeNull();
    const numbers = [...line![0].matchAll(/\*\*\+?(\d+)(?:[–-](\d+))?\*\*/g)].flatMap((m) =>
      m[2] ? [Number(m[1]), Number(m[2])] : [Number(m[1])]
    );
    expect(numbers).toEqual([FERTILITY_MIN, FERTILITY_RESTORE, FERTILITY_MIN, FERTILITY_MAX]);
  });
});
