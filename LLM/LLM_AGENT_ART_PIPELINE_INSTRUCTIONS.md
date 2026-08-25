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

Use two production paths:
1. **Static prefabs:** catalog/schema + registered Blender Python family generators, composed from shared deterministic `common/authored.py` construction systems where appropriate (Geometry Nodes only when deliberately introduced) → GLB/glTF 2.0 → Khronos validate → glTF Transform/Meshopt → atomic publish → runtime.
2. **Dynamic/procedural runtime systems:** Three.js TS builders + shared `PaletteMaterials` for faceted water, crop growth visuals, seasonal tint, dynamic fish, debug proxies.

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
- flat/faceted: terrain, cliffs, rocks, mountains, clouds, canopy/bushes, stylized water, selected decoration;
- selective smooth: characters, rounded tools/barrels/ropes/boats/wheels/curves;
- hard edges: planks, roofs, doors, blocks, crates, docks, fences, beams, stairs.
Never rely on default smoothing.

# 3. World Scale & Modular Standards

`1 world unit = 1 meter`.
```text
Building modules: 2m / 4m / 8m
Fence module: 2m
Path module: 2m
Terrain chunk: 32×32m
Large streaming chunk: 128×128m
Rotation snap: 15° / 30° / 45°
Common prop scale: 0.90 / 1.00 / 1.10
```
These are authoring standards, not visible-grid permission. Break repetition using controlled offsets, scale/rotation variation, terrain adaptation, clustering, landmarks, irregular paths.

# 4. Material, Vertex Color, Texture & Palette Systems

The canonical vocabulary is `art/palettes/neva.palette.json`; use its lowercase semantic tokens, for example:
```text
wood_honey_01 / wood_warm_01 / wood_dark_01 / wood_weathered_01
stone_golden_01 / stone_warm_01 / stone_cool_01 / rock_coastal_dark_01
foliage_sage_01 / foliage_olive_01 / foliage_shadow_01 / soil_warm_01
roof_terracotta_01 / roof_turf_01 / metal_dark_01 / metal_brass_01
canvas_cream_01 / rope_hemp_01 / foam_warm_01 / emissive_lantern_01
```
Variation comes mainly from geometry, vertex colors, palette/hue shifts, roughness, lighting/AO, controlled masks—not unrelated materials.

Vertex colors are first-class. Use for top-vs-side value, warmth, age/dirt, gradients, AO-like darkening, deterministic palette variation. Example rock: top lighter/warmer; side medium; downward/crevice darker; sun-facing slightly warmer. Inputs may include normals, height, AO, curvature, seeded randomness, palette index. **Never uncontrolled random RGB.**

Textures support, never define, style. Use for subtle roughness, stylized masks, AO/lightmaps, decals/signs/markings. Normal targets follow `04`: **128–256 tiny, 256–512 normal, 512–1024 hero, 2048 rare/shared exception**. Any broader 1K–2K architecture allowance is a ceiling, not the default. Avoid photogrammetry/photo bark-rock-grass, noisy terrain, excessive resolution, high-frequency normals/micro scratches/scans.

Use shared palette tokens (`wood_warm_01`, `stone_warm_01`, `foliage_spring_01`, `water_shallow_01`, etc.). Do not scatter arbitrary runtime colors. `04` owns the canonical token vocabulary; this pipeline must expose it through one runtime material API such as `PaletteTokens.ts` + `PaletteMaterials.ts`.

Minimum production behavior:
```ts
const wood = paletteMaterials.standard("wood_warm_01", { vertexColors: true });
const stone = paletteMaterials.standard("stone_golden_01", { vertexColors: true });
```
Implementation syntax may differ, but material requests must resolve through shared cached families. Builders/agents may apply deterministic bounded vertex-color/value variation; they MUST NOT create a new material instance/hex color for every prop. Debug-only colors are exempt. Asset-spec validation should reject unknown palette tokens.

# 5. Lighting, Baking & Canonical Renderer Configuration

Lighting follows `04`: warm sun + soft/cool sky contribution + controlled AO/contact + atmosphere + restrained emissives + filmic tone map. Sun direction must reveal planes; shadows welcoming but grounding; AO visible at contacts; avoid flat/harsh HDR/pure-white sun. Use globally controlled exposure, not per-scene hacks.

Implement one render-subsystem-owned `VisualRenderConfig` (name may differ) that centrally controls output color space, tone mapping, exposure, sun/fill baseline, shadow quality tiers, AO/contact policy, atmosphere/fog, restrained bloom and global grade. Gold-standard slices calibrate its exact numbers; after approval, renderer changes are explicit art-direction changes with benchmark review.

Semantic systems may modify it through controlled inputs (time of day, season, weather, quality mode). Zone/asset code may NOT independently override global exposure/tone mapping/saturation or create a different world-lighting stack to rescue one scene. Fix the asset/composition/local practical lighting, or deliberately revise the canonical config and re-run all gold slices.

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

# 7. Procedural Generator Library

The implemented generator registry currently resolves these catalog generators through family modules:
```text
vegetation.py: oak_tree, pine_tree, apple_tree, bush, reeds
rocks.py: faceted_rock
architecture.py: farmhouse, fish_market, lighthouse, windmill, stone_bridge, working_dock
props.py: water_well, pumpkin_patch, lobster_trap, wood_crate, wood_barrel, wood_fence, hay_bale, lamp_post
boats.py: rowboat, fishing_skiff
crops.py: wheat_crop
fish.py: stylized_fish
clouds.py: faceted_cloud
characters.py: coastal_worker
```
`tools/blender/generators/registry.py` is the only generator-name dispatch table. Extend an appropriate family module and register one stable name; do not create an alternate entrypoint or filename list. Same catalog seed + parameters + generator code MUST reproduce the same semantic output.

`tools/blender/common/authored.py` is below that registry boundary. It provides reusable deliberate construction systems currently consumed by architecture, prop and boat generators: staggered box/cylindrical masonry, shingle rows, plank fields, lattices, segmented rope lines, arch rings, root flares and fasteners. Reuse or extend it when several assets need the same visual construction language. Do not register its helpers, call them directly from the CLI, let them own palette/budget/file metadata, or treat “authored” as permission for unseeded one-off geometry. Any helper control exposed to an asset remains an explicit catalog `parameters` key and must reproduce from the same catalog seed.

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
    "trianglesTarget": 1500,
    "trianglesMax": 3000,
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
The schema is closed (`additionalProperties: false`): extend the schema deliberately before adding a new contract field. Unknown palette tokens, duplicate/unsafe IDs or filenames, missing roots, or invalid min ≤ target ≤ max ordering fail before Blender starts.

## 8.1 Reference-Guided Authoring Contract

Use the optional catalog `referenceAuthoring` object when an asset is derived from supplied images, generated concept studies, turnarounds, or a reconstruction study. This is Neva's adaptation of the useful img2threejs discipline, not adoption of its shipping architecture. It must capture:

- each source and whether it informs form language, silhouette, proportion, structure, materials, detail density, or workflow;
- a non-shallow parent/child component inventory with importance, shape, count, and readable cues;
- silhouette and negative-space requirements;
- a hidden-surface inference strategy plus explicit confidence and continuity requirements;
- critical features linked to component IDs;
- bindings from the brief to existing catalog generator parameters;
- concrete failure modes;
- front, rear, side, three-quarter, 8 m, 15 m, and declared-read-distance review views.

Run `npm run art:brief -- --asset ID` when the selected brief changes. The command validates local `repo://` evidence, HTTPS sources, hierarchy/cycles, feature links, parameter bindings and review coverage, then prints a deterministic brief/hash. Do not read or print unrelated asset briefs. `draft` means usable for exploration but not strict acceptance; `ready` means the authoring contract is complete, not that the asset is visually approved.

Reference admission is visual judgment, not a brittle background-color heuristic. Preserve the original evidence. If segmentation, transparency, or a clean isolated concept makes the subject easier to read, record the normalized derivative as another study and do not let it silently replace the original. A generated rear/side study is an inference: record hidden-surface confidence so the human can inspect continuity through Art Yard/game controls.

Translate accepted hierarchy and parameters into the existing registered Blender family generator and shared helpers. Do not ship direct TypeScript reconstruction factories, source-image-dependent runtime geometry, a second palette/material/lighting system, a separate per-asset spec tree, or a direct exporter. Runtime-dynamic systems continue to follow the explicit Three.js path in section 1; static reference-authored assets remain staged, validated, optimized GLBs.

Reference-authoring data is build-time only. The Vite virtual catalog module projects loader/placement, collision, LOD, rig/socket, and animation-contract fields directly from the canonical JSON without creating a checked-in second catalog; source URIs, authoring prose, generator parameters and budgets must be absent from the production browser bundle.

`npm run art:codegen` derives `src/render/assets/AssetCatalog.generated.ts` from the canonical catalog. It owns typed `ASSET_IDS`, family names, and family maps only; it is generated and must never be hand-edited. `npm run art:codegen:check` fails when the adapter is stale. The Vite runtime plugin may refresh codegen during development, while production consumes only the runtime projection.

Generated-asset budgets are centralized with their dimensions, palette, pivot, collision, instancing, LOD, and required-node contracts in `assets/specs/asset-catalog.json`; scene envelopes remain in `tools/blender/asset_budgets.json`. Every exported GLB MUST report triangle count, material groups, mesh/node count, file size, target status, bounds, and required-node coverage to `generated/reports/asset_budget_report.json`. Normal generation rejects assets outside production minimum/hard maximum or material/pivot/spec contracts and reports below-target assets. `npm run art:generate:strict` additionally rejects every below-target asset and is required for production/gold-slice acceptance. Do not satisfy a floor or target by blind subdivision: additional geometry must improve silhouette, planes, thickness, deformation, or gameplay-camera readability.

Implemented command contract:
```bash
npm run art:codegen
npm run art:codegen:check
npm run art:brief -- --asset tree_oak_a
npm run art:generate -- --asset tree_oak_a
npm run art:generate -- --family architecture --no-publish
npm run art:generate -- --all
npm run art:generate:strict -- --all
npm run art:validate -- --all
npm run art:determinism -- --asset tree_oak_a
npm run art:benchmark
npm run art:benchmark:extended
```
Every catalog command requires `--asset`, `--family`, or explicit release `--all`; a bare command fails. Repeated `--asset`/`--family` selectors form a union. `--no-publish` keeps both published directories unchanged. `--strict` belongs only to `generate`.

`generate` uses a unique `generated/.staging/run-*` directory, computes a per-asset input/toolchain hash, revalidates a matching optimized GLB from `generated/.cache/art/` when available, and invokes Blender only for cache misses. Cache artifacts are acceleration state: they are validated before reuse, never published, and report `inputHash`/`cacheHit`. A catalog/spec/palette/generator/helper/dependency/Blender-version change invalidates the affected asset. Shared-generator/release `art:determinism` bypasses the cache; routine asset work does not double-generate. Only the three newest successful staging runs are retained.

After cache selection or generation, the CLI validates Blender scene contracts, validates raw GLBs, applies dedupe/join/prune/weld/Meshopt, validates optimized GLBs, then promotes selected GLBs plus manifests in one rollback-capable transaction. Partial runs merge their selected results into the published manifest and preserve other assets; only a full-catalog publish may remove files owned by the previous manifest that no longer exist in the catalog. Published truth is `generated/reports/asset-manifest.json` plus `public/assets/models/asset-manifest.json`. Determinism and benchmarks do not publish or replace that truth.

# 9. World Generation & Composition

Runtime LLMs MUST NOT invent world art. Development agents create deterministic validated world data; runtime loads authored/pregenerated content.

Procedural generation is allowed only when deterministic/seeded, constrained by biome grammar, built from approved prefabs, visually validated, and overrideable by authored data.

Important areas require visual anchors, readable routes, foreground/midground/background, prop clusters, negative space, height variation, sightline control, landmarks, compositional asymmetry. Avoid even scatter, identical rotations/spacing, world-axis alignment everywhere. Modular settlements must still feel authored.

# 10. Instancing & Physics

Repeated environment assets MUST be evaluated for batching/instancing; any static asset appearing roughly **>10 times** is a strong candidate. Common: grass, wheat/crops, flowers, rocks, fence modules, repeated trees, reeds, debris, repeated roof/architecture modules. The current static-prefab path groups compatible material/geometry signatures into `THREE.BatchedMesh`; use `InstancedMesh` for uniform high-count runtime systems where it is the clearer fit. Animated, skinned or morph-target meshes must not be folded into static batching.

Rapier is for gameplay-relevant physics: player capsule, NPC collision if present, triggers, doors, boats, rigid gameplay props, raycasts/moving obstacles. Do **not** create complex bodies for every flower/crop/plank/rock/small prop. Use simple primitives/proxies; collision need not match render mesh.

# 11. Optimization & LOD

The implemented post-export baseline is glTF Transform `dedup → prune → weld → meshopt`, followed by Khronos revalidation and generated/public hash parity. Catalog entries may now declare generated `lodLevels`: each level has a required named root, switch distance, and measured triangle-ratio envelope relative to LOD0. Blender consolidates only within a level; raw/optimized validation budgets LOD0, records packaged triangles and per-level ratios, and runtime converts the named roots into `THREE.LOD`. Static batching must skip LOD descendants so it cannot flatten the switch hierarchy. KTX2/BasisU, chunk streaming, and broader distance culling remain permitted extensions when a current asset/scene requires them; do not document them as already shipping unless the code path exists.

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
Release/gold-slice `npm run art:benchmark` captures four fixed 1440×900 comparison images through Playwright, rejects browser errors and preferred budget overruns, and records measurements in `tests/visual/candidates/art-benchmark.json`. The current human-approved references are registered in `tests/visual/reference/approved-baselines.json`; new captures are comparison evidence, not a request to select replacement candidates unless a human explicitly reopens that gate. `art:benchmark:extended` remains an explicit release diagnostic. Agents do not capture or inspect these images during routine asset work and do not visually analyze release images unless the human requests it.

The development-only Art Yard is served at `/__neva_art_yard` by Vite and is the sole asset-review surface. It uses the same `AssetLoader`, runtime catalog, `VisualRenderConfig`, `PaletteMaterials`, and `LightingRig` as the game and supports direct `?asset=<catalog-id>` links plus orbit, distance/LOD, triangle counts, wireframe, collision, animation, lighting, fog/storm, ground, and water diagnostics. It is not included in the production build. The human performs visual approval in the actual integrated game.

## 13.1 Regression QA — Game vs Approved Game
Same scene/state/camera/resolution/config only. Where available compare screenshot diff, SSIM, LPIPS, histogram/luminance, palette distribution and silhouette/edge metrics. These detect unintended change; they do not define artistic quality. Intentional accepted changes update benchmarks only after review.

## 13.2 Style-Match QA — Game vs Supplied Graphics References
Do **not** apply pixel-similarity thresholds across different compositions. Reference-image comparison intentionally ignores layout, camera angle, diorama/tabletop framing, depth of field/tilt-shift, scene borders and prop staging unless the task explicitly targets composition. Vision review scores geometry/faceting, silhouette/proportion, roughness/material response, palette/warm-cool distribution, lighting/shadows/AO, water/foam, vegetation/rocks, atmosphere, detail frequency, gameplay readability and realism/plastic drift.

A game screenshot passes style QA when it plausibly belongs beside the references as a continuous playable world without copying their presentation.

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

Unless explicitly approved, reject: photogrammetry/photo bark-rock-grass; noisy terrain/hyper-detailed PBR/micro normals; spherical foliage/realistic branching/ocean; excessive gloss; generic asset-store realism; perfectly straight forests/uniform spacing/rotations; thin architecture; high-frequency clutter; uncontrolled material proliferation/colors; per-scene exposure/tone-map/color hacks; toon/ink/black world outlines; high-poly invisible detail; runtime LLM world composition; diorama-only world design.

Required across final game: readable planes/silhouettes/chunky geometry/selective bevels/cohesive warm palette/handcrafted irregularity/low-frequency detail/asymmetry/stylized architecture/faceted terrain-rocks/simplified vegetation/warm sun+cool fill/AO grounding/soft shadows/atmosphere/emissives/polygonal water/coherent roughness/consistent proportions/gameplay-camera readability.

# 16. Rendering Pipeline Target

Conceptual runtime:
`optimized GLBs → Three.js/TSL materials → vertex colors → directional + environment light → baked light/AO where appropriate → dynamic contact/shadows → stylized water/foliage shaders → fog/atmosphere → subtle justified bloom → controlled grade → filmic tone map → final`.

Post-processing remains subtle; never substitute bloom/vignette/chromatic aberration/sharpening/saturation for geometry/material/lighting quality.

# 17. Gold-Standard Reference Slices

Before full-world production, validate in order:
1. **Bridge + river:** terrain, stone, wood, vegetation, water, lighting, atmosphere.
2. **Farm:** building kit, crops, fences, paths, trees, clusters.
3. **Harbor:** docks, boats, ropes, crates, ocean water, coastal architecture.
4. **Coast/lighthouse:** cliffs, rocks, foam, atmospheric perspective, sunset.

Do not mass-produce assets until these meet the art target. In the Roadmap this is P0.75, immediately after the P0.5 renderer/material foundation and before broad P1 world art production. The current four slices in `tests/visual/reference/approved-baselines.json` are human-approved, so world expansion reuses those generators/palettes/materials/rendering rules without another candidate-selection pass. P14 is final coverage/polish, not the first real art pass.

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
- [ ] no realism/style drift

# 19. Definition of Done — Environment/POI

- [ ] major anchor
- [ ] readable paths/traversal
- [ ] foreground/midground/background separation
- [ ] authored prop placement + clustered vegetation + broken repetition
- [ ] global lighting/AO grounding
- [ ] approved water where applicable
- [ ] performance budget met
- [ ] generated asset budget report has no hard violations
- [ ] strict asset-quality gate passes for production/gold-slice assets
- [ ] screenshot benchmark captured only for release/gold-slice acceptance
- [ ] integrated game is ready for human review
- [ ] visual regression passes or approved
- [ ] no prohibited drift

# 20. Final Technical Direction

Default unless `01`/human explicitly supersedes:
```text
CLIENT: TypeScript, Vite, Three.js/WebGL2 (+ WebGPU/TSL when justified),
InstancedMesh/BatchedMesh, GLTFLoader, MeshoptDecoder, optional KTX2Loader when implemented, Rapier,
optional Miniplex/bitECS, React DOM, Zustand

ART: catalog/schema + Blender Python family generators; Geometry Nodes/UV/bakes only when deliberately added; semantic COLOR_0 + GLB export
OPTIMIZATION: implemented gltf-transform + Meshopt; KTX2/BasisU when introduced for a concrete texture path
WORLD: validated JSON/TS schemas + seeded generation + chunk streaming + prefabs + biomes/POIs + authored overrides
QA: AJV schema checks + Blender validation + Khronos glTF validation + semantic determinism + Vitest + Playwright candidates + human style review
```

Highest-priority rule: preserve the approved visual identity unless doing so makes the game unacceptably slow, unstable, or unmaintainable. Target is not realism; it is one coherent skilled-art-team look across the whole game.
