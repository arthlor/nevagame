# 03 — Execution Sequence and Gates (W00–W12)

> Fragment of parent plan §3. `W00–W12` IDs avoid colliding with repo milestones
> `P0–P16`.

| Package | Deliverable | Dependency | Class | Exit gate | File |
|---|---|---|---|---|---|
| W00 | Reproducible baseline and authority/version inventory | None | Planning/diagnostic | G00 | `W00_baseline.md` |
| W01 | Protected-state fixtures, diagnostic probes and regressions | W00 | Diagnostic | G01 | `W01_preservation-and-probes.md` |
| W02 | Water classification and coastal-access fixes | W01 | B | G02 | `W02_water-classification-coastal-access.md` |
| W03 | Shared projection/field contracts and data-map parity | W02 | B/P | G03 | `W03_geo-contracts-derived-maps.md` |
| W04 | All-coast contact/swash treatment | W03 | P | G04 | `W04_shoreline-contact-swash.md` |
| W05 | Spring–waterfall–river graybox and viewpoint composition | W01, W03 | Candidate T | G05 | `W05_spring-waterfall-graybox.md` |
| W06 | Candidate terrain, collision, migration and support integration | W05 | T | G06 | `W06_topology-collision-migration.md` |
| W07 | Dedicated waterfall and connected water rendering | W04, W06 | P/T-bound | G07 | `W07_waterfall-water-presentation.md` |
| W08 | Landform, riverbank and seabed finish in the slice | W07 | P/T | G08 | `W08_terrain-banks-seabed.md` |
| W09 | Authored assets, vegetation, audio and framing; slice approval | W08 | P/T | G09 | `W09_art-atmosphere-audio-slice.md` |
| W10 | Controlled expansion across Neva and Sunreach | G09 | P/T | G10 | `W10_expansion-neva-sunreach.md` |
| W11 | Production optimization, lifecycle and browser matrix | W10; profiling starts W00 | P/engineering | G11 | `W11_performance-lifecycle-browsers.md` |
| W12 | Release, evidence audit and compatible rollback | G11 | Release | G12 | `W12_release-cleanup-rollback.md` |

## Concurrency and commit rules

- **Default execution is sequential.** W04 and W05 can overlap only after W03
  is frozen and their file ownership does not overlap.
- Do not let several agents simultaneously edit `WorldLayout.ts`,
  `VisualRenderConfig.ts`, the catalog, or migration owners.
- Each package contains several small commits. A package is not permission to
  implement all later packages.
- Complete one work item, run its focused checks, review its diff, then advance.
- Full release suites belong at integration/release gates, not after every
  material parameter adjustment. [R04]
