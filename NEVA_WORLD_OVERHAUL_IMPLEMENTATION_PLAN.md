# NEVA / NEVALAND — World, Terrain and Water Overhaul
## Step-by-step implementation work order

**Prepared:** 16 September 2026  
**Repository:** `arthlor/nevagame`  
**Source baseline rechecked:** `688fec961dc3f08fc4184087d2a753339fa623d2` (`main`, commit dated 14 September 2026)  
**Status:** Planning complete; implementation, runtime validation, hardware profiling and visual approval have not been performed for this work order. Every implementation checkbox starts unchecked.

> **Objective:** Make Neva an immersive, authored low-poly coastal world by fixing geographical inconsistencies first, completing one exceptional spring–waterfall–river slice, and then extending its proven terrain, shoreline, water and composition language across Neva and Sunreach. Preserve the existing game, saves, identities, asset pipeline and renderer.

This is a scoped execution plan, not a replacement for repository authorities. Root `AGENTS.md` remains the routing authority; the existing architecture, gameplay, art, pipeline, Blender, audio and production documents remain their respective owners. Incorporate approved contract changes into those owners rather than creating another `AGENTS.md`, migration ledger, palette, renderer configuration or parallel “final” specification. Record implementation evidence in `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md`; this plan supplies work-package IDs and acceptance criteria, not a competing status database. [R01–R04]

No plan can establish correctness without execution. Here, “complete” means the required evidence exists, passes, and corresponds to the exact candidate build—not that an agent has produced code or screenshots.

**Navigation:** [Scope](#scope) · [Execution sequence](#execution) · [Validation matrix](#validation) · [Agent kickoff](#kickoff) · [Sources](#sources)

---

<a id="scope"></a>

# 1. Scope and non-negotiable boundaries

## 1.1 Preserve

- The no-combat farming → processing → preparation → fishing → cargo → market → progression loop; existing balance, costs, unlocks, quest identities and content IDs.
- Plain TypeScript/Vite/Three.js rendering, the existing React/DOM UI, Rapier integration, fixed-step simulation ownership and deterministic gameplay RNG. Do not replace the engine or upgrade libraries as part of this overhaul.
- `WorldLayout` as the compatibility interface while internals are improved incrementally; existing terrain/traversal support, bridge and pier exceptions, route grading, and working-ground protection.
- Existing water optics, CPU/GPU low-frequency wave agreement, near-water detail, lighting/atmosphere, composition fields and quality tiers. Extend their owners rather than starting replacements.
- The catalog-driven Blender → validated/optimized GLB → runtime loader pipeline, palette tokens and `VisualRenderConfig` ownership. Terrain/water-generated geometry continues through its existing runtime construction path; static rocks and architectural assets remain catalog-backed GLBs.
- Primary and backup save semantics. Do not invent a third manual save slot, reset IndexedDB, silently repair a save by deletion, or run candidate topology against the developer’s only save.
- Player changes unrelated to this scope; approved harbor appearance; existing accepted art and gameplay-camera baselines outside a declared change envelope. [R01–R04, R07–R10]

**Dependency note:** the inspected `package.json` declares `three` and `@types/three` as `^0.174.0`, Rapier as `^0.14.0`, and React as `^18.3.1`; these are declared ranges, not proof of the installed versions. CI uses Node 22. Resolve actual versions from the lockfile and installed packages in W00. Do not implement against a newer Three.js example without checking the locked API. [R02, R03]

## 1.2 Deliver

1. Correct all-around-island ocean/river classification and coastal fishing-access targeting.
2. Shared coast/reach projections and consistent derived maps, without creating multiple geographical authorities.
3. Shore treatment appropriate to sand, rock, cliff and shelter on both islands.
4. A connected spring → upper reach → waterfall → plunge pool → downstream river slice.
5. Stronger landform silhouettes, bank/road/shore transitions, and selective authored rock geometry.
6. More distinctive river reaches, sheltered/exposed sea behaviour, and purposeful shallow seabed shapes.
7. Habitat-based rock/vegetation composition, restrained atmosphere, waterfall audio and nonintrusive camera framing.
8. Save-safe topology integration, production performance evidence and cross-browser validation.

## 1.3 Explicitly excluded

No full fluid simulation, FFT ocean, dynamic erosion simulation, voxel terrain, ECS rewrite, WebGPU migration, new networking/backend, new combat, map-size expansion, character/NPC overhaul, economic rebalance, automatic tides/flooding, mandatory planar reflections, new third-party asset service, or wholesale vegetation replacement.

No swimming, boat passage through waterfalls, new fish species, new rewards, or reclassification of the existing estuary “lake” habitat by artistic implication. Preserve the existing lake/lagoon identity and quest contracts unless a separately approved gameplay change explicitly replaces them. The waterfall’s upper reach and pool remain non-sailable and non-fishable in this work order unless an existing gameplay authority already permits the exact location. [R09]

## 1.4 Changes fall into three classes

| Class | Examples | Required protection |
|---|---|---|
| **P — Presentation only** | Reflection filtering, particle density, visual current streaks, local sound | No canonical save/world change; quality tiers may change appearance only |
| **B — Behaviour correction, unchanged topology** | Correct render water-region weights; coastal access targeting a genuinely adjacent accessible shore | Explicit allowed behavioural differences; prove all protected gameplay states and membership fields remain unchanged |
| **T — Topology/support change** | River footprint, water level, rock collider, altered path support, steep bank, moved building approach | Candidate revision, affected-entity analysis, migration/reload fixtures, collision/traversal integration and rollback strategy before release |

A change to a collider can be class T even when the ground’s X/Z footprint is unchanged. A render-only fix becomes class T when it changes authoritative movement, navigation or saved support. Assign the class before editing each work package.

---

# 2. Evidence baseline: what is known and what must be reproduced

The preceding audit was source-based; its browser could not create a WebGL context. It did not prove runtime appearance, frame time, or test results. Treat the following as reproduction targets, not pre-approved screenshots or universal runtime failures.

| ID | Source-supported observation | Required reproduction before changing it |
|---|---|---|
| D01 | Neva’s render water profile uses distance from `coastlineZ(x)` for river weights in its legacy branch, although Neva has a closed coast loop. | Show current profile and physical water membership at `(-220, -60)` and representative points around every side. Confirm the problematic branch on the current commit. |
| D02 | Legacy shore foam iterates across the southern coastline; continuous optical swash is weighted by harbor influence. | Produce a coverage overlay and actual coast views; identify all existing foam owners and double coverage. Do not assume every uncovered point should have visible foam. |
| D03 | Sunreach coastal access uses a shoreline-gradient approach; Neva’s ordinary coastal fallback uses the southern coastline. | Exercise accessible western/eastern/northern bank candidates and distinguish unsupported cliffs from genuinely missed access. |
| D04 | Headwaters interpolate 20 → 12 → 3 → 0 m between the authored knots and use slope-based rapids. | Capture current source/rapids geometry, water baseline, collider support and camera views. This is an enhancement target, not automatically a defective waterfall. |
| D05 | Optical depth is generated from sampled terrain support; the marine bathymetry field generally uses a distance approximation outside the harbor treatment. | Trace every depth consumer and measure differences; preserve gameplay tuning where it intentionally uses a proxy. |
| D06 | Terrain, roads, water, composition fields, spatial batching and test tools already exist. | Map actual runtime use; do not infer streaming, LOD, or release coverage solely from a helper’s filename. |

Owners: `WaterSurface.ts`, `ShoreFoam.ts`, `CoastalOptics.ts`, `WorldLayout.ts`, `WorldIslands.ts`, `NevaHeadwaters.ts`, the existing water tests and composition infrastructure. [R07–R13]

When a finding no longer reproduces, record **not reproduced at <commit>**, retain the regression test where useful, and skip its corrective patch. Never reintroduce an old defect to make a plan step relevant.

---

<a id="execution"></a>

# 3. Execution sequence and gates

Use **W00–W12** as work-package IDs to avoid colliding with the repository’s existing P0–P16 milestone names.

| Package | Deliverable | Dependency | Class | Exit gate |
|---|---|---|---|---|
| [W00](#w00) | Reproducible baseline and authority/version inventory | None | Planning/diagnostic | G00: current source and evidence identity recorded |
| [W01](#w01) | Protected-state fixtures, diagnostic probes and regressions | W00 | Diagnostic | G01: reproductions and preservation tests usable |
| [W02](#w02) | Water classification and coastal-access fixes | W01 | B | G02: targeted fixes without topology drift |
| [W03](#w03) | Shared projection/field contracts and data-map parity | W02 | B/P | G03: coherent, nonrecursive geographical data flow |
| [W04](#w04) | All-coast contact/swashing treatment | W03 | P | G04: coherent shore effects; protected harbor preserved |
| [W05](#w05) | Spring–waterfall–river graybox and viewpoint composition | W01, W03 | Candidate T | G05: playable graybox and scoped visual review |
| [W06](#w06) | Candidate terrain, collision, migration and support integration | W05 | T | G06: topology/save safety proven |
| [W07](#w07) | Dedicated waterfall and connected water rendering | W04, W06 | P/T-bound | G07: continuous, readable waterfall slice |
| [W08](#w08) | Landform, riverbank and seabed finish in the slice | W07 | P/T | G08: geometry/transitions work without decorative cover |
| [W09](#w09) | Authored assets, vegetation, audio and framing; slice approval | W08 | P/T | G09: integrated slice accepted visually and technically |
| [W10](#w10) | Controlled expansion across Neva and Sunreach | G09 | P/T | G10: each changed region independently accepted |
| [W11](#w11) | Production optimization, lifecycle and browser matrix | W10; profiling starts W00 | P/engineering | G11: measured budgets and lifecycle gates pass |
| [W12](#w12) | Release, evidence audit and compatible rollback | G11 | Release | G12: authorized release-ready candidate |

**Default execution is sequential.** W04 and W05 can overlap only after W03 is frozen and their file ownership does not overlap. Do not let several agents simultaneously edit `WorldLayout.ts`, `VisualRenderConfig.ts`, the catalog, or migration owners.

Each package contains several small commits. A package is not permission for an agent to implement all later packages. Complete one work item, run its focused checks, review its diff, and then advance. Full release suites belong at integration/release gates, not after every material parameter adjustment. [R04]

---

<a id="w00"></a>

# 4. W00 — Establish the baseline before changing the world

**Outcome:** A candidate can be compared against a trustworthy original, and no asset regeneration or test run silently contaminates that original.

### W00.1 — Inspect and isolate the working tree

- [ ] Record `git rev-parse HEAD`, branch, `git status --short`, Node/npm versions and lockfile hash.
- [ ] Preserve unrelated work. Use a separate worktree/branch for implementation when appropriate; do not stash, reset, discard or commit the user’s unrelated changes without permission.
- [ ] Confirm whether the checkout still matches the audited SHA. Re-read affected owners when it does not.
- [ ] Use an isolated browser profile/origin and copied test fixtures. Do not load candidate topology over the sole personal save.
- [ ] Check resolved dependency versions; use `npm ci` in the clean implementation worktree. Do not update the lockfile to solve an unrelated installation problem.

### W00.2 — Read the current routed authorities

Read root `AGENTS.md`, then the owning documents and linked sections required by its task-routing table. For the eventual cross-system gold slice, that includes architecture/persistence, relevant gameplay invariants, production execution, visual baseline/water/terrain, Art Pipeline and Blender; audio/layout documents are required when those contracts are changed.

The architecture document’s §6.1 remains the single migration ledger. Read runtime schema constants and the migration chain before allocating a new version. `WorldAnchors.ts` was verified at layout revision 17 at the reviewed SHA; **do not preallocate “18” or a new schema number in this plan** because another change may consume them. [R01, R05]

### W00.3 — Check generated drift before regeneration

Follow the actual CI ordering. These commands are verified at the reviewed SHA; recheck their definitions before executing on a newer checkout. [R02–R04]

```bash
npm run art:codegen:check
npm run ui:codegen:check
npm run ui:publish:check
npm run ui:pack:check
npm run content:validate
npx tsc --noEmit
npx eslint .
npx vitest run
npx vite build
node tools/ci/check-download-budget.mjs
```

`npm run typecheck`, `npm test`, `npm run build` and `npm run dev` have asset-sync prehooks at this snapshot. Do not run those aliases first when verifying whether committed generated output is stale. A direct build still creates build output; “check-only” here means avoiding adapter regeneration, not promising that no files are created.

Capture failures before repair. Existing failures remain open issues; they do not become passes merely because a narrower test later passes. Production baseline failures block a release claim, although independent implementation may proceed in its isolated branch.

### W00.4 — Capture matching-quality world evidence

Reuse `world:acceptance`, existing scene presets and preservation machinery. The inspected harness already includes `bridge_river`, `starter_farm`, `harbor_market`, `lighthouse_coast`, `mountain_skyline`, `river_source`, `western_overlook` and five Sunreach scenes. It has software/hardware lanes and composition checks across seeds 0–63. Extend it rather than creating a parallel harness. [R06]

Use the existing presets first; add provisional waterfall-lip, plunge-pool, western-sea and estuary views only where coverage is missing. Save the ordinary gameplay camera, not just an attractive free camera.

For each capture record:

```text
commit + working-tree/input digest
build mode + asset/catalog/config digests
world seed + save fixture + schema/layout revision
camera position/orientation/FOV + gameplay mode
time of day + weather + presentation animation time
quality actually used + viewport + effective DPR
OS + browser/build + GPU/backend + hardware/software lane
command + output artifact + pass/fail/not-run/unsupported
```

Freeze time/seed/camera through existing deterministic test hooks. Screenshots do not freeze shader time automatically. Capture a short motion traversal separately; a frozen screenshot cannot reveal flowing direction, popping, transparency sorting or water seams in motion. Match screenshot baselines to the OS/browser/render backend; Playwright documents environmental differences in screenshot output. [E03]

### W00.5 — Measure before setting new budgets

Use the existing production `test:budget` and download-budget checks; keep DEV Art Yard measurements separate. Record frame-time median/p95/p99, draw submissions and triangles across all relevant passes, resource counts, load time, long tasks and GPU timings where supported. Label unavailable metrics; do not turn `renderer.info.memory` counts into invented VRAM megabytes.

Choose a named target desktop configuration and a named lower-tier configuration. Proposed product targets are 60 FPS / 16.7 ms and 30 FPS / 33.3 ms respectively, not measured Neva results. Existing machine-owned budgets remain hard gates unless explicitly revised with evidence.

**G00 exit:** input identity, baseline artifacts, command results, resolved versions, known failures and required human/hardware gaps are recorded.  
**Rollback:** delete only disposable candidate outputs in the isolated work area; no gameplay, schema, asset or save changes should exist yet.

---

<a id="w01"></a>

# 5. W01 — Lock preservation boundaries and prove the problems

**Outcome:** Every later patch has a defined area in which it may change the world and meaningful evidence outside that area that it did not.

### W01.1 — Inventory protected relationships

- [ ] Trace callers of water membership, water elevation, river profile, marine depth, shoreline distance, fishing access, terrain support, route projection, region/ecology, placement and migrations.
- [ ] Record bridge deck/approaches, pier/stairs/slips, boat moorings and launch lanes, farm plots, building pads/frontages, station interactions, NPC/quest anchors, interiors, mount routes and cargo pickup zones.
- [ ] Include map/chart rendering, layout-editor snapping, save recovery, rain/surface audio and vegetation exclusion consumers.
- [ ] Distinguish material-only “cliff” labels from collision or traversal restrictions. A steep-looking surface must not accidentally become a walkable field or vice versa.

### W01.2 — Add a compact protected-state fixture set

Capture normalized data from retained saves and procedural seeds. Protect stable IDs, inventory quantities, gold, crop state, soil state, timers, quest progress, knowledge/unlocks, cargo identities/ownership/slots/freshness, boat and mount associations, world seed and RNG state.

For scenery-independent simulation replay, use identical seed, input sequence and simulated time. Allow only explicitly approved access-result corrections or migration paths. Do not compare against a save that has advanced offline time and then mislabel ordinary progression as migration damage.

Maintain an explicit **allowed-difference manifest** for every change: field paths, world envelope, reason, owner and supporting test. Compare all other normalized state exactly, excluding only explicitly transient or timestamp fields. Never permit a blanket `world.*` exemption.

### W01.3 — Create geographical probes

- [ ] Sample land, sea and shoreline on all four sides of both islands, the channel, river mouth, finite source cap, river edges, patch edges and protected structures.
- [ ] Include `(-220, -60)` for the audited render-classification finding; derive additional locations from current coast segments rather than assuming arbitrary coordinates are water.
- [ ] Add cases just inside/outside each boundary and corners where the nearest coast segment changes.
- [ ] Check NaN/Infinity, invalid weights, wrong direction signs, accidental river influence in remote sea and non-finite normals.
- [ ] Assert physical water exists independently of whether a bridge/pier allows traversal above it. Preserve existing public exceptions until their callers are explicitly migrated.

Extend existing files such as `tests/unit/worldLayout.test.ts`, `headwaterWater.test.ts`, `waterSurfaceNormal.test.ts`, `waterShaderLinkage.test.ts`, `harborCoast.test.ts`, `sunreachWorld.test.ts`, and the preservation/composition tests. Verify file names on the implementation checkout. New tests should live beside the owning suite, not in a second test framework. [R11–R13]

### W01.4 — Record an expected failure before a correction

For each D01–D03 reproduction, capture the old actual value, expected corrected value, and owner path. Run the failing test on the baseline, then implement the fix. Do not assert that every coastal point is fishable: steep cliffs, structures, inaccessible footing and out-of-reach water must remain blocked.

**G01 exit:** targeted failures are reproducible, baseline preservation checks work, affected callers are known, and coverage gaps are visible.  
**Rollback:** diagnostic/test-only changes can be reverted independently; retain evidence of the original failures.

---

<a id="w02"></a>

# 6. W02 — Fix water classification and coastal access without moving terrain

**Outcome:** Ocean looks/behaves like ocean around the whole island, and valid shore fishing targets the water beside the player.

### W02.1 — Correct render-region membership

In `WaterSurface.ts`, restrict river influence to the actual river corridor and finite source reach. Derive coastal/offshore weighting from the shared island/marine representation rather than the southern `coastlineZ(x)` coordinate alone. Blend river and sea only in the authored estuary overlap.

Preserve all existing water masks, coast geometry, river widths/elevations, canonical `isSailable` behaviour and protected bridge/pier semantics in this patch. Render wave class is not permission to change fishing ecology, fish populations, progression gates or boat state.

### W02.2 — Keep wave contracts intact

- [ ] Preserve the numeric low-frequency wave owner and existing CPU/GPU parameter/time conventions.
- [ ] Assert regional weights are bounded and sum to one within numerical tolerance where evaluated.
- [ ] Validate river flow orientation against the reach tangent and coast wave orientation against local shore exposure.
- [ ] Compare CPU reference values, decoded profile textures and actual GPU-rendered samples. String presence in GLSL is useful linkage evidence but not proof a shader compiles or produces the correct surface.
- [ ] Test estuary transitions, source caps, patch seams, wind headings, roughness extremes and near/far handoffs.

### W02.3 — Generalize coastal fishing targets

Reuse the existing Sunreach nearest-water logic where valid, but do not assume an approximate signed field has unit gradient everywhere. For each Neva coastal candidate, find a nearby shore projection or a bounded search into water, validate terrain support/slope, reach, clear casting segment, and target habitat, then return the established response shape.

Preserve bridge, pier, river-access-reserve and interior priority. Verify both positive and negative results. A path to water behind a wall or below an inaccessible cliff is not valid access.

### W02.4 — Verify corrected behaviour through gameplay callers

Exercise basic fishing and sport-fishing approach/target selection from newly recognized valid shore points; retain original river reserves, pier and tutorial locations. Recheck saved active casts without changing their ecology or silently cancelling them.

**G02 exit:** D01/D03 pass with actual updated values; ocean/river visual transitions are reviewed; no protected topology, economic state, IDs or save versions changed.  
**Rollback:** revert the classification/access patch; re-run focused parity tests. Reclassify as T and follow W06 first if any canonical support/navigation change proves unavoidable.

---

<a id="w03"></a>

# 7. W03 — Consolidate geographical contracts and derived-map generation

**Outcome:** Shore geometry, terrain/water depth, flow, rendering, access and dressing consume a coherent, inspectable geographical model.

This is an incremental extraction, not permission to build a generic terrain engine. Keep public `WorldLayout` compatibility methods. Prefer extending existing interfaces before creating files.

### W03.1 — Establish the evaluation order

Use this logical data flow:

```text
authored coast loops + river stations/reaches + landforms + fixed anchors
    → basic projections/membership + authored water datums
    → natural ground / bed shaping
    → protected working pads + road/bridge/pier support
    → canonical support samples and local collision geometry
    → derived depth/material/flow/composition fields
    → baked runtime control maps and render geometry
    → presentation only: waves, foam, caustics, wet sheen, particles
```

Audit the actual import/call graph before moving any function. A routine producing bed elevation must not call a marine routine that calls that same bed routine. Split a lightweight raw shore/exposure query from a derived depth query only where necessary. Add regression tests that repeatedly call the public sampling functions in different orders and receive the same results.

### W03.2 — Define conventions once

Record the following in the owning architecture/art sections and types:

| Quantity | Required convention |
|---|---|
| Position | Existing world X/Z horizontal axes, Y up, meters |
| Sea datum | Preserve the current datum; no tide or global water-level change |
| Signed membership | Existing positive-water / negative-dry convention at the public interface |
| Distance | Identify exact nearest-boundary distance versus a blended signed proximity field; never silently treat them as interchangeable |
| River station | Distance along a directed reach, upstream to downstream |
| River lateral coordinate | Explicit local normal orientation and legacy left/right mapping |
| Shore normal | Validated direction toward water, not guessed from X/Z winding alone |
| Flow/current | Separate from wave travel direction and surface visual-noise motion |
| Water depth | Named physical water-column depth versus intentionally retained gameplay depth proxy |
| Surface ownership | Stable water body/reach ID and selected surface; falling sheets are not horizontal boat-support surfaces |
| Revision | Published layout/content identity and derived-map format/hash |

### W03.3 — Introduce only the data contracts that consumers need

The following are **proposed shapes, not existing exports and not copy-paste replacements**. Reuse repository types and narrow fields after tracing actual consumers. Avoid embedding Three.js classes in new canonical data.

```text
ShoreProjection
  islandId, segmentId, boundaryPointXZ
  tangentXZ, waterwardNormalXZ
  signedDistanceMeters, distanceIsMetric
  shoreKind, exposure, shelter

RiverReachProjection
  reachId, stationMeters, nearestPointXZ
  tangentXZ, lateralMeters
  leftWidthMeters, rightWidthMeters
  baselineElevationMeters, bedElevationMeters
  upstream/downstream endpoint references

WaterColumnSample
  waterBodyId, baselineElevationMeters, bedElevationMeters
  depthMeters, flowDirectionXZ, localWetMembership
  supportKind: horizontal | graded | none

WaterfallDefinition
  stable id, upstreamReachId, downstreamReachId
  lip cross-section, landing cross-section, shaped sheet centerline3D
  pool footprint, exclusion envelope, local dampness envelope
  render/material preset reference, local sound reference
```

Use an explicit body ID or height-aware selector wherever multiple surfaces share X/Z. Do not force a waterfall, undercut rock and lower pool into one ambiguous `height(x,z)` answer. Current boat-support queries remain limited to their supported horizontal/graded water surfaces.

### W03.4 — Preserve the current footprint during extraction

Compare old/new wet membership, terrain support, route projections, bridge/pier values, fishing habitat, region/ecology and seeded composition outside declared exceptions. Protect handoff values to the existing bridge and lower river exactly within established floating-point tolerances.

Do not convert the entire river to an arc-length spline merely to improve a shader. Introduce a local directed reach representation for the headwater candidate only when W05 demonstrates the need; keep legacy wrappers elsewhere until a measured or design requirement justifies migration.

### W03.5 — Generate consistent maps and caches

- [ ] Generate land/water, coast kind/exposure, baseline/bed depth and flow maps from the same input identity, with declared bounds, resolution, units, filter and channel encoding.
- [ ] Keep control maps as non-color data; preserve the linear color workflow for actual color. Custom shader output must join the existing conversion path exactly once. [E02]
- [ ] Test direction encodings across `-π/+π`. Linearly filtering encoded angles can interpolate through the wrong direction; choose decoded vectors with renormalization or another proven circular treatment when needed. Treat this as a test risk, not an already proven Neva bug.
- [ ] Specify normalized sample coordinates and texel-center conventions once. Test both ends, corners, clamp behaviour, dry neighbors, island seams and mixed baselines near a fall.
- [ ] Do not average water levels or flow across unrelated water bodies at a mask boundary. Use sufficient padding, local geometry ownership or separate local maps where required.
- [ ] Key caches by relevant layout/content/seed/config/input identity. Do not key physical fields by visual quality tier.
- [ ] Prepare changed derived fields before use; publish them together rather than mixing old water maps with new terrain for a frame.
- [ ] Reuse the cooperative-task mechanism; move work to a worker or build-time bake only if measured latency warrants it. An aborted rebuild must not replace valid live resources or dispose resources still in use.

For CPU/GPU height checks, separate canonical math parity from sampled-texture error and coarse-triangle chord error. Predeclare test tolerances from the actual encoding/resolution; do not claim bit-exact identity from a filtered byte map.

**G03 exit:** fields agree, no recursive sampling, old footprint remains intact, maps are versioned/cached coherently and shader-path parity is tested.  
**Rollback:** retain a tested compatibility path in the development branch; do not ship multiple competing geography owners or mix map versions.

---

<a id="w04"></a>

# 8. W04 — Extend shoreline contact and swash around both islands

**Outcome:** Sand, rock shelves, cliffs and sheltered shores each have coherent water contact without a uniform foam outline.

### W04.1 — Author a shore-treatment table

Classify existing shoreline sections using the shared shore projection, slope, exposure and existing art inputs. Begin with sand, rock shelf, cliff toe and sheltered landing/cove. Preserve the reference-led harbor treatment as a protected comparison region. Do not overwrite it with averaged island-wide settings. [R01, R08]

### W04.2 — Replace geographical special cases with shared coverage

Replace the remaining global-X/southern-coast effect placement where appropriate with local shore coordinates and direction. Keep the proven shader/material mechanism where it works. Enumerate which renderer owns contact foam at every shore region.

Remove redundant legacy patches only after the replacement is verified in the same region. Do not run full-strength patch foam and full-strength continuous wash on top of one another. Maintain stable phase along connected shore sections and deliberate transition zones; avoid arbitrary phase resets at segment or island seams.

### W04.3 — Connect water, foam and dampness

Drive advancing wash, foam breakup and wet-sand presentation from the same local event/phase where they represent the same wave. Use bounded persistent dampness presentation; it must not become a new crop-moisture or gameplay-flooding system.

Keep foam sparse in sheltered water, intermittent around rocks and concentrated at actual turbulence. Do not place bright foam along every riverbank. Caustics remain shallow-water, lighting-dependent detail rather than a universal underwater pattern.

### W04.4 — Validate adverse conditions

Test grazing camera angles, storm and calm conditions, day/night, all quality tiers, thin shore wedges, docks, boats/rocks intersecting the surface, map bounds and the estuary. Where optical capture or filtering is unsupported, provide the existing reduced optical path with equivalent coast identity and physical membership.

**G04 exit:** all-side coverage overlay has an intentional owner, harbor comparisons remain acceptable, no doubled foam or dry-ground spill, reduced tiers preserve the same playable shore.  
**Rollback:** disable only the new presentation treatment by a compatible visual flag or revert the shader patch. Do not alter geography as a graphics fallback.

---

<a id="w05"></a>

# 9. W05 — Graybox the spring–waterfall–river journey

**Outcome:** One connected place has a compelling silhouette, believable source-to-sea geometry and usable routes before final art is produced.

### W05.1 — Define the local edit envelope

- [ ] Start from `NEVA_HEADWATERS`, `NEVA_SUMMITS`, the foothill trails and their actual runtime surroundings.
- [ ] Lock the finite source position, the downstream handoff around the existing `endZ`, and all unaffected bridge/farm/village/harbor support.
- [ ] Draw an explicit local geometry-change envelope and a surrounding continuity band in the diagnostic overlay.
- [ ] Sample the current terrain, actors, structures, paths and saved positions in that envelope before editing.
- [ ] Keep candidate geography fixture-only until G06. Do not enable autosave to a normal player save in the experimental graybox.

The source’s 20 → 12 → 3 → 0 m profile provides an opportunity for a principal fall near the first drop and smaller downstream cascades. An approximately 8 m hero drop is a **prototype starting point**, not approved final geometry. Preserve the source and downstream connection first; choose exact lip/landing positions after viewing the terrain in play. [R10]

### W05.2 — Establish the spatial composition

Build, in order: source bowl, approach channel, uneven rock lip, main drop, plunge pool, outflow, path, viewpoint and return route. Use simple candidate geometry/materials, not final asset production.

Compose at least three gameplay views: approach with partial concealment; oblique reveal of the main drop; close view showing where the pool drains. Include the reverse walk. A ridge should frame the source without hiding all navigational reference; a rock shoulder can conceal the fall before the reveal. No forced camera rotation is required to make the scene work.

Judge the scene with foliage off and a neutral material override. Reject it when the outline is a smooth mound behind a rectangle of water, the pool has no outlet, the path has no believable footing, or the visual scale depends on a free-camera angle players never use.

### W05.3 — Define the connected reach endpoints

Represent only the required headwater reaches and fall connection. Validate:

- [ ] Every upstream endpoint resolves to its intended downstream endpoint, with matching water level/cross-section or an explicit falling segment between them.
- [ ] Channel bed remains below its owned water surface where the channel is wet; dry shoulders remain dry.
- [ ] Pool water level is fixed by its outflow connection, not chosen independently for visual convenience.
- [ ] No unintended uphill open-channel segment is introduced; deliberate still pools are level and falls account for elevation discontinuities.
- [ ] Adjacent bank/bed envelopes do not self-intersect when the local centerline bends.
- [ ] Water has a finite source and a connected outlet. No branch graph, reservoir simulation or mass-conserving fluid solver is required.

Flow speed and visual width should be art-directed coherently; this does not claim a physical discharge simulation. Do not introduce gameplay currents or move boats because a decorative streak now flows faster.

### W05.4 — Keep the existing valley intact

Treat broad valley/mountain improvements as controlled shape edits, not world reseeding. Use the existing landforms and protected working-ground masks. On the first slice, change only the shoulders necessary to support the source, lip, pool and reveal route.

A new cave or walk-behind passage is out of scope by default. An overhanging rock can be visual geometry without opening a new navigable space. A genuinely walkable overhang needs 3D support-aware traversal and W06 tests; never fake it by raising the whole heightfield.

**G05 exit:** graybox geometry, route and endpoint diagram are reviewed; a scoped human composition decision is recorded where available. Numerical tests cannot self-award artistic approval. The agent may continue independent technical work while that visual sub-gate is pending, but must not mass-produce dependent assets.  
**Rollback:** remove/revert the fixture-only candidate envelope and restore the baseline maps; no production save should require reversal.

---

<a id="w06"></a>

# 10. W06 — Integrate topology, collision and save migration before enabling it

**Outcome:** The redesigned source/drop/pool and path work for actual players, mounts, boats, saves and interactions—not only the render camera.

### W06.1 — Allocate the content revision and migration deliberately

Read the current schema/layout constants, architecture §6.1, all relevant historical migrations, retained fixtures, and production roadmap §25. Determine whether the change needs a schema revision, layout revision, or both through the repository’s established chain.

Keep experimental visual flags separate from persisted topology identity. The new topology must be selected by a compatible build/content revision, not by the player’s graphics setting or a runtime “waterfall off” toggle.

Historical migrations may reference current world samplers. Trace those imports and test the entire supported chain against the candidate. Do not assume changing a sampler affects only the newest migration. Do not rewrite old migration results or expected fixtures simply to accept newly introduced relocation. The existing `migrateTerrainLayout17.ts` is useful evidence of support re-grounding, mount/player coupling, active-fishing origins and collision-aware recovery—not a template to copy without tracing. [R14]

### W06.2 — Resolve terrain/support ownership

- [ ] Use the heightfield for continuous ground; use catalog-backed static rock geometry with simplified static collision for the lip and exceptional cliff shapes.
- [ ] Ensure the hidden heightfield does not fill a new visible gorge or protrude through a walkable mesh. Carve the support coherently or keep the overhang non-traversable.
- [ ] Keep one authoritative support answer for each traversal query. Where stacked support exists, use the actor’s 3D context and the existing physics query path rather than selecting an arbitrary X/Z height.
- [ ] Avoid coincident terrain and rock colliders that produce jitter or contradictory contacts. Verify collision groups, static/kinematic interactions and camera-obstruction geometry.
- [ ] Preserve road crowns, shoulders, bridge entrances, pier stairs and terrain-grid triangle orientation. Reuse exact shared support geometry where already established.
- [ ] Validate ground slope, step height, clearance and reachable component using current controller tuning, not invented constants in rendering code.

Rapier distinguishes heightfield, triangle-mesh and other collider shapes; heightfields describe an X/Z grid with one elevation per vertex. Triangle meshes are appropriate for selected static shapes, while dynamic bodies should follow the project’s existing suitable hull/compound approach. Do not copy constructor signatures from current documentation without verifying the locked Rapier version. [E01]

### W06.3 — Build the affected-entity analysis

For each retained fixture, classify every persistent positional entity as unchanged, re-ground-at-same-XZ, locally relocate, or unresolved. Include players on foot, mounted players and their mount, active boats/passengers, unmounted mounts, placed structures, dropped/carried cargo, farm objects and any persisted fishing state.

Choose the least disruptive valid result in this order:

1. Preserve the existing pose when still valid.
2. Preserve X/Z and recompute canonical support Y when only height changed.
3. Relocate within the same reachable land/water component and island, preserving access and associations.
4. Use an explicitly approved recovery anchor only when local recovery cannot work.
5. Block that candidate migration when no rule preserves the necessary state; do not silently delete, sell, discard, cancel or teleport to a different island.

Validation must include slope, clearance, collision, landing access, correct region/ecology, boat hull clearance and applicable navigation restrictions—not just `isWalkable(x,z)`.

### W06.4 — Preserve compound relationships and active actions

Move player/mount and boat/passenger relationships consistently. Preserve cargo IDs, capacity assignments, attachments, freshness and ownership. Do not duplicate a physical fish as an inventory item.

For active basic/sport fishing, preserve the action state, target/habitat, line/origin geometry and deterministic progression where possible. Use an existing documented cancellation/recovery policy only when it applies; otherwise the fixture remains a blocker. Do not invent a refund or automatic success to hide a relocation failure.

For farming, preserve plot IDs, crop growth, soil and recurrence/time semantics. Do not resnap all farms globally because one upper river bank changed.

### W06.5 — Protect persistence transaction boundaries

Inspect `IndexedDbSaveRepository.ts` before changing storage behaviour. Migrate an in-memory copy, validate it completely, and only then commit through the existing primary/backup policy. A failed migration must preserve recoverable original data and show a recoverable failure state, never a fresh empty world.

Test storage failures, an interrupted commit, backup load, repeated load, and a newer-schema save presented to an older/incompatible reader. Use the existing two-slot policy; external test exports do not become a third live save slot.

Test multiple tabs/writers using the current locking/version protections. A new client’s guard does not automatically prevent an already-running old client from writing. Where legacy writers cannot be safely fenced, require an explicit compatible-update/closure strategy before same-origin rollout; do not claim a database-version bump alone solves old writer races.

### W06.6 — Run the migration/traversal matrix

- [ ] Migrate every retained supported revision through the full chain, not only the immediately previous one.
- [ ] Re-load an already migrated save: no duplicate relocation, lost state or repeated migration effects. Test the guarded migration entrypoint; only demand helper idempotence where its contract requires it.
- [ ] Perform save → reload → play → save → reload during on-foot, mounted, boat-driving, cargo-carrying, active basic fishing and active sport fishing scenarios.
- [ ] Confirm unaffected normalized gameplay fields and protected poses match the allowed-difference manifest.
- [ ] Traverse approach, lip-side path, pool route and downstream handoff in both directions, including camera obstruction and leaving/returning.
- [ ] Reject accidental boating/fishing through the fall or pool if excluded by the current gameplay contract.
- [ ] Test the whole preserved farm/bridge/pier/harbor loop after local terrain integration.

**G06 exit:** migrated saves validate and survive repeated play/reload; no unexplained relocation or protected-state drift; collision and support agree; experimental topology can be enabled for the candidate build.  
**Rollback:** before any real migrated save is written, restore the old candidate build/fixtures. After new saves exist, use a compatible forward fix or a reviewed backward migration. Do not restore an older binary that cannot read current saves. A visual feature flag cannot reverse topology safely.

---

<a id="w07"></a>

# 11. W07 — Build the waterfall and connected water presentation

**Outcome:** A low-poly waterfall reads as water leaving a lip, falling, impacting and draining—not a scrolling white rectangle.

### W07.1 — Separate surface ownership

Define ownership for upper channel, lip, falling sheet, impact pool and outflow. Exclude unrelated horizontal/base/near water surfaces from the falling segment and any area where they would overlap the wrong datum.

Use the W03 body/reach data. Do not teach the global ocean height sampler to return a vertical sheet’s Y or a rock overhang. Dedicated fall geometry is presentation over explicit topology, not a new boat-support surface.

### W07.2 — Construct a shaped principal sheet

Build a directed, uneven sheet between authored lip and landing cross-sections; its silhouette may bow or separate around rocks. Start with one principal water body and limited supporting ribbons. Keep the source endpoints and landing area visible enough to understand the connection.

Use generated dynamic geometry through the existing water path, and catalog-backed rocks through the asset path. Do not export a unique one-off rock GLB outside the catalog or put the animated water effect into a static asset pipeline that cannot control its flow.

### W07.3 — Add the effect in this order

1. A readable main aqua water body with restrained light/dark variation.
2. Surface streaks moving from the actual lip toward the landing, using distance along the sheet, not world-Z scrolling.
3. Limited breakup/ribbons and edge detail.
4. Localized impact foam tied to the actual intersection with the pool.
5. Pool foam patches that spread and settle into downstream outflow.
6. Sparse pooled spray; add local mist only after the structure works without it.

Use the existing palette/material and render-config owners. Avoid permanently white or emissive water; check dusk and night so foam remains readable without glowing independently of the scene.

### W07.4 — Integrate the render passes correctly

- [ ] Prefer an opaque/mostly opaque principal form when it fits the approved art treatment; reserve alpha blending for edges, spray and mist.
- [ ] Define depth-test/write and draw-pass ownership per component. Do not solve every artifact with `renderOrder` or `DoubleSide`.
- [ ] Keep refraction capture free of self-feedback: a water pass must not sample an output target it is currently writing or capture the same water twice.
- [ ] Confirm color-space/tone-map and atmospheric integration occur once through the existing pipeline; do not stack a local exposure correction over an incorrectly converted shader.
- [ ] Verify steep-sheet normals from its geometry/local tangent frame, not the ocean’s horizontal normal formula.
- [ ] Expand CPU-side bounding boxes/spheres to cover all shader-displaced geometry and particle extents. A zero-height source plane is not sufficient bounds for a raised fall.
- [ ] Test supported framebuffer/filtering paths and degraded optics without changing topology.

Three.js documents transparency-ordering limitations for overlapping/intersecting transparent geometry. More transparent layers are not a general fix for convincing water. [E02, E04]

### W07.5 — Make time and quality behaviour safe

Share appropriate presentation time/conditions at connected water handoffs; avoid discontinuities when pausing, resuming, loading, changing quality or moving the near patch. Preserve the existing distinction between simulated waterline and visual bob/waves.

Reduced motion can reduce streak contrast, spray, mist drift and other purely visual motion. It must not desynchronize the rendered low-frequency surface from the CPU surface used for bobbing. Keep quality-independent physical footprints and channel/support restrictions.

### W07.6 — Verify connectivity in stills and motion

Inspect above/below/side views of the lip, falling section, pool and outflow; also use only the legal player camera and routes. Include entry/exit of the near-water patch, far distances, transition to low quality, storm conditions and dusk/night.

Use endpoint equality and rendered join tests separately: identical authored endpoints do not prove that differently tessellated or shaded meshes meet visibly. No gaps, z-fighting, duplicate horizontal planes, dark transparent rectangles, upstream-moving streaks or pool edges floating above ground are acceptable.

**G07 exit:** the complete animated slice connects visibly and physically, compiles on tested render paths and preserves the G06 safety evidence.  
**Rollback:** fall back to the simpler tested water presentation while keeping the same candidate topology and safe support. Never remove the visible falling body entirely while leaving an unexplained new gorge.

---

<a id="w08"></a>

# 12. W08 — Finish terrain, riverbanks and shallow seabed in the slice

**Outcome:** The landscape remains convincing with particles, grass and decorative props disabled.

### W08.1 — Refine macro and middle-scale landforms

Preserve broad valley readability. Add only the necessary shoulders, saddles, benches and exposed faces that explain the local watercourse and viewpoint. Avoid increasing terrain resolution globally to solve a few near-bank contacts.

On continuous terrain, retain the shared support basis. On exceptional rocks, use approved meshes with buried/interlocking joins. Keep cliff strata/planes coherent within one rock family; do not turn every surface into random high-frequency noise.

### W08.2 — Finish the contact sequence

In this order, inspect and repair:

```text
path crown → shoulder → surrounding ground
upper bank → lower damp bank → submerged bed
rock face → buried base → terrain
pool edge → depth transition → outflow
shore ground → wet band → shallow seabed
building/working pad → graded approach → route
```

Do not conceal seams with reeds, foam or rocks until geometry and material weights agree. Wetness must not create floating shiny strips or a second shoreline inconsistent with water membership.

### W08.3 — Use surface-specific geometry and normal treatment

Keep meadow/field planes calm; reserve sharper angular breaks for exposed rock/cliffs. Resolve bank/shore contacts locally. Suppress dominant regular triangle-grid shading on walkable ground while retaining deliberate silhouette facets. Use the existing terrain/material authority, not an indiscriminate `flatShading=true` rewrite. [R01, R04]

### W08.4 — Author distinctive river reaches

Within approved envelopes, finish a quiet pool/run, a shallow stony run, an outside-bank treatment, an inside depositional shelf and the transition toward the estuary. Use existing curvature/erosion/deposition fields rather than re-scattering mirrored banks. Keep the bridge-lock region and existing fishing access reserves protected. [R09]

Use subtle advected surface patterns for quiet flow and localized whitewater at actual constrictions. All visual motion follows the reach coordinate. Do not add riverbed obstructions that silently trap an active fish encounter or invalidate a fishing-line path.

### W08.5 — Author shallow seabed shapes and reconcile depth use

Improve visible shelves, sand tongues, embedded rocks and small deeper pockets only where the gameplay camera can read them. Keep bed geometry continuous with shore ground.

Use actual bed depth for optics. For marine/gameplay consumers, retain the existing proxy until a separately tested consumer switch is approved. A switch to physical depth can change fish distribution, hazard gates, line dynamics or boat constraints even without changing water membership. Do not bundle that change with aesthetic seabed work.

The depth-map bake must remain downstream of the terrain/support owner; it must not create a marine → terrain → marine cycle. Test that actual depth, signed mask and baseline agree near the source, pool, banks and all modified shelves.

### W08.6 — Re-run the topology gate when necessary

Every collider, traversable slope, reach footprint or baseline change introduced here must update the affected-envelope report and pass W06’s checks again. “Finishing pass” is not a save-safety exemption. Group compatible unpublished edits into the candidate revision deliberately; never mutate a revision already released to players.

**G08 exit:** neutral/frozen/cover-off views and ordinary gameplay views pass; local geometry solves the contacts without excessive detail; topology deltas are accounted for.  
**Rollback:** retain finished materials only when compatible with the prior tested geometry; otherwise restore the complete local terrain/maps/collision bundle together.

---

<a id="w09"></a>

# 13. W09 — Complete one integrated art, atmosphere and audio slice

**Outcome:** The spring–fall–river journey has coherent assets, habitat, sound, atmosphere and camera readability, and is ready to serve as the expansion reference.

### W09.1 — Produce a small coherent asset kit

Inventory existing assets before adding any. Reuse or selectively adapt suitable cliff/lip rocks, bank boulders, embedded fragments, one or two relevant tree forms, understory/reeds and a small number of route details.

For each changed/new static asset, follow the actual `BLENDER.md` / CLI route: catalog selection, scoped reference/brief where required, family-generator parameters, generation/staging, validation, optimized publication, runtime integration and Art Yard/game review. Do not call mass `generate_all`, download a replacement asset, or publish a direct ad hoc export. [R01, R15]

Verify dimensions, unit scale, pivot, rotations, material/palette reuse, collision proxies, LOD silhouette and resource budgets from their owning catalog/configuration. New IDs are proposed only after catalog review; do not treat this plan’s descriptive asset names as existing IDs.

### W09.2 — Compose habitat groups, not uniform scatter

Extend `WorldCompositionField.ts` and `WorldEnvironmentLayout.ts` with local masks/grouping that preserve stable seeded addresses and independent category randomness. Use the existing route, architecture, fishing, opening and shore clearances. [R12]

Compose a dominant group, supporting group and purposeful open area at the main views. Put roots or understory where the bank supports them; keep exposed cliff faces and working paths comparatively open. Use coherent variation within groups rather than a different arbitrary scale/color at every instance.

Quality changes must select stable subsets or equivalent representations. They must not reseed the world, move a collidable trunk, block a previously clear route, remove the hero landmark, or alter a resource’s availability.

### W09.3 — Add local waterfall/river sound through the audio owner

Read the full routed audio design and actual runtime/manifest before adding cues. Use licensed/provenanced assets or the existing procedural mechanism as authorized. Do not introduce an external provider call implicitly.

Create a distance-shaped fall sound that becomes audible on approach, with a local impact component and quieter downstream character. Reuse the existing bus/mix/settings model. Use geometry-aware attenuation/occlusion only to the extent supported or cheaply justified; do not create an expensive per-frame raycast system for every decorative emitter.

Test actual listening, mute/volume settings, suspend/resume, entering interiors, pause/modal states, repeated entry/exit, cancelled loading and cleanup. No duplicate loops or waterfall sound continuing after its scene is disposed. Audible changes require listening evidence; waveform inspection alone is not approval. [R01, R04]

### W09.4 — Tune existing lighting and atmosphere

Keep one global color pipeline and lighting rig. Tune the shared configuration, regional environmental inputs and local damp/mist parameters—not per-zone tone mapping or exposure hacks.

Protect navigational contrast at midday, dusk, night and in storms. Keep mist local enough to preserve the water’s silhouette and route. Avoid heavy bloom, depth of field, permanent white foam, photographic textures and microdetail that conflicts with the approved coastal language.

### W09.5 — Extend existing camera framing gently

Use `ExplorationFraming.ts` and `GameCamera.ts`; preserve manual orbit/input and task-state behaviour. Add local framing hints only when the default gameplay view benefits, with bounded smoothing and respect for player control. No involuntary rotation to force a reveal.

Check on-foot, mounted, boat-driving and fishing states; the waterfall should not alter unrelated fishing camera or UI focus. Re-test occlusion and tree/rock collisions on approach and return. [R16]

### W09.6 — Run the slice decision

Present matched gameplay-camera comparisons and short motion traversals. Review:

- [ ] The river visibly comes from a source, passes over a lip and leaves the pool.
- [ ] The source, fall and river are recognizable at ordinary gameplay distances.
- [ ] Large and middle-scale forms carry the image; no noise or vegetation is concealing weak terrain.
- [ ] Ground, route, rock, bank and water contacts are coherent.
- [ ] The approach/reveal/return route is usable without forced camera behaviour.
- [ ] Sound, mist and movement reinforce the same place.
- [ ] All tiers preserve landmark and route identity.
- [ ] Save/traversal/performance gates apply to the exact reviewed input set.

Record human visual acceptance in the existing baseline decision registry and status checklist, with its exact scope. Record technical and asset-certification decisions separately. Never overwrite old expected screenshots to make an unintended change pass. The agent’s own critique is useful evidence, not a substitute for required human approval. [R04]

**G09 exit:** a visually accepted and technically validated connected slice; remaining independent gates explicitly named. Expansion depending on visual approval stays blocked until that approval exists.  
**Rollback:** restore the previously accepted local asset/configuration bundle. Keep migrations and geography compatible; do not roll back topology through an art flag.

---

<a id="w10"></a>

# 14. W10 — Expand deliberately across Neva and Sunreach

**Outcome:** The world gains a consistent visual language without losing its regional differences or becoming a mass-generated collection of props.

### W10.1 — Expand one route/region at a time

Proposed order after G09:

1. Upper river to farm-side approaches.
2. Village bridge and adjacent river corridor.
3. Lower river and estuary, preserving lake/quest semantics.
4. Harbor connections and southern beach outside the protected reference core.
5. Western overlook/beach and lighthouse headland.
6. Northern/eastern exposed shores and the channel-facing coast.
7. Sunreach cove → terraces → scrub/ridge → reef outlook.

Keep each regional patch independently reviewable. Reuse the proven systems, but author local forms, vegetation massing, sightlines and shore character. Do not copy the same waterfall, rock arrangement or tree cluster everywhere.

### W10.2 — Apply a regional work card

For every region record: player purpose; primary landmark and approach/reverse views; permitted terrain envelope; protected anchors/actions; coast/river type; habitat group structure; changed asset IDs; candidate topology/migration impact; matching-quality budget impact; acceptance artifacts.

No regional patch closes on “looks better” alone. Re-run its linked gameplay: farming/station approaches for farm areas, casting/fish encounters for river banks, cargo and launch/landing for harbor areas, navigation and reef access for Sunreach.

### W10.3 — Preserve contrast between islands

Neva remains temperate, with shaded riparian groups and open working valleys. Sunreach uses its existing warm/dry cove, terraces, scrub/ridge and reef geography to guide vegetation and shore treatment. This is not permission to change climate multipliers or crop suitability. [R07]

Protect the sea crossing as a readable transition. Keep the existing boat/progression requirement and valid return routes. Avoid visual cues that promise an unexplored accessible island or shortcut that does not exist.

### W10.4 — Keep preservation expectations honest

Intentional local composition changes may require updating reference expectations. Show the before/after allowed-difference manifest, reason and human scope; never remove the preservation test wholesale or broaden thresholds until it stops detecting regressions. Retain checks outside changed envelopes and gameplay-preservation checks everywhere.

**G10 exit:** every region has independent visual, gameplay and performance evidence, and the full connected loop still works.  
**Rollback:** regional art/presentation can roll back independently when geography is unchanged. Released regional topology changes require the same compatible forward-fix rules as W06.

---

<a id="w11"></a>

# 15. W11 — Production performance, lifecycle and browser hardening

**Outcome:** The finished world remains responsive and coherent on named target hardware and supported browsers, including degraded graphics paths.

This phase consolidates profiling already performed during W00–W10. It is not permission to postpone all performance work until the end.

### W11.1 — Re-run production budgets on frozen input

Run existing production budget and download checks before adding new arbitrary numeric ceilings. Inspect `spatialSurfaceBatch.ts` and actual `WorldScene.ts` use. Batching is not terrain simplification or streaming; reducing draw calls does not prove the fragment shader is cheap. [R03, R13]

Profile worst views deliberately: broad coastal horizon, overlapping foam/spray/mist, the entire waterfall, dense river vegetation, shadow-heavy dusk, storm, near-patch edges and boat approach. Include cold shader/asset load separately from warm traversal.

Record frame-time p50/p95/p99, visible primitive counts, draw submissions across passes, render-target dimensions, program/texture/geometry counts and load/long-task data. Query GPU time asynchronously when supported, discard invalid/disjoint measurements, and label unsupported GPU timing rather than substituting an FPS-derived guess. [E06]

### W11.2 — Optimize in evidence order

1. Remove redundant passes, duplicated water, invisible work and unnecessary transparent overlap.
2. Reduce expensive pixel work and capture resolution/coverage where visually safe.
3. Reduce shadow burden for small cover and unimportant effects.
4. Fix culling/bounds and use existing batching/instancing paths.
5. Reduce far-detail geometry, particle counts and noisy high-frequency shading.
6. Optimize control-map preparation/caching and asset payloads where measured.

Preserve gameplay membership/support across tiers. Low quality must not restore misclassified water, remove the waterfall entirely, alter the shore or move collidable vegetation.

Do not introduce global terrain decimation until the profiler proves a geometry bottleneck. Local LOD must preserve contact/silhouette regions and joins, and use a non-popping handoff. Avoid a broad streaming rewrite unless the measured working set requires it.

### W11.3 — Verify resource lifecycle

- [ ] Repeatedly enter/leave the slice and change quality; counts stabilize after warmup rather than growing monotonically.
- [ ] Dispose owned geometry/materials/textures/targets and stop owned audio emitters/listeners when appropriate. Shared resources stay alive until their last owner releases them.
- [ ] Abort/cancel preparation safely; stale async completions do not attach objects after disposal or replace a newer generation.
- [ ] Rebuild any required GPU resources after supported context restoration; otherwise use the existing recoverable error/reload flow without save loss.
- [ ] Test resize, DPR change, tab suspension/resume, pause, loading cancellation and repeated new-game/load flows in isolated fixtures.

Removing a Three.js mesh from the scene does not dispose its geometry, material or textures. Use explicit ownership and disposal; internal reusable caches need not reach zero to pass a leak test. [E05]

### W11.4 — Use separate validation lanes

| Lane | What it proves | What it does not prove |
|---|---|---|
| Static/unit/simulation | Contracts, math, state transitions, migrations | Actual shader output, appearance, hardware performance |
| Software/headless WebGL | Shader compilation, deterministic captures, many rendering regressions | Target-device frame budget or complete browser behaviour |
| Production Chrome on target hardware | Primary render/performance behaviour under recorded conditions | Firefox/Safari behaviour |
| Firefox | Engine-specific shader/render/input smoke and representative play | Real Safari compatibility |
| WebKit automation | Useful additional engine smoke coverage | Equivalence to an actual Safari version/device |
| Actual Safari desktop | Required real Safari rendering, input, audio and persistence evidence | Other platforms not tested |
| Human visual/listening/play review | Art quality, clarity, navigation and audible impression | Numerical or migration correctness by itself |

The current repository CI is Chrome-focused. Additional Firefox/WebKit/Safari checks are proposed release coverage; add them deliberately rather than claiming they already exist. Use named Playwright projects only after checking/adding their configuration and installing the pinned browsers. [R03, E07]

### W11.5 — Establish measurable pass criteria

Existing repository hard budgets are authoritative. Proposed additional regression policy: investigate a repeated same-machine p95/p99 regression beyond normal baseline variability, and block release when it breaches the adopted target budget. Record the baseline variability and allowed delta before running the candidate; do not enlarge a threshold after a failure simply to pass.

A device already below the target at baseline needs an explicit remediation/degraded-tier decision. “Only 5% slower” is not sufficient when it already misses the required budget. Match actual quality, effective DPR, power state, browser, scene and build mode in comparisons. Do not add CPU and GPU timings as though their pipelined work necessarily sums directly to one frame.

**G11 exit:** machine-owned budgets pass, lifecycle loops stabilize, required browser lanes have current evidence, unsupported metrics and blockers remain explicit.  
**Rollback:** reduce or revert compatible presentation cost first. Do not solve performance by silently changing collision, resources, fishing access or saved topology.

---

<a id="w12"></a>

# 16. W12 — Release candidate, cleanup and compatible rollback

**Outcome:** One reproducible candidate can be shipped without pretending visual approval, software rendering and save compatibility are interchangeable evidence.

### W12.1 — Clean the implementation boundary

- [ ] Remove obsolete effect coverage, duplicate masks and temporary debug scaffolding no longer required.
- [ ] Retain useful diagnostics through the existing DEV/test gates; do not ship test cheats or auto-teleport helpers in ordinary play.
- [ ] Keep one final owner for coast/reach definitions, depth generation, water conditions, material parameters and palette.
- [ ] Update the owning architecture/art/pipeline/audio sections and the single migration ledger only where the contract changed.
- [ ] Ensure proposed interfaces in this plan have not been copied into canonical docs as though they exist when they do not.
- [ ] Preserve user changes and approved references unrelated to the overhaul.

### W12.2 — Run final acceptance on the exact candidate

Run the verified CI-style generated checks/static/tests/build/download checks, production budget suite, relevant E2E/visual suites, full frozen world acceptance, retained save fixtures and connected-loop play/reload matrix. Asset certification and human visual approval remain separate gates. Use the existing tooling’s real options, not imagined CLI flags.

Re-run expensive evidence after changes to included source, catalog, asset, palette or render config. Record input hashes. A screenshot or hardware pass on an earlier build does not certify a materially different final candidate.

### W12.3 — Verify deployment consistency

Package compatible code, catalog adapters, assets and generated maps as one versioned release. Check missing/old asset responses, browser cache behaviour and stale-page refresh. If a service worker exists, inspect and test its update path; do not introduce one for this task or assume one is already present.

Preserve the old compatible asset set long enough for already-loaded clients to resolve its versioned resources. Check the supported older-client/newer-save behaviour, update messaging and multi-tab write protection before release. Avoid mixing old data textures with new geometry through cached filenames.

### W12.4 — Prepare rollback by change class

| Failure | Safe response |
|---|---|
| Pure shader/particle/audio regression | Revert compatible presentation code or use a tested reduced visual path |
| New asset/config defect, unchanged topology | Restore compatible asset/config bundle; preserve IDs and generated ownership |
| New topology not yet used by real saves | Restore candidate and copied fixtures to the previous tested revision |
| New topology already persisted | Forward-compatible repair or reviewed reverse migration; do not blindly deploy an unreadable older binary |
| Migration/load failure | Preserve original/backup, show recovery path, do not silently start a new world |
| One browser lacks an optical capability | Supported reduced optics with the same geometry/gameplay, or a clear recoverable unsupported state |
| Missing required human/hardware approval | Keep release gate open; report what is ready and what evidence is missing |

### W12.5 — Record completion precisely

Final report includes the source/asset input identity, changed scopes, approved differences, all gate results, commands/artifacts, migration versions, human approval references, hardware/browser details, known limitations and compatible rollback method.

Use **implemented**, **unit-tested**, **browser-verified**, **visually accepted**, **hardware-profiled** and **release-ready** as separate states. No unchecked required gate becomes “passed” because an agent completed the code.

**G12 exit:** all required candidate-specific gates pass and release authorization exists. This work order itself does not authorize deployment or destructive repository operations.

---

<a id="validation"></a>

# Appendix A — Required regression and acceptance matrix

Add coverage to existing suites/harnesses first. The scenario IDs below are proposed evidence labels, not claims that corresponding tests already exist.

| ID | Scenario | Required assertion/evidence | First gate |
|---|---|---|---|
| GEO-01 | Western sea probe `(-220, -60)` | Water membership and render-region classification agree with ocean location; no full river weight | G02 |
| GEO-02 | North/east/south/west on each island | Coast projection points toward local water; no global-axis misclassification | G02/G03 |
| GEO-03 | Dry points near river and island edges | No visible water sheet or flow influence leaks onto dry ground | G03/G04 |
| GEO-04 | River finite source cap and headwater bounds | River ends at source; no raised-water triangles outside owned footprint | G03/G07 |
| GEO-05 | Estuary overlap and lake school | Smooth presentation handoff; original ecology, habitat and quest IDs preserved | G02/G10 |
| GEO-06 | Shore corners, concavities and nearest-segment changes | Stable projected direction/ownership; bounded search succeeds or safely rejects | G03 |
| GEO-07 | All derived-map edges/texel centers | Consistent bounds/encoding; no unexpected clamp strip or mixed datum | G03 |
| GEO-08 | Flow angles near -π/+π and opposing influences | Interpolation yields intended direction, not a wraparound reversal or zero/NaN vector | G03 |
| GEO-09 | Signed proximity versus actual distance | Consumers do not assume blended field gradient length equals one | G03 |
| GEO-10 | Bed-depth consumer comparison | Optical depth uses actual support; gameplay proxy changes only where explicitly approved | G03/G08 |
| ACCESS-01 | Valid shore access on both islands | Stable footing, clear approach/cast, correct nearest target and habitat | G02 |
| ACCESS-02 | Cliff edge, obstructed cast, too-far shore | Correct rejection; no teleporting target to a distant coast | G02 |
| ACCESS-03 | Bridge deck/approach and pier/stairs/slips | Existing traversal, fishing, hull clearance and support remain correct | G02/G06 |
| ACCESS-04 | Existing river fishing reserves | Enough approach/cast clearance after vegetation and bank changes | G08/G09 |
| WATER-01 | CPU math vs decoded map vs GPU result | Separate error budgets; shader compiles and output is numerically/visually checked | G03/G07 |
| WATER-02 | Near patch crosses river/sea/fall boundaries | No disappearing surface, duplicate plane, sudden datum change or phase reset | G07 |
| WATER-03 | Lip → sheet → pool → outflow | Matching endpoints and actual rendered continuity through the full motion sequence | G07 |
| WATER-04 | Grazing angles and transparent overlap | No dark rectangles, incorrect sorting, doubled fog/color, or self-refraction | G07 |
| WATER-05 | All coast kinds and reference harbor | Intentional foam/contact coverage; reference-led harbor remains coherent | G04 |
| WATER-06 | Reduced motion, quality changes, pause/resume | Physical surface/membership unchanged; bobbing and rendered waves remain consistent | G07/G11 |
| TERRAIN-01 | Neutral material, cover/foam disabled | Large forms and contact geometry work without concealment | G05/G08 |
| TERRAIN-02 | Heightfield/mesh/road joins | Shared support agrees; no hidden ground in gorge, floating feet or collision jitter | G06/G08 |
| TERRAIN-03 | Render displacement/culling bounds | Fall and spray remain visible when near frustum edges or viewed from far away | G07 |
| SAVE-01 | All retained legacy fixtures | Full migration chain validates; only approved fields/poses differ | G06 |
| SAVE-02 | Already-current fixture reloaded repeatedly | No repeat migration effects, duplicate relocations, cargo duplication or drift | G06 |
| SAVE-03 | Mounted/on-foot/boat/cargo states | Stable relationships, clear pose, correct support and inventory/ownership preserved | G06 |
| SAVE-04 | Active basic/sport fishing | Resume/recovery follows approved rules; no silent catch, loss, cancellation or ecology switch | G06 |
| SAVE-05 | Storage failure, interrupted write, invalid candidate | Original/backup recoverable; no destructive fallback to new game | G06 |
| SAVE-06 | Older/newer client, newer save, multiple tabs | Incompatible writes cannot silently overwrite a migrated save; defined upgrade/recovery path | G06/G12 |
| WORLD-01 | Composition seeds 0–63 plus repeated seed | Existing full harness preserved; intentional local changes isolated and documented | G09/G10 |
| WORLD-02 | Farm → process → sail → fish → carry → sell | Full connected loop and save/reload remain functional | G10/G12 |
| PRESENT-01 | Approach/reveal/reverse gameplay camera | Landmark and route legible without forced rotation; no obstruction regression | G09 |
| AUDIO-01 | Listen; mute/suspend/leave/re-enter | Correct mix and locality; no duplicate/stuck loops or suspended-context failure | G09 |
| PERF-01 | Matched production scenes and target hardware | Existing budgets plus adopted frame goals; no DEV/production substitution | G11 |
| PERF-02 | Repeated visits, tier switches and aborted loads | Resources stabilize; no stale async attachment or disposal of live shared resources | G11 |
| BROWSER-01 | Chrome/Firefox/WebKit/actual Safari lanes | Required per-engine evidence and actual Safari distinction recorded | G11 |
| RELEASE-01 | Cached/missing assets and stale clients | Consistent code/catalog/maps/assets; compatible save/update behaviour | G12 |

## Error tolerances and thresholds

Do not copy numerical tolerances blindly across layers.

- **Unchanged topology:** require identical classification away from the declared numerical boundary band; log every sign difference and investigate whether it reflects a real footprint change.
- **Authored joins:** require the same endpoint data and datum. A very small CPU-coordinate comparison tolerance, such as `1e-5 m`, is a proposed numerical check for shared authored data—not a GPU precision claim.
- **Rendered joins:** evaluate actual geometry discretization, filtering, displacement and camera views. Preserve the existing headwater chord-error test’s purpose; the inspected test uses a less-than-3 cm criterion for its sampled profile. Do not infer that all new waterfall geometry automatically meets it. [R11]
- **CPU/GPU waves:** establish separate tolerances for analytic math, encoded/interpolated maps and actual rendered coarse meshes. Test error across the entire supported roughness/wind/time range, not one favorable frame.
- **Traversal support:** derive tolerances from the current actor/controller and existing exact road/bridge/pier contracts. No threshold may permit visible floating or trapping merely because the test passes.
- **Visual diffs:** pin inputs/environment; require review of intentional changes. A looser global screenshot threshold is not an accepted fix.
- **Performance:** preserve machine-owned hard limits. Define target hardware, variability, adopted frame-time target and any permitted regression before profiling the candidate.

No later agent may relax a threshold solely to close a failed gate. Any justified change needs the old/new limit, rationale, evidence and owning-source update.

---

# Appendix B — Failure modes and stop conditions

| Failure mode | Preventive measure | Stop condition |
|---|---|---|
| Fixing a stale audit finding that no longer exists | Reproduce at the current SHA before patching | No reproduction: document and skip the correction |
| A shader change silently changes habitat or navigation | Separate physical/semantic water from render weights | Any unexplained gameplay output or save delta |
| A “distance” mask is not a true distance field | Declare metric/proximity contract; project against actual segments | Unbounded/incorrect target projection |
| New depth queries introduce recursion | Ordered evaluation graph; separate raw and derived queries | Circular sampling or order-dependent results |
| Angle-texture filtering reverses flow | Wrap-aware/vector encoding tests | Direction discontinuity or NaN |
| Adjacent meshes display different water levels | Shared body datums and surface ownership | Seam, duplicate plane, floating pool or wrong support |
| New rocks block old routes or fishing | Protected envelopes, collision and casting tests | Player/cargo/quest/boat access lost |
| Old migrations change because a sampler changed | Full retained-chain tests; history-aware import trace | Unapproved legacy fixture relocation/state drift |
| A new graphics setting changes world truth | Quality-independent topology/revision | Different membership, collider, ID or save result by tier |
| A migration overwrites recoverable data | Copy → migrate → validate → existing atomic save policy | Failed load/write destroys primary or backup |
| Old tabs overwrite newer saves | Verify actual legacy writer/update protection | Unsupported concurrent writer path remains |
| Warm screenshots hide load or motion bugs | Cold start, movement and lifecycle captures | Pop, load stall, shader/capture error or missing effect |
| Test aliases hide generated drift | CI check-before-regenerate sequence | Unexplained generated changes after checks/build |
| Art overrides become a parallel renderer | Use palette/config/material owners | Per-zone exposure, duplicate baseline or arbitrary color owner |
| Approvals are overstated | Separate exact-scope human, software and hardware evidence | Required gate missing on final input identity |

Do not abandon unrelated independent work because one decision is blocked. Isolate the blocker, preserve the last compatible build, and continue only work that does not assume the blocked decision has passed.

---

# Appendix C — Commands and evidence recipes

## C.1 Focused development checks

After verifying the affected files exist and the local dependencies are installed:

```bash
# Example for water/headwater changes: adjust to the actual affected suite.
npx tsc --noEmit
npx vitest run \
  tests/unit/headwaterWater.test.ts \
  tests/unit/waterSurfaceNormal.test.ts \
  tests/unit/waterShaderLinkage.test.ts

# Lint changed source/test paths; do not run auto-fix as a blanket cleanup.
# Use actual changed paths, not this plan's proposed interface names.
```

Do not claim that these three tests alone prove terrain, migrations or production performance. Follow the repository's task-to-verification matrix and broaden according to actual risk. [R04]

## C.2 World evidence

The following options were verified in the reviewed `tools/world/acceptance.mjs`; check again before execution on a changed tool. [R06]

```bash
npm run world:acceptance -- --scope starter-terrain --lane software
npm run world:acceptance -- --scope starter-terrain --lane hardware

# Full-world gate after expansion:
npm run world:acceptance -- --scope world --lane both
```

These are potentially expensive integration runs. Run against a frozen input manifest. A missing hardware capability is **not run/blocked**, not a software substitute. Do not run the costly full acceptance suite after every isolated color adjustment.

## C.3 Release evidence

Use the check-before-regenerate sequence in W00, followed by the applicable existing suites:

```bash
npm run test:e2e
npm run visual:test
npm run test:budget
```

Review all command definitions for side effects, ports, build mode and browser configuration. `visual:update` updates expected images; it is not an acceptance command. Run it only for explicitly reviewed intentional baseline changes with appropriate scope.

Selected art production uses actual catalog IDs and the selectors required by the existing Blender CLI. Full strict/determinism/certification checks follow the repository's milestone/release matrix; routine asset work does not automatically require regenerating the entire catalog. [R01, R04, R15]

---

# Appendix D — Agent work card and progress protocol

Use this concise work card for one item such as W02.1 or W07.3:

```text
Work item:
Player-visible outcome:
Current commit/input identity:
Owning source and affected callers:
Class: P / B / T
Allowed files / envelope:
Preserved contracts:
Approved differences:
Save/migration impact:
Implementation steps:
Focused tests and actual gameplay evidence:
Matching-quality performance check, where relevant:
Owning documentation updates:
Rollback boundary:
Result: implemented / validated scope / blocked gates
Evidence artifact paths:
Next dependency-safe work item:
```

Before reporting a work item complete, review the actual diff for unrelated changes, duplicate authorities, changed identifiers, altered tuning, new dependencies, weakened tests and regenerated output. Prefer a small reversible commit rather than combining topology, shaders, assets and migrations into one opaque patch.

Use one implementing agent per owning source. A reviewer can independently inspect changes/evidence but must not claim tests it did not run. For parallel read-only review, divide by evidence concern—geography, persistence, rendering or art—then resolve changes through the same owner.

<a id="kickoff"></a>

## Ready-to-use kickoff prompt

```text
Read NEVA_WORLD_OVERHAUL_IMPLEMENTATION_PLAN.md as a scoped work order.
Root AGENTS.md and its routed repository authorities remain authoritative.

Start with W00 only, followed by the necessary W01 reproductions when W00's
source/fixture isolation is established. Do not jump to final art, rewrite the
water renderer, upgrade dependencies, change production topology or touch
real player saves.

Verify the current checkout against the plan's audited SHA. Read the actual
owners and callers. Preserve unrelated working-tree changes. Check generated
adapter drift before any asset-sync prehook can regenerate it. Use the existing
world/visual/production evidence tools, not a parallel harness.

Deliver the baseline input identity, command results, affected-owner map,
protected-state fixture strategy, reproduced/not-reproduced audit findings,
and exact open visual/hardware gates. Distinguish source inference from actual
browser observation. Do not mark unrun checks as passed.

Then identify the next dependency-safe work item. Implement at most one bounded
work item at a time with its evidence and rollback boundary. No mass asset
production before the integrated slice's scoped visual approval. No production
release without the final save, browser, hardware and authorization gates.
```

The kickoff deliberately starts with evidence rather than directing the agent to “make everything amazing.” This prevents a broad request from becoming an uncontrolled rewrite.

---

<a id="sources"></a>

# Appendix E — Source index and authority references

All repository links below are pinned to the reviewed commit. Recheck owners on the execution checkout. Some owners were inspected in the preceding source audit; the plan additionally rechecked `main`, root routing, package/CI commands, world acceptance, layout revision and migration handling. A referenced authority is not a claim that its full contents or every code path were tested.

- **R01 — Root routing, invariants and asset rules:** [AGENTS.md](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/AGENTS.md).
- **R02 — Declared dependencies, scripts and prehooks:** [package.json](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/package.json).
- **R03 — Check ordering, production budget and Chrome-focused CI:** [.github/workflows/ci.yml](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/.github/workflows/ci.yml).
- **R04 — Task contracts, validation matrix, visual-gold gates and persistence routing:** [03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md). The executing agent must read all sections required by root routing, including §25 for migrations.
- **R05 — Layout revision and stable gameplay anchors:** [WorldAnchors.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/world/WorldAnchors.ts). Architecture/persistence authority: [01_GAME_FOUNDATIONS_ARCHITECTURE.md](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md), particularly the single ledger in §6.1; inspect full required sections before implementation.
- **R06 — Existing scenes, overlays, lanes and composition evidence:** [tools/world/acceptance.mjs](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/tools/world/acceptance.mjs).
- **R07 — Island topology, ecology and Sunreach anchors:** [WorldIslands.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/world/WorldIslands.ts).
- **R08 — Water classification, optics, swash and shaders:** [WaterSurface.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/render/water/WaterSurface.ts), [CoastalOptics.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/render/water/CoastalOptics.ts), [ShoreFoam.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/render/water/ShoreFoam.ts), [FacetedWater.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/render/water/FacetedWater.ts), [waterShadingGlsl.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/render/water/waterShadingGlsl.ts).
- **R09 — Terrain/support, river profile, membership, depth and fishing access:** [WorldLayout.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/world/WorldLayout.ts).
- **R10 — Current spring profile, summits and foothill trails:** [NevaHeadwaters.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/world/NevaHeadwaters.ts), [NevaLandforms.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/world/NevaLandforms.ts).
- **R11 — Existing headwater/wave contract tests:** [headwaterWater.test.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/tests/unit/headwaterWater.test.ts), [waterSurfaceNormal.test.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/tests/unit/waterSurfaceNormal.test.ts), [waterShaderLinkage.test.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/tests/unit/waterShaderLinkage.test.ts).
- **R12 — Habitat/composition owners and evidence:** [WorldCompositionField.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/world/WorldCompositionField.ts), [WorldEnvironmentLayout.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/world/WorldEnvironmentLayout.ts), [worldCompositionEvidence.test.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/tests/unit/worldCompositionEvidence.test.ts).
- **R13 — Spatial batching and additional existing test locations:** [spatialSurfaceBatch.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/render/scene/spatialSurfaceBatch.ts), [tests/unit](https://github.com/arthlor/nevagame/tree/688fec961dc3f08fc4184087d2a753339fa623d2/tests/unit). Presence of tests is not a passing result.
- **R14 — Inspected support/mount/fishing-aware migration example:** [migrateTerrainLayout17.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/persistence/migrateTerrainLayout17.ts). Read [src/persistence](https://github.com/arthlor/nevagame/tree/688fec961dc3f08fc4184087d2a753339fa623d2/src/persistence) and the retained fixtures before changing the chain or storage.
- **R15 — Required asset-production owners:** [LLM/BLENDER.md](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/LLM/BLENDER.md), [tools/blender/README.md](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/tools/blender/README.md). Referenced by root routing; read in full before asset implementation.
- **R16 — Existing contextual camera-framing owner:** [ExplorationFraming.ts](https://github.com/arthlor/nevagame/blob/688fec961dc3f08fc4184087d2a753339fa623d2/src/render/camera/ExplorationFraming.ts).

External technical references were consulted on 16 September 2026. They explain principles; the repository's locked versions and established pipeline determine supported APIs.

- **E01 — Rapier collider types and heightfield restrictions:** [Colliders — JavaScript guide](https://rapier.rs/docs/user_guides/javascript/colliders/).
- **E02 — Linear workflow, non-color data and custom shader output:** [Three.js color management](https://threejs.org/manual/en/color-management.html).
- **E03 — Screenshot-baseline environmental consistency:** [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots).
- **E04 — Transparency sorting/intersections:** [Three.js transparency](https://threejs.org/manual/en/transparency.html).
- **E05 — Explicit disposal and shared-resource caveats:** [Three.js disposal guide](https://threejs.org/manual/en/how-to-dispose-of-objects.html).
- **E06 — GPU query/disjoint timing principles:** [MDN EXT_disjoint_timer_query](https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query). Use the appropriate supported WebGL-version extension; do not assume availability.
- **E07 — Browser channels/projects and engine coverage:** [Playwright browsers](https://playwright.dev/docs/browsers).

---

## Final execution principle

**Fix geographical truth → preserve saves and support → prove one connected place → finish its art and sound → expand in controlled regions → validate the exact release.**

The world should become more intentional, not merely more complicated.
