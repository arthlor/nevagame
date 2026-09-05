export interface SheetSelection {
  id: string;
  expectedIslands?: number;
  sprites: Array<{ file: string; index?: number }>;
}

export function resolveSpriteBoxes<T>(sheet: SheetSelection, boxes: T[]): T[];
export function cleanSpriteEdges(pixels: Uint8Array, options: {
  alphaFloor: number;
  alphaBelow: number;
  excessAboveRedAndBlue: number;
}): Buffer;

export function loadManifest(): {
  version: number;
  output: { size: number; coverage: number };
  families: Record<string, { export: string; doc: string }>;
  sheets: Array<SheetSelection & { family: string; source: string }>;
};
