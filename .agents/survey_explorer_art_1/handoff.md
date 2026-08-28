# Character Asset Specifications & Procedural Toolchain Survey Report

## 1. Observation

### Authoritative Files and Specifications Inspected
1. **Asset Catalog & Schema**:
   - `assets/specs/asset-catalog.schema.json` (lines 1–351): Declares strict JSON schema draft 2020-12 rules for `family: "character"`, requiring `rigNode`, `socketNodes` (min 2 items), `animationClips` (min 1 item), `lodLevels` (2–3 levels), and `referenceAuthoring`.
   - `assets/specs/asset-catalog.json`:
     - `char_player_a` (lines 11121–11659): Seed 801, generator `coastal_worker`, budget 2500–12000–18000 tris, 6 materials max, 32 animation clips, 11 required nodes, 5 bone sockets, full `referenceAuthoring` brief.
     - `char_npc_elspeth_a` (lines 11660–11774): Seed 831, generator `npc_character` (role: `gardener`), budget 2500–8000–16000 tris, 6 materials max, 6 animation clips, 11 required nodes, 5 bone sockets.
     - `char_npc_barnaby_a` (lines 11775–11889): Seed 832, generator `npc_character` (role: `handyman`), budget 2500–8000–16000 tris, 6 materials max, 6 animation clips, 11 required nodes, 5 bone sockets.
     - `char_npc_silas_a` (lines 11890–12004): Seed 833, generator `npc_character` (role: `dockmaster`), budget 2500–8500–16000 tris, 6 materials max, 6 animation clips, 11 required nodes, 5 bone sockets.
     - `char_npc_maeve_a` (lines 12005–12119): Seed 834, generator `npc_character` (role: `merchant`), budget 2500–8000–16000 tris, 6 materials max, 6 animation clips, 11 required nodes, 5 bone sockets.

2. **Procedural Generators and Shared Helpers**:
   - `tools/blender/generators/characters.py` (lines 1–1617):
     - `_create_character_rig` (lines 66–185): Creates Blender Armature `char_player_rig` / `<npc_id>_rig` in EDIT mode with 11 primary bones (`rig_root`, `rig_pelvis`, `rig_spine`, `rig_head`, `rig_upper_arm_L/R`, `rig_forearm_L/R`, `rig_hand_L/R`, `rig_thigh_L/R`, `rig_shin_L/R`, `rig_foot_L/R`) plus secondary (`rig_backpack`, `rig_canteen_L/R`, `rig_hat_brim`).
     - `_bind_character_meshes` & `_assign_character_weights` (lines 220–324): Joins meshes by material per LOD, creates `NEVA_CharacterRig` armature modifier, assigns vertex weights using bone-name vertex groups, and normalizes weights across vertex group influences.
     - `_add_character_sockets` (lines 644–676): Adds bone-parented empty socket markers with `neva_socket=True` (`hand_socket_left`, `hand_socket_right`, `tool_socket`, `carry_socket`, `hip_socket`).
     - `_author_character_actions` (lines 363–626): Keyframes Euler XYZ rotations and root locations for all 32 player actions and 6 NPC actions into fake-user NLA actions.
     - `coastal_worker` / `_build_coastal_worker` (lines 891–1094): Constructs player model with straw hat, utility vest, lapels, pockets, belt, boots, and expedition backpack with bedroll/canteens.
     - `npc_character` / `_build_npc_character` (lines 1096–1232): Constructs role-specific models for `gardener` (bonnet, ribbons, apron, trowel), `handyman` (flat cap, ear pencil, work apron, hammer), `dockmaster` (beard/mustache, sou'wester hat, harbor coat, watch chain), and `merchant` (braided bun, scarf, market apron, coin pouch, scale pin).
   - `tools/blender/generators/registry.py` (lines 1–101): Maps generator identifiers `"coastal_worker"` and `"npc_character"` to their respective functions.
   - `tools/blender/common/geometry.py` (lines 1–270): Geometric primitives (`add_box`, `add_cylinder`, `add_cone`, `add_ico`, `add_beam`, `add_tapered_beam`, `add_tri_prism`, `add_ring`), vertex color baking (`apply_vertex_values` to `COLOR_0` in byte-color corner domain), mesh joining (`join_meshes`), and collision helpers.
   - `tools/blender/common/lod.py` (lines 1–47): LOD hierarchy creation (`create_lod_roots`) and intra-LOD mesh consolidation (`consolidate_lod_level`).
   - `tools/blender/common/materials.py` (lines 1–87): Reads palette JSON, creates Principled BSDF with linear vertex color linking and backface culling enabled.
   - `tools/blender/common/pipeline.py` (lines 1–330): `validate_and_export()` validates node hierarchy, required nodes, animation clips, vertex color linear space, triangle budgets, LOD ratios, palette allow-list, bounds, and exports via Blender glTF 2.0 exporter.

3. **Palette Tokens and Material System**:
   - `art/palettes/neva.palette.json` (lines 1–58): Contains 28 semantic tokens with linear roughness and metalness. Characters utilize:
     - `plaster_warm_01` (#D9BE8D, roughness 0.88, metalness 0) — skin for all characters.
     - `canvas_cream_01` (#E8D8B4, roughness 0.90, metalness 0) — shirts, aprons, straw hat, bonnet.
     - `wood_dark_01` (#563825, roughness 0.86, metalness 0.02) — hair, dark leather, belts, boots, trousers.
     - `wood_honey_01` (#B8783F, roughness 0.80, metalness 0.02) — warm vest leather, work shirts.
     - `roof_terracotta_01` (#B94F36, roughness 0.80, metalness 0.03) — Elspeth dress.
     - `foliage_sage_01` (#8E9E54, roughness 0.80, metalness 0) — Elspeth sage apron accents / ribbons, player hat band.
     - `accent_teal_01` (#3F8D8C, roughness 0.72, metalness 0) — Maeve dress / scale pin.
     - `accent_ochre_01` (#D59B45, roughness 0.68, metalness 0) — Silas oilskin trim / brows.
     - `water_deep_01` (#276B7D, roughness 0.34, metalness 0) — Silas deep sea coat / sou'wester.
     - `foam_warm_01` (#F6F3E8, roughness 0.62, metalness 0) — Silas sea-foam white beard & mustache.
     - `metal_dark_01` (#2B2D30, roughness 0.58, metalness 0.28) — Barnaby tool belt buckle / hammer head.
     - `metal_brass_01` (#A47B43, roughness 0.48, metalness 0.32) — Silas watch chain, Maeve scale pin.
     - `fish_tuna_back_01` (#2E476B, roughness 0.56, metalness 0) — Player work trousers.

4. **Validation Toolchain & Rules**:
   - `tools/blender/cli.mjs` (lines 1–1805):
     - `validateCatalog`: Validates JSON schema (draft 2020-12) via Ajv, verifies all palette tokens exist, checks file names, ensures unique IDs/files.
     - `validateGeneratorParameters`: Enforces registered parameter contracts (`coastal_worker`: `height`, `headRatio`, `handScale`; `npc_character`: `role`, `height`, `headRatio`, `handScale`).
     - `validateLodContract`: Ensures LOD0 starts at 0m with ratio 1.0, strictly increasing distances, strictly non-increasing ratio max.
     - `validateAnimationContract`: Checks character rig nodes, socket nodes, clip durations, commit markers, loop flags, reference speeds, events, and enforces 32 required clips for player and 5+1 required clips for NPCs.
     - `validateGlb`: Runs Khronos `gltf-validator`, validates nodes, rig armature presence, skin bindings (`JOINTS_0`, `WEIGHTS_0`), clip samplers, vertex colors (`COLOR_0`), normal attributes, lack of double-sided materials, LOD triangle counts and ratios, and budget triangle/material ceilings.
     - `optimizeAsset`: glTF Transform pipeline using `dedup()`, `join()` (skipping character skinned nodes to prevent armature corruption), `prune()`, `weld()`, and `meshopt()`.
     - `validatePublishedManifest`: Verifies that `public/assets/models/asset-manifest.json` matches catalog specifications, file hashes, and semantic hashes.

5. **Current State in `public/assets/models/asset-manifest.json`**:
   - `char_player_a.glb`: LOD0: 12,156 tris, LOD1: 2,256 tris (ratio 0.186), 6 materials, 42 nodes, 11 meshes, 32 animation clips, 938,856 bytes (`on_target`).
   - `char_npc_elspeth_a.glb`: LOD0: 7,540 tris, LOD1: 1,740 tris (ratio 0.231), 5 materials, 41 nodes, 10 meshes, 6 animation clips, 479,188 bytes (`below_target` warning: target 8000).
   - `char_npc_barnaby_a.glb`: LOD0: 6,868 tris, LOD1: 1,652 tris (ratio 0.241), 5 materials, 41 nodes, 10 meshes, 6 animation clips, 438,652 bytes (`below_target` warning: target 8000).
   - `char_npc_silas_a.glb`: LOD0: 7,076 tris, LOD1: 1,768 tris (ratio 0.250), 5 materials, 41 nodes, 10 meshes, 6 animation clips, 462,560 bytes (`below_target` warning: target 8500).
   - `char_npc_maeve_a.glb`: LOD0: 7,080 tris, LOD1: 1,532 tris (ratio 0.216), 5 materials, 40 nodes, 9 meshes, 6 animation clips, 444,992 bytes (`below_target` warning: target 8000).

---

## 2. Logic Chain

1. **Catalog Contract Alignment**:
   - The asset catalog schema defines strict node and socket requirements for character assets (`char_player_a` and 4 NPCs).
   - All 5 character entries declare exactly 11 required nodes including root node, LOD0 empty, LOD1 empty, rig node, left hand marker, right hand marker, and 5 attachment sockets (`hand_socket_left`, `hand_socket_right`, `tool_socket`, `carry_socket`, `hip_socket`).
   - All 5 assets currently declare and provide LOD0 and LOD1 levels complying with the LOD contract (`distanceMeters: [0, 18]`, `triangleRatioMin/Max: [1.0, 0.08..0.52]`).

2. **Occupational Silhouette & Art Bible Conformity**:
   - The Art Bible (`LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` §13) establishes a 6.0–6.5 head proportion baseline, faceted low-frequency planes, clumped hair/beards, matte PBR skin, and distinct occupational silhouettes.
   - The current generator (`tools/blender/generators/characters.py`) implements distinct occupational garments:
     - Player: Straw expedition hat, utility vest with quilting and pockets, expedition backpack with bedroll and canteens, cuffed trousers, boots.
     - Elspeth: Bonnet with band and ribbons, hair bun, gardener/baker apron bib & skirt, trowel holster and tool.
     - Barnaby: Flat cap with peak, ear pencil, craftsman apron, tool belt with buckle, hammer in holster.
     - Silas: Weathered sea coat with tall collar, sou'wester hat, brass watch chain, warm foam white beard/mustache.
     - Maeve: Braided hair bun, neck scarf with knot, fishmonger apron bib & skirt, coin pouch, brass scale pin.
   - Triangle counts for all 4 NPCs (6,868–7,540 tris) are within min/max bounds (2,500–16,000) but slightly below quality targets (8,000–8,500 tris).

3. **Rigging & Vertex Skinning Gaps**:
   - R2 in `ORIGINAL_REQUEST.md` requests a complete humanoid skeletal armature (Root, Pelvis, Spine, Chest, Neck, Head, Clavicles/Shoulders, UpperArms, Forearms, Hands, Hips, Thighs, Calves, Feet) with smooth vertex skinning across articulated joints.
   - The current rig (`_create_character_rig`) implements 11 primary bones (`rig_root`, `rig_pelvis`, `rig_spine`, `rig_head`, `rig_upper_arm_L/R`, `rig_forearm_L/R`, `rig_hand_L/R`, `rig_thigh_L/R`, `rig_shin_L/R`, `rig_foot_L/R`) and 4 secondary bones (`rig_backpack`, `rig_canteen_L/R`, `rig_hat_brim`).
   - Missing intermediate anatomical bones: `rig_chest`, `rig_neck`, `rig_clavicle_left/right`, `rig_hip_left/right`.
   - Current skin weighting in `_assign_character_weights` applies crude additive blends on whole sub-meshes rather than smooth vertex-distance weighting across articulated loop rings.

4. **Ragdoll Physics & Runtime Controller State**:
   - `src/physics/PhysicsWorld.ts` currently uses a single kinematic capsule (`playerCollider` / `KinematicCharacterController`) without any multi-body ragdoll articulation or joint constraints.
   - To satisfy R3, a dual-mode active ragdoll system in Rapier with multi-body colliders (capsules/boxes/spheres) and motorized joint tracking is needed.
   - `src/render/animation/AnimationController.ts` contains comprehensive clip state transitions, gait speed matching, slope foot IK, and backpack secondary spring damping, which can interface with the updated skeleton and active ragdoll blend states.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Asset Spec | Character Catalog Schema | Schema definition for `family: "character"` assets requiring rig, sockets, LODs, and clips | `asset-catalog.schema.json` | Validated JSON spec | Schema validation error via Ajv | `asset-catalog.schema.json` line 115 |
| 2 | Asset Spec | Character LOD Hierarchy | 2-level LOD contract (LOD0 at 0m ratio 1.0; LOD1 at 18m ratio 0.08..0.52) | `lodLevels` array in catalog | LOD0 & LOD1 empty parent nodes | Error on non-increasing distances or increasing ratios | `cli.mjs` line 362, `pipeline.py` line 215 |
| 3 | Asset Spec | Character Sockets | 5 bone-parented attachment sockets (`hand_socket_left/right`, `tool_socket`, `carry_socket`, `hip_socket`) | `socketNodes` list in catalog | Empty markers with `neva_socket=True` parented to bones | Error if socket is not bone-parented or missing | `characters.py` line 644, `pipeline.py` line 111 |
| 4 | Modeling | Coastal Worker Avatar | Procedural generator for traveler/farmer avatar with straw hat, vest, backpack, canteens | `coastal_worker` parameters (`height`, `headRatio`, `handScale`) | Skinned low-poly mesh hierarchy under `char_player_a_root` | Error if required nodes missing or bounds outside spec | `characters.py` line 891 |
| 5 | Modeling | Gardener NPC (Elspeth) | Procedural gardener/baker model with bonnet, ribbons, apron, and trowel | `npc_character` role `gardener` | Skinned mesh under `char_npc_elspeth_a_root` | Parameter validation error if role invalid | `characters.py` line 1156 |
| 6 | Modeling | Handyman NPC (Barnaby) | Procedural craftsman model with flat cap, ear pencil, work apron, hammer | `npc_character` role `handyman` | Skinned mesh under `char_npc_barnaby_a_root` | Parameter validation error if role invalid | `characters.py` line 1183 |
| 7 | Modeling | Dockmaster NPC (Silas) | Procedural dockmaster model with sou'wester hat, sea coat, beard, watch chain | `npc_character` role `dockmaster` | Skinned mesh under `char_npc_silas_a_root` | Parameter validation error if role invalid | `characters.py` line 1200 |
| 8 | Modeling | Merchant NPC (Maeve) | Procedural fishmonger/market master model with braided bun, scarf, apron, scale pin | `npc_character` role `merchant` | Skinned mesh under `char_npc_maeve_a_root` | Parameter validation error if role invalid | `characters.py` line 1217 |
| 9 | Rigging | Character Armature | 11 primary + 4 secondary bone armature created via Blender python API | Bone head/tail coordinates, height scaling | `ARMATURE` object `char_player_rig` / `<npc>_rig` | Error if rig missing or unlinked | `characters.py` line 66 |
| 10 | Skinning | Material-Grouped Mesh Skinning | Meshes grouped by material slot per LOD, parented to LOD root, bound to rig with armature modifier | Mesh objects, vertex groups | Multi-primitive skinned meshes with `JOINTS_0`/`WEIGHTS_0` | Error if vertices have unnormalized weights or missing groups | `characters.py` line 220, `pipeline.py` line 105 |
| 11 | Animation | Player Authored Actions | 32 keyframed action clips covering locomotion, farming, fishing, boating, and transitions | Poses dict in `characters.py` | Fake-user NLA actions in Blender | Error if clip duration or metadata does not match spec | `characters.py` line 363, `pipeline.py` line 90 |
| 12 | Animation | NPC Authored Actions | 6 keyframed action clips (`idle`, `talk_gesture`, `walk`, `carry_idle`, `turn_left`, `turn_right`) | Poses dict in `characters.py` | Fake-user NLA actions in Blender | Error if required NPC clips missing | `characters.py` line 363, `cli.mjs` line 428 |
| 13 | Shading | Linear COLOR_0 Baking | Vertex color baking from material diffuse RGB modulated by ambient occlusion, height, and key light | `neva.palette.json` tokens | Byte-color corner attribute `Color` | Error if COLOR_0 residual exceeds 0.025 from token linear RGB | `geometry.py` line 74, `pipeline.py` line 44 |
| 14 | Pipeline | Meshopt glTF Optimization | glTF-Transform pipeline applying dedup, weld, prune, and Meshopt compression | Uncompressed Blender GLB | Compressed production GLB | Throws if meshopt encoder fails | `cli.mjs` line 1203 |
| 15 | Validation | Khronos GLB Validation | Official glTF Validator check for standard compliance | Binary GLB buffer | Validator report (errors/warnings) | Throws if severity 0 errors or unexpected warnings found | `cli.mjs` line 944 |
| 16 | Runtime | Animation Controller State Machine | Multi-layer locomotion, action one-shot, and gesture playback controller | `PlayerMotionSample`, `GameMode`, context flags | Bone transforms, IK foot adjustments, spring offsets | Fallback to procedural walk/idle if clip missing | `AnimationController.ts` line 1 |
| 17 | Runtime | Socket Prop Attachment | Attaches tools, baskets, seeds, pouches, fishing rods to character sockets | Socket node names, prop asset IDs | Transformed prop mesh in scene | Logs warning or skips attach if socket missing | `WorldScene.ts` line 304 |

---

## 4. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | glTF Transform Joining | Character skinned meshes passed to `join()` | Joining is explicitly bypassed for `coastal_worker` and `npc_character` in `mayJoinStaticNode()` (cli.mjs:1188) to preserve the authored hierarchy, rig, and bone sockets. |
| 2 | Khronos LOD Skinned Mesh Warning | `NODE_SKINNED_MESH_NON_ROOT` warning emitted by validator | Spec explicitly filters out this warning when `lodLevels` and `animationClips` are present (cli.mjs:956), because identity LOD empties parent skinned groups for runtime distance switching. |
| 3 | Sockets on Animated Limbs | Right hand tool socket during tool swing vs idle | Sockets are parented to `rig_hand_right` bone (not forearm or wrist) with identity rest orientation, ensuring tool grips accurately track finger pads during swings. |
| 4 | Carry Socket vs Back Cargo | Crop bundle or harvest basket attached to `carry_socket` | `carry_socket` is parented to `rig_spine` at the lower backpack (`height * 0.54`), preventing stalk bundles from clipping through thighs or head during locomotion. |
| 5 | NPC Role Parameter Validation | Unknown role string passed in catalog parameters (e.g. `role: "blacksmith"`) | `validateGeneratorParameters()` rejects unknown choice and throws error during `npm run art:validate`. |
| 6 | LOD Triangle Ratio Inversion | LOD1 generated with more triangles than LOD0 | `validateLodContract()` and `validateGlb()` throw runtime errors if LOD1 triangle ratio exceeds LOD0. |
| 7 | Degenerate Triangle Primitives | Collinear vertices created during mesh chamfer or prism slicing | `pipeline.py` detects degenerate triangles via cross-product normal length `< 1e-8` and aborts generation before export. |
| 8 | Vertex Color Token Drift | Reassigning material without updating `COLOR_0` corner colors | `_validate_vertex_color_contract()` verifies dot-product and residual `< 0.025` against material `diffuse_color`, throwing immediately if vertex colors drift. |

---

## 5. Caveats
- No caveats regarding specification discovery: all 5 character entries, schemas, generators, palette tokens, and validation scripts were fully inspected.
- Note on command execution: interactive shell permission timed out during subagent execution, but all codebase specifications, reports, manifests, tests, and source code are fully readable and were exhaustively mined.

---

## 6. Conclusion
The character toolchain in Neva is fully catalog-driven, procedurally authored via Blender Python generators (`coastal_worker` and `npc_character`), strictly validated against JSON schema / triangle / material / LOD / socket contracts, optimized with Meshopt, and published atomically.

To execute the character overhaul specified in `ORIGINAL_REQUEST.md`:
1. **Geometry & Art Direction**: Refine faceted low-poly meshes for `char_player_a` and the 4 NPCs (`char_npc_elspeth_a`, `char_npc_barnaby_a`, `char_npc_silas_a`, `char_npc_maeve_a`) to enhance occupational silhouettes and bring NPC LOD0 triangle counts into the 8,000–8,500 target range without exceeding the 16,000/18,000 maxima or 6-material limit.
2. **Armature & Rigging**: Expand the armature structure in `tools/blender/generators/characters.py` to incorporate complete humanoid articulation (`rig_chest`, `rig_neck`, `rig_clavicle_L/R`, `rig_hip_L/R`) while maintaining existing bone naming and socket bindings.
3. **Smooth Skinning**: Upgrade `_assign_character_weights` to compute continuous distance-based smooth skinning across articulated joint loops (elbows, knees, shoulders, waist, neck).
4. **Dual-Mode Rapier Physics**: Implement multi-body ragdoll colliders and motorized joint tracking in `src/physics/` with pose blending to keyframed animations.
5. **Animation & Validation**: Validate all 5 character assets via `npm run art:validate -- --family character` to verify 0 errors across schemas, LOD contracts, sockets, and palette tokens.

---

## 7. Verification Method
1. Inspect catalog contracts in `assets/specs/asset-catalog.json` for IDs `char_player_a`, `char_npc_elspeth_a`, `char_npc_barnaby_a`, `char_npc_silas_a`, `char_npc_maeve_a`.
2. Inspect procedural generator logic in `tools/blender/generators/characters.py` and `tools/blender/generators/registry.py`.
3. Inspect palette definitions in `art/palettes/neva.palette.json`.
4. Inspect validation rules in `tools/blender/cli.mjs` and `tools/blender/common/pipeline.py`.
5. Run unit tests and typechecks:
   - `npm run test -- tests/unit/artPipeline.test.ts tests/unit/animationController.test.ts`
   - `npm run typecheck`
6. Validate character asset specs:
   - `npm run art:validate -- --family character`
