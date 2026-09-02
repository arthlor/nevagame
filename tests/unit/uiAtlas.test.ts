import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  atlasForAction,
  atlasForBehavior,
  atlasForMapNode,
  atlasForQuality,
  atlasForRod,
  atlasForWeather,
  qualitySpriteKey
} from "../../src/ui/chrome/uiAtlas";
import { ROD_PROGRESSION } from "../../src/content/rods";

import {
  dilateAlphaRgb,
  dilateSpriteEdges,
  generateTypeScriptAtlasManifest,
  loadAtlasSprites,
  packLosslessUiAtlas
} from "../../tools/ui/extrudeAndPack.mjs";

import {
  UI_ATLAS_FRAMES,
  UI_ATLAS_MANIFEST,
  UI_ATLAS_PAGES,
  getAtlasFrame,
  getAtlasPageUrl,
  getAtlasSprite,
  getAtlasUv
} from "../../src/ui/atlas/AtlasManifest";

describe("UI atlas resolvers (Legacy / Compatibility)", () => {
  it("maps simulation quality aliases onto the four medallions", () => {
    expect(qualitySpriteKey("common")).toBe("normal");
    expect(qualitySpriteKey("fine")).toBe("silver");
    expect(qualitySpriteKey("exceptional")).toBe("gold");
    expect(qualitySpriteKey("trophy")).toBe("iridium");
    expect(qualitySpriteKey("good")).toBe("silver");
    expect(qualitySpriteKey("pristine")).toBe("iridium");
    expect(atlasForQuality("gold")).toContain("quality-gold.png");
  });

  it("normalises weather tags and time of day", () => {
    expect(atlasForWeather("cloudy")).toContain("weather-overcast.png");
    expect(atlasForWeather("heavy_rain")).toContain("weather-rain.png");
    expect(atlasForWeather("windy")).toContain("weather-wind.png");
    expect(atlasForWeather("clear", "night")).toContain("time-moon.png");
    expect(atlasForWeather("clear", "dawn")).toContain("time-dawn.png");
  });

  it("folds processing actions and hooked-fish behaviours", () => {
    expect(atlasForAction("processing-collect")).toContain("action-processing.png");
    expect(atlasForBehavior("run-left")).toContain("behavior-run.png");
    expect(atlasForBehavior("rest")).toContain("behavior-tiring.png");
    expect(atlasForMapNode("node_lighthouse")).toContain("mapnode-lighthouse.png");
  });

  it("maps every canonical fishing rod to its own atlas sprite", () => {
    for (const rodId of ROD_PROGRESSION) {
      expect(atlasForRod(rodId)).toContain(`rod-${rodId.slice("rod.".length)}.png`);
    }
    expect(atlasForRod("rod.unknown")).toBeUndefined();
  });
});

describe("UI Texture Atlas - 2D Edge Dilation Algorithm", () => {
  it("dilates RGB color into transparent neighbor pixels (dilateAlphaRgb)", () => {
    // Create a 6x6 raw image with a 2x2 solid red center at (2,2)..(3,3)
    const w = 6;
    const h = 6;
    const raw = Buffer.alloc(w * h * 4, 0);

    for (let y = 2; y <= 3; y++) {
      for (let x = 2; x <= 3; x++) {
        const idx = (y * w + x) * 4;
        raw[idx] = 255; // R
        raw[idx + 1] = 0; // G
        raw[idx + 2] = 0; // B
        raw[idx + 3] = 255; // A
      }
    }

    // 1-pixel radius dilation
    const dilated1 = dilateAlphaRgb(raw, w, h, 1);

    // Pixel at (1, 2) is adjacent to (2,2) - should have R=255 and A=0
    const adjIdx = (2 * w + 1) * 4;
    expect(dilated1[adjIdx]).toBe(255);
    expect(dilated1[adjIdx + 1]).toBe(0);
    expect(dilated1[adjIdx + 2]).toBe(0);
    expect(dilated1[adjIdx + 3]).toBe(0); // Alpha preserved as 0

    // Pixel at (0, 2) is 2 pixels away - in 1-pass it should still be 0
    const farIdx = (2 * w + 0) * 4;
    expect(dilated1[farIdx]).toBe(0);

    // 2-pixel radius dilation
    const dilated2 = dilateAlphaRgb(raw, w, h, 2);
    expect(dilated2[farIdx]).toBe(255);
    expect(dilated2[farIdx + 3]).toBe(0);
  });

  it("performs perimeter extrusion with clamped corners (dilateSpriteEdges)", async () => {
    // Create a 4x4 test pattern with distinct corner colors
    // Top-Left: Red, Top-Right: Green, Bottom-Left: Blue, Bottom-Right: Yellow
    const w = 4;
    const h = 4;
    const raw = Buffer.alloc(w * h * 4, 0);

    function setPixel(x: number, y: number, r: number, g: number, b: number, a = 255) {
      const idx = (y * w + x) * 4;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }

    setPixel(0, 0, 255, 0, 0); // TL = Red
    setPixel(3, 0, 0, 255, 0); // TR = Green
    setPixel(0, 3, 0, 0, 255); // BL = Blue
    setPixel(3, 3, 255, 255, 0); // BR = Yellow

    const pngInput = await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();

    const extrude = 2;
    const result = await dilateSpriteEdges(pngInput, extrude);

    expect(result.innerWidth).toBe(4);
    expect(result.innerHeight).toBe(4);
    expect(result.width).toBe(8); // 4 + 2*2
    expect(result.height).toBe(8);
    expect(result.extrude).toBe(2);

    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.width).toBe(8);
    expect(outMeta.height).toBe(8);

    const rawOut = await sharp(result.buffer).raw().toBuffer();

    function getOutPixel(x: number, y: number) {
      const idx = (y * 8 + x) * 4;
      return {
        r: rawOut[idx],
        g: rawOut[idx + 1],
        b: rawOut[idx + 2],
        a: rawOut[idx + 3]
      };
    }

    // Check center inner content copied at (2,2)
    expect(getOutPixel(2, 2)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(getOutPixel(5, 2)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
    expect(getOutPixel(2, 5)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    expect(getOutPixel(5, 5)).toEqual({ r: 255, g: 255, b: 0, a: 255 });

    // Check top-left extruded 2x2 corner quad (0..1, 0..1) matches (0,0) = Red
    expect(getOutPixel(0, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(getOutPixel(1, 1)).toEqual({ r: 255, g: 0, b: 0, a: 255 });

    // Check top-right extruded corner quad (6..7, 0..1) matches (3,0) = Green
    expect(getOutPixel(7, 0)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
    expect(getOutPixel(6, 1)).toEqual({ r: 0, g: 255, b: 0, a: 255 });

    // Check bottom-left extruded corner quad (0..1, 6..7) matches (0,3) = Blue
    expect(getOutPixel(0, 7)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    expect(getOutPixel(1, 6)).toEqual({ r: 0, g: 0, b: 255, a: 255 });

    // Check bottom-right extruded corner quad (6..7, 6..7) matches (3,3) = Yellow
    expect(getOutPixel(7, 7)).toEqual({ r: 255, g: 255, b: 0, a: 255 });
    expect(getOutPixel(6, 6)).toEqual({ r: 255, g: 255, b: 0, a: 255 });
  });
});

describe("UI Texture Atlas - MaxRects Bin Packing & Manifest", () => {
  it("packs multiple synthetic sprites into a POT atlas with exact inner UVs", async () => {
    // Generate 4 synthetic 32x32 test sprites
    const sprites = [];
    const colors = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 255, b: 0 }
    ];

    for (let i = 0; i < 4; i++) {
      const buf = await sharp({
        create: {
          width: 32,
          height: 32,
          channels: 4,
          background: { ...colors[i], alpha: 1 }
        }
      }).png().toBuffer();

      sprites.push({
        name: `test_sprite_${i}`,
        id: `test.${i}`,
        buffer: buf
      });
    }

    const outputBase = path.join(process.cwd(), "generated/.test-atlas");

    const result = await packLosslessUiAtlas(sprites, outputBase, "test-atlas", {
      maxWidth: 256,
      maxHeight: 256,
      padding: 2,
      extrude: 2,
      pot: true,
      writeFiles: false
    });

    expect(result.bins.length).toBeGreaterThanOrEqual(1);
    const bin = result.bins[0];

    // Atlas dimension should be power of two
    expect(bin.width & (bin.width - 1)).toBe(0);
    expect(bin.height & (bin.height - 1)).toBe(0);

    // Verify all 4 sprites are in manifest
    for (let i = 0; i < 4; i++) {
      const spriteKey = `test_sprite_${i}`;
      const entry = result.manifest.frames[spriteKey];
      expect(entry).toBeDefined();

      expect(entry.innerWidth).toBe(32);
      expect(entry.innerHeight).toBe(32);
      expect(entry.frame.w).toBe(32);
      expect(entry.frame.h).toBe(32);

      // Inner coordinates should be exactly rect.x + 2, rect.y + 2
      expect(entry.innerX).toBe(entry.outerFrame.x + 2);
      expect(entry.innerY).toBe(entry.outerFrame.y + 2);
      expect(entry.frame.x).toBe(entry.innerX);
      expect(entry.frame.y).toBe(entry.innerY);

      // Verify UV calculations
      expect(entry.uv.u0).toBeCloseTo(entry.innerX / bin.width, 6);
      expect(entry.uv.v0).toBeCloseTo(entry.innerY / bin.height, 6);
      expect(entry.uv.u1).toBeCloseTo((entry.innerX + 32) / bin.width, 6);
      expect(entry.uv.v1).toBeCloseTo((entry.innerY + 32) / bin.height, 6);

      expect(entry.uvBounds).toEqual([
        entry.uv.u0,
        entry.uv.v0,
        entry.uv.u1,
        entry.uv.v1
      ]);
    }
  });

  it("handles multiple pages when sprites exceed maximum bin size", async () => {
    // Create 6 large 64x64 sprites with a max bin size of 128x128 (with 2px extrude = 68x68, fits 1 per 128x128 bin)
    const sprites = [];
    for (let i = 0; i < 6; i++) {
      const buf = await sharp({
        create: {
          width: 64,
          height: 64,
          channels: 4,
          background: { r: 100, g: 150, b: 200, alpha: 1 }
        }
      }).png().toBuffer();

      sprites.push({
        name: `large_${i}`,
        buffer: buf
      });
    }

    const outputBase = path.join(process.cwd(), "generated/.test-multi-bin");

    const result = await packLosslessUiAtlas(sprites, outputBase, "test-multi", {
      maxWidth: 128,
      maxHeight: 128,
      padding: 2,
      extrude: 2,
      pot: true,
      writeFiles: false
    });

    // Multiple pages must be allocated
    expect(result.bins.length).toBeGreaterThan(1);
    expect(result.manifest.pages.length).toBe(result.bins.length);

    // Each sprite must have a valid binIndex / page assignment
    for (let i = 0; i < 6; i++) {
      const entry = result.manifest.frames[`large_${i}`];
      expect(entry.binIndex).toBeGreaterThanOrEqual(0);
      expect(entry.binIndex).toBeLessThan(result.bins.length);
      expect(entry.page).toBe(entry.binIndex);
    }
  });
});

describe("UI Texture Atlas - Production Assets & Manifest Integration", () => {
  it("loads and validates all production sprites via loadAtlasSprites", () => {
    const sprites = loadAtlasSprites();
    expect(sprites.length).toBeGreaterThanOrEqual(100);

    for (const sprite of sprites) {
      expect(sprite.file).toBeDefined();
      expect(sprite.path).toBeDefined();
      expect(fs.existsSync(sprite.path!)).toBe(true);
    }
  });

  it("validates production AtlasManifest.ts exports and lookup functions", () => {
    expect(UI_ATLAS_MANIFEST).toBeDefined();
    expect(UI_ATLAS_MANIFEST.atlas).toBe("ui-atlas");
    expect(UI_ATLAS_MANIFEST.extrude).toBe(2);
    expect(UI_ATLAS_PAGES.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(UI_ATLAS_FRAMES).length).toBeGreaterThanOrEqual(100);

    // Look up an iconic fish sprite
    const carpSprite = getAtlasSprite("fish.carp");
    expect(carpSprite).toBeDefined();
    expect(carpSprite?.innerWidth).toBe(256);
    expect(carpSprite?.innerHeight).toBe(256);

    const carpUv = getAtlasUv("fish.carp");
    expect(carpUv).toBeDefined();
    expect(carpUv?.length).toBe(4);
    expect(carpUv![0]).toBeGreaterThanOrEqual(0);
    expect(carpUv![1]).toBeGreaterThanOrEqual(0);
    expect(carpUv![2]).toBeLessThanOrEqual(1);
    expect(carpUv![3]).toBeLessThanOrEqual(1);
    expect(carpUv![2]).toBeGreaterThan(carpUv![0]);
    expect(carpUv![3]).toBeGreaterThan(carpUv![1]);

    const carpFrame = getAtlasFrame("fish.carp");
    expect(carpFrame).toBeDefined();
    expect(carpFrame?.w).toBe(256);
    expect(carpFrame?.h).toBe(256);

    // Verify page URLs
    const webpUrl = getAtlasPageUrl(0, "webp");
    expect(webpUrl).toContain("/assets/ui/atlas/ui-atlas");
    expect(webpUrl).toContain(".webp");

    const pngUrl = getAtlasPageUrl(0, "png");
    expect(pngUrl).toContain("/assets/ui/atlas/ui-atlas");
    expect(pngUrl).toContain(".png");
  });

  it("validates lossless WebP and PNG production atlas files exist on disk", () => {
    const atlasDir = path.join(process.cwd(), "public/assets/ui/atlas");
    const jsonPath = path.join(atlasDir, "ui-atlas.json");
    expect(fs.existsSync(jsonPath)).toBe(true);

    const json = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(json.atlas).toBe("ui-atlas");
    expect(json.pages.length).toBeGreaterThanOrEqual(1);

    for (const page of json.pages) {
      const pngPath = path.join(atlasDir, page.imagePng);
      const webpPath = path.join(atlasDir, page.imageWebp);
      expect(fs.existsSync(pngPath)).toBe(true);
      expect(fs.existsSync(webpPath)).toBe(true);

      const pngStat = fs.statSync(pngPath);
      const webpStat = fs.statSync(webpPath);
      expect(pngStat.size).toBeGreaterThan(1000);
      expect(webpStat.size).toBeGreaterThan(1000);
    }
  });

  it("generates type-safe TypeScript manifest code matching contract", () => {
    const mockManifest = {
      atlas: "ui-atlas",
      extrude: 2,
      pages: [
        {
          index: 0,
          width: 2048,
          height: 2048,
          imagePng: "ui-atlas_0.png",
          imageWebp: "ui-atlas_0.webp"
        }
      ],
      frames: {
        "test.icon": {
          name: "test.icon",
          frame: { x: 2, y: 2, w: 256, h: 256 },
          innerX: 2,
          innerY: 2,
          innerWidth: 256,
          innerHeight: 256,
          outerFrame: { x: 0, y: 0, w: 260, h: 260 },
          uv: { u0: 2 / 2048, v0: 2 / 2048, u1: 258 / 2048, v1: 258 / 2048 },
          uvBounds: [2 / 2048, 2 / 2048, 258 / 2048, 258 / 2048] as [number, number, number, number],
          binIndex: 0,
          page: 0
        }
      }
    };

    const tsCode = generateTypeScriptAtlasManifest(mockManifest);
    expect(tsCode).toContain("export interface AtlasFrame");
    expect(tsCode).toContain("export interface AtlasUv");
    expect(tsCode).toContain("export interface AtlasSprite");
    expect(tsCode).toContain("export const UI_ATLAS_MANIFEST");
    expect(tsCode).toContain("export function getAtlasSprite");
    expect(tsCode).toContain("export function getAtlasUv");
    expect(tsCode).toContain("export function getAtlasFrame");
    expect(tsCode).toContain("export function getAtlasPageUrl");
  });
});
