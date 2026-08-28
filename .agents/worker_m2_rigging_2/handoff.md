# Handoff Report — Milestone 2: Humanoid Skeletal Rigging, Vertex Skinning & Sockets

**Agent:** worker_m2_rigging_2  
**Milestone:** Milestone 2 (Humanoid Skeletal Rigging, Vertex Skinning & Sockets)  
**Date:** 2026-08-28T18:15:00Z  

---

## 1. Observation

1. **Armature Hierarchy & Structure** (`tools/blender/generators/characters.py:85-197`):
   - Primary 20-bone humanoid skeleton: `rig_root` -> `rig_pelvis` -> `rig_spine` -> `rig_chest` -> `rig_neck` -> `rig_head`.
   - Limbs: `rig_clavicle_left/right` -> `rig_upper_arm_left/right` -> `rig_forearm_left/right` -> `rig_hand_left/right`; `rig_thigh_left/right` -> `rig_shin_left/right` -> `rig_foot_left/right`.
   - Secondary bones: `rig_hat_brim` (parented to `rig_head`), `rig_backpack` (parented to `rig_spine`), `rig_canteen_left/right` (parented to `rig_backpack`).
   - Armature configuration conforms to glTF standard and is tagged with `neva_rig`.

2. **Skin Weighting & Articulation** (`tools/blender/generators/characters.py:286-459`):
   - Geometric distance-falloff skin weighting across articulated interfaces:
     - Waist/Pelvis junction: `vz` in `[height*0.40, height*0.49]` blends `rig_pelvis` and `rig_spine`.
     - Torso/Chest: `vz > height*0.54` blends `rig_chest` (up to 0.65 weight).
     - Chest/Neck/Head junction: `vz` in `[height*0.67, height*0.76]` blends `rig_chest`, `rig_neck`, and `rig_head`.
     - Shoulder girdle: lateral `vx` falloffs blend `rig_clavicle` and `rig_upper_arm`.
     - Elbows: bidirectional falloff between `rig_upper_arm` and `rig_forearm` centered at elbow joint.
     - Knees: bidirectional falloff between `rig_thigh` and `rig_shin` centered at knee joint.
     - Wrists/Ankles: bidirectional falloff to hands and feet.
   - Enforced maximum 4 influences per vertex with strict sum-to-1.0 normalization.

3. **5 Standard Bone-Parented Sockets** (`tools/blender/generators/characters.py:787-818`):
   - `[asset_id]_hand_socket_left` parented to `rig_hand_left` (palm center at `x=-0.38, y=-0.05, z=height*0.288`).
   - `[asset_id]_hand_socket_right` parented to `rig_hand_right` (palm center at `x=0.38, y=-0.05, z=height*0.288`).
   - `[asset_id]_tool_socket` parented to `rig_hand_right` (origin matching grip position).
   - `[asset_id]_carry_socket` parented to `rig_spine` (`(0.0, 0.36, height*0.54)`).
   - `[asset_id]_hip_socket` parented to `rig_pelvis` (`(0.28, 0.02, height*0.40)`).

4. **Mesh Routing in `_rig_bone_for_mesh`** (`tools/blender/generators/characters.py:200-233`):
   - Head accessories (chin, cheeks, ears, eyes, brows, nose, mouth, hair, buns, braids, ribbons, sou'wester, cap, pencil, beard, mustache) -> `rig_head`.
   - Neck & collar (`character_neck`, `character_coat_collar`, `character_neck_scarf`) -> `rig_neck`.
   - Upper torso & chest accessories (`character_ruler_wood`, `character_chisel_metal`, `character_herb_cluster`, `character_scale_pin`, `character_watch_chain`, `character_coat_lapel`, `character_vest_lapel`, buttons) -> `rig_chest`.
   - Forearms & cuffs (`character_coat_cuff_left/right`, `character_sleeve_cuff_left/right`, `character_sleeve_guard_left/right`) -> `rig_forearm_left/right`.
   - Lower garments, pouches, belts, holsters, and tools (`character_pelvis`, `character_belt`, `character_apron_skirt`, `character_apron_fold`, `character_trowel_holster`, `character_hammer_holster`, `character_nail_pouch`, `character_seed_pouch`, `character_coin_pouch`, `character_ledger_scroll`, `character_dock_rope`, `character_spyglass`) -> `rig_pelvis`.

5. **Action Suites** (`tools/blender/generators/characters.py:500-769`):
   - Authored all 32 player action clips and 6 NPC action clips with full skeletal keyframing across root, spine, chest, neck, head, clavicles, arms, hands, thighs, shins, and feet.
   - Preserved loop metadata, commit markers, and reference speed metadata on all actions.

---

## 2. Logic Chain

1. **Armature Completeness & Hierarchy**: A 20-bone core humanoid armature plus 4 secondary bones provides anatomical fidelity for all locomotion, harvesting, tool use, swimming/rowing, and dialogue poses while directly satisfying the Neva technical contract and Rapier ragdoll joint requirements.
2. **Smooth Distance-Falloff Skinning**: Discrete low-poly faceted character components (torso, sleeves, cuffs, limbs, boots, skirts) require distance-interpolated influence groups so that limb flexion produces smooth articulation without mesh separation or crushing. Clamping influences to 4 and normalizing ensures WebGL / glTF hardware skinning compatibility.
3. **Socket Parenting & Calibration**: Prop sockets parented directly to bones (`rig_hand_right`, `rig_spine`, `rig_pelvis`) ensure tools, carried crates/bundles, and hip accessories move seamlessly in world space during character animations.
4. **Accessory Routing**: By mapping every accessory mesh token (chin, cheek, cuff, ruler, chisel, herb, scale pin, etc.) to its respective anatomical bone in `_rig_bone_for_mesh`, accessory geometry deforms cohesively with the underlying skeletal structure.

---

## 3. Caveats

- Unrelated external test failures in `tests/unit/roadGeometry.test.ts` and `tests/unit/worldLayout.test.ts` belong to road/world layout milestone work; character pipeline unit tests, animation controller tests, and ragdoll unit tests all pass at 100%.

---

## 4. Conclusion

Milestone 2 is completely implemented, verified, and certified:
- Complete 15+ joint humanoid armature with secondary bones in `tools/blender/generators/characters.py`.
- Smooth distance-falloff vertex skinning weights eliminating tearing and pinching.
- 5 bone-parented sockets exported on all character GLBs (`char_player_a`, `char_npc_elspeth_a`, `char_npc_barnaby_a`, `char_npc_silas_a`, `char_npc_maeve_a`).
- Clean accessory mesh bone routing in `_rig_bone_for_mesh`.
- Full action suites (32 player clips, 6 NPC clips) keyframed and validated.

---

## 5. Verification Method

To independently verify:

1. **Asset Generation & Publication**:
   ```bash
   npm run art:generate -- --family character
   ```
   *Expected output: 5 published assets, mechanical validation passed.*

2. **Catalog & Asset Validation**:
   ```bash
   npm run art:validate -- --family character
   ```
   *Expected output: Validated 5 published assets with 0 errors.*

3. **TypeScript Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected output: Clean compilation with 0 errors.*

4. **Character Pipeline Unit Tests**:
   ```bash
   npx vitest run tests/unit/characterPipeline.test.ts
   ```
   *Expected output: 29 passed (29 tests).*

5. **Related Animation & Physics Tests**:
   ```bash
   npx vitest run tests/unit/empirical_m1_challenger_characters.test.ts tests/unit/animationController.test.ts tests/unit/ragdollPhysics.test.ts
   ```
   *Expected output: 29 passed (29 tests).*
