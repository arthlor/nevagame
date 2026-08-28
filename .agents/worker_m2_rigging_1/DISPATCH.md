## 2026-08-28T14:17:40Z

Mission: Execute Milestone 2: Humanoid Skeletal Rigging, Smooth Vertex Skinning & Sockets.
Scope:
1. Fix all 5 bone routing defects from reviewer_m1_2 in _rig_bone_for_mesh in tools/blender/generators/characters.py:
   - character_chin and character_cheek_* must route to rig_head (NOT spine).
   - character_coat_cuff_* must route to rig_forearm_* (NOT spine).
   - character_ruler_wood and character_chisel_metal (Barnaby chest pocket) must route to rig_spine (NOT pelvis).
   - character_herb_cluster (Elspeth chest bib) must route to rig_spine (NOT pelvis).
   - character_scale_pin* (Maeve chest brooch) must route to rig_spine (NOT head).
2. Complete Humanoid Skeletal Armature:
   - Implement complete 15+ bone hierarchy in _create_character_rig: rig_root, rig_pelvis, rig_spine, rig_chest, rig_neck, rig_head, rig_clavicle_left, rig_clavicle_right, rig_upper_arm_left, rig_upper_arm_right, rig_forearm_left, rig_forearm_right, rig_hand_left, rig_hand_right, rig_thigh_left, rig_thigh_right, rig_shin_left, rig_shin_right, rig_foot_left, rig_foot_right, plus secondary bones (rig_hat_brim, rig_backpack, rig_canteen_left, rig_canteen_right).
3. Smooth Distance-Falloff Vertex Skinning:
   - Implement geometric distance-falloff skin weighting in _assign_character_weights across articulated joint loops (elbows, knees, shoulders, waist, neck, clavicles) to eliminate mesh tearing, rigid segment disjoints, and pinching during deep poses.
   - Ensure all vertex weights are strictly normalized (sum(weights) == 1.0).
4. Attachment Sockets:
   - Preserve all 5 required bone-parented sockets (hand_socket_left, hand_socket_right, tool_socket, carry_socket, hip_socket) with identity rest orientation.
5. Authored Action Clips:
   - Update keyframe poses in _author_character_actions across all 32 player clips and 6 NPC clips to utilize chest/neck/clavicle joints naturally.
6. Verification & Publication:
   - Run npm run art:validate -- --family character
   - Run npm run art:determinism -- --family character
   - Run npx vitest run tests/unit/characterPipeline.test.ts tests/unit/artPipeline.test.ts
   - Run npm run typecheck
