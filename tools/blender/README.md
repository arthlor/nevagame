# Neva art toolchain

This is the short operational guide for routine asset work. `LLM/BLENDER.md`
owns task routing and gate policy. The catalog and palette remain the production
authorities; generators must not maintain parallel filename, parameter, or color
lists.

## Everyday workflow

The reference-led harbor habitat is authored by the registered `coastal.py` families. Selected catalog entries bind the supplied video frames under `art/references/harbor-coast/` to dimensions, palm lean/crown/leaf structure, fractured stone and timber construction. Regenerate through this CLI; use repeated `--asset ID` arguments when selecting several assets. The generator preserves semantic vertex color without a baked key-light direction, closed leaf ribbons, continuous trunk rings, sloping rock plates with interrupted ledges and worn fracture edges, LODs, pivots and catalog collision proxies. Rock LODs retain their outer profiles; the nearby mesh spends geometry on worn edges without introducing a central pyramid cap. Its exported `_NEVA_WIND` scalar survives Meshopt optimization and drives the same deformation in the visible and shadow materials. Harbor dock/market variants have independent catalog IDs so the shared Sunreach dock remains intact. The task-specific capture exception is in `LLM/BLENDER.md`; technical publication and human in-game review remain separate.

Folder dumps (`@LLM`, `@tools`) do not change task-class routing. Obey root `AGENTS.md`, `LLM/BLENDER.md`, this file, the selected catalog entry, owning generator, isolated sheet if present, and the relevant Art Bible section. “Generate assets” means catalog ID → registered family generator → measure sheet identity into `parameters` when a sheet exists → `art:brief` only if the brief changed → `npm run art:generate -- --asset` → integrate → Art Yard → `Awaiting human game review`. Do not run `tools/blender/generators/generate_all.py`. Do not start `threejs-game-director` for this prompt.

Every catalog command requires `--asset`, `--family`, or explicit release
`--all`. A bare command fails instead of silently selecting all assets.
`art:brief` is reference-guided only: it accepts selected assets/families whose
catalog entries contain `referenceAuthoring` and rejects `--all` (or a mixed
selection) before emitting a partial brief.

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

# Imported multi-material/export regression; --python-exit-code prevents false green failures
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python tools/blender/test_imported_vertex_color_export.py

# P0.75 visual-gold gate (existing published GLBs; no reauthoring)
npm run art:sync -- --all
npm run art:validate -- --all
npm run art:benchmark

# Technical-art certification or release
npm run art:generate:strict -- --all
npm run art:validate -- --all
npm run art:determinism -- --all
npm run art:benchmark
```

The visual-gold benchmark enforces no browser errors, ≤220 draw calls, and
≤900,000 visible triangles per scene. Its lower triangle target floor is
advisory. `art:generate:strict` and determinism retain their existing
semantics and remain separate technical-art/release gates. `art:benchmark:extended`
remains an explicit release diagnostic. Agents do not inspect generated images
unless the human requests visual analysis.

The benchmark uses the Vite DEV server. DEV layout-editor picking intentionally
keeps static prefabs unmerged and omits the baked static-shadow proxy, so its
draw/triangle measurements are diagnostic and not production-equivalent proof.
Do not relax `tools/blender/asset_budgets.json` to accommodate that path; record
the result as an open technical render gate until a certified measurement path
exists.

## What generation preserves

`art:generate`:

1. validates the closed catalog, palette, generator parameters, reference brief,
   LOD, collision, and animation contracts;
2. resolves Blender and computes selected per-asset input hashes;
3. revalidates cache hits or generates cache misses headlessly;
4. validates the Blender scene and raw GLB;
5. applies glTF Transform dedupe/join/prune/weld plus Meshopt for procedural
   families, or lossless compression-only with decoded parity for `imported_blend`;
6. revalidates optimized GLB nodes, attributes, pivots, bounds, min/max budgets,
   materials, collision, LOD, animations, and Khronos conformance;
7. promotes selected GLBs and manifests in one rollback-capable transaction;
8. prints the selected asset's `/__neva_art_yard?asset=...` link;
9. retains only the three newest successful staging runs.

The mechanical contract requires `POSITION`, `NORMAL`, semantic `COLOR_0`, a
palette material, stable required nodes, and back-face-culled generated closed
geometry. Runtime static 3D assets remain optimized GLB/glTF 2.0. Ground
supporting maps are a renderer presentation path (`ExternalSurfaceTextures` +
`VisualRenderConfig`), not catalog GLBs.

## Adapted external sources

Follow `LLM/BLENDER.md`'s adapted-source workflow. A provider download is an
offline input, not a shippable asset. The registered `imported_blend` generator
uses a verified repository-local `parameters.sourceBlend` and named
`parameters.sourceCollection`; the schema owns its required, build-time-only
`sourceProvenance`. Source-byte changes invalidate cached output and require an
updated verified adapted-source digest. Selected/full generation stays on that
registered importer, with no quantization or hierarchy-changing optimization.

To validate a selected catalog-conforming export without changing public assets:

```bash
node tools/blender/cli.mjs admit --asset <catalog-id> --source output/<adapted-export>.glb --no-publish
```

Admission requires an existing published identity, exactly one selector, and a
source outside runtime/published destinations. It stages and validates exact
source bytes, including the skin/clip/LOD and existing budget contracts. It
does not invoke Blender scene validation. Partial stages are mechanical
candidates: the stage viewer requires a complete catalog, so use the published
Art Yard link after selected publication for human game review.
Omitting `--no-publish` uses the existing selected atomic publication; do not
hand-edit manifests or refresh the full catalog for a selected derivative.

### Preparing a curated source offline

`LLM/BLENDER.md` owns adaptation modes and evidence limits. Use a fresh
background Blender process and a new `output/` candidate directory; these
helpers never publish or update the catalog. Read the selected helper for its
supported source scope; `--help` lists its CLI flags. Capture-based adapters use
this invocation shape:

```bash
blender --background --python-exit-code 1 --python tools/blender/<adapter>.py -- \
  --asset <catalog-id> --source-blend <capture.blend> \
  --source-collection <capture-collection> --output-dir output/<fresh-candidate>
```

Humanoids use a catalog-owned original instead of a Blender capture/donor:

```bash
blender --background --python-exit-code 1 --python tools/blender/adapt_imported_humanoid.py -- \
  --asset <catalog-id> --output-dir output/<fresh-candidate>
```

The selected `humanoidAuthoring` entry pins the original source and hash, uniform height, role changes and explicit source part/material mappings. Preserve source bones, anatomy, weights, normals, UVs and peaceful motion timing. Missing actions are authored on that same rig. The helper writes staged `.blend`, `.glb` and `.report.json` files and does not publish.

- `adapt_polypizza_static.py` reads the immutable original, exact node,
  transform and per-material policy from `staticAuthoring`:

```bash
blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/adapt_polypizza_static.py -- \
  --asset <catalog-id> --output-dir output/<fresh-candidate>
```

  The static adapter preserves LOD0 topology, UVs, split normals, smoothing and
  source-region material identities. It neither cleans the source surface nor
  replaces alpha leaf cards. Texture-preserving exports restore the immutable
  source sampler state after Blender serialization while leaving embedded image
  and geometry buffers unchanged. Solid emissive regions export their explicit
  palette token × region value and palette-owned strength.
- `adapt_polypizza_cow.py` reads the repository-owned immutable
  `art/imported/poly-pizza/sources/cow.blend` capture and its adjacent audit
  report by default, then bakes the reviewed peaceful source mapping into named
  catalog/NLA loops. It is not a general animal or combat-action importer.

```bash
blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/adapt_polypizza_cow.py -- \
  --output-dir output/<fresh-cow-candidate>
```

Decoded source preservation gate:

```bash
node tools/blender/compare_humanoid_contract.mjs --asset <catalog-id> \
  --candidate output/<fresh-candidate>/<catalog-id>.glb \
  --report output/<fresh-candidate>/<catalog-id>.fidelity.json
```

The verifier reads immutable originals and the explicit palette mapping from the catalog. It checks source bind anatomy, triangle-corner geometry, normals, UVs, weights, material regions and native performance timing/poses; it rejects double palette multiplication. Preparation reports own all-frame/both-LOD deformation evidence. Preserve and report any explicitly bounded source loop closure separately. Neither source fidelity nor finite transforms prove world-space contacts or visual approval.

Static imported candidates use their separate decoded gate:

```bash
node tools/blender/compare_static_source_contract.mjs --asset <catalog-id> \
  --candidate output/<fresh-candidate>/<catalog-id>.glb \
  --report output/<fresh-candidate>/<catalog-id>.fidelity.json
```

It verifies the declared uniform transform, exact LOD0 triangles, UVs, exported
normals, source material regions and either solid palette application or exact
source texture/alpha state. Catalog-declared accessory nodes are counted but do
not substitute for source triangles. Registered raw, optimized, cached,
admitted and published validation invokes this decoded contract automatically;
the command above writes the standalone review report.

After validation, hash the final durable prepared Blender library for catalog provenance, generate the selected imported assets without publication, check semantic determinism, then use the existing atomic publication path. Human review remains in the integrated game.

## Reference-guided authoring

An image/study-guided asset must keep its closed `referenceAuthoring` object in
the selected catalog entry. `art:brief` validates sources, hierarchy, feature and
parameter bindings, hidden-surface confidence, failure modes, and requested
views. Run it when the brief changes; do not read or print unrelated briefs.

`art:validate` validates the catalog schema, generator-parameter contracts,
LOD/animation/reference contracts, and published GLB metrics. It does not run
family generators or establish that a generator's authored geometry is
semantically correct beyond the exported artifact contract.

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
diagnostics for the human. Player animation review can pair the donkey,
rowboat, or skiff context atomically, includes that companion in bounds, layers
`reel` over selectable lower-body bases, and seeks the paired actions
deterministically. The route is not included in production builds.

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
