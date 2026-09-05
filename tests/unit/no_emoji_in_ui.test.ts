import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Emoji render differently on every platform and font, and sit badly against
 * the game's authored art. Icons are SVG — either an atlas sprite through
 * `HudIcons`, or an inline mark defined there. This guard keeps them out.
 */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}]/u;

const ROOT = path.resolve(import.meta.dirname, "../..");
/** Presentation, plus the layers that feed strings straight into it. */
const SCANNED = ["src/ui", "src/app", "src/content", "src/simulation/presentation"];

function sourceFiles(directory: string): string[] {
  const absolute = path.join(ROOT, directory);
  if (!fs.existsSync(absolute)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(relative));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(relative);
  }
  return out;
}

describe("no emoji in user-facing code", () => {
  it("keeps every scanned source file emoji-free", () => {
    const offenders: string[] = [];
    for (const directory of SCANNED) {
      for (const file of sourceFiles(directory)) {
        const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split("\n");
        lines.forEach((line, index) => {
          if (EMOJI.test(line)) offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 80)}`);
        });
      }
    }
    expect(
      offenders,
      `Use an SVG mark from src/ui/components/HudIcons.tsx instead:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("keeps Art Yard viewer, styles, and scripts completely emoji-free", () => {
    const artYardFiles = [
      "tools/art-yard/viewer.html",
      "src/art-yard/styles.css",
      "src/art-yard/main.ts",
      "src/art-yard/characterPreview.ts",
      "src/art-yard/urlState.ts"
    ];
    const offenders: string[] = [];
    for (const file of artYardFiles) {
      const fullPath = path.join(ROOT, file);
      if (!fs.existsSync(fullPath)) continue;
      const lines = fs.readFileSync(fullPath, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (EMOJI.test(line)) offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 80)}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("scans a meaningful amount of source, so the guard cannot pass vacuously", () => {
    const total = SCANNED.reduce((sum, directory) => sum + sourceFiles(directory).length, 0);
    expect(total).toBeGreaterThan(40);
  });
});
