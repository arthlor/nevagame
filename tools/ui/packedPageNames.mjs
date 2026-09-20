/**
 * Filenames owned by `tools/ui/extrudeAndPack.mjs` in the runtime atlas
 * directory. Shared with the Vite production filter so both agree on what is a
 * packed page: content-hashed WebP runtime pages, lossless PNG diagnostics, and
 * the legacy unhashed copies older builds left behind.
 */
export const PACKED_PAGE_PATTERN = /^ui-atlas(?:_\d+(?:\.[0-9a-f]{8})?)?\.(?:png|webp)$/;

export function isPackedPageName(filename) {
  return PACKED_PAGE_PATTERN.test(filename);
}
