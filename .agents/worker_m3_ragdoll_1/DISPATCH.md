## 2026-08-28T18:24:12Z

Task Scope — Milestone 3: Dual-Mode Active Rapier Ragdoll Physics System
1. Read ORIGINAL_REQUEST.md, PROJECT.md, AGENTS.md, LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md, LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md, and tests/unit/ragdollPhysics.test.ts.
2. Implement in src/physics/ragdoll/:
   - `RagdollBoneMapping.ts`: 11 rigid body specs (Pelvis, Spine, Chest, Head, UpperArms L/R, Forearms L/R, Thighs L/R, Shins L/R) and 10 anatomical joint specs (spherical and revolute with angular limits, stiffness, damping, maxTorque) matching humanoid armature bones.
   - `RagdollMotorController.ts`: PD motor controller for active mode tracking of animation poses with spring-damper compliance during locomotion.
   - `RagdollPoseBlender.ts`: Settle detection (linear/angular velocity thresholds, 15 consecutive frames, 3.0s timeout), prone/supine orientation classification, kinematic root realignment, and 0.35s smooth Slerp pose recovery blending.
   - `HumanoidRagdoll.ts`: Complete Rapier multi-body ragdoll lifecycle, mode state machine (`kinematic-active` -> `physical-ragdoll` -> `recovering` -> `kinematic-active`), collider creation (capsule, box, sphere), joint constraints, impact velocity triggers (`>10m/s` impact, `>=8.5m/s` landing), and dispose.
   - `index.ts`: Public module exports.
3. Verification:
   - Run `npm run typecheck`
   - Run `npx vitest run tests/unit/ragdollPhysics.test.ts`
   - Run `npx vitest run tests/unit/characterPipeline.test.ts`
   - Run `npm run test`
4. MANDATORY INTEGRITY WARNING:
   DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
5. Create your BRIEFING.md, DISPATCH.md, and progress.md in your working directory.
6. When complete, write a comprehensive handoff report (handoff.md) covering Observation, Logic Chain, Caveats, Conclusion, Verification Method and send a message back to the orchestrator.
