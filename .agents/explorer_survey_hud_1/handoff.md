# Explorer 2 Survey Report: HUD, Overlays & Minigames
**Neva UI Modern-Medieval Overhaul**

## Executive Summary
This report provides a comprehensive, read-only architectural investigation of Neva's in-game Head-Up Display (HUD), split-corner UI layout, minigame interfaces (Basic & Sport Fishing), and gameplay overlays (Boat piloting, Farming seed carousel, GIS legend, Crop inspection, and Contextual toasts/hints). It maps existing structures, data contracts, simulation boundaries, and CSS rules, and specifies the exact transition plan to achieve the Clean Modern-Medieval aesthetic (The Witcher 3 / Manor Lords inspired) while preserving strict presentation-only determinism.

---

## 1. Observation

### 1.1 Source Files & Current Component Footprint
The HUD, minigames, and gameplay overlays are implemented across the following key files:

| File Path | Primary Responsibility | Key Sub-components / Hooks |
|---|---|---|
| `src/ui/HUD.tsx` | Main split-corners in-game HUD | Time/Weather clock widget, purse readout, severe weather chips, vitals tray (labor/sprint), boat driving panel, carried cargo note, interaction key prompt banner, 5-slot tool quickbar. |
| `src/ui/hud.css` (2374 lines) | HUD and global overlay CSS | Tray containers, hotbar slots, vitals meters, weather chips, boat panels, modal frames, toolbelt styling. |
| `src/ui/QuestTrackerHUD.tsx` | Pinned story/quest objective card | Collapsible quest header, progress track, location pin badge, "Open Horizons" fallback state. |
| `src/ui/FishingHUD.tsx` | Sport fishing encounter HUD | Fish profile header, distance meter, real-time behavior cue banner, line tension zone gauge, fish stamina bar, 3 tactile action buttons (`[W] Reel`, `[Space] Brace`, `[S] Slack`). |
| `src/ui/fishing/BasicFishingMinigameWidget.tsx` | Basic/starter fishing widget | 5-phase state machine: `charging-cast`, `bite-reaction`, `minigame` (water track, green catch bar, fish avatar, sunken treasure), `caught`, and `escaped`. |
| `src/ui/fishing/BasicFishingMinigame.css` | Basic fishing minigame styling | Water track, green bar, fish icon, cast bar, bite badge, summary plaque. |
| `src/ui/components/PlantingSeedBar.tsx` | Farming seed selector dock | Velvet seed carousel at bottom center, seed inventory quantities, seed selection, planting placement prompt. |
| `src/ui/components/FarmGISLegend.tsx` | Diegetic soil moisture/growth legend | Alt-key triggered legend showing GIS status badges (moist, dry, harvestReady, growing, prepared). |
| `src/ui/components/FarmForecastPopover.tsx` | Multi-hour weather forecast popover | 3-slot weather forecast (`Now`, `+2h`, `+5h`), precipitation %, wind knots, sea roughness %. |
| `src/ui/ContextualHintCard.tsx` | Mechanics tutorial toast card | Auto-dismissing tutorial hint with compass icon and `[Esc]` dismiss handler. |
| `src/ui/components/CatchInspectionModal.tsx` | Landed sport fish summary toast | Transient catch record with fish species, weight, quality stars, storage location, and harbor market price estimate. |
| `src/ui/GameUI.tsx` (Lines 440–556) | In-world contextual overlays | `CropInspection` popup (growth, soil moisture, climate fit, fertility, expected yield, labor cost) and `FarmingActionStatus` progress bar. |
| `src/ui/chrome/Chrome.tsx` | Tactical chrome primitives | `ChromePanel`, `ChromeButton`, `ChromeMeter`, `ChromeSlot`, `ChromeKeycap`, `ChromeDivider`, `ChromeQuality`, `ChromeWaxSeal`, `ChromeRibbon`. |
| `src/ui/chrome/uiAtlas.ts` & `uiAtlas.generated.ts` | 2D Sprite atlas resolvers | Simulation ID to sprite URL mappings (`atlasForFish`, `atlasForWeather`, `atlasForTime`, `atlasForCrop`, `atlasForSeedItem`, `atlasForTool`, `atlasForAction`, etc.). |

---

### 1.2 Classic RPG Split-Corners Layout Audit (Current vs R2 Requirement)

#### Direct Comparison Matrix:
```
+---------------------------------------------------------------------------------------------------+
| TARGET REQUIREMENT (R2)                           | CURRENT IMPLEMENTATION IN HUD.tsx             |
+---------------------------------------------------------------------------------------------------+
| TOP-LEFT:                                         | TOP-LEFT: (MISALIGNED)                        |
| - Celestial Sun/Moon time dial                    | - Severe weather warning chips                |
| - Weather glyph & forecast trigger                | - Pinned Quest Tracker (QuestTrackerHUD)      |
| - Temperature readout (°C)                        |                                               |
| - Purse & Gold medallion (G)                      |                                               |
+---------------------------------------------------------------------------------------------------+
| TOP-RIGHT:                                        | TOP-RIGHT: (MISALIGNED)                       |
| - Pinned Quest Tracker (parchment/ribbon header)  | - Weather Icon & Clock widget                 |
| - Collapsible objectives & progress               | - Time & Season/Day readout                   |
| - Severe weather warning chips                    | - Purse & Gold counter                        |
| - Game Menu button ([Esc])                        | - Game Menu button (Esc)                      |
+---------------------------------------------------------------------------------------------------+
| BOTTOM-LEFT:                                      | BOTTOM-LEFT & FLOATED:                        |
| - Vitals & Status cluster (Curved/metered Labor   | - Labor & Sprint vertical meter boxes         |
|   & Sprint Stamina bars)                          | - Low Labor note (floated right)              |
| - Active Boat Hull integrity indicator            | - Boat panel (floated right)                  |
| - Low Labor alert badges                          | - Carried Fish note (floated right)           |
+---------------------------------------------------------------------------------------------------+
| BOTTOM-CENTER:                                    | BOTTOM-CENTER:                                |
| - Ornate Tool Hotbar (Slots 1-5, embossed nums,   | - 5-slot toolbelt with brown background       |
|   active glow, velvet wells)                      | - Interaction prompt banner                   |
| - Contextual Keycap Banner ([E], [Space])         |                                               |
+---------------------------------------------------------------------------------------------------+
```

#### Detailed Observation of Split-Corner Components:
1. **Top-Left (Clock, Weather, Temp, Purse)**:
   - In `HUD.tsx` (lines 151–176), the clock, weather icon, season/day, time, and purse are currently wrapped in `.hud-clock-widget` and placed inside `.hud-top-right-cluster`.
   - The weather button triggers `FarmForecastPopover` (`src/ui/components/FarmForecastPopover.tsx`).
   - The temperature is currently formatted in the title attribute (`${Math.round(weather.temperatureC)}°`) rather than rendered as an illuminated readout on the HUD surface.
   - The purse is rendered as a small inline badge (`.hud-purse-note`) with `IconCoin` and `player.money.toLocaleString() G`.

2. **Top-Right (Pinned Quest Tracker & Weather Alerts)**:
   - In `HUD.tsx` (lines 129–138), the Quest Tracker is placed inside `.hud-top-left-container`.
   - `QuestTrackerHUD.tsx` displays active quest title, objective description, progress bar (`current / target`), target location (`📍 Harbor Dock`), and a collapse toggle button.
   - Severe weather alert (`severeAlert` in `HUD.tsx` lines 88–94) checks for storm, dense fog (`visibility < 0.5`), high winds (`>= 11 m/s`), and rough water (`seaRoughness >= 0.7`).

3. **Bottom-Left (Vitals, Status & Boat Cluster)**:
   - In `HUD.tsx` (lines 275–303), `.hud-bottom-left .hud-vitals` contains `.hud-vitals-tray` with two vertical `ChromeMeter` instances: Labor (`max = player.workCapacity.maximum`, `value = player.workCapacity.current`) and Sprint Stamina (`player.traversal.sprintStamina`).
   - Low Labor note (`.hud-labor-note`, line 197) and Carried Fish note (`.hud-cargo-note`, line 206) are currently floated at the bottom-right in `.hud-context-statuses`.
   - Boat panel (`.hud-boat-panel`, lines 218–273) is currently floated on the bottom-right above the status cluster.

4. **Bottom-Center (Tool Hotbar & Context Interaction)**:
   - In `HUD.tsx` (lines 305–356), `.hud-play-cluster` contains the contextual prompt (`.interaction-prompt` with `KeycapBadge` and banner text) and `.hud-tool-belt` with 5 quickbar slots:
     - Slot 1: Hand tools / Hoe (`IconHoe`)
     - Slot 2: Seeds (`IconSprout`)
     - Slot 3: Watering can (`IconWateringCan`)
     - Slot 4: Fishing bait (`IconBait`)
     - Slot 5: Fishing rod (`IconRod`)
   - `parsePrompt` (lines 39–51) handles parsing string inputs like `[E] Harvest Crop` or `[Space] Hook fish`.

---

### 1.3 Gameplay Overlays & Minigames Audit

#### A. Basic Fishing Minigame (`BasicFishingMinigameWidget.tsx` & `BasicFishingMinigame.css`)
- **State Machine**: Driven by `state.basicFishing` (`BasicFishingState`).
- **Phases**:
  1. `charging-cast`: `castPower` (0.0–1.0), animated power meter, Release `[Space]` hint.
  2. `bite-reaction`: Pulsing red/crimson bite alert badge, `[Space]` Hook Set prompt.
  3. `minigame`: Vertical water column (`water-track`, 44px wide x 280px tall), player catch bar (`green-catch-bar`, `barY`, `barHeight`), swimming fish (`fish-avatar`, `fishY`), sunken treasure chest (`treasure-chest-icon`, `treasureY`, `treasureProgress`), and catch progress gauge (`catch-progress-track`, `catchProgress`).
  4. `caught`: Fish landed modal plaque, 72px species avatar (`atlasForFish`), quality star (`ChromeQuality`), perfect catch bonus indicator, treasure recovery tag, `Collect [Space]` button.
  5. `escaped`: Slipped hook modal plaque with species preview and dismiss action.
- **CSS Audit**: `BasicFishingMinigame.css` currently contains three overlapping historical styling layers (lines 25–370: dark glass/modern; lines 371–558: field journal; lines 597–787: modern paper). A unified Modern-Medieval dark slate/brass theme is required.

#### B. Sport Fishing HUD (`FishingHUD.tsx`)
- **State Interface**: `FishingEncounterState`.
- **Components**:
  1. Hooked fish plaque: Species icon (`atlasForFish`), species name, weight (kg), quality badge (`ChromeQuality`), and line distance (`distanceMeters.toFixed(1) m`).
  2. Dynamic Behavior Cue Banner: Real-time feedback (`run-left`, `run-right`, `dive`, `surface`, `burst`, `shake`, `rest`/`tiring`) with `atlasForBehavior` icon, directional instructions, and keycap badges.
  3. Tension Gauge: 3 colored tension zones (`Slack <15%`, `Optimal Range 15-75%`, `Danger >75%`), animated needle indicator, critical tension alerts.
  4. Fish Stamina Bar: Progress bar showing fish stamina depletion.
  5. 3 Tactile Action Buttons: `Reel [W]`, `Brace [Space]`, `Slack [S]` with active pressed states and pointer capture.

#### C. Boat Piloting HUD (`HUD.tsx` lines 218–273)
- **State Interface**: `player.activeBoatId` -> `state.boats[activeBoatId]`.
- **Readouts**:
  - Boat Type Name & Icon (`boatDef.name`, `IconBoat`).
  - Speed in knots (`Math.round(activeBoat.speed * 1.944) kn`).
  - Sea State Condition (`Calm` <0.35, `Swell` 0.35–0.70, `Rough` >=0.70).
  - Night Waters warning chip if dusk or night.
  - Hull Integrity: `ChromeMeter` (0–100%, warning red < 30%).
  - Boat Cargo Hold Grid: Slots for each cargo slot ID with fish sprite (`atlasForFish`), `ChromeQuality` badge, and **Freshness Bar** (`freshness > 65%` green, `35-65%` amber, `< 35%` red).

#### D. Farming & Seed Dock (`PlantingSeedBar.tsx`)
- **Trigger**: Mode is `"farm-placement"`.
- **State**: Queries `state.inventories[player.inventoryId]` for available seed items.
- **Components**: Docked horizontal carousel of seed slots (`ChromeSlot` with seed sprite, quantity badge, selected state), selected crop metadata (likes/climate preferences), `Cancel [Esc]` button, `Place [LMB]` key hint.

#### E. Farm GIS Legend (`FarmGISLegend.tsx`)
- **Trigger**: `isFarmGisHeld` (Alt key).
- **Badges**: Moist (`UI_GIS.moist`), Dry (`UI_GIS.dry`), Harvest Ready (`UI_GIS.harvestReady`), Growing (`UI_GIS.growing`), Prepared Soil (`UI_GIS.prepared`).

#### F. Crop Inspection Plaque (`CropInspection` in `GameUI.tsx` lines 440–524)
- **Trigger**: `inspectedCrop: CropInspectionDto`.
- **Details**: Crop name, stage chip (`Sprout`, `Growing`, `Mature`, `Withered`), crop sprite (`atlasForCrop`), Growth status (minutes remaining / ready), Soil moisture band (`dry`, `ideal`, `wet`), Climate fit (`Optimal (Fast Growth)` vs `Challenging (Slower)`), Soil fertility band, Expected yield (`min–max units`), Labor cost, Depleted labor warning.

#### G. Contextual Notifications & Toasts
- `ContextualHintCard.tsx`: Tutorial cards auto-dismissing after 7s or on `[Esc]`.
- `hud-toast-container` / `hud-toast-pill`: Center-top game toasts ("Saved", "Purchased · 50 G", "Sold for 120 G", "Contract complete: +500 G").
- `CatchSummaryToast` in `CatchInspectionModal.tsx`: Landed fish inspection toast with species, weight, quality, storage location, harbor value estimate, and freshness %.

---

### 1.4 Verification of Simulation Boundaries & Props
All examined UI components strictly follow the presentation-only architecture:
- Zero simulation state mutations occur in UI components.
- Actions are dispatched via standard callbacks:
  - `onSelectToolSlot(slot)` -> `GameApp.selectToolSlot`
  - `onSetFishingInput(input)` -> `GameApp.hudFishingHold` / `applySportFishingInput`
  - `onHookBasicFishingBite()` -> `sim.execute({ type: "fishing.hook-bite-basic" })`
  - `onSetBasicFishingInput(isHolding)` -> `sim.execute({ type: "fishing.control-basic", isHolding })`
  - `onReleaseBasicFishingCast(power)` -> `GameApp.releaseBasicFishingCast`
  - `onSelectPlantCrop(cropId)` -> `GameApp.enterCropPlacement`
  - `onCancelPlacement()` -> `GameApp.exitCropPlacement`
  - `onSetActiveModal(modal)` -> `GameApp.setActiveModal`
- All visual computations (time strings, season math, temperature formatting, weather icons, freshness tone classes, tension gauge percentages) are pure idempotent functions.

---

## 2. Logic Chain

1. **Premise 1 (R2 Layout Alignment)**: The prompt requirement R2 specifies that the in-game HUD must follow the Classic RPG Split-Corners architecture:
   - Top-Left: Celestial Sun/Moon time dial, weather glyph, temperature readout, purse/gold medallion.
   - Top-Right: Pinned Quest Tracker, parchment ribbon header, collapsible objectives, weather warnings.
   - Bottom-Left: Vitals/Status cluster (Labor & Sprint Stamina curved/metered bars, boat hull indicator, low labor alerts, carried cargo note).
   - Bottom-Center: Ornate tool hotbar, embossed slot numbers, active glow, contextual keycaps.
   *Observation Reference*: In current `HUD.tsx`, Clock/Weather/Purse are in Top-Right and Quest Tracker is in Top-Left. Furthermore, boat status and cargo notes are floated separately on the right.
   *Inference*: Swapping Top-Left and Top-Right in `HUD.tsx`, and consolidating boat status, carried cargo, and labor alerts into the Bottom-Left cluster will directly fulfill Requirement R2 without breaking any simulation contracts.

2. **Premise 2 (Modern-Medieval Theme & Tactile Chrome System - R1 & R4)**:
   *Observation Reference*: The existing HUD and minigames use flat beige parchment boxes (`--hud-tray: rgba(245, 242, 233, 0.96)`) and brown wells (`--hud-well: #3a281c`), with conflicting CSS declarations in `BasicFishingMinigame.css` and `hud.css`.
   *Inference*: Updating the chrome tokens to dark slate (`#141b24`, `#1a2330`) with fine timber trim (`#3a2618`), gold filigree borders (`#c4a46a`, `#e6c678`), velvet slot wells (`#0f141c`), and brass divider rules will establish the desired Witcher 3 / Manor Lords inspired aesthetic across all HUD elements, minigames, and overlays.

3. **Premise 3 (Atlas Sprite Cohesion)**:
   *Observation Reference*: `public/assets/ui/atlas` contains high quality sprite assets for actions, behaviors, fish species, GIS badges, growth stages, tools, time of day, and weather.
   *Inference*: All HUD components must consistently render these sprites via `AtlasImage` and `uiAtlas.ts` resolvers with drop-shadow highlights and ornate bezels, ensuring zero sprite distortion.

4. **Premise 4 (Minigame Experience & Playability)**:
   *Observation Reference*: The Basic Fishing minigame relies on a vertical water track where the player holds Space/pointer to control `green-catch-bar` and keep the swimming `fish-avatar` inside it. The Sport Fishing HUD relies on real-time tension management and behavior cues.
   *Inference*: Minigame visual upgrades must retain exact coordinate mechanics (`barY`, `barHeight`, `fishY`, `lineTension`, `distanceMeters`, `staminaPercent`) while elevating frames to dark slate plaques with gilded water column borders and illuminated needle gauges.

---

## 3. Caveats & Non-Goals

1. **Non-Goal: Modals Implementation**: Full modal windows (Inventory, Market, Journal Folio, World Map, Logistics Ledger, Dialogue, Escape Menu) are surveyed by Explorer 1 and implemented by modal specialists. This survey focuses strictly on `HUD.tsx`, split-corners, gameplay overlays, minigames, seed dock, GIS legend, inspection plaques, and toasts.
2. **Frame-Rate Performance Sensitivity**: `GameApp.ts` re-renders `GameUI` on each animation frame (`this.uiRoot.render(...)`). All newly introduced CSS animations, SVG dials, or canvas/meter elements must avoid forced reflows or heavy garbage collection. Meters and progress bars should use CSS transforms (`translate`, `scale`, `width`, `height`) and `will-change` attributes.
3. **Keyboard & Pointer Capture Precedence**: Basic fishing and sport fishing intercept keyboard (`Space`, `W`, `S`, `A`, `D`, `E`, `F`, `C`) and pointer capture. These handlers must release immediately when modals open or on window blur to avoid stuck inputs.
4. **Mobile / Touch Safe Areas**: All split corner clusters must strictly respect CSS safe area insets (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, `env(safe-area-inset-left)`, `env(safe-area-inset-right)`).

---

## 4. Conclusion & Detailed Implementation Plan

### 4.1 Component Breakdown & Refactoring Specification

#### 1. `src/ui/HUD.tsx` Refactoring:
- **Top-Left Container (`.hud-top-left-cluster`)**:
  - Celestial Dial / Clock Widget:
    - Circular or arched celestial medallion with rotating/glyph Sun/Moon icon (`UI_TIME.sun`, `UI_TIME.moon`, `UI_TIME.dawn`, `UI_TIME.dusk`).
    - Digital time readout (`HH:MM`) in tabular serif/sans numbers.
    - Season name & Day (`Spring 12`).
    - Weather Glyph: Integrated weather icon (`atlasForWeather(weather.type, timeOfDay)`).
    - Temperature Readout: Crisp Celsius display (e.g. `18°C`) with thermometer icon (`UI_WEATHER.thermometer`).
    - Purse / Gold Medallion: Gold coin emblem (`UI_STATUS.coin`), embossed gold medallion plate, tabular formatted gold balance (`1,450 G`).
    - Clicking the weather/clock widget toggles `FarmForecastPopover`.
- **Top-Right Container (`.hud-top-right-cluster`)**:
  - Pinned Quest Tracker (`QuestTrackerHUD`):
    - Clean dark slate plaque with gold leaf ribbon header (`ChromeRibbon`).
    - Active quest title (`activeQuest.questTitle`) or "Open Horizons".
    - Objective description with progress bar (`current / target`) when `targetQuantity > 1`.
    - Target location pin chip (`📍 Harbor Dock`).
    - Smooth collapsible chevron toggle (`[▾] / [▸]`).
  - Severe Weather Warning Chips:
    - Storm (`hud-weather-chip--danger`), Dense Fog, High Winds, Rough Water (`hud-weather-chip--caution`).
  - Menu Button (`.hud-menu-button`):
    - Ornate circular brass/slate medallion button with `IconMenu` for opening the Escape/Pause Menu (`[Esc]`).
- **Bottom-Left Container (`.hud-bottom-left-cluster`)**:
  - Vitals Tray (`.hud-vitals-tray`):
    - Labor Meter (`.hud-labor-meter`): Stylized metered gauge with glowing amber/gold liquid fill, `IconEnergy` icon, numeric/percentage tooltip.
    - Sprint Stamina Meter (`.hud-sprint-meter`): Metered bar with emerald/cyan fill, automatically appearing during sprint/exhaustion, displaying "Winded" danger state when exhausted.
    - Low-Labor Notification Chip: Docked alert badge when labor < 20 (`Low Labor: 14/100`).
  - Active Boat Status (`.hud-boat-panel`):
    - Docked in Bottom-Left when `player.activeBoatId` is present.
    - Boat name & icon (`IconBoat`), speed in knots (`kn`), sea condition (`Calm` / `Swell` / `Rough`), night waters caution chip.
    - Hull Integrity bar (`durability %`).
    - Boat Cargo Hold Grid: Velvet slots with fish species sprites, quality stars, and illuminated freshness progress bars (emerald -> amber -> terracotta gradient).
  - Carried Fish Cargo Plaque:
    - Docked in Bottom-Left when `player.carriedFishCargoId` is present.
    - Species avatar, weight (kg), freshness bar, quality star.
- **Bottom-Center Container (`.hud-bottom-center-cluster`)**:
  - Contextual Interaction Prompt:
    - Floating banner above toolbelt with dark slate translucency, gold border, embossed keycaps (`[E]`, `[Space]`, `[F]`).
    - Special crimson/gold pulsing styling for fishing bite alerts (`[Space] Hook the fish!`).
  - Tool Hotbar (`.hud-tool-belt`):
    - 5 velvet-lined slots (Hoe, Seeds, Watering Can, Bait, Rod).
    - Embossed brass slot numeral badges (1..5).
    - Active slot styling: Gold filigree border, radiant ambient glow (`box-shadow: 0 0 14px rgba(212, 168, 83, 0.5)`), upward elevation (`translateY(-3px)`).

---

#### 2. Minigames & Overlays Refactoring:
- **`BasicFishingMinigameWidget.tsx` & `BasicFishingMinigame.css`**:
  - Remove all legacy/conflicting CSS rules; consolidate into unified Modern-Medieval slate/brass styling.
  - Cast Power: Dark slate plaque with gold border, emerald-to-crimson power meter fill, `[Space]` keycap hint.
  - Bite Alert: Dramatic crimson velvet banner with gold border and pulsing exclamation badge.
  - Minigame Track: Gilded water column with clear coastal water gradient, green catch bar with velvet texture, swimming fish sprite, sunken treasure chest with progress ring, and catch progress meter on right.
  - Catch Summary & Escaped: Ornate gold-framed plaque with large 72px fish sprite, quality stars, perfect catch bonus ribbon, and gold `Collect [Space]` button.
- **`FishingHUD.tsx`**:
  - Modern-Medieval dark slate plaque with brass corner rivets.
  - Illuminated tension gauge with 3 distinct zones (Slack, Optimal, Danger) and diamond needle.
  - Fish stamina bar with blood-red to golden fatigue gradient.
  - Tactile action buttons (`Reel [W]`, `Brace [Space]`, `Slack [S]`) with gold keycaps and active press animations.
- **`PlantingSeedBar.tsx`**:
  - Docked velvet seed carousel with curved wooden cradle and brass trim.
  - Seed cards with botanical framing, quantity counter badge, and gold selection glow.
- **`FarmGISLegend.tsx` & `CropInspection` (in `GameUI.tsx`)**:
  - Herbalist/almanac plaque styling with dark slate translucency, gold leaf flourishes, and crisp definition badges.
- **`ContextualHintCard.tsx` & Toast Notifications**:
  - Dark slate & gold-leaf toast banner with smooth slide/fade entrance and clean serif typography.

---

### 4.2 Data Contracts & Props Specification
The table below specifies the complete props contract for all surveyed components:

| Component | Props Interface | Key Properties & Types | Callback Contracts |
|---|---|---|---|
| `HUD` | `HUDProps` | `state: GameState`, `promptText: string \| null`, `toastMessage?: string \| null`, `activeQuest?: ActiveQuestDto \| null`, `activeToolSlot?: number`, `isPlacementActive?: boolean` | `onSelectToolSlot?: (slot: number) => void`, `onOpenMenu?: () => void` |
| `QuestTrackerHUD` | `QuestTrackerHUDProps` | `activeQuest: ActiveQuestDto \| null` | `onOpenDialogue?: (npcId: string) => void` |
| `BasicFishingMinigameWidget` | `BasicFishingMinigameWidgetProps` | `fishingState: BasicFishingState` (`phase`, `castPower`, `fishY`, `barY`, `barHeight`, `catchProgress`, `isPerfect`, `hasTreasure`, `treasureY`, `treasureProgress`, `treasureCaught`, `catchItemId`, `quality`) | `onHookBite?: () => void`, `onSetInput?: (isHolding: boolean) => void`, `onReleaseCast?: (power?: number) => void`, `onDismissModal?: () => void` |
| `FishingHUD` | `FishingHUDProps` | `encounter: FishingEncounterState` (`fish`, `distanceMeters`, `lineTension`, `stamina`, `maxStamina`, `behavior`, `isReeling`, `isSlacking`, `isBracing`, `rodDirectionAngle`) | `onSetInput: (input: { isReeling: boolean; isSlacking: boolean; isBracing: boolean; rodDirectionAngle: number }) => void` |
| `PlantingSeedBar` | `PlantingSeedBarProps` | `state: GameState`, `selectedCropId: string \| null` | `onSelectCrop: (cropId: string) => void`, `onCancel: () => void` |
| `FarmGISLegend` | `FarmGISLegendProps` | `visible: boolean` | None |
| `FarmForecastPopover` | `FarmForecastPopoverProps` | `weather: WeatherState`, `clock: ClockState` | `onClose: () => void` |
| `ContextualHintCard` | `ContextualHintCardProps` | `hintId: string`, `title: string`, `message: string`, `icon?: string` | `onDismiss: (hintId: string) => void` |
| `CatchSummaryToast` | `CatchSummaryToastProps` | `cargo: FishCargoState`, `harborMarket?: MarketState \| null` | `onDismiss: () => void` |
| `CropInspection` | `{ inspection: CropInspectionDto }` | `inspection: CropInspectionDto` (`name`, `cropId`, `stage`, `approximateMinutesRemaining`, `moisture`, `climate`, `soil`, `expectedYield`, `work`) | `onClose?: () => void` |

---

## 5. Verification Method

To independently verify the survey findings and subsequent implementation:

1. **Typecheck Verification**:
   ```bash
   npm run typecheck
   ```
   Must pass with 0 errors across all UI files and component props.

2. **Asset & Atlas Synchronization**:
   ```bash
   npm run assets:sync
   ```
   Must confirm atlas catalog manifests and generated sprite maps are in sync.

3. **Production Build Verification**:
   ```bash
   npm run build
   ```
   Must compile cleanly without Vite bundling or CSS parse errors.

4. **Runtime & Browser Layout Inspection**:
   - Verify Top-Left displays celestial sun/moon dial, weather glyph, temperature readout, and purse.
   - Verify Top-Right displays pinned quest tracker with ribbon header, collapsible objectives, and weather warnings.
   - Verify Bottom-Left displays vitals tray (labor & sprint stamina curved/metered bars), boat hull indicator when boating, and low labor alert.
   - Verify Bottom-Center displays tool quickbar slots 1–5 with active tool gold glow and contextual interaction prompts.
   - Test basic fishing minigame through all 5 phases (cast, bite, water track reeling, catch, escape).
   - Test sport fishing encounter tension gauge, behavior cues, and action buttons.
   - Test seed placement dock (`[2]` tool slot), GIS overlay (`[Alt]`), and crop inspection.
