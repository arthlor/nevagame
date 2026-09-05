# Architectural Analysis: MMO Windows, Folio/Almanac, System Overlays & Verification (R6, R7, R8 & Verification)

**Author:** explorer_survey_m0_3  
**Date:** 2026-09-03  
**Scope:** R6 (Dockable MMO Windows & Inventories), R7 (Folio, Almanac & Expedition Planners), R8 (System Overlays, Title Screen & Dev Tooling), and Verification Infrastructure (`mmo_complete_ui.test.ts`, Viewport Budget Audit, Simulation DTO Purity).

---

## 1. Executive Summary

This survey provides a comprehensive architectural and technical map for upgrading Neva's UI into an ArcheAge/Palia-inspired cozy MMO interface system while strictly maintaining:
1. **World-First Aesthetics**: Persistent screen coverage rigorously audited at `<20-25%` across standard 1080p and 720p viewports.
2. **Canonical Simulation Ownership**: 100% read-only presentation DTO consumption; zero gameplay formula recalculation or direct state mutation inside presentation components.
3. **No-Combat Gameplay Loop**: Cohesive progression binding farming, logistics, market arbitrage, sport fishing, and maritime expeditions.

While milestones M1–M5 established strong visual foundations (ornate slate/gold styling, basic/sport fishing widgets, initial modals), substantial MMO-grade capabilities remain missing or partially implemented. Most notably:
- Companion side-by-side window docking does not yet exist (modals open in isolation centered on screen).
- Search bars, auto-sort mechanisms, and rich floating MMO inspect cards are absent.
- The Field Journal lacks a dedicated Contracts Board tab and a complete Coastal Almanac encyclopedia.
- The Audio configuration menu exposes only 4 channels, leaving Weather and Fishing uncalibrated despite existing audio graph gain nodes.
- Bottom-left Activity Feed / Coastal Chronicle is missing entirely.
- Mobile touch targets in modals and small viewport media queries drop to 44px, violating the `>= 48px` standard.
- No unified verification suite exists that tests all R1–R8 areas, enforces viewport budgets, and validates DTO purity.

---

## 2. Current State vs. Missing / Overhaul Requirements

### R6. Side-by-Side Dockable MMO Windows & Inventories

#### 1. Satchel Inventory (`src/ui/InventoryModal.tsx`)
- **Current State:**
  - Has category ribbon tabs: `[All]`, `[Field]` (`farming`), `[Fishing]`, `[Supplies]`.
  - Has capacity indicator (`inventory-capacity-pill` displaying `occupied / total`).
  - Implements a 4-column item slot grid with keyboard navigation (`handleGridKeyDown`).
  - Has an inline right sidebar `.inventory-details-card` showing static item attributes.
- **Missing / Overhaul Needed:**
  - **Auto-Sort Button:** Missing 1-click sort functionality (sort by category, name, value, quantity, or auto-consolidate stacks).
  - **Search Bar:** Missing item search input filter in header/toolbar to filter items by name/tag in real time.
  - **ArcheAge Physical Cargo Representation:**
    - Heavy physical trade packs / trophy fish cargo carried on the player's back vs lightweight stackable satchel goods.
    - Needs distinct visual frames, badges (e.g. `[Cargo Pack]`), movement speed penalty cues (`-20% Run Speed`), and slot segregation.
  - **Rich MMO Item Inspect Cards:**
    - Replaces/augments the inline sidebar with floating/dockable cursor inspect cards featuring:
      - Rarity frame: Common (ivory), Fine (green), Rare (blue), Master (purple), Legendary (gold).
      - Freshness decay timeline / bar (for fish, perishables, chum, bait).
      - Soil/season requirements (for crops/seeds: e.g., Season: Spring, Soil: Moist, Water Need: 15, Fertility Cost: 8).
      - Base trade value in Gold ("Market Base: 50 G").
      - Lore / flavor text sourced from `ContentRegistry`.

#### 2. Companion Docking (Trade & Storage)
- **Current State:**
  - `MarketModal` and `LogisticsLedgerModal` currently open as single centered modal overlays (`.modal-overlay.interactive`), hiding the Satchel.
  - In `MarketModal`, "Your goods" is an internal list of sellable commodities duplicated from the satchel (`board.sellRows`), rather than rendering the live Satchel window side-by-side.
  - In `LogisticsLedgerModal`, stores and vessel bays are displayed in read-only format without interactive transfer controls.
- **Missing / Overhaul Needed:**
  - **Side-by-Side Docking Layout:**
    - On desktop (`>= 1024px`), opening Market Stall or Logistics Ledger opens a dual-window docked layout: Vendor/Ledger on the left, Satchel on the right.
    - Responsive stacking on mobile/tablet portrait viewports.
  - **Market Stalls (`src/ui/MarketModal.tsx`):**
    - Dynamic price quotes with clear demand status chips (`Wanted`, `Steady`, `Plentiful`).
    - Local supply/demand trend graph / sparkline indicator showing market trajectory.
    - Bulk "Sell All Produce" button with armed confirmation above threshold (`BULK_CONFIRM_THRESHOLD_G = 200 G`).
    - Seed Shop (Village) and Tackle/Rod Equipment Shop (Harbor) with side-by-side tier comparison cards (rod durability, line strength, allowed habitats, max cargo class).
    - Contract hand-in integrated directly with companion satchel selection.
  - **Boat Hold & Warehouse Storage (`src/ui/components/LogisticsLedgerModal.tsx`):**
    - Multi-vessel fleet overview (Wooden Rowboat, Motor Skiff, future cutters).
    - Spatial cargo hold bays with real-time freshness decay bars.
    - Warehouse / farm storage inventory stock display.
    - **1-Click Transfer:** Dedicated transfer buttons / click handlers between Satchel slots and Hold/Storage bays.

---

### R7. Folio, Almanac & Expedition Planners

#### 1. Field Journal Folio (`src/ui/JournalModal.tsx`)
- **Current State:**
  - Features 4 folios: `story`, `records`, `skills`, `guide`.
  - `story`: Active quest narrative and collapsible completed story log.
  - `records`: Standing records board and caught fish/crops.
  - `skills`: Progress meters for farming, fishing, processing, trading.
  - `guide`: Integrates `HowToPlayGuide.tsx`.
- **Missing / Overhaul Needed:**
  - **Contracts Board Tab:** Currently contracts only appear inside `MarketModal` as "Posted orders". A dedicated folio tab is required in `JournalModal` allowing players to inspect live delivery orders, deadlines, profit margins, and turn-in targets from anywhere in the world.
  - **Coastal Almanac (Fish & Crop Encyclopedias):**
    - Comprehensive Fish Encyclopedia: Lists all 15 species from `ContentRegistry.fishSpecies`, detailing habitats, bait preferences, weather/time preferences, weight records, and silhouette/mystery states for undiscovered species.
    - Comprehensive Crop Almanac: Lists all 10 crops from `ContentRegistry.crops`, detailing growth duration, water needs, fertility costs, preferred climates, expected yields, and regrow cycles.
  - **Proficiencies / Skills Rank Progression:**
    - Formatted as MMO proficiency rank bars for Agriculture, Angling, Seamanship, and Commerce, showing rank badges (Novice, Apprentice, Journeyman, Artisan, Master, Grandmaster) and upcoming rank unlocks.
  - **How-to-Play Guide & Controls Reference:**
    - Cohesive integration of `HowToPlayGuide.tsx` and `ControlsReference.tsx` with clear chapter navigation and clean typography.

#### 2. Nautical Chart Modal (`src/ui/components/WorldMapModal.tsx`)
- **Current State:**
  - SVG nautical chart of Neva & Sunreach islands with roads, waterways, player beacon ("YOU"), and compass rose.
  - Four lenses: `geography`, `markets`, `fishing`, `farmland`.
- **Missing / Overhaul Needed:**
  - **Active Fishing Schools:** Display known or active fish schools on the chart (bound to `state.world.activeSchools`).
  - **Player Waypoint System:** Interactive map clicking to place/clear custom navigational waypoints that project onto the top-right nautical compass radar.
  - **Regional Market Demand Heatmap:** Visual color overlays or badges across market nodes highlighting regional price disparities and arbitrage opportunities.

#### 3. Expedition Board Modal (`src/ui/ExpeditionBoard.tsx`)
- **Current State:**
  - Displays posted opportunities (Steady / Bold) with destination, return gold, deadline, readiness strip (vessel, supplies, weather), and blocker checklist.
- **Missing / Overhaul Needed:**
  - **Maritime Voyage Planner:** Visual sea route maps with charted paths, danger ratings (Calm, Swell, Rough Gale), required crew/cargo thresholds, and tiered expedition rewards.

---

### R8. System Overlays, Title Screen & Dev Tooling

#### 1. Pause & System Menu (`src/ui/EscapeMenuModal.tsx`)
- **Current State:**
  - Menu actions: Resume, Satchel, Journal, Map, Ledger, Expedition, Settings, Save now, Safe Return.
  - Settings tabs: Graphics, Audio, Interface, Controls.
- **Missing / Overhaul Needed:**
  - **Emergency Safety Actions:**
    - Currently only has "Safe Return" (resets player to starter garden).
    - Needs "Emergency Tow / Recall Boat" (recalls boat to nearest harbor dock, binding to `boat.emergency-tow` command).
  - **Autosave Health Indicator:**
    - Visual badge/indicator showing last autosave timestamp, storage engine status (IndexedDB), and backup state.
  - **Audio Calibration Sliders (6 Independent Buses):**
    - Currently only exposes: Master, Music, Effects (`sfx`), Ambience.
    - Missing sliders for: **Weather**, **Fishing**, and **UI**.
    - *Critical finding:* `src/audio/AudioManager.ts` already contains internal `GainNode`s for `uiGain`, `fishingGain`, `weatherGain`, `ambienceGain`, `sfxGain`, `musicGain`, and `masterGain`! However, `src/audio/AudioSettings.ts` and `AudioControls` in `EscapeMenuModal.tsx` only expose 4 channels. Expanding `AudioSettings` to include `weather`, `fishing`, and `ui` is straightforward and aligns with the existing audio graph.
  - **Graphics Quality Presets:**
    - Exposes Low, Medium, High, and Ultra presets with live renderer adaptation.
    - *Note on Ultra:* `src/render/config/VisualRenderConfig.ts` currently defines `QualityTier = "low" | "medium" | "high"`. Ultra should either map to high with max shadow map (2048/4096) and DPR, or `QualityTier` should be extended cleanly.

#### 2. Title Screen & Save Recovery (`src/ui/StartScreen.tsx`, `SaveRecoverySheet`)
- **Current State:**
  - Start screen with Begin / Continue / Start New Game, progress bar for asset loading, and save overview card.
  - `SaveRecoverySheet` in `GameUI.tsx` provides recovery options for corrupted/incompatible saves.
- **Missing / Overhaul Needed:**
  - Enriched save overview showing gold purse, day/season badge, playtime, and farm development stage.
  - Hardened save recovery sheet with fail-safe dual-confirmation dialogs.

#### 3. Activity Feed & Coastal Chronicle (Bottom-Left)
- **Current State:**
  - Non-existent! Only top-center `NoticeStack` toasts exist.
- **Missing / Overhaul Needed:**
  - **Coastal Chronicle:** Collapsible bottom-left MMO activity feed with filter tabs:
    - `[All]`: Master log.
    - `[Trade]`: Gold spent, commodities sold, market transactions.
    - `[Farming/Fishing]`: Crops planted/harvested, fish hooked/landed/escaped, soil moisture alerts.
    - `[Story]`: Quest updates, contracts accepted/fulfilled, discoveries.
  - Features auto-collapse after idle (e.g. 5 seconds) to ensure persistent screen coverage remains `<20-25%`.

#### 4. Mobile Touch Controls & Orientation Gate (`src/ui/MobileControls.tsx`, `src/ui/mobile.css`)
- **Current State:**
  - Virtual joystick, sprint hold button, jump button, interact/use buttons, basic fishing tap/hold buttons, and landscape orientation gate.
- **Missing / Overhaul Needed:**
  - **Touch Target Standard:** Strict compliance with `>= 48px` touch targets for ALL mobile buttons, hotbar slots, and modal controls. (Currently, modal buttons in `mobile.css` line 598 specify `min-height: 44px;` and `@media (max-height: 430px)` specifies `--mobile-control-size: 44px;`—these must be unified to `>= 48px`).
  - **Sport Fishing Touch Controls:** Virtual touch buttons for Sport Fishing (steer left/right, reel, slack, brace) when fighting sport fish on mobile devices.
  - **Forced Landscape Gate:** Ensure prompt cleanly prevents portrait interaction while preserving accessibility.

#### 5. Developer Diagnostics & Layout HUD (`src/ui/DebugOverlay.tsx`, `src/ui/PlacementEditorHud.tsx`)
- **Current State:**
  - `DebugOverlay.tsx` displays FPS, mode, render stats (draw calls, triangles, points, lines, meshes, shadows, batches, instances), player position, camera diagnostics, and cheat buttons (+1h, +1d, +100g, +School, Weather).
  - `PlacementEditorHud.tsx` displays `F2` layout editor status and selected prop information.
- **Missing / Overhaul Needed:**
  - Live simulation telemetry (tick rate, active entities, save size).
  - Clean dev shortcuts and layout editor HUD binding.

---

## 3. Architecture & File Inventory

### Files to Create

1. **`src/ui/components/CoastalChronicle.tsx`**
   - Bottom-left collapsible MMO activity feed with tabs: `[All]`, `[Trade]`, `[Farming/Fishing]`, `[Story]`.
   - Listens to domain events or notice queue history, with automatic collapse timeout.
2. **`src/ui/components/ItemInspectCard.tsx`**
   - Floating/dockable MMO inspect tooltip card.
   - Shows item name, rarity frame, icon, category, stack count, freshness timeline bar, soil/season requirements, base trade value in G, and lore text.
3. **`src/ui/components/ContractsBoardModal.tsx`**
   - Standalone or journal-embedded Contracts Board showing active delivery orders, deadlines, profit margins, turn-in targets, and deliverable items.
4. **`src/ui/components/CoastalAlmanac.tsx`**
   - Fish species encyclopedia (15 species, habitats, bait preferences, size records, silhouette mystery states).
   - Crop almanac (10 crops, seasons, water needs, fertility cost, yield, regrow cycles).
5. **`tests/unit/mmo_complete_ui.test.ts`**
   - Dedicated master test suite verifying all R1–R8 components, Stance Toolbar, Companion Docking, Fishing HUD exclusivity, Viewport Budget Audit, and DTO purity.

### Files to Modify / Overhaul

1. **`src/ui/GameUI.tsx`**
   - Add companion docking container: when `activeModal === "market"` or `activeModal === "ledger"`, render side-by-side with Satchel on wide screens.
   - Mount `CoastalChronicle` at bottom-left.
   - Pass updated audio, graphics, and emergency tow handlers.
2. **`src/ui/InventoryModal.tsx`**
   - Add Auto-Sort button (`[Auto-Sort]`).
   - Add Item Search input bar (`[Search items...]`).
   - Add ArcheAge Physical Cargo representation (heavy pack badging, speed penalty cues).
   - Integrate with `ItemInspectCard` on hover/focus.
3. **`src/ui/MarketModal.tsx`**
   - Support companion docking mode (docked side-by-side with Satchel).
   - Add supply/demand trend graph sparkline.
   - Add rod equipment tier comparison cards.
4. **`src/ui/components/LogisticsLedgerModal.tsx`**
   - Support companion docking with Satchel.
   - Add 1-click item/cargo transfer buttons between Satchel and Hold/Warehouse.
5. **`src/ui/JournalModal.tsx`**
   - Add `contracts` and `almanac` folio tabs alongside `story`, `records`, `skills`, and `guide`.
   - Embed `ContractsBoardModal` and `CoastalAlmanac`.
6. **`src/ui/components/WorldMapModal.tsx`**
   - Render active fishing schools and regional market demand heatmap.
   - Add player waypoint creation and projection.
7. **`src/ui/EscapeMenuModal.tsx`**
   - Add Emergency Boat Recall button (`onEmergencyRecallBoat`).
   - Add Autosave health indicator badge.
   - Expand `AudioControls` to include all 6 buses: Master, Music, Ambience, Weather, Fishing, UI.
8. **`src/audio/AudioSettings.ts`**
   - Expand `AudioSettings` interface with `weather`, `fishing`, `ui` levels and mutes.
   - Connect these settings to `AudioManager.ts`'s existing `weatherGain`, `fishingGain`, and `uiGain`.
9. **`src/ui/MobileControls.tsx` & `src/ui/mobile.css`**
   - Add Sport Fishing virtual touch controls.
   - Enforce strict `>= 48px` touch target standard across all buttons, slots, and controls (updating 44px rules).
10. **`src/simulation/presentation/SatchelPresentation.ts` & `src/simulation/core/contracts.ts`**
    - Enrich `SatchelDto` slots with rarity, freshness, base trade value, requirements, and physical cargo status for Item Inspect Cards.

---

## 4. Simulation DTO Dependencies & Purity Contract

To preserve Neva's core architectural invariant (**100% Simulation Ownership**):
- UI components must only receive read-only presentation DTOs.
- UI components must never perform game balance calculations, economy pricing math, RNG rolls, or direct state mutations.
- Actions trigger callbacks that dispatch canonical commands to `Simulation.executeCommand(...)` or invoke presentation adapters.

### Required DTO Extensions

| DTO Interface | Current State | Required Extensions for R6–R8 |
|---|---|---|
| `SatchelDto` (`contracts.ts`) | `slots`: index, itemId, name, description, categoryLabel, inventoryCategory, quantity, cropId, cropName, isFish | Add: `rarity` (tier), `freshness` (0-100), `isPhysicalCargo` (boolean), `speedPenaltyPercent` (number), `baseTradeValue` (number), `soilRequirements` (string / null), `seasonRequirements` (string / null), `lore` (string / null) |
| `HoldStoresDto` (`contracts.ts`) | satchel, vesselHolds, carriedCatch, supplies, vessels | Add: `warehouse` stock summary (slots, items), `transferCapabilities` (canTransferSatchelToHold, canTransferHoldToSatchel) |
| `MarketBoardDto` (`contracts.ts`) | buyRows, sellRows, fishRows, rodRows, contractRows, bulkProduce, bulkFish | Add: `priceTrend` per commodity (`"rising" \| "stable" \| "falling"` or sparkline vector `number[]`), rod tier comparison metadata |
| `PauseSummaryDto` (`contracts.ts`) | regionLabel, dateTimeLabel, work, lastSavedUtcMs | Add: `autosaveHealth` (`"healthy" \| "degraded" \| "unavailable"`), `storageEngine` (`"indexeddb" \| "memory"`), `canEmergencyTowBoat` (boolean) |
| `WorldMapDto` (`contracts.ts`) | player, fishingNotes, farms | Add: `activeSchools` (schoolId, habitat, position, detected), `marketHeatmap` (marketId, topDemand, priceMultiplier), `waypoints` (id, x, z, label) |
| `AudioSettings` (`AudioSettings.ts`) | master, music, sfx, ambience | Add: `weather`, `fishing`, `ui` (and corresponding mute flags) |

---

## 5. Test Architecture Plan for `tests/unit/mmo_complete_ui.test.ts`

### Environment
- **Runner**: Vitest in `node` environment (`vitest.config.ts`).
- **Rendering**: Server-side unit rendering via `renderToString` from `react-dom/server` (instant execution, zero WebGL/browser overhead).
- **Simulation**: Direct instantiation of `new Simulation()` or mock DTO fixtures.

### Suite Structure

```ts
describe("MMO Complete UI Architecture & Presentation Suite", () => {
  describe("R1: Persistent Gameplay HUD & Nautical Navigation", () => {
    it("renders player unit frame with Labor bar, Sprint bar, and active status chips");
    it("renders celestial time dial and nautical compass with cardinal bearings and wind direction");
    it("renders collapsible quest & contract tracker with progress bars and fold/unfold toggles");
    it("renders bottom-right micro-menu with hotkey badges (I, J, M, L, P, Esc) and animated purse");
  });

  describe("R2: Contextual Toolbar, Action Channeling & Smart Prompts", () => {
    it("transitions Smart Stance Bar across Agronomy, Angling, Maritime, and Explorer stances");
    it("renders action channeling bar with progress percentage for farming and processing");
    it("renders smart labor action prompt with keycap, verb, target, and labor cost badge");
    it("renders planting seed belt tray with quantity badges and climate suitability");
  });

  describe("R3: In-World Inspectors, GIS Overlays & Toasts", () => {
    it("renders crop inspection card with growth stage, moisture band, and next action cost");
    it("renders farm GIS legend and soil fertility overlay");
    it("renders trophy catch inspection modal and celebration toast");
    it("renders contextual discovery hint cards with clean dismissal");
    it("renders notice stack with tone prioritization, coalescing, and expiration");
  });

  describe("R4: Dual Fishing Minigames & Exclusivity", () => {
    it("renders basic fishing cast meter, bite alert, and reeling tension widget");
    it("renders sport fishing telemetry HUD with circular tension gauge, stamina, and deflection");
    it("gates basic and sport fishing HUDs strictly to active fishing phases");
  });

  describe("R5: Maritime Vessel Console", () => {
    it("renders nautical dashboard with knots, heading, sea state, hull, and fuel gauges");
    it("renders physical cargo hold bay grid with loaded fish and freshness decay bars");
  });

  describe("R6: Side-by-Side Dockable MMO Windows & Inventories", () => {
    it("renders Satchel inventory with category filtering, search input, and auto-sort button");
    it("renders side-by-side companion docking for Market Stall and Satchel");
    it("renders side-by-side companion docking for Hold/Warehouse Ledger and Satchel with 1-click transfer");
    it("renders distinct ArcheAge physical cargo pack representations with speed penalty cues");
    it("renders rich MMO item inspect cards with rarity frame, freshness timeline, requirements, and lore");
  });

  describe("R7: Folio, Almanac & Expedition Planners", () => {
    it("renders Field Journal with Story Spine, Contracts Board, Coastal Almanac, Skills, and Guide");
    it("renders Coastal Almanac encyclopedias for all 15 fish species and 10 crops");
    it("renders Nautical Chart with landmarks, active fishing schools, and market demand heatmap");
    it("renders Expedition Board maritime voyage planner with sea routes and danger ratings");
  });

  describe("R8: System Overlays, Title Screen & Dev Tooling", () => {
    it("renders Pause Menu with quick-save, emergency shore reset, emergency boat recall, and 6 audio sliders");
    it("renders Title Screen with continue, new game, save overview, and save recovery sheet");
    it("renders bottom-left Coastal Chronicle activity feed with filter tabs and auto-collapse");
    it("renders Mobile Controls with virtual joystick, sprint, jump, touch targets >= 48px, and landscape gate");
    it("renders Dev Diagnostics with FPS, draw calls, triangles, and F2 layout editor HUD");
  });

  describe("Viewport Budget Audit (<25% of 1080p and 720p)", () => {
    it("audits persistent HUD viewport footprint at 1080p (1920x1080) to strictly occupy <25%");
    it("audits persistent HUD viewport footprint at 720p (1280x720) to strictly occupy <25%");
  });

  describe("100% Simulation Ownership & DTO Purity", () => {
    it("verifies all UI components consume read-only DTOs and do not mutate simulation state directly");
    it("verifies zero gameplay formula recalculation occurs in presentation components");
  });

  describe("Modal Priority & Input Exclusivity", () => {
    it("verifies modal overlays block world movement and interaction input");
    it("verifies active fishing blocks conflicting HUD modal hotkeys from opening");
  });
});
```

### Viewport Budget Audit Methodology
- **Target Resolutions:**
  - 1080p: `1920 × 1080` = `2,073,600 px²`. Budget cap (`25%`): `518,400 px²`.
  - 720p: `1280 × 720` = `921,600 px²`. Budget cap (`25%`): `230,400 px²`.
- **Persistent Elements Measured:**
  1. Top-Left Unit Frame / Celestial Almanac Panel (`min(320px, ...) × 54px` ≈ `17,280 px²`).
  2. Top-Right Nautical Compass & Quest Tracker (`270px × 80px` ≈ `21,600 px²`).
  3. Bottom-Left Vitals & Collapsed Chronicle (`230px × 110px` ≈ `25,300 px²`).
  4. Bottom-Center Smart Toolbar / Prompt (`400px × 70px` ≈ `28,000 px²`).
  5. Bottom-Right Micro-Menu & Purse (`200px × 44px` ≈ `8,800 px²`).
- **Total Persistent Area:** ~`100,980 px²`.
  - At 1080p: `100,980 / 2,073,600` = **4.87%** (Well below the 25% threshold).
  - At 720p: `100,980 / 921,600` = **10.96%** (Well below the 25% threshold).
- **Audit Implementation:** Mathematical assertion test validating maximum bounded bounding boxes of persistent clusters against total screen pixel budget.

---

## 6. Concrete Implementation Recommendations & Phasing Strategy

### Phase 1: Simulation DTO & Service Foundation
1. Extend `SatchelDto`, `HoldStoresDto`, `PauseSummaryDto`, and `WorldMapDto` in `src/simulation/core/contracts.ts` with required inspect and telemetry fields.
2. Update presentation adapters (`SatchelPresentation.ts`, `HoldStoresPresentation`, `WorldMapPresentation.ts`, `PausePresentation.ts`) to populate enriched metadata from `ContentRegistry`.
3. Expand `AudioSettings.ts` to expose `weather`, `fishing`, and `ui` buses, wiring them to `AudioManager.ts`'s existing gain nodes.

### Phase 2: R6 Dockable Windows, Satchel & MMO Item Inspect Cards
1. Build `ItemInspectCard.tsx` with rarity frames, freshness timelines, crop requirements, trade values, and lore text.
2. Enhance `InventoryModal.tsx` with real-time search, auto-sort button, and physical cargo representations.
3. Update `MarketModal.tsx` and `LogisticsLedgerModal.tsx` to support companion docking (rendering side-by-side with Satchel on wide screens) and 1-click cargo transfers.

### Phase 3: R7 Folio, Almanac & Expedition Planners
1. Add `contracts` and `almanac` folio tabs to `JournalModal.tsx`.
2. Build `ContractsBoardModal.tsx` and `CoastalAlmanac.tsx` (15 fish encyclopedia + 10 crop almanac).
3. Enhance `WorldMapModal.tsx` with active fishing school markers and regional demand heatmaps.

### Phase 4: R8 System Overlays, Title Screen & Dev Tooling
1. Upgrade `EscapeMenuModal.tsx` with emergency boat recall, autosave health badge, and 6 audio sliders.
2. Implement `CoastalChronicle.tsx` (bottom-left activity feed with auto-collapse).
3. Update `MobileControls.tsx` and `mobile.css` to guarantee `>= 48px` touch targets on all interactive controls.

### Phase 5: Verification Suite & Viewport Budget Audit
1. Implement `tests/unit/mmo_complete_ui.test.ts` covering R1 through R8, Viewport Budget Audits, and DTO purity checks.
2. Run `npm run typecheck` and `npm test` to guarantee zero regressions.
