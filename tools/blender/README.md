# Neva art toolchain

The asset catalog at `assets/specs/asset-catalog.json` and palette at
`art/palettes/neva.palette.json` are the production authorities. Blender
generators must not maintain parallel filename or color lists.

## Commands

```bash
npm run art:generate -- --asset tree_oak_a
npm run art:generate -- --family architecture --no-publish
npm run art:generate -- --all
npm run art:validate -- --all
npm run art:determinism -- --all
npm run art:preview -- --all
npm run art:preview -- --stage latest --all
npm run art:test-builders
npm run art:benchmark
```

`art:generate` writes to a run-specific `generated/.staging` directory, validates
the Blender scene and raw GLB, applies targeted glTF-Transform and Meshopt
operations, revalidates the result, and only then promotes it. Selected asset
and report files are promoted as one rollback-capable transaction. Stale files
are removed only when they were owned by the previous full manifest.

`--no-publish` leaves `generated/glb` and `public/assets/models` unchanged.
`art:generate:strict` additionally requires each asset to reach its aspirational
triangle target; normal generation enforces the production minimum and hard
maximum and records target gaps in the report.

`art:preview -- --stage latest` resolves the newest staged run containing the
complete selected set. An explicit `--stage run-ID` is also accepted. Preview
paths are confined to `generated/.staging`, so a staged candidate can be
reviewed without copying it into either published model directory.

## Blender resolution

The CLI resolves Blender in this order and prints the selected version before
generation:

1. `BLENDER_BIN`
2. `blender` on `PATH`
3. `/Applications/Blender.app/Contents/MacOS/Blender`

Blender 5.2 LTS is the supported baseline.

## Outputs

- `generated/reports/asset-manifest.json` — hashes and machine-readable metrics
- `generated/reports/asset-report.md` — human-readable catalog report
- `public/assets/models/asset-manifest.json` — public parity manifest
- `generated/previews/candidates/run-ID/asset-review-yard.png` — 1440×900 catalog yard
- `generated/previews/candidates/run-ID/hero/` — front, rear, side, and three-quarter views
- `generated/previews/candidates/run-ID/gameplay/` — 8 m, 15 m, 30 m, and declared-read-distance views
- `generated/previews/candidates/run-ID/candidate-manifest.json` — spec and asset hashes for the review package
- `tests/visual/candidates/*-candidate.png` — fixed gameplay-camera candidates

Candidate images are review artifacts, not approved baselines. Human art
direction is still required before replacing references.
