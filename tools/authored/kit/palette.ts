import * as THREE from "three";

import palette from "../../../art/palettes/neva.palette.json";

/**
 * Palette materials in the art pipeline's colour contract.
 *
 * Every published Neva GLB keeps its semantic palette colour in linear `COLOR_0` and leaves the
 * material factor white; the material itself only owns the token's name, roughness and metalness.
 * The loader multiplies the two, so an asset renders in its token colours while all assets that use
 * a token can share one runtime material. `SurfaceBuilder` bakes `COLOR_0` from `tokenLinearColor`.
 */

interface PaletteTokenSpec {
  hex: string;
  roughness: number;
  metalness: number;
  family: string;
  emissiveStrength?: number;
}

export const PALETTE_TOKENS = palette.tokens as Record<string, PaletteTokenSpec>;

export function tokenSpec(token: string): PaletteTokenSpec {
  const spec = PALETTE_TOKENS[token];
  if (!spec) throw new Error(`Unknown palette token ${token}`);
  return spec;
}

/** The token's colour in linear working space (three converts the sRGB hex on construction). */
export function tokenLinearColor(token: string): THREE.Color {
  return new THREE.Color(tokenSpec(token).hex);
}

const materials = new Map<string, THREE.MeshStandardMaterial>();

/**
 * One shared material per token. GLTFExporter deduplicates materials by object identity, so an asset
 * built from several SurfaceBuilders (a frame plus four hanging garments, say) must reference the same
 * instance per token or it exports a material per builder and breaks its material budget.
 */
export function tokenMaterial(token: string): THREE.MeshStandardMaterial {
  const existing = materials.get(token);
  if (existing) return existing;
  const spec = tokenSpec(token);
  const emissive = spec.family === "emissive";
  const material = new THREE.MeshStandardMaterial({
    name: token,
    color: new THREE.Color(1, 1, 1),
    vertexColors: true,
    roughness: spec.roughness,
    metalness: spec.metalness,
    // Non-emissive tokens keep the default intensity with a black emissive colour: an intensity of 0
    // would export a zero KHR_materials_emissive_strength, which the Khronos validator flags.
    emissive: emissive ? new THREE.Color(spec.hex) : new THREE.Color(0, 0, 0),
    emissiveIntensity: emissive ? spec.emissiveStrength ?? 1 : 1
  });
  materials.set(token, material);
  return material;
}
