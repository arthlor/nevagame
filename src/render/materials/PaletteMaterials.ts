// src/render/materials/PaletteMaterials.ts

import * as THREE from "three";
import { PALETTE_HEX, PALETTE_SPECS, PaletteToken } from "./PaletteTokens";

export interface MaterialOptions {
  vertexColors?: boolean;
  /**
   * `multiply` treats COLOR_0 as a value mask over the token color. `replace`
   * uses white as the material factor when COLOR_0 already contains full
   * semantic palette colors (for example, the multi-surface terrain mesh).
   */
  vertexColorMode?: "multiply" | "replace";
  flatShading?: boolean;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  emissiveIntensity?: number;
}

export class PaletteMaterials {
  private static cache: Map<string, THREE.MeshStandardMaterial> = new Map();

  /**
   * GLB files carry one material instance per imported document. Generated
   * assets still use the same canonical palette token and material settings,
   * so keeping those duplicate instances fragments otherwise compatible
   * static batches. Adopt texture-free generated materials into this shared
   * cache without changing their exported appearance.
   */
  public static canonicalizeLoaded(material: THREE.Material): THREE.Material {
    if (!(material instanceof THREE.MeshStandardMaterial)) return material;
    if (!Object.prototype.hasOwnProperty.call(PALETTE_SPECS, material.name)) return material;

    const textureSlots = [
      material.map,
      material.alphaMap,
      material.aoMap,
      material.bumpMap,
      material.displacementMap,
      material.emissiveMap,
      material.envMap,
      material.lightMap,
      material.metalnessMap,
      material.normalMap,
      material.roughnessMap
    ];
    if (textureSlots.some(Boolean)) return material;

    const key = [
      "loaded",
      material.name,
      material.color.getHexString(),
      material.emissive.getHexString(),
      material.emissiveIntensity,
      material.roughness,
      material.metalness,
      material.vertexColors,
      material.flatShading,
      material.transparent,
      material.opacity,
      material.alphaTest,
      material.side,
      material.depthTest,
      material.depthWrite,
      material.blending,
      material.premultipliedAlpha,
      material.toneMapped
    ].join("|");
    const existing = this.cache.get(key);
    if (existing) return existing;
    this.cache.set(key, material);
    return material;
  }

  public static standard(token: PaletteToken, options: MaterialOptions = {}): THREE.MeshStandardMaterial {
    const vertexColorMode = options.vertexColorMode ?? "multiply";
    const key = [
      token,
      `vc:${options.vertexColors ?? false}`,
      `vcm:${vertexColorMode}`,
      `flat:${options.flatShading ?? false}`,
      `r:${options.roughness ?? "token"}`,
      `m:${options.metalness ?? "token"}`,
      `transparent:${options.transparent ?? false}`,
      `opacity:${options.opacity ?? 1}`,
      `emissive:${options.emissiveIntensity ?? "token"}`
    ].join("|");
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const hex = PALETTE_HEX[token];
    const color =
      options.vertexColors && vertexColorMode === "replace"
        ? new THREE.Color(0xffffff)
        : new THREE.Color(hex);
    const spec = PALETTE_SPECS[token];
    const isEmissive = spec.family === "emissive";
    const emissiveColor = new THREE.Color(hex);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? spec.roughness,
      metalness: options.metalness ?? spec.metalness,
      vertexColors: options.vertexColors ?? false,
      flatShading: options.flatShading ?? true,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1.0,
      emissive: isEmissive ? emissiveColor : new THREE.Color(0x000000),
      emissiveIntensity: isEmissive ? options.emissiveIntensity ?? 1.8 : 0.0
    });

    this.cache.set(key, mat);
    return mat;
  }

  public static clearCache(): void {
    for (const mat of this.cache.values()) {
      mat.dispose();
    }
    this.cache.clear();
  }
}
