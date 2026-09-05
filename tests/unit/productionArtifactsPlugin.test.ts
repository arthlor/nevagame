import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stripDevelopmentArtifacts } from "../../tools/vite/productionArtifactsPlugin";

const directories: string[] = [];

function fixture(pages = ["ui-atlas_0.webp", "ui-atlas_1.webp"]): { output: string; atlas: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neva-production-artifacts-"));
  directories.push(root);
  const output = path.join(root, "dist");
  const atlas = path.join(output, "assets/ui/atlas");
  fs.mkdirSync(atlas, { recursive: true });
  fs.writeFileSync(path.join(atlas, "ui-atlas.json"), JSON.stringify({ pages: pages.map((imageWebp) => ({ imageWebp })) }));
  for (const filename of ["ui-atlas.png", "ui-atlas.webp", "ui-atlas_0.png", "ui-atlas_1.png",
    "ui-atlas_0.webp", "ui-atlas_1.webp", "ui-atlas_8.webp", "world-sprout.png", "parchment-grain.png"]) {
    fs.writeFileSync(path.join(atlas, filename), filename);
  }
  for (const filename of ["index.html", "__hud_preview.html", "__probe.html", "credits.html"]) {
    fs.writeFileSync(path.join(output, filename), filename);
  }
  fs.mkdirSync(path.join(root, "public"));
  fs.writeFileSync(path.join(root, "public/__hud_preview.html"), "keep authored preview");
  return { output, atlas };
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("production artifact filtering", () => {
  it("removes only development pages and non-runtime packed atlas copies", () => {
    const { output, atlas } = fixture();
    expect(stripDevelopmentArtifacts(output)).toHaveLength(7);
    expect(fs.readdirSync(atlas).sort()).toEqual([
      "parchment-grain.png", "ui-atlas.json", "ui-atlas_0.webp", "ui-atlas_1.webp", "world-sprout.png"
    ]);
    expect(fs.readdirSync(output).sort()).toEqual(["assets", "credits.html", "index.html"]);
    expect(fs.readFileSync(path.join(output, "../public/__hud_preview.html"), "utf8")).toBe("keep authored preview");
    expect(stripDevelopmentArtifacts(output)).toEqual([]);
  });

  it("follows declared pages rather than assuming a fixed atlas size", () => {
    const { output, atlas } = fixture(["ui-atlas_0.webp", "ui-atlas_8.webp"]);
    stripDevelopmentArtifacts(output);
    expect(fs.existsSync(path.join(atlas, "ui-atlas_8.webp"))).toBe(true);
    expect(fs.existsSync(path.join(atlas, "ui-atlas_1.webp"))).toBe(false);
  });

  it.each([["ui-atlas_9.webp"], [], ["../outside.webp"]])("fails before removing files when pages are invalid: %j", (...pages) => {
    const { output, atlas } = fixture(pages as string[]);
    const before = fs.readdirSync(atlas);
    expect(() => stripDevelopmentArtifacts(output)).toThrow();
    expect(fs.readdirSync(atlas)).toEqual(before);
    expect(fs.existsSync(path.join(output, "__probe.html"))).toBe(true);
  });
});
