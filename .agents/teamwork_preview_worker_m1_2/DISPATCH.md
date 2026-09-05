## 2026-09-04T09:52:05Z
You are teamwork_preview_worker_m1_2.
Working directory: /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_worker_m1_2/
Parent agent: orchestrator_4 (conversation ID: 6ec9cade-1e48-47ab-a126-866fd7c1f1f4)

Mandatory reading before starting:
1. /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md
2. /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_4/PROJECT.md
3. Challenger Handoff Reports:
   - /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_challenger_m1_1/handoff.md
   - /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_challenger_m1_2/handoff.md
4. Reviewer Handoff Reports:
   - /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_reviewer_m1_1/handoff.md
   - /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_reviewer_m1_2/handoff.md
5. /Users/anilkaraca/Desktop/Neva/AGENTS.md and relevant authorities (LLM/01, LLM/02, LLM/04).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Write Ownership for this pass:
- `src/ui/hud/SmartActionPrompt.tsx`
- `src/simulation/presentation/WorldHudPresentation.ts`
- `src/ui/components/FarmingActionStatus.tsx`
- `src/ui/HUD.tsx`
- `src/ui/coastal.css`
- `src/ui/hud.css`
- `src/ui/components/PlantingSeedBar.tsx`
- `tests/unit/hud_m1.test.ts`
- `tests/unit/adversarial_m1_hud.test.ts`
- `tests/unit/viewport_budget_m1_adversarial.test.ts`

Your Mission — Remediate All Challenger Findings & Reviewer Gaps:
1. SmartActionPrompt Robustness:
   - Fix unanchored regex so it anchors the labor cost pattern to the end of the string (e.g. trailing `\s*[\(\·\-]\s*(\d+)\s*Work\s*\)?$` or `\s*\(?-?(\d+)\s*Work\)?$`). When prompt is `"[E] Deliver 5 Work Orders (-10 Work)"`, laborCost must be 10, verb "Deliver", target "5 Work Orders".
   - Guard against whitespace-only prompts (`if (!text || !text.trim()) return null;`).
2. WorldHudPresentation NaN Guard:
   - In `detectContextualStance(state)`: check `if (Number.isNaN(state.player.x) || Number.isNaN(state.player.z)) return "explorer";` before passing coordinates to `findFarmIdAtWorld` or `WorldLayout.fishingAccessAt`.
3. FarmingActionStatus NaN Guard:
   - In `FarmingActionStatus.tsx`: sanitize progress: `const progress = Number.isFinite(action.progress) ? Math.max(0, Math.min(1, action.progress)) : 0;`.
4. HUD.tsx Live Wiring:
   - In `src/ui/HUD.tsx:359`, pass `currentWork={hud.work.current}` to `<SmartActionPrompt>`.
5. Responsive Breakpoint Fixes on <=820px/620px:
   - In `src/ui/coastal.css`: ensure `.hud-bottom-left-container` has `max-width: min(300px, 30vw)` so it doesn't crowd center.
   - In `src/ui/components/PlantingSeedBar.tsx` / `coastal.css`: on responsive narrow screens (<=820px), scale seed slot size or padding (e.g. `max-width: min(460px, 60vw)`) so `PlantingSeedBar` does not collide with `MicroMenuPurseBar`.
6. Run Verification Commands:
   - `npm run typecheck`
   - `npx vitest run tests/unit/hud_m1.test.ts`
   - `npx vitest run tests/unit/adversarial_m1_hud.test.ts`
   - `npx vitest run tests/unit/viewport_budget_m1_adversarial.test.ts`
   - `npx vitest run tests/unit/uiModals.test.ts`
   - `npx vitest run tests/unit/hudNotifications.test.ts`
7. Write `handoff.md` and send completion message to orchestrator_4 via send_message.
