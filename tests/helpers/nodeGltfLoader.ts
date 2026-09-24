import type { Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";

// GLTFLoader leaves a map unset when a texture resolves to null; its plugin
// typing only admits a Texture, so the skip is cast.
const skippedTexture = (): Promise<Texture> => Promise.resolve(null as unknown as Texture);

/**
 * Production GLTFLoader plus the Meshopt decoder, for Node tests. Node has no
 * image decoder, and texture-preserving imports such as the adapted player
 * embed their source texture, so texture loading is skipped: geometry, skins,
 * nodes, materials and clips still parse exactly as they do in the browser.
 * Await `MeshoptDecoder.ready` before parsing.
 */
export function createNodeGltfLoader(): GLTFLoader {
  return new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .register(() => ({ name: "neva_skip_textures", loadTexture: skippedTexture }));
}
