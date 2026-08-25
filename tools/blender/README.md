# Neva art toolchain

This is the short operational guide for routine asset work. `LLM/BLENDER.md`
owns task routing and gate policy. The catalog and palette remain the production
authorities; generators must not maintain parallel filename, parameter, or color
lists.

## Everyday workflow

Every catalog command requires `--asset`, `--family`, or explicit release
`--all`. A bare command fails instead of silently selecting all assets.

```bash
# Only when an image/study-guided referenceAuthoring brief changed
npm run art:brief -- --asset tree_oak_a

# Generate, validate, optimize, cache, and atomically publish the selected asset directly to the game
npm run art:generate -- --asset tree_oak_a

# Related assets may be batched
npm run art:generate -- --family vegetation
```

Successful publication prints a direct Art Yard link. Run `npm run dev`, open
that link if desired, then integrate the catalog ID through the existing runtime
loader/placement path. The human reviews the integrated result in the game.

Routine work does not run screenshots, static previews, determinism, strict
density, benchmarks, full builds, or broad test suites. Typecheck only when
runtime TypeScript changed.

## Shared-generator and release commands

```bash
# Shared family/helper change
npm run art:generate -- --family architecture --no-publish
npm run art:test-builders
npm run art:determinism -- --family architecture
npm run art:generate -- --family architecture

# Release or gold slice
npm run art:generate:strict -- --all
npm run art:validate -- --all
npm run art:benchmark
```

`art:benchmark:extended` remains an explicit release diagnostic. Agents do not
inspect generated images unless the human requests visual analysis.

## What generation preserves

`art:generate`:

1. validates the closed catalog, palette, generator parameters, reference brief,
   LOD, collision, and animation contracts;
2. resolves Blender and computes selected per-asset input hashes;
3. revalidates cache hits or generates cache misses headlessly;
4. validates the Blender scene and raw GLB;
5. applies glTF Transform dedupe/join/prune/weld plus Meshopt;
6. revalidates optimized GLB nodes, attributes, pivots, bounds, min/max budgets,
   materials, collision, LOD, animations, and Khronos conformance;
7. promotes selected GLBs and manifests in one rollback-capable transaction;
8. prints the selected asset's `/__neva_art_yard?asset=...` link;
9. retains only the three newest successful staging runs.

The mechanical contract requires `POSITION`, `NORMAL`, semantic `COLOR_0`, a
palette material, stable required nodes, and back-face-culled generated closed
geometry. Runtime static assets remain optimized GLB/glTF 2.0.

## Reference-guided authoring

An image/study-guided asset must keep its closed `referenceAuthoring` object in
the selected catalog entry. `art:brief` validates sources, hierarchy, feature and
parameter bindings, hidden-surface confidence, failure modes, and requested
views. Run it when the brief changes; do not read or print unrelated briefs.

Requested views are available through Art Yard/game diagnostics and do not
require static render files. `ready` means brief completeness, not visual
approval.

## Art Yard

Development route:

```text
http://localhost:3000/__neva_art_yard?asset=<catalog-id>
```

It uses the runtime catalog, `AssetLoader`, `VisualRenderConfig`,
`PaletteMaterials`, and `LightingRig`. Orbit, camera distance/LOD, wireframe,
bounds, collision, animation, lighting, weather, ground, and water controls are
diagnostics for the human. The route is not included in production builds.

## Cache, staging, and publication

- `generated/.cache/art/`: validated per-asset acceleration cache; retained.
- `generated/.staging/run-*`: raw/optimized run data; newest three retained.
- `generated/glb/`: last published optimized generated copies.
- `public/assets/models/`: runtime-published GLBs and parity manifest.
- `generated/reports/asset-manifest.json`: published generated truth.
- `generated/reports/asset_budget_report.json`: latest published quality report.

Partial publishes merge selected assets and preserve unselected manifest entries.
Only full-catalog publication may remove stale files owned by the previous full
manifest. Cache reuse never bypasses artifact validation.

## Blender resolution

The CLI resolves Blender through `BLENDER_BIN`, `blender` on `PATH`, then
`/Applications/Blender.app/Contents/MacOS/Blender`. Blender 5.2 LTS is the
supported baseline.

## Routine handoff

Report only selected asset IDs, runtime integration point, mechanical generation
status, TypeScript status when applicable, save impact, and:

```text
Awaiting human game review
```
