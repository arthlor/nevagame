# Dispatch to teamwork_preview_worker_m2

## 2026-09-04T13:58:00Z
You are teamwork_preview_worker_m2.
Working directory: /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_worker_m2/
Parent agent: orchestrator_5 (conversation ID: c275e7b3-2b97-46df-81cb-0a621ce8a161)

### Mandatory reading before starting:
1. /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md
2. /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_5/PROJECT.md
3. Explorer Handoff Reports:
   - /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_explorer_m2_1/handoff.md (Crop Inspection & Farm GIS Overlay)
   - /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_explorer_m2_2/handoff.md (Catch Inspection, Contextual Hints, Notice Stack & Weather Hazards)
   - /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_explorer_m2_3/handoff.md (Maritime Vessel Console & Cargo Hold Bay Grid)
4. /Users/anilkaraca/Desktop/Neva/AGENTS.md and canonical authorities (LLM/01, LLM/02, LLM/04).

### MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

### Scope & Tasks for Milestone M2:
1. **F3.1 In-World Crop Inspection Card (`CropInspection.tsx`)**:
   - Extract from `src/ui/GameUI.tsx` into `src/ui/components/CropInspection.tsx` and re-export in `GameUI.tsx` for 100% backward compatibility.
   - Support in-world 3D camera projection (`projectedPosition?: { x: number; y: number; visible: boolean } | null`) with safe viewport clamping (16px margins), falling back to safe docking when off-screen or behind camera.
   - Display crop icon, name, stage chip, countdown label, moisture band (`wet`/`ideal`/`dry`), immediate next action, Work cost, and close button.
2. **F3.2 Farm GIS Legend & Soil Overlay (`FarmGISLegend.tsx`)**:
   - Wire `isFarmGisMode` from `WorldScene.ts` into `CropInstanceRenderer.sync()`.
   - Hash `isFarmGisMode` in `computeCropSignature()` so `[Alt]` press immediately invalidates batch.
   - Update `updateMoistureBatch()` in `CropInstanceRenderer.ts` to modulate soil instance colors using canonical palette tokens for moisture and fertility (`PALETTE_HEX`).
   - Enhance `FarmGISLegend.tsx` in `src/ui/components/` to show moisture tiers and nitrogen/compost fertility (Rich, Fair, Depleted) while preserving all existing test selectors (`data-testid="farm-gis-legend"`, `"Field signs"`, `"Good moisture"`, `"Ready to harvest"`).
3. **F3.3 Trophy Catch Inspection Modal & Toast (`CatchInspectionModal.tsx`, `CatchSummaryToast.tsx`)**:
   - Implement `CatchInspectionModal.tsx` as a celebratory popover modal card.
   - Implement `CatchSummaryToast.tsx` as a lightweight auto-dismissing toast (5,200ms) with inspect click action.
   - Define pure presentation DTO `TrophyCatchDto`: species portrait (`AtlasImage`), weight (kg), length (cm derived via allometric cubic scaling), 1–4 quality stars, freshness gauge/timer, estimated market value in Gold, and personal best badge (`"first" | "weight" | "quality"`).
   - In `GameApp.ts`, ensure boat-stowed catches and `record` field from `FishLanded` event are preserved and not dropped.
4. **F3.4 Contextual Hint Cards (`ContextualHintCard.tsx`)**:
   - Move/refactor to `src/ui/components/ContextualHintCard.tsx` (re-export from `src/ui/ContextualHintCard.tsx` for backwards compatibility).
   - Add category insignia badges (`boating`, `angling`, `farming`, `weather`, `general`), visible `[Esc]` keycap badge, reading duration calculation (5s–15s), pause on hover/focus (`data-held="true"`), and accessible ARIA attributes.
5. **F3.5 Notice Stack & Weather Hazards (`NoticeStack.tsx`, `WeatherHazardBanner.tsx`)**:
   - Upgrade `NoticeStack.tsx` in `src/ui/components/` to handle structured item deltas (`+3 Winter Carrot`) with item icons and labor shifts (`-12 Work`, `+200 Work`).
   - Create `WeatherHazardBanner.tsx` mounted in top-right HUD cluster beneath Nautical Compass for maritime hazards (Dense Fog, Squall/Gale Winds, Storm Waves) with actionable navigation advice.
6. **F5.1 & F5.2 Maritime Vessel Console & Cargo Hold Grid (`MaritimeVesselConsole.tsx`)**:
   - Create `src/ui/components/MaritimeVesselConsole.tsx` replacing inline markup in `src/ui/HUD.tsx:202-325`.
   - Implement vessel name, registration insignia (`REG · NV-ROW-01`, `REG · NV-SKF-02`), docking/underway/drifting status chips, night waters warning, speed log in knots, heading bearing (`045° NE`), sea-state condition, hull integrity with 3 damage tints (`hull-sound`, `hull-damaged`, `hull-critical`), and fuel gauge.
   - Implement physical cargo hold bay grid: internal hold bays (`is-hold`), external transom hooks (`is-hook`), species sprites (`AtlasImage`), quality medallions, real-time freshness decay bars, weight badges, and ice preservation indicator (`❄️`).
   - Wire `<MaritimeVesselConsole boat={boat} headingDegrees={hud.compass.headingDegrees} headingCardinal={hud.compass.headingCardinal} />` cleanly in `HUD.tsx`.
7. **Comprehensive Styling & Testing**:
   - Add/update styling in `src/ui/hud.css` and `src/ui/coastal.css` adhering to Neva palette and <25% viewport coverage.
   - Create comprehensive unit test suite: `tests/unit/mmo_inspectors_m2.test.ts` covering F3.1–F3.5 and F5.1–F5.2.
   - Run typecheck and test suites:
     - `npm run typecheck`
     - `npx vitest run tests/unit/mmo_inspectors_m2.test.ts tests/unit/adversarial_m2_hud.test.ts tests/unit/empirical_m5_overlays.test.ts tests/unit/uiModals.test.ts`
     - `npm run build`

### File Write Ownership for Milestone M2:
- `src/ui/components/CropInspection.tsx`
- `src/ui/components/FarmGISLegend.tsx`
- `src/ui/components/CatchInspectionModal.tsx`
- `src/ui/components/CatchSummaryToast.tsx`
- `src/ui/components/ContextualHintCard.tsx`
- `src/ui/components/NoticeStack.tsx`
- `src/ui/components/WeatherHazardBanner.tsx`
- `src/ui/components/MaritimeVesselConsole.tsx`
- `src/ui/HUD.tsx`
- `src/ui/GameUI.tsx`
- `src/ui/ContextualHintCard.tsx`
- `src/app/GameApp.ts`
- `src/render/scene/WorldScene.ts`
- `src/render/scene/CropInstanceRenderer.ts`
- `src/ui/hud.css`
- `src/ui/coastal.css`
- `tests/unit/mmo_inspectors_m2.test.ts`

### Handoff Requirements:
When complete, write a detailed handoff report to `.agents/teamwork_preview_worker_m2/handoff.md` with:
- Observation, Logic Chain, Caveats, Conclusion, and Verification Method (including exact terminal commands and results for typecheck, unit tests, and build).
- Then send a completion message back to orchestrator_5.
