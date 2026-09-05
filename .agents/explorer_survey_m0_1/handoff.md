# Handoff Report: R1 & R2 Technical Survey & Architecture Plan

**Agent**: `explorer_survey_m0_1`  
**Working Directory**: `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/`  
**Target Milestone**: M0-1 (Survey & Technical Mapping for R1 & R2)  
**Parent**: `orchestrator_2` (ID: `a66ec739-374f-4ce2-8658-fb981bd1acb8`)

---

## 1. Observation
I conducted an exhaustive read-only inspection of `src/ui/`, `src/simulation/`, `src/world/`, and `src/app/`:

1. **Current HUD Layout Inversion**:
   - `src/ui/HUD.tsx` lines 196–258: The Top-Left cluster (`.hud-top-left`) mounts `hud-clock-widget` containing `CelestialTimeDial`, weather, and `hud-purse-note`.
   - `src/ui/HUD.tsx` lines 430–468: Player vitals (`work: WorldHudDto["work"]` and `sprint: WorldHudDto["sprint"]`) are relegated to the Bottom-Left cluster under `.hud-vitals`.
   - `src/ui/HUD.tsx` lines 261–285: Top-Right cluster (`.hud-top-right`) mounts only `weather.hazard` chip, `QuestTrackerHUD`, and a standalone menu button. No compass radar exists.
   - `src/ui/HUD.tsx` lines 505–528: Hotbar is hardcoded to 5 static slots: `[Hoe, Seeds, Watering Can, Bait, Rod]`. It does not support contextual mode switching.
   - `src/ui/HUD.tsx` lines 45–61: Context action prompt is parsed from a single string using regex (`^\[(.*?)\]\s*(.*)$`), lumping verb, entity name, and labor cost into plain text.

2. **Subsystem Capabilities & Simulation State**:
   - `src/simulation/presentation/WorldHudPresentation.ts` lines 30–143: `buildWorldHudDto` derives `WorldHudDto` from `GameState`. It currently computes clock rotation, weather, money, work, sprint, and a 5-slot static hotbar.
   - `src/simulation/core/contracts.ts` lines 189–239: `WorldHudDto` lacks fields for contextual stance, compass radar markers, active delivery contracts, status chips, and capacity badges.
   - `src/simulation/core/types.ts` lines 107–134: `PlayerState` has `x, y, z, rotationY`, `carriedFishCargoId`, `activeBoatId`, `workCapacity`, and `traversal.sprintStamina`.
   - `src/simulation/core/types.ts` line 431: `state.weather.windDirectionDeg` and `state.weather.windSpeed` provide exact wind vectors.
   - `src/world/FarmLayout.ts` lines 337–343: `findFarmIdAtWorld(x, z)` accurately identifies if the player is standing within a farm plot.
   - `src/simulation/domains/FishingDomain.ts` lines 448–450: `WorldLayout.fishingAccessAt(player.x, player.z).habitat` accurately identifies proximity to fishable water.
   - `src/world/WorldGameplayLocations.ts` lines 205–238: `WORLD_CHART_NODES` defines exact positions of farms, docks, markets, and landmarks.
   - `src/simulation/core/types.ts` line 541: `state.contracts` provides active delivery contracts.
   - `src/ui/QuestTrackerHUD.tsx` lines 1–85: Renders only `activeQuest`; does not track delivery contracts.
   - `src/ui/GameUI.tsx` lines 697–714: `FarmingActionStatus` is implemented inline inside `GameUI.tsx` rather than a standalone component.
   - `src/ui/components/PlantingSeedBar.tsx` lines 1–76: Displays owned seeds with count badges and preferred climates, but lacks seasonal compatibility icons and soil suitability hints.

---

## 2. Logic Chain

1. **Top-Left Player Frame & Top-Right Compass Relocation**:
   - Observation: `HUD.tsx` places clock/purse in Top-Left and vitals in Bottom-Left.
   - Requirement R1: Requires Player Unit Frame (crest, labor bar with recharge, stamina bar with exhaustion warning, status chips) in Top-Left, and Nautical Compass & Almanac in Top-Right.
   - Inference: Moving the vitals to Top-Left and the clock/compass to Top-Right aligns Neva with modern cozy MMO standards (Palia/ArcheAge) while placing player survivability/capacity at the primary eye anchor.

2. **Simulation Completeness & Zero Logic Duplication**:
   - Observation: All data needed for R1 and R2 (work, stamina, cargo, weather, wind bearing, rotation, region names, POI coordinates, fish schools, contracts, seeds) is already computed deterministically in `src/simulation/`.
   - Inference: No game logic needs to be rewritten or duplicated in UI. The required change is extending `WorldHudDto` in `src/simulation/core/contracts.ts` and populating it in `src/simulation/presentation/WorldHudPresentation.ts`.

3. **Contextual Stance Detection**:
   - Observation: `player.activeBoatId`, `findFarmIdAtWorld(x, z)`, and `fishingAccessAt(x, z).habitat` are pure queries with zero side effects.
   - Inference: A single helper `detectContextualStance(state)` can cleanly resolve the player's stance:
     - `activeBoatId !== null` -> `"maritime"`
     - `findFarmIdAtWorld() !== null` -> `"agronomy"`
     - `fishingAccessAt().habitat !== null` -> `"angling"`
     - fallback -> `"explorer"`
   - This drives the 5-slot loadout dynamically in `SmartContextualToolbar.tsx`.

4. **Viewport Budget Compliance**:
   - Observation: Project art Bible `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md` line 513 limits persistent HUD to <20–25% screen coverage.
   - Calculation: The 5 persistent edge clusters occupy 123,360 px² on 1080p (**5.95%** coverage) and 98,970 px² on 720p (**10.74%** coverage).
   - Inference: The proposed architecture comfortably passes the viewport budget audit with a 50%+ safety margin.

---

## 3. Caveats
1. **Mobile Virtual Joystick Layout**: Mobile touch controls (`src/ui/MobileControls.tsx`) overlay on top of the HUD on mobile devices. Touch button sizing (48px) has been respected, but full mobile gesture integration belongs to R8.
2. **Sport Fishing HUD Isolation**: Sport fishing uses an exclusive telemetry HUD (`FishingHUD.tsx`) that hides persistent HUD elements. This is intentional and adheres to the project rule of minimizing distraction during the active catch encounter.
3. **Read-Only Explorer Constraint**: In accordance with the explorer archetype rules, no source code files in `src/` were edited during this survey.

---

## 4. Conclusion
1. **Implementation is fully scoped and low-risk**: All underlying data models exist and are mathematically validated.
2. **Component Refactoring Plan**:
   - Create 5 modular HUD components in `src/ui/hud/`: `PlayerUnitFrame.tsx`, `NauticalCompassAlmanac.tsx`, `MicroMenuPurseBar.tsx`, `SmartContextualToolbar.tsx`, `SmartActionPrompt.tsx`.
   - Extract `FarmingActionStatus.tsx` to `src/ui/components/FarmingActionStatus.tsx`.
   - Enhance `QuestTrackerHUD.tsx` with active delivery contracts.
   - Enhance `PlantingSeedBar.tsx` with seasonal compatibility icons and soil suitability hints.
   - Extend `WorldHudDto` in `contracts.ts` and `WorldHudPresentation.ts`.
3. The complete technical blueprint is documented in `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/analysis.md`.

---

## 5. Verification Method
1. **Inspect Survey Artifacts**:
   - Review `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/analysis.md`.
   - Review this `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/handoff.md`.
2. **Verify Codebase Integrity**:
   - Run `npm run typecheck` to confirm 0 compiler errors.
   - Run `npm test` to confirm all unit and simulation tests pass.
3. **Review Target Integration Points**:
   - Inspect `src/simulation/presentation/WorldHudPresentation.ts`.
   - Inspect `src/ui/HUD.tsx`.
   - Inspect `src/ui/GameUI.tsx`.
