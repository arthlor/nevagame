# W11 — Production Performance, Lifecycle and Browser Hardening

> Fragment of parent plan §15. Class: **P/engineering**. Depends on: W10
> (profiling starts in W00).
> Exit gate: **G11** — machine-owned budgets pass, lifecycle loops stabilize,
> required browser lanes have current evidence, unsupported metrics and
> blockers remain explicit.

**Outcome:** The finished world remains responsive and coherent on named target
hardware and supported browsers, including degraded graphics paths.

This phase consolidates profiling already performed during W00–W10. It is not
permission to postpone all performance work until the end.

## W11.1 — Re-run production budgets on frozen input

Run existing production budget and download checks before adding new arbitrary
numeric ceilings. Inspect `spatialSurfaceBatch.ts` and actual `WorldScene.ts`
use. Batching is not terrain simplification or streaming; reducing draw calls
does not prove the fragment shader is cheap. [R03, R13]

Profile worst views deliberately: broad coastal horizon, overlapping
foam/spray/mist, the entire waterfall, dense river vegetation, shadow-heavy
dusk, storm, near-patch edges and boat approach. Include cold shader/asset load
separately from warm traversal.

Record frame-time p50/p95/p99, visible primitive counts, draw submissions
across passes, render-target dimensions, program/texture/geometry counts and
load/long-task data. Query GPU time asynchronously when supported,
discard invalid/disjoint measurements, and label unsupported GPU timing rather
than substituting an FPS-derived guess. [E06]

## W11.2 — Optimize in evidence order

1. Remove redundant passes, duplicated water, invisible work and unnecessary
   transparent overlap.
2. Reduce expensive pixel work and capture resolution/coverage where visually safe.
3. Reduce shadow burden for small cover and unimportant effects.
4. Fix culling/bounds and use existing batching/instancing paths.
5. Reduce far-detail geometry, particle counts and noisy high-frequency shading.
6. Optimize control-map preparation/caching and asset payloads where measured.

Preserve gameplay membership/support across tiers. Low quality must not restore
misclassified water, remove the waterfall entirely, alter the shore or move
collidable vegetation.

Do not introduce global terrain decimation until the profiler proves a geometry
bottleneck. Local LOD must preserve contact/silhouette regions and joins, and
use a non-popping handoff. Avoid a broad streaming rewrite unless the measured
working set requires it.

## W11.3 — Verify resource lifecycle

- [ ] Repeatedly enter/leave the slice and change quality; counts stabilize
      after warmup rather than growing monotonically.
- [ ] Dispose owned geometry/materials/textures/targets and stop owned audio
      emitters/listeners when appropriate. Shared resources stay alive until
      their last owner releases them.
- [ ] Abort/cancel preparation safely; stale async completions do not attach
      objects after disposal or replace a newer generation.
- [ ] Rebuild any required GPU resources after supported context restoration;
      otherwise use the existing recoverable error/reload flow without save loss.
- [ ] Test resize, DPR change, tab suspension/resume, pause, loading
      cancellation and repeated new-game/load flows in isolated fixtures.

Removing a Three.js mesh from the scene does not dispose its geometry, material
or textures. Use explicit ownership and disposal; internal reusable caches need
not reach zero to pass a leak test. [E05]

## W11.4 — Use separate validation lanes

| Lane | What it proves | What it does not prove |
|---|---|---|
| Static/unit/simulation | Contracts, math, state transitions, migrations | Actual shader output, appearance, hardware performance |
| Software/headless WebGL | Shader compilation, deterministic captures, many rendering regressions | Target-device frame budget or complete browser behaviour |
| Production Chrome on target hardware | Primary render/performance behaviour under recorded conditions | Firefox/Safari behaviour |
| Firefox | Engine-specific shader/render/input smoke and representative play | Real Safari compatibility |
| WebKit automation | Useful additional engine smoke coverage | Equivalence to an actual Safari version/device |
| Actual Safari desktop | Required real Safari rendering, input, audio and persistence evidence | Other platforms not tested |
| Human visual/listening/play review | Art quality, clarity, navigation and audible impression | Numerical or migration correctness by itself |

The current repository CI is Chrome-focused. Additional Firefox/WebKit/Safari
checks are proposed release coverage; add them deliberately rather than
claiming they already exist. Use named Playwright projects only after
checking/adding their configuration and installing the pinned browsers.
[R03, E07]

## W11.5 — Establish measurable pass criteria

Existing repository hard budgets are authoritative. Proposed additional
regression policy: investigate a repeated same-machine p95/p99 regression
beyond normal baseline variability, and block release when it breaches the
adopted target budget. Record the baseline variability and allowed delta before
running the candidate; do not enlarge a threshold after a failure simply to pass.

A device already below the target at baseline needs an explicit
remediation/degraded-tier decision. "Only 5% slower" is not sufficient when it
already misses the required budget. Match actual quality, effective DPR, power
state, browser, scene and build mode in comparisons. Do not add CPU and GPU
timings as though their pipelined work necessarily sums directly to one frame.

**G11 exit:** machine-owned budgets pass, lifecycle loops stabilize, required
browser lanes have current evidence, unsupported metrics and blockers remain
explicit.
**Rollback:** reduce or revert compatible presentation cost first. Do not solve
performance by silently changing collision, resources, fishing access or saved
topology.
