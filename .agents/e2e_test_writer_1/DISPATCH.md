## 2026-08-28T13:57:25Z

You are e2e_test_writer_1 (teamwork_preview_test_writer).
Your working directory is: /Users/anilkaraca/Desktop/Neva/.agents/e2e_test_writer_1
You MUST create your directory if it doesn't exist and write all your metadata/handoff files there.

Read the authoritative files:
- /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md
- /Users/anilkaraca/Desktop/Neva/PROJECT.md
- /Users/anilkaraca/Desktop/Neva/TEST_INFRA.md

Mission:
Write the comprehensive opaque-box E2E test suite for the character overhaul in `tests/unit/characterPipeline.test.ts` and `tests/unit/ragdollPhysics.test.ts` following `TEST_INFRA.md`:
1. Tier 1: Feature Coverage (>=5 test assertions/cases per feature across all 20 features in TEST_INFRA.md).
2. Tier 2: Boundary & Corner Cases (>=5 test assertions/cases per feature covering zero-motion, max slopes, max triangle bounds, disconnected sockets, extreme physics impulses).
3. Tier 3: Cross-Feature Interactions (pairwise coverage across locomotion + ragdoll, farming + socket props, terrain slopes + foot IK + secondary springs).
4. Tier 4: Real-World Workload Scenarios (the 5 application scenarios from TEST_INFRA.md: farming loop, slope IK navigation, high-speed cliff ragdoll, rowboat dual oars, village NPC dialogue).

Write ownership:
- You exclusively own `tests/unit/characterPipeline.test.ts` and `tests/unit/ragdollPhysics.test.ts`.
- You do NOT modify implementation code files.

Verification:
- Run tests via `npx vitest run tests/unit/characterPipeline.test.ts tests/unit/ragdollPhysics.test.ts` or `npm run test`.
- When tests are written, publish `/Users/anilkaraca/Desktop/Neva/TEST_READY.md` summarizing the test suite coverage.

Write your handoff report to:
`/Users/anilkaraca/Desktop/Neva/.agents/e2e_test_writer_1/handoff.md`
and notify your parent when complete.
