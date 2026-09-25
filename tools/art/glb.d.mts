/* eslint-disable @typescript-eslint/no-explicit-any */
export type GltfJson = Record<string, any>;

export interface GlbParts {
  json: GltfJson;
  bin: Buffer;
}

export interface RepairedBound {
  pointer: string;
  declared: number;
  actual: number;
}

export interface RemovedMaterialExtension {
  material: string | null;
  extension: string;
}

export interface TextureCapReport {
  image: number;
  name: string | null;
  resampled: boolean;
  source: { mimeType: string | null; width: number; height: number; bytes: number };
  output?: { mimeType: string; width: number; height: number; bytes: number };
}

export interface AuthoredGlbReport {
  preservedSourceBytes: boolean;
  repairedBounds: RepairedBound[];
  removedMaterialExtensions: RemovedMaterialExtension[];
  textures: TextureCapReport[];
}

export const GLB_MAGIC: number;
export const CHUNK_JSON: number;
export const CHUNK_BIN: number;
export const PROVIDER_MATERIAL_EXTENSIONS: readonly string[];
export const TEXTURE_SIZES: readonly number[];
export const TEXTURE_WEBP_OPTIONS: Readonly<Record<string, number | boolean>>;

export function parseGlb(bytes: Uint8Array | ArrayBuffer): GlbParts;
export function encodeGlb(json: GltfJson, bin?: Uint8Array | null): Buffer;
export function assertSelfContained(json: GltfJson, label?: string): void;
export function accessorRows(json: GltfJson, bin: Buffer, accessor: GltfJson): Promise<number[][] | null>;
export function repairAccessorBounds(json: GltfJson, bin: Buffer): Promise<RepairedBound[]>;
export function normalizeMaterialExtensions(json: GltfJson): RemovedMaterialExtension[];
export function repackEmbeddedBuffer(json: GltfJson, bin: Buffer, replacements: Map<number, Uint8Array>): Buffer;
export function capEmbeddedTextures(
  json: GltfJson,
  bin: Buffer,
  maxSize: number,
  sharp: unknown
): Promise<{ replacements: Map<number, Uint8Array>; report: TextureCapReport[] }>;
export function largestEmbeddedImage(json: GltfJson, bin: Buffer, sharp: unknown): Promise<number>;
export function normalizeAuthoredGlb(
  sourceBytes: Uint8Array | ArrayBuffer,
  options: { textureMaxSize: number; sharp: unknown; label?: string }
): Promise<{ bytes: Buffer; report: AuthoredGlbReport }>;
