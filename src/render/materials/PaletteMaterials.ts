// src/render/materials/PaletteMaterials.ts

import * as THREE from "three";
import { PALETTE_HEX, PALETTE_SPECS, PaletteToken } from "./PaletteTokens";

export interface MaterialOptions {
  vertexColors?: boolean;
  flatShading?: boolean;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  emissiveIntensity?: number;
}

export class PaletteMaterials {
  private static cache: Map<string, THREE.MeshStandardMaterial> = new Map();

  public static standard(token: PaletteToken, options: MaterialOptions = {}): THREE.MeshStandardMaterial {
    const key = `${token}_vc${options.vertexColors ? 1 : 0}_flat${options.flatShading ? 1 : 0}_r${options.roughness || 0}_m${options.metalness || 0}_op${options.opacity || 1}`;
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const hex = PALETTE_HEX[token];
    const color = new THREE.Color(hex);
    const spec = PALETTE_SPECS[token];
    const isEmissive = spec.family === "emissive";
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? spec.roughness,
      metalness: options.metalness ?? spec.metalness,
      vertexColors: options.vertexColors ?? false,
      flatShading: options.flatShading ?? true,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1.0,
      emissive: isEmissive ? color : new THREE.Color(0x000000),
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
