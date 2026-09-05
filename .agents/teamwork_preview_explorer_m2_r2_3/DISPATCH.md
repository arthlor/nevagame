# Dispatch to teamwork_preview_explorer_m2_r2_3

## 2026-09-04T14:37:00Z
You are teamwork_preview_explorer_m2_r2_3.
Working directory: /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_explorer_m2_r2_3/
Parent agent: orchestrator_5 (conversation ID: c275e7b3-2b97-46df-81cb-0a621ce8a161)

### Mandatory reading before starting:
1. /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md
2. /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_5/PROJECT.md
3. Full Forensic Auditor Evidence Report:
   /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_auditor_m2/handoff.md
4. Challenger Reports:
   /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_challenger_m2_1/handoff.md
   /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_challenger_m2_2/handoff.md
5. Reviewer Report (CSS specificity finding):
   /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_reviewer_m2_1/handoff.md
6. /Users/anilkaraca/Desktop/Neva/AGENTS.md and canonical authorities (LLM/01, LLM/02, LLM/04).

### Mission:
Investigate and formulate the exact remediation strategy for Milestone M2 Iteration 2 to resolve the Forensic Integrity Violation and Challenger findings:
1. TypeScript Compilation Errors & Canonical Build (`npm run typecheck`, `npm run build`):
   - Check current state of `tests/unit/adversarial_m2_inspectors.test.ts` and `tools/world/terrain-preservation.ts`.
   - Identify all remaining TypeScript compiler errors under `tsc --noEmit`.
   - Provide exact line-by-line diff recommendations to guarantee `npm run typecheck` and `npm run build` succeed with exit code 0.
2. Domain Entity Fidelity in Unit Tests:
   - In `tests/unit/mmo_inspectors_m2.test.ts`, replace unregistered `"fish.salmon"` with registered species (`fish.trout`, `fish.tuna`, `fish.mackerel`) to ensure the fish valuation engine is genuinely exercised.
3. CSS Specificity Fix for In-World Crop Inspection:
   - In `src/ui/coastal.css`, scope `#ui-container .crop-inspection` to `:not([data-projected="true"])` so `!important` does not override inline projection coordinates on free-floating 3D projected crop cards.

You are read-only. Do NOT modify source code or test files. Write your complete analysis and recommended fix strategy to `handoff.md` in your working directory and send_message to orchestrator_5.
