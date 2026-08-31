import { NodeIO, Document, Node } from "@gltf-transform/core";

export interface OptimizeConfig {
  weldTolerance?: number;
  quantizePosition?: number;
  quantizeNormal?: number;
  quantizeTexcoord?: number;
  quantizeColor?: number;
  meshoptLevel?: "medium" | "high" | "low";
}

export const DEFAULT_OPTIMIZE_CONFIG: Readonly<OptimizeConfig>;

export function ensureMeshoptReady(): Promise<[unknown, unknown]>;
export function createNodeIO(): NodeIO;
export function mayJoinStaticNode(
  node: Node | { getName?: () => string },
  spec?: {
    generator?: string;
    requiredNodes?: string[];
    lodLevels?: Array<unknown>;
  }
): boolean;

export function optimizeAsset(
  source: string | Uint8Array | Buffer | Document,
  destination: string | null,
  spec?: Record<string, unknown>,
  options?: OptimizeConfig
): Promise<string | Uint8Array>;

export function optimizeAndGenerateLods(
  sourceGlbPath: string,
  outputBaseDir: string,
  assetSpec?: {
    id?: string;
    file?: string;
    lodLevels?: Array<{
      node?: string;
      distanceMeters?: number;
      triangleRatioTarget?: number;
      triangleRatioMax?: number;
    }>;
  },
  options?: OptimizeConfig
): Promise<{
  lod0Path: string;
  generatedFiles: string[];
}>;
