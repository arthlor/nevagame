## 2026-08-28T18:08:10Z

You are worker_m2_rigging_2 for Milestone 2 of the Neva Character Overhaul project.

Working Directory: /Users/anilkaraca/Desktop/Neva/.agents/worker_m2_rigging_2
Original Request: /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md
Scope Document: /Users/anilkaraca/Desktop/Neva/PROJECT.md

Task Scope — Milestone 2: Humanoid Skeletal Rigging, Vertex Skinning & Sockets
1. Read ORIGINAL_REQUEST.md, PROJECT.md, AGENTS.md, LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md, LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md, LLM/LLM_AGENT_ART_PIPELINE_INSTRUCTIONS.md, LLM/BLENDER.md.
2. Implement and refine in tools/blender/generators/characters.py:
   - Complete 15+ joint humanoid armature: rig_root, rig_pelvis, rig_spine, rig_chest, rig_neck, rig_head, rig_clavicle_left/right, rig_upper_arm_left/right, rig_forearm_left/right, rig_hand_left/right, rig_thigh_left/right, rig_shin_left/right, rig_foot_left/right, plus secondary bones (rig_hat_brim, rig_backpack, rig_canteen_left/right).
   - Smooth distance-falloff skin weighting across articulated joints (elbows, knees, shoulders, waist, neck, head) to eliminate tearing, pinching, or rigid disjoints.
   - 5 bone-parented sockets on exported GLBs: [asset_id]_hand_socket_left, [asset_id]_hand_socket_right, [asset_id]_tool_socket (parented to right hand), [asset_id]_carry_socket (parented to spine), [asset_id]_hip_socket (parented to pelvis).
   - Verify proper bone routing in _rig_bone_for_mesh for all accessory meshes (chin/cheeks, coat cuffs, ruler/chisel, herb cluster, scale pin, etc.).
   - Ensure full action suite clips (32 player clips, 6 NPC clips) animate the skeleton cleanly.
3. Verification:
   - Run `npm run art:validate`
   - Run `npm run typecheck`
   - Run `npx vitest run tests/unit/characterPipeline.test.ts`
   - Run `npm run test`
4. MANDATORY INTEGRITY WARNING:
   DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
5. Create your BRIEFING.md, DISPATCH.md, and progress.md in your working directory.
6. When complete, write a comprehensive handoff report (handoff.md) covering Observation, Logic Chain, Caveats, Conclusion, Verification Method and send a message back to the orchestrator.
