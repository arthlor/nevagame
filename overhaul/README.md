# Neva World Overhaul — LLM Work-Package Index

> **Fragment notice:** This folder is a mechanical dissection of
> `NEVA_WORLD_OVERHAUL_IMPLEMENTATION_PLAN.md` (prepared 16 Sept 2026,
> baseline `688fec961dc3f08fc4184087d2a753339fa623d2`) into small
> LLM-digestible files. It creates **no new authority**.
> Root `AGENTS.md` remains the routing authority; `LLM/01`, `02`, `04`,
> Art Pipeline, `BLENDER.md`, `06`, `03`, `LAYOUT_EDITOR.md` remain their
> respective owners. Contract changes go into those owners, not here.
> Status lives in `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md`.
> If this folder disagrees with the parent plan or a routed owner, the owner wins —
> record the conflict per `AGENTS.md` and pause the affected decision.

**Objective (from parent plan):** Make Neva an immersive, authored low-poly
coastal world by fixing geographical inconsistencies first, completing one
exceptional spring–waterfall–river slice, then extending its proven terrain,
shoreline, water and composition language across Neva and Sunreach. Preserve
the existing game, saves, identities, asset pipeline and renderer.

**"Complete" means:** the required evidence exists, passes, and corresponds
to the exact candidate build — not that code or screenshots were produced.

## Execution principle

**Fix geographical truth → preserve saves and support → prove one connected
place → finish its art and sound → expand in controlled regions → validate
the exact release.**

## File map

| File | Parent-plan source | Purpose |
|---|---|---|
| `01_scope-and-boundaries.md` | §1 | Preserve / Deliver / Excluded / change classes P-B-T |
| `02_evidence-baseline-D01-D06.md` | §2 | Audit findings D01–D06 as reproduction targets |
| `03_execution-sequence-and-gates.md` | §3 | W00–W12 dependency / class / exit-gate table + concurrency rules |
| `W00_baseline.md` | §4 | Reproducible baseline, authority inventory, drift checks, evidence capture, budgets |
| `W01_preservation-and-probes.md` | §5 | Protected relationships, fixtures, geo probes, expected failures |
| `W02_water-classification-coastal-access.md` | §6 | Render-region fix + coastal fishing access, no topology move |
| `W03_geo-contracts-derived-maps.md` | §7 | Evaluation order, conventions, data contracts, map parity |
| `W04_shoreline-contact-swash.md` | §8 | All-coast foam/swash/dampness treatment |
| `W05_spring-waterfall-graybox.md` | §9 | Graybox slice: envelope, composition, reach endpoints |
| `W06_topology-collision-migration.md` | §10 | Revision allocation, support ownership, affected entities, persistence, migration matrix |
| `W07_waterfall-water-presentation.md` | §11 | Shaped sheet, effect order, render passes, time/quality, connectivity |
| `W08_terrain-banks-seabed.md` | §12 | Landforms, contacts, normals, reaches, seabed, topology re-gate |
| `W09_art-atmosphere-audio-slice.md` | §13 | Asset kit, habitat groups, waterfall audio, lighting, framing, slice decision |
| `W10_expansion-neva-sunreach.md` | §14 | Region-by-region expansion order, work cards, island contrast |
| `W11_performance-lifecycle-browsers.md` | §15 | Budgets, evidence-order optimization, lifecycle, validation lanes, pass criteria |
| `W12_release-cleanup-rollback.md` | §16 | Cleanup, final acceptance, deployment, rollback table, completion report |
| `Appendix-A_validation-matrix.md` | App. A | GEO / ACCESS / WATER / TERRAIN / SAVE / WORLD / PRESENT / AUDIO / PERF / BROWSER / RELEASE scenarios + tolerances |
| `Appendix-B_failure-modes.md` | App. B | Failure modes, preventive measures, stop conditions |
| `Appendix-C_commands.md` | App. C | Focused checks, world evidence, release evidence recipes |
| `Appendix-D_work-card-and-kickoff.md` | App. D | Per-item work card template + ready-to-use kickoff prompt |
| `Appendix-E_sources.md` | App. E | R01–R16 + E01–E07 source index with pinned links |

## Work-package gate summary

| Package | Deliverable | Depends on | Class | Exit gate |
|---|---|---|---|---|
| W00 | Reproducible baseline and authority/version inventory | None | Planning/diagnostic | G00 |
| W01 | Protected-state fixtures, diagnostic probes, regressions | W00 | Diagnostic | G01 |
| W02 | Water classification and coastal-access fixes | W01 | B | G02 |
| W03 | Shared projection/field contracts and data-map parity | W02 | B/P | G03 |
| W04 | All-coast contact/swash treatment | W03 | P | G04 |
| W05 | Spring–waterfall–river graybox and viewpoint composition | W01, W03 | Candidate T | G05 |
| W06 | Candidate terrain, collision, migration, support integration | W05 | T | G06 |
| W07 | Dedicated waterfall and connected water rendering | W04, W06 | P/T-bound | G07 |
| W08 | Landform, riverbank and seabed finish in the slice | W07 | P/T | G08 |
| W09 | Authored assets, vegetation, audio, framing; slice approval | W08 | P/T | G09 |
| W10 | Controlled expansion across Neva and Sunreach | G09 | P/T | G10 |
| W11 | Production optimization, lifecycle, browser matrix | W10 (profiling from W00) | P/engineering | G11 |
| W12 | Release, evidence audit, compatible rollback | G11 | Release | G12 |

**Concurrency:** Default is sequential. W04 + W05 may overlap only after W03
is frozen and file ownership does not overlap. Never let several agents edit
`WorldLayout.ts`, `VisualRenderConfig.ts`, the catalog, or migration owners
simultaneously. One work item at a time; one implementing agent per owning source.

## How an LLM should use this folder

1. Start at this README, then `Appendix-D_work-card-and-kickoff.md` for the
   kickoff prompt and work-card template.
2. Read `01_scope-and-boundaries.md` (classes P/B/T) and
   `02_evidence-baseline-D01-D06.md` before touching anything.
3. Work packages in order W00 → W12. Read the single `Wxx_*.md` for the
   active item plus the appendices it references. Do not jump ahead to final
   art, rewrites, dependency upgrades, production topology, or real saves.
4. Assign change class (P/B/T) before editing; fill one work card per item;
   run focused checks; review the diff; then advance.
5. `Docs updated:` line required in every completion report (owner paths, or
   `none — no documented fact changed`).

`Docs updated: none — new dissection folder only; no documented fact changed.`
