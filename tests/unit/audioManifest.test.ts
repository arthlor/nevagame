import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "../../assets/audio/audio-manifest.json";

const ROOT = path.resolve(import.meta.dirname, "../..");
const sha256 = (filename: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");

describe("local farming audio manifest", () => {
  it("bundles every declared CC0 source with a matching hash and license snapshot", () => {
    expect(manifest.version).toBe(1);
    expect(manifest.license).toBe("CC0-1.0");
    expect(manifest.sources.length).toBeGreaterThanOrEqual(12);

    for (const source of manifest.sources) {
      expect(source.runtimeUrl).toMatch(/^\/assets\/audio\/[a-z0-9-]+\.mp3$/);
      expect(source.runtimeUrl).not.toMatch(/^https?:/);
      expect(source.sourceUrl).toMatch(/^https:\/\/freesound\.org\//);
      expect(source.licenseUrl).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.durationSeconds).toBeGreaterThan(0);

      const bundledFile = path.join(ROOT, "public", source.runtimeUrl);
      const licenseSnapshot = path.join(ROOT, source.licenseSnapshot);
      expect(fs.existsSync(bundledFile)).toBe(true);
      expect(sha256(bundledFile)).toBe(source.sha256);
      expect(fs.existsSync(licenseSnapshot)).toBe(true);
      expect(fs.readFileSync(licenseSnapshot, "utf8")).toMatch(
        /creativecommons\.org\/publicdomain\/zero\/1\.0\//
      );
    }
  });

  it("keeps every cue inside its bundled source and marks ambience as looped", () => {
    const sources = new Map(manifest.sources.map((source) => [source.id, source]));
    for (const [cueId, cue] of Object.entries(manifest.cues)) {
      const source = sources.get(cue.sourceId);
      expect(source, `${cueId} has a registered source`).toBeDefined();
      expect(cue.offset).toBeGreaterThanOrEqual(0);
      expect(cue.duration).toBeGreaterThan(0);
      expect(cue.offset + cue.duration).toBeLessThanOrEqual((source?.durationSeconds ?? 0) + 0.01);
      expect(cue.gain).toBeGreaterThan(0);
      expect(cue.poolSize).toBeGreaterThan(0);
      if (cue.bus === "ambience") {
        expect("loop" in cue && cue.loop).toBe(true);
        expect(cue.spatial).toBe(false);
      }
    }
  });
});
