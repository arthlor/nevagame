# W00 — Establish the Baseline Before Changing the World

> Fragment of parent plan §4. Class: planning/diagnostic. Depends on: none.
> Exit gate: **G00** — input identity, baseline artifacts, command results,
> resolved versions, known failures and human/hardware gaps recorded.

**Outcome:** A candidate can be compared against a trustworthy original, and no
asset regeneration or test run silently contaminates that original.

## W00.1 — Inspect and isolate the working tree

- [ ] Record `git rev-parse HEAD`, branch, `git status --short`, Node/npm
      versions and lockfile hash.
- [ ] Preserve unrelated work. Use a separate worktree/branch for implementation
      when appropriate; do not stash, reset, discard or commit the user's
      unrelated changes without permission.
- [ ] Confirm whether the checkout still matches the audited SHA
      (`688fec961dc3f08fc4184087d2a753339fa623d2`). Re-read affected owners
      when it does not.
- [ ] Use an isolated browser profile/origin and copied test fixtures. Do not
      load candidate topology over the sole personal save.
- [ ] Check resolved dependency versions; use `npm ci` in the clean
      implementation worktree. Do not update the lockfile to solve an unrelated
      installation problem.

## W00.2 — Read the current routed authorities

Read root `AGENTS.md`, then the owning documents and linked sections required
by its task-routing table. For the eventual cross-system gold slice that
includes architecture/persistence, relevant gameplay invariants, production
execution, visual baseline/water/terrain, Art Pipeline and Blender; audio/layout
documents are required when those contracts change.

Architecture §6.1 remains the single migration ledger. Read runtime schema
constants and the migration chain before allocating a new version.
`WorldAnchors.ts` was verified at layout revision 17 at the reviewed SHA;
**do not preallocate "18" or a new schema number in this plan** — another
change may consume them. [R01, R05]

## W00.3 — Check generated drift before regeneration

Follow the actual CI ordering. Commands verified at the reviewed SHA — recheck
definitions before executing on a newer checkout. [R02–R04]

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

`npm run typecheck`, `npm test`, `npm run build`, `npm run dev` have asset-sync
prehooks at this snapshot. Do not run those aliases first when verifying whether
committed generated output is stale. A direct build still creates build output;
"check-only" here means avoiding adapter regeneration, not promising that no
files are created.

Capture failures before repair. Existing failures remain open issues; they do
not become passes because a narrower test later passes. Production baseline
failures block a release claim, although independent implementation may proceed
in its isolated branch.

## W00.4 — Capture matching-quality world evidence

Reuse `world:acceptance`, existing scene presets and preservation machinery. The
inspected harness already includes `bridge_river`, `starter_farm`,
`harbor_market`, `lighthouse_coast`, `mountain_skyline`, `river_source`,
`western_overlook` and five Sunreach scenes. It has software/hardware lanes and
composition checks across seeds 0–63. Extend it rather than creating a parallel
harness. [R06]

Use existing presets first; add provisional waterfall-lip, plunge-pool,
western-sea and estuary views only where coverage is missing. Save the ordinary
gameplay camera, not just an attractive free camera.

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

Freeze time/seed/camera through existing deterministic test hooks. Screenshots
do not freeze shader time automatically. Capture a short motion traversal
separately; a frozen screenshot cannot reveal flowing direction, popping,
transparency sorting or water seams in motion. Match screenshot baselines to the
OS/browser/render backend; Playwright documents environmental differences. [E03]

## W00.5 — Measure before setting new budgets

Use the existing production `test:budget` and download-budget checks; keep DEV
Art Yard measurements separate. Record frame-time median/p95/p99, draw
submissions and triangles across all relevant passes, resource counts, load
time, long tasks and GPU timings where supported. Label unavailable metrics; do
not turn `renderer.info.memory` counts into invented VRAM megabytes.

Choose a named target desktop configuration and a named lower-tier
configuration. Proposed product targets are 60 FPS / 16.7 ms and 30 FPS /
33.3 ms respectively, not measured Neva results. Existing machine-owned budgets
remain hard gates unless explicitly revised with evidence.

**G00 exit:** input identity, baseline artifacts, command results, resolved
versions, known failures and required human/hardware gaps are recorded.
**Rollback:** delete only disposable candidate outputs in the isolated work
area; no gameplay, schema, asset or save changes should exist yet.
