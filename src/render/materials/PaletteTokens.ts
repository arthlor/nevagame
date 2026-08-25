import palette from "../../../art/palettes/neva.palette.json" with { type: "json" };

export type PaletteToken = keyof typeof palette.tokens;
export type PaletteFamily = (typeof palette.tokens)[PaletteToken]["family"];

export const PALETTE_SPECS = palette.tokens;
export const PALETTE_HEX = Object.fromEntries(
  Object.entries(PALETTE_SPECS).map(([token, spec]) => [token, spec.hex])
) as Record<PaletteToken, string>;
