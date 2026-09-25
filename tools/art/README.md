# Neva art toolchain

The catalog art CLI (`cli.mjs`) and its Node modules. Root `AGENTS.md` owns
task routing, `LLM/ASSET_PRODUCTION.md` owns production operations, and `03` §4
owns proportional verification. `tools/authored/README.md` owns how authored
generators are written and frozen families ported. The catalog and palette
remain the production authorities; nothing here keeps a parallel filename,
parameter or colour list. Nothing here invokes Blender or Python.

## Producers

Every catalog asset has exactly one producer, decided by its `generator`
(`npm run art:list -- --asset <id>` prints it):

| Producer | `generator` | Built by | Source of truth |
|---|---|---|---|
| authored | a name in `tools/authored/generators/contracts.json` | `tools/authored/pipeline/producer.mjs` | the TypeScript generator + catalog parameters |
| authored GLB | `authored_glb` | `produceAuthoredGlb` in `cli.mjs` + `glb.mjs` | the committed GLB at `parameters.sourceGlb` |
| frozen | a name in `legacy-generators.json` | nothing (validated only) | the published GLB |

## Commands

Every command requires `--asset ID` (repeatable), `--family NAME`, or an
explicit release `--all`. A bare command fails instead of selecting the whole
catalog.

```bash
npm run art:generate -- --asset prop_water_well_a     # build, validate, optimise, publish
npm run art:generate -- --family prop --no-publish    # stage only; public assets unchanged
npm run art:determinism -- --family prop              # build twice, compare semantic hashes
npm run art:validate -- --all                         # revalidate every published GLB (frozen included)
npm run art:sync -- --all                             # revalidate and refresh manifest metadata
npm run art:brief -- --asset prop_water_well_a        # print a referenceAuthoring brief
npm run art:list -- --family character                # id, family, producer, file
npm run art:generate:strict -- --all                  # release: reject below-target density
npm run art:test                                      # surface-contract checker tests
```

`--no-cache` (alias `--force`) rebuilds cache hits. Naming a frozen asset in
`generate` or `determinism` fails with the porting instruction; a family or
`--all` selection skips frozen members and reports how many.

## What generation does

1. Validates the closed catalog (Ajv 2020 strict), palette, generator
   parameters, reference briefs, LOD, collision, animation contracts and
   source provenance.
2. Computes each selected asset's input hash (catalog entry, palette tokens,
   producer version, toolchain files, and for an authored GLB its source bytes)
   and revalidates cache hits from `generated/.cache/art/`.
3. Builds cache misses into a fresh `generated/.staging/run-*`: authored
   generators through their semantic art contract, authored GLBs through
   normalization and admission (`LLM/ASSET_PRODUCTION.md` §3.2).
4. Validates each raw GLB with the Khronos validator and the catalog contract.
5. Packages: glTF-Transform dedupe/join/prune/weld/quantize + Meshopt
   (`optimize.mjs`) for generator output and static authored GLBs; lossless
   Meshopt with decoded parity for skinned or animated authored GLBs; source
   bytes for authored GLBs that already carry Meshopt.
6. Revalidates the packaged GLB: nodes, attributes, pivots, bounds, min/max
   budgets, materials, textures, collision, LOD, animations, the decoded
   surface contract (`surface_contract.mjs`) and Khronos conformance.
7. Promotes the selected GLBs and manifests to `generated/glb/` and
   `public/assets/models/` in one rollback-capable transaction, merging into
   the tracked public manifest, and prints the Art Yard link.
8. Retains only the three newest staging runs.

Procedural output (authored and frozen) carries `POSITION`, `NORMAL`,
semantic `COLOR_0` and a palette material on every rendered primitive. An
authored GLB may instead keep source textures (`TEXCOORD_0`, WebP within
`textureMaxSize`). Runtime static 3D assets remain optimized GLB/glTF 2.0.
Ground supporting maps are a renderer presentation path
(`ExternalSurfaceTextures` + `VisualRenderConfig`), not catalog GLBs.

## Files

```text
cli.mjs                    the CLI: catalog validation, producers, validation, publication
*.d.mts                    typings for tests and tools that import these modules
cache.mjs                  input/toolchain hashing and the per-asset cache
glb.mjs                    byte-level GLB parse/encode, bounds repair, texture cap (authored GLBs)
optimize.mjs               glTF-Transform/Meshopt packaging
surface_contract.mjs       decoded skin, deformation and loop-seam checks (+ .test.mjs)
codegen.mjs                typed catalog projection (src/render/assets/AssetCatalog.generated.ts)
extract_humanoid_binding.mjs   re-extract catalog humanoidRig legs/arms from a published GLB
legacy-generators.json     parameter contracts of the frozen (retired Blender) families
asset_budgets.json         scene profiles and texture policy
references/                isolated studio sheets and the reference README
```

## Adding a provider GLB

For an explicitly requested Tripo (or other licensed provider) model:

1. Commit the download unchanged under `art/imported/<provider>/sources/`.
2. Add one catalog entry with `generator: "authored_glb"`,
   `parameters: { "sourceGlb": "art/imported/<provider>/sources/<file>.glb", "textureMaxSize": 1024 }`,
   the measured dimensions and pivot, required nodes, palette (tokens for any
   untextured parts), budget and, for a provider-derived model,
   `sourceProvenance`.
3. `npm run art:generate -- --asset <id>`; the producer repairs provider
   bounds and extensions and caps textures. Fix a dimension or pivot failure
   in the catalog entry or the source, never by editing the published GLB.
4. Integrate the catalog ID through `AssetLoader`/`WorldScene` and review it in
   the Art Yard and the game.

## Cache, staging, and publication

- `generated/.cache/art/`: validated per-asset acceleration cache; retained.
- `generated/.staging/run-*`: raw/optimized run data; newest three retained.
- `generated/glb/`: last published optimized copies.
- `public/assets/models/`: runtime-published GLBs and the tracked manifest.
- `generated/reports/asset-manifest.json`: mirror of the published manifest.
- `generated/reports/asset_budget_report.json`: latest published quality report.

Partial publishes merge selected assets and preserve unselected manifest
entries. Only full-catalog publication may remove stale files owned by the
previous full manifest. Cache reuse never bypasses artifact validation.

## Routine handoff

Report selected asset IDs, runtime integration point, mechanical generation
status, focused inspection evidence or access gap, TypeScript status when
applicable, save impact, `Docs updated:`, and:

```text
Awaiting human game review
```
