# Appendix C — Commands and Evidence Recipes

> Fragment of parent plan Appendix C. Recheck command definitions for side
> effects, ports, build mode and browser config before running — aliases at the
> reviewed SHA carry asset-sync prehooks.

## C.1 Focused development checks

After verifying the affected files exist and local dependencies are installed:

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

Do not claim that these three tests alone prove terrain, migrations or
production performance. Follow the repository's task-to-verification matrix
(`03` §4) and broaden according to actual risk. [R04]

## C.2 World evidence

Options verified in the reviewed `tools/world/acceptance.mjs` — check again
before execution on a changed tool. [R06]

```bash
npm run world:acceptance -- --scope starter-terrain --lane software
npm run world:acceptance -- --scope starter-terrain --lane hardware

# Full-world gate after expansion:
npm run world:acceptance -- --scope world --lane both
```

Potentially expensive integration runs. Run against a frozen input manifest. A
missing hardware capability is **not run/blocked**, not a software substitute.
Do not run the costly full acceptance suite after every isolated color
adjustment.

## C.3 Release evidence

Use the check-before-regenerate sequence in `W00_baseline.md`, followed by the
applicable existing suites:

```bash
npm run test:e2e
npm run visual:test
npm run test:budget
```

Review all command definitions for side effects, ports, build mode and browser
configuration. `visual:update` updates expected images; it is not an acceptance
command. Run it only for explicitly reviewed intentional baseline changes with
appropriate scope.

Selected art production uses actual catalog IDs and the selectors required by
the existing Blender CLI. Full strict/determinism/certification checks follow
the repository's milestone/release matrix; routine asset work does not
automatically require regenerating the entire catalog. [R01, R04, R15]
