# Plan — Neva Cozy MMO Interface System Overhaul

## Overview
Comprehensive overhaul of every user-facing UI, HUD, modal, inspector, minigame, and screen across Neva into an ArcheAge / Palia-inspired cozy MMO interface system with <20-25% persistent viewport coverage and 100% simulation DTO ownership.

## Milestones & Execution Plan

### M0: Codebase & Spec Survey [COMPLETED]
- 3 parallel survey explorers completed analysis of R1-R8 and test infrastructure.
- Feature inventory and architecture contracts recorded in `PROJECT.md`.

### Milestone 1: Persistent Gameplay HUD & Nautical Navigation (R1 & R2)
- **Scope**:
  - `PlayerUnitFrame.tsx`: Crest, Labor bar with recharge pulse, Sprint bar with exhaustion warning, status chips.
  - `NauticalCompassAlmanac.tsx`: Celestial Time Dial + Nautical Compass Radar with cardinal bearings, wind direction arrow, region title, nearby POIs.
  - `QuestTrackerHUD.tsx`: Tracking both story quest steps and delivery contracts with fold toggle.
  - `MicroMenuPurseBar.tsx`: 6-button icon rack, Gold counter, Bag/Cargo capacity badges.
  - `SmartContextualToolbar.tsx`: Contextual stance hotbar (Agronomy, Angling, Maritime, Explorer).
  - `FarmingActionStatus.tsx`: Action channeling progress bar.
  - `SmartActionPrompt.tsx`: Keycap [E], verb, target entity, Labor cost badge.
  - `PlantingSeedBar.tsx`: Seasonal compatibility and soil suitability hints.
  - DTO expansion in `contracts.ts` and `WorldHudPresentation.ts`.
- **Iteration Team**: Worker -> 2 Reviewers + 2 Challengers + Forensic Auditor.
- **Verification Gate**: Typecheck, unit tests pass, persistent HUD viewport < 25%.

### Milestone 2: In-World Inspectors, Overlays & Maritime Console (R3 & R5)
- **Scope**:
  - `CropInspection.tsx`: Screen-projected crop card with moisture, next action, work cost.
  - `FarmGISLegend.tsx` & `WorldScene.ts`: Tile tinting via `moistureBatch` on [Alt] hold.
  - `CatchInspectionModal.tsx` & `CatchSummaryToast.tsx`: Celebratory trophy catch popover with length, stars, market value, PB badge.
  - `ContextualHintCard.tsx`: Dismissible coastal tips.
  - `NoticeStack.tsx`: Notifications & top-right weather hazard banners.
  - `MaritimeVesselConsole.tsx`: Contextual helm dashboard with speed, heading, sea-state, hull integrity, fuel gauge, and cargo hold bay grid with freshness decay.
- **Iteration Team**: Worker -> 2 Reviewers + 2 Challengers + Forensic Auditor.

### Milestone 3: Dual Fishing Minigames & Cockpits (R4)
- **Scope**:
  - `BasicFishingMinigameWidget.tsx`: Cast sweet spot, bobber alert with visual ripple, bite hook prompt, reeling tension mini-bar.
  - `FishingHUD.tsx` & `CircularTensionGauge.tsx`: 3D circular line-tension gauge, fish stamina, run distance, depth telemetry, rod deflection [A]/[D], reeling/slacking [W]/[S] controls.
- **Iteration Team**: Worker -> 2 Reviewers + 2 Challengers + Forensic Auditor.

### Milestone 4: Dockable MMO Windows & Inventories (R6)
- **Scope**:
  - `InventoryModal.tsx`: Search input, auto-sort button, capacity badges.
  - `GameUI.tsx`: Side-by-side companion docking container (`.companion-dock-container`) for Market + Satchel and Logistics Ledger + Satchel on desktop (>=1024px).
  - `ItemInspectCard.tsx`: Floating cursor card with rarity frames, freshness decay, soil/season requirements, trade value, lore text.
  - ArcheAge physical cargo representation with visual cues for carried heavy packs / trophy fish and speed penalty cues.
- **Iteration Team**: Worker -> 2 Reviewers + 2 Challengers + Forensic Auditor.

### Milestone 5: Folio, Almanac, System Menus & Mobile (R7 & R8)
- **Scope**:
  - `JournalModal.tsx`, `ContractsBoardModal.tsx`, `CoastalAlmanac.tsx`: Story spine, delivery contracts, 15 fish + 10 crop encyclopedia, proficiencies, how-to-play guide.
  - `WorldMapModal.tsx`: Landmarks, harbors, plots, active fishing schools, waypoints, market heatmap.
  - `ExpeditionBoard.tsx`: Maritime voyage planner with sea routes, danger ratings, rewards.
  - `EscapeMenuModal.tsx`: Quick-save, emergency shore/boat recall, 6 audio calibration sliders, graphics quality presets.
  - `StartScreen.tsx` & `SaveRecoverySheet.tsx`: Title splash, continue, fail-safe recovery.
  - `CoastalChronicle.tsx`: Bottom-left activity feed with filter tabs and auto-collapse.
  - `MobileControls.tsx` & `mobile.css`: Virtual joystick/buttons with >=48px touch targets, landscape gate.
  - `DebugOverlay.tsx` & `PlacementEditorHud.tsx`: Performance telemetry, F2 layout editor HUD.
- **Iteration Team**: Worker -> 2 Reviewers + 2 Challengers + Forensic Auditor.

### Milestone 6: Final Verification & E2E Validation (F9.1)
- **Scope**:
  - `tests/unit/mmo_complete_ui.test.ts`: Automated master test covering R1-R8 rendering, stance transitions, companion docking, fishing exclusivity, viewport budget audit (<25% of 1080p and 720p), and 100% simulation DTO purity.
  - Full project gate: `npm run typecheck`, `npm test`, `npm run build`.
- **Iteration Team**: Test Writer / Worker -> Reviewers + Challengers + Forensic Auditor.
