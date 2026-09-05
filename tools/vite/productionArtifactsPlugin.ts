import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export function stripDevelopmentArtifacts(outputDirectory: string): string[] {
  const atlasDirectory = path.join(outputDirectory, "assets/ui/atlas");
  const manifest = JSON.parse(fs.readFileSync(path.join(atlasDirectory, "ui-atlas.json"), "utf8")) as {
    pages: Array<{ imageWebp: string }>;
  };
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
    throw new Error("Production UI atlas must declare its runtime pages");
  }
  const runtimePages = new Set(manifest.pages.map((page) => page.imageWebp));
  for (const filename of runtimePages) {
    if (!/^ui-atlas_\d+\.webp$/.test(filename) || !fs.existsSync(path.join(atlasDirectory, filename))) {
      throw new Error(`Production UI atlas page is missing or invalid: ${filename}`);
    }
  }
  const excluded = fs.readdirSync(atlasDirectory)
    .filter((filename) => /^ui-atlas(?:_\d+)?\.(?:png|webp)$/.test(filename) && !runtimePages.has(filename))
    .map((filename) => path.join("assets/ui/atlas", filename));
  for (const filename of ["__hud_preview.html", "__probe.html"]) {
    if (fs.existsSync(path.join(outputDirectory, filename))) excluded.push(filename);
  }
  for (const filename of excluded) fs.unlinkSync(path.join(outputDirectory, filename));
  return excluded;
}

export function productionArtifactsPlugin(): Plugin {
  let outputDirectory: string;
  return {
    name: "neva-production-artifacts",
    apply: "build",
    configResolved(config) {
      outputDirectory = path.resolve(config.root, config.build.outDir);
      const relative = path.relative(config.root, outputDirectory);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)
        || outputDirectory === path.resolve(config.publicDir)) {
        throw new Error("Production artifact filtering requires a separate output directory inside the project");
      }
    },
    writeBundle() {
      stripDevelopmentArtifacts(outputDirectory);
    }
  };
}
