# Handoff Report — Explorer Survey M0-2: R3, R4, R5

## 1. Observation
1. **R3 Crop Inspection**: In `src/ui/GameUI.tsx` (lines 613–680), `CropInspection` is implemented as an inline component and rendered conditionally at line 372:
   ```tsx
   {mode !== "sport-fishing" && inspectedCrop && (
     <CropInspection inspection={inspectedCrop} onClose={onDismissCropInspection} />
   )}
   ```
   In `src/ui/overlays.css` (lines 75–96), it is styled with static viewport coordinates:
   `position: absolute; top: 50%; right: var(--ui-safe-right); transform: translateY(-50%);`. It does not support 3D world projection or screen-anchoring to the crop plot.
2. **R3 Farm GIS Overlay**: In `src/ui/components/FarmGISLegend.tsx`, a 2D legend is rendered when `visible` is true. `src/input/InputRouter.ts` (line 115) captures `farmGisHeld: hasAny(keys, "AltLeft", "AltRight")`. In `src/render/scene/WorldScene.ts` (lines 735–743):
   ```ts
   private isFarmGisMode: boolean = false;
   public setFarmGisMode(active: boolean): void { this.isFarmGisMode = active; }
   public getFarmGisMode(): boolean { return this.isFarmGisMode; }
   ```
   `isFarmGisMode` is never queried anywhere else in `WorldScene.ts` or `CropInstanceRenderer.ts`. In-world tile tinting is a non-functioning stub.
3. **R3 Catch Inspection Modal & Toast**: `src/ui/components/CatchInspectionModal.tsx` contains only 53 lines and exports only `CatchSummaryToast`. The celebratory popover modal `CatchInspectionModal` does not exist. `CatchSummaryToast` displays weight and freshness % but lacks length, star quality icons, estimated market value, and personal best record badge.
4. **R4 Basic Fishing Minigame**: `src/ui/fishing/BasicFishingMinigameWidget.tsx` implements cast power charging (lines 88–111) with zones (`Short`, `Medium`, `Long`), but has no sweet-spot indicator. When in `waiting-for-bite`, line 282 returns `null`, offering no UI feedback or ripple cue until `bite-reaction` arrives.
5. **R4 Sport Fishing HUD**: `src/ui/FishingHUD.tsx` renders line tension using a horizontal linear meter (lines 183–197):
   ```tsx
   <div className="fishing-tension-track" style={{ gridTemplateColumns: ... }}>
   ```
   This is a linear bar rather than a 3D circular line-tension gauge. In `src/simulation/core/contracts.ts` (lines 325–358), `SportFishingHudDto` lacks `distanceMeters` and `waterDepthMeters`, despite both being tracked in `FishingEncounterState` (`encounter.distanceMeters` and `encounter.dynamics.depthMeters`).
6. **R5 Maritime Vessel Console**: In `src/ui/HUD.tsx` (lines 310–428), `hud-boat-panel` is implemented directly inside the HUD component. In `src/simulation/core/contracts.ts` (lines 190–218), `WorldHudBoatDto` lacks `headingDegrees`, `headingCardinal`, and registration insignia. Furthermore, line 119 in `HUD.tsx` uses a heuristic: `const boatDocked = boat && boat.speedKnots === 0 && !boat.seaWarning;`. This causes stationary floating boats at sea to falsely display "Docked" and hides speed, sea state, hull, and fuel! `BoatState.isDocked` must be passed in `WorldHudBoatDto` instead.
7. **Typecheck Baseline**: `npm run typecheck` currently fails with pre-existing issues: `src/ui/GameUI.tsx(415,10)` misses required `onSetDrag` on `FishingHUD`, and multiple test mocks miss `dragNotch`.

## 2. Logic Chain
1. From Observation 1, `CropInspection` is tightly coupled into `GameUI.tsx` and positioned statically on screen. To provide MMO immersion with in-world inspection, it must be extracted into `src/ui/components/CropInspection.tsx` and receive projected screen coordinates from `GameApp.projectWorldPoint()`.
2. From Observation 2, holding `[Alt]` triggers `setFarmGisMode(true)`, but because `WorldScene.ts` does not propagate this state to `CropInstanceRenderer.ts` or tile materials, no visual change occurs in the 3D world. Connecting `isFarmGisMode` to modulate the instance colors of the soil mesh (`moistureBatch`) is required to complete the feature.
3. From Observation 3, the user specification explicitly requires `CatchInspectionModal` with species portrait, weight, length, star quality tier, freshness timer, market estimated value, and personal best record badge. Because only `CatchSummaryToast` is implemented, a full modal component must be constructed in `src/ui/components/CatchInspectionModal.tsx`, using `calculateFishPrice()` for appraisal and `FishLanded` record data for the PB badge.
4. From Observations 4 and 5, `BasicFishingMinigameWidget` requires a sweet-spot indicator on the cast meter and a bobber alert cue. `FishingHUD` must replace its linear bar with a radial/circular tension gauge (`CircularTensionGauge.tsx`) and display the run distance to boat and water depth telemetry that are already simulated in `FishingEncounter`.
5. From Observations 6 and 7, `hud-boat-panel` in `HUD.tsx` exceeds 120 lines, lacks heading bearing telemetry, and relies on an erroneous `speedKnots === 0` docking heuristic. Extracting it to `src/ui/components/MaritimeVesselConsole.tsx`, adding `isDocked`, `headingDegrees`, `headingCardinal`, and `registrationCode` to `WorldHudBoatDto`, and fixing the `onSetDrag` typecheck gap will establish a clean, verified maritime and fishing HUD.

## 3. Caveats
- Fish body length in cm is not explicitly stored in `FishCargoState` or `FishSpeciesDefinition`. It must be derived presentationally using allometric cubic scaling ($L \propto \sqrt[3]{W / W_{\text{avg}}}$) as is standard in fisheries simulation.
- In-world 3D-to-2D screen coordinate projection for `CropInspection` relies on the active camera matrix; off-screen or extreme edge targets must clamp to viewport margins or fall back gracefully to the safe right-dock position.
- No source files outside `.agents/explorer_survey_m0_2/` were modified during this read-only survey.

## 4. Conclusion
The simulation engines for farming, fishing, and boating provide all necessary underlying data, but significant presentation layers in R3, R4, and R5 are either incomplete, missing, or architecturally misplaced. Implementing the recommended component extractions (`CropInspection.tsx`, `MaritimeVesselConsole.tsx`, `CatchInspectionModal.tsx`, `CircularTensionGauge.tsx`) and connecting the simulation DTOs will fully satisfy R3, R4, and R5.

## 5. Verification Method
1. **Detailed Architecture Document**: Inspect `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_2/analysis.md` for the full technical breakdown, DTO definitions, and data flow diagrams.
2. **Type Safety & Existing Test Integrity**:
   - Run `npm run typecheck` to verify zero TypeScript errors in current codebase.
   - Run `npx vitest run tests/unit/empirical_m5_overlays.test.ts` to confirm existing overlay test expectations.
3. **Invalidation Conditions**: If `SportFishingHudDto` or `WorldHudBoatDto` schemas cannot be modified due to external consumers, alternative presentation adapter layers must be introduced in `GameApp.ts`.
