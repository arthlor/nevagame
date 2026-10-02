import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";

import { PaletteMaterials } from "../../src/render/materials/PaletteMaterials";
import { PALETTE_HEX, PALETTE_SPECS } from "../../src/render/materials/PaletteTokens";

describe("PaletteMaterials vertex-color contracts", () => {
  afterEach(() => {
    PaletteMaterials.setEmissiveLevel(1);
    PaletteMaterials.clearCache();
  });

  it("keeps explicit smooth materials separate from the default flat material in either cache order", () => {
    for (const smoothFirst of [false, true]) {
      PaletteMaterials.clearCache();
      if (smoothFirst) PaletteMaterials.standard("canvas_cream_01", { flatShading: false });
      const flat = PaletteMaterials.standard("canvas_cream_01");
      const smooth = PaletteMaterials.standard("canvas_cream_01", { flatShading: false });
      expect(flat).not.toBe(smooth);
      expect(flat.flatShading).toBe(true);
      expect(smooth.flatShading).toBe(false);
      expect(PaletteMaterials.standard("canvas_cream_01", { flatShading: true })).toBe(flat);
    }
  });

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

  it("uses each emissive token's authored palette strength by default", () => {
    const windows = PaletteMaterials.standard("emissive_window_01");
    const lantern = PaletteMaterials.standard("emissive_lantern_01");

    expect(windows.emissiveIntensity).toBe(PALETTE_SPECS.emissive_window_01.emissiveStrength);
    expect(lantern.emissiveIntensity).toBe(PALETTE_SPECS.emissive_lantern_01.emissiveStrength);
    expect(windows.emissiveIntensity).not.toBe(lantern.emissiveIntensity);
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

  it("preserves arbitrary authored material values and separates double-sided cache entries", () => {
    const source = new THREE.MeshStandardMaterial({
      name: "wood_warm_01", color: "#206aff", roughness: .24, metalness: .6,
      vertexColors: true, flatShading: false, side: THREE.DoubleSide
    });
    const oneSided = source.clone();
    oneSided.side = THREE.FrontSide;
    expect(PaletteMaterials.canonicalizeLoaded(source)).toBe(source);
    expect(source.color.getHexString()).toBe("206aff");
    expect(source.roughness).toBe(.24);
    expect(source.metalness).toBe(.6);
    expect(source.vertexColors).toBe(true);
    expect(source.flatShading).toBe(false);
    expect(source.side).toBe(THREE.DoubleSide);
    expect(PaletteMaterials.canonicalizeLoaded(oneSided)).toBe(oneSided);
    expect(PaletteMaterials.canonicalizeLoaded(source.clone())).toBe(source);
  });

  it("preserves distinct native physical extensions even when source materials share a palette token", () => {
    const source = new THREE.MeshPhysicalMaterial({
      name: "wood_warm_01", color: "#206aff", roughness: .24, metalness: .6,
      specularIntensity: .2, specularColor: "#ff8899", transmission: .35,
      thickness: .4, attenuationColor: "#55aacc", attenuationDistance: 2
    });
    const different = source.clone();
    different.specularIntensity = .8;
    different.specularColor.set("#8899ff");
    different.thickness = 1.2;
    different.attenuationDistance = 8;

    expect(PaletteMaterials.canonicalizeLoaded(source)).toBe(source);
    expect(PaletteMaterials.canonicalizeLoaded(different)).toBe(different);
    expect(source.specularIntensity).toBe(.2);
    expect(source.specularColor.getHexString()).toBe("ff8899");
    expect(source.thickness).toBe(.4);
    expect(source.transmission).toBe(.35);
    expect(source.attenuationDistance).toBe(2);
    expect(different.specularIntensity).toBe(.8);
    expect(different.specularColor.getHexString()).toBe("8899ff");
    expect(different.thickness).toBe(1.2);
    expect(different.attenuationDistance).toBe(8);
  });

  it("resolves source-region materials through explicit catalog token metadata", () => {
    const darkStone = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      vertexColors: true
    });
    darkStone.name = "Stone_Dark";
    darkStone.userData.neva_palette_token = "stone_warm_01";
    darkStone.userData.neva_source_material = "Stone_Dark";
    const lightStone = darkStone.clone();
    lightStone.name = "Stone_Light";
    lightStone.userData.neva_source_material = "Stone_Light";

    expect(PaletteMaterials.canonicalizeLoaded(darkStone)).toBe(darkStone);
    expect(darkStone.name).toBe("Stone_Dark");
    expect(PaletteMaterials.canonicalizeLoaded(lightStone)).toBe(lightStone);
    expect(darkStone.userData.neva_source_material).toBe("Stone_Dark");
  });

  it("keeps source textures while adopting their declared palette semantics", () => {
    const bark = new THREE.MeshStandardMaterial({ name: "NormalTree_Bark" });
    bark.userData.neva_palette_token = "wood_warm_01";
    bark.userData.neva_source_material = "NormalTree_Bark";
    bark.map = new THREE.Texture();

    expect(PaletteMaterials.canonicalizeLoaded(bark)).toBe(bark);
    expect(bark.name).toBe("NormalTree_Bark");
    expect(bark.map).toBeInstanceOf(THREE.Texture);
  });

  it("keeps an imported source region's authored emissive color and only scales its strength", () => {
    const expected = new THREE.Color("#ffdf99").multiplyScalar(0.94);
    const windows = new THREE.MeshStandardMaterial({
      name: "Windows",
      color: 0xffffff,
      emissive: expected,
      emissiveIntensity: 2,
      vertexColors: true
    });
    windows.userData.neva_palette_token = "emissive_window_01";
    windows.userData.neva_source_material = "Windows";

    PaletteMaterials.setEmissiveLevel(0.25);
    expect(PaletteMaterials.canonicalizeLoaded(windows)).toBe(windows);
    expect(windows.name).toBe("Windows");
    expect(windows.emissive.toArray()).toEqual(expected.toArray());
    expect(windows.emissiveIntensity).toBeCloseTo(0.5);
  });

  it("repairs legacy white emission on texture-free generated palette materials", () => {
    const lantern = new THREE.MeshStandardMaterial({
      name: "emissive_lantern_01",
      emissive: 0xffffff,
      emissiveIntensity: 2.8,
      vertexColors: true
    });

    expect(PaletteMaterials.canonicalizeLoaded(lantern)).toBe(lantern);
    expect(lantern.emissive.getHex()).toBe(new THREE.Color(PALETTE_HEX.emissive_lantern_01).getHex());
    expect(lantern.emissiveIntensity).toBe(PALETTE_SPECS.emissive_lantern_01.emissiveStrength);
  });
});
