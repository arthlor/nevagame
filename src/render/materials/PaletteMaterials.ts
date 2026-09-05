// src/render/materials/PaletteMaterials.ts

import * as THREE from "three";
import { PALETTE_HEX, PALETTE_SPECS, PaletteToken } from "./PaletteTokens";
import { applyCoastalStoneSurface } from "./CoastalSurfaceMaterial";

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

export function paletteTokenForLoadedMaterial(material: THREE.Material): PaletteToken | null {
  const declared = material.userData?.neva_palette_token;
  const token = typeof declared === "string" ? declared : material.name;
  return Object.prototype.hasOwnProperty.call(PALETTE_SPECS, token)
    ? token as PaletteToken
    : null;
}

function paletteEmissiveStrength(token: PaletteToken): number {
  return (PALETTE_SPECS[token] as { emissiveStrength?: number }).emissiveStrength ?? 0;
}

export class PaletteMaterials {
  private static cache: Map<string, THREE.MeshStandardMaterial> = new Map();
  /**
   * Authored emissive strength per material. Window and lantern glow is a night
   * system, not a constant: the palette authors each token for full dark, and
   * `setEmissiveLevel` scales toward zero as the key light comes up. Recording
   * the authored value rather than overwriting it keeps the per-token
   * relationship (a lantern is hotter than a window) intact at every level.
   */
  private static readonly emissiveMaterials = new Map<THREE.MeshStandardMaterial, number>();
  private static emissiveLevel = 1;

  private static registerEmissive(material: THREE.MeshStandardMaterial): void {
    if (material.emissiveIntensity <= 0 || this.emissiveMaterials.has(material)) return;
    const authored = material.emissiveIntensity;
    this.emissiveMaterials.set(material, authored);
    material.emissiveIntensity = authored * this.emissiveLevel;
  }

  /**
   * Drives every emissive palette material from one time-of-day scalar. Called
   * once per frame with the lighting frame's practical-light level, so lit
   * windows fade up at dusk instead of glowing just as hard at noon. These are
   * shared cached materials, so this is a handful of scalar writes per frame and
   * costs no draw calls.
   */
  public static setEmissiveLevel(level: number): void {
    const clamped = THREE.MathUtils.clamp(level, 0, 1);
    if (Math.abs(clamped - this.emissiveLevel) < 0.001) return;
    this.emissiveLevel = clamped;
    for (const [material, authored] of this.emissiveMaterials) {
      material.emissiveIntensity = authored * clamped;
    }
  }

  /**
   * GLB files carry one material instance per imported document. Generated
   * assets still use the same canonical palette token and material settings,
   * so keeping those duplicate instances fragments otherwise compatible
   * static batches. Adopt texture-free generated materials into this shared
   * cache without changing their exported appearance.
   */
  public static canonicalizeLoaded(material: THREE.Material): THREE.Material {
    if (!(material instanceof THREE.MeshStandardMaterial)) return material;
    const token = paletteTokenForLoadedMaterial(material);
    if (!token) return material;
    // Explicit imported source regions stay distinct at runtime. Their token
    // metadata still drives palette-family behavior without merging separate
    // provider material regions into one shared material object.
    if (typeof material.userData?.neva_source_material === "string") {
      this.registerEmissive(material);
      return material;
    }

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
    const hasTextures = textureSlots.some(Boolean);
    const spec = PALETTE_SPECS[token];
    if (!hasTextures && spec.family === "emissive") {
      // Older generated GLBs linked COLOR_0 into Blender's emission socket.
      // glTF cannot represent that link and exported a white emissiveFactor.
      // Reassert the canonical token at the shared runtime boundary while
      // explicit imported source regions above retain their authored factor.
      material.emissive.set(PALETTE_HEX[token]);
      material.emissiveIntensity = paletteEmissiveStrength(token);
    }
    if (hasTextures) {
      this.registerEmissive(material);
      return material;
    }

    const key = [
      "loaded",
      token,
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
    if (token.startsWith("stone_coastal_")) applyCoastalStoneSurface(material);
    this.cache.set(key, material);
    this.registerEmissive(material);
    return material;
  }

  public static standard(token: PaletteToken, options: MaterialOptions = {}): THREE.MeshStandardMaterial {
    const vertexColorMode = options.vertexColorMode ?? "multiply";
    const flatShading = options.flatShading ?? true;
    const key = [
      token,
      `vc:${options.vertexColors ?? false}`,
      `vcm:${vertexColorMode}`,
      `flat:${flatShading}`,
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
      flatShading,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1.0,
      emissive: isEmissive ? emissiveColor : new THREE.Color(0x000000),
      emissiveIntensity: isEmissive
        ? options.emissiveIntensity ?? paletteEmissiveStrength(token)
        : 0.0
    });

    this.cache.set(key, mat);
    this.registerEmissive(mat);
    return mat;
  }

  public static clearCache(): void {
    for (const mat of this.cache.values()) {
      mat.dispose();
    }
    this.cache.clear();
    this.emissiveMaterials.clear();
  }
}
