# Dispatch to teamwork_preview_reviewer_m2_2

## 2026-09-04T14:20:00Z
You are teamwork_preview_reviewer_m2_2.
Working directory: /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_reviewer_m2_2/
Parent agent: orchestrator_5 (conversation ID: c275e7b3-2b97-46df-81cb-0a621ce8a161)

### Mandatory reading before starting:
1. /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md
2. /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_5/PROJECT.md
3. Worker Handoff: /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_worker_m2/handoff.md
4. /Users/anilkaraca/Desktop/Neva/AGENTS.md and relevant authorities (LLM/01, LLM/02, LLM/04).

### Mission:
Independently review Milestone M2 deliverables for correctness, completeness, robustness, and architectural purity:
- F3.1 In-world Crop Inspection Card (`src/ui/components/CropInspection.tsx`)
- F3.2 Farm GIS Legend & Soil Overlay (`src/ui/components/FarmGISLegend.tsx`, `src/render/scene/WorldScene.ts`, `src/render/scene/CropInstanceRenderer.ts`)
- F3.3 Trophy Catch Inspection Modal & Toast (`src/ui/components/CatchInspectionModal.tsx`, `src/ui/components/CatchSummaryToast.tsx`, `src/simulation/fishing/trophyCatch.ts`, `src/app/GameApp.ts`)
- F3.4 Contextual Hint Cards (`src/ui/components/ContextualHintCard.tsx`)
- F3.5 Notice Stack & Weather Hazards (`src/ui/components/NoticeStack.tsx`, `src/ui/components/WeatherHazardBanner.tsx`)
- F5.1 & F5.2 Maritime Vessel Console & Cargo Hold Grid (`src/ui/components/MaritimeVesselConsole.tsx`, `src/ui/HUD.tsx`)
- CSS styling in `src/ui/hud.css` and `src/ui/coastal.css` (<25% persistent viewport budget).
- Unit test suite: `tests/unit/mmo_inspectors_m2.test.ts`.

### Verification Steps:
1. Run `npm run typecheck` (must pass with 0 errors).
2. Run `npm run build` (must pass with 0 errors).
3. Run Vitest suites:
   `npx vitest run tests/unit/mmo_inspectors_m2.test.ts tests/unit/adversarial_m2_hud.test.ts tests/unit/empirical_m2_hud.test.ts tests/unit/empirical_m5_overlays.test.ts tests/unit/uiModals.test.ts`
   and regression suites:
   `npx vitest run tests/unit/adversarial_m1_hud.test.ts tests/unit/hud_m1.test.ts`
4. Inspect code for 100% simulation ownership (read-only DTOs, no state mutation in UI).
5. Deliver verdict (`APPROVE` or `REQUEST_CHANGES`) in `handoff.md` and send_message to orchestrator_5.
