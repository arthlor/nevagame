# ASSET_PRODUCTION.md
## Neva — Lean Asset Production Rules for LLM Agents

> **Role:** Operational authority for catalog-driven asset production, GLB validation, publication, Art Yard handoff, and runtime integration.
>
> **Producers:** Every catalog asset has exactly one producer, decided by its `generator`, and the art CLI (`tools/art/cli.mjs`, Node only) sends both build producers through the same validation, optimisation, cache, publication and determinism gates:
>
> - **Authored Three.js generators** (`tools/authored/`, see its README) are the main asset generation system: TypeScript factories on the shared kit, registered in `tools/authored/generators/registry.ts` with a parameter contract in `contracts.json`.
> - **Authored GLBs** (`generator: "authored_glb"`) publish a committed source GLB named by `parameters.sourceGlb`: a Tripo generation, another provider download, a photo-reconstructed building exported by `tools/authored/export.mjs`, or an adapted derivative.
> - **Frozen legacy assets** belong to families whose Blender generators were retired (`tools/art/legacy-generators.json`). Their published GLB is the record: `art:validate` and `art:sync` keep checking it, but nothing rebuilds it. To change one, port its family to an authored generator or replace the asset with an `authored_glb` source.
>
> There is no Blender or Python step in production. `art:list` prints each selected asset's producer.
>
> **Inspection and completion:** Agents generate, integrate and inspect affected assets in the Art Yard and actual game, correcting observed defects within scope. Focused screenshots, motion checks and diagnostics answer task-specific questions. Routine work completes with agent evidence. Human visual review is required only for release or when explicitly requested; claim it only when actually given.

---

# 0. Task-Class Read Order

Root `AGENTS.md` owns the task/read table and conflict procedure. Use its
asset, shared-helper, renderer, gameplay/persistence or release route as
appropriate. This file owns the production sequence after routing, not a
second hierarchy. Read selected catalog entries and their direct generator
helpers in full; do not dump the full catalog for one asset.

---

# 1. Daily Asset Workflow

Folder dumps (`@LLM`, `@tools`) do not change this routing. First files to **obey**: root `AGENTS.md`, this file, `tools/authored/README.md`, the selected catalog entry, the owning generator (or committed source GLB), and any references selected by the current task. Other attached files are for conflict resolution only. Leave `02` unread for generate-asset prompts even if `@LLM` attached them.

**Generate assets** in this repo always means: resolve or add catalog ID(s) → registered authored generator (port a frozen family before changing it) → update catalog parameters and any task-selected brief → `npm run art:brief -- --asset` only if a retained brief changed → `npm run art:generate -- --asset` → integrate → focused Art Yard/game inspection and scoped corrections → Art Yard link and completion evidence. The upstream graphics skills do not define asset generation. Provider APIs (Tripo/Gemini/ElevenLabs) still need an explicit human request. If the named subject is missing from the catalog, add one catalog entry and extend (or port and extend) the owning family generator; do not publish a one-off GLB. A GLB the human supplies (for example a Tripo generation) enters only as a committed `authored_glb` source with its own catalog entry (§3.2), never by copying it into `public/`. Ground supporting maps are not generate-asset work: do not add catalog IDs for them or run `art:generate`.

References are optional task inputs. The agent may choose, revise or remove a recorded brief and may use images for the aspects relevant to the task. Existing files do not impose permanent silhouette, palette, construction, camera or composition locks. Catalog IDs and runtime interfaces remain authoritative if an image index drifts. Inspect form, motion and gameplay usability as needed; use the agent's design judgment rather than a prescribed sculpting order.

Codex skill route for this prompt: use `.agents/skills/threejs-procedural-geometry/SKILL.md` as technique guidance, then consult its `references/geometry-craft-workflow.md` and `references/geometry-quality-gates.md` only when relevant. For a broad visual pass, use `.agents/skills/threejs-skill-router/SKILL.md` and load the smallest relevant specialists. The catalog and owning generator decide production interfaces; current task references guide appearance only when selected; implement in the registered authored generator and `tools/authored/kit/`. When the asset is frozen, port its family first (preserving runtime contracts while revising appearance as appropriate; `tools/authored/README.md` owns the porting steps). This pack has no provider-generation or release agent; provider calls need explicit human authorization, and release checks follow `03`.

The everyday route is:

```text
selected catalog entry
→ optional task-selected reference brief
→ owning registered generator, or committed authored GLB source
→ selected generate + validation + optimization + atomic publish
→ automatic Art Yard entry
→ runtime/game integration
→ focused Art Yard/game inspection and scoped corrections
→ scoped completion report
```

Commands always require an explicit selector. A bare generation command must fail rather than regenerate the full catalog.
`art:brief` is reference-guided only: it accepts selected assets/families whose
catalog entries contain `referenceAuthoring` and rejects `--all` (or a mixed
selection) before emitting a partial brief. A selection that names a frozen
asset explicitly fails `generate` and `determinism`; a family or `--all`
selection skips frozen members and says how many it skipped.

```bash
# Only when the selected referenceAuthoring brief changed
npm run art:brief -- --asset prop_water_well_a

# Normal selected generation and publication
npm run art:generate -- --asset prop_water_well_a

# Related assets may be batched by family
npm run art:generate -- --family prop

# Which producer owns each selected asset
npm run art:list -- --family character
```

After publication, the CLI prints a direct development link such as:

```text
http://localhost:3000/__neva_art_yard?asset=prop_water_well_a
```

Integrate the asset and inspect the changed appearance or motion through the existing Art Yard/game controls, including its gameplay read distance. Correct observed defects within scope. If the runtime cannot be accessed, report that inspection gap precisely and complete independent mechanical work. Complete the scoped handoff after its applicable checks and inspection. Record any access gap; add human review only when the current task or release requires it.

## Daily gates

Keep:

- closed catalog/schema validation;
- selected reference-authoring validation when present;
- palette and generator-parameter validation;
- deterministic catalog seed and stable ID/name contracts;
- the authored producer's semantic runtime contract (`tools/authored/README.md`), or the authored-GLB producer's admission checks (§3.2);
- raw Khronos GLB validation;
- glTF Transform dedupe/join/prune/weld + Meshopt (or the authored-GLB packaging mode, §3.2);
- optimized Khronos and semantic revalidation;
- dimensions, bounds, pivot, required nodes, collision, LOD, animation, material/texture contracts and hard triangle maximums; minimums, targets and lower LOD ratios remain advisory;
- validated cache reuse;
- rollback-capable atomic publication and generated/public hash parity;
- runtime integration and focused inspection of changed appearance or motion; TypeScript check only when runtime TypeScript changed.

The following are not routine requirements; use them only when the task or an unresolved concern warrants them:

- generated preview packages;
- determinism double-generation;
- gameplay benchmarks, full capture sets, full builds or broad test suites.

Do not use numeric style scoring, reference similarity, draft brief status, triangle floors/targets or lower LOD ratios as production failures. `--strict` is a compatibility alias with the same enforced mechanical contracts. Human visual review is required only for release or when explicitly requested.

---

# 2. Shared Generator and Release Gates

## Shared kit or pipeline change

1. Identify every affected catalog asset (every consumer of the changed kit module, or every asset when the CLI, `glb.mjs`, `optimize.mjs` or `surface_contract.mjs` changed).
2. No-publish generate the affected family or explicit asset union.
3. Run the authored-kit and pipeline tests when shared construction or packaging changed.
4. Run semantic determinism for the affected family only.
5. Publish the affected family once mechanical checks pass.

```bash
npm run art:generate -- --family prop --no-publish
npx vitest run tests/unit/authoredKit.test.ts tests/unit/authoredPipeline.test.ts tests/unit/authoredGlb.test.ts
npm run art:test
npm run art:determinism -- --family prop
npm run art:generate -- --family prop
```

## Renderer/catalog integration and release

P0.75 checks technical integration through representative affected assets and scenes selected for the task; there is no mandatory scene order or human taste approval before further work. Validate published catalog/manifest compatibility and investigate runtime errors and hard budget failures. Existing visual baseline images are historical comparison evidence, not current art authorities.

```bash
# Published compatibility (frozen assets included)
npm run art:validate -- --all

# Diagnostic DEV render evidence; production profiling is a separate lane
npm run art:benchmark
```

Shared or release work uses affected-scope generation and semantic determinism when required by §2 and `03` §4. An authorized release may select `--all`; frozen assets are checked by validation and never regenerated. `art:generate:strict` remains a compatibility alias and adds no target-density or art-certification requirement. Do not pad geometry to satisfy advisory counts.

Generation/publication, published validation, determinism, agent inspection, production performance and human release review prove different things. `npm run test:budget` and, for world changes, `npm run world:acceptance` own the production lanes in `03` §4/§23. DEV measurements remain diagnostic; active F2 layout editing additionally restores unmerged prefabs. Preserve failures and their input scope instead of weakening hard budgets to get a pass.

Inspect affected release views and investigate visible defects within the authorized scope. A screenshot does not establish performance or a human decision.

# 3. Single Source and Runtime Contract

- `assets/specs/asset-catalog.json` owns asset IDs, files, family/generator, seed, dimensions, palette, budgets, pivot, collision, instancing, LOD, required nodes, read distance, parameters, optional reference authoring, and character contracts.
- `asset-catalog.schema.json` owns the accepted shape. Do not add parallel YAML, filename lists, per-family specs, or alternate exporters.
- `art/palettes/neva.palette.json` owns the shared palette helper tokens and material properties; agents may revise or extend this central owner. Imported source materials need not use it.
- `tools/art/asset_budgets.json` owns scene and texture envelopes.
- `tools/authored/generators/registry.ts` is the only generator dispatch table, `contracts.json` its parameter contracts, and `tools/art/legacy-generators.json` the recorded parameter contracts of the frozen families. A generator name belongs to exactly one of them; the CLI refuses a dual registration.
- Runtime static 3D assets are optimized GLB/glTF 2.0 only. Never load `.blend`, `.fbx`, or `.obj` in the game, and never load a GLB outside the catalog: every runtime model, including the Tripo cast, goes through `AssetLoader` by catalog ID. Ground supporting maps are the documented non-GLB exception: retained local raster derivatives and compressed KTX2 runtime maps under `public/assets/textures/terrain/`, loaded only through `ExternalSurfaceTextures`, never through `art:generate` or a catalog ID. `tools/art/compressSupportingMaps.ts` stages conversions from that owner's source URLs; inspect the report and affected game surfaces before admitting the derivatives. This path does not alter authored GLB sources or their lossless packaging/parity contract.
- glTF space is metres, +Y up, front +Z; preserve stable node names and deliberate pivots. Shared palette materials and linear `COLOR_0` are available defaults, not universal appearance requirements. Authored GLBs and frozen imported sources may retain native PBR materials and optional vertex colors; textures still need valid UVs and declared caps.
- Simulation owns gameplay truth. Catalog metadata, scene nodes, collision debug meshes, animations, and Three.js objects remain presentation/runtime data.

Same catalog seed + parameters + generator code must reproduce the same semantic asset; an authored GLB reproduces from the same source bytes and `textureMaxSize`. Use seeded variation; preserve deterministic generation rather than unseeded random output. Agents may change palette/material design through the central owners.

`art:validate` checks the catalog schema, generator-parameter contracts,
LOD/animation/reference contracts, source provenance, and published GLB
metrics for every selected asset, frozen ones included. It does not run family
generators or prove authored geometry semantics beyond the exported artifact
contract.

## 3.1 Procedural skinned creatures

The existing procedural fauna/fish generators bind their LODs to authored armatures. Construction technique and appearance may change while preserving catalog nodes, skin/deformation and motion contracts. The authored kit (`tools/authored/kit/rig.ts`,
`clips.ts`, `lod.ts`) owns construction; `tools/authored/README.md` owns its
rules.

- **Weighting.** Weight each authored part only to the bones that drive it.
  Nearest-bone weighting across a whole surface lets a limb bone that passes
  through the body capture the flank. Weights are solved deterministically in
  code.
- **Node contract.** Every pivot node named in `requiredNodes` stays at its
  historic location, because `WorldScene` resolves them by name.
  Gameplay-facing sockets and grips stay on object-animated nodes. A fish's
  head bone is never keyed, so the mouth stays on `<id>_mouth_hook`, which the
  fishing line follows.
- **Clips.** Each catalog clip is exactly one glTF animation with the catalog
  name and duration. Clips the runtime plays together, such as the gull's
  `flap` and `glide`, must target disjoint transforms.
- **Validation.** Khronos `NODE_SKINNED_MESH_NON_ROOT` is accepted only when
  `validateGlb` proves every ancestor of every skinned mesh is an identity
  transform. `AssetLoader` gives any skinned asset the conservative culling
  envelope, and `tests/unit/characterCullingBounds.test.ts` holds every exported
  fauna and fish pose inside it. `surface_contract.mjs` checks every decoded
  primitive's skin weights, deformation and loop endpoints on all LODs for
  `surfaceAuthoring` assets and animated authored GLBs (`npm run art:test`
  covers the checker itself).

## 3.2 Authored GLB sources

Use `generator: "authored_glb"` for a model whose authored form is a GLB
rather than generator code: an explicitly requested provider generation
(Tripo), a CC0/CC-BY provider model, a photo-reconstructed building exported
by `tools/authored/export.mjs`, or a retained adapted derivative. Its
`parameters` are exactly:

- `sourceGlb` — a repository-relative GLB under `art/` (`art/imported/<provider>/…`
  or `art/authored/<model>/export/…`). The CLI rejects sources outside the
  repository or inside `public/`, `generated/` or other published trees.
- `textureMaxSize` — `256`, `512`, `1024` or `2048`: the largest embedded
  texture edge the published file may carry.

The catalog entry carries the same identity, dimensions, pivot, palette,
budget, required nodes, collision, LOD and animation contracts as any other
asset. Commit the source unchanged; the producer, not a hand edit, normalizes
it:

1. **Normalize** (`tools/art/glb.mjs`, byte-level on the GLB's own JSON and
   binary chunk, so node order, names, skins, clips and extras stay as
   authored): recompute declared accessor `min`/`max` from the data (Tripo
   rounds them, which Khronos rejects); retain source-native PBR materials and
   supported glTF material extensions; resample embedded textures
   larger than `textureMaxSize` and re-encode them as WebP
   (`EXT_texture_webp`), leaving textures within the cap byte-identical.
   Geometry bytes are never rewritten here, and a source that needs nothing
   is published from its own bytes.
2. **Admit**: exactly one node per required name, every mesh under the
   catalog root, rest bounds within 0.25–1.35× the catalog dimensions on each
   axis, and for a `ground_center` pivot a lowest point no deeper than a tenth
   of the height (a seated foundation) and no higher than a twentieth (a
   removed ground sheet), each with a small absolute floor.
3. **Package** by what the source is. A skinned or animated source gets
   lossless Meshopt (no quantize, reorder, join, weld or skin
   reconstruction), and its animation keyframe accessors share buffer views
   by element size instead of carrying one view each, because per-view JSON
   and Meshopt framing outweighed a character's geometry. A source already
   carrying `EXT_meshopt_compression` keeps its geometry bytes, unless it is
   animated and losslessly compressed (no `KHR_mesh_quantization`, no Meshopt
   filter): then `tools/art/decompress_glb.mjs` decodes it and it is repacked
   the same way. A static source gets the full
   dedupe/prune/weld/quantize/Meshopt optimisation. Every lossless package
   must decode to the same accessors, images, nodes, skins and clips as the
   normalized source, compared by a semantic hash that ignores how buffer
   views are grouped; a mismatch fails the publish.
4. **Validate** like every asset, with the authored-GLB material profile:
   textured primitives need valid `TEXCOORD_0`, and images fit `textureMaxSize`.
   Untextured source primitives may retain native PBR materials without
   `COLOR_0` or palette-token names. If vertex colors are present, validate
   their data; if a palette treatment is selected, validate its declared
   references. An empty palette is valid for native source materials. The
   source owns normals, material factors, supported material extensions and
   double-sided decisions. `surfaceAuthoring` is rejected for authored GLBs:
   the source owns its surface data.

The cache keys an authored GLB on its source bytes, so replacing the source
at the same path rebuilds it. Source authoring owns valid bind transforms,
normalized weights, target-compatible motion and LOD deformation; packaging
cannot repair them.

**Provenance.** A provider-derived asset declares `sourceProvenance`
(provider/model identity, author, source and licence URLs, supported licence,
attribution, and `sourceFile` + `sourceSha256`). The CLI verifies the licence
URL, the provider's identity format and the `sourceFile` digest; update the
digest only after verifying that source. Tripo provenance uses provider
`tripo`, licence `Tripo-Terms`, `https://www.tripo3d.ai/` and the generation
UUID as `modelId`; rights follow the generating account's Tripo plan. These
authoring fields stay out of the runtime catalog projection; retain any
required attribution in the game's credits before shipping a CC-BY
derivative.

**Characters.** A character authored GLB with catalog `animationClips` must
also declare `rigNode` and `socketNodes`, and its clips pass the same
per-clip duration and node checks. Catalog `humanoidRig` owns semantic source
names, bind-space endpoints, sole/palm frames and bend directions for the
contracted humanoids; after a rig changes, re-extract its legs/arms with
`node tools/art/extract_humanoid_binding.mjs` from the published GLB. A
static provider figure (the Tripo townsfolk) declares no clips; the runtime
scales it by the factor `WorldScene` owns.

**Retained adapted derivatives.** The adapted player, Quaternius/Poly Pizza
NPCs, cow, donkey, draft horse, galleon and Tripo cottage were prepared by
retired Blender adapters. Their exported derivatives are the committed
sources under `art/imported/<provider>/adapted/`; the adapter `.blend`
libraries stay beside them as provenance (`sourceFile`), and the untouched
provider downloads under `sources/`. The Tripo B-cast NPCs (`char_npc_*_b`)
left the frozen `imported_blend` family the same way: their last published
records are committed unchanged under `art/imported/tripo/adapted/`, and
`textureMaxSize` resamples their 4096² skin textures, while `skinnedAuthoring`
still names the raw Tripo capture that their native-performance contract
checks. Changing one of these assets means producing a new derivative GLB
with an appropriate authoring tool within the task scope, committing it at the same path, and
running the selected `art:generate`.

**Photo-reconstructed buildings.** `npm run art:authored` rebuilds these
buildings' committed exports in headless Chromium. Their factories paint
canvas textures; the existing default adapter bakes colors into palette
`COLOR_0`, while `--raw` skips that treatment. Material/export defaults may
evolve centrally without imposing an artistic recipe. Publication remains
through `art:generate`; `--no-publish` stops at the committed source. The
exporter never copies a GLB into `public/` itself.

---

# 4. Optional Reference Briefs

`referenceAuthoring` is optional, revisable metadata for a selected asset. The current task decides whether to use supplied images, studies, turnarounds or reconstruction evidence and which aspects matter. Existing briefs are not permanent appearance locks.

- Keep a useful brief in the selected catalog entry rather than a second spec tree. Revise or remove it when the task's direction changes.
- When present, validate its schema, parameter bindings and referenced `repo://` files; missing declared files remain a data-integrity error. A structurally valid `draft` brief permits generation and does not require human approval.
- Run `art:brief` only when a retained selected brief changes; read or emit only that asset's brief.
- Choose inspection views that resolve the task's form, hidden-surface or motion questions. A historical view list or image does not impose full capture coverage, similarity scoring or a prescribed construction sequence.
- A brief on a frozen asset may inform a port; replace its recorded generator bindings with the registered authored family's contract when porting.
- References cannot change gameplay truth, runtime node/rig/socket contracts or the single catalog publication path. Feedback may identify `asset ID + observed problem + desired change`; routine work completes autonomously after relevant verification.

# 5. Art Yard and Runtime Integration

`/__neva_art_yard` and `/art-yard` provide the asset-review surface. It uses the canonical runtime catalog, `AssetLoader`, `VisualRenderConfig`, `PaletteMaterials`, and `LightingRig`, served via Vite in development and emitted as a static production route with pre-rendered catalog metrics for live deployment.

- A successful selected publish makes the asset available automatically.
- `?asset=<catalog-id>` opens the selected asset directly; `&live=1` builds an authored generator in the page instead of loading the published GLB.
- In DEV, `?asset=<catalog-id>&artStage=<run-id>` reviews the selected run's optimized GLB through the canonical loader. A run may contain only selected assets: the roster contains those reported candidates, and partial runs omit multi-asset showcases. Every reported candidate must exist and resolve to the catalog. Missing/invalid staged data or an asset absent from that run displays an error; it must not silently load published models. Production Art Yard supports the published set only.
- Character animation review automatically attaches the matching fishing, farming, carry, tailoring, toolmaking and equipment-inspection props through the same socket rules as the world. Runtime-context scrubbing also seeks the reel crank, so a paused hand and handle share the same phase. Static provider figures are reviewed as static models.
- Orbit, distance/LOD, eye POV (1.6m), shading (lit, unlit flat albedo, wire overlay, pure wire, vertex colors, normals, LOD0, LOD1), physical dimensions/clearance/footprint, authoring sockets, skeleton rig, origin axes tripod, bounds, collision, animation scrubbing/frame-stepping, lighting, weather, ground, and water controls support focused agent inspection and human review.
- Player context clips are previewed atomically with the required donkey, rowboat, or skiff companion and companion-inclusive bounds. Mounted gaits synchronize rider and animal phases; boarding/docking use the matching craft variant; `reel` layers over selectable on-foot, rowboat, or skiff bases. Timeline scrubbing seeks each action deterministically rather than changing mixer-global time.
- Inspect the integrated result in the normal game. Integrate the catalog ID through the existing loader/placement/batching path; do not create a direct loader or local asset registry.
- Compatible repeated static assets use the existing batching/instancing path. Do not fold skinned, morph-target, or dynamic descendants into static batching. Production static LOD pieces use the existing per-instance level tracking and catalog switch distances; do not flatten them without preserving level selection. Normal DEV and production share batching; active F2 restores prefabs for layout-editor picking.
- For a story-relevant asset or zone, the integrated review also checks that its practical role and relationship to the current quest beat read at gameplay distance. This is visual/environmental evidence only; quest progression remains owned by simulation/content code.

Mechanical success permits the agent to say `generated`, `validated`, `published`, and `integrated` only when those gates passed. Agent inspection supports scoped design completion. Say `human approved` only when that decision was given; `production-ready` additionally requires the applicable release evidence.

---

# 6. Cache, Staging, Reports, and Retention

- `generated/.cache/art/` is disposable acceleration state keyed by asset/toolchain inputs (authored sources for generators, source bytes for authored GLBs). Keep it enabled and never publish from it without revalidation.
- `generated/.staging/run-*` contains run-local raw/optimized candidates, reports, and rollback data.
- After each successful generation/determinism command, retain only the three newest staging runs.
- Static preview history is not part of the pipeline and must not be regenerated.
- `public/assets/models/asset-manifest.json` (tracked) and its `generated/reports/asset-manifest.json` mirror describe published truth. A partial publish merges into the tracked public manifest, so a fresh clone without `generated/` publishes safely.
- `generated/reports/asset_budget_report.json` describes the latest published generation quality state.
- Partial publishes merge selected assets and preserve all unselected manifest assets. Full-catalog publication alone may remove stale manifest-owned files.
- Manifest `aggregateBytes` reports the complete on-demand asset library; it is
  not the initial playable download. `downloadBudgetBytes` gates the code bundle
  through `tools/ci/check-download-budget.mjs`, while that same check applies the
  separate committed total-`dist` ratchet. Asset admission enforces each
  catalog asset's own geometry, material and texture contracts without comparing
  the full library to the code-only budget.

Do not paste full reports or logs into the task. Report selected asset IDs, integration point, mechanical result, focused inspection evidence or access gap, actionable errors if any, save impact, `Docs updated:`, and the scoped completion result. Add human-review status only when required by the current task or release.

---

# 7. Runtime and Performance Constraints

- Geometry, shading, materials, palette, effects and detail are agent design choices within task scope. Use the existing registered producer. Shared palette/material helpers and `VisualRenderConfig` may evolve centrally; native source PBR materials do not require palette conversion or vertex-color baking.
- Preserve catalog dimensions, pivots, collision, required nodes, grips/sockets, rig/animation interfaces and valid GLB data; inspect affected motion and placement.
- Triangle maximums, material/texture caps and upper LOD limits remain enforced. Triangle floors/targets and lower LOD ratios are advisory evidence, not failures or instructions to add invisible geometry.
- LOD and quality degradation retain runtime level selection, canonical placement/collision and usable gameplay feedback. Profile affected cost with matching inputs; do not infer performance from geometry totals alone.
- Provider/source assets and supporting maps retain license/provenance evidence. Supporting maps use `ExternalSurfaceTextures` and `VisualRenderConfig` with owned loading/fallback/disposal; no reference-imposed albedo, palette-remapping or photorealism ban applies.
- Optimize unnecessary duplicate resources and invisible work where it helps measured cost, without substituting technical counts for design judgment.

# 8. Token-Conscious Agent Rules

- Use bounded ownership when delegating; routine work does not require a separate reviewer or approval loop.
- Batch related assets by family when they share the same generator context.
- Keep the user-selected model and reasoning settings. Reduce unnecessary work through focused context, cache reuse and scoped verification.
- The human should send revision feedback as `asset ID + observed problem + desired change`; do not restate the entire pipeline.
- Never run a command without `--asset`, `--family`, or explicit release `--all`.
- Avoid full catalog dumps, full command logs, manifest pastes, and repeated canonical summaries.
- Never hand-copy asset counts, below-target lists, report dates, or hashes into Markdown. Cite `generated/reports/asset_budget_report.json` and the command that regenerates it.

---

# 9. Completion Contract

Routine handoff:

```text
Assets: <selected IDs>
Integration: <game/runtime location>
Mechanical generation: passed/failed
Runtime TypeScript check: passed/not required/failed
Save impact: no (unless explicitly changed)
Docs updated: <paths, or `none — no documented fact changed`>
Narrative role: <none or concise practical/story function>
Inspection: <affected views/motion checked and result, or exact access gap>
Completion: <completed scope, or exact verification/access gap>
Human review: <only when explicitly requested or required for release>
```

Shared-kit, pipeline and release tasks additionally report only the heavier gates actually run and any actionable failures.
