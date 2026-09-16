import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Executable form of the Work Capacity ownership rules that `LLM/02` §14 used
 * to assert in prose.
 *
 * Prose was accurate and still did not hold the line: §14 correctly said
 * planting costs 12 while `GameApp` quoted a hardcoded 10 into the interaction
 * prompt, so between 10 and 11 Work the prompt read as affordable and the
 * action was refused. A sentence cannot fail a build. These checks can.
 *
 * They deliberately assert *ownership and single-sourcing*, not the numbers
 * themselves — the constants are the numbers, and restating them here would
 * recreate exactly the duplication that caused the bug.
 */

const ROOT = path.resolve(__dirname, "../..");
const PROGRESSION_DOMAIN = "src/simulation/domains/ProgressionDomain.ts";

function sourceFiles(...roots: string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) found.push(path.relative(ROOT, full));
    }
  };
  for (const root of roots) walk(path.join(ROOT, root));
  return found.sort();
}

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

/** Lines with their 1-based numbers, comments and blanks dropped. */
function codeLines(relative: string): Array<{ line: number; text: string }> {
  return read(relative)
    .split("\n")
    .map((text, index) => ({ line: index + 1, text: text.trim() }))
    .filter(({ text }) => text.length > 0 && !text.startsWith("//") && !text.startsWith("*") && !text.startsWith("/*"));
}

describe("Work Capacity ownership contract", () => {
  it("keeps every Work debit and credit inside ProgressionDomain", () => {
    // The pool has one owner. `refundLostFightWork` used to write
    // `capacity.current` directly from FishingDomain, which is how a refund
    // could be computed against a different proficiency discount than the
    // spend it was refunding.
    const offenders: string[] = [];
    for (const file of sourceFiles("src/simulation", "src/app", "src/ui")) {
      if (file === PROGRESSION_DOMAIN) continue;
      for (const { line, text } of codeLines(file)) {
        // A direct write to the pool, under any local alias.
        if (/\bworkCapacity\.current\s*(=[^=]|[-+]=)/.test(text)) {
          offenders.push(`${file}:${line} writes workCapacity.current`);
        }
        // Binding the pool to a local is how an aliased write gets in.
        if (/(?:const|let|var)\s+\w+\s*=\s*[\w.]*\bworkCapacity\b\s*;/.test(text)) {
          offenders.push(`${file}:${line} aliases the Work pool for mutation`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("routes every Work cost through a named constant, never a literal", () => {
    // This is the check that would have failed on the planting prompt: a bare
    // number reaching a quote or a spend is a cost table nobody can grep.
    const offenders: string[] = [];
    for (const file of sourceFiles("src/simulation", "src/app", "src/ui")) {
      for (const { line, text } of codeLines(file)) {
        if (/\b(quoteWorkCost|trySpendWork|getDiscountedActionCost)\(\s*-?[0-9]/.test(text)) {
          offenders.push(`${file}:${line} passes a Work cost literal`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("charges no Work for traversal, cargo, trading, quests or contracts", () => {
    // §14: "Traversal, boats, cargo handling, trading, quests, and dialogue do
    // not cost Work." Work gates manual production only.
    const workFree = [
      "src/simulation/domains/NavigationDomain.ts",
      "src/simulation/domains/CargoDomain.ts",
      "src/simulation/domains/MarketDomain.ts",
      "src/simulation/domains/QuestDomain.ts",
      "src/simulation/domains/ContractDomain.ts"
    ];
    for (const file of workFree) {
      expect({ file, spends: /trySpendWork|workCapacity/.test(read(file)) })
        .toEqual({ file, spends: false });
    }
  });

  it("names one owner per Work cost so presentation cannot restate it", () => {
    // Each cost is exported from exactly one module. The UI derives its table
    // from these rather than keeping a second copy.
    const owners = {
      "src/simulation/domains/FarmingDomain.ts": ["FARMING_ACTION_COST"],
      "src/simulation/domains/FishingDomain.ts": [
        "BASIC_FISHING_WORK_COST",
        "SPORT_FISHING_WORK_COST_BY_CLASS",
        "SPORT_FISHING_WORK_REFUND_RATIO"
      ],
      "src/simulation/domains/ProcessingDomain.ts": ["PROCESSING_WORK_COST"],
      [PROGRESSION_DOMAIN]: [
        "WORK_CAPACITY_MAXIMUM",
        "WORK_DAILY_EARN_CAP",
        "WORK_REST_FRACTION",
        "WORK_REST_BASELINE_FRACTION",
        "WORK_MEAL_DAILY_LIMIT",
        "WORK_PASSIVE_REGEN_AMOUNT",
        "WORK_PASSIVE_REGEN_INTERVAL_SECONDS"
      ]
    };
    const all = sourceFiles("src/simulation", "src/app", "src/ui");
    for (const [owner, constants] of Object.entries(owners)) {
      for (const name of constants) {
        expect({ name, exportedBy: owner, present: new RegExp(`export const ${name}\\b`).test(read(owner)) })
          .toEqual({ name, exportedBy: owner, present: true });
        const duplicates = all.filter(
          (file) => file !== owner && new RegExp(`export const ${name}\\b`).test(read(file))
        );
        expect({ name, duplicates }).toEqual({ name, duplicates: [] });
      }
    }
  });
});
