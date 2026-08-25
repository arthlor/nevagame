import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";

import { PaletteMaterials } from "../../src/render/materials/PaletteMaterials";

describe("PaletteMaterials vertex-color contracts", () => {
  afterEach(() => PaletteMaterials.clearCache());

  it("uses white only when COLOR_0 already owns the complete semantic color", () => {
    const multiplied = PaletteMaterials.standard("grass_yellow_01", {
      vertexColors: true,
      vertexColorMode: "multiply"
    });
    const replaced = PaletteMaterials.standard("grass_yellow_01", {
      vertexColors: true,
      vertexColorMode: "replace"
    });

    expect(replaced).not.toBe(multiplied);
    expect(replaced.color.getHex()).toBe(0xffffff);
    expect(multiplied.color.getHex()).not.toBe(0xffffff);
  });

  it("does not reuse cached materials across transparency or emissive options", () => {
    const opaque = PaletteMaterials.standard("foam_warm_01");
    const transparent = PaletteMaterials.standard("foam_warm_01", {
      transparent: true,
      opacity: 0.65
    });
    const bright = PaletteMaterials.standard("emissive_lantern_01", {
      emissiveIntensity: 3.2
    });
    const dim = PaletteMaterials.standard("emissive_lantern_01", {
      emissiveIntensity: 1.1
    });

    expect(transparent).not.toBe(opaque);
    expect(transparent.transparent).toBe(true);
    expect(transparent.opacity).toBe(0.65);
    expect(bright).not.toBe(dim);
    expect(bright.emissiveIntensity).toBe(3.2);
    expect(dim.emissiveIntensity).toBe(1.1);
  });

  it("shares identical texture-free palette materials imported from separate GLBs", () => {
    const first = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.86,
      vertexColors: true
    });
    first.name = "wood_dark_01";
    const duplicate = first.clone();
    duplicate.name = first.name;
    const different = first.clone();
    different.name = first.name;
    different.roughness = 0.72;

    expect(PaletteMaterials.canonicalizeLoaded(first)).toBe(first);
    expect(PaletteMaterials.canonicalizeLoaded(duplicate)).toBe(first);
    expect(PaletteMaterials.canonicalizeLoaded(different)).toBe(different);
  });
});
