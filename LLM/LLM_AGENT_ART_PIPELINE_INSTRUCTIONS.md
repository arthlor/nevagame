# LLM Agent Art Pipeline & Rendering Instructions (Compact)

> **Role:** Mandatory implementation guide for new/shared generators, renderer/material work, and release/gold-slice art gates. Routine existing-asset tasks follow the lean route in `BLENDER.md` and read only directly relevant sections here when needed. `04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` owns **what the game looks like**; this file owns **how agents produce it reliably**.

# 0. Architecture Boundary

Runtime architecture follows `01`:
```text
React/DOM UI: HUD, inventory, market, journal, crafting, dialogue, menus, settings
Three.js: world, terrain, characters, buildings, props, vegetation, lighting/shadows, water, weather, VFX
Domain Simulation: authoritative serializable gameplay state, clock/calendar, farming, fishing, boats/cargo, economy, persistence
```
Use TypeScript, Vite, Three.js (WebGL2 baseline; WebGPU/TSL allowed where justified), Rapier, domain simulation, optional Miniplex/bitECS for rendering/spatial work, Vanilla TS/React DOM, optional Zustand. **No React Three Fiber ownership of core 3D scene.**

# 1. Hybrid Art Production Pipeline

Use two production paths for authored 3D:
1. **Static prefabs:** catalog/schema + registered Blender Python family generators, composed from shared deterministic `common/authored.py` construction systems where appropriate (Geometry Nodes only when deliberately introduced) → GLB/glTF 2.0 → Khronos validate → glTF Transform/Meshopt → atomic publish → runtime.
2. **Dynamic/procedural runtime systems:** Three.js TS builders + shared `PaletteMaterials` for faceted water, crop growth visuals, seasonal tint, dynamic fish, debug proxies.

Ground supporting maps are not a third prefab pipeline. They are renderer presentation textures owned by `ExternalSurfaceTextures` + `VisualRenderConfig` (section 6.2). Do not register them as catalog IDs, run `art:generate` for them, or treat `public/assets/textures/terrain/` as a filename-list authority.

Preferred flow:
`LLM agent → one catalog entry (+ referenceAuthoring brief when evidence-guided) → registered Blender family generator (+ shared authored construction helpers where reusable) → staged GLB → validation/optimization → atomic publish → catalog-backed Three.js loader`.

Project boundaries:
```text
assets/specs/asset-catalog.{json,schema.json}  generated-asset contract
  optional referenceAuthoring                  evidence-to-generator contract, not a second spec
art/palettes/neva.palette.json                 semantic palette contract
tools/blender/cli.mjs                          public art CLI
tools/blender/bootstrap.py                     headless Blender orchestration
tools/blender/generators/*.py                  registered family generators
tools/blender/common/authored.py               reusable authored construction grammar
tools/blender/common/{geometry,materials,pipeline}.py
                                                primitives/material/export validation
tools/art/codegen.mjs                              typed ID/family-map generation
generated/.staging/                            run-local candidates and backups
generated/glb/                                 last published optimized GLBs
generated/.cache/art/                          disposable validated per-asset cache
generated/reports/                             manifest, human report, quality report
public/assets/models/                          runtime-published GLBs + manifest
src/render/assets + loaders                     catalog consumer and GLB loader
src/render/config/VisualRenderConfig.ts         live renderer + supporting-map strengths
src/render/materials/ExternalSurfaceTextures.ts supporting-map provenance and load contract
public/assets/textures/terrain/                 published ground supporting-map WebPs
tools/vite/runtimeAssetCatalogPlugin.ts         virtual runtime-only catalog projection/HMR
tools/vite/artYardPlugin.ts                     dev-only WebGL yard routes
src/art-yard/ + tools/art-yard/viewer.html      interactive asset review surface
tests/visual/candidates/                        unapproved gameplay-camera captures
```
Game consumes optimized assets; art tools produce them. Do not couple Blender generation to gameplay logic.

# 2. Geometry & Shading Implementation Rules

All output MUST follow `04` Global Visual Grammar. Pipeline-specific rules:
- design low-poly geometry from the start; do not make realistic high-poly meshes then decimate;
- silhouette → primary mass → secondary structure → sparse tertiary detail;
- strong readable planes, controlled asymmetry, slightly exaggerated proportions;
- bevels small relative to object, usually **1 segment**, occasionally 2 on hero assets; deliberate/weighted normals where useful;
- smooth/selectively smoothed: traversable grass/soil/path terrain where regular mesh topology would otherwise dominate; macro landforms and semantic material regions retain the stylized read;
- flat/faceted: cliffs, terrain cuts, exposed banks, hero landforms, rocks, mountains, clouds, canopy/bushes, stylized water, selected decoration;
- selective smooth: characters, rounded tools/barrels/ropes/boats/wheels/curves;
- hard edges: planks, roofs, doors, blocks, crates, docks, fences, beams, stairs.
Never rely on default smoothing.

# 3. World Scale & Modular Standards

`1 world unit = 1 meter`.

The current runtime world is a finite authored composition: `WORLD_LAYOUT_V5`
is a retained implementation symbol, the live layout revision is 9, and the
terrain field is 600 m. Runtime chunk streaming is not implemented. The
following values are **authoring heuristics only** for making reusable forms;
they are not runtime grid, streaming, or asset-budget contracts:
```text
Building modules: 2m / 4m / 8m
Fence module: 2m
Path module: 2m
Terrain chunk: 32×32m
Large streaming chunk: 128×128m
Rotation snap: 15° / 30° / 45°
Common prop scale: 0.90 / 1.00 / 1.10
```
The 32 m terrain grouping may help authoring or future tooling; the 128 m
streaming concept is future-only and must not be described as a live system.
Break repetition using controlled offsets, scale/rotation variation, terrain
adaptation, clustering, landmarks, and irregular paths.

# 4. Material, Vertex Color, Texture & Palette Systems

The canonical vocabulary is `art/palettes/neva.palette.json`; use its lowercase semantic tokens, for example:
```text
wood_honey_01 / wood_warm_01 / wood_dark_01 / wood_weathered_01
stone_golden_01 / stone_warm_01 / stone_cool_01 / rock_coastal_dark_01
foliage_sage_01 / foliage_olive_01 / foliage_shadow_01 / soil_warm_01
roof_terracotta_01 / roof_turf_01 / metal_dark_01 / metal_brass_01
canvas_cream_01 / rope_hemp_01 / foam_warm_01 / emissive_lantern_01
```
Variation comes mainly from geometry, vertex colors, palette/hue shifts, roughness, lighting/AO, controlled semantic fields/masks—not unrelated materials. Terrain, road, shore, farm, and cover consumers must derive from the same authored world-layout semantics rather than maintaining visually similar but independent masks.

Vertex colors are first-class. Use for top-vs-side value, warmth, age/dirt, gradients, AO-like darkening, deterministic palette variation. Example rock: top lighter/warmer; side medium; downward/crevice darker; sun-facing slightly warmer. Inputs may include normals, height, AO, curvature, seeded randomness, palette index. **Never uncontrolled random RGB.**

Textures support, never define, style. Use for subtle roughness, stylized masks, AO/lightmaps, decals/signs/markings, and the ground supporting-map contract in section 6.2. Normal targets follow `04`: **128–256 tiny, 256–512 normal, 512–1024 hero, 2048 rare/shared exception**. Any broader 1K–2K architecture allowance is a ceiling, not the default. Avoid photogrammetry/photo bark-rock-grass as final albedo, noisy terrain, excessive resolution, high-frequency normals/micro scratches/scans. Processed CC0 supporting maps are allowed only as the Art Bible's low-frequency tiler: local reduced derivatives, world-space sampled, palette-remapped, and owned by `VisualRenderConfig` plus `ExternalSurfaceTextures`.

Use shared palette tokens (`wood_warm_01`, `stone_warm_01`, `foliage_spring_01`, `water_shallow_01`, etc.). Do not scatter arbitrary runtime colors. `04` owns the canonical token vocabulary; this pipeline must expose it through one runtime material API such as `PaletteTokens.ts` + `PaletteMaterials.ts`.

Minimum production behavior:
```ts
const wood = paletteMaterials.standard("wood_warm_01", { vertexColors: true });
const stone = paletteMaterials.standard("stone_golden_01", { vertexColors: true });
```
Implementation syntax may differ, but material requests must resolve through shared cached families. Builders/agents may apply deterministic bounded vertex-color/value variation; they MUST NOT create a new material instance/hex color for every prop. Debug-only colors are exempt. Asset-spec validation should reject unknown palette tokens.

# 5. Lighting, Baking & Canonical Renderer Configuration

Lighting follows `04`: warm sun + soft/cool sky contribution + controlled AO/contact + atmosphere + restrained emissives + filmic tone map. Sun direction must reveal planes; shadows welcoming but grounding; AO visible at contacts; avoid flat/harsh HDR/pure-white sun. Use globally controlled exposure, not per-scene hacks.

Implement one render-subsystem-owned `VisualRenderConfig` (name may differ) that centrally controls output color space, tone mapping, exposure, sun/fill baseline, shadow quality tiers, AO/contact policy, atmosphere/fog, restrained bloom and global grade, and the live ground supporting-map sampling/blend strengths. Gold-standard slices calibrate its exact numbers; after approval, renderer changes are explicit art-direction changes with benchmark review.

Semantic systems may modify it through controlled inputs (time of day, season, weather, quality mode). Zone/asset code may NOT independently override global exposure/tone mapping/saturation or create a different world-lighting stack to rescue one scene. Fix the asset/composition/local practical lighting, or deliberately revise the canonical config and re-run all gold slices.

The runtime presentation layer smooths integer clock advancement and explicit time skips over a continuous wrapped day-cycle envelope; canonical `GameMinute` remains unchanged. Quality selection and Auto adaptation similarly target a continuous low→medium→high level: blend density/distance and effect strength, rate-limit repeated population/LOD rebuilds, and stage discrete DPR/shadow/post ownership at adjacent-tier crossings. Do not allocate every quality-dependent render target or repopulate every repeated system in the input/UI callback.

Do **not** use normal-world toon/ink edge rendering: inverted-hull outlines, Sobel/post edge outlines, black mesh edges and comic contours are prohibited. Selection/debug/context highlights may use temporary outlines if they are clearly UI feedback rather than the base art style.

Bake static information where useful: lightmaps, AO, vertex AO, static shadow gradients, emissive masks. Real-time lighting focuses on sun, moving actors/props, weather/time, gameplay lanterns, temporary effects. Do not spend runtime budget on static detail that can be baked safely.

# 6. Water & Vegetation Implementation

Water MUST follow `04` polygonal system, not photoreal ocean. Required components: faceted surface/visible planes, **2–3 low-frequency wave layers**, vertex displacement, shallow→deep gradient, Fresnel-like edge response, stylized reflections, controlled transparency, geometric/shader foam, shoreline foam, obstacle/wake splash. TSL/Node Materials are appropriate where practical.

Vegetation is generator-family based:
```text
TREE_PINE TREE_OAK TREE_FRUIT TREE_BUSH
FLOWER_WHITE/YELLOW/RED
GRASS_SHORT/TALL
REEDS CATTAILS
```
Families support seed, height/width, canopy clusters, trunk bend/branches, palette, scale, asymmetry. Example tree grammar: 5–8 sided tapered slightly crooked trunk, 2–4 primary branches, 3–7 intersecting faceted canopy clusters, 2–4 coordinated foliage tones. No smooth spheres.

## 6.1 Terrain, Route & Ground-Cover Implementation Contract

Implement the Art Bible's five ground layers through one coordinated presentation contract:

1. Authoritative world-layout/route/shore/farm data owns semantics that affect traversal, collision, placement or map projection.
2. A single deterministic derivation exposes filtered surface weights/influences for grass/meadow/soil/path/shoulder/beach/riverbed/wet shore/cliff (names may evolve with the canonical palette and world model).
3. Terrain geometry/materials, road presentation, shoreline dressing, and cover placement consume those shared signals.
4. Weather/time/quality mode modulates presentation through `VisualRenderConfig`; it never mutates gameplay moisture or creates local renderer baselines.

Representation is deliberately not prescribed. Analytic queries, vertex attributes, compact per-chunk control textures, or cached buffers are allowed. Select by measured update cost, texture/fill-rate cost, transition quality, diagnostics, and maintainability. If using a control texture, document channel semantics, world bounds, filtering, generation seed/input hash, invalidation, and memory in the owning implementation—not in a parallel art spec.

Terrain normals are class-aware. Normal continuity may cross non-feature triangulation edges in broad traversable grass/soil/path regions when flat triangles read as topology. It stops or transitions deliberately at authored ridges, terraces, cliffs, cuts, exposed banks, rock shelves, and hero landforms. Never globally smooth every surface or globally flat-shade the terrain as a shortcut.

Road implementation requirements:
- one authored route/profile owner for geometry, terrain grading, surface influence, map projection, cover exclusion, and relevant collision/interaction queries;
- any deformation that materially changes the walkable surface is incorporated into the canonical height/normal query used by rendering, Rapier, placement, and affected anchors; cosmetic shader displacement stays below visible render/collision mismatch and never changes traversal;
- route-kind widths, crown/depression/ruts, shoulders, feather, junctions, caps, bridge transitions, and steep-route cuts are explicit/profiled rather than scattered magic numbers;
- a terrain-conforming road mesh is permitted when it is visibly integrated and robust against z-fighting; shader/control-field-only roads are also permitted; neither approach may create a second route network;
- the visible merge has one owner: do not stack a coarse terrain-grid dirt tint under a broad transparent road feather. Use a narrow world-space irregular coverage transition with pixel-scale anti-aliasing and, when the post path has no MSAA, world-space dither so it cannot form a muddy halo or change through transparent draw ordering;
- road center, shoulder, and surrounding cover are reviewed together from gameplay cameras.

Ground-cover implementation requirements:
- deterministic world-seed derivation with stable placement IDs where identity is exposed;
- one inspectable composition sample combining authored district envelopes, route projection, river/floodplain causes, openings, architecture/farm/landmark/fishing/coast clearances, and independent category-salted macro/meso fields;
- independent category candidate streams and species hashes, deterministic priority inhibition, and explicit core/edge/isolate/landmark/riparian/route-frame roles; IDs derive from category/address/slot rather than accepted-array index;
- semantic density plus authored exclusions/clearances, clustered patch signals, variant families, and patch-level palette grouping;
- high-count uniform geometry uses `InstancedMesh`/the established batching path, with quality-tier counts and draw-distance culling;
- distance selection and world-asset LOD membership are anchored to the player/world focus. Camera orbit, pitch, zoom, and look-ahead direction may not reshuffle instances or switch asset membership; ordinary off-screen frustum rejection remains allowed;
- short cover generally receives light but does not cast dynamic shadows; reserve real shadows/contact for readable clumps and anchors;
- changing quality tier may reduce count/distance, not change route readability, shoreline continuity, collision, or gameplay truth.

Do not derive bushes from grass coordinates, cycle assets by accepted-array index, fill fixed ellipses, lay reeds at a fixed cadence, or use a habitat-cell lattice as visible coverage. Hashed candidate addresses are allowed only as stable invisible address space. Authored overrides remain available for deliberate layout-editor pins, but seeded overrides must be empty while the field rules are being accepted.

River-facing consumers use `WorldLayout.riverSectionAt()` and `riverBankSample()`: independent left/right water widths and banks, moving thalweg, bed elevation, floodplain, wetness, erosion/deposition, and estuary influence are canonical. Terrain height/normals, Rapier support, water sign, walkability, fishing access, soils, rocks, riparian cover, roads, and bridge approaches must not recreate the river from an absolute centerline-distance formula.

Multi-island consumers iterate `WORLD_TERRAIN_PATCHES` and sample the closed
coast/marine registry; they do not assume one square heightfield centered at
the origin. Terrain meshes, translated Rapier heightfields, snapping, routes,
composition, map nodes, water, and diagnostics all resolve the owning island
from world position. The shared water surface may span a rectangular union of
patches, but its shore-profile texture preserves world meters per texel and per
segment, and the global sign treats a point as land when any registered island
coast reports dry ground. Submerged visual aprons soften outer patch seams and
must never become walkable collision or a second shoreline authority.

For the starter-farm ground/meadow pass, `art/references/neva-ui-hud-on-foot.png` is the authoritative gameplay-distance graphics benchmark. Translate its warm sandy-ochre polygonal paths, irregular but softly integrated grass shoulder, intermittent stepping stones, low chamomile/daisy cover, chunky foliage, wet-edge reeds, faceted crowns, golden wheat/pumpkin-bed read, and warm-key/cool-fill lighting into the canonical route, palette, catalog, instancing, water, and render-config owners. Supporting maps may enrich packed-core wear and meadow meso breakup only after palette remap (section 6.2). The transition must retain broad faceted regions without binary cutout holes, black seams, or a blurry uniform ribbon. Do not copy its camera, UI, layout, composition, depth of field, or tilt-shift, and do not create a second surface field or renderer baseline.

Terrain/ground shader work must use a stable program cache key, fail clearly when patched Three.js chunks drift, keep uniforms/config centrally owned, dispose generated textures/materials, and receive focused tests for deterministic field/texture generation, bounds, mask protection, wetness transitions, supporting-map provenance/load fallback, and program-key stability. Do not copy a reference's realism, texture frequency, or exact numeric thresholds into code without gameplay-camera validation.

## 6.2 Ground Supporting-Map Contract

Ground supporting maps are a renderer presentation system. They are not catalog GLBs, not a second route/meadow mask, and not save-schema. They occupy the Art Bible's optional low-frequency tiler slot.

Owners:

- `src/render/config/VisualRenderConfig.ts` owns `terrainSurface.externalTextures`, `roadSurface.externalTexture`, polygon/edge/path-transition strengths, and roughness bounds. Tune numbers there; do not fork them into a parallel spec.
- `src/render/materials/ExternalSurfaceTextures.ts` owns source name, source page, runtime URL, texture kind, wrap/filter/color-space, and the 1px fallback used while images decode.
- `public/assets/textures/terrain/` stores the published local WebP derivatives. It is not an asset catalog and must not gain a filename-list authority.
- Beach/wet shore use the same application model as meadows: remap the supporting map into palette bands, blend `mix(paletteBase, sourceColor, 0.76)`, then apply through semantic masks at full `colorStrength`. Vegetation and shore masks are derived from the packed surface field with a gradual crossfade (`vegetationMask`, `shoreMask`); shore also receives the meadow polygon value-band and `terrainShorePolygonTint` stack. Do not route beach through a second attenuated `beachColorMix` pass.
- `RoadSurfaceMaterial` consumes Grass Path 2 on the shared route mesh. Coverage, dither, and packed-core/shoulder response stay on this material.
- `GroundPolygonCells.ts` owns the shared world-space Worley snippet so meadow mosaic and road-edge irregularity use the same field.

Current selected sources are Poly Haven CC0 maps: Grass Path 2 for the road, Leafy Grass and Sparse Grass for meadows, and Coast Sand 01 for beach and wet-shore breakup. Keep the source pages in `ExternalSurfaceTextures` when replacing a derivative so provenance is not lost. Licensing remains CC0; do not add non-CC0 ground maps without an explicit human decision.

Required behavior:

- sample in world XZ with explicit rotation; never let mesh UVs or camera orbit change the field;
- remap luminance/chrominance into `PaletteTokens` (`foliage_sage_01` / olive / grass for meadows; `path_dust_01` / `soil_dry_01` / `sand_warm_01` for worked ground; `sand_warm_01` / `shore_wet_01` for beach and wet shore). Photographic RGB is not the final diffuse;
- keep roughness bounded and palette-preserving; precipitation wetness stays on the existing terrain wetness owner;
- protect water, shore, farm, and other non-meadow/non-road surfaces with the existing semantic masks;
- if a file fails to load, log loudly and leave the deterministic palette/procedural path active;
- dispose loaded textures with the owning material.

Do not:

- register these maps as catalog IDs or run `art:generate` / Tripo for them;
- publish a downloaded photogrammetry GLB or an unprocessed photo as ground albedo;
- invent a second `VisualRenderConfig`, palette file, or per-zone ground material;
- change route width, collision, topology, or save schema to “make the texture fit.”

`Save-impact: no` and `Migration required: no` while canonical height, route geometry, Rapier, placement, and serialized world data stay unchanged. Human gameplay-camera review remains required; supporting-map presence is not visual approval.

# 7. Procedural Generator Library

`tools/blender/generators/registry.py` is the only generator-name dispatch table. Family composition lives in the owning family module (`architecture.py`, `vegetation.py`, `boats.py`, and so on). Extend an appropriate family module and register one stable name; do not create an alternate entrypoint or filename list. Same catalog seed + parameters + generator code MUST reproduce the same semantic output.

`tools/blender/common/authored.py` is below that registry boundary. It provides reusable deliberate construction systems currently consumed by architecture, prop and boat generators: staggered box/cylindrical masonry, shingle rows, plank fields, lattices, segmented rope lines, arch rings, root flares, fasteners, timber-frame bays, mullioned openings, and banded tapered towers. Reuse or extend it when several assets need the same visual construction language. Do not register its helpers, call them directly from the CLI, let them own palette/budget/file metadata, or treat “authored” as permission for unseeded one-off geometry. Any helper control exposed to an asset remains an explicit catalog `parameters` key and must reproduce from the same catalog seed.

# 8. Machine-Readable Asset Specs

Every generated asset MUST be one entry in `assets/specs/asset-catalog.json`, validated by `asset-catalog.schema.json`. Do not add parallel YAML or per-family spec files. Minimum implemented shape:
```json
{
  "id": "tree_oak_a",
  "file": "tree_oak_a.glb",
  "family": "vegetation",
  "generator": "oak_tree",
  "seed": 10,
  "dimensions": { "width": 4.8, "depth": 4.3, "height": 6.2 },
  "palette": ["wood_warm_01", "foliage_sage_01", "foliage_shadow_01"],
  "budget": {
    "trianglesMin": 300,
    "trianglesTarget": 2900,
    "trianglesMax": 5000,
    "materialsMax": 4
  },
  "pivot": "ground_center",
  "collision": "none",
  "instancing": true,
  "lod": "medium",
  "rootNode": "tree_oak_a_root",
  "requiredNodes": ["tree_oak_a_root"],
  "readDistanceMeters": 30,
  "parameters": { "height": 5.8, "spread": 2.2, "canopyClusters": 7, "lean": 0.12 }
}
```
The numeric values in this shape-only example mirror the current `tree_oak_a`
entry for readability; they are illustrative and must never be copied to a
different asset. The catalog entry is authoritative.
The schema is closed (`additionalProperties: false`): extend the schema deliberately before adding a new contract field. Unknown palette tokens, duplicate/unsafe IDs or filenames, missing roots, or invalid min ≤ target ≤ max ordering fail before Blender starts.

## 8.1 Reference-Guided Authoring Contract

Use the optional catalog `referenceAuthoring` object when an asset is derived from supplied images, generated concept studies, turnarounds, or a reconstruction study. This is Neva's adaptation of the useful img2threejs discipline, not adoption of its shipping architecture. It must capture:

- each source and whether it informs form language, silhouette, proportion, structure, materials, detail density, or workflow;
- a non-shallow parent/child component inventory with importance, shape, count, and readable cues;
- silhouette and negative-space requirements;
- a hidden-surface inference strategy plus explicit confidence and continuity requirements;
- critical features linked to component IDs;
- bindings from the brief to existing catalog generator parameters; `parameterBindings` must cover every **primary** component for gold-slice family generators (`farmhouse`, `lighthouse`, `stone_bridge`, `working_dock`, `fish_market`);
- concrete failure modes;
- front, rear, side, three-quarter, 8 m, 15 m, and declared-read-distance review views.

Run `npm run art:brief -- --asset ID` when the selected brief changes. The command validates local `repo://` evidence, HTTPS sources, hierarchy/cycles, feature links, parameter bindings and review coverage, then prints a deterministic brief/hash. Missing `repo://` files fail closed; `ready` does not excuse absent evidence. Do not read or print unrelated asset briefs. `draft` means usable for exploration but not strict acceptance; `ready` means the authoring contract is complete, not that the asset is visually approved.

Blender family generators consume catalog `parameters` only. They must not parse `referenceAuthoring` JSON. The brief binds identity-defining layout into those parameter keys; the registered generator reads the keys.

Reference admission is visual judgment, not a brittle background-color heuristic. Preserve the original evidence. If segmentation, transparency, or a clean isolated concept makes the subject easier to read, record the normalized derivative as another study and do not let it silently replace the original. A generated rear/side study is an inference: record hidden-surface confidence so the human can inspect continuity through Art Yard/game controls.

Translate accepted hierarchy and parameters into the existing registered Blender family generator and shared helpers. Do not ship direct TypeScript reconstruction factories, source-image-dependent runtime geometry, a second palette/material/lighting system, a separate per-asset spec tree, or a direct exporter. Runtime-dynamic systems continue to follow the explicit Three.js path in section 1; static reference-authored assets remain staged, validated, optimized GLBs.

Reference-authoring data is build-time only. The Vite virtual catalog module projects loader/placement, collision, LOD, rig/socket, and animation-contract fields directly from the canonical JSON without creating a checked-in second catalog; source URIs, authoring prose, generator parameters and budgets must be absent from the production browser bundle.

`npm run art:codegen` derives `src/render/assets/AssetCatalog.generated.ts` from the canonical catalog. It owns typed `ASSET_IDS`, family names, and family maps only; it is generated and must never be hand-edited. `npm run art:codegen:check` fails when the adapter is stale. The Vite runtime plugin may refresh codegen during development, while production consumes only the runtime projection.

Generated-asset budgets are centralized with their dimensions, palette, pivot, collision, instancing, LOD, and required-node contracts in `assets/specs/asset-catalog.json`; scene envelopes remain in `tools/blender/asset_budgets.json`. Every exported GLB MUST report triangle count, material groups, mesh/node count, file size, target status, bounds, and required-node coverage to `generated/reports/asset_budget_report.json`. Normal generation rejects assets outside production minimum/hard maximum or material/pivot/spec contracts and reports below-target assets. `npm run art:generate:strict` retains its existing semantics and additionally rejects every below-target asset; it is the technical-art/release certification gate, separate from P0.75 visual-gold acceptance. Do not satisfy a floor or target by blind subdivision: additional geometry must improve silhouette, planes, thickness, deformation, or gameplay-camera readability.

Implemented command contract:
```bash
npm run art:codegen
npm run art:codegen:check
npm run art:brief -- --asset tree_oak_a
npm run art:generate -- --asset tree_oak_a
npm run art:generate -- --family architecture --no-publish
npm run art:generate -- --all
npm run art:sync -- --all
npm run art:generate:strict -- --all
npm run art:validate -- --all
npm run art:determinism -- --asset tree_oak_a
npm run art:benchmark
npm run art:benchmark:extended
```
Every catalog command requires `--asset`, `--family`, or explicit release `--all`; a bare command fails. Repeated `--asset`/`--family` selectors form a union. `--no-publish` keeps both published directories unchanged. `--strict` belongs only to `generate`. `art:sync -- --all` refreshes published manifest provenance and derived measurements against existing GLBs; it does not regenerate or reauthor them.

`generate` uses a unique `generated/.staging/run-*` directory, computes a per-asset input/toolchain hash, revalidates a matching optimized GLB from `generated/.cache/art/` when available, and invokes Blender only for cache misses. Cache artifacts are acceleration state: they are validated before reuse, never published, and report `inputHash`/`cacheHit`. A catalog/spec/palette/generator/helper/dependency/Blender-version change invalidates the affected asset. Shared-generator/release `art:determinism` bypasses the cache; routine asset work does not double-generate. Only the three newest successful staging runs are retained.

After cache selection or generation, the CLI validates Blender scene contracts, validates raw GLBs, applies dedupe/join/prune/weld/Meshopt, validates optimized GLBs, then promotes selected GLBs plus manifests in one rollback-capable transaction. Partial runs merge their selected results into the published manifest and preserve other assets; only a full-catalog publish may remove files owned by the previous manifest that no longer exist in the catalog. Published truth is `generated/reports/asset-manifest.json` plus `public/assets/models/asset-manifest.json`. Determinism and benchmarks do not publish or replace that truth.

# 9. World Generation & Composition

Runtime LLMs MUST NOT invent world art. Development agents create deterministic validated world data; runtime loads authored/pregenerated content.

Procedural generation is allowed only when deterministic/seeded, constrained by biome grammar, built from approved prefabs, visually validated, and overrideable by authored data.

World-layout semantics may generate deterministic presentation fields for surface blending and cover density. These are derived art data, not permission for runtime-random terrain or a second gameplay world. Important routes, shorelines, farms, structures, clearances, and landmark composition remain authored/overrideable.

The current finite world uses a hierarchical district/habitat/route/opening composition field over stable category-specific candidate streams. It establishes large openings, cluster structure, route frames, riparian pockets, and isolates before asset selection. Quality tiers use stable priority prefixes. The field and non-serializable placement tags are inspection surfaces; they do not replace `WorldLayout`, create saved procedural geography, or authorize runtime regeneration from camera position.

Important areas require visual anchors, readable routes, foreground/midground/background, prop clusters, negative space, height variation, sightline control, landmarks, compositional asymmetry. Avoid even scatter, identical rotations/spacing, world-axis alignment everywhere. Modular settlements must still feel authored.

## 9.1 Narrative-to-art contract

Art supports the live story spine in `02` rather than inventing a parallel
world history. Every zone or story-relevant asset brief must identify, when
applicable, its narrative promise, the quest/action it supports, the person or
role associated with it, the practical evidence a player should read, and the
future-content boundary it must not imply. For the current loop this means:

```text
starter farm  = inherited care and preparation
village       = community exchange and shared work
river/bridge  = learning to read currents
harbor        = perishable responsibility and earned seamanship
coast/offshore= orientation, temporary abundance, and open horizons
```

Use the existing catalog, world-layout, zone-brief, and runtime integration
contracts. Do not create a lore YAML, filename list, or unvalidated asset
metadata tree just to annotate story meaning. Narrative notes belong in the
owning task/zone/asset brief unless a future machine-readable field is
explicitly added to the existing schema with validation and migration-aware
ownership. Visual cues may foreshadow a future system, but they must not claim
that deferred P13/P14 content is playable or make a prop the authority for a
quest condition.

# 10. Instancing & Physics

Repeated environment assets MUST be evaluated for batching/instancing; any static asset appearing roughly **>10 times** is a strong candidate. Common: grass, wheat/crops, flowers, rocks, fence modules, repeated trees, reeds, debris, repeated roof/architecture modules. The current static-prefab path groups compatible material/geometry signatures into `THREE.BatchedMesh`; use `InstancedMesh` for uniform high-count runtime systems where it is the clearer fit. Animated, skinned or morph-target meshes must not be folded into static batching.

Rapier is for gameplay-relevant physics: player capsule, NPC collision if present, triggers, doors, boats, rigid gameplay props, raycasts/moving obstacles. Do **not** create complex bodies for every flower/crop/plank/rock/small prop. Use simple primitives/proxies; collision need not match render mesh.

Rigged character generation remains catalog-driven. The registered character generator authors in-place actions with catalog durations, loop/reference-speed metadata, contact/commit events, stable humanoid/secondary bone names, and required socket nodes; the GLB exporter must retain normalized skin weights and the player volume-preserving armature deformation. Imported motion is not presumed transferable: incompatible proportions, bind axes, or joint ranges require a target-rig-authored performance, with the source retained only as motion reference. Runtime may crossfade phase-compatible clips and apply post-pose foot/hand constraints, but it may not repair a missing contact/pass/recovery performance by inventing root motion or by becoming gameplay authority. Equipment stays owned by its authored object hierarchy (for example an oar by its boat/oarlock); character hands follow grip markers after the mixer pose.

# 11. Optimization & LOD

The implemented post-export baseline is glTF Transform `dedup → prune → weld → meshopt`, followed by Khronos revalidation and generated/public hash parity. Catalog entries may now declare generated `lodLevels`: each level has a required named root, switch distance, and measured triangle-ratio envelope relative to LOD0. Blender consolidates only within a level; raw/optimized validation budgets LOD0, records packaged triangles and per-level ratios, and runtime converts the named roots into `THREE.LOD`. Static batching must skip LOD descendants so it cannot flatten the switch hierarchy. KTX2/BasisU and broader distance culling remain permitted extensions when a current asset/scene requires them. Ground supporting maps currently use local WebP through `ExternalSurfaceTextures`; that path does not by itself prove KTX2 integration. Runtime chunk streaming is not implemented; do not describe it as shipped or add it to the current world contract without a separate architecture decision.

Do not optimize away art direction: hero silhouette/faceting can matter more than a few hundred triangles.

LOD priority:
1. retain silhouette
2. retain color blocks
3. retain major faceted planes
4. remove tertiary decoration
5. simplify secondary geometry
6. reduce hidden/back faces where useful
Distant LODs MUST NOT become smooth generic blobs.

# 12. Camera-Aware Validation

Approve assets from the actual gameplay camera, never only close Blender renders. Inspect silhouette, color separation, prop/path/interaction/shadow readability, overlap. Tiny invisible details are generally unnecessary. Character assets additionally require an in-world style-lock check beside approved environment materials before large NPC production.

# 13. Deterministic Visual QA — Regression vs Style Match

The implemented fixed art views are:
```text
/?debug=1&artView=bridge
/?debug=1&artView=farm
/?debug=1&artView=harbor
/?debug=1&artView=coast

tests/visual/candidates/
  bridge-candidate.png
  farm-candidate.png
  harbor-candidate.png
  coast-candidate.png
```
P0.75 `npm run art:benchmark` captures four fixed 1440×900 comparison images through Playwright (`farm`, `bridge`, `harbor`, `coast`), rejects browser errors and preferred upper-budget overruns (≤220 draw calls and ≤900,000 visible triangles per scene), and records measurements in `tests/visual/candidates/art-benchmark.json`. `NEVA_ART_EXTENDED=1 npm run art:benchmark` captures the full 14-view matrix: dawn, morning, noon, harbor, coast, sunset, night, light rain, storm, lightning, on-foot farmhouse, on-foot bridge, boat harbor night, and sport-fishing framing. The lower scene triangle target is diagnostic/advisory for this gate. The current human-approved references and the 2026-08-27 visual-gold decision are registered in `tests/visual/reference/approved-baselines.json`; new captures are comparison evidence, not a request to select replacement candidates unless a human explicitly reopens that gate. The benchmark runs against the Vite DEV server, where layout-editor picking intentionally disables static prefab merging and the baked shadow proxy; those DEV draw/triangle measurements are diagnostic and do not constitute production-equivalent certification. `art:benchmark:extended` remains an explicit release diagnostic. Agents do not capture or inspect these images during routine asset work and do not visually analyze release images unless the human requests it.

The development-only Art Yard is served at `/__neva_art_yard` by Vite and is the sole asset-review surface. It uses the same `AssetLoader`, runtime catalog, `VisualRenderConfig`, `PaletteMaterials`, and `LightingRig` as the game and supports direct `?asset=<catalog-id>` links plus orbit, distance/LOD, triangle counts, wireframe, collision, animation, lighting, fog/storm, ground, and water diagnostics. Mounted player clips are reviewed as a synchronized rider-and-mount pair so saddle contact, gait phase, and counter-motion remain visible in context. It is not included in the production build. The human performs visual approval in the actual integrated game.

## 13.1 Regression QA — Game vs Approved Game
Same scene/state/camera/resolution/config only. Where available compare screenshot diff, SSIM, LPIPS, histogram/luminance, palette distribution and silhouette/edge metrics. These detect unintended change; they do not define artistic quality. Intentional accepted changes update benchmarks only after review.

## 13.2 Style-Match QA — Game vs Supplied Graphics References
Do **not** apply pixel-similarity thresholds across different compositions. Reference-image comparison intentionally ignores layout, camera angle, diorama/tabletop framing, depth of field/tilt-shift, scene borders and prop staging unless the task explicitly targets composition. Vision review scores geometry/faceting, silhouette/proportion, roughness/material response, palette/warm-cool distribution, lighting/shadows/AO, water/foam, vegetation/rocks, atmosphere, detail frequency, gameplay readability and realism/plastic drift.

A game screenshot passes style QA when it plausibly belongs beside the references as a continuous playable world without copying their presentation.

## 13.3 Frozen World-Composition Acceptance

`npm run world:acceptance` is the additive acceptance path for causal world, river, and composition changes. It records and revalidates a SHA-256 input digest, runs check-only generated-adapter verification, builds once, serves the static production bundle on a unique port, and writes only beneath `output/world-alignment/<digest>/`. It must not update candidate images, approved baselines, benchmark JSON, snapshots, catalog output, or published assets.

Capture modes are presentation diagnostics over identical world content: `final`; a true same-quality `no-post` path that bypasses the composer/GTAO; and named district, habitat, route, density, opening, river-profile, wetness, erosion/deposition, and fishing-access overlays. Final/no-post comparisons keep seed, camera, quality, cover, shadows, time, weather, DPR, and loaded assets identical and fail if content counts differ.

The harness runs a deterministic SwiftShader lane and a real Chrome hardware lane. GPU performance evidence requires non-blocking `EXT_disjoint_timer_query_webgl2` samples with warm-up, query buffering, and disjoint rejection; FPS cannot substitute. The report inventories composer buffers, GTAO targets, shadow maps, dimensions, formats, samples, depth/stencil state, estimated target bytes, and renderer geometry/texture memory separately. Browser/page/network errors, HMR, source-digest drift, zero assets, or repeated canonical scene identity fail the lane. Automated captures remain comparison evidence for human gameplay-camera review, never automatic aesthetic approval.

# 14. Agent Roles & Working Rules

Routine asset work uses one agent and no parallel visual-review agents. The human is the art director. Specialized agents are reserved for explicitly requested new/shared systems or release investigations.

Every relevant agent MUST:
1. follow the task-class read route in `BLENDER.md`;
2. run the catalog reference brief first when supplied/reference evidence is part of the task;
3. preserve visual vocabulary;
4. prefer reusable systems over hacks;
5. use deterministic seeds for generated art/world content;
6. reuse palette/material tokens;
7. avoid duplicate asset families;
8. assess performance;
9. run the task-class mechanical gates;
10. leave routine visual judgment to the human in the game;
11. use release benchmarks only at release/gold-slice gates.

“More realistic” is not an improvement unless explicitly requested. Default = more coherent, readable, stylized, intentional.

# 15. Prohibited Visual Drift

Unless explicitly approved, reject: photogrammetry/photo bark-rock-grass as final albedo; unprocessed photo-ground; noisy terrain/hyper-detailed PBR/micro normals; regular flat-shaded terrain topology dominating traversable ground; featureless globally smoothed terrain; hard floating road ribbons; independent road/terrain/cover masks; uniform ground-cover scatter; spherical foliage/realistic branching/ocean; excessive gloss; generic asset-store realism; perfectly straight forests/uniform spacing/rotations; thin architecture; high-frequency clutter; uncontrolled material proliferation/colors; per-scene exposure/tone-map/color hacks; toon/ink/black world outlines; high-poly invisible detail; runtime LLM world composition; diorama-only world design. Processed CC0 supporting maps remain under section 6.2 and are not a general photogrammetry exception.

Required across final game: readable planes/silhouettes/chunky geometry/selective bevels/cohesive warm palette/handcrafted irregularity/low-frequency detail/asymmetry/stylized architecture/selectively smoothed traversable ground with faceted cliffs/cuts/rocks/clustered simplified vegetation/warm sun+cool fill/AO grounding/soft shadows/atmosphere/emissives/polygonal water/coherent roughness/consistent proportions/gameplay-camera readability.

# 16. Rendering Pipeline Target

Conceptual runtime:
`optimized GLBs → Three.js/TSL materials → vertex colors → directional + environment light → baked light/AO where appropriate → dynamic contact/shadows → stylized water/foliage shaders → fog/atmosphere → subtle justified bloom → controlled grade → filmic tone map → final`.

Post-processing remains subtle; never substitute bloom/vignette/chromatic aberration/sharpening/saturation for geometry/material/lighting quality.

# 17. Gold-Standard Reference Slices

Before full-world production, validate in order:
1. **Bridge + river:** landform-dominant terrain, integrated road approaches, semantic grass/soil/slope/shore blending, clustered cover/reeds, stone, wood, water, lighting, atmosphere.
2. **Farm:** building kit, crops, fences, paths, trees, clusters.
3. **Harbor:** docks, boats, ropes, crates, ocean water, coastal architecture.
4. **Coast/lighthouse:** cliffs, rocks, foam, atmospheric perspective, sunset.

Do not mass-produce assets until these meet the visual-gold target. In the Roadmap this is P0.75, immediately after the P0.5 renderer/material foundation and before broad P1 world art production. The current four slices in `tests/visual/reference/approved-baselines.json` are human-approved and the 2026-08-27 visual-gold decision allows world expansion to reuse those generators/palettes/materials/rendering rules without another candidate-selection pass. This does not close technical-art certification: strict generation and determinism remain separate release gates, and the below-target records reported by `generated/reports/asset_budget_report.json` are not reauthored by this policy change. P14 is final coverage/polish, not the first real art pass.

# 18. Definition of Done — Asset

- [ ] any supplied/reference evidence is represented by a valid `referenceAuthoring` contract and deterministic brief hash
- [ ] component hierarchy, negative space, critical features, hidden-surface confidence, and generator bindings are implemented rather than merely described
- [ ] approved silhouette language + palette/material family
- [ ] gameplay-distance polygon density
- [ ] deliberate shading/bevel/vertex color
- [ ] optimized UV/textures where used
- [ ] collision defined where needed
- [ ] instancing eligibility defined
- [ ] LOD policy defined where needed
- [ ] generated typed adapter is fresh (`npm run art:codegen:check`)
- [ ] per-asset input hash/cache status is recorded; cache artifacts are not published
- [ ] GLB export + asset validation + runtime load succeed
- [ ] published to the Art Yard and integrated into the actual game for human review
- [ ] if story-relevant, the silhouette/material/prop context communicates the intended practical role without inventing an unimplemented plot or gameplay condition
- [ ] no realism/style drift

# 19. Definition of Done — Environment/POI

- [ ] major anchor
- [ ] readable paths/traversal
- [ ] foreground/midground/background separation
- [ ] authored prop placement + clustered vegetation + broken repetition
- [ ] terrain normals/material regions, roads, shoreline and ground-cover density agree with the same authored world-layout semantics
- [ ] global lighting/AO grounding
- [ ] approved water where applicable
- [ ] performance budget met
- [ ] generated asset budget report has no hard violations
- [ ] P0.75 visual-gold gate is accepted for the four gameplay-camera slices
- [ ] technical-art strict/determinism gate passes when production or release certification is required
- [ ] screenshot benchmark captured only for release/gold-slice acceptance
- [ ] integrated game is ready for human review
- [ ] visual regression passes or approved
- [ ] the zone's narrative promise is readable from gameplay cameras through people, routes, landmarks, and practical work cues; required quest progression does not depend on noticing decorative art
- [ ] no prohibited drift

# 20. Final Technical Direction

Default unless `01`/human explicitly supersedes:
```text
CLIENT: TypeScript, Vite, Three.js/WebGL2 (+ WebGPU/TSL when justified),
InstancedMesh/BatchedMesh, GLTFLoader, MeshoptDecoder, optional KTX2Loader when implemented, Rapier,
optional Miniplex/bitECS, React DOM, Zustand

ART: catalog/schema + Blender Python family generators; Geometry Nodes/UV/bakes only when deliberately added; semantic COLOR_0 + GLB export; ground supporting maps via ExternalSurfaceTextures + VisualRenderConfig (section 6.2)
OPTIMIZATION: implemented gltf-transform + Meshopt; KTX2/BasisU preferred for GLB-embedded textures; supporting maps currently local WebP
WORLD: validated JSON/TS schemas + seeded authored layout + prefabs + district/POI composition + authored overrides; no runtime chunk streaming
QA: AJV schema checks + Blender validation + Khronos glTF validation + semantic determinism + Vitest + Playwright candidates + human style review
```

Highest-priority rule: preserve the approved visual identity unless doing so makes the game unacceptably slow, unstable, or unmaintainable. Target is not realism; it is one coherent skilled-art-team look across the whole game.
