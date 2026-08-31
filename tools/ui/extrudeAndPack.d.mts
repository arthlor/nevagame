export interface DilateSpriteResult {
  buffer: Buffer;
  rawBuffer: Buffer;
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  extrude: number;
}

export interface DilateOptions {
  dilateAlpha?: boolean;
}

export interface PackOptions {
  maxWidth?: number;
  maxHeight?: number;
  padding?: number;
  extrude?: number;
  smart?: boolean;
  pot?: boolean;
  allowRotation?: boolean;
  writeFiles?: boolean;
  tsManifestPath?: string;
  jsonManifestPath?: string;
}

export interface SpriteInput {
  id?: string;
  name?: string;
  file?: string;
  buffer?: Buffer;
  path?: string;
}

export interface PackResult {
  manifest: any;
  typeScriptManifest: string;
  images: Array<{
    binIndex: number;
    width: number;
    height: number;
    pngBuffer: Buffer;
    webpBuffer: Buffer;
    pagePngName: string;
    pageWebpName: string;
  }>;
  bins: any[];
}

export function dilateAlphaRgb(rawBuffer: Buffer, width: number, height: number, radius?: number): Buffer;

export function dilateSpriteEdges(
  input: Buffer | Uint8Array | string,
  extrude?: number,
  options?: DilateOptions
): Promise<DilateSpriteResult>;

export function packLosslessUiAtlas(
  sprites: SpriteInput[],
  outputBase: string,
  atlasName?: string,
  options?: PackOptions
): Promise<PackResult>;

export function generateTypeScriptAtlasManifest(manifest: any): string;

export function loadAtlasSprites(): SpriteInput[];
