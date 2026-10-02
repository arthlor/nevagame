import * as THREE from "three";

export type SurfaceTextureKind = "color" | "roughness";

export interface SurfaceTextureLoader {
  loadAsync(url: string): Promise<THREE.Texture>;
}

export interface SurfaceTextureSpec {
  readonly kind: SurfaceTextureKind;
  readonly sourcePage: string;
  readonly sourceName: string;
  /** Retained raster derivative used to reproduce the compressed runtime map. */
  readonly sourceUrl: string;
  readonly url: string;
}

/**
 * Processed derivatives of the selected Poly Haven CC0 maps. Raster sources
 * are retained; runtime KTX2 files include filtered mips and BasisU compression.
 * The source pages stay explicit here so the runtime asset provenance is not
 * lost when the maps are reduced for the game.
 */
export const POLYHAVEN_SURFACE_TEXTURES = Object.freeze({
  roadColor: {
    kind: "color",
    sourceName: "Grass Path 2",
    sourcePage: "https://polyhaven.com/a/grass_path_2",
    sourceUrl: "/assets/textures/terrain/polyhaven-grass-path-2-color.webp",
    url: "/assets/textures/terrain/polyhaven-grass-path-2-color.ktx2"
  },
  roadRoughness: {
    kind: "roughness",
    sourceName: "Grass Path 2",
    sourcePage: "https://polyhaven.com/a/grass_path_2",
    sourceUrl: "/assets/textures/terrain/polyhaven-grass-path-2-roughness.webp",
    url: "/assets/textures/terrain/polyhaven-grass-path-2-roughness.ktx2"
  },
  beachColor: {
    kind: "color",
    sourceName: "Coast Sand 01",
    sourcePage: "https://polyhaven.com/a/coast_sand_01",
    sourceUrl: "/assets/textures/terrain/polyhaven-coast-sand-01-color.webp",
    url: "/assets/textures/terrain/polyhaven-coast-sand-01-color.ktx2"
  },
  beachRoughness: {
    kind: "roughness",
    sourceName: "Coast Sand 01",
    sourcePage: "https://polyhaven.com/a/coast_sand_01",
    sourceUrl: "/assets/textures/terrain/polyhaven-coast-sand-01-roughness.webp",
    url: "/assets/textures/terrain/polyhaven-coast-sand-01-roughness.ktx2"
  },
  leafyGrassColor: {
    kind: "color",
    sourceName: "Leafy Grass",
    sourcePage: "https://polyhaven.com/a/leafy_grass",
    sourceUrl: "/assets/textures/terrain/polyhaven-leafy-grass-color.webp",
    url: "/assets/textures/terrain/polyhaven-leafy-grass-color.ktx2"
  },
  leafyGrassRoughness: {
    kind: "roughness",
    sourceName: "Leafy Grass",
    sourcePage: "https://polyhaven.com/a/leafy_grass",
    sourceUrl: "/assets/textures/terrain/polyhaven-leafy-grass-roughness.webp",
    url: "/assets/textures/terrain/polyhaven-leafy-grass-roughness.ktx2"
  },
  sparseGrassColor: {
    kind: "color",
    sourceName: "Sparse Grass",
    sourcePage: "https://polyhaven.com/a/sparse_grass",
    sourceUrl: "/assets/textures/terrain/polyhaven-sparse-grass-color.webp",
    url: "/assets/textures/terrain/polyhaven-sparse-grass-color.ktx2"
  },
  sparseGrassRoughness: {
    kind: "roughness",
    sourceName: "Sparse Grass",
    sourcePage: "https://polyhaven.com/a/sparse_grass",
    sourceUrl: "/assets/textures/terrain/polyhaven-sparse-grass-roughness.webp",
    url: "/assets/textures/terrain/polyhaven-sparse-grass-roughness.ktx2"
  }
} satisfies Record<string, SurfaceTextureSpec>);

export function configureSurfaceTexture(
  texture: THREE.Texture,
  kind: SurfaceTextureKind
): THREE.Texture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = !(texture instanceof THREE.CompressedTexture);
  texture.anisotropy = 4;
  texture.colorSpace = kind === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Neutral 1px placeholders keep the standard shader compilable while local
 * runtime images decode. A missing image is reported loudly and leaves the
 * deterministic palette/procedural path active.
 */
export function createSurfaceFallbackTexture(kind: SurfaceTextureKind): THREE.DataTexture {
  const value = kind === "color" ? 188 : 220;
  const texture = new THREE.DataTexture(
    new Uint8Array([value, value, value, 255]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  configureSurfaceTexture(texture, kind);
  return texture;
}

export const degradedSurfaceResources = new Set<string>();

export function surfaceTextureDiagnostics(textures: Iterable<THREE.Texture>) {
  return [...textures].filter(texture => texture.name.endsWith(".ktx2")).map(texture => ({
    url: texture.name,
    compressed: texture instanceof THREE.CompressedTexture && Number(texture.format) !== THREE.RGBAFormat,
    format: texture.format,
    colorSpace: texture.colorSpace,
    mipLevels: texture.mipmaps.length,
    loadMs: typeof texture.userData.surfaceLoadMs === "number" ? texture.userData.surfaceLoadMs : null,
    mipBytes: texture instanceof THREE.CompressedTexture
      ? texture.mipmaps.reduce((sum, mip) => sum + mip.data.byteLength, 0) : null
  }));
}

export async function loadSurfaceTexture(
  spec: SurfaceTextureSpec,
  loader: SurfaceTextureLoader
): Promise<THREE.Texture | null> {
  try {
    const started = performance.now();
    const texture = await loader.loadAsync(spec.url);
    texture.userData.surfaceLoadMs = performance.now() - started;
    texture.name = spec.url;
    return configureSurfaceTexture(texture, spec.kind);
  } catch (error) {
    degradedSurfaceResources.add(spec.url);
    console.error(
      `[SurfaceTextureLoader] Failed to load ${spec.sourceName} ${spec.kind} map from ${spec.url}`,
      error
    );
    return null;
  }
}
