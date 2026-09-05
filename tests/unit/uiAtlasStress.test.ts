import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

import {
  dilateAlphaRgb,
  dilateSpriteEdges,
  packLosslessUiAtlas
} from "../../tools/ui/extrudeAndPack.mjs";

describe("Subsystem 3 Adversarial & Stress Testing", () => {
  describe("1. Packing Scalability & Aspect Ratio Variety", () => {
    it("packs 300 sprites of wildly varying aspect ratios without rect collision or out-of-bounds", async () => {
      // Construct 300 test sprites with extreme aspect ratios:
      // - 10:1 horizontal banners (200x20)
      // - 1:10 vertical bars (20x200)
      // - 16:9 widescreen banners (160x90)
      // - 9:16 vertical cards (90x160)
      // - Prime non-POT dimensions (37x93, 113x47, 61x61)
      // - 1:1 squares (32x32, 64x64, 128x128)
      // - 1x1 micro sprite
      const aspectConfigs = [
        { w: 200, h: 20 },
        { w: 20, h: 200 },
        { w: 160, h: 90 },
        { w: 90, h: 160 },
        { w: 37, h: 93 },
        { w: 113, h: 47 },
        { w: 61, h: 61 },
        { w: 32, h: 32 },
        { w: 64, h: 64 },
        { w: 128, h: 128 },
        { w: 1, h: 1 },
        { w: 250, h: 40 }
      ];

      const sprites = [];
      for (let i = 0; i < 300; i++) {
        const cfg = aspectConfigs[i % aspectConfigs.length];
        const r = (i * 37) % 256;
        const g = (i * 59) % 256;
        const b = (i * 83) % 256;

        const buf = await sharp({
          create: {
            width: cfg.w,
            height: cfg.h,
            channels: 4,
            background: { r, g, b, alpha: 1 }
          }
        }).png().toBuffer();

        sprites.push({
          name: `stress_sprite_${i}_${cfg.w}x${cfg.h}`,
          id: `stress.${i}`,
          buffer: buf
        });
      }

      const startTime = performance.now();
      const result = await packLosslessUiAtlas(sprites, path.join(process.cwd(), "generated/.stress-atlas"), "stress-atlas", {
        maxWidth: 2048,
        maxHeight: 2048,
        padding: 2,
        extrude: 2,
        smart: true,
        pot: true,
        writeFiles: false
      });
      const durationMs = performance.now() - startTime;

      console.log(`[STRESS TEST] Packed 300 heterogeneous sprites into ${result.bins.length} bins in ${durationMs.toFixed(1)}ms`);

      expect(result.bins.length).toBeGreaterThanOrEqual(1);

      // Verify each bin: POT dimensions, no collisions, strictly within bounds
      for (let bIdx = 0; bIdx < result.bins.length; bIdx++) {
        const bin = result.bins[bIdx];

        // Power of two check
        expect(bin.width & (bin.width - 1)).toBe(0);
        expect(bin.height & (bin.height - 1)).toBe(0);
        expect(bin.width).toBeLessThanOrEqual(2048);
        expect(bin.height).toBeLessThanOrEqual(2048);

        // Check each rect within bin bounds
        for (let i = 0; i < bin.rects.length; i++) {
          const r1 = bin.rects[i];
          expect(r1.x).toBeGreaterThanOrEqual(0);
          expect(r1.y).toBeGreaterThanOrEqual(0);
          expect(r1.x + r1.width).toBeLessThanOrEqual(bin.width);
          expect(r1.y + r1.height).toBeLessThanOrEqual(bin.height);

          // Pairwise collision test against all other rects in this bin
          for (let j = i + 1; j < bin.rects.length; j++) {
            const r2 = bin.rects[j];
            const overlapX = r1.x < r2.x + r2.width && r1.x + r1.width > r2.x;
            const overlapY = r1.y < r2.y + r2.height && r1.y + r1.height > r2.y;
            const collision = overlapX && overlapY;
            if (collision) {
              throw new Error(`Collision detected in bin ${bIdx} between ${r1.name} [${r1.x},${r1.y},${r1.width},${r1.height}] and ${r2.name} [${r2.x},${r2.y},${r2.width},${r2.height}]`);
            }
            expect(collision).toBe(false);
          }
        }
      }

      // Check all 300 sprites exist in manifest with accurate inner dimensions & UVs
      for (let i = 0; i < 300; i++) {
        const cfg = aspectConfigs[i % aspectConfigs.length];
        const key = `stress_sprite_${i}_${cfg.w}x${cfg.h}`;
        const entry = result.manifest.frames[key];
        expect(entry).toBeDefined();
        expect(entry.innerWidth).toBe(cfg.w);
        expect(entry.innerHeight).toBe(cfg.h);
        expect(entry.frame.w).toBe(cfg.w);
        expect(entry.frame.h).toBe(cfg.h);
        expect(entry.innerX).toBe(entry.outerFrame.x + 2);
        expect(entry.innerY).toBe(entry.outerFrame.y + 2);

        // UV validation
        expect(entry.uv.u0).toBeGreaterThanOrEqual(0);
        expect(entry.uv.v0).toBeGreaterThanOrEqual(0);
        expect(entry.uv.u1).toBeLessThanOrEqual(1);
        expect(entry.uv.v1).toBeLessThanOrEqual(1);
        expect(entry.uv.u1).toBeGreaterThan(entry.uv.u0);
        expect(entry.uv.v1).toBeGreaterThan(entry.uv.v0);
      }
    });

    it("handles large scale packing batch of 500 sprites efficiently", async () => {
      const sprites = [];
      for (let i = 0; i < 500; i++) {
        const w = 16 + (i % 64);
        const h = 16 + ((i * 3) % 64);
        const buf = await sharp({
          create: {
            width: w,
            height: h,
            channels: 4,
            background: { r: 120, g: 140, b: 160, alpha: 1 }
          }
        }).png().toBuffer();

        sprites.push({
          name: `scale_500_${i}`,
          buffer: buf
        });
      }

      const startTime = performance.now();
      const result = await packLosslessUiAtlas(sprites, path.join(process.cwd(), "generated/.scale-500"), "scale-500", {
        maxWidth: 2048,
        maxHeight: 2048,
        padding: 2,
        extrude: 2,
        smart: true,
        pot: true,
        writeFiles: false
      });
      const durationMs = performance.now() - startTime;

      console.log(`[SCALE TEST] Packed 500 sprites in ${durationMs.toFixed(1)}ms across ${result.bins.length} bin(s)`);
      expect(result.bins.length).toBeGreaterThanOrEqual(1);
      expect(Object.keys(result.manifest.frames).length).toBe(500);
    });
  });

  describe("2. Lossless Format Output & Decoding Verification", () => {
    it("verifies production PNG and WebP atlas files decode cleanly with sharp", async () => {
      const atlasDir = path.join(process.cwd(), "public/assets/ui/atlas");
      const pngPath = path.join(atlasDir, "ui-atlas.png");
      const webpPath = path.join(atlasDir, "ui-atlas.webp");

      expect(fs.existsSync(pngPath)).toBe(true);
      expect(fs.existsSync(webpPath)).toBe(true);

      const pngImg = sharp(pngPath);
      const webpImg = sharp(webpPath);

      const pngMeta = await pngImg.metadata();
      const webpMeta = await webpImg.metadata();

      expect(pngMeta.format).toBe("png");
      expect(pngMeta.channels).toBe(4);
      expect(pngMeta.width).toBe(2048);
      expect(pngMeta.height).toBe(2048);

      expect(webpMeta.format).toBe("webp");
      expect(webpMeta.channels).toBe(4);
      expect(webpMeta.width).toBe(2048);
      expect(webpMeta.height).toBe(2048);

      // Verify all numbered pages decode
      const jsonManifest = JSON.parse(fs.readFileSync(path.join(atlasDir, "ui-atlas.json"), "utf8"));
      for (const page of jsonManifest.pages) {
        const pPng = path.join(atlasDir, page.imagePng);
        const pWebp = path.join(atlasDir, page.imageWebp);

        expect(fs.existsSync(pPng)).toBe(true);
        expect(fs.existsSync(pWebp)).toBe(true);

        const mPng = await sharp(pPng).metadata();
        const mWebp = await sharp(pWebp).metadata();

        expect(mPng.width).toBe(page.width);
        expect(mPng.height).toBe(page.height);
        expect(mWebp.width).toBe(page.width);
        expect(mWebp.height).toBe(page.height);
      }
    });

    it("verifies lossless pixel parity between PNG and WebP atlas sheets", async () => {
      const atlasDir = path.join(process.cwd(), "public/assets/ui/atlas");
      const pngRaw = await sharp(path.join(atlasDir, "ui-atlas_0.png")).raw().toBuffer();
      const webpRaw = await sharp(path.join(atlasDir, "ui-atlas_0.webp")).raw().toBuffer();

      expect(pngRaw.length).toBe(webpRaw.length);
      expect(pngRaw.length).toBe(2048 * 2048 * 4);

      // Lossless WebP may canonicalize invisible RGB under alpha=0. Alpha and
      // every visible channel must still be pixel-identical.
      let maxDiff = 0;
      let diffCount = 0;
      let alphaDiffCount = 0;
      for (let i = 0; i < pngRaw.length; i += 4) {
        if (webpRaw[i + 3] !== pngRaw[i + 3]) alphaDiffCount++;
        if (pngRaw[i + 3] > 0) {
          for (let channel = 0; channel < 3; channel++) {
            const d = Math.abs(pngRaw[i + channel] - webpRaw[i + channel]);
            if (d > 0) {
              diffCount++;
              if (d > maxDiff) maxDiff = d;
            }
          }
        }
      }

      console.log(`[LOSSLESS PARITY] PNG vs WebP diff count: ${diffCount} / ${pngRaw.length}, max diff: ${maxDiff}`);
      expect(maxDiff).toBe(0);
      expect(diffCount).toBe(0);
      expect(alphaDiffCount).toBe(0);
    });

    it("verifies pixel-perfect fidelity: atlas inner pixels exactly match original source sprites", async () => {
      const atlasDir = path.join(process.cwd(), "public/assets/ui/atlas");
      const jsonManifest = JSON.parse(fs.readFileSync(path.join(atlasDir, "ui-atlas.json"), "utf8"));

      // Check 5 diverse production sprites
      const testSprites = [
        { key: "fish.carp", file: "fish-carp.png" },
        { key: "harvest", file: "action-harvest.png" },
        { key: "gold", file: "quality-gold.png" },
        { key: "rod", file: "tool-rod.png" },
        { key: "storm", file: "weather-storm.png" }
      ];

      for (const { key, file } of testSprites) {
        const frame = jsonManifest.frames[key];
        expect(frame).toBeDefined();

        const pagePng = path.join(atlasDir, `ui-atlas_${frame.binIndex}.png`);
        const atlasRaw = await sharp(pagePng).raw().toBuffer();
        const pageMeta = await sharp(pagePng).metadata();
        const pageW = pageMeta.width!;

        // Find original source sprite file
        const actualSrcPath = path.join(process.cwd(), "assets/ui/atlas", file);

        expect(fs.existsSync(actualSrcPath)).toBe(true);

        const srcImg = sharp(actualSrcPath).ensureAlpha();
        const srcMeta = await srcImg.metadata();
        const srcRaw = await srcImg.raw().toBuffer();

        const srcW = srcMeta.width!;
        const srcH = srcMeta.height!;

        expect(frame.innerWidth).toBe(srcW);
        expect(frame.innerHeight).toBe(srcH);

        // Compare every pixel in the source sprite against the inner frame in the atlas
        for (let y = 0; y < srcH; y++) {
          for (let x = 0; x < srcW; x++) {
            const srcIdx = (y * srcW + x) * 4;
            const atlasIdx = ((frame.innerY + y) * pageW + (frame.innerX + x)) * 4;

            expect(atlasRaw[atlasIdx + 3]).toBe(srcRaw[srcIdx + 3]); // A
            if (srcRaw[srcIdx + 3] > 0) {
              expect(atlasRaw[atlasIdx]).toBe(srcRaw[srcIdx]);         // R
              expect(atlasRaw[atlasIdx + 1]).toBe(srcRaw[srcIdx + 1]); // G
              expect(atlasRaw[atlasIdx + 2]).toBe(srcRaw[srcIdx + 2]); // B
            }
          }
        }
      }
    });

    it("verifies 2px dilated edge bleed around source sprites in the atlas", async () => {
      const atlasDir = path.join(process.cwd(), "public/assets/ui/atlas");
      const jsonManifest = JSON.parse(fs.readFileSync(path.join(atlasDir, "ui-atlas.json"), "utf8"));
      const frame = jsonManifest.frames.gold;
      expect(frame).toBeDefined();

      const pagePng = path.join(atlasDir, `ui-atlas_${frame.binIndex}.png`);
      const atlasRaw = await sharp(pagePng).raw().toBuffer();
      const pageW = 2048;

      // Verify top extruded rows (y = innerY - 1, innerY - 2) match the top edge of inner frame (y = innerY)
      for (let x = 0; x < frame.innerWidth; x++) {
        const topEdgeIdx = (frame.innerY * pageW + (frame.innerX + x)) * 4;
        const extrude1Idx = ((frame.innerY - 1) * pageW + (frame.innerX + x)) * 4;
        const extrude2Idx = ((frame.innerY - 2) * pageW + (frame.innerX + x)) * 4;

        // RGB should match top row
        expect(atlasRaw[extrude1Idx]).toBe(atlasRaw[topEdgeIdx]);
        expect(atlasRaw[extrude1Idx + 1]).toBe(atlasRaw[topEdgeIdx + 1]);
        expect(atlasRaw[extrude1Idx + 2]).toBe(atlasRaw[topEdgeIdx + 2]);

        expect(atlasRaw[extrude2Idx]).toBe(atlasRaw[topEdgeIdx]);
        expect(atlasRaw[extrude2Idx + 1]).toBe(atlasRaw[topEdgeIdx + 1]);
        expect(atlasRaw[extrude2Idx + 2]).toBe(atlasRaw[topEdgeIdx + 2]);
      }
    });
  });

  describe("3. Check Mode (--check) Drift & Stale Detection", () => {
    it("passes cleanly when production manifests are up-to-date", () => {
      const output = execSync("node tools/ui/extrudeAndPack.mjs --check", { encoding: "utf8" });
      expect(output).toContain("[NEVA UI ATLAS] Atlas is up to date and validated.");
    });

    it("detects when JSON manifest is stale or modified and exits with non-zero error", () => {
      const jsonPath = path.join(process.cwd(), "public/assets/ui/atlas/ui-atlas.json");
      const originalJson = fs.readFileSync(jsonPath, "utf8");

      try {
        // Tamper with manifest
        const tampered = JSON.parse(originalJson);
        tampered.extrude = 999;
        fs.writeFileSync(jsonPath, JSON.stringify(tampered, null, 2), "utf8");

        let threw = false;
        try {
          execSync("node tools/ui/extrudeAndPack.mjs --check", { encoding: "utf8", stdio: "pipe" });
        } catch (err: any) {
          threw = true;
          expect(err.status).toBe(1);
          expect(err.stderr || err.stdout).toContain("UI Atlas manifest is stale");
        }
        expect(threw).toBe(true);
      } finally {
        // Restore original manifest
        fs.writeFileSync(jsonPath, originalJson, "utf8");
      }
    });

    it("detects when a manifest file is missing and exits with error", () => {
      const jsonPath = path.join(process.cwd(), "public/assets/ui/atlas/ui-atlas.json");
      const backupPath = path.join(process.cwd(), "public/assets/ui/atlas/ui-atlas.json.bak");
      fs.renameSync(jsonPath, backupPath);

      try {
        let threw = false;
        try {
          execSync("node tools/ui/extrudeAndPack.mjs --check", { encoding: "utf8", stdio: "pipe" });
        } catch (err: any) {
          threw = true;
          expect(err.status).toBe(1);
          expect(err.stderr || err.stdout).toContain("UI Atlas manifests missing");
        }
        expect(threw).toBe(true);
      } finally {
        fs.renameSync(backupPath, jsonPath);
      }
    });

    it("detects when an extra sprite is added to assets directory causing stale check", async () => {
      const dummySpritePath = path.join(process.cwd(), "assets/ui/atlas/zz_dummy_stress_test.png");
      const dummyBuf = await sharp({
        create: {
          width: 32,
          height: 32,
          channels: 4,
          background: { r: 255, g: 0, b: 255, alpha: 1 }
        }
      }).png().toBuffer();
      fs.writeFileSync(dummySpritePath, dummyBuf);

      try {
        let threw = false;
        try {
          execSync("node tools/ui/extrudeAndPack.mjs --check", { encoding: "utf8", stdio: "pipe" });
        } catch (err: any) {
          threw = true;
          expect(err.status).toBe(1);
          expect(err.stderr || err.stdout).toContain("UI Atlas manifest is stale");
        }
        expect(threw).toBe(true);
      } finally {
        if (fs.existsSync(dummySpritePath)) {
          fs.unlinkSync(dummySpritePath);
        }
      }
    });
  });

  describe("4. Edge Cases in 2D Dilation & Packaging", () => {
    it("handles 1x1 single-pixel sprite extrusion correctly", async () => {
      const buf1x1 = await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 4,
          background: { r: 123, g: 234, b: 56, alpha: 255 }
        }
      }).png().toBuffer();

      const dilated = await dilateSpriteEdges(buf1x1, 2);
      expect(dilated.innerWidth).toBe(1);
      expect(dilated.innerHeight).toBe(1);
      expect(dilated.width).toBe(5); // 1 + 2*2
      expect(dilated.height).toBe(5);

      const raw = await sharp(dilated.buffer).raw().toBuffer();
      // Every single pixel in the 5x5 image should have RGB (123, 234, 56)
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          const idx = (y * 5 + x) * 4;
          expect(raw[idx]).toBe(123);
          expect(raw[idx + 1]).toBe(234);
          expect(raw[idx + 2]).toBe(56);
          expect(raw[idx + 3]).toBe(255);
        }
      }
    });

    it("handles fully transparent image in dilateAlphaRgb without crashing or division by zero", () => {
      const w = 10;
      const h = 10;
      const emptyRaw = Buffer.alloc(w * h * 4, 0); // all alpha = 0
      const result = dilateAlphaRgb(emptyRaw, w, h, 2);
      expect(result.length).toBe(w * h * 4);
      // All bytes should remain 0
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBe(0);
      }
    });

    it("handles extrude = 0 gracefully (no extrusion)", async () => {
      const buf = await sharp({
        create: {
          width: 16,
          height: 16,
          channels: 4,
          background: { r: 50, g: 60, b: 70, alpha: 1 }
        }
      }).png().toBuffer();

      const dilated = await dilateSpriteEdges(buf, 0);
      expect(dilated.width).toBe(16);
      expect(dilated.height).toBe(16);
      expect(dilated.innerWidth).toBe(16);
      expect(dilated.innerHeight).toBe(16);
    });
  });
});
