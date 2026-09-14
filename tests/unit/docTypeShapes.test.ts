import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A guidance document may abridge a type, but it may not lie about one.
 *
 * `01` and `02` between them paste 23 fenced `ts` blocks declaring 30 types,
 * many of which shadow real exports in `src/simulation/core/types.ts`. A pasted
 * shape is a copy, and copies drift: a field gets renamed in code and the doc
 * keeps teaching the old name to whoever reads it next.
 *
 * The rule is subset, not equality. Showing three fields of `GameState` to make
 * a point is fine and desirable; showing a field that no longer exists is not.
 */

const ROOT = path.resolve(__dirname, "../..");

const DOCS = [
  "LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md",
  "LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md"
];

/**
 * Every runtime source. Four hand-picked files used to be the whole search, so
 * a documented `SaveEnvelope` (declared in persistence) was never compared.
 */
function typeSources(directory = "src"): string[] {
  return fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return typeSources(relative);
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

/**
 * Doc-only shapes with no runtime counterpart, each with the reason it may
 * stand alone. Anything else must name a real runtime type: an unknown name
 * used to be skipped as "illustrative", which is how a `ContractTemplate` block
 * kept six fields the runtime `ContractTemplateDefinition` never had.
 */
const ILLUSTRATIVE: Readonly<Record<string, string>> = {};

/**
 * Field names of every `interface X { ... }` in a chunk of TypeScript. Nested
 * object literals are skipped by depth tracking so an inline `{ x: number }`
 * does not contribute phantom fields to its parent.
 */
function interfaceFields(source: string): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  // Classes count too: `01` documents `ContentRegistry`'s registries, which are
  // static members of a class rather than an interface.
  const declaration = /(?:export\s+)?(?:interface|(?:abstract\s+)?class)\s+(\w+)[^{]*\{/g;
  let match: RegExpExecArray | null;

  while ((match = declaration.exec(source)) !== null) {
    const name = match[1];
    let depth = 1;
    let index = declaration.lastIndex;
    const body: string[] = [];
    let line = "";

    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      if (depth === 1 && character === "\n") {
        body.push(line);
        line = "";
      } else if (depth >= 1) {
        line += character;
      }
      index += 1;
    }
    body.push(line);

    const fields = new Set<string>();
    for (const entry of body) {
      // `name?: T` / `readonly name: T` at the interface's own depth.
      const field = entry.trim().match(
        /^(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:readonly\s+)?([A-Za-z_]\w*)\s*\??\s*:/
      );
      if (field) fields.add(field[1]);
    }
    if (fields.size > 0) found.set(name, fields);
  }
  return found;
}

function docInterfaces(doc: string): Map<string, Set<string>> {
  const text = fs.readFileSync(path.join(ROOT, doc), "utf8");
  const blocks = [...text.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => match[1]);
  return interfaceFields(blocks.join("\n"));
}

describe("guidance documents do not misdescribe runtime types", () => {
  const runtime = new Map<string, Set<string>>();
  for (const file of typeSources()) {
    for (const [name, fields] of interfaceFields(fs.readFileSync(path.join(ROOT, file), "utf8"))) {
      const merged = runtime.get(name) ?? new Set<string>();
      for (const field of fields) merged.add(field);
      runtime.set(name, merged);
    }
  }

  it("reads the runtime shapes it is checking against", () => {
    // Guards the guard: a parser that silently found nothing would make every
    // assertion below vacuous.
    expect(runtime.has("GameState")).toBe(true);
    expect(runtime.get("SoilState")).toEqual(new Set(["fertility", "moistureRetention"]));
    expect(runtime.get("GameState")?.has("markets")).toBe(true);
    expect(runtime.get("SaveEnvelope")?.has("savedAtUtcMs")).toBe(true);
    expect(runtime.get("ContentRegistry")?.has("fishSpecies")).toBe(true);
  });

  it("documents only shapes that exist at runtime, unless marked illustrative", () => {
    const unknown: string[] = [];
    for (const doc of DOCS) {
      for (const name of docInterfaces(doc).keys()) {
        if (!runtime.has(name) && !(name in ILLUSTRATIVE)) {
          unknown.push(`${doc} interface ${name} — no runtime type by that name; rename it to the type it describes or list it in ILLUSTRATIVE with a reason`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("names only fields the runtime still declares", () => {
    const wrong: string[] = [];
    for (const doc of DOCS) {
      for (const [name, documented] of docInterfaces(doc)) {
        const actual = runtime.get(name);
        if (!actual) continue; // Reported by the test above unless listed in ILLUSTRATIVE.
        for (const field of documented) {
          if (!actual.has(field)) {
            wrong.push(`${doc} ${name}.${field} — not on the runtime ${name}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
