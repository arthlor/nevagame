import * as THREE from "three";

export type SurfaceTextureKind = "color" | "roughness";

export interface SurfaceTextureSpec {
  readonly kind: SurfaceTextureKind;
  readonly sourcePage: string;
  readonly sourceName: string;
  readonly url: string;
}

/**
 * Processed, low-frequency derivatives of the selected Poly Haven CC0 maps.
 * The source pages stay explicit here so the runtime asset provenance is not
 * lost when the maps are reduced for the game.
 */
export const POLYHAVEN_SURFACE_TEXTURES = Object.freeze({
  roadColor: {
    kind: "color",
    sourceName: "Grass Path 2",
    sourcePage: "https://polyhaven.com/a/grass_path_2",
    url: "/assets/textures/terrain/polyhaven-grass-path-2-color.webp"
  },
  roadRoughness: {
    kind: "roughness",
    sourceName: "Grass Path 2",
    sourcePage: "https://polyhaven.com/a/grass_path_2",
    url: "/assets/textures/terrain/polyhaven-grass-path-2-roughness.webp"
  },
  beachColor: {
    kind: "color",
    sourceName: "Coast Sand 01",
    sourcePage: "https://polyhaven.com/a/coast_sand_01",
    url: "/assets/textures/terrain/polyhaven-coast-sand-01-color.webp"
  },
  beachRoughness: {
    kind: "roughness",
    sourceName: "Coast Sand 01",
    sourcePage: "https://polyhaven.com/a/coast_sand_01",
    url: "/assets/textures/terrain/polyhaven-coast-sand-01-roughness.webp"
  },
  leafyGrassColor: {
    kind: "color",
    sourceName: "Leafy Grass",
    sourcePage: "https://polyhaven.com/a/leafy_grass",
    url: "/assets/textures/terrain/polyhaven-leafy-grass-color.webp"
  },
  leafyGrassRoughness: {
    kind: "roughness",
    sourceName: "Leafy Grass",
    sourcePage: "https://polyhaven.com/a/leafy_grass",
    url: "/assets/textures/terrain/polyhaven-leafy-grass-roughness.webp"
  },
  sparseGrassColor: {
    kind: "color",
    sourceName: "Sparse Grass",
    sourcePage: "https://polyhaven.com/a/sparse_grass",
    url: "/assets/textures/terrain/polyhaven-sparse-grass-color.webp"
  },
  sparseGrassRoughness: {
    kind: "roughness",
    sourceName: "Sparse Grass",
    sourcePage: "https://polyhaven.com/a/sparse_grass",
    url: "/assets/textures/terrain/polyhaven-sparse-grass-roughness.webp"
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
  texture.generateMipmaps = true;
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

export async function loadSurfaceTexture(
  spec: SurfaceTextureSpec,
  loader: Pick<THREE.TextureLoader, "loadAsync"> = new THREE.TextureLoader()
): Promise<THREE.Texture | null> {
  try {
    const texture = await loader.loadAsync(spec.url);
    return configureSurfaceTexture(texture, spec.kind);
  } catch (error) {
    console.error(
      `[SurfaceTextureLoader] Failed to load ${spec.sourceName} ${spec.kind} map from ${spec.url}`,
      error
    );
    return null;
  }
}
