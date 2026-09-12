import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { paletteTokenForLoadedMaterial } from "./PaletteMaterials";
import { applyWorldAtmosphere } from "../atmosphere/AtmosphereMaterial";
import { PALETTE_HEX, PALETTE_SPECS } from "./PaletteTokens";

const variants = new Map<string, { material: THREE.MeshStandardMaterial; delay: number }>();
let currentLevel = 0;

export function windowEmissionAt(level: number, delay: number): number {
  return THREE.MathUtils.smoothstep(level, delay, delay + CANONICAL_RENDER_CONFIG.windowStagger.fadeWidth);
}

/** Only window surfaces vary; keep each source region's vertex colours and maps. */
export function architectureWindowMaterial(source: THREE.Material, padId: string): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial) || paletteTokenForLoadedMaterial(source) !== "emissive_window_01") return source;
  let hash = 0;
  for (const letter of padId) hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
  const cohort = hash % 8;
  const key = `${source.uuid}:${cohort}`;
  const existing = variants.get(key);
  if (existing) return existing.material;
  const material = source.clone();
  applyWorldAtmosphere(material);
  material.emissive.set(PALETTE_HEX.emissive_window_01);
  const delay = cohort / 7 * CANONICAL_RENDER_CONFIG.windowStagger.maximumDelay;
  material.emissiveIntensity = PALETTE_SPECS.emissive_window_01.emissiveStrength * windowEmissionAt(currentLevel, delay);
  variants.set(key, { material, delay });
  return material;
}

export function updateArchitectureWindows(level: number): void {
  currentLevel = level;
  for (const { material, delay } of variants.values()) {
    material.emissiveIntensity = PALETTE_SPECS.emissive_window_01.emissiveStrength * windowEmissionAt(level, delay);
  }
}

export function disposeArchitectureWindows(): void {
  for (const { material } of variants.values()) material.dispose();
  variants.clear();
}
