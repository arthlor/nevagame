import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface ApprovedBaselineManifest {
  version: number;
  approvedBy: string;
  viewport: readonly [number, number];
  scenes: Record<string, string>;
  visualGoldGate: {
    status: string;
    acceptedAt: string;
    acceptedBy: string;
    scope: string;
  };
  sha256: Record<string, string>;
}

describe("approved visual baselines", () => {
  it("locks the human-approved four-slice reference set by content hash", () => {
    const referenceDirectory = path.resolve(process.cwd(), "tests/visual/reference");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(referenceDirectory, "approved-baselines.json"), "utf8")
    ) as ApprovedBaselineManifest;

    expect(manifest.version).toBe(1);
    expect(manifest.approvedBy).toBe("human-art-director");
    expect(manifest.viewport).toEqual([1440, 900]);
    expect(Object.keys(manifest.scenes).sort()).toEqual(["bridge", "coast", "farm", "harbor"]);
    expect(manifest.visualGoldGate).toEqual({
      status: "accepted",
      acceptedAt: "2026-08-27",
      acceptedBy: "human",
      scope: "bridge-farm-harbor-coast"
    });

    for (const [scene, filename] of Object.entries(manifest.scenes)) {
      const content = fs.readFileSync(path.join(referenceDirectory, filename));
      expect(createHash("sha256").update(content).digest("hex"), scene).toBe(manifest.sha256[scene]);
    }
  });
});
