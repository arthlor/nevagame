# Dispatch to teamwork_preview_auditor_m2

## 2026-09-04T14:20:00Z
You are teamwork_preview_auditor_m2.
Working directory: /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_auditor_m2/
Parent agent: orchestrator_5 (conversation ID: c275e7b3-2b97-46df-81cb-0a621ce8a161)

### Mandatory reading before starting:
1. /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md
2. /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_5/PROJECT.md
3. Worker Handoff: /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_worker_m2/handoff.md
4. /Users/anilkaraca/Desktop/Neva/AGENTS.md and relevant authorities (LLM/01, LLM/02, LLM/04).

### Mission:
Perform strict forensic integrity audit on Milestone M2 deliverables:
- Verify NO hardcoded test results in source code or test suites.
- Verify NO dummy or facade implementations (e.g. verify `CropInstanceRenderer.updateMoistureBatch` really sets instance colors; verify `calculateAllometricLengthCm` performs real math; verify `CropInspection` really applies projection coordinates).
- Verify 100% simulation ownership: no simulation state mutation inside UI components.
- Verify genuine palette token usage: colors must come from `art/palettes/neva.palette.json` (`PALETTE_HEX`).
- Verify tests in `tests/unit/mmo_inspectors_m2.test.ts` genuinely assert component output rather than trivial tautologies.
- Run `npm run typecheck`, run test suites with `npx vitest run`, and run `npm run build`.
- Deliver forensic verdict (`CLEAN` or `INTEGRITY VIOLATION`) in `handoff.md` and send_message to orchestrator_5.
