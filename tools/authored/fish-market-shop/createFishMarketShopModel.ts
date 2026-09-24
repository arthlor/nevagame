import * as THREE from "three";
import { buildFishMarketParts, type PartContext } from "./parts";

export type ProceduralModelOptions = {
  castShadow?: boolean;
  receiveShadow?: boolean;
};

/**
 * Coastal fish-market shop, code-authored from the approved reconstruction.
 * Part geometry lives in ./parts, flat baked colors in ./materials, sculpted
 * fish in ./fish. The export pipeline re-skins every mesh onto shared palette
 * tokens, so this factory carries geometry, placement, names and colors only.
 */
export function createFishMarketShopModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "FishMarketShop";
  const ctx: PartContext = { root, nodes: new Map<string, THREE.Group>(), options };
  buildFishMarketParts(ctx);
  return root;
}
