import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cleanSpriteEdges, resolveSpriteBoxes } from "../../tools/ui/slice-sheet.mjs";
import { packLosslessUiAtlas } from "../../tools/ui/extrudeAndPack.mjs";

describe("authored UI sheet extraction", () => {
  it("selects declared islands and rejects changed detection or duplicate assignments", () => {
    const boxes = [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }];
    const spec = { id: "tags", expectedIslands: 4, sprites: [
      { file: "calendar.png", index: 0 }, { file: "paper.png", index: 3 }
    ] };
    expect(resolveSpriteBoxes(spec, boxes)).toEqual([boxes[0], boxes[3]]);
    expect(() => resolveSpriteBoxes(spec, boxes.slice(0, 3))).toThrow("expects 4");
    expect(() => resolveSpriteBoxes({ ...spec, sprites: [spec.sprites[0], spec.sprites[0]] }, boxes)).toThrow("duplicate");
  });

  it("removes key spill only from translucent edges and preserves teal paint", () => {
    const input = Buffer.from([
      40, 140, 50, 128, // green introduced by key unmix
      40, 140, 50, 255, // opaque paint
      40, 140, 145, 128, // teal edge
      255, 0, 255, 4 // near-transparent key residue
    ]);
    const output = cleanSpriteEdges(input, {alphaFloor: 8, alphaBelow: 250, excessAboveRedAndBlue: 24});
    expect([...output]).toEqual([40, 50, 50, 128, 40, 140, 50, 255, 40, 140, 145, 128, 0, 0, 0, 0]);
    expect(input[1]).toBe(140);
  });

  it("trims opt-in atlas frames without changing existing square icons or visible pixels", async () => {
    const pixels = Buffer.alloc(16 * 16 * 4);
    for (let y = 6; y < 10; y += 1) {
      for (let x = 2; x < 14; x += 1) pixels.set([41, 72, 98, 255], (y * 16 + x) * 4);
    }
    const buffer = await sharp(pixels, {raw: {width: 16, height: 16, channels: 4}}).png().toBuffer();
    const result = await packLosslessUiAtlas([
      {name: "rail", buffer, trim: true}, {name: "icon", buffer}
    ], "/private/tmp/neva-ui-test", "test", {writeFiles: false, maxWidth: 128, maxHeight: 128});
    const rail = result.manifest.frames.rail;
    expect([rail.frame.w, rail.frame.h]).toEqual([12, 4]);
    expect([result.manifest.frames.icon.frame.w, result.manifest.frames.icon.frame.h]).toEqual([16, 16]);
    const decoded = await sharp(result.images[rail.page].pngBuffer)
      .extract({left: rail.frame.x, top: rail.frame.y, width: 12, height: 4}).raw().toBuffer();
    for (let offset = 0; offset < decoded.length; offset += 4) {
      expect([...decoded.subarray(offset, offset + 4)]).toEqual([41, 72, 98, 255]);
    }
  });
});
