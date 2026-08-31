# Plan: Neva Tools Architecture & Implementation Specification (v2.0)

## Phase 0: Survey & Architecture Mapping
- Launch 3 parallel Explorers:
  - Explorer 1 (Art Pipeline & UI Atlas): Investigate R1 (tools/blender/cache.mjs, pool.mjs, optimize.mjs, src/render/assets/AssetHotSwapper.ts, AssetLoader.ts) & R3 (tools/ui/extrudeAndPack.mjs).
  - Explorer 2 (Layout Editor & Level Placement): Investigate R2 (tools/layout-editor/patchPlacement.ts, src/layout-editor/TerrainSnapping.ts, src/layout-editor/history/HistoryManager.ts, PlacementEditor.ts).
  - Explorer 3 (Audio Normalization, Visual Regression CI & CLI): Investigate R4 (tools/audio/normalizeBus.mjs) & R5 (tests/e2e/visual-regression.spec.ts, tools/cli.mjs, package.json scripts).
- Merge explorer findings into `PROJECT.md` with Feature Inventory, Milestones, Code Layout, Interface Contracts.

## Phase 1: Implementation of R1 - 3D Procedural Art Pipeline & Incremental Caching
- Explorer -> Worker -> Reviewer x2 -> Challenger x2 -> Auditor loop for R1.

## Phase 2: Implementation of R2 - Lossless AST Level & Placement Editor
- Explorer -> Worker -> Reviewer x2 -> Challenger x2 -> Auditor loop for R2.

## Phase 3: Implementation of R3 - UI Texture Atlas with 2D Edge Dilation & Lossless Packaging
- Explorer -> Worker -> Reviewer x2 -> Challenger x2 -> Auditor loop for R3.

## Phase 4: Implementation of R4 - Category-Based Bus Audio Normalization
- Explorer -> Worker -> Reviewer x2 -> Challenger x2 -> Auditor loop for R4.

## Phase 5: Implementation of R5 - Deterministic Visual Regression CI & Unified Developer CLI
- Explorer -> Worker -> Reviewer x2 -> Challenger x2 -> Auditor loop for R5.

## Phase 6: Full Verification Gate & Handoff
- Worker runs:
  - npm run typecheck (0 errors)
  - npm run test (all unit tests pass)
  - npm run build (bundles successfully)
  - CLI commands & full functional testing across all 5 subsystems
- Final Review, Audit, and Victory Report.
