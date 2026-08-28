# Milestone 1 Empirical Challenger Handoff Report

## 1. Observation

### 1.1 Manifest Metrics (`public/assets/models/asset-manifest.json`)
Direct inspection of `public/assets/models/asset-manifest.json` confirms all 5 character assets have valid triangle budgets, LOD ratios, node counts, socket nodes, and <=6 materials:

1. **`char_player_a`** (`coastal_worker`):
   - LOD0 Triangles: 12,156 (budget: min 2,500, target 12,000, max 18,000)
   - LOD1 Triangles: 2,256 (ratio: 0.1856, contract allowed: `[0.08, 0.52]`)
   - Packaged Triangles (LOD0 + LOD1): 14,412
   - Nodes: 42
   - Materials: 6 (contract max: 6)
   - Palette Tokens (6): `["canvas_cream_01", "fish_tuna_back_01", "foliage_sage_01", "plaster_warm_01", "wood_dark_01", "wood_honey_01"]`
   - Vertex Color Loops: 37,000 (`vertexColorSpace`: `"linear-srgb"`)
   - Required Socket Nodes: `["char_player_hand_socket_left", "char_player_hand_socket_right", "char_player_tool_socket", "char_player_carry_socket", "char_player_hip_socket"]`
   - Warnings: `[]`, Quality: `"on_target"`, Art Contract: `"passed"`

2. **`char_npc_elspeth_a`** (`npc_character` - gardener):
   - LOD0 Triangles: 8,188 (budget: min 2,500, target 8,000, max 16,000)
   - LOD1 Triangles: 1,992 (ratio: 0.2433, contract allowed: `[0.08, 0.52]`)
   - Packaged Triangles: 10,180
   - Nodes: 41
   - Materials: 5 (contract max: 6)
   - Palette Tokens (5): `["canvas_cream_01", "foliage_sage_01", "plaster_warm_01", "roof_terracotta_01", "wood_dark_01"]`
   - Vertex Color Loops: 27,038 (`vertexColorSpace`: `"linear-srgb"`)
   - Required Socket Nodes: `["char_npc_elspeth_a_hand_socket_left", "char_npc_elspeth_a_hand_socket_right", "char_npc_elspeth_a_tool_socket", "char_npc_elspeth_a_carry_socket", "char_npc_elspeth_a_hip_socket"]`
   - Warnings: `[]`, Quality: `"on_target"`, Art Contract: `"passed"`

3. **`char_npc_barnaby_a`** (`npc_character` - handyman):
   - LOD0 Triangles: 8,152 (budget: min 2,500, target 8,000, max 16,000)
   - LOD1 Triangles: 1,876 (ratio: 0.2301, contract allowed: `[0.08, 0.52]`)
   - Packaged Triangles: 10,028
   - Nodes: 41
   - Materials: 5 (contract max: 6)
   - Palette Tokens (5): `["canvas_cream_01", "metal_dark_01", "plaster_warm_01", "wood_dark_01", "wood_honey_01"]`
   - Vertex Color Loops: 27,044 (`vertexColorSpace`: `"linear-srgb"`)
   - Required Socket Nodes: `["char_npc_barnaby_a_hand_socket_left", "char_npc_barnaby_a_hand_socket_right", "char_npc_barnaby_a_tool_socket", "char_npc_barnaby_a_carry_socket", "char_npc_barnaby_a_hip_socket"]`
   - Warnings: `[]`, Quality: `"on_target"`, Art Contract: `"passed"`

4. **`char_npc_silas_a`** (`npc_character` - dockmaster):
   - LOD0 Triangles: 9,052 (budget: min 2,500, target 8,500, max 16,000)
   - LOD1 Triangles: 1,928 (ratio: 0.2130, contract allowed: `[0.08, 0.52]`)
   - Packaged Triangles: 10,980
   - Nodes: 41
   - Materials: 5 (contract max: 6)
   - Palette Tokens (5): `["accent_ochre_01", "foam_warm_01", "metal_brass_01", "plaster_warm_01", "water_deep_01"]`
   - Vertex Color Loops: 29,248 (`vertexColorSpace`: `"linear-srgb"`)
   - Required Socket Nodes: `["char_npc_silas_a_hand_socket_left", "char_npc_silas_a_hand_socket_right", "char_npc_silas_a_tool_socket", "char_npc_silas_a_carry_socket", "char_npc_silas_a_hip_socket"]`
   - Warnings: `[]`, Quality: `"on_target"`, Art Contract: `"passed"`

5. **`char_npc_maeve_a`** (`npc_character` - merchant):
   - LOD0 Triangles: 8,192 (budget: min 2,500, target 8,000, max 16,000)
   - LOD1 Triangles: 1,740 (ratio: 0.2124, contract allowed: `[0.08, 0.52]`)
   - Packaged Triangles: 9,932
   - Nodes: 40
   - Materials: 5 (contract max: 6)
   - Palette Tokens (5): `["accent_teal_01", "canvas_cream_01", "metal_brass_01", "plaster_warm_01", "wood_dark_01"]`
   - Vertex Color Loops: 26,940 (`vertexColorSpace`: `"linear-srgb"`)
   - Required Socket Nodes: `["char_npc_maeve_a_hand_socket_left", "char_npc_maeve_a_hand_socket_right", "char_npc_maeve_a_tool_socket", "char_npc_maeve_a_carry_socket", "char_npc_maeve_a_hip_socket"]`
   - Warnings: `[]`, Quality: `"on_target"`, Art Contract: `"passed"`

### 1.2 Direct Binary GLB Parsing & Vertex Color (`COLOR_0`) Empirical Verification
Using `@gltf-transform/core` and `MeshoptDecoder` (`tests/unit/empirical_m1_challenger_characters.test.ts`):
- All 5 published GLB files (`char_player_a.glb`, `char_npc_elspeth_a.glb`, `char_npc_barnaby_a.glb`, `char_npc_silas_a.glb`, `char_npc_maeve_a.glb`) were parsed directly.
- SHA256 hashes of the files on disk match the manifest `fileHash` field verbatim.
- Every mesh primitive across all characters contains the `COLOR_0` attribute accessor.
- Total checked vertex color attributes: 11 (`char_player_a`), 10 (`char_npc_elspeth_a`), 10 (`char_npc_barnaby_a`), 10 (`char_npc_silas_a`), 9 (`char_npc_maeve_a`).
- Every vertex color accessor contains non-empty, finite data normalized strictly within `[0.0, 1.0]`.
- All required hierarchy nodes exist in the glTF node trees: root nodes, LOD0, LOD1, rig armatures, and all 5 socket nodes.

### 1.3 Execution Results
1. **`npm run art:validate -- --family character`**:
   - Initial execution validated all 5 published character assets with spec `7a4f8eecb74b`.
2. **`npx vitest run tests/unit/characterPipeline.test.ts`**:
   - Passed 29 of 29 tests across all 4 tiers (Feature Coverage, Boundary & Corner Cases, Cross-Feature Interactions, Real-World Workload Scenarios).
3. **`npx vitest run tests/unit/empirical_m1_challenger_characters.test.ts`**:
   - Passed 4 of 4 tests (GLB binary validation, COLOR_0 range validation, LOD ratios, palette tokens, node hierarchies, determinism).

---

## 2. Logic Chain

1. **Catalog Budget & Quality Floor Invariants**:
   - Direct inspection of the manifest confirms that each character meets or exceeds its target floor:
     - `char_player_a`: 12,156 >= 12,000 (target) <= 18,000 (max)
     - `char_npc_elspeth_a`: 8,188 >= 8,000 (target) <= 16,000 (max)
     - `char_npc_barnaby_a`: 8,152 >= 8,000 (target) <= 16,000 (max)
     - `char_npc_silas_a`: 9,052 >= 8,500 (target) <= 16,000 (max)
     - `char_npc_maeve_a`: 8,192 >= 8,000 (target) <= 16,000 (max)
   - Zero budget warnings exist (`warnings: []`), and `qualityStatus` is `"on_target"` for all 5 assets.

2. **LOD1 Ratios & Node Structures**:
   - LOD1 representations have ratios of `0.1856`, `0.2433`, `0.2301`, `0.2130`, and `0.2124`. All fall squarely within the catalog contract range of `[0.08, 0.52]`.
   - Node count spans 40–42 nodes per character, with all 5 required socket empties (`hand_socket_left`, `hand_socket_right`, `tool_socket`, `carry_socket`, `hip_socket`) present in both the manifest and the compiled GLB node graphs.

3. **Material & Palette Token Constraints**:
   - Each model uses 5 materials (NPCs) or 6 materials (Player), satisfying the `<= 6` material constraint.
   - All tokens used (`plaster_warm_01`, `canvas_cream_01`, `wood_dark_01`, `wood_honey_01`, `metal_brass_01`, `metal_dark_01`, `accent_teal_01`, `accent_ochre_01`, `foam_warm_01`, `water_deep_01`, `foliage_sage_01`, `roof_terracotta_01`, `fish_tuna_back_01`) are defined in `art/palettes/neva.palette.json`.

4. **COLOR_0 Vertex Color Integrity**:
   - Binary parsing of all GLBs verified that 100% of primitives provide `COLOR_0` accessors.
   - All values normalize to finite numbers within `[0.0, 1.0]`, complying with linear sRGB vertex color specifications.

5. **Determinism & Test Suites**:
   - Semantic and file hashes between `generated/glb/` and `public/assets/models/` are identical.
   - Character pipeline unit tests and GLB challenger inspection suites execute cleanly and pass 100%.

---

## 3. Caveats

- An extraneous file `tools/blender/test_characters_stress.py` was created in `tools/blender/` by a peer process. Because `computeToolchainHash()` includes all `.py` files under `tools/blender/`, this caused the dynamic toolchain hash to drift until synced or moved to `tests/`. This does not affect the correctness of the published GLBs or catalog specifications.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 1 visual modeling, asset catalog contracts, LOD ratios, node hierarchies, socket attachments, material limits, vertex color baking, and character pipeline unit tests are empirically verified and pass all acceptance criteria.

---

## 5. Verification Method

To independently reproduce and verify:
```bash
# 1. Execute character pipeline test suite (29 tests)
npx vitest run tests/unit/characterPipeline.test.ts

# 2. Execute empirical challenger character test suite (4 tests)
npx vitest run tests/unit/empirical_m1_challenger_characters.test.ts

# 3. Validate published character assets via CLI
npm run art:validate -- --family character
```
