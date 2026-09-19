# NEVA — Python generator design upgrade

## Delivery status

**18 uploaded visual-generator modules updated; 2 new shared geometry modules added.**
`registry.py` and `imported.py` are preserved byte-for-byte. No TypeScript, JavaScript,
JSON catalog, palette, published GLB, animation source, or imported Blender source is
changed by the installer.

These are **source-tested candidate generators**, not visually approved game assets.
The authoring environment did not have Blender and could not connect to the local
Art Yard. The package's source/geometry and installer tests passed. Blender execution,
full catalog budgets, optimized exports, animations in motion, and gameplay appearance
must be checked locally before publication.

The baseline is the **20 files you uploaded**, not an assumed current Git checkout.
The installer refuses to overwrite a file that differs from that baseline.

## What changed, one module at a time

| Module | Actual design changes | Deliberately retained |
|---|---|---|
| `architecture.py` | Closed headlap-style clay wedges replace overlapping shingle boxes on both gable orientations and pent roofs. Staggered courses clip at the gable boundaries. Half-round hollow ridge caps replace ridge blocks. Roof colours form broad patches. Joint strips are recessed. Glazed windows gain deeper frames and projecting sills. Daub infill loses stacked decorative slabs. 67 selected timber call sites use restrained eased-section geometry. | Building entry points, roof function signatures, palette tokens, named light/interaction contracts, root and collision calls, existing layouts and structural logic. This is not a new design for every building. |
| `camp.py` | 19 selected board, rail, bench, kiosk and sign construction call sites use eased timber. | Camp prop selection, context, material assignments and collision calls. |
| `coastal.py` | Selected hut timber is refined. Wind-bearing leaf ribbons are tagged as foliage surfaces. Palm distant-detail leaflets retain a subset of the full-detail attachment positions rather than being redistributed. | Existing coastal rock authoring, `_NEVA_WIND` values, palm dimensions, source parameters and runtime wind code. |
| `harbor.py` | 19 selected dock, crate, gangplank, railing and other timber construction call sites use eased timber. | Prop identities, materials, origins and attachment logic. |
| `homestead.py` | 42 selected boards, posts, rails, hive and working-prop construction call sites use eased timber. | Open troughs, tools, interactions, collision construction and prop roles. |
| `props.py` | 56 selected structural timber call sites use restrained chamfered sections rather than identical bevel-box surfaces. | Metal hardware, material choices, gameplay dimensions supplied by callers and existing prop functions. |
| `trade_packs.py` | Selected frame runners, boards, crossbars and braces gain the same timber treatment. | Pack sizes, cargo logic, attachment names, straps and fish/crop selection. |
| `crops.py` | The shared leaf builder now produces a closed five-section blade with a petiole, shoulder, midrib, curvature and a turned tip. | Species dispatch, six-stage growth logic, stage parameters, stem placement and crop identities. This is a leaf pass, not a complete redesign of every fruit or growth stage. |
| `rocks.py` | Primary masses, pebbles and selected chips use low-sided geological profiles with broad shoulders and planar crowns instead of dense distorted icospheres. Secondary collapse decimation is removed from those already-low-poly masses. | Rock arrangements, seeded placement, grounding, LOD roots and collision calls. **Triangle-floor and LOD-ratio review is particularly important for this module.** |
| `stones.py` | Stone masses use geological profiles; named moss/lichen/weed masses remain organic canopy pads. Stone rotations are more restrained. | Existing sea-stack/reef/boulder assemblies and their collision calls. |
| `equipment.py` | The field hat has a broad swept annular brim instead of a torus. Apron bib/skirt and coat fronts use closed folded cloth panels. | Wearable anchors, dimensions supplied by callers, pockets, tools, boots and attachment logic. |
| `items.py` | The apple has a curved stem-attached leaf. Carrot rings follow the tapered root instead of hovering as oversized hoops. A selected chest timber call site is refined. | Existing apple body, bread and other item authoring, grip conventions and item functions. |
| `horse_carriage.py` | The carriage's local box helper distinguishes timber from metal: wooden construction gets eased sections; iron/brass remains precise. | Horse anatomy and skinning, gate/wheel animation, driver/cargo sockets and axle origins. **The horse itself has not been reauthored.** |
| `vegetation.py` | Orchard apples gain shoulders and recessed stem profiles. Olive highlights are grouped into upper-crown regions instead of every fourth lobe. Shared leaf masses explicitly use the foliage surface mode. | Existing branch-supported canopy geometry, trunk authoring, tree species, LOD logic and collisions. |
| `woodland.py` | Maple autumn colours form contiguous canopy regions. Leaf masses use foliage normals. The canopy helper honours its detail argument. It also receives the improved crop-leaf helper where already imported. | Existing branch-supported tree layouts and conifer authoring. |
| `characters.py` | The hen's comb has rounded lobes and its wattle has a tapered lofted silhouette rather than rectangular pieces. | All other animal anatomy, animation/rig calls, and imported NPC assets. **This is a focused hen accent pass, not a humanoid/NPC overhaul.** |
| `fish.py` | Eyes are seated using the sampled species profile and have the correct thin axis. Glints follow the eyes. Gill seams are closed curved tubes following the flank. Trout spots follow the taper instead of fixed global girth. | Species body construction, tail forms, bone/skin/clip calls and head-part name matching. |
| `clouds.py` | Banks and towers use distinct ordered mass hierarchies. Builders obey the exact requested cluster count. Added scallops stay within bounded shoulders instead of extending the silhouette indefinitely. Centering uses the root's local coordinate space. | Catalog dimensions/inputs, palette ownership, cloud entry point and consolidation. |

`registry.py` and `imported.py` are included for reference and verification only.
The installer will **not** select or overwrite them.

## Shared geometry and cache integration

New files live in the existing shared Python directory:

- `tools/blender/common/design_geometry.py`: deterministic standard-library mesh
  construction and topology validation, independent of Blender.
- `tools/blender/common/design_primitives.py`: the Blender adapter using the existing
  palette material manager, `Color` attribute and `.neva_surface` normal contract.

The inspected `tools/blender/cache.mjs` includes common-directory Python files in
per-asset input hashes, but does not generally follow every relative import between
arbitrary generator files. Putting these helpers in `common` avoids introducing an
untracked helper dependency. No cache or exporter JavaScript is changed.

Adding common files can invalidate cache keys beyond one family. **That does not
publish or regenerate unselected assets:** keep using explicit selected asset IDs.

The new timber primitive stays within the dimensions supplied to it. An explicit
`bevel=0` still produces 8 vertices / 12 triangles, preserving inexpensive distant
construction. Chamfered timber uses 24 vertices / 44 triangles. This is not a
blanket subdivision, extra-material, texture, or scene-decoration pass.

## First check which Art Yard entries can actually change

A family label is not a source route. The inspected catalog already contains
buildings using `generator: "prebuilt_glb"`. Editing a procedural Python builder
will not reauthor those source GLBs. The same distinction applies to
`imported_blend` and runtime TypeScript items.

Run the read-only checker against your **actual local repository**:

```bash
cd "/path/to/neva_blender_design_upgrade"
python3 inspect_catalog.py --repo "/path/to/nevagame" --module architecture --show-excluded
```

It resolves the local `GENERATORS` dictionary without importing Blender, and includes
transitive imports between generator modules. For example, editing a crop helper
can affect a woodland generator that already imports it. A selected module can
also have **zero active catalog entries**; that is not evidence of a generation bug.

Print selected build commands, without running them:

```bash
python3 inspect_catalog.py --repo "/path/to/nevagame" --module architecture --commands
```

All printed commands use explicit catalog IDs and `--no-publish`. A JSON report
including the existing per-asset budgets is available with `--json`.

## Install one module at a time

Start with architecture, then inspect the relevant asset before taking another
module. Keep the two helper files together; the installer handles this automatically.

```bash
# Read-only preflight. This writes nothing.
python3 apply_upgrade.py --repo "/path/to/nevagame" --module architecture

# Install only architecture and the two shared helpers, after hashes pass.
python3 apply_upgrade.py --repo "/path/to/nevagame" --module architecture --apply

# Subsequent individual passes use the same pattern.
python3 apply_upgrade.py --repo "/path/to/nevagame" --module fish --apply
```

`--module` is repeatable. An explicit `--all` selects all 18 modified visual modules;
it is not the recommended first visual review step.

The installer verifies package and destination hashes, refuses modified local
sources and symlink targets, backs up original files under
`.neva-generator-backups/<run>/`, and rolls back its completed writes on a handled
installation failure. Individual file replacement is atomic; this is not a
filesystem-wide transaction or a guarantee against power loss.

It does not run Git commands, delete local edits, invoke Blender, publish assets,
or modify any `.ts`/`.tsx`/`.js`/`.mjs` file. Repeating a completed selection performs
no writes.

**Do not bulk-copy the entire generators folder over a newer checkout.** A hash
mismatch is a reason to inspect and merge `patches/<module>.py.patch`, not to force
an overwrite. `NEVA_GENERATOR_UPGRADE.patch` contains the combined source patch.
When reverting a selected file, retain the common helpers while another installed
module imports them.

## Validation before publication

### 1. Run the package's portable tests

```bash
python3 -m unittest discover -s tests -v
```

The authoring run passed **32 tests**, covering 640 seeded primitive cases plus
roof topology/assembly checks, headlap clearance, deterministic output, material-free
shape generation, public/private existing function signatures, protected
marker/collision/skinning/clip call preservation, unchanged importer/registry,
read-only impact routing and installer safety/idempotence.

Assembly tests execute the delivered Python function bodies with recording geometry
calls. They are **not Blender execution**. The tests do not establish rendered
quality, actual skin deformation, self-intersection freedom for entire assembled
assets, or optimized GLB budget compliance.

### 2. Run the included Blender smoke test locally

Run after installing a selected module and its helpers. Use your Blender executable
(the macOS executable may be `/Applications/Blender.app/Contents/MacOS/Blender`).

```bash
blender --background --factory-startup --python-exit-code 1 \
  --python "/path/to/neva_blender_design_upgrade/tests/blender_smoke.py" -- \
  --repo "/path/to/nevagame" \
  --report "/path/to/neva_blender_design_upgrade/local_blender_smoke.json"
```

This checks real Blender manifold edges, positive volume, origins, palette/normal/
colour attributes, and a temporary GLB containing `POSITION`, `NORMAL`, and
`COLOR_0`. It does not publish or save a scene. **It was not executed in the authoring
environment.** It is an isolated-helper check, not a full asset or animation test.

### 3. Generate selected, actually affected catalog entries

From the game repository, run one of the exact commands printed by the impact
checker. The existing production workflow is:

```bash
npm run art:generate -- --asset YOUR_AFFECTED_CATALOG_ID --no-publish
npm run art:test-builders
```

For a shared architecture-family validation, the inspected toolchain documents:

```bash
npm run art:generate -- --family architecture --no-publish
npm run art:determinism -- --family architecture
```

Prefer explicit IDs when the family mixes procedural and prebuilt source routes.
Do not run `generate_all.py`, relax catalog thresholds, or regenerate/publish the
entire catalog to test one module.

**Budget warning:** triangle counts and LOD ratios can change, particularly for
geological masses, leaves and clouds. The catalog has both minimum and maximum
triangle rules. No asset is certified against those rules by this package. If an
asset fails, stop and investigate its selected builder; do not add invisible
geometry or globally relax budgets to force a pass.

### 4. Inspect real output and publish only the selection

Check front, rear, side, three-quarter and normal gameplay-distance views. Look for
clear silhouettes, timber/wall/roof intersections, readable glazing, sensible cloth
fit, fish detail seating, crop-stage identity, and LOD transitions. Validate fish
and hen motion on their existing rigs. Verify that interaction/collision geometry
still fits the changed visual envelope; unchanged collision calls alone do not
prove fit.

After mechanical checks and the intended visual review, use the existing selected
publication command:

```bash
npm run art:generate -- --asset YOUR_AFFECTED_CATALOG_ID
```

The repository CLI prints the selected `/__neva_art_yard?asset=...` link. The package
does not bypass its validation, optimisation, cache or atomic publication path.

## Files

`upgrade_manifest.json` records exact input/output hashes and the installer scope.
`patches/` contains per-file diffs. `reports/` contains the authoring-session test
log and validation status. `tests/blender_smoke.py` is the separate unexecuted local
Blender check. No generated production GLBs or claimed game screenshots are included.

## Source basis

The code baseline is the user-uploaded generator set. Operational checks used
`arthlor/nevagame`: `tools/blender/README.md`, `common/geometry.py`, `cli.mjs`,
`cache.mjs`, and the opening entries of `assets/specs/asset-catalog.json`.
The full local catalog is deliberately resolved at installation/review time rather
than replaced with a second hard-coded asset list.
