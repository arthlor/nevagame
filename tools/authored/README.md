# Authored assets (Three.js generators)

This is Neva's **main asset generation system**. Catalog assets are authored as TypeScript
generators on a shared Three.js kit, built in Node by the art pipeline (`tools/art/cli.mjs`), and
published through the same validation, optimisation, cache, manifest and determinism gates as every
other catalog GLB.

The only other producer is the **authored GLB** (`generator: "authored_glb"`): a committed source
GLB such as a Tripo generation, an adapted donor model, or one of the canvas-textured buildings below
(`LLM/ASSET_PRODUCTION.md` §3.2). The Blender producer was retired: families it built that are not yet
ported are **frozen** (`tools/art/legacy-generators.json`). Their published GLBs are validated but
never rebuilt; port the family here to change one.

```bash
npm run art:generate -- --asset fauna_dog_a       # build, validate, optimise, publish
npm run art:determinism -- --asset fauna_dog_a    # build twice, compare semantic hashes
npm run art:validate -- --all                     # revalidate every published asset
```

Live preview while authoring: open
`http://localhost:3000/__neva_art_yard?asset=fauna_dog_a&live=1`. With `live=1` the Art Yard builds
authored assets in the page from their generator instead of loading the published GLB, through the
same `prepareAssetTemplate` the runtime uses, and Vite reloads it whenever you save a kit or generator
file. The source badge reads `live generator`.

## Layout

```text
tools/authored/
  kit/                   the shared construction kit (import from "../../kit")
    surface.ts           SurfaceBuilder: lofts, boxes, ellipsoids, closed cloth panels
    palette.ts           palette-token materials and linear COLOR_0 colours
    rig.ts               identity-rest bones, the creature scaffold, pivots, skin binding
    clips.ts             Euler-keyed tracks, looping gait tracks, posing solvers
    lod.ts               authored LOD levels (rebuild per level at lower detail, no decimation)
    markers.ts           COL_ collision markers, palm-frame grip markers, typed point markers
    random.ts            seeded RNG (never Math.random)
    types.ts             CatalogAssetSpec, GeneratorContext, AuthoredModel
  generators/
    registry.ts          generator name -> factory
    contracts.json       generator name -> parameter contract (validated by the CLI)
    fauna/, cloth/, ...  one folder per family
  pipeline/
    build.ts             buildAuthoredModel (browser-safe; also used by the Art Yard)
    node-entry.ts        semantic art contract + GLB export (bundled for Node)
    producer.mjs         the pipeline hook: bundles node-entry, writes raw GLBs, reports
  export.mjs, export-entry.ts, <building>/   canvas-textured buildings, exported as authored GLB sources
```

## How the pipeline builds an authored asset

`tools/art/cli.mjs` (the art pipeline CLI) splits each run's cache misses by producer. Assets whose
`generator` is in `contracts.json` go to `pipeline/producer.mjs`; `authored_glb` assets go to the
authored-GLB producer; frozen assets are never built.

The authored producer bundles `pipeline/node-entry.ts` with esbuild (cached under
`generated/.cache/authored/`, keyed by the hash of the authored sources), then for each asset:

1. builds the scene with the registered generator (`GeneratorContext` carries the catalog spec, its
   `seed` and `parameters`);
2. enforces the **semantic art contract** (the checks the retired Blender pipeline made, now owned
   here):
   required nodes present and unique, no degenerate triangles, every material a declared palette
   token, `COLOR_0` carrying its token colour, material and triangle budgets, LOD ownership and
   ratios, rest-pose dimensions within 0.25–1.35x the catalog, ground pivot, and every declared clip
   present with its catalog duration and animating only existing nodes;
3. exports the raw GLB with `GLTFExporter` into the stage's `raw/` directory and reports dimensions,
   bounds, palette tokens and colour loops in the pipeline's report shape.

From there both producers share everything: Khronos validation of the raw and optimised files,
glTF-Transform/Meshopt optimisation, the per-asset cache (authored assets hash the authored sources),
atomic publication to `generated/glb/` and `public/assets/models/`, the published manifest, and
`art:determinism`.

## Writing a generator

1. Add or update the catalog entry in `assets/specs/asset-catalog.json` with the generator name,
   `parameters` (empty `{}` when the generator takes none), palette, budget, dimensions, pivot,
   `requiredNodes`, and `animationClips` / `lodLevels` / `collisionPrimitives` as the runtime needs.
2. Write the factory in `generators/<family>/create<Name>Model.ts`:
   `export function createXModel(context: GeneratorContext): AuthoredModel`. Name the root
   `${context.spec.id}_root` and every runtime-resolved node from `context.spec.id`. Use
   `mulberry32(context.seed)` for any randomness.
3. Register it in `generators/registry.ts` and give it a contract in `generators/contracts.json`, in
   the CLI's rule format (`{ "kind": "number", "min": 0.8, "max": 1.2 }`, `integer`, `choice`,
   `tuple3`, `boolean`). A name may belong to one producer only; the CLI refuses a name that is also
   a frozen legacy family.
4. Iterate in the Art Yard with `&live=1`, then `npm run art:generate -- --asset <id>`, then inspect in
   the Art Yard (published) and the game.

### Construction rules the kit encodes

- **One surface per primary mass.** `addLoft` sweeps superellipse cross-sections (`w`, `h`, `hb`,
  `n`) along a path; a dog's rump-to-nose, a duck's hull, a fleece. Change the sections, not the
  primitive count, to get a deep chest, a waist tuck or a stop.
- **Deliberate joins.** Legs, ears, tails and wings are their own lofts whose root station is buried
  in the body. Never push primitives through each other and rely on the skin to hide it.
- **Markings are faces, not lumps.** A `token` rule decides the palette token per quad (clean edges).
  Normals are computed before vertices split per token, so shading stays continuous across a marking.
- **Cloth and fans are closed panels.** `addPanel` builds a slab with front, back and rim walls, wound
  against its own normal. Allocate grid rows to bands (`banded` in the laundry generator) so stripes
  and chevrons fall on grid lines. `wrap: true` makes `u` periodic, closing the panel into a tube or
  ring with rims only at its open ends and masked cells (a spoked reel plate, a star drag).
- **Timber is hard-edged.** `addBox` and `flat: true` lofts keep faceted normals; `bevel` chamfers
  a box's long edges and `halfEnd` tapers it (a hewn rail, a splayed leg).
- **Put row edges on colour lines.** A loft `profile` replaces the superellipse with your own section
  points, so a stripe, belly line or gape falls exactly on a quad row (the fish place their section
  rows this way); stations placed on bar edges do the same along the path.
- **Tone within a token.** `shade` darkens a face and `tone` darkens a vertex, both as value masks on
  the token colour inside the `COLOR_0` contract (0.72 to 1.04): plank-to-plank tone, damp feet,
  countershading, fins darkening toward their base. Tokens never change to fake a gradient.
- **Share parts, not materials.** `generators/props/parts.ts` holds rope and catenaries, hewn
  timber, burlap sacks, spoked wheels, knotted nets, fruit and produce crates; each takes the
  caller's palette indices.
- **Held tools keep their contract.** A tool the hand docks carries `tool_primary_grip` from
  `addGripMarker` (+Y along the fingers, +Z into the handle, tagged with the palm-frame contract);
  a held prop without one (pouch, sheaf, basket) is held by its origin, so keep its origin and axes.
- **Rods keep the bend contract.** `FishingRodBend` bends every rod mesh along the axis from
  `rod_primary_grip` to `rod_line_exit` (a typed `addMarker`), so the blank is one loft with many
  stations; it turns only the meshes named `rod_reel_spool`, `rod_reel_line_coil`,
  `rod_reel_crank_arm` and `rod_reel_handle_knob` about +X through the spool mesh's centre, so the
  spool is built symmetric about its axle; `WorldScene` reads the line's start from the
  `rod_guide_tiptop` node's position, so the tip-top is its own mesh with its node at the ring.
  The rotating components and tip-top are catalog `requiredNodes`: optimization must not
  join their geometry into stationary rod parts. Multi-material primitive children inherit
  their named component's motion. The secondary palm marker orbits the axle with the knob
  but retains its grip orientation, like a freely rotating crank handle.
- **Front is +Z.** Props and buildings face +Z, as the world layout's rotations assume; a model
  built facing -Z turns its geometry (`geometry.rotateY(Math.PI)`) rather than adding a node turn.
- **Conform small markings.** `addPatch` fans a spot or scute over points sampled on the curved
  surface; `addDisc` is for flat or domed features (eye glints, rivets) on flat ground.
- **LOD is authored, not decimated.** For assets with catalog `lodLevels`, build the model once per
  level at lower detail (`lodDetail` scales sides and stations) and let `assembleLodLevels` place each
  under its level node, so every level keeps whole palette faces and a valid `COLOR_0`.
- **Rigs rest at identity.** Bones sit at model-space joints with identity rotations, so a clip angle
  is a rotation in the parent's frame. `solveSagittalChain` solves planar limbs for held poses;
  `cyclicTrack` makes closed-loop gait tracks from one key list with per-leg phases.
- **Colour contract.** Materials are white, named for the token, and shared per token
  (`tokenMaterial`); the colour is baked into linear `COLOR_0`. That is the pipeline's contract for
  every published GLB and what lets assets share runtime materials.

## Porting a frozen family

Port family by family. Where the existing asset reads well, port it faithfully; where it reads
weakly, redesign it to the village-life standard, with a before/after review of the pair. The Python
generators were deleted; the frozen published GLB, its catalog entry and its recorded parameter
contract are the reference (the retired source remains in git history before the Blender removal).

1. Read the catalog entries, the frozen family's contract in `tools/art/legacy-generators.json`, the
   published GLB in the Art Yard (nodes, sockets, clips, LODs, collision), and every runtime consumer
   (`WorldScene`, ambient routes, presentation code) that resolves nodes or clips by name.
2. Write the TypeScript generator under the same generator name, keeping every required node, pivot,
   socket, clip name and duration, LOD level and collision marker the runtime relies on.
3. Move the name: delete it from `tools/art/legacy-generators.json` and add it to `registry.ts` and
   `contracts.json` (starting from the recorded parameter contract).
4. `npm run art:generate` the family, compare old and new in the Art Yard and the game, and update
   catalog dimensions and budgets from the producer report.

### Status

| Family | Generators | Producer |
|---|---|---|
| Village fauna | `fauna_dog`, `fauna_cat`, `fauna_sheep`, `fauna_duck`, `fauna_pigeon`, `fauna_chicken`, `fauna_rabbit`, `fauna_gull`, `fauna_butterfly` | authored |
| Village cloth | `banner_cloth`, `laundry_line` | authored |
| Farm props | `wood_fence` (fence bay and farm gate), `milk_churn`, `water_trough`, `pumpkin_patch`, `hay_bale`, `worm_compost_bin`, `farm_workbench`, `wagon_cart`, `water_well`, `lamp_post` | authored (redesigned) |
| Horse carriage | `merchant_carriage` (steerable forecarriage, footboard, palm contacts, flexible reins and horse harness) | authored |
| Harbour props | `lobster_trap`, `fishing_net_rack` | authored (redesigned) |
| Stalls | `produce_stall` (dock produce stall and plaza market stall; `ladder`, `sign`) | authored (redesigned) |
| Buildings | `farm_kitchen` (the farm kitchen, split off `village_building`) | authored (redesigned) |
| Held tools and props | `sickle`, `watering_can`, `workstation_scoop` (palm-frame grips), `seed_pouch`, `crop_bundle`, `harvest_basket` (held by their origin) | authored (redesigned) |
| Equipment tools | `equipment_sickle` (`broad`, `balanced`) and `equipment_watering_can` (`copper_rose`, `long_spout`), styles of the sickle and can generators; `crafting_job_prop` (`tailor`, `toolmaking`, `ready`) | authored (redesigned) |
| Fishing rods | `fishing_rod` (`willow`, `river`, `heavy_sport`, `offshore`, `master` tiers) | authored (redesigned) |
| Catch fish | `stylized_fish` (12 species, table in `generators/fish/species.ts`) | authored (redesigned) |
| Fish trade packs | `fish_trade_pack` (the catch is `buildFishSurface`, flattened) | authored (redesigned) |
| Shore and woodland | `driftwood_cluster`, `driftwood_log`, `fallen_log` (`props/shore.ts`) | authored (redesigned) |
| Furniture | `cozy_bed`, `cozy_armchair`, `wood_bench`, `picnic_table` (`props/furniture.ts`) | authored (redesigned) |
| Garden | `potting_bench`, `rustic_watering_can`, `garden_hoe`, `apiary_hive` (`props/garden.ts`) | authored (redesigned) |
| Harbour | `dock_lantern_post`, `hanging_signboard`, `cargo_sack`, `cargo_crate_large`, `treasure_chest` (`props/harbour.ts`) | authored (redesigned) |
| Camp and trail | `smoke_plume`, `clay_oven`, `fire_pit`, `trail_kiosk`, `trail_signpost` (`props/camp.ts`) | authored (redesigned) |
| Reef | `coral_pillar`, `coral_staghorn`, `coral_table` (`props/reef.ts`) | authored (redesigned) |
| Crop trade packs | `crop_trade_pack` | frozen (to port) |
| Wearables | `wearable_equipment` (fit groundwork in `generators/wearables/`: the player body sampled by `scripts/extract-player-body.mjs`, weight transfer and a body envelope; not yet registered) | frozen (to port) |
| Everything else | the other families in `tools/art/legacy-generators.json` | frozen (to port) |
| Tripo and adapted donor models | `authored_glb` (committed sources under `art/imported/`) | authored GLB |
| Photo-reconstructed buildings | `authored_glb` (exports under `art/authored/<model>/export/`) | authored GLB (below) |

## Photo-reconstructed buildings (canvas-textured exports)

Six buildings were reconstructed from reference photos as measurable, code-only Three.js factories
that paint canvas textures, so their export runs in headless Chromium:

```bash
npm run art:authored                         # rebuild every building, then publish via art:generate
npm run art:authored -- building_wooden_outhouse_a   # rebuild one
npm run art:authored -- --no-publish         # committed source only
```

Each run writes one GLB into `art/authored/<model>/export/` (the committed source) and then runs
`tools/art/cli.mjs generate` for the exported IDs, which optimises (Meshopt), validates and
atomically publishes them with the manifest. Runtime never reads the `export/` directory. These will
move to registered generators once their canvas textures are baked into palette colours at build
time.

### Editing

- Edit `tools/authored/<model>/create<Model>Model.ts`. The factories import only `three` (0.174);
  `tools/` is in `tsconfig.json`'s `include`, so `npm run typecheck` and `npm run lint` cover them.
  The other buildings keep everything in that one file; the fish-market shop is split into sibling
  modules inside its folder — `parts.ts` (the 274 placements), `materials.ts` (baked flat colors),
  `fish.ts` (sculpted fish geometry) and `geom.ts` (extrude/lathe helpers) — and its factory is the
  assembled root.
- The root object name must stay `<assetId>_root` (the catalog `rootNode`).
- Run `npm run art:authored`, then publish/`art:codegen` as usual. Do not hand-edit the GLB.

### Catalog integration

Each building has a normal catalog entry with `generator: "authored_glb"`, `parameters.sourceGlb`
pointing at the committed export and a `textureMaxSize`. They are ordinary published assets: in the
manifest, covered by `art:validate`, `art:sync`, `generate` and `determinism`, with the palette,
budget, node and LOD contracts of any other asset.

### Adaptation

The builder re-skins each factory's textured materials onto Neva's palette before export
(`adaptToPalette` in `export-entry.ts`):

- Every mesh maps to one of at most 16 shared palette-token materials named for the token, sampled
  from the mesh's true average colour (`material.color x texture average x vertex tint`). Tokens are
  drawn from a craft subset so a plaster wall never lands on a water-foam token.
- Textures are dropped (flat, faceted style) and COLOR_0 is baked with the full authored colour, with
  the material factor left white, so the loader's `multiply` reproduces the original colour.
- `side: DoubleSide` is preserved, which the thatch/foliage/panel shells depend on.
- Emissive parts map to `emissive_window_01` / `emissive_lantern_01`; Neva drives their strength.

Result: 10–16 materials and zero textures per model (was 16–36 materials and up to 24 textures),
with the look intact. `npm run art:authored -- --raw` skips adaptation for comparison.

**Structure.** Each exported scene is
`<id>_root` → `<id>_LOD0` (full) + `<id>_LOD1`/`_LOD2` (meshoptimizer-decimated) + `COL_<id>` (box
collider, hidden by `AssetLoader`). The collider is sized to the **building only** — the lot's garden,
fences and stored props are excluded via `LOT_NODES` so the placed garden stays walkable instead of
becoming an invisible wall. The catalog declares the LOD tier, `lodLevels` and the `requiredNodes`,
with box `collisionPrimitives` (also building-only) as the physics proxy. LOD1/LOD0 ratio is about
0.4–0.8 depending on how much of the model is genuinely reducible.

### Determinism

The factories seed their procedural noise, and the builder always builds with defaults. Two runs are
not byte-identical — three's `GLTFExporter` packs textures asynchronously, so only the order of the
image bufferViews varies — but they are semantically identical: same hierarchy, same geometry bytes,
same texture set. `--verify` builds each target twice and asserts that:

```bash
npm run art:authored -- --verify
```

The builder also strips glTF `extras` from every object. The factories keep a `sculptRuntime`
inspector payload in `userData` that embeds three's random UUIDs, which `GLTFExporter` would
otherwise copy into the asset and make the bytes differ every build. Neva reads none of it.
Registered generators have no textures, so their GLBs are byte-identical run to run.
