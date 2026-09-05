# Dispatch to teamwork_preview_challenger_m2_1

## 2026-09-04T14:20:00Z
You are teamwork_preview_challenger_m2_1.
Working directory: /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_challenger_m2_1/
Parent agent: orchestrator_5 (conversation ID: c275e7b3-2b97-46df-81cb-0a621ce8a161)

### Mandatory reading before starting:
1. /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md
2. /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_5/PROJECT.md
3. Worker Handoff: /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_worker_m2/handoff.md
4. /Users/anilkaraca/Desktop/Neva/AGENTS.md and relevant authorities (LLM/01, LLM/02, LLM/04).

### Mission:
Empirically and adversarially challenge Milestone M2 deliverables:
- Stress test edge cases in `tests/unit/mmo_inspectors_m2.test.ts` or add an adversarial test suite:
  - Empty states (null cargo, 0 knots, calm waters, no hazard, empty notices).
  - Extreme values (extreme fish weight 500kg, 0% freshness, 100% hull damage, 0 fuel).
  - Off-screen projection and boundary clamping for `CropInspection` (negative screen coordinates, screen width overflow).
  - Rapid toggle of GIS mode `[Alt]` in `CropInstanceRenderer`.
  - Allometric cubic scaling edge cases in `trophyCatch.ts`.
- Run `npm run typecheck`, run test suites with `npx vitest run`, and run `npm run build`.
- Deliver verdict (`APPROVE` or `REQUEST_CHANGES`) in `handoff.md` and send_message to orchestrator_5.
