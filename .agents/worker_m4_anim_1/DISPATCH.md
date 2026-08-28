## 2026-08-28T18:37:49Z
Task Scope — Milestone 4: Animation Controller, Foot IK & Secondary Dynamics
1. Read ORIGINAL_REQUEST.md, PROJECT.md, AGENTS.md, LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md, LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md, src/render/animation/AnimationController.ts, src/render/assets/ToolSocketAttach.ts, and tests/unit/animationController.test.ts.
2. Implement and refine in src/render/animation/AnimationController.ts:
   - Full 20-bone humanoid rig + 4 secondary bones support with node alias mapping and 3-layer track filtering (Base, Upper, Lower).
   - Analytical two-bone Foot IK & Ground Adaptation: real-time terrain normal alignment, ground pitch/roll stance, slope gait scaling, and ankle/shin/thigh foot target placement.
   - Velocity and acceleration-driven 2nd-order damped oscillators for secondary dynamics: hat brim spring sway (`rig_hat_brim`), backpack load inertia (`rig_backpack`), and canteen pendular swing (`rig_canteen_left`, `rig_canteen_right`).
   - Prop socket mounting & Art Yard integration across tool, carry, and hip sockets with proper rest orientations and rotation transforms conforming to `ToolSocketAttach.ts`.
3. Verification:
   - Run `npm run typecheck`
   - Run `npx vitest run tests/unit/animationController.test.ts`
   - Run `npx vitest run tests/unit/characterPipeline.test.ts`
   - Run `npm run test`
4. MANDATORY INTEGRITY WARNING:
   DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
5. Create your BRIEFING.md, DISPATCH.md, and progress.md in your working directory.
6. When complete, write a comprehensive handoff report (handoff.md) covering Observation, Logic Chain, Caveats, Conclusion, Verification Method and send a message back to the orchestrator.
