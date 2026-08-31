import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { parse } from "recast";

import {
  patchPlacementInFile,
  batchPatchPlacements,
  atomicWriteSourceFile,
  applyMutationToAst,
  evalLayoutNumber,
  replaceFieldValue,
  extractBalanced,
  isLayoutEditCommit,
  applyLayoutEditToSources,
  LayoutEditPatchError,
  tsParser,
  type PlacementMutation,
  type LayoutSourceFiles
} from "../../tools/layout-editor/patchPlacement";

describe("Empirical Challenge Suite: patchPlacement.ts (M2 / R2)", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-patch-challenge-"));
    testFile = path.join(tempDir, "TestPlacements.ts");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. Complex Comments & Formatting Preservation
  // =========================================================================
  describe("Complex Comments & Formatting Preservation", () => {
    const CODE_WITH_EXTREME_COMMENTS = `/**
 * @fileoverview World Placement Definitions
 * @module Neva/World/Placements
 * @author Codex & Neva Team
 *
 * ==========================================
 * DO NOT EDIT MANUALLY OUTSIDE LAYOUT EDITOR
 * ==========================================
 */

import { AuthoredEnvironmentPlacement } from "./types";

// Section 1: Starter Farm Props
// ===============================

export const STARTER_PROP_ANCHORS = Object.freeze([
  // Lead comment on first item
  {
    // Inner leading comment
    id: "prop_hay_01", // inline on id
    type: "hay-bale", /* inline block on type */
    x: 10.5, // coord x
    y: 0.25,
    z: -30.75, // coord z
    rotationY: 0.7854,
    scale: 1.0 // scale factor
  }, // Trailing comment on prop_hay_01

  /* Block comment between elements
   * Note: The cart below is tied to the tutorial trigger
   */
  {
    id: "prop_cart_01",
    type: "hand-cart",
    x: 18.0,
    z: -25.0,
    rotationY: 1.5708,
    scale: 1.2
  },

  // Final prop in this tier
  {
    id: "prop_lantern_01",
    type: "lantern-post",
    x: 25.0,
    z: -35.0,
    rotationY: 0.0
  }
  // Comment right before array closing bracket
]);

/**
 * Authored details collection
 */
export const AUTHORED_DETAIL_PLACEMENTS = [
  // Detail 1: Old wagon by the river
  authoredPlacement("authored.wagon.river", {
    assetId: "prop_wagon_cozy_a",
    x: -45.5,
    y: 1.2,
    z: -80.0,
    rotationY: 0.35,
    scale: [1.1, 1.1, 1.1],
    grounding: [0.1, 0.2],
    practicalLight: true
  }), // End of wagon placement

  // Detail 2: Pier bench
  authoredPlacement("authored.bench.pier", {
    assetId: "prop_bench_wood_a",
    x: 60.0,
    z: -12.0,
    rotationY: 3.1415
  })
];

// Footer comment at EOF
`;

    it("preserves every single comment and formatting across single property update", () => {
      fs.writeFileSync(testFile, CODE_WITH_EXTREME_COMMENTS, "utf8");

      patchPlacementInFile(testFile, {
        kind: "update",
        targetId: "prop_hay_01",
        data: {
          x: 12.3456,
          z: -99.8765
        }
      });

      const updated = fs.readFileSync(testFile, "utf8");

      // Verify updated numeric values with 4 decimal places
      expect(updated).toContain("x: 12.3456");
      expect(updated).toContain("z: -99.8765");

      // Verify file header comments intact
      expect(updated).toContain("@fileoverview World Placement Definitions");
      expect(updated).toContain("@module Neva/World/Placements");
      expect(updated).toContain("DO NOT EDIT MANUALLY OUTSIDE LAYOUT EDITOR");

      // Verify section comments intact
      expect(updated).toContain("// Section 1: Starter Farm Props");
      expect(updated).toContain("// Lead comment on first item");
      expect(updated).toContain("// Inner leading comment");
      expect(updated).toContain("// Trailing comment on prop_hay_01");

      // Verify inter-element block comments intact
      expect(updated).toContain("/* Block comment between elements");
      expect(updated).toContain("* Note: The cart below is tied to the tutorial trigger");

      // Verify array trailing comments and footer comments intact
      expect(updated).toContain("// Final prop in this tier");
      expect(updated).toContain("// Comment right before array closing bracket");
      expect(updated).toContain("// Footer comment at EOF");

      // Verify AST validates as valid TypeScript
      expect(() => parse(updated, { parser: tsParser })).not.toThrow();
    });

    it("preserves comments when adding a new element to an array with block comments", () => {
      fs.writeFileSync(testFile, CODE_WITH_EXTREME_COMMENTS, "utf8");

      patchPlacementInFile(testFile, {
        kind: "add",
        targetId: "prop_barrel_01",
        data: {
          type: "barrel-stack",
          x: 5.0,
          z: -15.0,
          rotationY: 0.0,
          scale: 1.5
        }
      });

      const updated = fs.readFileSync(testFile, "utf8");

      expect(updated).toContain('id: "prop_barrel_01"');
      expect(updated).toContain('type: "barrel-stack"');
      expect(updated).toContain("x: 5");
      expect(updated).toContain("scale: 1.5");

      // All existing comments must remain
      expect(updated).toContain("// Section 1: Starter Farm Props");
      expect(updated).toContain("/* Block comment between elements");
      expect(updated).toContain("// Footer comment at EOF");

      expect(() => parse(updated, { parser: tsParser })).not.toThrow();
    });

    it("preserves surrounding comments when deleting middle element from array", () => {
      fs.writeFileSync(testFile, CODE_WITH_EXTREME_COMMENTS, "utf8");

      patchPlacementInFile(testFile, {
        kind: "delete",
        targetId: "prop_cart_01"
      });

      const updated = fs.readFileSync(testFile, "utf8");

      expect(updated).not.toContain('id: "prop_cart_01"');
      expect(updated).toContain('id: "prop_hay_01"');
      expect(updated).toContain('id: "prop_lantern_01"');

      // Check comments around deleted element
      expect(updated).toContain("// Lead comment on first item");
      expect(updated).toContain("// Final prop in this tier");
      expect(updated).toContain("// Footer comment at EOF");

      expect(() => parse(updated, { parser: tsParser })).not.toThrow();
    });

    it("preserves authoredPlacement calls and complex array / boolean parameters", () => {
      fs.writeFileSync(testFile, CODE_WITH_EXTREME_COMMENTS, "utf8");

      patchPlacementInFile(testFile, {
        kind: "update",
        targetId: "authored.wagon.river",
        data: {
          x: -50.0,
          practicalLight: false,
          scale: [2.0, 2.0, 2.0]
        }
      });

      const updated = fs.readFileSync(testFile, "utf8");

      expect(updated).toContain('authoredPlacement("authored.wagon.river"');
      expect(updated).toContain("x: -50");
      expect(updated).toContain("practicalLight: false");
      expect(updated).toContain("scale: [2, 2, 2]");
      expect(updated).toContain("// Detail 1: Old wagon by the river");
      expect(updated).toContain("// End of wagon placement");

      expect(() => parse(updated, { parser: tsParser })).not.toThrow();
    });

    it("adds a new authoredPlacement function call cleanly", () => {
      fs.writeFileSync(testFile, CODE_WITH_EXTREME_COMMENTS, "utf8");

      patchPlacementInFile(testFile, {
        kind: "add",
        targetId: "authored.fence.corner",
        data: {
          assetId: "prop_fence_wood_a",
          x: 10.0,
          z: 20.0,
          rotationY: 1.5708,
          scale: [1, 1, 1]
        }
      });

      const updated = fs.readFileSync(testFile, "utf8");
      expect(updated).toContain('authoredPlacement("authored.fence.corner"');
      expect(updated).toContain('assetId: "prop_fence_wood_a"');
      expect(updated).toContain("rotationY: 1.5708");

      expect(() => parse(updated, { parser: tsParser })).not.toThrow();
    });
  });

  // =========================================================================
  // 2. Duplicate ID Rejection & Missing ID Error Handling
  // =========================================================================
  describe("Duplicate ID Rejection & Error Handling", () => {
    it("rejects update on non-existent ID with LayoutEditPatchError (zero-match guarantee)", () => {
      const CODE = `export const STARTER_PROP_ANCHORS = [{ id: "prop_1", x: 1, z: 1 }];`;
      fs.writeFileSync(testFile, CODE, "utf8");

      expect(() => {
        patchPlacementInFile(testFile, {
          kind: "update",
          targetId: "non_existent_target",
          data: { x: 99 }
        });
      }).toThrowError(LayoutEditPatchError);

      expect(() => {
        patchPlacementInFile(testFile, {
          kind: "update",
          targetId: "non_existent_target",
          data: { x: 99 }
        });
      }).toThrow(/Target layout ID "non_existent_target" not found/);
    });

    it("rejects update when multiple objects share the exact same ID (duplicate-ID guarantee)", () => {
      const CODE_WITH_3_DUPLICATES = `
export const STARTER_PROP_ANCHORS = [
  { id: "duplicate_lamp", x: 1, z: 1 },
  { id: "unique_hay", x: 5, z: 5 },
  { id: "duplicate_lamp", x: 2, z: 2 },
  { id: "duplicate_lamp", x: 3, z: 3 }
];
`;
      fs.writeFileSync(testFile, CODE_WITH_3_DUPLICATES, "utf8");

      expect(() => {
        patchPlacementInFile(testFile, {
          kind: "update",
          targetId: "duplicate_lamp",
          data: { x: 100 }
        });
      }).toThrow(/Duplicate layout ID "duplicate_lamp" found in .* \(3 occurrences\)/);
    });

    it("rejects delete on non-existent ID with LayoutEditPatchError", () => {
      const CODE = `export const STARTER_PROP_ANCHORS = [{ id: "prop_1", x: 1, z: 1 }];`;
      fs.writeFileSync(testFile, CODE, "utf8");

      expect(() => {
        patchPlacementInFile(testFile, {
          kind: "delete",
          targetId: "missing_delete_id"
        });
      }).toThrowError(LayoutEditPatchError);

      expect(() => {
        patchPlacementInFile(testFile, {
          kind: "delete",
          targetId: "missing_delete_id"
        });
      }).toThrow(/Delete failed: target ID "missing_delete_id" not found/);
    });

    it("handles batch mutation where one item fails: rejects entire batch without partial disk writes", () => {
      const CODE = `
export const STARTER_PROP_ANCHORS = [
  { id: "item_valid", x: 10, z: 10 }
];
`;
      fs.writeFileSync(testFile, CODE, "utf8");

      const batch: PlacementMutation[] = [
        {
          kind: "update",
          targetId: "item_valid",
          data: { x: 999 }
        },
        {
          kind: "update",
          targetId: "item_invalid_missing",
          data: { x: 500 }
        }
      ];

      expect(() => {
        batchPatchPlacements(testFile, batch);
      }).toThrow(/Target layout ID "item_invalid_missing" not found/);

      // Verify item_valid was NOT committed to disk (atomic guarantee)
      const after = fs.readFileSync(testFile, "utf8");
      expect(after).toContain("x: 10");
      expect(after).not.toContain("999");
    });
  });

  // =========================================================================
  // 3. Atomic File Write Resilience & Temp File Cleanup
  // =========================================================================
  describe("Atomic File Write Resilience & Temp Cleanup", () => {
    it("rejects malformed syntax before write and leaves 0 orphan .tmp files", () => {
      const INITIAL_VALID = "export const STARTER_PROP_ANCHORS = [{ id: 'a', x: 1, z: 1 }];";
      fs.writeFileSync(testFile, INITIAL_VALID, "utf8");

      const malformedCode = `
export const BROKEN = [
  { id: "broken", x: (( unclosed parenthesis
];
`;
      expect(() => {
        atomicWriteSourceFile(testFile, malformedCode);
      }).toThrow(/Post-mutation syntax validation failed/);

      // Original file remains intact
      expect(fs.readFileSync(testFile, "utf8")).toBe(INITIAL_VALID);

      // Verify no temporary files exist in folder
      const allFiles = fs.readdirSync(tempDir);
      const tmpFiles = allFiles.filter((f) => f.includes(".tmp"));
      expect(tmpFiles.length).toBe(0);
    });

    it("handles 50 concurrent atomic writes to distinct files without temp collision or corruption", async () => {
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 50; i++) {
        const file = path.join(tempDir, `Concurrent_${i}.ts`);
        const initialContent = `export const STARTER_PROP_ANCHORS = [{ id: "elem_${i}", x: ${i}, z: ${i} }];`;
        fs.writeFileSync(file, initialContent, "utf8");

        promises.push(
          new Promise<void>((resolve, reject) => {
            try {
              patchPlacementInFile(file, {
                kind: "update",
                targetId: `elem_${i}`,
                data: { x: i * 10, z: i * 20 }
              });
              const readBack = fs.readFileSync(file, "utf8");
              expect(readBack).toContain(`x: ${i * 10}`);
              expect(readBack).toContain(`z: ${i * 20}`);
              expect(() => parse(readBack, { parser: tsParser })).not.toThrow();
              resolve();
            } catch (err) {
              reject(err);
            }
          })
        );
      }

      await Promise.all(promises);

      // Verify no residual temp files
      const leftoverTmp = fs.readdirSync(tempDir).filter((f) => f.includes(".tmp"));
      expect(leftoverTmp.length).toBe(0);
    });
  });

  // =========================================================================
  // 4. Idempotency & Formatting Stability
  // =========================================================================
  describe("Idempotency & Formatting Stability across Repeated Mutations", () => {
    it("is strictly idempotent over 20 consecutive identical update mutations", () => {
      const INITIAL_CODE = `// Header comment
export const STARTER_PROP_ANCHORS = [
  {
    id: "stable_prop",
    x: 10.0,
    z: 20.0,
    rotationY: 0.5
  }
];
`;
      fs.writeFileSync(testFile, INITIAL_CODE, "utf8");

      // Mutation: set x to 42.5, z to -84.25
      const mutation: PlacementMutation = {
        kind: "update",
        targetId: "stable_prop",
        data: { x: 42.5, z: -84.25, rotationY: 1.2345 }
      };

      // Apply first mutation
      patchPlacementInFile(testFile, mutation);
      const firstRunOutput = fs.readFileSync(testFile, "utf8");

      // Apply 19 more times consecutively
      for (let cycle = 2; cycle <= 20; cycle++) {
        patchPlacementInFile(testFile, mutation);
        const currentOutput = fs.readFileSync(testFile, "utf8");
        expect(currentOutput).toBe(firstRunOutput); // Strictly byte-for-byte identical!
      }
    });

    it("maintains stable formatting across 20 alternating update oscillations", () => {
      const INITIAL_CODE = `export const STARTER_PROP_ANCHORS = [
  {
    id: "oscillating_prop",
    x: 0,
    z: 0
  }
];
`;
      fs.writeFileSync(testFile, INITIAL_CODE, "utf8");

      const stateA: PlacementMutation = {
        kind: "update",
        targetId: "oscillating_prop",
        data: { x: 10.5, z: -10.5 }
      };

      const stateB: PlacementMutation = {
        kind: "update",
        targetId: "oscillating_prop",
        data: { x: 99.0, z: -99.0 }
      };

      patchPlacementInFile(testFile, stateA);
      const canonicalStateA = fs.readFileSync(testFile, "utf8");

      patchPlacementInFile(testFile, stateB);
      const canonicalStateB = fs.readFileSync(testFile, "utf8");

      for (let i = 0; i < 10; i++) {
        patchPlacementInFile(testFile, stateA);
        expect(fs.readFileSync(testFile, "utf8")).toBe(canonicalStateA);

        patchPlacementInFile(testFile, stateB);
        expect(fs.readFileSync(testFile, "utf8")).toBe(canonicalStateB);
      }
    });

    it("survives add -> update -> delete lifecycle cleanly", () => {
      const INITIAL_CODE = `// Header
export const STARTER_PROP_ANCHORS = [
  { id: "anchor_base", x: 0, z: 0 }
];
`;
      fs.writeFileSync(testFile, INITIAL_CODE, "utf8");

      // 1. Add item
      patchPlacementInFile(testFile, {
        kind: "add",
        targetId: "temp_item",
        data: { type: "crate", x: 5, z: 5, rotationY: 0 }
      });
      let content = fs.readFileSync(testFile, "utf8");
      expect(content).toContain('id: "temp_item"');

      // 2. Update item
      patchPlacementInFile(testFile, {
        kind: "update",
        targetId: "temp_item",
        data: { x: 15, z: 25 }
      });
      content = fs.readFileSync(testFile, "utf8");
      expect(content).toContain("x: 15");
      expect(content).toContain("z: 25");

      // 3. Delete item
      patchPlacementInFile(testFile, {
        kind: "delete",
        targetId: "temp_item"
      });
      content = fs.readFileSync(testFile, "utf8");
      expect(content).not.toContain('id: "temp_item"');
      expect(content).toContain('id: "anchor_base"');
      expect(() => parse(content, { parser: tsParser })).not.toThrow();
    });
  });

  // =========================================================================
  // 5. Numeric Formatting, Expressions, & Target Types
  // =========================================================================
  describe("Numeric Formatting, Numeric Expressions & AST Builders", () => {
    it("handles negative numbers, zero, -0, and floats with 4 decimal places correctly", () => {
      const CODE = `export const STARTER_PROP_ANCHORS = [{ id: "prop_math", x: 1, z: 1, rotationY: 0 }];`;
      fs.writeFileSync(testFile, CODE, "utf8");

      patchPlacementInFile(testFile, {
        kind: "update",
        targetId: "prop_math",
        data: {
          x: -0,
          y: -12.345678, // should round to -12.3457
          z: 0.00001, // should round to 0
          rotationY: -3.14159 // should round to -3.1416
        }
      });

      const updated = fs.readFileSync(testFile, "utf8");
      expect(updated).toContain("x: 0");
      expect(updated).toContain("y: -12.3457");
      expect(updated).toContain("z: 0");
      expect(updated).toContain("rotationY: -3.1416");
      expect(() => parse(updated, { parser: tsParser })).not.toThrow();
    });

    it("safely evaluates math expressions in evalLayoutNumber", () => {
      expect(evalLayoutNumber("10 + 5 * 2")).toBe(20);
      expect(evalLayoutNumber("Math.PI / 4")).toBeCloseTo(Math.PI / 4, 6);
      expect(evalLayoutNumber("Math.atan2(1, 1)")).toBeCloseTo(Math.PI / 4, 6);
      expect(evalLayoutNumber("-45.5")).toBe(-45.5);

      // Unsafe expressions must be rejected
      expect(() => evalLayoutNumber("process.exit(1)")).toThrow(LayoutEditPatchError);
      expect(() => evalLayoutNumber("globalThis.foo = 1")).toThrow(LayoutEditPatchError);
      expect(() => evalLayoutNumber("(() => { while(true){} })()")).toThrow(LayoutEditPatchError);
    });

    it("verifies isLayoutEditCommit validation contract", () => {
      expect(isLayoutEditCommit({
        kind: "farm-prop",
        id: "prop_1",
        x: 10,
        z: 20,
        rotationY: 0.5
      })).toBe(true);

      // Authored detail with array scale and grounding
      expect(isLayoutEditCommit({
        kind: "authored-detail",
        id: "authored.prop.1",
        x: 10,
        z: 20,
        rotationY: 0.5,
        assetId: "prop_crate_cozy",
        scale: [1.0, 1.0, 1.0],
        grounding: [0.1, 0.2],
        practicalLight: true
      })).toBe(true);

      // Invalid: missing z
      expect(isLayoutEditCommit({
        kind: "farm-prop",
        id: "prop_1",
        x: 10,
        rotationY: 0.5
      })).toBe(false);

      // Invalid: unknown kind
      expect(isLayoutEditCommit({
        kind: "invalid-kind",
        id: "prop_1",
        x: 10,
        z: 20,
        rotationY: 0
      })).toBe(false);

      // Invalid: NaN coordinates
      expect(isLayoutEditCommit({
        kind: "farm-prop",
        id: "prop_1",
        x: NaN,
        z: 20,
        rotationY: 0
      })).toBe(false);
    });
  });

  // =========================================================================
  // 6. Balanced Extractor & String Helpers
  // =========================================================================
  describe("Balanced Extractor & String Replacer Helpers", () => {
    it("extracts balanced blocks across nested braces, brackets, and parentheses", () => {
      const src = `const config = { a: { b: [1, 2, (3 + 4)] }, c: "hello" };`;
      const extracted = extractBalanced(src, src.indexOf("{"));
      expect(extracted.text).toBe(`{ a: { b: [1, 2, (3 + 4)] }, c: "hello" }`);
      expect(extracted.end).toBe(src.length - 1);
    });

    it("throws on unbalanced delimiters", () => {
      const unclosed = `const broken = { a: 1, b: { c: 2 };`;
      expect(() => extractBalanced(unclosed, unclosed.indexOf("{"))).toThrow(LayoutEditPatchError);
    });

    it("replaces field values accurately in raw object strings", () => {
      const block = `{ id: "test", x: 10.5, z: -20.25, rotationY: 0.5, }`;
      const replacedX = replaceFieldValue(block, "x", "99.0");
      expect(replacedX).toBe(`{ id: "test", x: 99.0, z: -20.25, rotationY: 0.5, }`);

      const replacedRot = replaceFieldValue(replacedX, "rotationY", "3.1415");
      expect(replacedRot).toBe(`{ id: "test", x: 99.0, z: -20.25, rotationY: 3.1415, }`);

      expect(() => replaceFieldValue(block, "missingField", "0")).toThrow(/Missing field missingField/);
    });
  });

  // =========================================================================
  // 7. AST Visitor Direct Execution & Layout Editor Planning
  // =========================================================================
  describe("AST Visitor Direct Execution & Layout Editor Planning", () => {
    it("directly applies AST mutations and reports exact match counts", () => {
      const code = `export const STARTER_PROP_ANCHORS = [{ id: "prop_1", x: 1, z: 1 }];`;
      const ast = parse(code, { parser: tsParser });

      const matchCount = applyMutationToAst(ast, {
        kind: "update",
        targetId: "prop_1",
        data: { x: 50, z: 50 }
      });
      expect(matchCount).toBe(1);

      const missCount = applyMutationToAst(ast, {
        kind: "update",
        targetId: "missing_id",
        data: { x: 0 }
      });
      expect(missCount).toBe(0);
    });

    it("plans and applies layout edits across mock source files", () => {
      const mockSources: LayoutSourceFiles = {
        farmLayout: `export const STARTER_FARM_LAYOUT = { origin: { x: 0, z: 0 } };\nexport const STARTER_PROP_ANCHORS = [{ id: "farm_prop_1", x: 1, z: 1, rotationY: 0 }];`,
        worldLayout: `export const WORLD_LAYOUT = {};`,
        worldAnchors: `export const HARBOR_MARKET = { x: 10, z: 10 };`,
        environment: `export const AUTHORED_DETAIL_PLACEMENTS = [];`,
        interior: `export const FARMHOUSE_INTERIOR_PROPS = [];`,
        npcs: `export const NPCS = [];`
      };

      const result = applyLayoutEditToSources(mockSources, {
        kind: "farm-prop",
        id: "farm_prop_1",
        x: 25.0,
        z: -30.0,
        rotationY: 1.5708
      });

      expect(result.farmLayout).toContain("x: 25");
      expect(result.farmLayout).toContain("z: -30");
      expect(result.farmLayout).toContain("rotationY: 1.5708");
    });
  });

  // =========================================================================
  // 8. Array Boundaries, Quoted Keys, & Property Inset Mutations
  // =========================================================================
  describe("Array Boundaries, Quoted Keys & Property Inset Mutations", () => {
    it("deletes the first element cleanly while preserving array and comments", () => {
      const CODE = `
export const STARTER_PROP_ANCHORS = [
  // First item
  { id: "elem_first", x: 1, z: 1 },
  // Second item
  { id: "elem_second", x: 2, z: 2 },
  // Third item
  { id: "elem_third", x: 3, z: 3 }
];
`;
      fs.writeFileSync(testFile, CODE, "utf8");

      patchPlacementInFile(testFile, {
        kind: "delete",
        targetId: "elem_first"
      });

      const updated = fs.readFileSync(testFile, "utf8");
      expect(updated).not.toContain('id: "elem_first"');
      expect(updated).toContain('id: "elem_second"');
      expect(updated).toContain('id: "elem_third"');
      expect(() => parse(updated, { parser: tsParser })).not.toThrow();
    });

    it("deletes the last element cleanly without syntax or trailing comma errors", () => {
      const CODE = `
export const STARTER_PROP_ANCHORS = [
  { id: "elem_first", x: 1, z: 1 },
  { id: "elem_second", x: 2, z: 2 },
  { id: "elem_third", x: 3, z: 3 }
];
`;
      fs.writeFileSync(testFile, CODE, "utf8");

      patchPlacementInFile(testFile, {
        kind: "delete",
        targetId: "elem_third"
      });

      const updated = fs.readFileSync(testFile, "utf8");
      expect(updated).not.toContain('id: "elem_third"');
      expect(updated).toContain('id: "elem_first"');
      expect(updated).toContain('id: "elem_second"');
      expect(() => parse(updated, { parser: tsParser })).not.toThrow();
    });

    it("adds elements to an initially empty array", () => {
      const CODE = `export const STARTER_PROP_ANCHORS = [];`;
      fs.writeFileSync(testFile, CODE, "utf8");

      patchPlacementInFile(testFile, {
        kind: "add",
        targetId: "first_new_prop",
        data: { x: 10, z: 20 }
      });

      const updated = fs.readFileSync(testFile, "utf8");
      expect(updated).toContain('id: "first_new_prop"');
      expect(updated).toContain("x: 10");
      expect(updated).toContain("z: 20");
      expect(() => parse(updated, { parser: tsParser })).not.toThrow();
    });

    it("inserts a new property onto an existing object when property is not present", () => {
      const CODE = `export const STARTER_PROP_ANCHORS = [{ id: "prop_unextended", x: 1, z: 2 }];`;
      fs.writeFileSync(testFile, CODE, "utf8");

      patchPlacementInFile(testFile, {
        kind: "update",
        targetId: "prop_unextended",
        data: {
          practicalLight: true,
          scale: 2.5
        }
      });

      const updated = fs.readFileSync(testFile, "utf8");
      expect(updated).toContain("practicalLight: true");
      expect(updated).toContain("scale: 2.5");
      expect(updated).toContain("x: 1");
      expect(updated).toContain("z: 2");
      expect(() => parse(updated, { parser: tsParser })).not.toThrow();
    });

    it("handles objects defined with quoted keys ('id', 'x', etc.)", () => {
      const CODE = `export const STARTER_PROP_ANCHORS = [{ "id": "prop_quoted", "x": 10, "z": 20 }];`;
      fs.writeFileSync(testFile, CODE, "utf8");

      patchPlacementInFile(testFile, {
        kind: "update",
        targetId: "prop_quoted",
        data: { x: 55, z: 66 }
      });

      const updated = fs.readFileSync(testFile, "utf8");
      expect(updated).toContain("55");
      expect(updated).toContain("66");
      expect(() => parse(updated, { parser: tsParser })).not.toThrow();
    });

    it("handles empty mutations array as no-op", () => {
      const CODE = `export const STARTER_PROP_ANCHORS = [{ id: "prop_1", x: 1, z: 1 }];`;
      fs.writeFileSync(testFile, CODE, "utf8");

      patchPlacementInFile(testFile, []);
      expect(fs.readFileSync(testFile, "utf8")).toBe(CODE);
    });
  });
});

