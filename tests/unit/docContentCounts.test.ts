import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { PROFICIENCY_RANKS } from "../../src/content/progression";

/**
 * A guidance document may state a content count, but it must be the right one.
 *
 * `IMPLEMENTATION_STATUS_CHECKLIST.md` used to restate them and every number
 * drifted: recipes written as 9 and then 11 against a registry holding 14,
 * contract templates as 7 against 28, quests as 18 against 44. The line even
 * said "(`src/content/` owns these counts)" while restating them. `PLAN.md`
 * then carried a task to repair that drift, and the task went stale before
 * anyone applied it — it corrected recipes to 11, which was already wrong.
 *
 * Banning counts outright was the first instinct and it was too blunt: a phase
 * chain naming "P9 Markets", ArcheAge's "~64 crops", and a roadmap proposing
 * "~25 quests" are all legitimate. So this asserts agreement instead. Write the
 * number if it helps a reader; the registry decides whether it is true.
 */

const ROOT = path.resolve(__dirname, "../..");

/**
 * Documents that describe the game as it is now. `PLAN.md` and `03` are
 * forward-looking, and `ARCHEAGE_FARMING_SYSTEM.md` documents a different game
 * — none of them claim current Neva totals.
 */
const CURRENT_STATE_DOCS = [
  "AGENTS.md",
  "LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md",
  "LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md",
  "LLM/IMPLEMENTATION_STATUS_CHECKLIST.md"
];

/**
 * Dated records are exempt, but position cannot decide that. The checklist
 * opens a `## Historical evidence` block early and then puts live sections —
 * `## 3. Roadmap gate status`, `## 7. Next evidence-driven work order` —
 * *below* it, so "everything after the heading is history" silently skipped
 * the very table whose counts had drifted. A record is a line that carries its
 * own date, or sits under a heading that does.
 */
const DATED_RECORD = /\b20\d{2}-\d{2}-\d{2}\b/;
const HEADING = /^(#{1,6})\s/;

const COUNTED: Array<{ noun: string; live: () => number }> = [
  { noun: "crops?", live: () => ContentRegistry.crops.size },
  { noun: "fish species", live: () => ContentRegistry.fishSpecies.size },
  { noun: "recipes?", live: () => ContentRegistry.recipes.size },
  { noun: "quests?", live: () => ContentRegistry.quests.size },
  { noun: "markets?", live: () => ContentRegistry.markets.size },
  { noun: "rods?", live: () => ContentRegistry.rods.size },
  { noun: "NPCs?", live: () => ContentRegistry.npcs.size },
  { noun: "contract templates?", live: () => ContentRegistry.contractTemplates.size }
];

/**
 * A bare number, optionally bolded, optionally followed by one lowercase
 * modifier ("18 linear quests"), then a counted noun. The leading boundary
 * rejects `P9`, `§9`, `3.3` and `v25` — section and version numbers, not counts.
 * The trailing boundary rejects compounds: "2 crop-placement failures" counts
 * failures, not crops.
 */
function claimPattern(noun: string): RegExp {
  return new RegExp(
    `(?<![\\w.§])\\*{0,2}(\\d+)\\*{0,2}\\s+(?:[a-z]+\\s+)?\\*{0,2}(${noun})(?![\\w-])`,
    "gi"
  );
}

interface Claim {
  doc: string;
  line: number;
  stated: number;
  noun: string;
  live: number;
}

function currentStateClaims(doc: string): Claim[] {
  const lines = fs.readFileSync(path.join(ROOT, doc), "utf8").split("\n");

  const claims: Claim[] = [];
  // A dated heading opens a record; its subheadings stay inside it until a
  // heading at the same or shallower depth closes it.
  let recordDepth: number | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index];
    const heading = text.match(HEADING);
    if (heading) {
      const depth = heading[1].length;
      if (recordDepth !== null && depth <= recordDepth) recordDepth = null;
      if (DATED_RECORD.test(text)) recordDepth = depth;
    }
    if (recordDepth !== null || DATED_RECORD.test(text)) continue;
    for (const { noun, live } of COUNTED) {
      for (const match of text.matchAll(claimPattern(noun))) {
        claims.push({
          doc,
          line: index + 1,
          stated: Number(match[1]),
          noun: match[2].toLowerCase(),
          live: live()
        });
      }
    }
  }
  return claims;
}

describe("guidance documents agree with the content registry", () => {
  it("states no content count that the registry contradicts", () => {
    ContentRegistry.initializeAndValidate();
    const wrong = CURRENT_STATE_DOCS.flatMap(currentStateClaims)
      .filter((claim) => claim.stated !== claim.live)
      .map((claim) => `${claim.doc}:${claim.line} says ${claim.stated} ${claim.noun}, registry has ${claim.live}`);
    expect(wrong).toEqual([]);
  });

  it("recognises the shape that actually drifted", () => {
    // Guards the guard. If the matcher stops seeing these, the suite above
    // passes by failing to look.
    ContentRegistry.initializeAndValidate();
    const sample = "Definitions contain **10 crops, 15 fish species, 11 recipes, 7 contract templates, and 18 linear quests**.";
    const seen = COUNTED.flatMap(({ noun }) =>
      [...sample.matchAll(claimPattern(noun))].map((match) => `${match[1]} ${match[2].toLowerCase()}`)
    ).sort();
    expect(seen).toEqual(
      ["10 crops", "11 recipes", "15 fish species", "18 quests", "7 contract templates"].sort()
    );
  });

  it("states the rank ladder exactly as `progression.ts` defines it", () => {
    // The ladder is worth keeping in prose — names and thresholds together
    // orient a reader in a way a pointer cannot. So it is enforced rather than
    // deleted: write it if it helps, but the registry decides whether it is true.
    ContentRegistry.initializeAndValidate();
    const ladder = PROFICIENCY_RANKS.map((rank) => `${rank.xpRequired} ${rank.rankName}`);
    const wrong: string[] = [];

    for (const doc of CURRENT_STATE_DOCS) {
      const text = fs.readFileSync(path.join(ROOT, doc), "utf8");
      for (const rank of PROFICIENCY_RANKS) {
        // A threshold written next to a rank name must be that rank's own, in
        // either order: the ladder writes "15,000 Master", §8 writes
        // "Master (15,000 XP)".
        const forms = [
          new RegExp(`([\\d,]+)\\s+${rank.rankName}\\b`, "g"),
          new RegExp(`\\b${rank.rankName}\\s*\\(([\\d,]+)\\s*XP\\)`, "g")
        ];
        for (const form of forms) {
          for (const match of text.matchAll(form)) {
            const stated = Number(match[1].replace(/,/g, ""));
            if (stated !== rank.xpRequired) {
              wrong.push(`${doc} pairs ${match[1]} with ${rank.rankName}, ladder has ${rank.xpRequired}`);
            }
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(ladder).toHaveLength(8);
  });

  it("does not mistake section, phase or version numbers for counts", () => {
    const notCounts = "P9 Markets → P3 Farming; see §9 Markets and §3.3 Crop Stages at schema v25.";
    const seen = COUNTED.flatMap(({ noun }) => [...notCounts.matchAll(claimPattern(noun))]);
    expect(seen).toEqual([]);
  });
});
