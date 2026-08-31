# Empirical Challenge Report: Milestone 2 (R2 — Lossless AST Level & Placement Editor)

## 1. Observation

- **Component Under Review**: `tools/layout-editor/patchPlacement.ts` and related R2 subsystems (`src/layout-editor/TerrainSnapping.ts`, `src/layout-editor/history/HistoryManager.ts`, `src/app/PlacementEditor.ts`).
- **Empirical Test Suite Created**: `tests/unit/empirical_r2_patch_placement_challenge.test.ts` (28 dedicated adversarial test cases across 8 categories).
- **Test Results Observed**:
  1. **Complex Comment & Formatting Preservation**:
     - Tested on TypeScript sources containing file-level JSDoc blocks, multi-line ASCII banners, section comments, inner property comments, inline comments (`// coord x`), inter-element block comments, trailing commas, and closing bracket comments.
     - Verified that single property updates, new element insertions, and middle/first/last element deletions preserve every comment verbatim without token loss, comment stripping, or formatting corruption.
     - Verified `authoredPlacement("authored.id", { ... })` function call expressions and AST mutations with scale arrays, grounding vectors, and boolean flags (`practicalLight: true`).
  2. **Duplicate ID Rejection & Missing ID Error Handling**:
     - Verified zero-match guarantee: updating a non-existent ID throws `LayoutEditPatchError: Target layout ID "..." not found`.
     - Verified duplicate-ID guarantee: updating an ID with 2+ occurrences in the file throws `LayoutEditPatchError: Duplicate layout ID "..." found in ... (N occurrences)`.
     - Verified delete zero-match guarantee: deleting a non-existent ID throws `LayoutEditPatchError: Delete failed: target ID "..." not found`.
     - Verified batch mutation atomicity: when one mutation in a batch fails, the entire batch is rejected and 0 changes are written to disk.
  3. **Atomic File Write Resilience & Temp File Cleanup**:
     - Verified syntax validation before commit: passing malformed TypeScript syntax triggers a pre-commit validation error and leaves the target file completely unmodified.
     - Verified 0 orphan `.tmp*` files remain on disk after syntax errors or failed writes.
     - Verified 50 concurrent atomic writes to distinct files using PID + timestamp + randomized tokens in temp file names execute with 0 collisions or race conditions.
  4. **Idempotency & Formatting Stability Across Repeated Mutations**:
     - Verified strict idempotency: applying the exact same update mutation 20 consecutive times produces byte-for-byte identical output files on cycles 2 through 20 (zero whitespace inflation, no duplicate commas, no creeping indentation).
     - Verified oscillation stability: oscillating between two distinct states over 20 cycles maintains canonical byte-for-byte identity.
     - Verified full lifecycle stability: add $\rightarrow$ update $\rightarrow$ delete leaves a structurally clean TypeScript file without syntax regressions.
  5. **Boundary Conditions & AST Invariants**:
     - Verified deletion of first array element and last array element preserves valid TypeScript syntax and surrounding comments.
     - Verified adding items to initially empty arrays (`[]`).
     - Verified property insertion onto existing objects when the property is not yet present.
     - Verified handling of objects with quoted property keys (`"id": "...", "x": 10`).
     - Verified negative numbers, `-0` normalization, floats formatted to 4 decimal places, and safe expression evaluation (`evalLayoutNumber`).
- **Milestone 2 Unit Test Suite Execution**:
  - `tests/unit/empirical_r2_patch_placement_challenge.test.ts` $\rightarrow$ 28/28 passed (196ms)
  - `tests/unit/patchPlacement.test.ts` $\rightarrow$ 8/8 passed (132ms)
  - `tests/unit/layoutEditorPatch.test.ts` $\rightarrow$ 36/36 passed (3.59s)
  - `tests/unit/terrainSnapping.test.ts` $\rightarrow$ 7/7 passed (3.61s)
  - `tests/unit/empirical_r2_terrain_history_stress.test.ts` $\rightarrow$ 24/24 passed (32ms)
  - `tests/unit/historyManager.test.ts` $\rightarrow$ 10/10 passed (9ms)
  - **Total R2 Subsystem Test Count**: 113 / 113 tests passed (100% pass rate).
- **Compilation & Build Gates**:
  - `npm run typecheck` $\rightarrow$ 0 compilation errors.
  - `npm run build` $\rightarrow$ Vite production bundle succeeds in 2.39s.

## 2. Logic Chain

1. **Recast AST Parsing & Printing**:
   `patchPlacement.ts` pairs Recast with `@babel/parser` configured with `tokens: true` and the TypeScript plugin. Recast parses the full token stream and attaches comments directly to AST nodes. When modifying a property or inserting/deleting elements, only the modified subtree is reprinted, guaranteeing that untouched code tokens, comments, and whitespace are preserved verbatim.
2. **Zero-Match & Duplicate-ID Safety**:
   By traversing targeted array declarators (`STARTER_PROP_ANCHORS`, `AUTHORED_DETAIL_PLACEMENTS`, etc.) and tracking `matchCount`, the patcher strictly guarantees that ambiguous IDs are rejected before writing to disk, avoiding silent layout desync.
3. **Atomic Disk Commits**:
   `atomicWriteSourceFile` uses a two-phase commit: (1) post-parse validation via `parse(content, { parser: tsParser })`, (2) write to unique `${filePath}.tmp-${process.pid}-${Date.now()}-${randomToken}` followed by `fs.renameSync`. Any parse failure or I/O error unlinks the temp file and leaves the original file untouched, preventing file corruption.
4. **Empirical Reproduction**:
   Through 28 rigorous adversarial tests covering comment preservation, multi-round idempotency, concurrency, quoted keys, boundary deletions, and math expression parsing, all invariants were validated empirically and directly executed.

## 3. Caveats

- **DEV Presentation Scope**: `TerrainSnappingSystem`, `HistoryManager`, and `patchPlacement.ts` are developer tooling / level editor presentation components. They do not leak into simulation state or serializable gameplay truth, adhering to `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md`.
- **Pre-existing Failures in Unrelated Subsystems**: 7 tests in simulation fishing encounter mechanics and world layout seeded counts fail due to pre-existing codebase changes unrelated to Subsystem 2 (M2). Subsystem 2 itself has 113/113 passing tests.

## 4. Conclusion

**Verdict: APPROVE**

The implementation of `tools/layout-editor/patchPlacement.ts` and the Milestone 2 (R2) Level & Placement Editor subsystems fully satisfies all requirements of the specification:
- Lossless comment and formatting preservation verified under extreme comment banners and inline annotations.
- Zero-match and duplicate-ID guarantees verified.
- Atomic `.tmp` writes with pre-commit AST syntax validation and clean cleanup verified.
- Idempotency and formatting stability verified across 20-round mutation sweeps.
- Typecheck and Vite build pass with 0 errors.

## 5. Verification Method

To independently reproduce all empirical challenge results:

1. **Run Full Milestone 2 Unit Test Suite**:
   ```bash
   npx vitest run tests/unit/empirical_r2_patch_placement_challenge.test.ts tests/unit/empirical_r2_terrain_history_stress.test.ts tests/unit/patchPlacement.test.ts tests/unit/layoutEditorPatch.test.ts tests/unit/terrainSnapping.test.ts tests/unit/historyManager.test.ts
   ```
   *Expected Result*: 6 test files pass, 113/113 tests pass.

2. **Run TypeScript Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected Result*: 0 compilation errors.

3. **Run Vite Production Build**:
   ```bash
   npm run build
   ```
   *Expected Result*: Build completes successfully.
