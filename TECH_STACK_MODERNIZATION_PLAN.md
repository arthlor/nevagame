# Neva Tech Stack Modernization Plan

Status: paused at the user's request on 2026-10-02 after production validation of the bounded shadow-caster traversal fix. M01–M08 local migration delivery is complete; Three.js r186 feature adoption retains the requirement that it must not decrease performance. Full feature/combined performance, personal live acceptance and release gates remain open. Resume from [the current pause handoff](output/three-r186-features/2026-10-02/PAUSE_HANDOFF.md) after an explicit user resume.

Prepared: 2026-09-29. Version targets reflect the dependency audit performed for this plan and must be rechecked when implementation begins.

This is an execution proposal, not a new technical authority. Root `AGENTS.md` and its routed canonical documents govern implementation. Current code and the lockfile own installed versions; the values below are an audit snapshot.

## Objective

Deliver three outcomes: smoother gameplay, a current and maintainable runtime, and faster development and asset production. Each upgrade includes the code adaptation needed to use it correctly and evidence of its effect on Neva.

The implementation-first deliverable is a playable game with the supported renderer, physics, build, UI and asset-tool migrations integrated together while retaining WebGL. New rendering capabilities and measured improvements follow the user's live testing and integrate into the existing scene owners.

Planning does not authorize deployment, mass asset publication, or overwriting unrelated work. Save impact is expected to be none; any necessary saved-state change must follow the repository migration protocol.

## Implementation checklist

Complete one bounded step at a time. A checked item means only that step passed its stated checks, not that its whole phase or the game modernization is complete. Cheap manifest preparation may precede the expensive frozen baseline because it retains existing resolved versions.

### Playable migration delivery — priority changed on 2026-09-30

The user requested all migrations in a playable game before further performance work, with personal live testing followed by fixes and improvements. The delivery checklist below separates that implementation milestone from the original performance and release gates. Existing failed and inconclusive measurements remain evidence; they no longer prevent integrating compatible updates for this local playtest. Fix migration-caused build, initialization, shader, physics or save-compatibility failures as part of delivery. Keep pre-existing defects and unmeasured performance claims visible for follow-up.

- [x] **M01 — Rendering:** integrate the prepared r184 adaptations, upgrade through r186 with matching types, migrate shader helpers and the preview timer, and pass focused renderer/lifecycle checks.
- [x] **M02 — Physics:** integrate supported Rapier initialization and query APIs; verify collision/query ownership and save fixtures without changing gameplay or save schemas.
- [x] **M03 — Build and test runtime:** migrate Vite, React plugin, vite-node, Vitest and Playwright as compatible sets; verify actual plugins, world tools and production workers/WASM.
- [x] **M04 — Compiler and lint:** integrate a supported TypeScript/ESLint/parser combination and verify editor AST round trips; explicitly record any unsupported compiler target.
- [x] **M05 — UI runtime:** migrate React/React DOM and matching types, preserve modal/root lifecycles, and remove Zustand only if unused.
- [x] **M06 — Asset tooling:** update compatible encoders, decoders, processors and BVH; verify representative staging and loading without publishing or replacing authored assets.
- [x] **M07 — Combined playable build:** run the applicable integrated checks, verify Chrome startup and core interactions/save reload, and provide the local playtest URL.
- [x] **M08 — Follow-up decisions:** record the WebGPU/compiler decisions and move measured optimization trials and personal playtest findings to the follow-up list.

Personal live acceptance, the original performance comparisons, browser/release coverage, distribution-budget repair and optional optimization trials remain separate follow-up gates. Checking M01–M08 establishes the scoped local migration milestone, not release approval or a demonstrated FPS gain.

### Integrated dependency evidence — 2026-09-30

The shared playable checkout now contains the supported migrations. The following version table is a verified installation snapshot; `package.json` and `package-lock.json` remain the owners.

| Area | Integrated set |
|---|---|
| Renderer | Three.js 0.186.1 and matching 0.186 types; native-depth shadows, new shader-normal helper and core Timer lifecycle |
| Physics | Rapier deterministic compat 0.21.0 through the existing npm import alias; shared broad-phase refresh and simulation-posed hull obstacles |
| UI | React/React DOM and types 19.3.0; Zustand removed after a consumer check |
| Bundler / execution | Vite 8.3.1, React plugin 6.1.1, vite-node 6.0.0, esbuild 0.28.2 |
| Checks / compiler | Vitest 5.0.2, Playwright 1.63.0, TypeScript 6.0.3, ESLint 10.11.0, TypeScript ESLint 8.71.0 |
| Asset processing / picking | glTF Transform 4.5.1, Meshoptimizer 1.3.0, Sharp 0.35.5, three-mesh-bvh 0.9.15; existing Babel parser 8.0.4 and Recast 0.24.0 retained |

A fresh dependency graph resolved without forcing peer dependencies. Clean `npm ci --ignore-scripts` and the dependency-tree check passed; actual builds and staging exercised the installed native tools. Node types remain on the supported Node 22 line. TypeScript 7.0.2 is deferred because the installed TypeScript ESLint peer range excludes it (`>=4.8.4 <6.1.0`); the supported TypeScript 6 set passes type checking and editor AST round trips.

The production build uses Rolldown chunk groups and the published vite-node CLI export for the environment bake. Road and brook tools pass their real `--check` invocations without rewriting generated world data. The acceptance tool’s preservation-audit subprocess also executes through the new runner’s `--script` path and emits valid JSON; this is runner compatibility, not preservation acceptance. The removed separate Rapier query-update API is replaced by bounded shared-pipeline refreshes. Simulation supplies hull poses directly; fixed query obstacles avoid the new controller's platform-friction contact behavior and preserve collision reporting and retreat. No dependency migration changes the save schema, layout or gameplay state contract.

Current scoped evidence under `output/tech-stack-integration/2026-09-30/`:

- Direct typecheck and targeted lint pass. The final production build passes, including its environment bake and worker/WASM bundles. Its 23.88-second duration was measured during concurrent verification and is not a performance comparison.
- Tool/editor/UI checks: 131 tests pass. Final renderer, physics-edge, persistence and architecture checks: 178 tests pass. Physics/traversal/retained-save checks: 67 tests pass. These selections overlap; they are not a new full-suite certificate.
- Asset/UI checks: 56 tests pass with the previously recorded cottage missing-LOD2 source-contract failure retained. All 14 art contract/cache tests pass. Four freshly staged representative assets pass mechanical validation and load in Chrome's Art Yard with their retained clips; published assets are unchanged.
- Chrome quality/effects controls pass on the isolated recheck. Resize, real context recovery and twenty preview mounts pass, with document visibility listeners returning to their starting count. The first quality run's timeout during concurrent verification is retained; no timeout or rendering setting was changed for its successful recheck.
- Production Chrome checks pass for New Game/HUD/inventory/journal and guarded New Game/Continue/options/real save/reload (2 tests, 71 seconds). The reloaded save retains its gold. Local production preview: `http://127.0.0.1:3423/`; the live development checkout is served at `http://127.0.0.1:3422/`. These origins have their own browser storage; the existing player save on another port was not overwritten. The existing gameplay harness is aligned with the current measured asset phase, calendar cache, starter inventory and accessible title labels; game behavior was not altered to satisfy old expectations.

### Follow-up work after personal live testing

- [ ] Complete the user's farm, fishing, physical cargo/market, mount/wagon and sailing playthrough; record concrete findings and fix them in their owning subsystem.
- [ ] Resume matching-input performance comparisons and isolated improvement trials, including any justified cascaded-shadow, query, preload or UI work. Do not assume a frame-rate gain from the version upgrades.
- [ ] Diagnose the retained cottage source/LOD, lake/wagon and terrain-preservation failures; do not suppress their assertions or overwrite authored assets.
- [ ] Recheck distribution-budget debt and the broader browser/release matrix when preparing a release. Complete the copied-fixture old-build/new-build/rollback save exercise before claiming rollback acceptance.
- [ ] Revisit TypeScript 7 when the compiler/parser peer set supports it. Revisit WebGPU only with a bounded port and evidence of benefit across existing materials and effects.

The twelve repeated frozen farm-control runs also finished functionally and remain under `output/tech-stack-s08/r184/repeated-farm-controls/`. Their interpretation and the earlier inconclusive comparisons remain performance follow-up work; no original comparison ceiling was relaxed.

### Three.js r186 feature adoption — active request on 2026-09-30

The user requested all renderer opportunities identified in the r186 assessment, with no decrease in performance. This is a new acceptance condition for these features; the previous migration-first priority does not waive it. Integrate into the existing owners and preserve the simulation, saves, authored geometry, palette and player-selected quality. A feature is not complete because its code exists or because it is hidden behind a disabled flag.

- [x] **F00a — Preserve the current r186 baseline:** freeze runtime source and public assets with hashes, and build its production bundle before changing renderer behavior. Evidence: `output/three-r186-features/2026-09-30/before/source-identity.json` and `before/build.log`.
- [ ] **F00b — Record matching production routes:** collect repeated first-use and warm farm, village/harbor, forest and weather routes. Fix viewport, DPR, quality, seed, time/weather and camera/input routes; record CPU/GPU timing, draw/triangle submission, target count, memory and startup. Run A/B interleaved with other game renderers idle.
- [ ] **F01 — Reject empty static-batch regions:** use r186's public `intersectsFrustum` hook with conservative local fog-cell bounds. Keep material batching, native instance culling, LOD and separate shadow views. Verify transformed parents, fog changes, multiple views and edit/re-batch lifetimes; measure before accepting.
- [ ] **F02 — Cascaded sunlight:** adapt `SunLight` to the existing lighting/atlas owner, replacing the relevant shadow path. Preserve committed light-space frames, dynamic casters, low/medium fallback, context recovery and disposal. Compare equal-tier quality and frame cost; tune coverage and update scheduling within the existing shadow budget.
- [ ] **F03 — Filtered sky reflections:** use bounded PMREM sky radiance on selected existing material families. Preserve roughness, palette, weather/night continuity and the water capture contract. Budget generation/update frequency, release targets on quality/context changes, and compare image and frame/memory costs.
- [ ] **F04 — Sheltered indirect lighting:** integrate `LightProbeGridWebGL` for an actual covered player space with a bounded incremental bake/update lifecycle. Resolve its object-origin volume selection with existing island batches before integration. Avoid duplicate ambient energy or global clamped shelter lighting; verify time/weather and load/recovery behavior and measure the sampling/bake cost.
- [ ] **F05 — TSL material adoption:** convert one real, bounded material through `WebGLNodesHandler`, retaining its lighting, fog, palette and required weather behavior. Warm it during existing entry preparation, verify the adapter's current limitations, and measure shader/startup/frame cost before extending adoption.
- [ ] **F06 — KTX2/BasisU:** trace textured assets/supporting maps through the existing optimizer, loader and texture owners. Stage a representative conversion, wire supported transcoding and worker lifecycle, and measure transfer, decode, GPU memory and visual parity. Preserve authored sources and atomic publication; palette-only assets need no texture conversion.
- [x] **F07 — WebGPU evaluation/decision:** completed the bounded representative TSL workload with matching linear HDR composition and view. Native WebGPU renders the final pilot with identical pixels, but CPU submission is higher and its current batching path emits more draws; custom GLSL and material patch hooks do not carry over automatically. Retain native WebGL for this delivery. [Measured decision and scope](output/three-r186-features/2026-10-01/webgpu-evaluation/decision.md). This closes the bounded decision only, not a full backend port or game certification.
- [ ] **F08 — First-use shader preparation:** extend the existing warm-up owner for the adopted sunlight/probe/reflection/node paths and verify first-use stalls, entry time and memory. Preserve lazy subsystem loading.
- [ ] **F09 — Combined acceptance:** run the integrated production routes, quality transitions, context recovery and the user's live review. Update canonical owners and keep human visual, measured performance and release approval distinct.

**Performance acceptance:** the frozen baseline is the current r186 game, not the older r174/r184 comparisons. Compare matching player-selected quality and unchanged world content; do not manufacture a pass by lowering density, effects, resolution or shadow coverage. Differences inside the recorded repeat range are inconclusive. Investigate any repeatable regression in warm frame time or first-use stalls, and record loading/memory tradeoffs separately. Optimizations may create headroom for better lighting, but the combined result must also pass the same routes. Keep a feature open until its required runtime and performance evidence exists.

### Pause checkpoint — 2026-10-02

The user asked to wrap up after the current fix and continue later. The bounded atlas change is saved in the shared checkout; its runtime and unit-test hashes still match the checked 2026-10-01 fix. The immutable v5 candidate excludes newer shared road/UI/atmosphere changes. [Production proof and scope](output/three-r186-features/2026-10-02/REVIEW.md) and [exact continuation](output/three-r186-features/2026-10-02/PAUSE_HANDOFF.md) supersede the older pause's pending-build/browser steps below.

- [x] **F02 immutable production candidate:** transplanted only the checked atlas and its regression onto `shared-glow-v4`; the direct Vite production build passes. Both 2,258-input source manifests and both 780-file builds rehash unchanged after the comparison.
- [x] **F02 production graphics/lifecycle checks:** five Chrome cases pass: day/night/weather, Low/Medium/High/effects/Auto, actual context recovery/resize/twenty preview mounts, covered-room lighting/rebake/idle exit, and title options. Farm day/night-storm and farmhouse day captures were agent-inspected. This is scoped functional/visual evidence, not human review.
- [x] **F02 planted-crop shadow regression:** the actual quest grants seeds, then planting and growth submit the same live crop ID through native shadow callbacks on a newly added template and its grown stage. The production case passes; targeted ESLint and the TypeScript program rooted at this test and Vite declarations pass. Capacity replacement remains covered by the existing native/unit event regressions; the browser case does not force more than 160 instances.
- [x] **F02 serial fixed-view comparison:** three interleaved v4/v5 pairs pass at unchanged High/settings/content with empty runtime-error and failed-stage lists. Median warm CPU pipeline cost is 11.8 ms for v4 and 9.7 ms for v5; frame p95 remains 33.3 ms. Repeat ranges meet or overlap, so a repeatable FPS gain and whole-game no-decrease acceptance are not established. [Exact metrics and limits](output/three-r186-features/2026-10-02/paired-shadow-v4-v5/comparison.md).
- [ ] **Next on explicit resume — full performance acceptance:** compare the validated candidate against the original frozen r186 feature baseline, complete matching movement/weather/quality/first-use/startup/memory routes, and address any repeatable regression while retaining settings and coverage. Recheck concurrent activity and newer shared edits first; preserve the protected visual chat and road work.
- [ ] **F06 remaining embedded-GLB adoption:** resume from the retained textured-asset audit, trace current optimizer/metadata/loader contracts, stage a representative KTX2/BasisU GLB and verify texture/rig/UV/runtime parity plus transfer/decode/GPU-memory costs before expansion. Embedded GLB and supporting-map orientation differ; original authored sources and the single catalog/publication path remain required.

Owned verification browsers/runners completed; preview ports 3440/3441 are stopped and have no listeners. No F06 pipeline change, mass asset publication, save migration, staging, commit or deployment belongs to this continuation. F00b/F01–F06/F08/F09 acceptance remains open; F07 closes only the recorded backend decision.

### Shutdown checkpoint — recorded 2026-10-01

The user requested a safe pause before closing the computer. Code remains saved in the shared checkout; the detailed run record and exact continuation steps are in [the resume handoff](output/three-r186-features/2026-09-30/RESUME_HANDOFF.md). Frozen baseline, culling, lighting and lighting-v2 sources, production bundles and measurements remain under that evidence directory. This checkpoint is execution evidence, not a new design authority.

Implementation progress verified in the 2026-09-30 logs:

- [x] **F01 implementation and focused checks:** conservative region rejection, native per-instance culling and invalidation handling are implemented; 20 tests across three files passed. Repeated fixed-camera measurements are retained; a performance improvement is not established.
- [x] **F02/F03 implementation and focused checks:** High-tier cascaded sunlight and selected-family PMREM reflections are integrated into the existing lighting, atlas and atmosphere owners. The focused lighting selection passed 22 tests. Complete visual, quality-transition, recovery and performance acceptance remains open.
- [x] **F05/F08 pilot implementation and focused checks:** existing practical glow sprites use a lazy unlit TSL adapter and output-aware entry preparation. The node/reflection/atlas/renderer selection passed 33 tests across five files. The frozen first lighting candidate completed a production Chrome run without shader/runtime errors.
- [x] **Frozen lighting-v2 production build:** the candidate with the explicit node chunk split builds successfully. Its runtime, lazy-load behavior and new day/night graphics checks have not yet been exercised.
- [ ] **Next acceptance work:** inspect the lighting-v2 chunk graph, run the updated graphics/context tests and inspect captures, then repeat paired production measurements. The first lighting candidate increases shadow draw/triangle submission; investigate any repeatable frame/GPU regression before acceptance.
- [ ] **Remaining integrations:** implement F04 sheltered probes and F06 KTX2/BasisU, perform F07's bounded WebGPU evaluation, and finish F08/F09 across the combined result.

The latest recorded shared-checkout typecheck failed in concurrently edited `RoadGeometry.ts`; this is a historical observation to recheck after resuming, not a renderer diagnosis or authorization to change the road work. The feature preview servers on ports 3430–3432 were stopped for shutdown. No release gate, human visual approval, save migration, asset publication or deployment is claimed by this checkpoint.

### Resumed feature validation — 2026-10-01

- [x] **Resume inputs:** compared the scoped implementation with the pause snapshot and rehashed the frozen baseline and lighting-v2 source inputs; no drift. The current shared-checkout direct typecheck passes, superseding the historical road compile failure for this check.
- [x] **F05 lazy-load verification:** the lighting-v2 import graph keeps `three-nodes` behind the practical-glow dynamic import at game entry. Core Three.js does not import that chunk.
- [x] **F02/F03/F05 lifecycle checks:** all four graphics cases pass across the host run and the isolated quality recheck: day/night/storm, Low/Medium/High and effects/Auto, real context recovery/resize/twenty preview mounts, and title options. The quality test's production URL now includes the existing `worldAcceptance=1` entry opt-in; no game behavior, settings or timeout changed. Initial sandbox launch failures and the host title-screen timeout remain in the logs.
- [x] **F00b fixed-camera subset:** six production measurements completed in alternating order, with three repetitions per immutable candidate at matching High settings, seed, viewport/DPR, hardware/backend and active effects. Runtime error and failed-stage lists are empty. This covers only `static-camera-views`, not the complete route checklist.
- [x] **F02 receiver-fit repair implemented:** cascade XY bounds intersect the committed view, native cascade and receiver heights; native depth/caster reach remains intact. Static and dynamic passes share the committed matrices. Public instance-buffer version/count changes invalidate the cached instance bounds. The focused cascade/texture selection passes 64 tests; matching cascade-texture measurements are retained below, and acceptance remains open.
- [x] **F06 runtime conversion and lifecycle implemented:** supporting maps retain their WebP source/provenance and use staged BasisU KTX2 derivatives with filtered mips. World, Art Yard and character previews share a bounded transcoder lease/worker lifecycle; GLB sources and publication are unchanged. Chrome loads all seven used maps in a GPU compressed format with eleven mips each. Retained compressed mip payload totals 4,893,448 bytes; this is decoded texture data, not total renderer memory. The fresh runtime requests include the bundled transcoder, so the smaller map files alone do not establish smaller first-use transfer. Runtime/compression evidence is linked below; embedded GLB conversion and full visual/performance acceptance remain open.
- [x] **F04 actual-space integration and recovery:** the farmhouse shell/props feed off-scene native probes; scoped room/actor materials replace ambient diffuse energy only in that room. Chrome verifies indoor entry, time/weather changes, real context recovery and idle baking after exit. The original first-use probe run exposed a 1,866.6 ms frame; it remains recorded.
- [x] **F04/F08 first-entry warm-up checked:** `shelter-v2` prepares the capture and covered-actor programs before controls, with synchronous restoration of temporary targets/materials/light flags. The seven-file focused selection passes 76 tests, the affected warm-up/target retry passes nine, and direct typecheck/lint and the frozen production build pass. The farmhouse Chrome case passes and its inspected captures retain the covered room and actor. First-entry frame p95 is 16.8 ms, maximum 133.4 ms; the first night transition still has a 366.7 ms frame and adds shader programs. These short, fresh-profile checks are diagnostic, not a paired performance acceptance.
- [x] **F08 night-layout implementation and functional check:** `shelter-v3` warms the actual budgeted practical-light layout with both world/covered-actor shadow variants. Its production Chrome farmhouse case passes, including context recovery and idle baking after exit. The short first-night window records frame p95 16.7 ms and maximum 50 ms, versus the earlier 366.7 ms maximum; these fresh-profile windows are diagnostic rather than a paired acceptance. Entry retains 562 programs and night reaches 570, so shader/startup/memory costs still require repair and comparison.
- [x] **F05/F08 duplicate glow graph repaired:** practical sprites reuse one TSL fragment graph while their color and opacity remain independent. The native cache-key witness changes from distinct keys to the same key for equivalent sprites; four focused files pass 37 tests, scoped lint and an isolated TypeScript program for the changed factory/test pass, and the immutable `shared-glow-v4` production build passes. The earlier typecheck attempt included unrelated project declaration roots and still reached the concurrent `RoadTerrainConformity.ts` error; both logs are retained. This is not a full-project typecheck pass.
- [x] **F05/F08 isolated Chrome check:** after confirming the other agent's earlier GPU benchmark had stopped, the private `shared-glow-v4` farmhouse case passes day/night/storm, actual context recovery and idle baking after exit. Retained programs fall from 562 to 386 at entry and from 570 to 394 after night. Agent-inspected captures retain the room/actor and live lighting. The short night window has frame p95 16.8 ms and maximum 33.4 ms; these are diagnostic windows, not a matching-quality whole-game performance claim.
- [x] **F00b native CPU attribution:** the isolated `shared-glow-v4` warm fixed-camera profile completed successfully. Shadow rendering and native batch preparation are the selected CPU targets; receiver-height updates are a smaller contributor. [Raw profile interpretation and limits](output/three-r186-features/2026-10-01/shared-glow-cpu-profile/analysis.md). Profiling overhead makes its timings diagnostic, not no-decrease acceptance.
- [x] **F02 bounded caster traversal implementation and focused checks:** the existing atlas owner borrows relevant live caster subtrees, preserving ancestor visibility, native draw/culling behavior, complete-scene filter invalidation and resource lifetimes. Scene/direct-root child changes refresh classification for added or replaced meshes, including crop stages/capacity; observers and borrowed references are released. The native atlas/lighting/receiver selection passes 51 tests across three files; scoped TypeScript and ESLint pass. [Scoped proof and boundaries](output/three-r186-features/2026-10-01/shadow-traversal-v5-preparation/REVIEW.md). Production build/browser/performance acceptance remains open.
- [ ] **Next verification and acceptance — paused:** on explicit resume, create an immutable candidate from `shared-glow-v4` with only the checked atlas change, build it, verify production parity/lifecycle and repeat matching measurements plus the remaining routes. Preserve “Adapt visual architecture robustly” (thread `01a0f6a6-42ba-7a02-8aeb-615fc41dda42`)'s bloom/sun-shaft owners, configuration changes and artifacts. The road agent released its measurement window at this checkpoint; recheck concurrent activity before new measurements. [Exact continuation](output/three-r186-features/2026-10-01/shadow-traversal-v5-preparation/PAUSE_HANDOFF.md).
- [x] **F07 bounded backend evaluation:** twelve final interleaved Chrome trials cover four-glow and 64-glow workloads with 64 native batched boxes. Linear HDR/output orientation is matched and final screenshots are identical. CPU submission p95 is higher on native WebGPU, and the actual material conversion witness does not preserve custom GLSL/hooks. The production backend remains WebGL; failed/mismatched preparation attempts and the separate, non-comparable GPU timing scopes are retained in the [decision record](output/three-r186-features/2026-10-01/webgpu-evaluation/decision.md).
- [ ] **Performance repair and remaining routes:** lighting-v2 warm GPU p95 is above the baseline repeat range, with consistently higher draw/triangle submissions and CPU pipeline p95. This candidate does not satisfy the no-decrease condition. Attribute and reduce the adopted paths' workload while retaining coverage/settings, then repeat the affected comparison and complete the remaining routes.

Exact metrics, order, process observations, source identity and functional-check scope: [resumed comparison record](output/three-r186-features/2026-10-01/paired-static-v2/comparison.md), with raw JSON/logs beside it. F01–F06, F08 and F09 acceptance boxes remain open; F07 closes its bounded backend decision only. Agent captures do not establish the user's live review or release approval.

Further scoped evidence: [cascade/texture comparison](output/three-r186-features/2026-10-01/paired-static-cascade-textures/comparison.md), [texture compression report](output/three-r186-features/2026-10-01/compressed-supporting/compression-report.json), [actual compressed-map runtime requests](output/three-r186-features/2026-10-01/shelter-v1-texture-artifact-results/graphicsSettings-adopted-r-d19ec-rough-day-night-and-weather-chromium/surface-texture-runtime.json), and [farmhouse warm-up/recovery windows](output/three-r186-features/2026-10-01/shelter-v2-graphics-results/graphicsSettings-covered-f-3b43b-hanges-and-context-recovery-chromium/farmhouse-probe-runtime.json). The second six-run comparison has large GPU variation and higher CPU pipeline cost; it does not close the no-decrease gate. Its instance-bounds cache predates the later repair, so a repeat is justified only on the changed candidate.

The six interleaved `shelter-v3` comparisons also pass without runtime errors or failed stages, with both source manifests rehashed unchanged: [comparison and limits](output/three-r186-features/2026-10-01/paired-static-shelter-v3/comparison.md). Host timing variation is large. The candidate retains more shader programs, draw/triangle submissions and settled heap than the baseline; no no-decrease acceptance follows. The shared glow repair postdates that snapshot and has its own [native cache-key witness](output/three-r186-features/2026-10-01/shared-glow-cache-witness.json), unit/lint logs and frozen build under the same evidence directory.

The completed [shared-glow farmhouse check](output/three-r186-features/2026-10-01/shared-glow-graphics-results/graphicsSettings-covered-f-3b43b-hanges-and-context-recovery-chromium/farmhouse-probe-runtime.json) verifies the reduced shader count and covered-space lifecycle. New runtime changes in this repair are limited to `PracticalGlowNodes.ts`; the other agent's atmosphere implementation remains separate. Neither these short windows nor the earlier noisy six-run comparison close F00b/F01–F06/F08/F09 acceptance.

### Original preparation and acceptance record (historical checkpoints)

- [x] **S01 — Execution checklist:** add ordered implementation steps and distinguish preparation from runtime upgrades.
- [x] **S01a — Review gaps addressed:** add compatible checkpoint sequencing, baseline failure policy, measurable acceptance, save rollback verification, exporter gates, evidence lanes, per-step execution contracts and a WebGPU deferral decision.
- [x] **S02 — Direct esbuild dependency:** declare the installed version explicitly and smoke-test an in-memory TypeScript bundle.
- [x] **S03 — Direct vite-node dependency:** declare the installed version explicitly and smoke-test a temporary TypeScript script.
- [x] **S04 — Dependency preparation verification:** confirm manifest/lockfile agreement and no resolved package-version changes; inspect the scoped diff.
- [x] **S05 — Producer cache correctness:** include dependency/build identity in the authored bundle cache key and add focused invalidation coverage; update its owning documentation.
- [x] **S06 — Runner and Node compatibility:** S06a–S06c completed with the Vite 8 integration; see the playable migration evidence below.
- [x] **S06a — Node contract:** declare the supported engine range, share a local/CI version through `.nvmrc`, and check it against installed tooling.
- [x] **S06b — Runner selection:** verify an upstream Vite 8-compatible vite-node release and map current command/programmatic consumers.
- [x] **S06c — Runner integration (with S11):** upgrade vite-node with Vite 8; verify content validation, road/brook tools, environment baking, acceptance-tool subprocesses, virtual modules, and argument forwarding. Do not install vite-node 6 beside Vite 6 merely to check off this step.
- [x] **S07 — Frozen baseline:** preserve the source snapshot, check generated drift, classify existing failures, and capture the production performance/visual baseline. The 2026-09-30 frozen measurement record below completes this preparation gate; noisy metrics and existing product/release failures remain separate.
- [x] **S07a — Existing-toolchain art/build checks:** art tests and direct production build passed on 2026-09-30; download-budget acceptance remains failed and separate.
- [x] **S07b — First baseline failure diagnosis:** correct stale collision/placement/atlas test inputs and the development-save helper; retain real-obstruction coverage and separate wagon checks. See the follow-up evidence; this does not close S07.
- [x] **S07c — Packing-road and remaining fixture checks:** replace the approximate packing-yard margin with real vehicle/placed-collision sampling; correct Sunreach override and narrative-conversation expectations. Reproduce the separate full-route wagon failures without suppressing them.
- [x] **S07d — Isolated visual and exporter baseline:** preserve the current dirty source and production build in a managed checkout, complete a clean locked install, capture all twelve fixed views in Chrome, and validate fresh static/skinned/animated/textured catalog candidates without publication. Production timing and full failure inventory remain separate requirements of S07.
- [x] **S07e — Complete test inventory and remaining harness diagnosis:** let the full run finish, reproduce all newly reported failed files, repair incomplete audio/mount test doubles, route committed-GLB architecture through its real producer, and retain the newly exposed cottage source-contract failure. See the dated evidence; this is not a clean-suite certificate.
- [x] **S07f — Repeated production measurements:** 21 hardware runs pass, covering three interleaved repetitions of all seven routes with cold/cached startup. Numeric limits are frozen below; excessive variation remains inconclusive instead of receiving a loose passing threshold.
- [ ] **S08 — Three.js r184 checkpoint:** adapt affected APIs/shaders and verify renderer, loaders, batching, previews, and authoring compatibility.
- [x] **S08a — GTAO patch safety preparation on r174:** validate every upstream shader anchor before mutation, reject incomplete configuration, and release failed factory resources; preserve the valid shader behavior and verify focused pipeline tests. This does not upgrade Three.js or complete S08.
- [x] **S08b — r184 renderer/API adaptation in the isolated candidate:** pin compatible runtime/types, adapt native-depth shadow composition and filtering, preserve static/dynamic caster ownership and target lifetimes, and verify affected renderer/loader/batching/material tests. The shared runtime version is unchanged.
- [x] **S08c — Representative exporter and Art Yard parity:** generate selected fresh candidates without publication, load all four through the candidate runtime, and repair partial-stage preview routing with fail-closed source selection. Mechanical/runtime compatibility is distinct from catalog-wide certification and human art approval.
- [x] **S08d — Fixed views and graphics lifecycle:** inspect matching fixed views, verify Low/Medium/High/Auto callbacks, effects, resize, real context restoration and repeated preview mounting. The meadow's generated-normal repair is also compatible with the shared r174 renderer.
- [ ] **S08e — Production comparison and checkpoint acceptance:** collect three matching samples per route, compare with the frozen S07 limits, resolve excessive variation through controlled paired measurements. Local playtest integration follows the revised priority above; performance acceptance remains separate. No FPS gain is assumed.
- [x] **S08e1 — Candidate measurements and classification:** complete all 21 matching production runs, retain every raw sample, verify unchanged source/build inputs, and compare all 70 metrics with the original frozen policy. All 32 bounded comparisons pass; 38 comparisons remain inconclusive.
- [ ] **S08e2 — Controlled comparison and shared integration:** resolve the inconclusive frame/startup measurements with controlled r174/r184 pairs; shared integration may proceed first under M01, with these performance gates remaining open. Short diagnostic pairs do not complete this acceptance gate.
- [ ] **S09 — Three.js r186 integration:** align types, complete lifecycle/quality checks, inspect reference scenes, and compare production measurements.
- [ ] **S10 — Rapier migration:** adapt initialization/query lifecycle, preserve physics contracts and existing saves, and measure traversal/query cost.
- [x] **S11 — Vite migration:** compatible bundler/plugin/runner set, custom plugins, chunking, production startup and build verified. Recorded build duration is evidence, not a claimed speedup.
- [x] **S12 — Test tooling:** migrate Vitest with S11 wherever compatibility requires it; migrate Playwright with its configuration and browser requirements; preserve meaningful tests and visual baselines.
- [x] **S13 — Compiler/linter compatibility:** upgrade a supported TypeScript/ESLint/parser set; resolve or explicitly defer TypeScript 7 and verify editor AST round trips.
- [x] **S14 — React migration:** runtime/types, nullable modal refs and boolean inert props adapted; UI and lifecycle checks pass. Unused Zustand removed. Profiling and targeted UI improvements move to S16.
- [ ] **S15 — Asset tooling migration:** upgrade compatible encoders/decoders and processors, validate staged representative assets, then expand shared-toolchain coverage without mass publication.
- [ ] **S16 — Measured improvements:** trial shadow, query, shader-preparation, loading, and UI improvements independently; retain only demonstrated benefits.
- [x] **S17 — WebGPU decision:** defer the backend port for this delivery. Existing GLSL materials, native-depth shadow composition and post-processing require a separate parity effort; current profiles do not establish a repeatable benefit that justifies it. This closes the decision only.
- [ ] **S18 — Integrated acceptance:** run applicable combined checks, gameplay/save routes, production comparisons, documentation updates, and separate human visual/publication/release handoffs.

### Preparation evidence — 2026-09-29

Completed S01–S04 in the existing checkout as a small manifest-only preparation change. `package.json` and the lockfile root now explicitly declare the already-resolved `esbuild@0.25.12` and `vite-node@3.2.4` development dependencies. No resolved package records, runtime versions, game code, saved state, or published assets changed.

Verification performed:

- Node assertions confirmed manifest/lockfile development-dependency agreement and that every non-root lockfile package record remained identical to the starting committed lockfile (there were no pre-existing lockfile edits).
- An in-memory esbuild TypeScript bundle executed and returned the expected value.
- A temporary project-local TypeScript script executed successfully through `vite-node --script`; the temporary files were removed afterward.
- `npm ls esbuild vite-node --depth=0` resolved both direct dependencies successfully.
- Scoped `git diff --check` passed.

The initial offline npm lockfile command failed with `ENOTCACHED` before changing the manifests. The two declarations were then added directly while preserving all existing resolved records. The first runner probe failed for a macOS temporary-directory path outside the project; the project-local retry passed. These smoke checks do not establish clean-install, world-bake, full build, browser, asset-generation, or performance acceptance. Those gates remain pending above. No install scripts or asset regeneration were run.

### Producer cache evidence — 2026-09-29

Completed S05. The authored producer now hashes the package manifest, available npm lockfiles, and installed Three.js/esbuild package metadata alongside its existing source and palette inputs. Bundling options remain covered through the producer source itself. The authored asset cache consumes the same expanded file list. Missing required package metadata fails closed.

Added `tools/authored/producerCache.test.mjs` to the existing `art:test` command, so CI runs the regression automatically. A temporary fixture verifies stable reuse, dependency/lockfile/build-input invalidation, missing metadata, and an actual esbuild rebundle that bypasses both loaded-module and disk caches after a dependency upgrade.

Verification: `npm run art:test` passed 14 tests; `node_modules/.bin/vitest run tests/unit/artCache.test.ts` passed 5 tests; targeted ESLint and scoped `git diff --check` passed. These are tooling/cache checks, not full-catalog generation, browser, performance, or release evidence. No runtime packages, game state, catalog assets, or published GLBs changed. Documentation owner updated: `tools/authored/README.md`.

### Node and runner preparation — 2026-09-29

S06a/S06b implemented; S06 remains partially complete until S06c runs with S11. `package.json` owns the supported Node range, chosen to satisfy the installed Babel parser's engine requirement. `.nvmrc` selects the working Node 22.22.3 runtime and CI now reads that file. Architecture §4 links these owners instead of retaining the stale Node 20 requirement.

The live [vite-node npm metadata](https://registry.npmjs.org/vite-node/latest) reported version 6.0.0 with a Vite `^8.0.0` dependency. Select it with Vite 8 during S11; recheck patch versions then. Keep vite-node 3.2.4 with the current Vite 6 installation until that coordinated migration.

Consumer map for S06c:

| Consumer | Integration to verify |
|---|---|
| `package.json`: content validation, road planning, brook tracing | CLI behavior, TypeScript imports, exit codes, argument forwarding |
| `tools/vite/environmentLayoutBakePlugin.ts` | Spawned runner entry path, Vite virtual modules, bake JSON summary, output file, failure propagation |
| `tools/world/acceptance.mjs` | Runner subprocesses for preservation/reference and traversal evidence |

Verification: Node assertions passed for the active/pinned version, manifest/lockfile engine agreement, installed Babel/Recast/Vite/vite-node/esbuild/Vitest engine compatibility, and CI's version-file reference. `npm run content:validate` passed through the current runner; `node_modules/.bin/vitest run tests/unit/docArchitectureClaims.test.ts` passed 5 tests; scoped `git diff --check` passed. The hosted CI job, clean install, full world bake, and Vite 8 runner integration were not executed. No runner or runtime dependency version was upgraded in this step.

Next integration work: finish the playable migration delivery above. S06c must finish with S11 rather than being treated as already verified. Production comparison acceptance follows the local playtest milestone under the user's revised priority.

### S07 interrupted — 2026-09-29

Stopped on request while `npx vitest run` was still going. S07 is not complete. No runtime package was upgraded, and the check sequence had not reached asset regeneration.

Preserved source snapshot: HEAD `66d05bc91b17f6a4a0b172d18853c11d07053f25` plus the uncommitted S01–S06 preparation (seven modified files and untracked `.nvmrc` and `tools/authored/producerCache.test.mjs`). A restorable copy is in gitignored `output/tech-stack-s07/snapshot/`. Combined snapshot sha256 `a65f2732d830c55c44c8435d6eb7458858fc0cb6972e5458a4df6ed184300c13`. Installed identity is in `output/tech-stack-s07/identity.json`: Node 22.22.3, Chrome 154.0.8037.58, Playwright 1.62.1, Three.js 0.174.0, Rapier 0.14.0, Vite 6.4.3, vite-node 3.2.4, on an Apple M4 with 16 GB. Public and generated asset manifests match (`e854395fa990ae0f…`), 349 assets, `generatedAt` `2026-09-29T11:06:47.974Z`.

Finished with exit 0, using the check-only commands: `art:codegen:check`, `ui:codegen:check`, `ui:publish:check`, `ui:pack:check`, `content:validate`, `npx tsc --noEmit`, and `npx eslint .`.

Interrupted: the unit/simulation suite. 51 files had reported a result out of 408 `tests/unit` and `tests/simulation` files. Nine of those files had already reported failures (`harborCoastMigration`, `villageTrade`, `cartWorkshopMigration`, `uiAtlasStress`, `terrainMigrationComposition`, `tradeNarrative`, `mainlandTraversal`, `mainlandEnvironment`, `sunreachWorld`). That list is incomplete and is not the pre-existing-failure record. Log: `output/tech-stack-s07/vitest.log`.

Not started: `art:test`, `npx vite build`, the download-budget check, the post-check drift comparison, the four-scene visual regression, clear/night/storm captures, and `npm run perf:baseline`. A capture script is staged at `output/tech-stack-s07/capture-visual-baseline.mjs` and has not been run.

The working tree still contains only the preparation edits. Resume by rerunning the full Vitest suite, then the remaining check-only steps, then the visual and production performance baselines. Do not treat this partial log as S07 acceptance.

### S07 resumed — 2026-09-30; affected-contract blockers confirmed

S01a is complete. S07a passed: `npm run art:test` (14 tests) and direct `node_modules/.bin/vite build` including the environment bake. `node tools/ci/check-download-budget.mjs` failed: code bundle 7.35 MB is below its 20 MB cap, but total distribution 174.98 MB exceeds the 95.68 MB ratchet. These are distribution measurements, not startup transfer measurements. The budget was not raised.

The source HEAD and tracked preparation edits matched the previous S07 snapshot except this plan. Input hashes were recorded and compared after checking; no tracked runtime/tool/generated input drift was found. No package version, gameplay, save, or published asset changed.

The full Vitest run was deliberately stopped (exit 130) after affected-contract failures reproduced in focused checks. It is incomplete, not a full-suite result; its JSON reporter did not finalize. Observed failing files include `harborCoastMigration`, `villageTrade`, `cartWorkshopMigration`, `uiAtlasStress`, and `terrainMigrationComposition`. This is not an exhaustive failure inventory. The focused harbor check failed one assertion (five tests excluded); the focused village-trade check failed two assertions (seven excluded).

| Confirmed blocker | Evidence and next diagnosis | Affected acceptance |
|---|---|---|
| Harbor migrated pose fails static clearance | `tests/simulation/harborCoastMigration.test.ts:82`, expected clear, received false; reproduced with `-t 'recovers a saved pose covered by a newly placed trunk'`. Trace migration output versus active collision proxies before deciding code defect or stale expectation | S10 save/traversal parity; S18 |
| Reedhaven trade approach fails clearance | `tests/simulation/villageTrade.test.ts:49`, `struct.trade_reedhaven` fails; reproduced with `-t 'keeps all yard approaches|recovers only saves overlapping'`. Compare station-front geometry and world obstacle owners | S10 traversal parity; S18 |
| Trade-obstacle migration leaves pose unmoved | Same focused command, `villageTrade.test.ts:78`: distance 0 instead of greater than 0.4. Trace fixture version, migration dispatch and collision predicate | S10 save recovery; S18 |
| Distribution ratchet exceeded | Retained build/budget logs; inspect intended shipping assets and historical baseline before proposing scoped reduction or a justified budget decision | S11/S15 size acceptance; S18 |

Logs, exact commands, input hashes, exit codes and the partial-run summary are retained in `output/tech-stack-s07/resume-2026-09-30/`; canonical evidence is indexed in `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md`. The other observed failing assertions still need classification. Do not rerun the full suite until targeted diagnosis resolves or independently verifies the affected contracts. Then complete remaining S07 checks, isolated visual/performance captures and frozen numeric tolerances. S07, S08 and later runtime upgrades remain unchecked. Existing human product acceptance is not revoked by these test results, and the findings do not authorize unrelated redesign.

### S07 focused corrections — 2026-09-30

This follow-up supersedes the earlier interpretation of the harbor/Reedhaven/Sunreach failures as possible gameplay defects. Diagnostics traced them to test inputs: the harbor test projected an unretained raw-generator palm; the yard test used base coordinates instead of simulation-owned placed coordinates; and the former Sunreach station position is now clear, so forcing displacement would violate preservation of a safe save. Tests now assert current composed-world clearance and preservation of that safe player/cargo position. A separate retained-trunk test still proves blocked poses are moved without mutating the input or losing money.

The cart-workshop failure came from `headSchemaDevelopmentSave` reapplying v65 to a newer predecessor and dropping saved station facing. The helper now adds those stations only for pre-v65 predecessors. The terrain-composition request count includes the later v74/v75/v76 steps while retaining the no-presentation-layout and no-op-reload assertions. Atlas pixel fidelity now selects the unambiguous `quality-gold.png` alias; the bare `gold` ID resolves to a different sprite. No tolerance was relaxed and no published images changed.

Evidence in `output/tech-stack-s07/diagnosis-2026-09-30/`:

- Focused migration run: 21 passed, 1 failed across four files. Harbor (7), cart workshop (4), and terrain composition (2) passed. The village-road-margin failure remained and was split from approach and wagon checks afterward.
- Final village-trade run after splitting: 10 passed, 1 failed. Current yard approaches, both loaded-wagon departures, former-station save/cargo preservation and the existing trade cases passed. Highridge's actual station has 1.7852914254531433 m beyond the nearest road edge against the unchanged 2.1 m assertion. This margin check is not proof of an impassable route; diagnose actual station geometry and loaded-wagon passage before moving approved content or revising the assertion.
- Full UI atlas stress suite: 13 passed. Older head-schema/layout25 helper regression: 1 passed, 4 unrelated cases excluded.
- Direct typecheck and targeted ESLint passed (two existing console warnings in the atlas suite); diff whitespace check passed.

Only tests and their helper changed. No runtime, dependencies, save schema, layout or published assets changed. The earlier broad run remains incomplete; do not infer a full-suite pass from these corrections. Next bounded work is the Highridge road-clearance diagnosis, followed by classification of the remaining interrupted-baseline failures and S07's visual/performance evidence. The distribution-budget failure remains recorded separately; do not raise its limit merely to continue.

### S07 road and fixture follow-up — 2026-09-30

The packing-yard center-distance failure was an overly conservative proxy, not evidence of a packing station blocking the road. `villageTrade.test.ts` now samples both trade-wagon footprints against each yard's actual compound collision along the adjacent compiled road, in both directions and at center/edge lateral positions. It asserts station proxies and sampled poses exist. This proves only packing-yard clearance; the independent full-route physics tests still own terrain, steering and all other obstacles. Both loaded-wagon departure cases remain separate and passing. Final village-trade suite: **11 passed**.

Two other stale expectations were corrected without changing runtime behavior: the Sunreach composition assertion follows the committed interaction-placement override while retaining the island-anchor contract (**12 tests passed**), and the trade narrative hears the story talk step first and an unprompted packing introduction on the next conversation, matching `02`'s dialogue order (**5 tests passed**, including sale/reward non-duplication).

The broader road probe found market-stall collisions near the Pinewatch and Highridge endpoints. Focused `tests/unit/mainlandTraversal.test.ts` reproduction confirmed both existing full-route driving cases still fail (2 failed, 11 unrelated cases excluded): Pinewatch at approximately (-392.118, 53.754), Highridge at (-337.472, -364.991). Those tests were not edited or relaxed. Whether the proper correction is a parking/arrival target or market/road geometry requires tracing the authored arrival contract; no world relocation, collision removal or save migration was made here. The previously observed lake-ice-house clearance failure remains unclassified. Distribution-budget acceptance also remains failed.

Evidence: `road-probe.log`, `road-station-probe.log`, `trade-footprint.log`, `mainland-traversal.log`, `sunreach-final.log`, and `narrative-final.log` under the diagnosis directory above. Final direct typecheck and targeted lint results are recorded there as `tsc-complete` and `eslint-complete`; the canonical evidence index records their outcomes. Only test/helper inputs changed, so the runtime baseline identity is preserved. S07 stays open: resolve or independently verify the remaining affected traversal contracts, finish the full failure inventory once, then capture the frozen visual/performance baseline before runtime upgrades.

### S07 isolated visual and exporter baseline — 2026-09-30

The managed checkout at `/Users/anilkaraca/.codex/worktrees/tech-stack-baseline/Neva` preserves the source HEAD plus the existing modernization changes, including the test corrections. The tracked patch and hashes of 2,948 source inputs are retained in `output/tech-stack-s07/baseline-final-2026-09-30/`. Its production `dist` is copied from the successful existing-toolchain build; runtime inputs have not changed since that build. `npm ci --no-audit --no-fund` completed successfully using the existing lockfile. An earlier offline attempt failed because the Zustand tarball was not cached; neither attempt changed the locked versions.

The direct Vite DEV server on port 3419 served the frozen source for all four reference scenes under clear noon, clear night and storm noon: **12 captures, no browser errors**. Chrome, SwiftShader, 1920×1080, DPR 1, seed 42 and fixed presentation time were used. PNGs and `capture-report.json` are under `output/tech-stack-s07/visual/`. These are diagnostic visual comparisons, not hardware performance or human approval, and approved snapshots were not updated. Chrome needed an unsandboxed temporary-profile launch; the failed sandboxed launch is retained separately.

In the managed checkout, `node tools/art/cli.mjs generate --asset prop_wagon_cart_a --asset fauna_duck_a --asset building_windmill_a --asset char_npc_maeve_b --no-publish --no-cache` passed fresh generation/normalization, optimization and mechanical validation for the representative static, skinned, animated and textured paths. The staged report identifies Three.js r174 and the input toolchain; original published bytes and source GLBs remain intact. The same selection must be exercised at both Three.js checkpoints. This is an exporter baseline, not final shared-toolchain acceptance.

The lake ice-house probe reproduces the existing 1.2 m clearance failure at the road endpoint (-624.7, -140.3) against `authored.mainland.worksite.lake-ice-house:main`, even with the actual authored placement height. That excludes the suspected height-projection mistake; the route endpoint and claimed vehicle/actor envelope still require contract diagnosis. No world geometry or assertion was changed. The complete suite has since finished; its failure inventory and input scope are recorded below. S07 stays unchecked until production measurements and comparison limits are complete.

Upstream target metadata was rechecked: runtime `three@0.186.1`, matching r186 types `@types/three@0.186.0`, and the intermediate runtime/types checkpoint `0.184.0`/`0.184.1`. The [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide) confirms native-depth shadow changes and replacement of the old soft-shadow filter. Inspection of the r184 source shows that Neva's packed-color shadow compositor needs adaptation; retaining its static refresh and committed-view contracts is part of S08. No active runtime package has been upgraded yet.

### S07 complete test inventory and S08 shader preparation — 2026-09-30

The uninterrupted direct Vitest run finished with **402 files passed, 6 failed; 3,316 tests passed, 15 failed; 2 runner RPC errors**. `vitest.json`, `vitest.log` and the exit record are retained under `output/tech-stack-s07/baseline-final-2026-09-30/`. This was a shared-checkout run: independent equipment changes arrived while it was running. Its result is scoped to the inputs exercised, not a clean frozen-source or release certificate. The managed production baseline remains isolated from those changes. Do not repeat the full suite just to obtain a different aggregate.

| Failed owner | Confirmed cause / evidence | Remaining boundary |
|---|---|---|
| `audioManager.test.ts` | The fake `AudioParam` lacked `setValueAtTime`, throwing before `source.stop`. Added the missing real API shape and assert the scheduled stop time; all four cases pass. | Unit lifecycle behavior only; no audio implementation or mix change. |
| `mountAnimation.test.ts` | Its constructor-free scene omitted the hoofstep buffer. Initialize it and check real cadence plus drain behavior; all four cases pass. | No runtime animation or asset change. |
| `villageArchitectureAssets.test.ts` | It called a procedural builder for `house_cottage_b`, now a committed GLB. Procedural geometry checks pass after routing that asset to actual source-production coverage in `authoredGlb.test.ts`. | Fresh cottage production now exposes the real source mismatch below. |
| `mainlandTraversal.test.ts` | The two full-wagon terminal failures reproduce at the same Pinewatch/Highridge poses in focused and full runs. | Do not accept S10/S18 traversal changes without repair or equivalent real-arrival evidence. |
| `mainlandEnvironment.test.ts` | The lake ice-house endpoint fails the claimed 1.2 m clearance even with actual authored Y. | Arrival/envelope semantics remain unresolved; no assertion or world alteration. |
| `starterIslandPreservation.test.ts` | Eight assertions fail on current interaction-anchor coordinates versus retained historical references: Sunreach stations, mainland markets and the Sunreach cove market. Focused replay reproduces all eight. | A pre-existing preservation contract conflict. Keep retained references intact; resolve the owning layout/history contract before S10/S18 save/world acceptance. |
| Runner RPC errors | Two `onTaskUpdate` communication timeouts in the broad run; none in the focused replay of the four newly failing files. | Harness errors remain recorded. They are not gameplay assertion failures or a clean-suite pass. |

The cottage source at `art/imported/tripo/adapted/house_cottage_b.glb` contains LOD0/LOD1 but lacks the catalog-required `house_cottage_b_LOD2`. `produceAuthoredGlb` rejects it before packaging. The published runtime cottage is the older, valid three-LOD model, so this is source/catalog/publication drift, not an observed failure to load that published model. Do not add a clone LOD, weaken the catalog, or republish an unrelated model merely to pass. Repair the committed source through its owning asset workflow before S15 or shared publication acceptance.

S08a is implemented in `GtaoStage`: every required gather/denoise anchor is checked before either shader/uniform set changes, incomplete prior configuration rejects, and a failed factory releases its owned pass/materials. **31 focused renderer tests pass**. The six-file fixture/renderer run passes **55 tests** and fails **1** on the cottage source mismatch; direct typecheck and targeted ESLint pass. These logs are in the same evidence directory. No Three.js version, visual tuning, simulation, save schema, layout or published asset changed in this preparation.

The existing performance harness now has opt-in `NEVA_PERF_CACHED_STARTUP=1`: after measured route passes it re-enters the same temporary Chrome context, clears only that context's IndexedDB to preserve the starting world, and retains HTTP/shader caches. It checks seed, pose/mode/weather, viewport, quality and active effects; failed optional effects fail acceptance. The first preflight caught an origin-unsafe quality initialization on `about:blank`; the origin check is fixed and the failed run is retained separately. Repeated timing now uses the frozen production bundle and real Apple M4/ANGLE Metal. Remaining repetitions and numeric gates are pending.

### S07 frozen production measurements — 2026-09-30

**21 tests passed in 38.8 minutes:** three interleaved repetitions of each of the seven production routes, with first-use and warm windows plus cold/cached startup. All runs used seed 42, High, 1920×1080, DPR 1, Chrome 154.0.8037.58 and hardware Apple M4/ANGLE Metal. Every run reported no runtime errors and no failed optional effect; village routes opened/closed the real market and saved successfully while walking. This is one hardware/quality lane, not general 60 FPS or browser-matrix acceptance.

The final hash check covered 2,948 snapshot files. Only the two intentionally extended performance harness files changed; runtime source, lockfile, source assets and published assets remained frozen. The preserved checkout separately reproduces the baseline audio/mount/architecture harness failures, lake envelope failure, two wagon arrivals and all eight historical-anchor preservation failures. Its longer traversal replay also reports one `onTaskUpdate` RPC timeout; the targeted preservation replay has no runner error. No assertion, retained reference or world data was loosened.

Evidence: `output/tech-stack-s07/baseline-final-2026-09-30/performance/` contains all 21 raw records, the run log/exit, summaries and immutable `comparison-limits.json`; `final-input-drift.json` and the two frozen failure-reproduction logs remain beside it. The baseline managed checkout remains attached for controlled paired follow-up measurements.

Comparison policy, frozen before installing or measuring the r184 candidate: a metric is bounded only when its baseline range is no larger than the greater of its measurement floor and 15% of its median. Allowance is the greater of the floor, observed range and 5% of the median (stall counts use 0%); candidate median must stay below baseline maximum plus that allowance. Floors are 0.5 ms frame time, 250 ms startup, 1 MiB settled heap and two stalls per measured pass. A meaningful improvement requires a candidate median below baseline minimum minus allowance, matching inputs and no failed companion gate. The exact unrounded ceilings and improvement cutoffs are in the frozen JSON. Each candidate comparison requires three samples and retains all of them.

Several frame/startup metrics are **inconclusive** because the machine/route variation is too large. They have no finite passing ceiling: obtain controlled paired measurements before closing the affected performance gate or claiming a speedup. Candidate compatibility and local integration may proceed under the revised priority, while performance acceptance stays open wherever required evidence is unresolved. Cached-context startup retained actual HTTP/shader caches, but most models still transferred; it does not demonstrate an offline or zero-download start. Reported heap is settled JavaScript heap, not total browser/GPU memory; atlas allocation and target lifecycle require separate review.

All cells show baseline range; candidate median ceiling. Each range has three samples. Inconclusive cells have no numeric acceptance ceiling.

| Route / pass | Frame p95 ms | Frame p99 ms | >50 ms stalls |
|---|---:|---:|---:|
| boat-journey / first-use | 16.7–33.4; inconclusive | 16.8–50.0; inconclusive | 2.0–7.0; inconclusive |
| boat-journey / warm | 16.8–33.4; inconclusive | 16.8–50.0; inconclusive | 0.0–4.0; inconclusive |
| farm-populated-walk / first-use | 16.7–33.3; inconclusive | 16.8–33.4; inconclusive | 0.0–2.0; ≤4.0 |
| farm-populated-walk / warm | 16.7–16.8; ≤17.6 | 16.8–33.4; inconclusive | 0.0–0.0; ≤2.0 |
| farm-storm-walk / first-use | 16.8–33.3; inconclusive | 16.8–33.4; inconclusive | 0.0–6.0; inconclusive |
| farm-storm-walk / warm | 16.8–33.3; inconclusive | 33.4–33.4; ≤35.1 | 0.0–1.0; ≤3.0 |
| loaded-wagon-drive / first-use | 33.4–50.1; inconclusive | 33.4–50.1; inconclusive | 0.0–46.0; inconclusive |
| loaded-wagon-drive / warm | 33.4–50.1; inconclusive | 33.4–50.1; inconclusive | 0.0–37.0; inconclusive |
| sport-fishing-fight / first-use | 16.7–16.8; ≤17.6 | 16.8–16.8; ≤17.6 | 0.0–1.0; ≤3.0 |
| sport-fishing-fight / warm | 16.7–16.8; ≤17.6 | 16.8–16.8; ≤17.6 | 0.0–1.0; ≤3.0 |
| storm-sailing / first-use | 16.8–33.4; inconclusive | 16.8–33.4; inconclusive | 1.0–2.0; ≤4.0 |
| storm-sailing / warm | 16.7–33.4; inconclusive | 16.8–33.4; inconclusive | 0.0–2.0; ≤4.0 |
| village-market-save-harbor / first-use | 33.4–50.1; inconclusive | 33.4–66.7; inconclusive | 6.0–127.0; inconclusive |
| village-market-save-harbor / warm | 33.4–50.0; inconclusive | 33.4–50.1; inconclusive | 3.0–39.0; inconclusive |

| Route | Cold startup ms | Cached startup ms | Settled first-use heap MiB | Settled warm heap MiB |
|---|---:|---:|---:|---:|
| boat-journey | 16205.0–19932.0; inconclusive | 16465.0–20636.0; inconclusive | 320.6–320.7; ≤336.8 | 321.2–321.7; ≤337.8 |
| farm-populated-walk | 15678.0–18197.0; ≤20716.0 | 16376.0–18027.0; ≤19678.0 | 324.3–324.8; ≤341.0 | 325.2–325.5; ≤341.7 |
| farm-storm-walk | 15943.0–17384.0; ≤18825.0 | 16551.0–20268.0; inconclusive | 326.3–326.6; ≤342.9 | 326.5–327.5; ≤343.8 |
| loaded-wagon-drive | 15772.0–21106.0; inconclusive | 16251.0–20105.0; inconclusive | 322.9–324.0; ≤340.2 | 322.6–323.7; ≤339.8 |
| sport-fishing-fight | 17815.0–19999.0; ≤22183.0 | 16531.0–17463.0; ≤18395.0 | 320.4–321.3; ≤337.3 | 320.8–321.3; ≤337.4 |
| storm-sailing | 16761.0–21301.0; inconclusive | 17210.0–24244.0; inconclusive | 320.1–320.2; ≤336.3 | 321.0–321.6; ≤337.6 |
| village-market-save-harbor | 16844.0–21169.0; inconclusive | 16745.0–21571.0; inconclusive | 324.5–324.7; ≤341.0 | 325.2–325.6; ≤341.8 |

Frozen limits SHA-256: `42b65d45a7d6f25b2292657d4b3450bf519a6d11fc03eb292830a475ab509c30`.

### S08 renderer, export and lifecycle adaptation — 2026-09-30

The attached upgrade checkout now runs exact `three@0.184.0` and `@types/three@0.184.1`. A single runtime Three is deduplicated through the dependency tree. The lockfile changes are limited to this runtime/type pair and the type package's transitive dependencies; runtime Rapier and the other installed libraries are unchanged. The shared checkout remains r174, preserving concurrent gameplay/save work.

The candidate shadow compositor combines the actual native depth textures, with raw nearest-sampled inputs and the matching Basic/PCF output sampler. It preserves the existing committed light frame, static refresh policy and moving-caster pass. Target ownership is invalidated on quality/context changes, day/night light changes, dimensions and upstream map replacement; failure retains a retryable frame. Medium/High use the upstream PCF replacement. The candidate Art Pipeline owner documents this format change; its root packed-depth contract remains accurate for the shared r174 runtime.

An actual shader compile failure in the river view exposed a generated-meadow normal contract: newer Three infers flat shading when a geometry lacks a CPU normal attribute, omitting its optional `vNormal`. Meadow now declares and writes its own transformed-normal varying, without inventing CPU normals or changing density, geometry, palette or tuning. This repair and GTAO public-draw test instrumentation are applied to the shared r174 checkout too. GTAO tests now exercise actual addon draws instead of private addon helper names.

Evidence completed:

- Candidate renderer/loader/batching/exporter suites: **83 tests passed** across the affected seven files after fixing the addon-helper test instrumentation; the intermediate failed run is retained. Additional water, atmosphere, surface, foliage, capture and batching coverage: **121 tests passed** in 18 files. Meadow geometry/source/shader coverage: **20 tests passed**. Direct candidate typecheck and production build pass.
- Shared r174 preparation: **47 tests passed** across meadow, GTAO and Art Yard; **13 enhanced-path tests passed** separately, including resource disposal and context reconstruction. Direct typecheck and targeted lint pass. These are focused results, not a fresh full-suite certificate.
- Fresh r184 export stage `run-6vZAcu` mechanically validates the selected static wagon, skinned/animated duck, windmill rotor and textured character. All four staged GLBs return HTTP 200 and render in Art Yard; the duck exposes its three clips and the character its ten source clips. All runtime error lists are empty. An existing missing favicon is recorded separately. No source or published model was replaced. Existing below-target quality classifications remain visible.
- Art Yard now supports selected partial stages. Its data and roster include only reported, present catalog candidates; an invalid stage or absent requested asset cannot fall back to published models. **9 routing tests pass**. The production viewer continues to support the published set. `ASSET_PRODUCTION.md` owns this preview contract.
- Twelve candidate fixed views have **zero shader/runtime errors**, matching the S07 camera, world seed, presentation time, weather, quality, viewport and software renderer. Farm/harbor noon, bridge noon/night, coast noon and harbor storm pairs were inspected: palette, exposure, water and broad grounding remain consistent; shadow edges differ with the new filter. No lighting retune or approved-snapshot replacement was used. Agent inspection is not human approval.
- Real Chrome graphics checks pass: Low → Medium → High → Medium → Low → High; Auto reset; HDR glow, AO off, brightness and scaled resolution; world context loss/restore; resize; and 20 character-preview mounts without losing the world context. The quality test originally observed the legitimate asynchronous `enhanced-preparing` state; it now waits for the required final path and active effects within the same timeout. The unchanged context/title tests and corrected quality retry together cover all three cases.

S08e1 has completed the same seven production routes with three interleaved repetitions and cold/cached startup. Candidate source/build identity is frozen in `output/tech-stack-s08/r184/measurement-input-identity.json` (SHA-256 `9e334442d5e287c12c812d6289704386ff5142369c2f682655c3e7dbd1d1cd58`). The existing S07 noise policy and ceilings are unchanged. Native depth adds a combined depth attachment; JavaScript heap and the pipeline's visible-target inventory do not describe the complete private shadow allocation. S08e2/S08/S09, performance acceptance and human visual review remain open.

Evidence locations: shared preparation/preview records under `output/tech-stack-s08/`; candidate install, exporter, unit/build, graphics and production records under the upgrade checkout's `output/tech-stack-s08/r184/`. Save impact: none from this modernization batch; unrelated concurrent saved-state changes are outside this candidate comparison.

### S08 production comparison — 2026-09-30

**21 tests passed in 39.1 minutes.** Every candidate route retained the S07 hardware/browser, seed, viewport/DPR, manual High preference, active effects and first-use/warm window contract. Runtime error lists and failed-stage lists are empty. Source verification found no changes in the 2,948 preserved inputs or 760 production-build files during the run. The local preview responses also match their respective frozen production index files.

The comparison covers 70 route/metric combinations: **32 bounded comparisons pass, none fail, and 38 remain inconclusive** under the original baseline policy. All raw records, including the slow first repetition, are retained in the shared checkout under `output/tech-stack-s08/r184/performance/`. `r184-comparison.json` and `r184-comparison.md` hold the complete result; the original S07 limits SHA-256 remains `42b65d45a7d6f25b2292657d4b3450bf519a6d11fc03eb292830a475ab509c30`. An inconclusive baseline has no passing ceiling, so these results do not complete S08 or establish an FPS improvement.

The initial Chrome CPU observation did not establish process ancestry. A fresh check identified the active benchmark as the only busy Chrome game renderer; the separate visible Chrome window contained no game tab. No unrelated browser/process was terminated. `performance-environment-check.json` retains this observation; external game-tab contention is unproven and is not a reason to discard any sample.

Both adjacent diagnostic pairs completed, with four functional passes on the unchanged production bundles: clear farm r174 then r184, followed by storm farm r184 then r174. The order and purpose were recorded before execution in `output/tech-stack-s08/r184/adjacent-controls/protocol.json`; records use repetition 4 in a separate directory. Post-control candidate source/build hashes still match the frozen identity. `comparison.json`/`.md` and `phase-attribution.json` retain the observations.

| Diagnostic route | r174 warm p95 / p99 (ms) | r184 warm p95 / p99 (ms) | Stalls over 50 ms, r174 / r184 |
|---|---:|---:|---:|
| Clear farm | 33.4 / 33.4 | 33.4 / 33.4 | 0 / 0 |
| Storm farm | 33.4 / 33.4 | 33.4 / 50.0 | 0 / 3 |

The clear-farm control reached 33.4 ms on both versions despite the earlier bounded baseline's 16.7–16.8 ms range. The storm candidate also has a longer tail: CPU frame/pipeline, rain and physics timing rose in this pair while its GPU p95 was similar. These are diagnostic leads, not an established cause or a passing performance verdict. One sample per version/route cannot establish repeatability. S08e2 must collect repeated adjacent pairs under stable conditions, investigate CPU/GPU attribution when a difference repeats, and resolve every affected acceptance metric before performance acceptance. The user's revised priority permits local migration integration first. The original comparison and numeric limits remain unchanged; these controls do not close the 38 inconclusive gates.

### Execution contract for remaining steps

Before each step, record its input identity, prerequisites, owning files and affected callers, scoped edit, save impact, exact selected commands, expected behavior, evidence destinations, and stop conditions. Read the root task route for that step; the following map is a starting point, not a substitute for tracing callers. Do not mark a step done with outstanding required gates. Never disable an effect, weaken an assertion, increase timeouts without diagnosis, or accept changed snapshots just to obtain a pass.

| Step | Prerequisite and bounded owners | Required evidence before completion |
|---|---|---|
| S07 | Preserved source/lockfile/assets; existing CI checks and `tests/e2e/performance-baseline.spec.ts` | Complete failure classification, source drift check, fixed-scene captures and matching-input production baseline; freeze numeric comparison limits before upgrades |
| S08/S09 | Preserved S07 baseline; performance acceptance is separate from local integration; `VisualRenderConfig`, shader/post-processing owners, `staticBatchSubmission`, `AssetLoader`, authored producer/exporter | Relevant existing shader/batch/loader suites; `tests/unit/assetLoader.test.ts`, `authoredPipeline.test.ts`, `authoredGlb.test.ts` where affected; runtime and newly exported asset parity at each checkpoint; visuals and performance |
| S10 | Baseline traversal/save failures resolved or affected assertions independently verified; `PhysicsWorld` and simulation commit callers | `tests/unit/physicsWorld.test.ts`, `physicsEdgeCases.test.ts`, `tests/simulation/physicsTraversal.test.ts`, affected retained-save tests, actual traversal and query measurements |
| S11/S06c/S12 | A supported version matrix; `package.json`, lockfile, Vite/Vitest/Playwright configs and `tools/vite/`/runner callers | `npm ls vite vite-node vitest @vitejs/plugin-react three`; clean `npm ci` in isolated checkout, selected tests, content/world-tool checks, direct production build and browser workers/WASM startup |
| S13 | Compatible compiler/parser metadata; TS/ESLint config and layout-editor AST callers | Direct typecheck/lint and `tests/unit/layoutEditorSourceRoundTrip.test.ts`, `layoutEditorPatch.test.ts`; explicit compiler deferral if unsupported |
| S14 | Compatible React/runtime types; `GameApp` snapshot callers and affected UI components | Affected UI suites and browser interactions, lifecycle/error/focus checks; matching profiler evidence for optimization claims |
| S15 | Three exporter checkpoints passed; catalog pipeline, optimizer, loader/decoder and editor BVH callers | `npm run art:test`, affected pipeline tests, no-publish representative generation, semantic validation and affected-family coverage; load/decode/editor inspection |
| S16 | Stable compatibility and route baseline | One isolated candidate at a time with equivalent-quality before/after evidence; revert unsuccessful experimental edits without disturbing unrelated work |
| S17 | Profiling and estimated porting scope | Written deferral rationale, or bounded prototype report with parity/cost comparison; no prototype required without a credible benefit |
| S18 | Required prior steps pass or optional work has justified deferral | Combined gates in phase 9, save rollback exercise, evidence index, separate modernization and player-benefit outcomes |

Commands above are selection anchors. At step entry, expand them to exact existing test paths and arguments after inspecting script hooks; preserve command, exit code and logs. A missing prerequisite, new unexplained failure, input drift, or incompatible dependency tree stops that step's acceptance while independent work may continue.

## 1. Establish a reproducible starting point

The checkout contains substantial ongoing work. Before implementation, establish the exact source state to modernize and preserve all existing changes.

- Use an isolated managed checkout based on an agreed source snapshot, including the relevant uncommitted work. Starting from an older clean commit would produce misleading comparisons.
- Record installed versions, lockfile, Node version, browser version, build identity, and asset-manifest identity.
- Run the existing check-only validation sequence before anything regenerates assets.
- Record existing failures separately from migration failures.
- Capture the current visual baseline at the farm, bridge, harbor, and lighthouse/coast, including clear weather, night, and storm conditions where relevant.

Use the existing `tests/e2e/performance-baseline.spec.ts` harness for populated farm walking, storm walking, village/market/harbor travel, loaded wagon driving, sailing, storm sailing, and sport fishing.

| Area | Evidence |
|---|---|
| Startup | Cold and cached startup, transfer bytes, time until controls are released, long tasks |
| Gameplay | Frame-time p50/p95/p99, visible stalls, simulation and presentation CPU time |
| Rendering | GPU pass timing where available, draw calls, triangles, render-target memory |
| Resources | Settled heap, renderer resources, repeated-load and disposal behavior |
| Tooling | Clean/incremental build time, typecheck time, selected asset-generation time |

Keep viewport, DPR, graphics settings, world/save, weather, and route identical between comparisons. Use interleaved repeated runs; differences within the observed variation are inconclusive.

Before accepting S07, write a comparison table per route and target hardware/quality tier: baseline sample count and range, numeric allowable regression for frame p95/p99, first-use stalls, startup and settled memory, plus the minimum meaningful improvement. Derive tolerances from repeated baseline variability, freeze them before candidate measurements, and retain all samples. If noise prevents a useful tolerance, improve the measurement or leave that metric inconclusive. A download/build-time improvement cannot offset a failed gameplay frame-time gate. Current 60/30 FPS goals do not replace these criteria.

Classify every baseline failure with exact test/assertion, command, source identity, reproducibility, affected contract and migration steps blocked. Distinguish behavioral failure, stale test expectation and environment/harness failure only after investigation. Reproduce affected failures with the narrowest relevant test; do not repeatedly rerun the full suite. An unrelated reproducible failure may remain recorded, but a failure in the contract being migrated requires a repair or an independent equivalent check before that migration can pass. Product acceptance of the existing game remains valid; this is not authorization for unrelated gameplay redesign.

**Acceptance:** a reproducible baseline exists and pre-existing failures are identified. The project's 60 FPS preference and 30 FPS minimum remain targets, not claims that the current game already meets them.

## 2. Fix dependency ownership and cache correctness first

This is necessary preparation, not general cleanup.

Two direct tooling dependencies were undeclared at audit time:

- Asset generators and exporters import `esbuild`.
- World baking, content validation, and world tools invoke `vite-node`.

They depend on the installation layout of other packages. Vite 8 changes its bundler, so those accidental dependencies cannot be relied upon. Its [migration guide](https://vite.dev/guide/migration) identifies the move away from esbuild.

### Implementation

- Declare compatible direct development dependencies for the tools Neva actually calls.
- Verify `vite-node` against the chosen Vite version. If compatibility is insufficient, migrate all affected commands together to a supported runner that preserves Neva's virtual modules and import behavior.
- Keep one consistent runner approach across content validation, world baking, road planning, and acceptance tooling.
- Establish an explicit Node requirement matching the selected dependency set and CI.
- Pin migration targets during implementation and commit the resolved lockfile.
- Verify clean installation without forced or ignored peer-dependency conflicts.

At audit time, `tools/authored/pipeline/producer.mjs` cached the bundled authored producer by source inputs without dependency versions. S05 repaired this; retain the following invariants during later migrations.

- Include the relevant Three.js/exporter, bundler, and build-option identity in the producer bundle cache key.
- Ensure the asset cache and producer bundle cache agree about toolchain changes.
- Add a focused regression proving that changing the toolchain cannot reuse an old generator bundle.
- Preserve existing cache artifacts as evidence; a one-time cache deletion is not the complete fix.

**Acceptance:** a fresh install can run the build and authoring tools, and dependency changes invalidate the correct caches.

## 3. Upgrade Three.js and adapt the complete rendering path

**Audit target:** Three.js `0.186.1`, with matching r186 types. Recheck patch releases when implementation begins.

Use **r174 → r184 → r186** as migration checkpoints, keeping the intermediate state temporary. This follows upstream's recommendation to limit upgrade jumps to ten releases. See the [Three.js migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide).

The work covers the game, Art Yard, character previews, loaders, and Node-based asset generators.

| Area | Required adaptation |
|---|---|
| Renderer configuration | Migrate deprecated shadow filtering; verify output color space, tone mapping, exposure, pixel ratio, and render-target behavior |
| Materials | Adapt terrain, roads, crops, foliage, rain, atmosphere, and water shader patches to current shader chunks |
| Post-processing | Verify GTAO shader modifications, shared depth ownership, water snapshots, bloom, FXAA, and final color output |
| Batching | Revalidate custom submission caching, instance visibility, shadow passes, LOD changes, and animated rigid batches |
| Loading | Verify Meshopt decoding, worker behavior, skinned clones, animations, textures, cancellation, and disposal |
| Lifecycle | Check shader warm-up, resize, graphics-tier transitions, context restoration, and repeated entry/exit |
| Authoring | Check GLTFExporter behavior, node names, hierarchy, material output, animation timing, and semantic determinism |

Two particularly sensitive owners are:

- `src/render/pipeline/GtaoStage.ts`, which performs string-based modifications of upstream shaders.
- `src/render/scene/staticBatchSubmission.ts`, which wraps native `BatchedMesh` callbacks.

Where shader replacements currently fail silently, add targeted checks that detect a missing expected anchor. Do not merely make TypeScript compile while dropping an effect.

Use existing renderer, shader-linkage, water, atmosphere, shadow, batching, and asset-loader tests. Add regressions only for actual migration risks uncovered.

The current S09 source trace identifies two uses of the deprecated inverse-view direction helper in `RainSurfaceMaterial.ts` and `SurfaceFieldShader.ts`; these transform normals and should migrate to the upstream normal helper when adopting r186. `CharacterPreview3D.tsx` still uses the deprecated Clock; adapt its frame update and cleanup to Timer, retaining preview context disposal and reduced-motion behavior. Inspect `WaterLod.ts`'s manually managed mesh matrices for r185's changed world-matrix update contract; its unchanged identity matrices do not justify speculative per-frame writes. Verify these against the selected release source and rerun their owning shader/lifecycle checks. This is an implementation queue, not evidence that S09 is complete. See the [upstream migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide).

### Acceptance

- No new shader compilation errors or missing visual features.
- Low, Medium, High, and Auto transitions work.
- Existing published GLBs load correctly.
- At both S08 and S09, newly generated representative static, skinned, animated and textured assets pass staged exporter/semantic checks and load in the candidate runtime. Inspect actual catalog coverage; validate frozen legacy assets without regeneration. This exporter gate belongs here, before S15's separate packaging upgrades. Preserve original published bytes and manifests; no mass publication is implied.
- Art Yard and gameplay render consistently.
- No unexplained sustained-play, startup, or memory regression.
- Visual differences from upstream lighting changes are reviewed explicitly.

An upgrade can be accepted for compatibility and fixes without claiming an FPS gain. A performance improvement requires matching measurements.

## 4. Upgrade Rapier and adopt its newer query architecture

**Audit target:** Rapier `0.21.0`, after checking the full migration path and package flavor.

This is a high-priority performance experiment because newer Rapier introduced a broad phase that also supports scene queries, reducing repeated acceleration-structure work in large scenes. It also added internal profiling facilities. See the [Rapier changelog](https://github.com/dimforge/rapier.js/blob/master/CHANGELOG.md).

### Implementation

- Verify the target package's current initialization, query, character-controller, and collider APIs.
- Preserve the required determinism properties when selecting the package flavor.
- Adapt `src/physics/PhysicsWorld.ts` to the new query-update lifecycle.
- Reassess the existing manual query-refresh optimization. Remove obsolete work only after equivalent correctness is demonstrated.
- Preserve query filtering for the player, terrain, moving hulls, static props, and camera/interaction services.
- Integrate useful Rapier profiling into existing diagnostics without enabling expensive profiling during normal play.
- Verify initialization cancellation and WASM loading in development and production.

**Correction to the initial audit:** the WASM rewrite plugin was absent from the checkout when preparing this plan. Validate the current loading path rather than restoring or patching that removed implementation. Recheck the active source snapshot before editing.

Regression coverage includes walking, sprinting, stairs, bridge transitions, terrain seams, mounted traversal, loaded wagon turns, docking, moving hull collisions, camera sweeps, edited obstacles, teleportation, and rejected physics commits.

Run existing saves through these routes. A dependency upgrade should not require a schema change; if an actual saved-state change becomes necessary, follow the migration protocol.

**Acceptance:** traversal and collision contracts remain intact, old saves retain their meaning, and physics/query cost is measured against the baseline.

## 5. Upgrade Vite, testing, and compiler tooling

**Audit targets:** Vite `8.3.1`, React plugin `6.1.1`, Vitest `5.0.2`, and Playwright `1.63.0`.

Use reviewable checkpoints, each with a compatible dependency set. The installed Vitest 3.2.7 and vite-node 3.2.4 declare Vite 5–7 support; the installed React plugin 4.7.0 also excludes Vite 8. Recheck target package metadata at implementation. S11/S06c/S12 must close together when compatibility requires coordinated upgrades; Playwright can remain separate. Inspect `npm ls vite vite-node vitest @vitejs/plugin-react three` and actual config/plugin resolution so tests do not silently validate a nested older Vite instead of the production plugin stack. Document intentional multiple versions and validate their boundaries; do not force peer resolution. Verify the runtime resolves the intended Three instance and aligned types.

Run clean installation and the relevant tool/build checks in an isolated checkout without reused project build/producer caches. Record native-platform results separately: a macOS pass does not establish the Linux CI lane's esbuild/Sharp/native dependency behavior. Hosted CI remains pending until actually observed.

### Vite

- Review the v6→v7 and v7→v8 migrations.
- Adapt custom catalog, Art Yard, layout-editor, production-artifact, and environment-bake plugins.
- Verify manual chunking under Rolldown rather than assuming old output boundaries remain identical.
- Preserve lazy loading of physics, enhanced rendering, and editor functionality.
- Verify emitted workers, asset URLs, production base paths, and WASM behavior.
- Check that development-only code and authoring metadata remain excluded from the gameplay bundle.
- Measure build time and startup/download behavior separately.

Vite's newer bundler is a development-speed opportunity; its effect on the delivered game must be measured independently. See the [Vite 8 announcement](https://vite.dev/blog/announcing-vite8).

### Vitest and Playwright

- Follow each intervening migration guide.
- Preserve meaningful worker limits for expensive world/physics suites.
- Check mock behavior, setup, timers, timeouts, reporters, and CLI assumptions.
- Pair Playwright updates with the intended browser installation.
- Never update visual snapshots solely to make changed tests pass.

See the [Vitest migration guide](https://vitest.dev/guide/migration/).

### TypeScript and ESLint

- Upgrade as a compatible set.
- Keep `@types/node` aligned with the supported Node runtime rather than automatically selecting the highest major.
- Resolve TypeScript 7 compatibility explicitly: the typescript-eslint package metadata inspected during the audit excluded it.
- Use a supported compiler/parser combination as the initial milestone. Treat TypeScript 7 adoption as a separately verified step if compatibility remains unresolved.
- Investigate the unusual `@babel/parser` version/tag ordering before changing it; the layout editor depends on its AST behavior and Recast round trips.

**Acceptance:** clean installation, build, checks, world tools, and editor source round trips work. Report measured tooling improvements and any compiler upgrade deliberately deferred.

## 6. Upgrade React and improve UI work where profiling justifies it

**Audit target:** React/React DOM `19.3.0`, with matching types.

### Implementation

- Follow the React 19 migration guidance for refs, effects, types, and error handling.
- Check root creation/unmounting and repeated entry into the game.
- Verify inventory, market, dialogue, crafting, settings, loading, and character-preview lifecycles.
- Preserve focus, keyboard input, pointer behavior, localization, and reduced motion.
- Profile the current `GameApp` → React snapshot/update path for unnecessary renders and unstable props.
- Apply targeted fixes to expensive HUD or modal updates.
- Evaluate React Compiler separately; enable it only after confirming compatibility and measuring the affected UI.
- Remove Zustand only after confirming that it has no remaining consumers.

React modernization does not replace simulation ownership or the direct Three.js world. See the [React upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide).

**Acceptance:** UI behavior remains correct, no stale snapshots or duplicate actions appear, and any claimed reduction in UI work is supported by profiling.

## 7. Upgrade asset processing without damaging authored content

**Audit targets:** Meshoptimizer `1.3.0`, glTF Transform packages `4.5.1`, Sharp `0.35.5`, and three-mesh-bvh `0.9.15`.

### Implementation

- Upgrade the glTF Transform packages together.
- Check encoder/decoder compatibility and worker decoding.
- Preserve lossless packaging for animated/skinned authored sources.
- Verify sockets, collision markers, LODs, skin weights, clip durations, and palette attributes.
- Validate three-mesh-bvh through actual layout-editor terrain snapping.
- Test fresh generation and cache reuse.
- Begin with representative static, skinned, animated, and textured assets; expand to every affected producer/family for final shared-toolchain acceptance.
- Validate frozen legacy assets without regenerating them.
- Distinguish expected byte changes from unintended semantic changes.

Use no-publish staging first. Updating dependencies is not authorization to mass-publish regenerated art or overwrite committed authored sources.

**Acceptance:** updated tools produce valid, semantically correct assets, and existing runtime assets continue to work. Record packaging size, generation time, and decode time separately.

## 8. Turn new capabilities into visible game improvements

After compatibility is stable, implement selected improvements one at a time. This phase makes the game better beyond having newer version numbers.

| Candidate | Intended benefit | Adoption gate |
|---|---|---|
| Updated shadow filtering | Better contact and softer edges | Inspect intentional visual changes and stay within measured shadow cost |
| Cascaded sunlight shadows | More consistent near/far landscape coverage | Compare against the current atlas; replace relevant ownership rather than running duplicate systems |
| New Rapier query path | Lower movement/query CPU cost | Traversal parity plus repeatable CPU improvement |
| Better shader preparation | Fewer first-use stalls | Lower first-use frame spikes without excessive startup time or memory |
| Asset decode/packaging changes | Faster entry or lower transfer cost | Measured download/decode benefit with semantic parity |
| Targeted React optimization | More responsive HUD and menus | Lower UI work without stale data or interaction regressions |

Three.js r186 introduces `SunLight` with cascaded shadows in its WebGL renderer, making it a concrete candidate for Neva's landscape—not an automatic replacement. See the [r186 release notes](https://github.com/mrdoob/three.js/releases/tag/r186).

Do not add expensive effects simply because they are newly available. Neva already has water, atmosphere, GTAO, and bloom owners; improvements integrate there.

### WebGPU evaluation

WebGPU begins with a cost/benefit decision using current profiles, target-device needs and the affected renderer owners. If there is no credible measured bottleneck it could address within a bounded port, record a justified deferral and close only the decision step. Otherwise, define the prototype scope and effort limit before porting a representative existing scene/material workload; compare equivalent quality, startup, memory, and frame time on target devices. Existing GLSL materials and `onBeforeCompile` patches cannot be carried over unchanged. See the [WebGPU compatibility guide](https://threejs.org/manual/pages/webgpurenderer).

If the trial demonstrates enough benefit, prepare the complete migration across materials, batching, shadows, water, post-processing, diagnostics, Art Yard, previews, and backend recovery. Shipping only a successful demo does not count as game integration. A supported WebGL path remains available until the replacement meets the game's compatibility requirements.

Before a renderer architecture redesign, expand the root task route and read the required full architecture, visual, and art-pipeline authorities. This plan does not waive those reads or define a second renderer baseline.

## 9. Integrate, validate, and document the result

Each phase is an independently reviewable change with package/lockfile updates, adaptations, focused checks, and evidence. Avoid mixing physics, renderer, and bundler changes into one difficult-to-diagnose patch.

### Final integration

For the implementation-first local playtest, M07 requires direct typecheck, scoped compatibility checks, production build and Chrome startup/core interactions/save reload. The full S18 acceptance below remains follow-up work; it is not a prerequisite for the user to play the integrated migrations.

- Run the full static, unit/simulation, build, and production-budget checks once on the combined candidate.
- Exercise New Game, Continue, farm work, fishing, cargo transport/sale, mounted travel, sailing, and save/reload.
- Repeat frozen production performance routes.
- Inspect the four visual reference scenes and relevant weather/quality states.
- Exercise resize, context recovery, cancellation, repeated startup, and disposal.
- Use the repository's Chrome automation lane; keep broader supported-browser validation distinct and explicitly report any unverified browser.
- Preserve a known-good source/lockfile/artifact checkpoint for rollback. Never roll back player saves as part of a dependency rollback.
- Using copied fixtures and an isolated browser profile, exercise old build save → upgraded build load/play/save → rollback build load. Check progression, inventory/cargo, position/mount/boat state and primary/backup preservation. Keep the original fixtures untouched. If new writes cannot be read safely by the rollback build, record that rollback is unsupported and resolve the forward-repair or explicit migration strategy before claiming a safe rollback; never overwrite a player's current save with an older copy.

### Evidence lanes and retention

Use `output/tech-stack-<step>/<run>/` for local commands, exit codes, reports and captures, and link a concise record from `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` when a gate has new evidence. Include source/dirty-input hashes, lockfile, manifests, tool/browser versions, hardware/backend, quality and route identity as relevant. Preserve failed runs. Gitignored output is local evidence, not durable shared storage; retain or attach required reports before deleting a checkout.

| Lane | Execution and scope |
|---|---|
| Existing CI | Clean install, codegen/content checks, typecheck/lint, unit/simulation, art tests, production build/download/render budgets; record actual hosted job result separately |
| Local production performance | `npm run perf:baseline` after inspecting config/hooks; frozen matching inputs and interleaved repeats. CI's render-budget test does not replace this lane |
| Gameplay and saves | Selected existing Chrome browser routes and copied-fixture rollback exercise; record exact scenarios and omissions |
| Visual | Existing fixed scenes plus affected quality/weather/lifecycle views; screenshots and agent inspection do not grant human approval |
| Compatibility | `01` §4 owns the desktop Chrome/Edge/Firefox/Safari scope and priority resolutions. Chrome automation on the recorded host is the initial measured lane. Record browser/OS/GPU/tier combinations tested and unverified. Safari validation remains required by `03` §21 for a browser/release claim; unavailable devices stay explicitly unverified, not inferred from Chrome |

Do not add every expensive route to each CI run. The step contract assigns targeted CI checks versus local/manual evidence; a required local gate still blocks that step's acceptance when absent.

Follow `LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md` §4 for check selection and command side effects. In particular, inspect generated drift before using aliases whose pre-hooks run `assets:sync`. Broaden or repeat checks only for changed inputs, failures, or unresolved concerns.

### Documentation ownership

Update only the affected canonical owners in the implementation change.

| Changed contract | Documentation owner |
|---|---|
| Runtime/toolchain, physics queries, renderer ownership | `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md` |
| Lighting, shadows, renderer behavior | `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md` §12 and the affected renderer owner |
| Shader/export implementation | `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md` §12, `LLM/ASSET_PRODUCTION.md`, and the affected implementation |
| Asset packaging or cache workflow | `LLM/ASSET_PRODUCTION.md` and `tools/authored/README.md` |
| Editor bindings or write behavior, if changed | `LLM/LAYOUT_EDITOR.md` |
| Measured evidence and remaining gaps | `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` |

## Completion criteria

- Selected versions are integrated throughout the game and its tools.
- Existing saves and gameplay work.
- Applicable checks pass, with pre-existing failures and remaining gaps stated explicitly.
- Claimed improvements have matching measurements.
- Report two outcomes separately: dependency modernization (compatible integrated versions) and game improvement (a retained, measured player-visible benefit). Completing version upgrades alone cannot close S16 or establish that the game became faster or better. If trials show no benefit, retain their evidence and leave the improvement outcome open or explicitly deferred.
- Any deferred compiler or renderer migration has a specific compatibility or evidence-based reason.
- Human visual acceptance, asset publication, and deployment are reported separately from mechanical completion.

M01–M08 track local migration delivery, with their scoped evidence above. The original unclosed items still track broader performance, gameplay and release acceptance. Integrated dependency compatibility does not certify an FPS gain, complete game-loop acceptance, asset publication or release readiness.
