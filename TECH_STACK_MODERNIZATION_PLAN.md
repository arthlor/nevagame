# Neva Tech Stack Modernization Plan

Status: implementation started with low-cost dependency preparation. Runtime version upgrades and performance validation remain pending.

Prepared: 2026-09-29. Version targets reflect the dependency audit performed for this plan and must be rechecked when implementation begins.

This is an execution proposal, not a new technical authority. Root `AGENTS.md` and its routed canonical documents govern implementation. Current code and the lockfile own installed versions; the values below are an audit snapshot.

## Objective

Deliver three outcomes: smoother gameplay, a current and maintainable runtime, and faster development and asset production. Each upgrade includes the code adaptation needed to use it correctly and evidence of its effect on Neva.

The first runtime deliverable is a fully working game on current Three.js while retaining WebGL. Rapier, build tools, UI, and asset tooling follow in separately measurable changes. New rendering capabilities are adopted where they improve Neva's existing scenes.

Planning does not authorize deployment, mass asset publication, or overwriting unrelated work. Save impact is expected to be none; any necessary saved-state change must follow the repository migration protocol.

## Implementation checklist

Complete one bounded step at a time. A checked item means only that step passed its stated checks, not that its whole phase or the game modernization is complete. Cheap manifest preparation may precede the expensive frozen baseline because it retains existing resolved versions.

- [x] **S01 — Execution checklist:** add ordered implementation steps and distinguish preparation from runtime upgrades.
- [x] **S02 — Direct esbuild dependency:** declare the installed version explicitly and smoke-test an in-memory TypeScript bundle.
- [x] **S03 — Direct vite-node dependency:** declare the installed version explicitly and smoke-test a temporary TypeScript script.
- [x] **S04 — Dependency preparation verification:** confirm manifest/lockfile agreement and no resolved package-version changes; inspect the scoped diff.
- [ ] **S05 — Producer cache correctness:** include dependency/build identity in the authored bundle cache key and add focused invalidation coverage; update its owning documentation.
- [ ] **S06 — Runner and Node compatibility:** select the supported Node/tooling combination and resolve all vite-node consumers before Vite 8. The currently installed vite-node 3.2.4 declares Vite 5–7 support, so declaring it directly does not establish Vite 8 compatibility.
- [ ] **S07 — Frozen baseline:** preserve the source snapshot, check generated drift, record existing failures, and capture the production performance/visual baseline described in phase 1.
- [ ] **S08 — Three.js r184 checkpoint:** adapt affected APIs/shaders and verify renderer, loaders, batching, previews, and authoring compatibility.
- [ ] **S09 — Three.js r186 integration:** align types, complete lifecycle/quality checks, inspect reference scenes, and compare production measurements.
- [ ] **S10 — Rapier migration:** adapt initialization/query lifecycle, preserve physics contracts and existing saves, and measure traversal/query cost.
- [ ] **S11 — Vite migration:** upgrade the bundler/plugin set, adapt custom plugins and chunking, and verify workers, assets, production startup, and build time.
- [ ] **S12 — Test tooling:** migrate Vitest/Playwright with their configuration and browser requirements; preserve meaningful tests and visual baselines.
- [ ] **S13 — Compiler/linter compatibility:** upgrade a supported TypeScript/ESLint/parser set; resolve or explicitly defer TypeScript 7 and verify editor AST round trips.
- [ ] **S14 — React migration:** align runtime/types, verify UI lifecycle and interactions, then profile targeted UI improvements; remove Zustand only after a complete consumer check.
- [ ] **S15 — Asset tooling migration:** upgrade compatible encoders/decoders and processors, validate staged representative assets, then expand shared-toolchain coverage without mass publication.
- [ ] **S16 — Measured improvements:** trial shadow, query, shader-preparation, loading, and UI improvements independently; retain only demonstrated benefits.
- [ ] **S17 — WebGPU decision:** run a bounded parity/performance evaluation and document adoption or deferral; a demo does not establish full integration.
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

Next bounded step: S05, producer cache invalidation with a focused regression. Major upgrades remain deferred to a pass with enough budget for their required integration checks.

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

There is also a cache issue in `tools/authored/pipeline/producer.mjs`: the bundled authored producer is cached by source inputs, but dependency versions are not part of that bundle's hash.

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

### Acceptance

- No new shader compilation errors or missing visual features.
- Low, Medium, High, and Auto transitions work.
- Existing published GLBs load correctly.
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

Use separate checkpoints for the bundler and test-runner changes.

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
| Updated shadow filtering | Better contact and softer edges | Preserve art direction and stay within measured shadow cost |
| Cascaded sunlight shadows | More consistent near/far landscape coverage | Compare against the current atlas; replace relevant ownership rather than running duplicate systems |
| New Rapier query path | Lower movement/query CPU cost | Traversal parity plus repeatable CPU improvement |
| Better shader preparation | Fewer first-use stalls | Lower first-use frame spikes without excessive startup time or memory |
| Asset decode/packaging changes | Faster entry or lower transfer cost | Measured download/decode benefit with semantic parity |
| Targeted React optimization | More responsive HUD and menus | Lower UI work without stale data or interaction regressions |

Three.js r186 introduces `SunLight` with cascaded shadows in its WebGL renderer, making it a concrete candidate for Neva's landscape—not an automatic replacement. See the [r186 release notes](https://github.com/mrdoob/three.js/releases/tag/r186).

Do not add expensive effects simply because they are newly available. Neva already has water, atmosphere, GTAO, and bloom owners; improvements integrate there.

### WebGPU evaluation

WebGPU has its own bounded evaluation. First port a representative existing scene/material workload and compare equivalent quality, startup, memory, and frame time on target devices. Existing GLSL materials and `onBeforeCompile` patches cannot be carried over unchanged. See the [WebGPU compatibility guide](https://threejs.org/manual/pages/webgpurenderer).

If the trial demonstrates enough benefit, prepare the complete migration across materials, batching, shadows, water, post-processing, diagnostics, Art Yard, previews, and backend recovery. Shipping only a successful demo does not count as game integration. A supported WebGL path remains available until the replacement meets the game's compatibility requirements.

Before a renderer architecture redesign, expand the root task route and read the required full architecture, visual, and art-pipeline authorities. This plan does not waive those reads or define a second renderer baseline.

## 9. Integrate, validate, and document the result

Each phase is an independently reviewable change with package/lockfile updates, adaptations, focused checks, and evidence. Avoid mixing physics, renderer, and bundler changes into one difficult-to-diagnose patch.

### Final integration

- Run the full static, unit/simulation, build, and production-budget checks once on the combined candidate.
- Exercise New Game, Continue, farm work, fishing, cargo transport/sale, mounted travel, sailing, and save/reload.
- Repeat frozen production performance routes.
- Inspect the four visual reference scenes and relevant weather/quality states.
- Exercise resize, context recovery, cancellation, repeated startup, and disposal.
- Use the repository's Chrome automation lane; keep broader supported-browser validation distinct and explicitly report any unverified browser.
- Preserve a known-good source/lockfile/artifact checkpoint for rollback. Never roll back player saves as part of a dependency rollback.

Follow `LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md` §4 for check selection and command side effects. In particular, inspect generated drift before using aliases whose pre-hooks run `assets:sync`. Broaden or repeat checks only for changed inputs, failures, or unresolved concerns.

### Documentation ownership

Update only the affected canonical owners in the implementation change.

| Changed contract | Documentation owner |
|---|---|
| Runtime/toolchain, physics queries, renderer ownership | `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md` |
| Lighting, shadows, visual-quality behavior | `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` |
| Shader/export implementation | `LLM/LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md` |
| Asset packaging or cache workflow | `LLM/ASSET_PRODUCTION.md` and `tools/authored/README.md` |
| Editor bindings or write behavior, if changed | `LLM/LAYOUT_EDITOR.md` |
| Measured evidence and remaining gaps | `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` |

## Completion criteria

- Selected versions are integrated throughout the game and its tools.
- Existing saves and gameplay work.
- Applicable checks pass, with pre-existing failures and remaining gaps stated explicitly.
- Claimed improvements have matching measurements.
- Any deferred compiler or renderer migration has a specific compatibility or evidence-based reason.
- Human visual acceptance, asset publication, and deployment are reported separately from mechanical completion.

Unchecked items record intended work. Only the scoped preparation checks listed in the evidence section have passed; no runtime version upgrade, gameplay validation, performance gain, publication, or release gate is certified by this document.
