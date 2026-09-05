// tests/unit/layoutEditorSourceRoundTrip.test.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  applyLayoutEditToSources,
  atomicWriteSourceFile,
  isLayoutEditCommit,
  isSafeLayoutId,
  parseLayoutSource,
  readLayoutSources,
  type LayoutSourceFiles
} from "../../tools/layout-editor/patchPlacement";
import {
  LAYOUT_EDITOR_SOURCE_FILES,
  type LayoutEditCommit
} from "../../src/layout-editor/layoutEdit";

const ROOT = path.resolve(__dirname, "../..");

/**
 * Every editable kind, checked against the layout sources the game actually
 * ships rather than a fixture. The patcher matches source by shape, so a
 * refactor in `WorldLayout.ts` or `FarmLayout.ts` can quietly stop a field from
 * being written while the editor still reports "Wrote <id>". That is how the
 * bridge lost its yaw: the rotation write was a `String.replace` whose pattern
 * had hardcoded `yOffset: 0.1`, so it matched nothing and threw nothing.
 */
const WORLD_POSE = { x: 12.25, z: -33.75, rotationY: 0.7854 } as const;

/** `WORLD_POSE` minus `STARTER_FARM_LAYOUT.origin` (-65, -55). */
const FARM_LOCAL_X = "77.25";
const FARM_LOCAL_Z = "21.25";
const WORLD_X = "12.25";
const WORLD_Z = "-33.75";
const YAW = "0.7854";
/** Processing stations store yaw as `visualRotationY - π`. */
const STATION_YAW = "-2.3562";

interface RoundTripCase {
  readonly label: string;
  readonly commit: LayoutEditCommit;
  /** Values that must appear in text the commit added. */
  readonly expects: readonly string[];
}

const CASES: readonly RoundTripCase[] = [
  {
    label: "landmark bridge",
    commit: { kind: "landmark", id: "bridge", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  },
  {
    label: "landmark dock",
    commit: { kind: "landmark", id: "dock", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  },
  {
    label: "landmark lighthouse",
    commit: { kind: "landmark", id: "lighthouse", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  },
  {
    label: "landmark fish-market",
    commit: { kind: "landmark", id: "fish-market", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  },
  {
    label: "landmark produce-stall",
    commit: { kind: "landmark", id: "produce-stall", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  },
  {
    label: "world-anchor harbor fish table",
    commit: { kind: "world-anchor", id: "struct.harbor_fish_table", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, STATION_YAW]
  },
  {
    label: "farmstead farmhouse",
    commit: { kind: "farmstead", id: "farmhouse", ...WORLD_POSE },
    expects: [FARM_LOCAL_X, FARM_LOCAL_Z, YAW]
  },
  {
    label: "farmstead well",
    commit: { kind: "farmstead", id: "well", ...WORLD_POSE },
    expects: [FARM_LOCAL_X, FARM_LOCAL_Z, YAW]
  },
  {
    label: "farm-structure mill",
    commit: { kind: "farm-structure", id: "struct.starter_mill", ...WORLD_POSE },
    expects: [FARM_LOCAL_X, FARM_LOCAL_Z, STATION_YAW]
  },
  {
    label: "farm-prop hay bale",
    commit: { kind: "farm-prop", id: "farm_hay_a", ...WORLD_POSE },
    expects: [FARM_LOCAL_X, FARM_LOCAL_Z, YAW]
  },
  {
    label: "farm-fence generated post",
    commit: { kind: "farm-fence", id: "fence_north_0", ...WORLD_POSE },
    expects: [FARM_LOCAL_X, FARM_LOCAL_Z, YAW]
  },
  {
    label: "architecture-pad village inn",
    commit: { kind: "architecture-pad", id: "village.inn", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  },
  {
    label: "authored-detail orchard turnips",
    commit: { kind: "authored-detail", id: "authored.orchard.turnips", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  },
  {
    label: "authored-detail mapped to an architecture pad",
    commit: { kind: "authored-detail", id: "authored.village.inn", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  },
  {
    label: "environment-override seeded instance",
    commit: { kind: "environment-override", id: "seeded-fill.tree_1", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  },
  {
    label: "interior-prop carrot",
    commit: { kind: "interior-prop", id: "interior_carrot", y: 1.5, ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  },
  {
    label: "npc elspeth",
    commit: { kind: "npc", id: "npc.elspeth", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  },
  {
    label: "npc silas (harbor anchor follows)",
    commit: { kind: "npc", id: "npc.silas", ...WORLD_POSE },
    expects: [WORLD_X, WORLD_Z, YAW]
  }
];

const SOURCE_KEYS = [
  "farmLayout",
  "worldLayout",
  "worldAnchors",
  "environment",
  "interior",
  "npcs"
] as const satisfies readonly (keyof LayoutSourceFiles)[];

/** Lines present in `next` that were not anywhere in `previous`. */
function addedText(previous: LayoutSourceFiles, next: LayoutSourceFiles): string {
  const added: string[] = [];
  for (const key of SOURCE_KEYS) {
    if (previous[key] === next[key]) continue;
    const before = new Set(previous[key].split("\n"));
    for (const line of next[key].split("\n")) {
      if (!before.has(line)) added.push(line);
    }
  }
  return added.join("\n");
}

describe("layout editor writes land in the shipped layout sources", () => {
  const baseline = readLayoutSources(ROOT);
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  for (const testCase of CASES) {
    it(`writes x, z and rotation for ${testCase.label}`, () => {
      const next = applyLayoutEditToSources(baseline, testCase.commit);
      const touched = SOURCE_KEYS.filter((key) => baseline[key] !== next[key]);
      expect(touched.length, `${testCase.label} wrote nothing`).toBeGreaterThan(0);

      const added = addedText(baseline, next);
      for (const value of testCase.expects) {
        expect(added, `${testCase.label} never wrote ${value}`).toContain(value);
      }
    });

    it(`is idempotent for ${testCase.label}`, () => {
      const once = applyLayoutEditToSources(baseline, testCase.commit);
      const twice = applyLayoutEditToSources(once, testCase.commit);
      for (const key of SOURCE_KEYS) {
        expect(twice[key], `${testCase.label} kept drifting in ${key}`).toBe(once[key]);
      }
    });
  }

  it("passes every allowlisted source through the write gate unchanged", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-layout-gate-"));
    tempDirs.push(tempDir);
    for (const key of SOURCE_KEYS) {
      const target = path.join(tempDir, path.basename(LAYOUT_EDITOR_SOURCE_FILES[key]));
      // The gate parse-checks before renaming, so a source the parser cannot
      // read blocks every commit that touches it. `FarmLayout.ts` was in that
      // state: recast's ast-types rejected `interface X extends Y`, so no farm
      // prop, fence, structure, or farmstead edit could ever be written.
      expect(() => atomicWriteSourceFile(target, baseline[key]), key).not.toThrow();
      expect(fs.readFileSync(target, "utf8"), key).toBe(baseline[key]);
    }
  });

  it("still refuses a source the parser cannot read", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-layout-gate-"));
    tempDirs.push(tempDir);
    const target = path.join(tempDir, "Broken.ts");
    expect(() => atomicWriteSourceFile(target, "export const a = { x: 1 ,,};")).toThrow(
      /syntax validation failed/
    );
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readdirSync(tempDir)).toHaveLength(0);
  });

  it("accepts the id shapes the shipped layouts actually use", () => {
    expect(isSafeLayoutId("authored.orchard.turnips")).toBe(true);
    expect(isSafeLayoutId("struct.starter_mill")).toBe(true);
    expect(isSafeLayoutId("fence_west_-4")).toBe(true);
    expect(isSafeLayoutId("seeded-fill.tree_1")).toBe(true);
    expect(isSafeLayoutId("authored.copy.prop_crate_a.1")).toBe(true);
  });

  it("refuses a layout id that could break out of a generated string literal", () => {
    const hostile = 'a": {} }; export const PWN = 1; export const SHIM: any = { "b';
    // The payload is valid TypeScript once interpolated, so the parse gate on
    // its own would have let it through: the charset is what stops it.
    expect(isSafeLayoutId(hostile)).toBe(false);
    expect(isLayoutEditCommit({
      kind: "environment-override",
      id: hostile,
      x: 1,
      z: 2,
      rotationY: 0
    })).toBe(false);
    expect(() =>
      applyLayoutEditToSources(baseline, {
        kind: "environment-override",
        id: hostile,
        x: 1,
        z: 2,
        rotationY: 0
      })
    ).toThrow(/Unsafe layout id/);
  });

  it("still accepts interface heritage the game's own layouts declare", () => {
    // `interface FarmsteadAnchor extends FarmPoint` is the exact shape that
    // made every farm commit fail while the gate parsed through recast.
    expect(() => parseLayoutSource(
      "interface P { x: number }\nexport interface A extends P { id: string }\nexport const a: A[] = [];"
    )).not.toThrow();
  });

  it("refuses to guess when a scoped id is ambiguous", () => {
    const duplicated: LayoutSourceFiles = {
      ...baseline,
      farmLayout: baseline.farmLayout.replace(
        /(const STARTER_PROP_ANCHORS = \[\n)/,
        '$1  { id: "farm_hay_a", type: "hay-bale", x: 0, z: 0, rotationY: 0, scale: 1 },\n'
      )
    };
    expect(duplicated.farmLayout).not.toBe(baseline.farmLayout);
    expect(() =>
      applyLayoutEditToSources(duplicated, {
        kind: "farm-prop",
        id: "farm_hay_a",
        ...WORLD_POSE
      })
    ).toThrow(/Ambiguous layout id/);
  });
});
