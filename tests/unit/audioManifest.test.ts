import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "../../assets/audio/audio-manifest.json";

const ROOT = path.resolve(import.meta.dirname, "../..");
const sha256 = (filename: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");

type ManifestSource = (typeof manifest.sources)[number] & { origin?: string; licenseSnapshot?: string | null };

describe("local farming audio manifest", () => {
  it("bundles every declared source with a matching hash", () => {
    expect(manifest.version).toBe(2);
    expect(manifest.license).toBe("CC0-1.0");
    expect(manifest.sources.length).toBeGreaterThanOrEqual(30);

    const theme = manifest.sources.find((source) => source.id === "theme") as ManifestSource | undefined;
    expect(theme?.origin).toBe("project");
    expect(theme?.runtimeUrl).toBe("/assets/audio/theme.mp3");

    for (const source of manifest.sources as ManifestSource[]) {
      expect(source.runtimeUrl).toMatch(/^\/assets\/audio\/[a-z0-9-]+\.mp3$/);
      expect(source.runtimeUrl).not.toMatch(/^https?:/);
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.durationSeconds).toBeGreaterThan(0);

      const bundledFile = path.join(ROOT, "public", source.runtimeUrl);
      expect(fs.existsSync(bundledFile)).toBe(true);
      expect(sha256(bundledFile)).toBe(source.sha256);

      if (source.origin === "project") {
        expect(source.sourceUrl).not.toMatch(/^https:\/\/freesound\.org\//);
        continue;
      }

      expect(source.sourceUrl).toMatch(/^https:\/\/freesound\.org\//);
      expect(source.licenseUrl).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
      expect(typeof source.licenseSnapshot).toBe("string");
      const licenseSnapshot = path.join(ROOT, source.licenseSnapshot as string);
      expect(fs.existsSync(licenseSnapshot)).toBe(true);
      expect(fs.readFileSync(licenseSnapshot, "utf8")).toMatch(
        /creativecommons\.org\/publicdomain\/zero\/1\.0\//
      );
    }
  });

  it("keeps every cue inside its bundled source and marks beds as looped", () => {
    const sources = new Map(manifest.sources.map((source) => [source.id, source]));
    expect(manifest.cues.theme.bus).toBe("music");
    expect(manifest.cues.theme.loop).toBe(true);
    expect(manifest.cues.theme.spatial).toBe(false);
    for (const [cueId, cue] of Object.entries(manifest.cues)) {
      const source = sources.get(cue.sourceId);
      expect(source, `${cueId} has a registered source`).toBeDefined();
      expect(cue.offset).toBeGreaterThanOrEqual(0);
      expect(cue.duration).toBeGreaterThan(0);
      expect(cue.offset + cue.duration).toBeLessThanOrEqual((source?.durationSeconds ?? 0) + 0.01);
      expect(cue.gain).toBeGreaterThan(0);
      expect(cue.poolSize).toBeGreaterThan(0);
      expect(["sfx", "ambience", "ui", "weather", "boat", "fishing", "music"]).toContain(cue.bus);
      const looped = (cue as { loop?: boolean }).loop === true;
      if (cue.bus === "ambience" || cue.bus === "music" || (cue.bus === "weather" && looped)) {
        expect(looped).toBe(true);
        expect(cue.spatial).toBe(false);
      }
    }
  });

  it("keeps adaptable banks and weather beds pointing at real cues", () => {
    const cueIds = new Set(Object.keys(manifest.cues));
    for (const [bankId, variants] of Object.entries(manifest.banks)) {
      expect(variants.length).toBeGreaterThan(0);
      for (const cueId of variants) {
        expect(cueIds.has(cueId), `${bankId} includes unknown cue ${cueId}`).toBe(true);
      }
    }
    const isLoop = (cueId: string): boolean =>
      (manifest.cues[cueId as keyof typeof manifest.cues] as { loop?: boolean }).loop === true;

    for (const bedCues of Object.values(manifest.beds)) {
      for (const cueId of bedCues) {
        expect(cueIds.has(cueId)).toBe(true);
        expect(isLoop(cueId)).toBe(true);
      }
    }
    for (const weatherCues of Object.values(manifest.weatherLoops)) {
      for (const cueId of weatherCues) {
        expect(cueIds.has(cueId)).toBe(true);
        expect(isLoop(cueId)).toBe(true);
      }
    }

    expect(cueIds.has("theme")).toBe(true);
    for (const bedCues of Object.values(manifest.beds)) {
      expect(bedCues).not.toContain("theme");
    }
    expect(manifest.banks["footstep-grass"]).toEqual(["footstep-grass-a", "footstep-grass-b"]);
    expect(manifest.beds.coast).toContain("ambience-seagulls");
    expect(manifest.beds.interior).toContain("ambience-fireplace");
  });
});
