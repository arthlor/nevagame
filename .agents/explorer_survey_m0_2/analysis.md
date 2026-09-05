# Technical Analysis & Architectural Survey: R3, R4, and R5
**ArcheAge / Palia-Inspired Cozy MMO Interface Overhaul**
*Author: explorer_survey_m0_2*
*Scope: R3 (In-World Inspectors, GIS Overlays & Toasts), R4 (Dual Fishing Minigames & Cockpits), R5 (Maritime Vessel Console)*

---

## Executive Summary

This investigation maps the current implementation state, architectural gaps, simulation DTO dependencies, input exclusivity invariants, and concrete refactoring blueprints for Requirements R3, R4, and R5 across the Neva codebase. 

While core simulation models (such as `FishingEncounter`, `BasicFishingMinigame`, `FarmingDomain`, `CargoDomain`, and `NavigationDomain`) are rich and mathematically rigorous, significant presentation gaps and structural coupling exist:
1. **R3 (In-World Inspectors & Overlays)**: `CropInspection` is coupled inside `GameUI.tsx` and docked statically on screen without 3D world projection; `FarmGISLegend` exists as a 2D HUD widget, but the in-world tile tinting in `WorldScene.ts` is an empty no-op stub; `CatchInspectionModal` does not exist at all (only a minimal 53-line `CatchSummaryToast` is present, lacking species portraits, length, star quality medallions, market appraisal, and personal best records).
2. **R4 (Dual Fishing Minigames & Cockpits)**: `BasicFishingMinigameWidget` lacks a dedicated cast sweet-spot indicator and water surface bobber alert; `FishingHUD` uses a flat horizontal linear tension bar instead of a 3D circular line-tension gauge, and completely omits run distance (meters to boat) and water depth telemetry (even though both are tracked in simulation dynamics).
3. **R5 (Maritime Vessel Console)**: `hud-boat-panel` is tightly embedded inside `HUD.tsx` (over 120 lines); it lacks vessel registration insignia and heading bearing telemetry (`headingRadians` in simulation is never passed to `WorldHudBoatDto`), and its cargo hold bays need visual elevation to meet ArcheAge physical cargo standards.

---

## 1. Current State Assessment vs. Requirements

### R3: In-World Inspectors, GIS Overlays & Toasts

| Feature Component | Spec Requirement | Current Codebase State | Gap Severity |
| :--- | :--- | :--- | :--- |
| **Crop Inspection Card** (`CropInspection`) | Crop icon, name, growth stage chip, stage countdown/progress label, soil moisture band (`wet`, `ideal`, `dry`), immediate next action (`Water`, `Harvest`, `Fertilize`), Work cost. Optional 3D screen projection. | Embedded inside `src/ui/GameUI.tsx` (lines 613–680); positioned via static CSS at screen right (`transform: translateY(-50%)`). Consumes `CropInspectionDto`. | **Medium**: Works functionally, but not an isolated component; no in-world 3D anchoring tether to the inspected plot. |
| **Farm GIS Legend & Soil Overlay** (`FarmGISLegend`) | `[Alt]` hold tile tinting & HUD legend indicating soil moisture levels and nitrogen/compost fertility. | `FarmGISLegend.tsx` exists (2D HUD legend). `InputRouter` detects `farmGisHeld` on `AltLeft`/`AltRight`. `GameApp` calls `worldScene.setFarmGisMode(held)`. **HOWEVER**, `WorldScene.setFarmGisMode()` only sets a private flag and **never renders or tints tiles**! | **High (Broken / Missing in 3D)**: The in-world visual representation does not exist; `CropInstanceRenderer` only colors soil based on default moisture, ignoring the GIS mode. |
| **Trophy Catch Inspection & Toast** (`CatchInspectionModal` & `CatchSummaryToast`) | Celebratory popover card when landing sport fish: species portrait, weight kg, length, star quality tier, freshness timer, market estimated value, PB badge. | File `src/ui/components/CatchInspectionModal.tsx` exists, but **only defines `CatchSummaryToast`** (53 lines). `CatchInspectionModal` is **completely missing**. `CatchSummaryToast` lacks length, star quality icons, market value, and PB badge. | **High (Missing Component)**: Celebratory modal card is absent; toast is missing required telemetry. |
| **Contextual Hint Cards** (`ContextualHintCard`) | Non-intrusive coastal discovery tips for first-time systems (boating, sport fishing, soil care) with clean dismiss and keyboard shortcuts. | Implemented in `src/ui/ContextualHintCard.tsx` (129 lines) with dynamic reading countdown (`hintVisibleMs`), hover hold, and Esc capture. Registered in `GameApp.ts`. | **Low**: Fully implemented; needs minor styling and content integration checks. |
| **Notice Stack & Weather Hazards** (`NoticeStack`, `weather.hazard`) | Sleek floating notifications for items/labor and top-right warning banners for maritime hazards (dense fog, squall, storm waves). | `NoticeStack.tsx` handles item/labor toasts in `HUD.tsx`. Weather hazard is rendered as a minimal chip (`hud-weather-chip`) in `HUD.tsx` top-right. | **Low/Medium**: Functional, but weather hazard needs visual prominence as an authoritative maritime warning banner. |

---

### R4: Dual Fishing Minigames & Cockpits

| Feature Component | Spec Requirement | Current Codebase State | Gap Severity |
| :--- | :--- | :--- | :--- |
| **Basic Fishing Cast Meter** | Cast charge meter with **sweet-spot indicator**. | `BasicFishingMinigameWidget.tsx` renders 3 broad zones (`Short`, `Medium`, `Long`) via `.cast-zone`. No highlighted gold/cyan sweet-spot target tick/band. | **Medium**: Visual sweet spot missing. |
| **Bobber Alert & Ripple Feedback** | Water surface bobber alert with haptic/visual ripple feedback during bite anticipation. | `BasicFishingMinigameWidget` returns `null` during `waiting-for-bite`. `WorldScene.ts` has a 3D bobber ring mesh, but no UI cue exists until `bite-reaction` arrives. | **Medium**: Waiting phase is silent in UI; needs bobber alert & ripple cue. |
| **Bite-Reaction Hook Prompt** | Precision bite-reaction hook prompt (`[Space] Hook!`). | Implemented in `BasicFishingMinigameWidget.tsx` (`.bite-alert-banner` with `[Space]` and button). | **Low**: Functional; minor styling refinement. |
| **Reeling Tension Mini-Bar** | Maintaining the bobber within the moving tension window, catch victory / escape outcomes. | Implemented in `BasicFishingMinigameWidget.tsx` (`.water-track`, `.green-catch-bar`, `.catch-progress-track`). Outcomes handled cleanly. | **Low**: Fully operational Stardew-style mechanics. |
| **Circular Line-Tension Gauge** | **3D circular line-tension gauge** (safe slack, optimal tension, near-snap danger alarm). | `FishingHUD.tsx` currently renders a **flat horizontal linear bar** (`.fishing-tension-track`) with grid columns for slack/safe/danger! | **High (Violates Spec)**: Must be overhauled to a circular radial gauge / dial with tension bands and danger alarm. |
| **Run Distance & Depth Telemetry** | Fish stamina gauge, **run distance indicator (meters to boat)**, and **water depth telemetry**. | `energyPercent` (stamina) is rendered. **Run distance (`encounter.distanceMeters`) and water depth (`encounter.dynamics.depthMeters`) are completely omitted** from `SportFishingHudDto` and UI! | **High (Missing Telemetry)**: Data exists in simulation, but is not passed to presentation. |
| **Rod Deflection & Counter-Swing Guidance** | Rod deflection angle & counter-swing guidance (`[A]` / `[D]`). | `SportFishingHudDto` passes `rodDirectionAngle` and `decision.key`, but `FishingHUD.tsx` displays only text instructions. Visual steering indicator is missing. | **Medium**: Needs clear visual directional counter-swing HUD widget. |
| **Tactile Reeling vs Slacking Controls** | Reeling (`[W]`) vs Slacking (`[S]`) tactile controls with audio-visual strain cues. | Buttons and touch triggers exist, but lack dynamic strain visual cues (pulse/vibration/color glow on line strain). | **Medium**: Needs sensory juice. |

---

### R5: Maritime Vessel Console (`hud-boat-panel`)

| Feature Component | Spec Requirement | Current Codebase State | Gap Severity |
| :--- | :--- | :--- | :--- |
| **Console Architecture** | Contextual nautical dashboard when helm is engaged. | 120+ lines written inline in `src/ui/HUD.tsx` (lines 310–428). | **Medium (Tech Debt)**: Belongs in `src/ui/components/MaritimeVesselConsole.tsx`. |
| **Vessel Insignia & Registration** | Vessel name, registration insignia, and docking status chip. | Shows `boat.name` and docking chip. **Registration insignia is missing**. | **Low/Medium**: Needs registration crest / identifier badge (e.g., `NV-01`). |
| **Speed Log & Heading Bearing** | Speed log in knots, **heading bearing**, and sea-state condition (calm, choppy, rough). | Shows speed in knots and sea state. **Heading bearing is missing** (`BoatState.headingRadians` is never mapped to `WorldHudBoatDto`). | **High (Missing Telemetry)**: Heading bearing degrees and cardinal heading (e.g., `042° NE`) missing. |
| **Hull & Fuel Gauges** | Hull integrity bar (with damage tint) and Fuel tank level gauge. | Implemented via `<Meter className="hud-boat-hull">` and `<Meter className="hud-boat-fuel">`. | **Low**: Functional; needs visual refinement. |
| **Physical Cargo Hold Bay Grid** | Individual hold slots showing loaded fish cargo / trade packs, species sprites, quality medallions, and real-time freshness decay bars. | Implemented in `HUD.tsx` using `<ItemSlot>` mapping `boat.cargoSlots`. Freshness track exists. Lacks distinct ArcheAge physical cargo treatment for trade packs and quality medallions. | **Medium**: Visual upgrade required to achieve MMO physical cargo feel. |

---

## 2. Architecture & File Inventory

### Files to Create

1. **`src/ui/components/CropInspection.tsx`**
   - Extract `CropInspection` from `src/ui/GameUI.tsx` into an isolated, testable component.
   - Add support for world-anchored screen positioning (`anchorPosition?: { x: number; y: number }`) with fallback to right-side viewport docking.
   - Include clear moisture band meter, stage timing readout, and immediate action Work badge.

2. **`src/ui/components/CatchInspectionModal.tsx` (Major Expansion)**
   - Implement the celebratory modal `CatchInspectionModal`:
     - Species portrait (`AtlasImage` / 3D model snapshot).
     - Weight in kg and calculated body length in cm (derived from species allometric parameters).
     - Star quality tier medallions (1-star Common, 2-star Fine, 3-star Exceptional, 4-star Trophy).
     - Live freshness decay countdown timer.
     - Estimated market value in Gold (computed via `calculateFishPrice`).
     - Personal Best record badge (`"first"` = New Discovery, `"weight"` = Record Weight, `"quality"` = Finest Quality).
     - Collect / Stow action button.
   - Retain and refine `CatchSummaryToast` in the same module.

3. **`src/ui/components/MaritimeVesselConsole.tsx`**
   - Extract `hud-boat-panel` from `src/ui/HUD.tsx` into a dedicated vessel console.
   - Integrate registration insignia badge (e.g. `NV-01` Coastal Registry).
   - Display circular or tabular navigation telemetry: Speed Log (knots), Compass Bearing (`000°`–`359°` + Cardinal `N/NE/E/SE/S/SW/W/NW`), Sea State condition (`Calm`, `Choppy`, `Rough`), and Sea Warning alert.
   - Render Hull integrity meter (with danger warning) and Fuel tank meter.
   - Render Physical Cargo Hold bay grid: individual bay slots with species icon, quality badge, freshness bar, and cargo class badge.

4. **`src/ui/fishing/CircularTensionGauge.tsx`**
   - SVG-based circular gauge for `FishingHUD`:
     - Arc track showing slack band (0–20%), safe optimal tension band (20–80%), and danger band (80–100%).
     - Needle or progress arc reflecting live line tension.
     - Pulsing danger alarm state with warning color shifts when tension exceeds safe threshold.

---

### Files to Modify / Refactor

1. **`src/simulation/core/contracts.ts`**
   - In `SportFishingHudDto`:
     - Add `distanceMeters: number;` (current line distance / run distance to boat).
     - Add `waterDepthMeters: number;` (fish depth / water column telemetry).
   - In `WorldHudBoatDto`:
     - Add `headingDegrees: number;` (0 to 359).
     - Add `headingCardinal: string;` (e.g., "N", "NE", "E", etc.).
     - Add `registrationCode: string;` (e.g., "NV-01").
   - In `CropInspectionDto`:
     - Optionally add `worldPosition?: { x: number; y: number; z: number };` to streamline in-world coordinate projection.

2. **`src/simulation/domains/FishingDomain.ts`**
   - In `buildSportFishingHudDto(encounter)`:
     - Populate `distanceMeters: Math.round(encounter.distanceMeters * 10) / 10`.
     - Populate `waterDepthMeters: Math.round((encounter.dynamics?.depthMeters ?? 0.25) * 10) / 10`.

3. **`src/simulation/presentation/WorldHudPresentation.ts`**
   - In `buildWorldHudDto`:
     - In `boat` DTO, compute:
       - `headingDegrees = Math.round(((activeBoat.headingRadians * 180) / Math.PI + 360) % 360)`
       - `headingCardinal = degreesToCardinal(headingDegrees)`
       - `registrationCode = activeBoat.boatTypeId === "boat.rowboat" ? "NV-ROW-01" : "NV-SKF-02"`

4. **`src/ui/FishingHUD.tsx`**
   - Replace linear tension track with `CircularTensionGauge`.
   - Add Telemetry Readout Grid:
     - Distance to Boat (`${hud.distanceMeters} m`).
     - Water Depth (`${hud.waterDepthMeters} m`).
     - Fish Stamina (`${hud.energyPercent}%`).
   - Add Rod Deflection & Counter-Swing Visualizer:
     - Dynamic visual counter-steer indicators (`[A]` ← / → `[D]`) based on `hud.rodDirectionAngle` and `hud.decision`.
   - Add Reel/Slack tactile visual strain effects.

5. **`src/ui/fishing/BasicFishingMinigameWidget.tsx`**
   - In `charging-cast`: Add highlighted sweet-spot tick mark / range on the cast power meter.
   - In `waiting-for-bite`: Add subtle bobber alert / water ripple pulse indicator so the screen is not completely blank while waiting for the bite.

6. **`src/ui/HUD.tsx`**
   - Delegate boat rendering to `MaritimeVesselConsole`.
   - Enhance `weather.hazard` into an authoritative maritime banner in the top-right cluster.

7. **`src/ui/GameUI.tsx`**
   - Import `CropInspection` from `src/ui/components/CropInspection`.
   - Connect `CatchInspectionModal` when `landedCatch` is present and player clicks or inspects the catch, or as the primary celebratory landing popover.

8. **`src/render/scene/WorldScene.ts` & `CropInstanceRenderer.ts`**
   - Connect `isFarmGisMode`: When `isFarmGisMode === true`, trigger GIS overlay rendering on farm plots (tinting `moistureBatch` instances or rendering an overlay plane reflecting moisture & fertility levels).

9. **`src/app/GameApp.ts`**
   - Pass camera-projected screen coordinates for `inspectedCrop` to `GameUI`.
   - Supply `landedCatch` with personal best record metadata (`record` from `FishLanded` event) to `CatchInspectionModal`.

---

## 3. Simulation DTO Dependencies & Data Flow

### R3 Data Dependencies

```
[Simulation / FarmingDomain]
  │ inspect(placedCropId)
  ▼
[CropInspectionDto]
  ├── placedCropId: PlacedCropId
  ├── cropId: CropId (names, atlas icons)
  ├── stage: CropStage ("planted" | "sprouting" | "growing" | "ready" | "overripe" | "withered")
  ├── stageTimingLabel: string ("Ready in about 40 minutes")
  ├── moisture: { value: number, band: "dry" | "normal" | "wet" }
  ├── soil: { fertility: number, band: "low" | "fair" | "good" }
  ├── work: WorkCostQuote
  └── immediateAction: { kind, label, cost, available, blockerReason }
  ▼
[CropInspection Component]
  └── Screen Positioning: projectWorldPoint(worldX, worldZ) via GameCamera
```

```
[Simulation / CargoDomain]
  │ FishLanded event: { cargoId, speciesId, weightKg, quality, record, minute }
  ▼
[FishCargoState + Record Metadata]
  ├── cargo: FishCargoState (weightKg, quality, freshness, caughtAtMinute)
  ├── species: FishSpeciesDefinition (name, baseMarketValue, weightKg range)
  ├── marketPrice: calculateFishPrice(species, weightKg, quality, freshness)
  ├── lengthCm: Math.round(Math.cbrt(weightKg / species.weightKg.average) * 60)
  └── recordBadge: "first" (New Species) | "weight" (Heaviest) | "quality" (Finest) | null
  ▼
[CatchInspectionModal & CatchSummaryToast]
```

### R4 Data Dependencies

```
[Simulation / FishingDomain & FishingEncounter]
  │ sampleSportFishingPresentation() & buildSportFishingHudDto()
  ▼
[SportFishingHudDto]
  ├── speciesId, speciesName, energyPercent (fish stamina)
  ├── distanceMeters: encounter.distanceMeters  <-- (TO ADD)
  ├── waterDepthMeters: encounter.dynamics.depthMeters  <-- (TO ADD)
  ├── rodDirectionAngle, steeringMagnitude
  ├── decision: { fishAction, response, action, key, icon, tone }
  ├── tensionPercent, tensionBands: { slackEndPercent, dangerStartPercent }
  ├── tensionTone: "slack" | "safe" | "danger"
  ├── lineIntegrityPercent, showLineWarning
  └── landingProgress (0..1 during landing window)
  ▼
[FishingHUD + CircularTensionGauge]
```

### R5 Data Dependencies

```
[Simulation / NavigationDomain & GameState.boats]
  │ buildWorldHudDto()
  ▼
[WorldHudBoatDto]
  ├── boatId, name ("Wooden Rowboat" / "Coastal Fishing Skiff")
  ├── speedKnots: Math.round(speed * 1.944)
  ├── headingDegrees: (headingRadians * 180 / PI + 360) % 360  <-- (TO ADD)
  ├── headingCardinal: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"  <-- (TO ADD)
  ├── registrationCode: "NV-01"  <-- (TO ADD)
  ├── seaState: "Calm" | "Swell" | "Rough"
  ├── seaWarning: string | null
  ├── hull: { current, maximum, percent, danger }
  ├── fuel: { current, maximum, percent, danger } | null
  └── cargoSlots: Array<{ slotNumber, cargo: WorldHudCargoDto | null }>
  ▼
[MaritimeVesselConsole]
```

---

## 4. Input Exclusivity & Modal Blocking

The survey verified the modal blocking architecture in `src/app/ModeController.ts` and `src/app/GameApp.ts`:

1. **Active Fishing Exclusivity**:
   - When `gameplayMode === "basic-fishing"` or `"sport-fishing"`, `ModeController.blocksHudOverlaysAndTools` returns `true`.
   - `allowsOverlayChange(modal, options)` blocks all HUD modals (`inventory`, `journal`, `market`, `map`, `ledger`) except `pause` (Escape menu) or `null` (close).
   - In `GameApp.openOverlayFromHotkey`: Pressing `I`, `J`, `M`, etc. during an active fight triggers a warning notice: `"Land the fish first"`.
   - This ensures the player cannot accidentally close or abandon an active encounter with an overlay.

2. **Modal Input Blocking**:
   - When any modal in `ModalStack` is active (`hasOverlay === true`), `blocksWorldInput` returns `true`.
   - In `GameApp.ts`: When `blocksWorldInput` is true, locomotion inputs, camera pointer rotation, tool actions, and interaction triggers (`[E]`) are ignored.
   - For boating: Opening a modal while driving halts helm control inputs, ensuring the boat does not veer off uncontrolled while inspecting menus.

3. **In-World Inspector Interactions**:
   - `CropInspection` is non-modal: it stays open while walking near the crop and automatically dismisses when the player moves out of range or presses `Escape`.
   - `CatchInspectionModal` is a celebratory modal overlay: closing it dismisses the inspection without blocking subsequent actions.

---

## 5. Concrete Implementation Recommendations

1. **Phase 1: Component Extraction & Refactoring**
   - Extract `CropInspection` from `GameUI.tsx` into `src/ui/components/CropInspection.tsx`.
   - Extract `hud-boat-panel` from `HUD.tsx` into `src/ui/components/MaritimeVesselConsole.tsx`.
   - Build `CatchInspectionModal` in `src/ui/components/CatchInspectionModal.tsx`.

2. **Phase 2: DTO Extensions in Simulation**
   - Extend `SportFishingHudDto` with `distanceMeters` and `waterDepthMeters`.
   - Extend `WorldHudBoatDto` with:
     - `isDocked: boolean;` (replacing the presentation heuristic `speedKnots === 0` which falsely hides navigation telemetry on stationary boats at sea).
     - `headingDegrees: number;`
     - `headingCardinal: string;`
     - `registrationCode: string;`
   - Update `FishingDomain.ts` and `WorldHudPresentation.ts` to populate these fields.

3. **Phase 3: Fishing Cockpit Visual Upgrades**
   - Build `CircularTensionGauge.tsx` and integrate into `FishingHUD.tsx`.
   - Add telemetry readouts (meters to boat, water depth) to `FishingHUD.tsx`.
   - Add sweet-spot indicator and bobber waiting alert to `BasicFishingMinigameWidget.tsx`.

4. **Phase 4: GIS & In-World Rendering**
   - Implement tile tinting in `WorldScene.ts` / `CropInstanceRenderer.ts` when `isFarmGisMode` is active.
   - Anchor `CropInspection` to projected world coordinates with safe viewport clamping.

5. **Phase 5: Verification & Acceptance Tests**
   - Fix typecheck errors:
     - In `src/ui/GameUI.tsx`: Pass `onSetDrag` to `FishingHUD`.
     - In `tests/unit/empirical_m5_overlays.test.ts`: Pass `onSetDrag` to `FishingHUD` test calls and provide required `dragNotch` in mock `FishingEncounterState`.
     - In `tests/simulation/fishingCargoFixes.test.ts` and `tests/unit/fishingPresentation.test.ts`: Include `dragNotch`.
   - Add dedicated unit tests in `tests/unit/mmo_complete_ui.test.ts` verifying all new and refactored components, circular tension gauge calculations, heading bearing conversions, and catch inspection telemetry.
   - Run `npm run typecheck` and `npm test` to guarantee zero regressions.
