# Appendix E — Source Index and Authority References

> Fragment of parent plan Appendix E. All repository links pinned to the
> reviewed commit `688fec961dc3f08fc4184087d2a753339fa623d2`. Recheck owners on
> the execution checkout. A referenced authority is not a claim that its full
> contents or every code path were tested.

- **R01 — Root routing, invariants and asset rules:**
  `AGENTS.md`.
- **R02 — Declared dependencies, scripts and prehooks:** `package.json`.
- **R03 — Check ordering, production budget and Chrome-focused CI:**
  `.github/workflows/ci.yml`.
- **R04 — Task contracts, validation matrix, visual-gold gates and persistence
  routing:** `LLM/03_PRODUCTION_ROADMAP_LLM_AGENT_PLAYBOOK.md` — the executing
  agent must read all sections required by root routing, including §25 for
  migrations.
- **R05 — Layout revision and stable gameplay anchors:** `src/world/WorldAnchors.ts`.
  Architecture/persistence authority:
  `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md`, particularly the single ledger in
  §6.1; inspect full required sections before implementation.
- **R06 — Existing scenes, overlays, lanes and composition evidence:**
  `tools/world/acceptance.mjs`.
- **R07 — Island topology, ecology and Sunreach anchors:**
  `src/world/WorldIslands.ts`.
- **R08 — Water classification, optics, swash and shaders:**
  `src/render/water/WaterSurface.ts`, `CoastalOptics.ts`, `ShoreFoam.ts`,
  `FacetedWater.ts`, `waterShadingGlsl.ts`.
- **R09 — Terrain/support, river profile, membership, depth and fishing access:**
  `src/world/WorldLayout.ts`.
- **R10 — Current spring profile, summits and foothill trails:**
  `src/world/NevaHeadwaters.ts`, `src/world/NevaLandforms.ts`.
- **R11 — Existing headwater/wave contract tests:**
  `tests/unit/headwaterWater.test.ts`, `waterSurfaceNormal.test.ts`,
  `waterShaderLinkage.test.ts`.
- **R12 — Habitat/composition owners and evidence:**
  `src/world/WorldCompositionField.ts`, `src/world/WorldEnvironmentLayout.ts`,
  `tests/unit/worldCompositionEvidence.test.ts`.
- **R13 — Spatial batching and additional existing test locations:**
  `src/render/scene/spatialSurfaceBatch.ts`, `tests/unit`. Presence of tests is
  not a passing result.
- **R14 — Inspected support/mount/fishing-aware migration example:**
  `src/persistence/migrateTerrainLayout17.ts`. Read `src/persistence` and the
  retained fixtures before changing the chain or storage.
- **R15 — Required asset-production owners:** `LLM/BLENDER.md`,
  `tools/blender/README.md`. Referenced by root routing; read in full before
  asset implementation.
- **R16 — Existing contextual camera-framing owner:**
  `src/render/camera/ExplorationFraming.ts`.

External technical references (consulted 16 Sept 2026 — principles only; the
repo's locked versions and established pipeline determine supported APIs):

- **E01 — Rapier collider types and heightfield restrictions:**
  Rapier JS colliders guide (`rapier.rs/docs/user_guides/javascript/colliders/`).
- **E02 — Linear workflow, non-color data and custom shader output:**
  Three.js color management manual.
- **E03 — Screenshot-baseline environmental consistency:**
  Playwright visual comparisons docs.
- **E04 — Transparency sorting/intersections:** Three.js transparency manual.
- **E05 — Explicit disposal and shared-resource caveats:**
  Three.js disposal guide.
- **E06 — GPU query/disjoint timing principles:** MDN
  `EXT_disjoint_timer_query`. Use the appropriate supported WebGL-version
  extension; do not assume availability.
- **E07 — Browser channels/projects and engine coverage:** Playwright browsers docs.

Full pinned URLs live in the parent plan's Appendix E.
