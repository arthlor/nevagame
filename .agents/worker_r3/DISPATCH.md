## 2026-08-30T10:35:53Z
Task Assignment for Milestone 3 (R3: UI Texture Atlas with 2D Edge Dilation & Lossless Packaging):
Working directory: /Users/anilkaraca/Desktop/Neva/.agents/worker_r3/

Implementation Scope:
1. Dependencies: Ensure `maxrects-packer` and `sharp` are in package.json devDependencies.
2. `tools/ui/extrudeAndPack.mjs`:
   - Standalone Node.js CLI tool & library to process UI sprite inputs.
   - 2D edge dilation (2px bleed/extrusion) on raw pixel buffers using `sharp`.
   - Bin packing using `maxrects-packer` (POT or optimal dimensions, multiple pages support).
   - Dual lossless atlas images: `public/assets/ui/atlas/ui-atlas.png` & `public/assets/ui/atlas/ui-atlas.webp`.
   - JSON & TypeScript manifests: `public/assets/ui/atlas/ui-atlas.json` & `src/ui/atlas/AtlasManifest.ts`.
   - Manifest contract: exact inner coordinates (innerX, innerY, innerWidth, innerHeight) and normalized UV bounds [u0, v0, u1, v1].
3. Integration with package.json scripts (`npm run ui:atlas` / `npm run ui:pack`).
4. Unit tests: `tests/unit/uiAtlas.test.ts`.
5. Verification: `npm run typecheck` (0 errors), `npm run test` (all pass).
