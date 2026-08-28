# Milestone 1 Adversarial Review Report: Procedural 3D Visual Modeling & Catalog Validation

**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### Codebase and Toolchain State
1. **Procedural Model Upgrades in `tools/blender/generators/characters.py`**:
   - `_rig_bone_for_mesh(name: str)` lines 187–218 defines pattern-matching rules mapping individual mesh parts to humanoid armature bones prior to `join_meshes`:
     ```python
     def _rig_bone_for_mesh(name: str) -> str:
         side = "left" if "_left" in name else "right" if "_right" in name else None
         if "canteen" in name and side:
             return f"rig_canteen_{side}"
         if any(token in name for token in ("backpack", "pack_roll", "pack_flap", "pack_pouch", "pack_frame", "pack_buckle", "pack_lower", "pack_strap", "pack_body", "pack_bedroll")):
             return "rig_backpack"
         if "hat_brim" in name:
             return "rig_hat_brim"
         if side and ("hand_" in name or "finger_" in name):
             return f"rig_hand_{side}"
         if side and "shoulder" in name:
             return f"rig_upper_arm_{side}"
         if side and "elbow" in name:
             return f"rig_forearm_{side}"
         if side and ("forearm_" in name or "sleeve_cuff_" in name or "sleeve_" in name or "sleeve_guard" in name):
             return f"rig_forearm_{side}"
         if side and "upper_arm_" in name:
             return f"rig_upper_arm_{side}"
         if side and ("boot_" in name or "boot" in name):
             return f"rig_foot_{side}"
         if side and "knee" in name:
             return f"rig_shin_{side}"
         if side and ("shin_" in name or "trouser_cuff_" in name):
             return f"rig_shin_{side}"
         if side and "thigh_" in name:
             return f"rig_thigh_{side}"
         if any(token in name for token in ("head", "nose", "eye_", "ear_", "brow_", "mouth", "hair_", "hat_", "beard_", "bonnet_", "scarf_", "pencil", "pin", "bun", "braid", "mustache")):
             return "rig_head"
         if any(token in name for token in ("pelvis", "belt", "pouch", "hammer_", "trowel_", "skirt", "coin_", "apron_skirt", "seed_", "herb_", "ledger_", "ruler_", "chisel_", "keys", "dock_rope", "spyglass")):
             return "rig_pelvis"
         return "rig_spine"
     ```

2. **Mesh Placement vs Bone Binding Mismatches**:
   - **Facial Features**: `_build_stylized_head_and_face` generates `character_chin` (lines 704–711) and `character_cheek_left`/`character_cheek_right` (lines 762–769). Neither `"chin"` nor `"cheek"` is present in the `rig_head` token list `("head", "nose", "eye_", "ear_", "brow_", "mouth", "hair_", "hat_", "beard_", "bonnet_", "scarf_", "pencil", "pin", "bun", "braid", "mustache")`. As a result, `_rig_bone_for_mesh` falls through and returns `"rig_spine"`.
   - **Silas Coat Cuffs**: `char_npc_silas_a` adds `character_coat_cuff_left` and `character_coat_cuff_right` (lines 1259–1260) at `z = height * 0.36` (wrist level). Because `coat_cuff_` does not contain `"sleeve_cuff_"`, `"sleeve_"`, `"forearm_"`, or `"sleeve_guard"`, `_rig_bone_for_mesh` falls through and returns `"rig_spine"`.
   - **Barnaby Chest Pocket Tools**: `char_npc_barnaby_a` adds `character_ruler_wood` and `character_chisel_metal` (lines 1215–1216) located in the chest bib pocket at `z = height * 0.60` and `0.61`. In `_rig_bone_for_mesh`, `"ruler_"` and `"chisel_"` are routed to `"rig_pelvis"`.
   - **Elspeth Chest Herb Cluster**: `char_npc_elspeth_a` adds `character_herb_cluster` (line 1190) located on the upper chest bib at `(0.12, -0.16, height * 0.63)`. In `_rig_bone_for_mesh`, `"herb_"` is routed to `"rig_pelvis"`.
   - **Maeve Chest Scale Brooch**: `char_npc_maeve_a` adds `character_scale_pin`, `character_scale_pin_beam`, `character_scale_pin_pan_left`, and `character_scale_pin_pan_right` (lines 1281–1284) located on the upper chest bib at `(-0.10, -0.18, height * 0.63)`. In `_rig_bone_for_mesh`, `"pin"` routes them to `"rig_head"`.

3. **Validation & Test Execution Outputs**:
   - `npm run art:validate -- --family character`:
     ```
     [NEVA ART] Validated 5 published assets (spec 7a4f8eecb74b)
     ```
   - `npm run art:determinism -- --family character`:
     ```
     [NEVA ART] Blender: Blender 5.2.0 LTS (/Applications/Blender.app/Contents/MacOS/Blender)
     [NEVA ART] Mechanical validation passed for 5 selected assets (0 cache hits, 5 generated)
     [NEVA ART] Semantic determinism passed for 5 assets
     ```
   - `npx vitest run tests/unit/characterPipeline.test.ts`:
     ```
     Test Files  1 passed (1)
          Tests  29 passed (29)
       Duration  1.19s
     ```
   - `npx vitest run tests/unit/artPipeline.test.ts`:
     ```
     Test Files  1 passed (1)
          Tests  15 passed (15)
     ```

4. **Published Manifest Metrics**:
   - `char_player_a`: LOD0 12,156 tris (target 12,000, max 18,000), LOD1 2,256 tris (ratio 0.1856), 6 materials.
   - `char_npc_elspeth_a`: LOD0 8,188 tris (target 8,000, max 16,000), LOD1 1,992 tris (ratio 0.2433), 5 materials.
   - `char_npc_barnaby_a`: LOD0 8,152 tris (target 8,000, max 16,000), LOD1 1,876 tris (ratio 0.2301), 5 materials.
   - `char_npc_silas_a`: LOD0 9,052 tris (target 8,500, max 16,000), LOD1 1,928 tris (ratio 0.2130), 5 materials.
   - `char_npc_maeve_a`: LOD0 8,192 tris (target 8,000, max 16,000), LOD1 1,740 tris (ratio 0.2124), 5 materials.
   - All 5 standard bone sockets (`hand_socket_left`, `hand_socket_right`, `tool_socket`, `carry_socket`, `hip_socket`) exist and are parented to the correct bones.

---

## 2. Logic Chain

1. **Procedural Modeling & Triangle Budget Compliance**:
   - The visual modeling additions across the player and 4 NPCs successfully establish distinct silhouettes in accordance with Neva Art Bible §13.
   - Triangle budgets for all 4 NPCs were properly elevated to meet the catalog target floors (8,000–8,500 tris) without exceeding hard maxima (16,000 tris).
   - LOD1 representations strictly satisfy LOD ratio constraints `[0.08, 0.52]` and palette tokens are valid.

2. **Skinning & Bone Routing Defects**:
   - In `_bind_character_meshes`, initial vertex weights are assigned per submesh based on `_rig_bone_for_mesh(mesh.name)`.
   - When meshes sharing the same material are merged via `join_meshes`, their vertex group weights are preserved in the final combined skin meshes (`*_LOD0_material_*`).
   - Because of pattern-matching bugs in `_rig_bone_for_mesh`:
     - `character_chin` and `character_cheek_*` are bound to `rig_spine` with weight 1.0. When `rig_head` rotates during head turning, talking, looking, or falling animations (`turn_left`, `turn_right`, `talk_gesture`, `fall`, `land_hard`), the chin and cheeks stay rigid relative to the spine while the cranium and facial features rotate, tearing the face apart.
     - `character_coat_cuff_*` on Silas is bound to `rig_spine` with weight 1.0 instead of `rig_forearm_*`. When Silas swings his arms during locomotion, the coat cuffs remain floating in space around his hips.
     - `character_ruler_wood` and `character_chisel_metal` (Barnaby) and `character_herb_cluster` (Elspeth) are located in the upper chest bib (`z ~ 0.60–0.63`), but are weighted 1.0 to `rig_pelvis`. When the character bends forward at the spine (`plant`, `harvest`, `workstation`, `brace`), these chest items will detach and stay fixed to the pelvis.
     - `character_scale_pin*` (Maeve) is located on the chest (`z = 0.63`), but is weighted 1.0 to `rig_head`. When Maeve looks around or tilts her head, the balance scale brooch rotates in mid-air off her chest.

3. **Integrity & Pipeline Assessment**:
   - No hardcoded test bypasses or fabricated verification artifacts were found. The mechanical tools (`art:validate`, `art:determinism`) and test suites run cleanly.
   - However, the bone routing bugs constitute functional modeling/rigging defects that directly degrade deformation and animation fidelity.

---

## 3. Caveats

- Ragdoll physical simulation (M3) and Animation Controller runtime expansions (M4) are separate future milestones and were not evaluated for physical dynamics.
- Visual inspection was performed via programmatic verification of Blender scene hierarchy, vertex groups, and bone weighting.

---

## 4. Conclusion

Milestone 1 satisfies catalog schemas, triangle targets, LOD contracts, palette tokens, and socket parent contracts. However, changes are requested due to **5 critical bone-routing bugs** in `tools/blender/generators/characters.py`:

### Required Changes:
1. **Facial Meshes**: Update `_rig_bone_for_mesh` to include `"chin"` and `"cheek"` in the `rig_head` token list so `character_chin` and `character_cheek_*` route to `rig_head`.
2. **Silas Coat Cuffs**: Update `_rig_bone_for_mesh` to include `"coat_cuff_"` in the forearm pattern rule (`if side and ("forearm_" in name or "sleeve_cuff_" in name or "sleeve_" in name or "sleeve_guard" in name or "coat_cuff_" in name): return f"rig_forearm_{side}"`).
3. **Barnaby Chest Pocket Tools**: Remove `"ruler_"` and `"chisel_"` from the `rig_pelvis` list in `_rig_bone_for_mesh` so they default to `"rig_spine"`.
4. **Elspeth Chest Herb Cluster**: Remove `"herb_"` from the `rig_pelvis` list in `_rig_bone_for_mesh` so it defaults to `"rig_spine"`.
5. **Maeve Chest Brooch**: Disambiguate `"pin"` in `_rig_bone_for_mesh` so that `character_scale_pin*` routes to `"rig_spine"` while `character_ear_pencil` continues to route to `"rig_head"` via `"pencil"`.
6. **Regenerate & Publish**: Rerun `npm run art:generate -- --family character` and verify that `art:validate` and `art:determinism` pass.

---

## 5. Verification Method

1. Inspect `tools/blender/generators/characters.py`:
   - Verify `_rig_bone_for_mesh` routes all submeshes to the anatomically correct bones.
2. Execute validation commands:
   ```bash
   npm run art:validate -- --family character
   npm run art:determinism -- --family character
   npx vitest run tests/unit/characterPipeline.test.ts
   npx vitest run tests/unit/artPipeline.test.ts
   ```
3. Verify vertex groups on generated Blender meshes:
   ```bash
   /Applications/Blender.app/Contents/MacOS/Blender --background --python .agents/reviewer_m1_2/inspect_characters.py
   ```
