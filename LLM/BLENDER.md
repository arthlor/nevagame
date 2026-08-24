# BLENDER.md
## Neva — Autonomous Blender Production Rules for LLM Agents

> **Role:** Operational source of truth for any AI agent that creates, edits, exports, validates, or integrates 3D art through Blender.
>
> **Goal:** The human acts as **art director**. Agents operate Blender, generate reusable assets and systems, export optimized GLBs, integrate them into Three.js, capture gameplay screenshots, and iterate until the visual gate passes.
>
> **Important:** Blender is a production tool, not the final authority. Visual direction comes from the Art Bible. Gameplay truth remains in the simulation. Three.js remains the runtime renderer.

---

# 0. Mandatory Read Order

Before any Blender/art-generation task, read these repository files **to the end**:

1. `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md`
2. `LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md`
3. `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md`
4. `LLM/LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md`
5. `LLM/ARCHEAGE_FARMING_SYSTEM.md` when farming-related
6. `LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md`
7. this `BLENDER.md`
8. `tools/blender/README.md`
9. `assets/specs/asset-catalog.schema.json`, `assets/specs/asset-catalog.json`, `art/palettes/neva.palette.json`, and `tools/blender/asset_budgets.json`
10. relevant generator modules, runtime catalog/loader/scene code, tests, reports, and current task

If guidance conflicts:

1. human's latest explicit instruction
2. `01_GAME_FOUNDATIONS_ARCHITECTURE.md`
3. `02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md`
4. `04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md`
5. `LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md`
6. this file
7. machine-readable schema/catalog/palette/budget files for the fields they own
8. `tools/blender/README.md` and existing implementation
9. agent assumption

Do not proceed from memory when the source files are available.

---

# 1. Human vs Agent Responsibility

## Human

The human should primarily:

- approve or reject visual direction;
- provide reference images;
- choose between strong alternatives;
- identify aesthetic problems;
- prioritize areas of the game;
- occasionally inspect a Blender file if desired.

The human should **not be required** to:

- model ordinary assets manually;
- manually export every GLB;
- build LODs by hand;
- create dozens of prop variants;
- manually wire repetitive materials;
- manually optimize every mesh;
- manually place every vertex.

## Agent

Agents are expected to:

- create/update the schema-validated asset catalog;
- write/reuse registered Blender Python family generators;
- create/reuse Geometry Nodes systems only when a current asset family benefits;
- run Blender headlessly;
- generate source `.blend` files only when a deliberately retained authoring artifact is useful; generated GLB remains the runtime format;
- generate approved mesh/material variants;
- create collision proxies;
- export GLB/glTF 2.0;
- run validators and optimizers;
- integrate assets into Three.js;
- create benchmark scenes;
- capture screenshots;
- compare results against the visual target;
- revise generator parameters or geometry;
- report limitations instead of hiding them.

The default workflow is **automation-first, art-directed, reusable, deterministic**.

---

# 2. Required Local Blender Setup

Blender must be installed on the machine used by the agent and callable from the terminal.

On macOS, this path is commonly valid:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --version
```

Preferred project setup is to make `blender` callable directly:

```bash
blender --version
```

If `blender` is not on `PATH`, configure a project-local environment variable or script. Do not hardcode a developer-specific absolute path throughout the codebase.

Example:

```bash
export BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender"
"$BLENDER_BIN" --version
```

For normal automation, call the repository CLI rather than Blender directly. `tools/blender/cli.mjs` resolves Blender in this order: `BLENDER_BIN`, `blender` on `PATH`, then the standard macOS application path. It invokes `bootstrap.py` in background mode with the catalog, selected asset IDs, staging output and report paths.

```bash
npm run art:generate -- --asset tree_oak_a
```

Agents MUST verify Blender availability before promising Blender-generated output.

---

# 3. Repository Structure

Implemented structure:

```text
/
├─ art/palettes/neva.palette.json
├─ assets/specs/
│  ├─ asset-catalog.json
│  └─ asset-catalog.schema.json
├─ tools/blender/
│  ├─ README.md
│  ├─ cli.mjs / cli.d.mts
│  ├─ bootstrap.py / preview.py / asset_budgets.json
│  ├─ generators/registry.py + family modules
│  ├─ common/authored.py (shared deterministic construction grammar)
│  ├─ common/geometry.py + materials.py + pipeline.py
│  └─ generators/generate_all.py + run_generators.js (compatibility only)
├─ generated/
│  ├─ .staging/run-*/
│  ├─ glb/
│  ├─ previews/
│  └─ reports/asset-manifest.json + asset-report.md + asset_budget_report.json
├─ public/assets/models/      optimized runtime GLBs + public manifest
├─ src/render/assets/         runtime catalog adapter
├─ src/render/loaders/        Meshopt-aware GLB loader/cache
├─ src/render/scene/          placement + static batching
└─ tests/
   ├─ unit/artPipeline.test.ts
   ├─ e2e/art-pipeline.spec.ts
   └─ visual/candidates/
```

Do not mix Blender automation code into gameplay simulation folders. Do not create parallel per-family spec trees, palettes or exporters. Do not place final runtime truth inside `.blend` files.

---

# 4. Canonical Production Flow

Every generated asset follows this implemented pipeline:

```text
TASK
  ↓
READ SOURCES
  ↓
UPDATE SCHEMA/CATALOG/PALETTE IF REQUIRED
  ↓
REUSE OR EXTEND REGISTERED FAMILY GENERATOR
  ↓
COMPOSE SHARED AUTHORED CONSTRUCTION HELPERS WHERE APPROPRIATE
  ↓
CLI CREATES UNIQUE STAGING RUN
  ↓
HEADLESS BLENDER GENERATION + SCENE VALIDATION
  ↓
RAW GLB + BLENDER REPORT
  ↓
KHRONOS VALIDATION
  ↓
DEDUPE → PRUNE → WELD → MESHOPT
  ↓
KHRONOS + BUDGET + NODE REVALIDATION
  ↓
ATOMIC PUBLISH OR STRICT REJECTION
  ↓
RUNTIME LOAD/BATCH + FIXED CAMERA CANDIDATES
  ↓
HUMAN VISUAL APPROVAL
```

Normal generation permits a valid below-target work-in-progress and records the gap. Strict generation rejects every below-target candidate before publication. Do not jump from a vague prompt to a one-off mesh or direct public copy.

---

# 5. Asset Spec First

Before generating an asset, create or update its entry in `assets/specs/asset-catalog.json`. That single JSON document is validated by `asset-catalog.schema.json`; do not create parallel YAML, filename or budget files.

Implemented entry shape:

```json
{
  "id": "house_farmhouse_a",
  "file": "house_farmhouse_a.glb",
  "family": "architecture",
  "generator": "farmhouse",
  "seed": 201,
  "dimensions": { "width": 7.4, "depth": 6.0, "height": 6.1 },
  "palette": [
    "stone_warm_01",
    "plaster_cream_01",
    "wood_honey_01",
    "wood_dark_01",
    "roof_terracotta_01"
  ],
  "budget": {
    "trianglesMin": 1500,
    "trianglesTarget": 12000,
    "trianglesMax": 18000,
    "materialsMax": 6
  },
  "pivot": "ground_center",
  "collision": "compound",
  "instancing": false,
  "lod": "hero",
  "rootNode": "house_farmhouse_a_root",
  "requiredNodes": ["house_farmhouse_a_root", "COL_house_farmhouse_a"],
  "readDistanceMeters": 30,
  "parameters": { "width": 6.6, "depth": 4.8, "wallHeight": 3.1, "roofPitchDeg": 34 }
}
```

The schema is closed. If a genuinely new contract field is required, update the schema and every consumer deliberately. The catalog entry is the contract; Blender Python implements it and the runtime catalog consumes it.

---

# 6. Generator-First and Shared Authored-Construction Rule

Prefer parameterized generators for asset families. The implemented registry currently resolves:

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

`tools/blender/generators/registry.py` is the only generator-name dispatch table. Add a stable registered name in the correct family module; do not add a new CLI or direct exporter for one asset. For example, do not manually create 20 unrelated trees. Same catalog seed + parameters + generator code MUST reproduce the same semantic output.

`tools/blender/common/authored.py` is a reusable construction layer below family generators, not another generator family or a path for imported/manual asset files. Its current helpers construct staggered perimeter and cylindrical masonry, broad shingle rows, individually readable plank fields, functional lattice/net geometry, segmented rope lines, arch rings, root flares and fasteners. Architecture, prop and boat modules compose these helpers to share deliberate mid-scale geometry without duplicating local loops.

Rules for this layer:

- keep catalog identity, budgets, palette, required nodes, dimensions, collision and public generator names outside `authored.py`;
- pass approved palette tokens and the family generator's root into helpers rather than creating local materials or export roots;
- seed every bounded irregularity from the catalog seed; helpers without variation must remain deterministic by construction;
- expose artist-tunable counts or proportions through the owning asset's catalog `parameters`, never hidden per-asset constants in the shared helper;
- validate positive counts before division/range use when adding a helper or schema field;
- extend a helper only when at least two assets share a real construction grammar; otherwise keep asset-specific composition in its family module.

The catalog schema intentionally permits generator-specific parameter objects, so `npm run art:validate` cannot prove that every generator-required key exists. After a family module or `common/authored.py` change, generate every impacted catalog asset with `--no-publish`; a missing-key failure is an incomplete integration even when catalog/schema validation passes.

---

# 7. Procedural Does Not Mean Random

Procedural generation must be:

- deterministic;
- constrained;
- palette-controlled;
- visually authored;
- easy to override;
- compatible with the Art Bible.

Allowed controlled variation:

- scale ±5–10%;
- lean;
- canopy arrangement;
- plank offsets;
- stone widths;
- roof irregularity;
- rotation;
- palette-index selection;
- small deterministic value shifts.

Forbidden:

- uncontrolled random RGB;
- arbitrary mesh deformation;
- random detail spam;
- random material assignment;
- random texture selection;
- procedural noise used simply to make things "look detailed."

Handcrafted irregularity is the goal, not chaos.

---

# 8. Geometry Rules

The reference aesthetic requires authored low-poly geometry, not primitive-only programmer art.

Use:

- wedges;
- trapezoids;
- softened boxes;
- low-sided cylinders;
- low-sided irregular forms;
- chunky beams;
- broad plane changes;
- angular rocks;
- clustered faceted foliage;
- low-segment curved silhouettes.

Avoid:

- high-poly modeling followed by decimation;
- subdivision-heavy workflows;
- perfectly smooth spheres;
- high-segment cylinders everywhere;
- accidental tiny triangulation;
- uniformly rounded corners;
- microscopic geometry that disappears at gameplay distance.

Modeling priority:

```text
silhouette
→ primary mass
→ secondary structure
→ readable facet language
→ sparse tertiary detail
```

If the silhouette is weak, do not add more tiny detail.

---

# 9. Bevel and Shading Rules

Typical important edge bevel/chamfer:

```text
2–5 cm world-space equivalent
```

Usually:

```text
1 bevel segment
```

Occasionally 2 segments for hero assets when justified.

Flat/faceted shading:

- terrain;
- cliffs;
- rocks;
- mountains;
- foliage clusters;
- many props;
- clouds;
- stylized water.

Selective smoothing:

- characters;
- boat hull curves;
- barrels;
- ropes;
- wheels;
- rounded tools;
- fish where silhouette benefits.

Hard edges:

- planks;
- roofs;
- doors;
- stone blocks;
- crates;
- docks;
- fences;
- beams;
- stairs.

Never use default smoothing without deliberate review.

---

# 10. World Scale

Canonical scale:

```text
1 Blender unit = 1 meter
```

Apply transforms before export.

Typical modular standards:

```text
Building modules: 2m / 4m / 8m
Fence module:    2m
Path module:     2m
Terrain chunk:   32×32m
Large chunk:     128×128m
```

Stylized readability may exaggerate:

```text
doors       +5–10%
windows     +10–20%
roof depth  +15%
timber      +20%
small props +10–25%
rope/nets   thicker than realistic
```

Do not destroy believable scale to chase cuteness.

---

# 11. Materials

`art/palettes/neva.palette.json` is the single material-token data owner. `tools/blender/common/materials.py` and the runtime `PaletteTokens`/`PaletteMaterials` layer consume it; generators must not maintain local hex or roughness tables.

Representative current tokens:

```text
wood_honey_01 / wood_warm_01 / wood_dark_01 / wood_weathered_01
plaster_cream_01 / plaster_warm_01
stone_golden_01 / stone_warm_01 / stone_cool_01 / rock_coastal_dark_01
foliage_sage_01 / foliage_olive_01 / foliage_shadow_01 / soil_warm_01
roof_terracotta_01 / roof_deep_red_01 / roof_warm_orange_01 / roof_turf_01
metal_dark_01 / metal_brass_01 / canvas_cream_01
foam_warm_01 / fish_belly_01 / emissive_window_01 / emissive_lantern_01
```

Variation should mainly come from:

- geometry;
- vertex colors;
- palette tokens;
- roughness;
- controlled AO;
- deterministic masks;
- lighting.

Generated mesh color attributes contain semantic token color multiplied by bounded plane/height value modulation. The Blender node graph reads the `Color` layer directly into Base Color and supported emission, preserving `COLOR_0` through GLB. Do not scatter raw hex colors throughout Blender scripts or add a second palette list to a generator.

---

# 12. Vertex Colors

Vertex colors are first-class.

Use them to create:

- top-vs-side value variation;
- subtle warm/cool shifts;
- AO-like contact darkening;
- height gradients;
- age/weathering zones;
- deterministic color-family variation;
- foliage tonal layering.

Example rock logic:

```text
top-facing planes      = slightly lighter/warmer
side-facing planes     = mid value
down-facing/crevice    = darker
sun-facing planes      = subtly warmer
```

No uncontrolled RGB noise.

---

# 13. Texture Rules

Texture resolution is not the primary way this project achieves quality.

Default hierarchy:

```text
geometry
→ vertex/base color
→ roughness
→ AO
→ optional low-frequency texture
→ hero authored texture only when justified
```

Typical maximums:

```text
tiny asset      128–256
normal prop     256–512
hero asset      512–1024
rare shared atlas 2048
```

The architecture may technically permit larger textures, but the Art Bible's lower-frequency guidance wins for normal production.

Avoid:

- photogrammetry;
- photo bark;
- photo rocks;
- scanned grass;
- dense scratches;
- 4K textures on ordinary props;
- micro-normal noise;
- realistic grunge layers.

---

# 14. No Toon Outlines

Normal world rendering must not use:

- black contour lines;
- inverted-hull outlines;
- Sobel edge outlines;
- ink strokes;
- comic edge tracing;
- permanent object outlines.

The visual style derives shape separation from:

- geometry;
- lighting;
- AO;
- shadow;
- palette;
- material response.

Temporary gameplay highlights are allowed only when required for interaction clarity.

---

# 15. Architecture Language

Architecture should feel:

```text
coastal / northern-European influence
+ storybook simplification
+ working fishing settlement
+ warm productive farm homestead
```

Common language:

- warm timber frames;
- cream/warm plaster;
- stone foundations;
- thick stylized roofs;
- practical windows;
- weathered doors;
- terracotta, turf, shingle, or dark plank roofs;
- strong silhouettes;
- controlled asymmetry.

Avoid:

- generic fantasy medieval kitbash;
- razor-thin walls/roofs;
- huge ornate castles;
- photoreal historic reconstruction;
- random fantasy ornament.

---

# 16. Vegetation

Trees should be generated as structured families.

Typical tree grammar:

```text
5–8 sided tapered trunk
2–4 primary branches
3–7 intersecting faceted canopy clusters
2–4 coordinated foliage tones
slight lean/asymmetry
```

Do not use smooth spheres as tree crowns.

Important species should have at least 3 silhouette variants, preferably 5.

Grass should be:

- sparse;
- chunky;
- broad;
- instanced;
- palette-controlled.

Avoid hair-like realistic grass.

---

# 17. Rocks and Cliffs

Rocks must emphasize:

- large planes;
- angular silhouettes;
- readable top/side values;
- low texture noise;
- controlled material response.

Families should include:

```text
field stone
warm inland boulder
coastal dark rock
pale shoreline rock
masonry stone
```

Coastal rock should strongly support teal water + white foam contrast.

---

# 18. Water-Adjacent Assets

Blender owns static water-adjacent geometry such as:

- coastlines;
- cliffs;
- shoreline rocks;
- docks;
- pilings;
- ladders;
- stairs;
- sea walls;
- static foam-support meshes where useful.

Three.js/runtime shaders own dynamic water behavior.

Do not bake a photoreal ocean into Blender.

---

# 19. Farming Assets

Crop stages must be visually distinct:

```text
seeded
sprout
growing
mature
overripe
withered
```

Crops should use:

- chunky leaves;
- strong silhouette;
- slightly exaggerated edible produce;
- low-poly faceting;
- instancing-compatible meshes.

Avoid realistic alpha-card crop fields.

Farm props should be produced only when they support gameplay or strong world storytelling.

Priority families:

- crates;
- baskets;
- watering cans;
- buckets;
- wheelbarrows;
- sacks;
- seed chest;
- compost;
- small mill;
- irrigation;
- water barrel;
- hay bales;
- scarecrow.

---

# 20. Fishing and Harbor Assets

Priority harbor vocabulary:

- docks;
- nets;
- ropes;
- floats;
- buoys;
- fish crates;
- ice crates;
- racks;
- barrels;
- scales;
- hooks;
- chum containers;
- bait boxes;
- coolers;
- cleats;
- oars;
- working boats.

The harbor must feel functional, not decorated randomly.

Prop placement is authored in world data; Blender primarily creates reusable prefabs and clusters.

---

# 21. Boats

Boats are progression silhouettes and must visually communicate capability.

## Rowboat

Target:

```text
2.5k–6k triangles
2 benches
oars
small storage
worn timber
simple working silhouette
```

## Fishing Skiff

Target:

```text
6k–16k triangles
visible hold
external cargo hooks
rope/buoys/crates
ice/storage cues
navigation lamp
stronger working silhouette
```

Cargo points must be exported using stable node names where required.

Example:

```text
boat_skiff_root
boat_skiff_cargo_01
boat_skiff_cargo_02
boat_skiff_hook_left
boat_skiff_hook_right
```

---

# 22. Characters

Characters must not look like a different game.

Target:

- stylized human proportions;
- slightly enlarged hands/head for gameplay readability;
- simple planar face structure;
- no extreme chibi;
- practical clothing;
- low-frequency materials;
- no realistic pores/fabric scans;
- controlled faceting;
- grounded animation.

Before mass-producing characters, define:

- head/body ratio;
- face topology standard;
- eye treatment;
- hair geometry grammar;
- hand/foot exaggeration;
- clothing silhouette families;
- rig standard;
- material palette;
- triangle targets;
- LOD policy.

If these are not defined, use placeholders rather than improvising final character art.

---

# 23. Naming

Catalog IDs and filenames use lowercase snake case.

Examples from the implemented catalog:

```text
house_farmhouse_a / house_farmhouse_a.glb
dock_straight_a / dock_straight_a.glb
bridge_stone_a / bridge_stone_a.glb
prop_crate_wood_a / prop_crate_wood_a.glb
tree_oak_a / tree_oak_a.glb
crop_wheat_mature / crop_wheat_mature.glb
boat_skiff_a / boat_skiff_a.glb
fish_trout_a / fish_trout_a.glb
char_player_a / char_player_a.glb
```

Root and semantic nodes follow the names declared by the catalog, for example `house_farmhouse_a_root`, `boat_skiff_root`, `boat_skiff_cargo_01`, and `windmill_rotor`. Collision objects retain an uppercase `COL_` semantic prefix:

```text
COL_house_farmhouse_a
COL_dock_straight_a
COL_bridge_stone_a
```

Do not rely on anonymous Blender-generated names such as:

```text
Cube.001
Cylinder.013
Material.009
```

in shipping output.

---

# 24. Pivot Rules

Asset-level catalog pivots use exactly `ground_center`, `center`, or `buoyancy`:

```text
building/tree/crop/grounded prop  ground_center
boat                              buoyancy
fish/cloud/free object            center
```

Doors, wheels and other semantic subnodes may still use hinge/axle-local pivots. The asset-level pivot must use the schema vocabulary and support runtime placement. `common/pipeline.py` validates ground contact for `ground_center` assets.

---

# 25. Collision

Render mesh is not collision mesh.

The catalog collision field is one of `none`, `box`, or `compound`. When a proxy is required, declare its exact node name in `requiredNodes`; the Blender and optimized-GLB validators both enforce its presence.

Use simple collision proxies for:

- buildings;
- docks;
- bridges;
- large rocks;
- boats;
- major gameplay props.

Do not generate detailed rigid bodies for:

- grass;
- flowers;
- crops;
- rope detail;
- tiny stones;
- decorative clutter.

Collision meshes should be clearly named and exported according to runtime convention.

---

# 26. Export Requirements

Shipping runtime format:

```text
GLB / glTF 2.0
```

Never load runtime `.blend`, `.fbx`, or `.obj`.

Before export:

- apply transforms;
- confirm meter scale;
- confirm Y-up export;
- remove unused materials;
- remove orphan data;
- verify names;
- verify pivots;
- verify normals;
- verify shading;
- verify material count;
- verify collision proxies;
- verify optional animation/rig;
- verify no accidental hidden geometry.

`bootstrap.py` exports raw GLBs only into the CLI-provided run staging directory. Generators must never write directly to `generated/glb` or `public/assets/models`. The CLI owns optimization and publication.

---

# 27. Headless Generation Commands

Single asset:

```bash
npm run art:generate -- --asset house_farmhouse_a
```

Family candidate without publication:

```bash
npm run art:generate -- --family vegetation --no-publish
```

Full catalog and production gate:

```bash
npm run art:generate -- --all
npm run art:generate:strict -- --all
```

Published validation, semantic determinism, catalog preview and fixed gameplay candidates:

```bash
npm run art:validate -- --all
npm run art:determinism -- --asset tree_oak_a
npm run art:preview -- --all
npm run art:benchmark
```

No selector and `--all` both select the full catalog. Repeat `--asset` and/or `--family` to select their union. `--no-publish` affects only `generate`; `--strict` is supported only by `generate`. Commands return non-zero on hard validation failure, and strict generation also returns non-zero for any below-target asset.

`tools/blender/generators/generate_all.py` and `tools/blender/run_generators.js` are compatibility shims. New documentation, automation and agent work must use the npm/CLI commands above.

Report semantics:

```text
generated/reports/asset-manifest.json          last atomically published generated set
public/assets/models/asset-manifest.json        runtime-public parity manifest
generated/reports/asset-report.md               human-readable published report
generated/reports/asset_budget_report.json      latest generate candidate, including rejected strict runs
generated/previews/asset-review-yard.png        published-catalog review candidate
tests/visual/candidates/*-candidate.png          fixed gameplay-camera review candidates
```

A successful strict candidate is publishable; a failed strict report is visual-quality debt, not a broken published manifest. Partial publishes merge selected results and preserve other catalog assets. Only a full-catalog publish may remove stale files owned by the previous manifest. Determinism and preview commands must not overwrite the canonical quality report.

---

# 28. Post-Export Optimization

The implemented baseline is:

```text
raw Khronos validation
→ glTF Transform dedup
→ prune while retaining leaves/attributes/extras
→ weld
→ Meshopt compression
→ optimized Khronos validation
→ required-node + triangle/material budget revalidation
→ SHA-256/semantic hashes
```

KTX2/BasisU, texture resizing and explicit LOD artifacts remain permitted extensions when a concrete texture/LOD path is implemented; they are not implied by the current command succeeding.

Do not optimize blindly.

Optimization priority:

```text
remove invisible geometry
→ deduplicate materials
→ reduce excessive texture resolution
→ add distant LOD
→ remove invisible micro-detail
```

Do not sacrifice hero silhouette first.

---

# 29. Runtime Integration

After GLB export:

1. keep identity/filename/runtime metadata in `assets/specs/asset-catalog.json`;
2. add/update the typed `ASSET_IDS` adapter only when required and keep its set exactly synchronized with the JSON catalog;
3. load through `AssetLoader.ts`, which registers `MeshoptDecoder`, caches the source scene and returns clones;
4. bind declared semantic/interaction/collision nodes where relevant;
5. verify scale, culling, shadows, LOD and catalog `readDistanceMeters` behavior;
6. batch compatible static prefabs through the scene's `THREE.BatchedMesh` path; keep skinned/morph/dynamic meshes separate;
7. capture the catalog review yard and actual gameplay-camera candidates.

Never approve an asset only from Blender viewport inspection.

---

# 30. Visual Render Baseline

Agents must use the project-wide approved renderer configuration.

Do not create local lighting hacks per asset or zone.

The canonical runtime configuration should centrally own:

```text
color space
tone mapping
exposure

sun:
  color
  intensity
  elevation
  azimuth

environment / hemisphere fill

shadow:
  type
  bias
  resolution
  camera extent

AO/contact:
  strength
  radius

fog/atmosphere:
  color
  near
  far

bloom:
  threshold
  intensity

water:
  shallow color
  mid color
  deep color
  wave layers
  wave speed
  wave amplitude
  Fresnel
  foam width
```

Once an approved gold-standard scene establishes the baseline, do not change these globally for one problem asset without explicit review.

---

# 31. Gold-Standard Slices

Before mass production, validate these in order:

1. **Bridge + river**
   - terrain
   - stone
   - wood
   - vegetation
   - water
   - lighting
   - atmosphere

2. **Starter farm**
   - farmhouse
   - crops
   - fence
   - path
   - tree
   - props

3. **Harbor**
   - dock
   - boats
   - rope
   - crates
   - ocean water
   - coastal architecture

4. **Coast / lighthouse**
   - cliffs
   - rocks
   - foam
   - atmospheric perspective
   - sunset handling

Do not mass-produce asset families until these scenes pass visual review.

---

# 32. Reference Images Are Graphics-Only

The supplied reference images define:

- faceting;
- geometry language;
- proportions;
- material response;
- palette;
- lighting;
- AO;
- vegetation style;
- water style;
- foam;
- roughness;
- detail density;
- overall stylization quality.

They do **not** require copying:

- diorama/tabletop layout;
- camera angle;
- scene border;
- depth of field;
- tilt-shift;
- exact object placement;
- exact landscape composition.

The game remains a continuous playable world.

---

# 33. Visual Regression vs Style Match

These are two different QA systems.

## A. Regression QA

Compare:

```text
approved game screenshot
vs
new game screenshot
```

Use when camera/world state are fixed.

Useful tools:

- pixel diff;
- SSIM;
- LPIPS;
- histogram/luminance;
- deterministic screenshots.

Purpose:

> Did today's change accidentally damage an approved scene?

## B. Style QA

Compare:

```text
game screenshot
vs
external aesthetic references
```

Do **not** use pixel matching.

Review:

- silhouette language;
- facet scale;
- proportions;
- bevel language;
- palette;
- saturation;
- roughness;
- material response;
- lighting;
- shadow softness;
- AO;
- water;
- vegetation;
- atmosphere;
- detail density;
- realism drift;
- plastic/toy drift.

Purpose:

> Does this scene belong to the same aesthetic family as the references?

---

# 34. Visual Approval Gate

Every hero asset or important scene should be reviewed from:

1. gameplay camera;
2. opposite direction;
3. medium distance;
4. close material check;
5. relevant weather/night state where applicable.

Suggested scoring categories:

```text
silhouette
facet language
proportion
material
palette
lighting
AO/grounding
water/foliage
atmosphere
gameplay readability
consistency
distinctiveness
repetition control
performance
reference-style match
```

Approval target:

```text
overall >= 8/10
no major category < 7/10
reference-style match >= 8/10
```

Do not approve one flattering beauty render.

---

# 35. Automatic Rejection

Reject assets/scenes showing:

- raw asset-store appearance;
- primitive-only construction;
- excessive smoothness;
- accidental tiny triangulation;
- photoreal textures;
- plastic gloss;
- black toon outlines;
- scale inconsistency;
- too many materials;
- noisy high-frequency texture detail;
- identical repeated trees;
- spherical foliage;
- generic blue-glass water;
- photoreal ocean;
- copied diorama layout;
- weak silhouette hidden by clutter;
- performance-budget failure;
- dependence on DOF or heavy bloom.

---

# 36. Anti-AI-Slop Rule

Do not fix a weak scene by adding:

- more barrels;
- more crates;
- more flowers;
- more signs;
- more lanterns;
- more fences;
- more particles;
- more ornaments.

First improve:

```text
silhouette
spacing
proportion
shape hierarchy
material separation
lighting
landmark
negative space
```

More detail is not automatically better art.

---

# 37. Performance

Typical gameplay scene target:

```text
60 FPS preferred
30 FPS hard minimum
```

Typical visible triangles:

```text
High:   250k–900k target; 1.5M hard maximum
Medium: 150k–600k target; 900k hard maximum
Low:     80k–350k target; 600k hard maximum
```

Draw calls:

```text
High:   <=220 preferred; 300 hard maximum
Medium: <=200 preferred; 280 hard maximum
Low:    <=180 preferred; 240 hard maximum
```

The upper bounds are ceilings, not targets to fill. The lower targets trigger a visual-completeness review; they do not justify blind subdivision. `tools/blender/asset_budgets.json` owns scene envelopes; `assets/specs/asset-catalog.json` owns asset budgets.

Repeated static objects appearing around >10 times should be evaluated for batching/instancing. The current placed-prefab path uses `THREE.BatchedMesh` for compatible material/geometry signatures; use `InstancedMesh` for uniform high-count dynamic families when it is the better fit.

Good candidates:

- crops;
- grass;
- flowers;
- rocks;
- fences;
- trees;
- reeds;
- repeated dock pieces;
- architecture modules.

---

# 38. Triangle Guidance

Typical targets:

```text
tiny prop            100–1,200
normal prop          300–2,500
large prop           1,000–6,000

crop clump           120–700
tree                 600–3,000

support building     2,500–10,000
hero building        6,000–18,000

rowboat              2,500–6,000
fishing skiff        6,000–16,000

fish                 500–2,500
hero/legendary fish  up to ~4,000 by explicit override
```

Silhouette quality outranks arbitrary triangle minimization. Production floors, targets, hard maxima, material limits, LOD, dimensions, pivots, and per-asset generator assignments live in `assets/specs/asset-catalog.json`.

---

# 39. Material Budgets

Suggested limits:

```text
small prop       1 material
normal prop      1–2
support building max 4
hero/landmark    max 6
rowboat          max 4
skiff            max 5
character        max 6
```

Shared materials strongly preferred.

Run `npm run art:generate` for catalog/schema/production-floor validation plus a quality-gap report. Run `npm run art:generate:strict` before accepting a production asset or gold slice; it additionally rejects every asset below its declared quality target.

---

# 40. Agent Task Contract

Before starting a Blender task, record:

```text
Asset / zone:
Gameplay purpose:
Source-of-truth files read:
Existing generator to reuse:
New generator required:
Shared authored-construction helper to reuse/extend:
Catalog entry / schema impact:
New or changed catalog parameter keys:
Generator registry name + family module:
Triangle budget:
Material budget:
Texture budget:
LOD:
Collision:
Instancing:
Animation:
Runtime integration point:
Visual benchmark scene:
Reference aesthetic cues:
Performance risks:
```

Then implement.

---

# 41. Example Agent Instruction — New Asset

Use this pattern:

```text
Read AGENTS.md, BLENDER.md, the Art Bible, and the Art Pipeline to the end.

Create or improve `house_farmhouse_a`.

Do not manually build a one-off asset unless reuse is impossible.
Update the single JSON catalog entry and schema only if a genuinely new field is required.
Reuse or extend the registered `farmhouse` generator in `architecture.py`.
Reuse the shared masonry/shingle/plank systems in `common/authored.py` where they fit; keep farmhouse-specific composition in `architecture.py`.
Generate through `npm run art:generate -- --asset house_farmhouse_a --no-publish` while iterating.
Use approved palette/material families.
Use deliberate low-poly geometry, selective 1-segment bevels, controlled asymmetry, and gameplay-distance silhouette.
Let the CLI stage, export, validate, optimize and report it.
Run semantic determinism and strict generation before production acceptance.
Integrate it into the Three.js gold-standard farm scene.
Render the catalog preview and capture the fixed gameplay-camera candidate.
Run visual QA against the approved reference aesthetic.
Iterate until the visual gate passes.
Report changed files, generated outputs, commands run, performance impact, screenshots, and known limitations.
```

---

# 42. Example Agent Instruction — Generator

```text
Build a reusable coastal rock generator rather than individual rocks.

Requirements:
- deterministic seed;
- 3–6 silhouette families;
- strong planar facets;
- top/side value control via vertex colors;
- coastal-dark and inland-warm palette modes;
- optional controlled scale/asymmetry;
- collision-proxy option for large rocks;
- instancing-friendly output for small/medium rocks;
- stable registry name plus catalog parameters;
- CLI-managed GLB export/optimization/validation;
- semantic determinism check;
- benchmark scene with teal water and white foam;
- gameplay-camera visual validation.
```

---

# 43. Example Agent Instruction — Full Gold Slice

```text
Build the bridge + river gold-standard visual slice.

The goal is to lock the game's final visual language before mass asset production.

Required:
- bridge;
- river;
- faceted water;
- foam;
- warm/cool lighting;
- AO/contact grounding;
- terrain;
- rocks;
- trees;
- grass;
- flowers;
- path;
- atmosphere;
- gameplay camera;
- performance measurement.

The external image reference is graphics-only; do not recreate its exact layout, camera, DOF, or diorama presentation.

Do not expand to unrelated assets until this slice passes visual QA.
Require `npm run art:generate:strict`, `npm run art:validate`, `npm run art:benchmark`, and the applicable representative runtime budget test before approval.
```

---

# 44. Common Failure Modes

## Failure: "Low-poly" becomes primitive-looking

Fix:

- strengthen silhouette;
- add authored plane changes;
- use wedges/trapezoids;
- use selective bevels;
- improve proportion;
- reduce reliance on untouched cubes/cylinders.

## Failure: Scene looks plastic

Fix:

- increase appropriate roughness;
- reduce specular dominance;
- improve material differentiation;
- add grounded AO/contact;
- check exposure.

## Failure: Scene looks flat

Fix:

- improve sun angle;
- restore warm key/cool fill separation;
- improve broad AO;
- improve plane orientation;
- add atmospheric depth.

## Failure: Scene looks too realistic

Fix:

- simplify textures;
- remove micro-normal detail;
- simplify geometry;
- increase broad planar language;
- constrain palette.

## Failure: Scene looks childish/toy-like

Fix:

- reduce candy saturation;
- reduce excessive roundness;
- avoid chibi proportions;
- deepen warm/cool balance;
- use more functional detail.

## Failure: Procedural generation looks repetitive

Fix:

- add silhouette families;
- add deterministic asymmetry;
- vary cluster structure;
- vary proportions;
- vary palette index subtly;
- improve authored placement.

Do not just add random noise.

---

# 45. Definition of Done — Blender Asset

An asset is done only when:

- [ ] required source files were read;
- [ ] catalog entry exists and passes the closed JSON schema;
- [ ] generator name resolves through `generators/registry.py` and the correct family module was reused/extended;
- [ ] every parameter read by the family generator or shared `common/authored.py` helper exists in the impacted catalog entry, and every impacted asset completes no-publish generation;
- [ ] shared authored-construction helpers remain deterministic, palette-token driven and free of asset identity/budget/export ownership;
- [ ] deterministic output works;
- [ ] dimensions/scale are correct;
- [ ] silhouette reads at gameplay distance;
- [ ] facet language matches the Art Bible;
- [ ] bevel/smoothing decisions are deliberate;
- [ ] palette/material family is approved;
- [ ] texture budget is respected;
- [ ] pivot is correct;
- [ ] collision is defined where needed;
- [ ] LOD policy is defined where needed;
- [ ] instancing eligibility is defined;
- [ ] raw GLB export and Khronos validation succeed;
- [ ] dedupe/prune/weld/Meshopt output and second Khronos validation succeed;
- [ ] required nodes, bounds, pivot, dimensions, materials and min/target/max status are recorded;
- [ ] normal generation passes; strict generation passes before production/gold-slice acceptance;
- [ ] atomic publish completes and generated/public hashes match;
- [ ] runtime loading succeeds;
- [ ] gameplay-camera screenshot exists;
- [ ] preview/benchmark image is treated as a candidate until human approval;
- [ ] style QA passes;
- [ ] performance impact is acceptable;
- [ ] no prohibited visual drift exists.

---

# 46. Definition of Done — Blender Environment / POI

A scene or POI is done only when:

- [ ] major visual anchor exists;
- [ ] route/traversal remains readable;
- [ ] foreground/midground/background are separated;
- [ ] prop placement is authored rather than confetti;
- [ ] repetition is broken deliberately;
- [ ] vegetation forms readable clusters;
- [ ] global lighting is used;
- [ ] AO/contact grounding works;
- [ ] approved water system is used where needed;
- [ ] screenshot benchmark exists;
- [ ] regression QA passes;
- [ ] style QA passes;
- [ ] browser performance budget passes;
- [ ] no gameplay-blocking clutter exists.

---

# 47. Final Rule

The target is not:

> "an asset generated by AI"

The target is:

> "an asset that looks as if it came from one coherent, skilled art team."

Agents operate Blender.

The human directs the art.

The Art Bible defines the visual language.

The runtime screenshot is the final judge.
