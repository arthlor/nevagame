import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "../../src/persistence/SaveSchema";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";

/**
 * `01`'s checkable claims about the running system.
 *
 * Most of `01` is architecture and invariants — prose that no test can replace,
 * and which should stay. Two things in it are derivable, and both had already
 * gone stale somewhere else in the repo: `PLAN.md` was describing the save
 * format as "schema v25 / rev 9" against a v33 / layout 13 build.
 *
 * §6.1 declares itself the single owner of the migration history and instructs
 * that a row be appended "in the same change that adds the migration". That is
 * a rule a test can hold people to.
 */

const ROOT = path.resolve(__dirname, "../..");
const FOUNDATIONS_DOC = "LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md";

function foundations(): string {
  return fs.readFileSync(path.join(ROOT, FOUNDATIONS_DOC), "utf8");
}

/** Every `| v33 | 12 → 13 |` style row of the §6.1 ledger, in document order. */
function ledgerRows(): Array<{ schema: number; layout: number | null }> {
  return [...foundations().matchAll(/^\|\s*v(\d+)\s*\|\s*([^|]*)\|/gm)].map((match) => {
    const layoutCell = match[2].trim();
    // "12 → 13" records a move; "10" a no-move row; "—" no layout at all.
    const layouts = [...layoutCell.matchAll(/\d+/g)].map((value) => Number(value[0]));
    return {
      schema: Number(match[1]),
      layout: layouts.length > 0 ? layouts[layouts.length - 1] : null
    };
  });
}

describe("the migration ledger describes the build that ships", () => {
  it("finds the ledger it is checking", () => {
    // Guards the guard: an empty parse would make the assertions below vacuous.
    const rows = ledgerRows();
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.map((row) => row.schema)).toEqual([...rows].sort((a, b) => a.schema - b.schema).map((row) => row.schema));
  });

  it("ends at the schema version the save layer actually writes", () => {
    const rows = ledgerRows();
    const highest = rows[rows.length - 1];
    expect({ ledgerHead: highest.schema, code: CURRENT_SCHEMA_VERSION })
      .toEqual({ ledgerHead: CURRENT_SCHEMA_VERSION, code: CURRENT_SCHEMA_VERSION });
  });

  it("ends at the world layout revision the world actually builds", () => {
    const withLayout = ledgerRows().filter((row) => row.layout !== null);
    const latest = withLayout[withLayout.length - 1].layout;
    expect({ ledgerHead: latest, code: WORLD_LAYOUT_REVISION })
      .toEqual({ ledgerHead: WORLD_LAYOUT_REVISION, code: WORLD_LAYOUT_REVISION });
  });

  it("has no gap between the ledger rows", () => {
    // A missing row means a migration shipped without its entry, which is the
    // failure §6.1's own append rule exists to prevent.
    const schemas = ledgerRows().map((row) => row.schema);
    const gaps = schemas
      .slice(1)
      .map((schema, index) => ({ from: schemas[index], to: schema }))
      .filter((step) => step.to !== step.from + 1)
      .map((step) => `v${step.from} → v${step.to}`);
    expect(gaps).toEqual([]);
  });
});

describe("the stack section lists scripts that exist", () => {
  it("names only npm scripts package.json defines", () => {
    const required = foundations().match(/^Required scripts[^:]*:\s*(.+)$/m);
    expect(required).not.toBeNull();
    const named = [...required![1].matchAll(/`([a-z][a-z:]*)`/g)].map((match) => match[1]);
    expect(named.length).toBeGreaterThan(4);

    const scripts = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
    ).scripts as Record<string, string>;
    expect(named.filter((name) => !(name in scripts))).toEqual([]);
  });
});
