import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  patchPlacementInFile,
  batchPatchPlacements,
  atomicWriteSourceFile,
  LayoutEditPatchError,
  tsParser,
  type PlacementMutation
} from "../../tools/layout-editor/patchPlacement";
import { parse } from "recast";

describe("Lossless Recast AST Placement Patcher (patchPlacement.ts)", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-ast-patch-test-"));
    testFile = path.join(tempDir, "TestPlacements.ts");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  const SAMPLE_CODE_WITH_COMMENTS = `// Top header comment
/* Multi-line header banner
 * Author: Neva Level Design
 */

import { AuthoredEnvironmentPlacement } from "./types";

// Important: do not move without checking collisions
export const STARTER_PROP_ANCHORS = [
  // First item - hay bale
  {
    id: "farm_hay_a",
    type: "hay-bale",
    x: 12.5,
    z: -45.0,
    rotationY: 0.7854,
    scale: 1.0
  }, // Trailing comment on item 1
  /* Item 2 block comment */
  {
    id: "farm_hay_b",
    type: "hay-bale",
    x: 15.0,
    z: -42.5,
    rotationY: 1.5708,
    scale: 1.2
  },
  {
    id: "farm_lamp_a",
    type: "lamp-post",
    x: 20.0,
    z: -50.0,
    rotationY: 0.0
  }
];

// End of file comment
`;

  it("preserves line comments, block comments, indentation, and structure on update", () => {
    fs.writeFileSync(testFile, SAMPLE_CODE_WITH_COMMENTS, "utf8");

    patchPlacementInFile(testFile, {
      kind: "update",
      targetId: "farm_hay_a",
      data: {
        x: 99.5,
        z: -88.25,
        rotationY: 3.1415
      }
    });

    const result = fs.readFileSync(testFile, "utf8");

    // Check updated values
    expect(result).toContain("x: 99.5");
    expect(result).toContain("z: -88.25");
    expect(result).toContain("rotationY: 3.1415");

    // Check untouched comments are completely preserved
    expect(result).toContain("// Top header comment");
    expect(result).toContain("* Author: Neva Level Design");
    expect(result).toContain("// Important: do not move without checking collisions");
    expect(result).toContain("// First item - hay bale");
    expect(result).toContain("/* Item 2 block comment */");
    expect(result).toContain("// End of file comment");

    // Check untouched elements remain intact
    expect(result).toContain('id: "farm_hay_b"');
    expect(result).toContain('id: "farm_lamp_a"');
  });

  it("adds a new placement element cleanly without syntax errors", () => {
    fs.writeFileSync(testFile, SAMPLE_CODE_WITH_COMMENTS, "utf8");

    patchPlacementInFile(testFile, {
      kind: "add",
      targetId: "farm_hay_c",
      data: {
        type: "hay-bale",
        x: 35.0,
        z: -60.0,
        rotationY: 0.5,
        scale: 1.0
      }
    });

    const result = fs.readFileSync(testFile, "utf8");
    expect(result).toContain('id: "farm_hay_c"');
    expect(result).toContain('type: "hay-bale"');
    expect(result).toContain("x: 35");
    expect(result).toContain("z: -60");

    // Verify resulting file parses as valid TypeScript
    expect(() => parse(result, { parser: tsParser })).not.toThrow();
  });

  it("deletes a placement element without leaving trailing comma syntax errors", () => {
    fs.writeFileSync(testFile, SAMPLE_CODE_WITH_COMMENTS, "utf8");

    patchPlacementInFile(testFile, {
      kind: "delete",
      targetId: "farm_hay_b"
    });

    const result = fs.readFileSync(testFile, "utf8");
    expect(result).not.toContain('id: "farm_hay_b"');
    expect(result).toContain('id: "farm_hay_a"');
    expect(result).toContain('id: "farm_lamp_a"');

    // Verify valid TS structure
    expect(() => parse(result, { parser: tsParser })).not.toThrow();
  });

  it("applies a batch of mutations (add, update, delete) atomically", () => {
    fs.writeFileSync(testFile, SAMPLE_CODE_WITH_COMMENTS, "utf8");

    const batchMutations: PlacementMutation[] = [
      {
        kind: "update",
        targetId: "farm_hay_a",
        data: { x: 100.0, z: -100.0 }
      },
      {
        kind: "delete",
        targetId: "farm_lamp_a"
      },
      {
        kind: "add",
        targetId: "farm_crate_new",
        data: { type: "crate", x: 5.5, z: 10.5, rotationY: 0.0 }
      }
    ];

    batchPatchPlacements(testFile, batchMutations);

    const result = fs.readFileSync(testFile, "utf8");
    expect(result).toContain("x: 100");
    expect(result).toContain("z: -100");
    expect(result).not.toContain('id: "farm_lamp_a"');
    expect(result).toContain('id: "farm_crate_new"');
    expect(() => parse(result, { parser: tsParser })).not.toThrow();
  });

  it("enforces zero-match safety on update", () => {
    fs.writeFileSync(testFile, SAMPLE_CODE_WITH_COMMENTS, "utf8");

    expect(() => {
      patchPlacementInFile(testFile, {
        kind: "update",
        targetId: "non_existent_id",
        data: { x: 0, z: 0 }
      });
    }).toThrow(LayoutEditPatchError);
  });

  it("enforces duplicate-ID safety on update", () => {
    const CODE_WITH_DUPLICATES = `
export const STARTER_PROP_ANCHORS = [
  { id: "duplicate_id", x: 1, z: 1 },
  { id: "duplicate_id", x: 2, z: 2 }
];
`;
    fs.writeFileSync(testFile, CODE_WITH_DUPLICATES, "utf8");

    expect(() => {
      patchPlacementInFile(testFile, {
        kind: "update",
        targetId: "duplicate_id",
        data: { x: 10, z: 10 }
      });
    }).toThrow(/Duplicate layout ID "duplicate_id" found/);
  });

  it("atomic write validates syntax before committing and cleans up temp files on failure", () => {
    fs.writeFileSync(testFile, "export const VALID = 1;", "utf8");

    // Passing invalid typescript syntax
    expect(() => {
      atomicWriteSourceFile(testFile, "export const BROKEN = {{{ ;;; syntax error");
    }).toThrow(/Post-mutation syntax validation failed/);

    // Ensure original file content was not overwritten
    const content = fs.readFileSync(testFile, "utf8");
    expect(content).toBe("export const VALID = 1;");

    // Ensure no orphan .tmp files remain
    const files = fs.readdirSync(tempDir);
    const tempFiles = files.filter((f) => f.includes(".tmp"));
    expect(tempFiles.length).toBe(0);
  });

  it("handles authoredPlacement function call mutations", () => {
    const AUTHORED_CODE = `
export const AUTHORED_DETAIL_PLACEMENTS = [
  authoredPlacement("authored.prop.wagon.farm-road", {
    assetId: "prop_wagon_cozy_a",
    x: -48.0,
    z: -58.0,
    rotationY: 0.2,
    scale: [1, 1, 1]
  }),
  authoredPlacement("authored.prop.lamp.village-west", {
    assetId: "prop_lamp_post_a",
    x: 45.0,
    z: -47.0,
    rotationY: 0.0
  })
];
`;
    fs.writeFileSync(testFile, AUTHORED_CODE, "utf8");

    patchPlacementInFile(testFile, {
      kind: "update",
      targetId: "authored.prop.wagon.farm-road",
      data: {
        x: -50.5,
        z: -60.25,
        rotationY: 0.8
      }
    });

    const updated = fs.readFileSync(testFile, "utf8");
    expect(updated).toContain("x: -50.5");
    expect(updated).toContain("z: -60.25");
    expect(updated).toContain("rotationY: 0.8");

    // Delete authored placement
    patchPlacementInFile(testFile, {
      kind: "delete",
      targetId: "authored.prop.lamp.village-west"
    });

    const deleted = fs.readFileSync(testFile, "utf8");
    expect(deleted).not.toContain("authored.prop.lamp.village-west");
    expect(deleted).toContain("authored.prop.wagon.farm-road");
    expect(() => parse(deleted, { parser: tsParser })).not.toThrow();
  });
});
