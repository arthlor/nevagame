# Technical Survey & Architecture Report: R1 & R2
# Persistent Gameplay HUD, Nautical Navigation & Contextual Toolbar Systems

**Author**: `explorer_survey_m0_1`  
**Date**: 2026-09-03  
**Scope**: Requirements R1 & R2 of the ArcheAge / Palia-inspired Cozy MMO Interface System Overhaul  
**Target Directory**: `src/ui/`, `src/simulation/`, `src/world/`, `src/app/`

---

## Executive Summary
This survey establishes the complete technical specification, architectural mapping, simulation DTO dependencies, and component refactoring plan for **R1 (Persistent Gameplay HUD & Nautical Navigation)** and **R2 (Contextual Toolbar, Action Channeling & Smart Prompts)**.

Currently, Neva has substantial UI foundation code (`HUD.tsx`, `GameUI.tsx`, `QuestTrackerHUD.tsx`, `HudDecorations.tsx`, `CoastalUI.tsx`, `Chrome.tsx`), but the elements are organized in an inverted, prototype-era layout:
1. The **Top-Left** cluster currently holds the Celestial Clock, Weather, and Gold Purse; vital player resources (Work/Labor and Sprint Stamina) are relegated to a small widget in the Bottom-Left.
2. The **Top-Right** cluster lacks the Circular Nautical Compass Radar and dynamic bearings, only displaying a basic quest tracker and weather hazard chip.
3. The **Quest Tracker** only renders single story steps and completely omits active Market Delivery Contracts.
4. The **Bottom-Right** lacks the compact 6-button Micro-Menu rack and Bag/Cargo capacity badges.
5. The **Hotbar** is hardcoded to a static 5-slot mixture [Hoe, Seed, Water, Bait, Rod], completely missing mode-driven Contextual Stances (Agronomy, Angling, Maritime, Explorer).
6. **Action Channeling** (`FarmingActionStatus`) is an inline sub-component inside `GameUI.tsx` rather than a modular, high-polish MMO cast bar.
7. **Contextual Action Prompts** are handled as unstructured regex-flattened strings rather than structured key-verb-target-labor chips.

All underlying simulation state (Work Capacity, Sprint Stamina, Weather, Wind Direction, Coordinates, Heading, World Chart Locations, Fish Schools, Active Contracts, Inventories, and Authored Action Timings) **already exists with 100% mathematical integrity**. The work required is purely presentation restructuring, DTO enrichment in `WorldHudPresentation.ts`, and component decomposition under `src/ui/hud/`.

---

## 1. Current State vs. Target State (Gap Analysis Matrix)

| Subsystem Component | Current Implementation (`src/ui/`) | Target Implementation (R1 & R2) | Architectural Gap / Action Required |
|---|---|---|---|
| **R1.1 Player Unit Frame** | `src/ui/HUD.tsx` (lines 430-468) places Work Capacity and Sprint in Bottom-Left under `.hud-vitals`. Top-Left holds clock and purse. | Top-Left anchor: Heraldic Crest/avatar frame, dual resource bars (Labor with recharge pulse, Sprint with exhaustion warning), active status chips. | **Major Overhaul**: Move vitals to Top-Left. Implement `PlayerUnitFrame.tsx` with crest medallion, animated labor refill pulse, stamina warning, and status chips row (`Overburdened`, `Well Rested`, `Rain Soaked`, `Night Water`). |
| **R1.2 Nautical Compass & Almanac** | `src/ui/HudDecorations.tsx` defines `CelestialTimeDial`, rendered in Top-Left in `HUD.tsx`. No compass or radar exists. | Top-Right anchor: Celestial Time Dial combined with Circular Nautical Compass Radar (cardinal bearings, dynamic wind arrow, sub-region title, POI radar blips). | **Major Feature**: Implement `NauticalCompassAlmanac.tsx`. Project cardinal bearings from `player.rotationY`, wind vector from `weather.windDirectionDeg`, sub-region title from `WORLD_REGION_LABELS`, and radar blips from `WORLD_CHART_NODES` + `fishSchools` + active quest target. |
| **R1.3 Collapsible Tracker** | `src/ui/QuestTrackerHUD.tsx` (lines 1-85) renders only `activeQuest`. Delivery contracts are missing from HUD. | Pinned below compass: Unified collapsible tracker for active story quest steps AND active market delivery contracts with checkmarks and fold/unfold toggles. | **Subsystem Expansion**: Expand tracker to consume `state.contracts`. Group into "Story Spine" and "Market Deliveries", with checkmarks, item/cargo counts, turn-in readiness, and independent folding. |
| **R1.4 Micro-Menu & Purse Bar** | Esc button is in Top-Right in `HUD.tsx`. Gold purse is in Top-Left. No micro-menu rack exists. | Bottom-Right anchor: Compact 6-button icon rack (Satchel [I], Journal [J], Chart [M], Stores [L], Expeditions [P], Menu [Esc]), Gold Purse counter with delta floaters, Bag/Cargo capacity badges. | **New Component**: Implement `MicroMenuPurseBar.tsx`. Relocate purse from clock to Bottom-Right. Render capacity badges (`14/20` satchel, `1/1` back pack). Wire modal toggles via `onSetActiveModal`. |
| **R2.1 Contextual Stance Toolbar** | `src/ui/HUD.tsx` (lines 505-528) renders static 5 slots [Hoe, Seed, Water, Bait, Rod]. | Bottom-Center anchor: Dynamic mode-driven toolbar switching across **Agronomy**, **Angling**, **Maritime**, and **Explorer** stances. | **Major Overhaul**: Implement `SmartContextualToolbar.tsx`. Detect stance dynamically via `findFarmIdAtWorld()`, `fishingAccessAt()`, and `player.activeBoatId`. Render specialized slot sets with sub-meters (watering can reservoir, boat fuel/hull). |
| **R2.2 Action Cast Bar** | `src/ui/GameUI.tsx` (lines 697-714) has inline `FarmingActionStatus` with basic `Meter`. | High-polish MMO action-channeling bar for all 12 authored actions with timing readout (`1.2s / 2.0s`), commit marker, and cancel hint. | **Refactor & Polish**: Extract to `src/ui/components/FarmingActionStatus.tsx`. Add channeling glow, progress spark, exact timing label, action icon, and `[Esc] / Move to Cancel` prompt. |
| **R2.3 Smart Action Prompts** | `src/ui/HUD.tsx` (lines 45-61) parses prompt text with basic regex into a single text string. | Floating contextual chip displaying keycap (`[E]`), interaction verb, target entity name, and Labor cost badge (`-5 Work`). | **New Component**: Implement `SmartActionPrompt.tsx`. Parse or ingest structured prompt models with keycaps, colored verb, target title, and labor badge (`IconEnergy` + cost). |
| **R2.4 Planting Seed Belt Selector** | `src/ui/components/PlantingSeedBar.tsx` (lines 1-76) renders seeds with count badges and preferred climates. | Docked horizontal seed tray with count badges, seasonal compatibility icons, and soil suitability hints. | **Feature Enhancement**: Add season match icons (green check if current season matches crop seasons) and soil fertility / moisture hints. |

---

## 2. Architecture & File Inventory

### 2.1 New Files to Create

1. `src/ui/hud/PlayerUnitFrame.tsx`
   - **Purpose**: Top-left persistent player frame.
   - **Contents**:
     - Player crest medallion / avatar vignette.
     - Work Capacity (Labor) meter with active regen pulse, current/max numerical readout, and low/exhausted visual state.
     - Sprint Stamina meter with "Winded" exhaustion alert, drain feedback, and recovery tint.
     - Active status chips rack: `Overburdened Cargo pack`, `Well Rested`, `Rain Soaked`, `Night Water chill`.
   - **Props**: `work: WorldHudDto["work"]`, `sprint: WorldHudDto["sprint"]`, `statusChips: readonly HudStatusChipDto[]`, `onOpenCharacterSheet?: () => void`.

2. `src/ui/hud/NauticalCompassAlmanac.tsx`
   - **Purpose**: Top-right nautical navigation and celestial chronometer.
   - **Contents**:
     - Circular SVG Nautical Compass Radar: 360-degree rotating cardinal bezel (N, E, S, W), dynamic wind vector arrow, radar sweep/range rings, and POI markers (Farm, Harbor, Active Quest Beacon, Fish Schools).
     - Integrated `CelestialTimeDial` with sun/moon orbit, time of day badge, and season/day label.
     - Sub-region banner displaying current location (`WORLD_REGION_LABELS[player.currentRegionId]`).
     - Weather condition chip and maritime hazard warnings.
   - **Props**: `clock: WorldHudDto["clock"]`, `weather: WorldHudDto["weather"]`, `headingDeg: number`, `regionLabel: string`, `markers: readonly CompassMarkerDto[]`, `onToggleForecast: () => void`.

3. `src/ui/hud/MicroMenuPurseBar.tsx`
   - **Purpose**: Bottom-right persistent action rack and wealth ledger.
   - **Contents**:
     - Compact 6-button icon rack:
       1. Satchel `[I]` (with shortcut badge)
       2. Field Journal `[J]`
       3. Nautical Chart `[M]`
       4. Hold & Stores `[L]`
       5. Expeditions `[P]` (disabled/locked until feature unlock)
       6. Menu / Settings `[Esc]`
     - Animated Gold Purse counter (with floating `+X G` / `-X G` transaction deltas).
     - Satchel capacity badge (e.g. `14/20`, turns warning gold at >=18, red at 20).
     - Physical Cargo capacity badge (e.g. `1/1 Back Pack` or `0/1`).
   - **Props**: `money: number`, `inventoryCapacity: { occupied: number; total: number }`, `carriedCargo: boolean`, `expeditionUnlocked: boolean`, `onOpenModal: (modal: ActiveModal) => void`.

4. `src/ui/hud/SmartContextualToolbar.tsx`
   - **Purpose**: Bottom-center dynamic hotbar shifting loadouts based on context.
   - **Contents**:
     - 5 interactive slots with keyhints (`1` to `5`), active highlight, readiness dimming, and quantity/meter overlays.
     - Stance badge / header indicating current mode (**Agronomy**, **Angling**, **Maritime**, or **Explorer**).
     - Support for sub-meters (e.g., Watering Can reservoir level, Boat Fuel, Boat Hull).
     - Keyboard listeners and click-to-select handlers.
   - **Props**: `stance: "agronomy" | "angling" | "maritime" | "explorer"`, `hotbar: readonly ContextualHotbarSlotDto[]`, `activeSlot: number`, `onSelectSlot: (slot: number) => void`.

5. `src/ui/hud/SmartActionPrompt.tsx`
   - **Purpose**: Floating contextual action indicator positioned above the hotbar.
   - **Contents**:
     - Primary interaction keycap (`[E]` or touch icon).
     - Verb badge (`Harvest`, `Water`, `Till`, `Talk`, `Board`, `Dock`, `Fish`, `Open`).
     - Target entity name (`Winter Carrot`, `Rowboat`, `Mayor Aldous`).
     - Labor / Work cost tag (`-5 Work` with `IconEnergy`, colored green if affordable, red alert if short on work).
     - Secondary action hint (`[Right-click] Inspect`).
   - **Props**: `promptText: string | null`, `touchChrome?: boolean`.

6. `src/ui/components/FarmingActionStatus.tsx`
   - **Purpose**: Modular MMO action-channeling progress bar (extracted from `GameUI.tsx`).
   - **Contents**:
     - Channeling progress bar with active shimmer/spark effect.
     - Action verb icon from `uiAtlas` (`plant`, `water`, `fertilize`, `harvest`, etc.).
     - Action title (`Planting seeds…`, `Harvesting crop…`, `Boarding vessel…`).
     - Numerical progress and timing readout (e.g., `1.2s / 2.0s · 60%`).
     - Cancellation notice (`Move or press Esc to cancel`).
   - **Props**: `action: FarmingActionSnapshot`.

7. `tests/unit/mmo_hud_r1_r2.test.ts`
   - **Purpose**: Comprehensive test harness for R1 and R2 components, DTO bindings, stance transitions, and viewport budgets.

### 2.2 Existing Files to Modify / Refactor

1. `src/simulation/core/contracts.ts`
   - Extend `WorldHudDto` with:
     - `stance: "agronomy" | "angling" | "maritime" | "explorer"`
     - `playerHeadingDeg: number`
     - `regionLabel: string`
     - `compassMarkers: ReadonlyArray<CompassMarkerDto>`
     - `activeContracts: ReadonlyArray<HudContractDto>`
     - `statusChips: ReadonlyArray<HudStatusChipDto>`
     - `inventoryCapacity: { occupied: number; total: number }`
     - `cargoCapacity: { carried: boolean; label?: string }`
     - `contextualHotbar: ReadonlyArray<ContextualHotbarSlotDto>`

2. `src/simulation/presentation/WorldHudPresentation.ts`
   - In `buildWorldHudDto`:
     - Detect player stance using `state.player.activeBoatId`, `findFarmIdAtWorld(player.x, player.z)`, `WorldLayout.fishingAccessAt(player.x, player.z).habitat`, or fallback to `"explorer"`.
     - Calculate `playerHeadingDeg = ((state.player.rotationY * 180 / Math.PI) % 360 + 360) % 360`.
     - Collect compass markers (Farm origins, Harbor, Active Quest target, Fish schools).
     - Extract active delivery contracts from `state.contracts`.
     - Build active status chips (`Overburdened`, `Well Rested`, `Rain Soaked`, `Night Water`).
     - Construct 5-slot loadout tailored to current stance.

3. `src/ui/HUD.tsx`
   - Decompose the current monolithic layout.
   - Mount:
     - `<HudCluster edge="top-left">` -> `<PlayerUnitFrame>`
     - `<HudCluster edge="top-right">` -> `<NauticalCompassAlmanac>` and `<QuestTrackerHUD>`
     - `<HudCluster edge="bottom-left">` -> Contextual Cargo / Boat Console (when boating)
     - `<HudCluster edge="bottom-center">` -> `<SmartActionPrompt>` and `<SmartContextualToolbar>`
     - `<HudCluster edge="bottom-right">` -> `<MicroMenuPurseBar>`

4. `src/ui/QuestTrackerHUD.tsx`
   - Add contracts section below the active story quest.
   - Support collapsible accordion toggles for "Story Spine" and "Market Deliveries".
   - Render contract target item/fish name, progress (`quantityFulfilled / quantityRequired`), delivery destination market name, and turn-in ready badge.

5. `src/ui/components/PlantingSeedBar.tsx`
   - Add season compatibility icon (e.g., green leaf / check if `crop.growthSeasons.includes(currentSeason)`, red snowflake / warning if out of season).
   - Add soil suitability hints based on targeted farm climate.

6. `src/ui/GameUI.tsx`
   - Replace inline `FarmingActionStatus` definition with import from `src/ui/components/FarmingActionStatus.tsx`.
   - Ensure clean wiring of active modal triggers (`inventory`, `journal`, `map`, `ledger`, `expeditions`, `pause`).

7. `src/ui/hud.css` & `src/ui/coastal.css`
   - Introduce styles for `.player-unit-frame`, `.nautical-compass-radar`, `.micro-menu-rack`, `.smart-stance-toolbar`, `.smart-action-prompt`, and `.status-chips-row`.

---

## 3. Simulation DTO Dependencies & Schema Extension

### 3.1 Proposed DTO Extensions in `src/simulation/core/contracts.ts`

To support R1 and R2 without violating simulation boundary rules, `WorldHudDto` must be augmented with structured types:

```typescript
// --- Compass & Navigation DTOs ---
export type CompassMarkerKind = "farm" | "dock" | "market" | "landmark" | "quest" | "fish-school";

export interface CompassMarkerDto {
  id: string;
  label: string;
  kind: CompassMarkerKind;
  /** Bearing in degrees relative to the player's current heading (-180 to +180). */
  relativeBearingDeg: number;
  /** Distance in meters from player. */
  distanceMeters: number;
  /** True if within radar range (e.g. <= 150m). */
  inRange: boolean;
}

// --- Active Contracts HUD DTO ---
export interface HudContractDto {
  id: string;
  title: string;
  targetName: string;
  targetKind: "item" | "fish";
  quantityFulfilled: number;
  quantityRequired: number;
  rewardMoney: number;
  deliveryMarketName: string;
  isReadyToTurnIn: boolean;
}

// --- Status Chip DTO ---
export interface HudStatusChipDto {
  id: "overburdened" | "well-rested" | "rain-soaked" | "night-water-chill";
  label: string;
  description: string;
  tone: "buff" | "debuff" | "neutral";
  icon: string;
}

// --- Contextual Hotbar Slot DTO ---
export type ContextualStanceId = "agronomy" | "angling" | "maritime" | "explorer";

export interface ContextualHotbarSlotDto {
  slot: 1 | 2 | 3 | 4 | 5;
  id: string;
  name: string;
  detail: string;
  icon?: string;
  quantity: number | null;
  meter?: {
    current: number;
    maximum: number;
    percent: number;
    label?: string;
    danger?: boolean;
  } | null;
  ready: boolean;
  active: boolean;
  shortcutKey: string;
}

// --- Extended WorldHudDto ---
export interface WorldHudDto {
  // Existing fields
  clock: {
    label: string;
    hour: number;
    seasonLabel: string;
    dayInSeason: number;
    timeOfDayLabel: string;
    timeOfDay: TimeWindowId;
    dialRotation: number;
    isNight: boolean;
  };
  weather: {
    type: WeatherTag;
    temperatureC: number;
    hazard: { text: string; tone: "caution" | "danger" } | null;
  };
  money: number;
  work: {
    current: number;
    maximum: number;
    exhausted: boolean;
    showLowNotice: boolean;
    recharging: boolean;
  };
  sprint: {
    current: number;
    maximum: number;
    exhausted: boolean;
  } | null;
  hotbar: ReadonlyArray<{
    slot: 1 | 2 | 3 | 4 | 5;
    detail: string;
    quantity: number | null;
    ready: boolean;
  }>;
  equippedRodId: RodId;
  carriedFish: WorldHudCargoDto | null;
  boat: WorldHudBoatDto | null;
  basicFishingPhase: BasicFishingPhase | null;
  expeditionUnlocked: boolean;

  // NEW R1 & R2 Fields:
  stance: ContextualStanceId;
  playerHeadingDeg: number;
  regionLabel: string;
  compassMarkers: ReadonlyArray<CompassMarkerDto>;
  activeContracts: ReadonlyArray<HudContractDto>;
  statusChips: ReadonlyArray<HudStatusChipDto>;
  inventoryCapacity: {
    occupied: number;
    total: number;
  };
  cargoCapacity: {
    carried: boolean;
    label?: string;
  };
  contextualHotbar: ReadonlyArray<ContextualHotbarSlotDto>;
}
```

### 3.2 Authoritative Simulation Data Flow

Every new property is backed directly by simulation truth:

1. **Player Heading**:
   - Source: `state.player.rotationY` (radians).
   - Presentation: `const headingDeg = ((state.player.rotationY * 180 / Math.PI) % 360 + 360) % 360;`

2. **Wind Bearing & Speed**:
   - Source: `state.weather.windDirectionDeg`, `state.weather.windSpeed`.
   - Relative to Player: `(weather.windDirectionDeg - headingDeg + 360) % 360`.

3. **Sub-Region Title**:
   - Source: `(WORLD_REGION_LABELS as Record<string, string>)[state.player.currentRegionId] ?? "Open Waters"`.

4. **Radar POI Markers**:
   - Sources:
     - Farms: `WORLD_CHART_NODES.filter(n => n.kind === "farm")`
     - Harbors: `WORLD_CHART_NODES.filter(n => n.kind === "dock")`
     - Active Quest: `state.quests.activeQuestId` -> `questDomain.getActiveQuestDto()?.targetLocation`
     - Fish Schools: `Object.values(state.fishSchools)`
   - Relative Polar Projection:
     ```typescript
     const dx = markerWorldX - playerX;
     const dz = markerWorldZ - playerZ;
     const distance = Math.hypot(dx, dz);
     const worldAngleDeg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
     const relativeBearingDeg = ((worldAngleDeg - headingDeg + 540) % 360) - 180;
     ```

5. **Active Delivery Contracts**:
   - Source: `state.contracts.filter(c => c.status === "active")`
   - Readiness: Checked against inventory items or accessible fish cargo via `InventoryManager.getItemCount()` and cargo quality/weight criteria.

6. **Status Chips**:
   - `overburdened`: `Boolean(state.player.carriedFishCargoId)`.
   - `well-rested`: `state.player.workCapacity.current >= state.player.workCapacity.maximum * 0.95`.
   - `rain-soaked`: `state.weather.type === "rain" || state.weather.type === "storm"`.
   - `night-water-chill`: `(state.clock.isNight) && (Boolean(state.player.activeBoatId) || WorldLayout.fishingAccessAt(state.player.x, state.player.z).habitat !== null)`.

7. **Capacity Badges**:
   - Satchel: `inventory ? InventoryManager.getOccupiedSlotCount(inventory) : 0` / `inventory?.capacity ?? 20`.
   - Back Pack: `state.player.carriedFishCargoId ? "1/1" : "0/1"`.

---

## 4. UI DOM & CSS Hierarchy, Styling Strategy & Viewport Budget Analysis

### 4.1 DOM Layout Tree

```html
<div id="ui-container">
  <!-- Top-Left: Player Unit Frame (R1.1) -->
  <section class="hud-cluster hud-cluster--top-left interactive" aria-label="Player status">
    <div class="player-unit-frame">
      <div class="unit-crest-avatar" title="Neva Explorer">
        <svg class="crest-frame-svg">...</svg>
        <span class="avatar-portrait">⚓</span>
      </div>
      <div class="unit-vitals-column">
        <!-- Labor Meter -->
        <div class="unit-resource-row">
          <Meter
            label="Labor"
            variant="labor"
            fill="gold"
            value={work.current}
            max={work.maximum}
            showValue
            icon={<IconEnergy />}
            className={work.recharging ? "is-recharging" : ""}
          />
        </div>
        <!-- Stamina Meter -->
        <div class="unit-resource-row">
          <Meter
            label="Stamina"
            variant="sprint"
            fill={sprint.exhausted ? "danger" : "sprint"}
            value={sprint.current}
            max={sprint.maximum}
            valueText={sprint.exhausted ? "Winded" : undefined}
          />
        </div>
        <!-- Active Status Chips -->
        <div class="status-chips-rack" role="status" aria-label="Active status effects">
          {statusChips.map(chip => (
            <span class={`status-chip status-chip--${chip.id}`} title={chip.description}>
              {chip.icon} {chip.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  </section>

  <!-- Top-Right: Nautical Navigation & Objective Tracking (R1.2 & R1.3) -->
  <section class="hud-cluster hud-cluster--top-right interactive" aria-label="Navigation and objectives">
    <div class="nautical-navigation-widget">
      <!-- Circular Nautical Compass Radar -->
      <div class="nautical-compass-radar">
        <svg class="radar-bezel" viewBox="0 0 160 160">
          <!-- Rotating Compass Rose based on heading -->
          <g class="radar-compass-rose" transform={`rotate(${-headingDeg} 80 80)`}>
            <circle class="radar-cardinal-ring" r="68" cx="80" cy="80" />
            <text x="80" y="24" class="cardinal-label cardinal-n">N</text>
            <text x="136" y="84" class="cardinal-label cardinal-e">E</text>
            <text x="80" y="144" class="cardinal-label cardinal-s">S</text>
            <text x="24" y="84" class="cardinal-label cardinal-w">W</text>
          </g>
          <!-- Dynamic Wind Arrow -->
          <g class="radar-wind-vector" transform={`rotate(${windBearingRel} 80 80)`}>
            <polygon points="80,18 76,28 84,28" class="wind-arrow-head" />
            <line x1="80" y1="28" x2="80" y2="40" class="wind-arrow-tail" />
          </g>
          <!-- Objective Blips -->
          <g class="radar-blips">
            {compassMarkers.map(marker => (
              <circle
                key={marker.id}
                class={`radar-blip radar-blip--${marker.kind}`}
                cx={marker.projectedX}
                cy={marker.projectedY}
                r="3.5"
              />
            ))}
          </g>
        </svg>
        <!-- Center Time Dial -->
        <CelestialTimeDial
          size={56}
          rotation={clock.dialRotation}
          isNight={clock.isNight}
          className="radar-center-dial"
        />
      </div>
      <!-- Location and Time Caption -->
      <div class="nautical-caption">
        <strong class="subregion-title">{regionLabel}</strong>
        <span class="chronometer-readout">{clock.label} · {clock.seasonLabel} {clock.dayInSeason}</span>
      </div>
    </div>

    <!-- Collapsible Quest & Contract Tracker -->
    <div class="collapsible-quest-contract-tracker">
      <QuestTrackerHUD activeQuest={activeQuest} />
      <ContractTrackerHUD activeContracts={activeContracts} />
    </div>
  </section>

  <!-- Bottom-Left: Contextual Notes, Carried Cargo & Vessel Console -->
  <section class="hud-cluster hud-cluster--bottom-left interactive">
    {boat && <BoatConsolePanel boat={boat} />}
    {carriedFish && <CarriedFishNote cargo={carriedFish} />}
  </section>

  <!-- Bottom-Center: Smart Prompts & Stance Toolbar (R2) -->
  <section class="hud-cluster hud-cluster--bottom-center">
    <!-- Action Cast Bar (Channeling) -->
    {farmingAction && <FarmingActionStatus action={farmingAction} />}
    <!-- Smart Labor Action Prompt -->
    <SmartActionPrompt promptText={promptText} />
    <!-- Contextual Hotbar -->
    <SmartContextualToolbar
      stance={stance}
      hotbar={contextualHotbar}
      activeSlot={activeToolSlot}
      onSelectSlot={onSelectToolSlot}
    />
    <!-- Planting Seed Belt (in farm-placement mode) -->
    {mode === "farm-placement" && <PlantingSeedBar />}
  </section>

  <!-- Bottom-Right: Micro-Menu & Purse Bar (R1.4) -->
  <section class="hud-cluster hud-cluster--bottom-right interactive" aria-label="Menu and purse">
    <div class="micro-menu-purse-bar">
      <!-- Purse & Capacity Badges Row -->
      <div class="purse-and-capacity-row">
        <div class="medallion-purse-counter" aria-label={`Purse: ${money} gold`}>
          <MedallionPurse size={24} />
          <span class="gold-amount">{money.toLocaleString()} G</span>
          {goldDelta && <span class={`gold-delta ${goldDelta.amount > 0 ? "gain" : "spend"}`}>...</span>}
        </div>
        <div class="capacity-badges-group">
          <span class={`capacity-badge satchel-badge ${satchelFull ? "is-full" : ""}`} title="Satchel Slots">
            🎒 {inventoryCapacity.occupied}/{inventoryCapacity.total}
          </span>
          <span class="capacity-badge cargo-badge" title="Physical Cargo (Back Pack)">
            📦 {cargoCapacity.carried ? "1/1" : "0/1"}
          </span>
        </div>
      </div>
      <!-- 6-Button Micro-Menu Rack -->
      <nav class="micro-menu-rack" role="toolbar" aria-label="System panels">
        <button type="button" class="micro-menu-btn" onClick={() => onOpenModal("inventory")} title="Satchel (I)">
          <IconSatchel size={18} />
          <span class="micro-menu-key">I</span>
        </button>
        <button type="button" class="micro-menu-btn" onClick={() => onOpenModal("journal")} title="Field Journal (J)">
          <IconJournal size={18} />
          <span class="micro-menu-key">J</span>
        </button>
        <button type="button" class="micro-menu-btn" onClick={() => onOpenModal("map")} title="Nautical Chart (M)">
          <IconMap size={18} />
          <span class="micro-menu-key">M</span>
        </button>
        <button type="button" class="micro-menu-btn" onClick={() => onOpenModal("ledger")} title="Hold & Stores (L)">
          <IconHold size={18} />
          <span class="micro-menu-key">L</span>
        </button>
        <button type="button" class={`micro-menu-btn ${!expeditionUnlocked ? "is-locked" : ""}`} onClick={() => expeditionUnlocked && onOpenModal("expedition")} title="Expeditions (P)" disabled={!expeditionUnlocked}>
          <IconExpedition size={18} />
          <span class="micro-menu-key">P</span>
        </button>
        <button type="button" class="micro-menu-btn" onClick={() => onOpenModal("pause")} title="Game Menu (Esc)">
          <IconMenu size={18} />
          <span class="micro-menu-key">Esc</span>
        </button>
      </nav>
    </div>
  </section>
</div>
```

### 4.2 Viewport Coverage Budget Audit

The project non-negotiable rule requires:
> "Normal play targets roughly 15–18% persistent HUD coverage and must stay below the 20–25% ceiling."

Let us calculate the exact pixel footprint and percentage across both target resolutions:

#### 1. Full HD Viewport: 1920 × 1080 (Total Area: 2,073,600 px²)
- **Top-Left (Player Unit Frame)**:
  - Bounding dimensions: 280px width × 95px height
  - Area: 26,600 px² (1.28% of screen)
- **Top-Right (Nautical Compass + Collapsed Quest Tracker)**:
  - Compass widget: 160px width × 180px height = 28,800 px²
  - Collapsed Quest Tracker: 260px width × 70px height = 18,200 px²
  - Subtotal: 47,000 px² (2.27% of screen)
- **Bottom-Center (Smart Action Prompt + Stance Hotbar)**:
  - Smart Prompt chip: 280px width × 38px height = 10,640 px²
  - Hotbar (5 slots + borders): 340px width × 68px height = 23,120 px²
  - Subtotal: 33,760 px² (1.63% of screen)
- **Bottom-Right (Micro-Menu & Purse Bar)**:
  - Bounding dimensions: 250px width × 64px height
  - Area: 16,000 px² (0.77% of screen)
- **Bottom-Left (Contextual Notes / Carried Cargo / Boat Console)**:
  - Idle on foot: 0 px²
  - Carried cargo active: ~180px × 50px = 9,000 px² (0.43% of screen)
  - Full boat console active (driving): ~260px × 150px = 39,000 px² (1.88% of screen)

**Total Persistent HUD Coverage (On Foot)**:  
`26,600 + 47,000 + 33,760 + 16,000 + 0` = **123,360 px²** = **5.95%** of 1080p screen!

**Total Persistent HUD Coverage (Boating with Active Console)**:  
`26,600 + 47,000 + 33,760 + 16,000 + 39,000` = **162,360 px²** = **7.83%** of 1080p screen!

#### 2. HD Ready Viewport: 1280 × 720 (Total Area: 921,600 px²)
With responsive CSS scaling (`uiScale.ts` / CSS transforms at 0.9x factor on 720p):
- Top-Left: ~250px × 85px = 21,250 px² (2.31%)
- Top-Right: ~240px × 160px = 38,400 px² (4.17%)
- Bottom-Center: ~300px × 90px = 27,000 px² (2.93%)
- Bottom-Right: ~220px × 56px = 12,320 px² (1.34%)
- Bottom-Left (Boating console): ~230px × 130px = 29,900 px² (3.24%)

**Total Persistent HUD Coverage (On Foot at 720p)**:  
`21,250 + 38,400 + 27,000 + 12,320` = **98,970 px²** = **10.74%** of 720p screen!

**Total Persistent HUD Coverage (Boating at 720p)**:  
`98,970 + 29,900` = **128,870 px²** = **13.98%** of 720p screen!

**Conclusion**: The HUD comfortably maintains **under 8% on 1080p** and **under 15% on 720p**, satisfying the `<20-25%` ceiling with abundant safety margin for gameplay visibility.

---

## 5. Detailed Component Specifications: R1 (Persistent HUD & Nautical Navigation)

### 5.1 Player Unit Frame (`src/ui/hud/PlayerUnitFrame.tsx`)
- **Visual Structure**:
  - Anchored at `edge="top-left"`.
  - Left element: Ornate heraldic circular medallion (`size={48}`) with cast brass rim and character silhouette or maritime anchor insignia.
  - Right column: Stacked dual resource bars:
    - **Labor (Work Capacity)**: Primary bar with warm gold/brass fill (`#f59e0b`). Displays `current / maximum`. When labor is recharging, pulses subtle amber breath effect. If `current < 1`, turns crimson/danger with "Exhausted" alert.
    - **Sprint Stamina**: Slender teal/cyan meter (`#0ea5e9`). When stamina drops, displays live bar. When `sprintExhausted === true`, flashes red with "Winded" tag. Automatically hides when stamina is full (unless overburdened).
  - Bottom strip: **Active Status Chips**:
    - `Overburdened`: Amber chip with cargo icon; warns of movement speed reduction from physical trade packs or trophy fish.
    - `Well Rested`: Pale gold chip with sparkling star; indicates rested labor regeneration bonus.
    - `Rain Soaked`: Soft blue chip with droplet icon; active during rain or storm.
    - `Night Water`: Frost-blue chip with crescent & wave; active during nighttime sea voyages.

### 5.2 Nautical Compass & Almanac (`src/ui/hud/NauticalCompassAlmanac.tsx`)
- **Visual Structure**:
  - Anchored at `edge="top-right"`.
  - Two tightly coupled parts:
    1. **Circular Nautical Radar (140px - 160px diameter)**:
       - Outer brass bezel with degree tick marks and rotating cardinal letters (N, E, S, W) that counter-rotate with player heading `player.rotationY`.
       - Integrated central `CelestialTimeDial` showing the astronomical sun/moon orbit, dawn/dusk transitions, and day/night phase.
       - Dynamic wind arrow: Pointer rotating to show true relative wind direction; length indicates wind speed (e.g., 2m/s gentle breeze vs 12m/s gale).
       - Radar blip projection: Range-scaled blips (radius up to 150m):
         - Farm homesteads: Green sprout icon / blip.
         - Harbors & docks: Blue anchor blip.
         - Active Quest beacon: Pulsing gold diamond blip.
         - Fish schools: Cyan ripple blip.
    2. **Almanac Caption**:
       - Sub-region title: Large legible serif banner (e.g., "Silverwater River", "Seabreak Harbor").
       - Time & Season: `14:20 · Autumn 12`.
       - Clickable trigger to open the full Farm Forecast popover (retaining `[F]` hotkey).

### 5.3 Collapsible Quest & Contract Tracker (`src/ui/QuestTrackerHUD.tsx`)
- **Visual Structure**:
  - Mounted directly beneath the Nautical Compass in the top-right cluster.
  - Accordion sections:
    - **Story Quest Section**:
      - Header with chapter/quest title and fold chevron.
      - Objective step description.
      - Numerical progress bar (`current / target`).
      - Target destination pin.
      - "Ready" chip when complete and waiting for turn-in.
    - **Market Delivery Contracts Section**:
      - Header: "Active Contracts (N)" with fold chevron.
      - Contract items:
        - Target icon (produce or fish species).
        - Name and required quantity: e.g., `3/5 Winter Carrot` or `1/1 Trophy Seabass`.
        - Destination market label: e.g., `Deliver to Harbor Market`.
        - Reward badge: `+450 G`.
        - Green checkmark when fulfilled and deliverable.

### 5.4 Bottom-Right Micro-Menu & Purse Bar (`src/ui/hud/MicroMenuPurseBar.tsx`)
- **Visual Structure**:
  - Anchored at `edge="bottom-right"`.
  - Top row:
    - **Medallion Gold Purse**: Tactile leather pouch with gold relief medallion, formatted gold counter (`1,250 G`), and floating animated deltas (`+150 G` green float, `-50 G` red sink).
    - **Capacity Badges**:
      - Satchel: `🎒 14/20` slots.
      - Back Pack: `📦 1/1` or `📦 0/1`.
  - Bottom row: **Compact 6-Button Micro-Menu**:
    - `[I]` Satchel (Inventory)
    - `[J]` Field Journal
    - `[M]` Nautical Chart (World Map)
    - `[L]` Hold & Stores (Fleet / Warehouse Ledger)
    - `[P]` Expeditions (Locked with padlock until feature unlocked)
    - `[Esc]` Menu (System / Pause)
  - Keyboard shortcuts displayed as embossed mini-keycaps.

---

## 6. Detailed Component Specifications: R2 (Contextual Toolbar, Action Channeling & Smart Prompts)

### 6.1 Smart Contextual Stance Toolbar (`src/ui/hud/SmartContextualToolbar.tsx`)
- **Visual Structure**:
  - Docked at `edge="bottom-center"`.
  - Dynamic stance header badge:
    - *Agronomy Stance* (active on farm plots)
    - *Angling Stance* (active near water or with rod)
    - *Maritime Stance* (active in boat)
    - *Explorer Stance* (active during travel)
  - 5 interactive slot buttons (`[1]` to `[5]`):
    - **Agronomy Loadout**:
      - Slot 1: **Hand Tools / Hoe** (Till & Weed)
      - Slot 2: **Seed Belt** (Active selected seed icon, count badge, flyout trigger)
      - Slot 3: **Watering Can** (with sub-meter for water reservoir)
      - Slot 4: **Fertilizer / Compost** (Basic Fertilizer count)
      - Slot 5: **Harvest / Basket** (Direct harvest action)
    - **Angling Loadout**:
      - Slot 1: **Cast Rod** (Equipped rod icon, ready state)
      - Slot 2: **Lure / Tacklebox** (Armed lure icon & notch)
      - Slot 3: **Chum / Bait Bucket** (Earthworm / chum count)
      - Slot 4: **Keepnet / Fish Bag** (Carried catch overview)
      - Slot 5: **Stow Rod** (Unequip rod to hands)
    - **Maritime Loadout**:
      - Slot 1: **Helm Control** (Engage / Release helm)
      - Slot 2: **Speed & Heading Log** (Knots + Compass bearing)
      - Slot 3: **Hull Integrity Meter** (Bar showing % durability, danger color)
      - Slot 4: **Fuel Tank Meter** (Bar showing fuel % or "Wind-driven")
      - Slot 5: **Cargo Hold Bay** (Occupied / Total hold slots)
    - **Explorer Loadout**:
      - Slot 1: **Satchel** (`[I]` quick access)
      - Slot 2: **Pocket Chart** (`[M]` quick access)
      - Slot 3: **Rations** (Packed lunch / stamina recovery)
      - Slot 4: **Lantern** (Lighting toggle)
      - Slot 5: **Field Journal** (`[J]` quick access)
  - Active slot highlight with gold filigree corner brackets.
  - Smooth 200ms transition animation between stances.

### 6.2 Action Cast Bar (`src/ui/components/FarmingActionStatus.tsx`)
- **Visual Structure**:
  - Centered horizontally, positioned ~100px above the bottom viewport edge (just above the contextual prompt).
  - High-polish brass & charcoal plate (`GameSheet tone="slate"`).
  - Left icon: Circular action medallion with action sprite (`plant`, `water`, `harvest`, `board`, etc.).
  - Header: Action title (`Watering soil…`, `Harvesting carrot…`, `Boarding vessel…`).
  - Meter bar: Smooth horizontal progress track with leading spark/glow.
  - Right label: Exact timing progress (e.g., `0.8s / 1.5s · 53%`).
  - Footer caption: `[Esc] or move to cancel`.
  - Complete support for all 12 authored actions in `FarmingActionController.ts`.

### 6.3 Smart Labor Action Prompts (`src/ui/hud/SmartActionPrompt.tsx`)
- **Visual Structure**:
  - Positioned directly above the hotbar.
  - Floating pill badge with translucent dark ink backing (`rgba(15, 23, 42, 0.92)`) and gold filigree accents.
  - Left keycap: Embossed 3D keycap (`[E]`) with slight bevel.
  - Center copy:
    - Bold action verb (e.g. `Harvest`, `Board`, `Talk to`).
    - Target entity name (e.g. `Winter Carrot`, `Rowboat`, `Mayor Aldous`).
  - Right badge: **Labor Cost Medallion**:
    - Circular or pill chip: `IconEnergy` + `-5 Work`.
    - Colored emerald green if affordable, crimson red with warning icon if player work capacity is insufficient.
  - Secondary hint: Subtle muted text (e.g. `· Right-click to Inspect`).

### 6.4 Planting Seed Belt Selector (`src/ui/components/PlantingSeedBar.tsx`)
- **Visual Enhancements**:
  - Docked directly above the Agronomy hotbar when farm placement mode is active (`mode === "farm-placement"`).
  - Horizontal tray of owned seed cards with:
    - Seed icon from `uiAtlas`.
    - Quantity badge.
    - **Seasonal Compatibility Icon**:
      - Green leaf/sprout icon if the current season is one of the crop's viable seasons (`crop.growthSeasons.includes(clock.season)`).
      - Red snowflake / caution icon if out of season (with tooltip: `Out of season: growth penalty`).
    - **Soil Suitability Hint**:
      - Displays climate/soil match note (e.g. `Ideal for coastal loam`, `Dry soil requires heavy watering`).
    - Selection indicator with active gold border.
    - Keyhint `[LMB] Plant · [Esc] Cancel`.

---

## 7. Concrete Implementation Recommendations & Roadmap

### Phase 1: Simulation Contracts & Presentation DTO (Zero UI Regressions)
1. **Extend Contracts**:
   - Add `CompassMarkerDto`, `HudContractDto`, `HudStatusChipDto`, `ContextualStanceId`, `ContextualHotbarSlotDto` to `src/simulation/core/contracts.ts`.
2. **Implement Presentation Builders**:
   - In `src/simulation/presentation/WorldHudPresentation.ts`:
     - Implement `detectContextualStance(state: GameState): ContextualStanceId`.
     - Implement `buildCompassMarkers(state: GameState): CompassMarkerDto[]`.
     - Implement `buildHudContracts(state: GameState): HudContractDto[]`.
     - Implement `buildStatusChips(state: GameState): HudStatusChipDto[]`.
     - Implement `buildContextualHotbar(state: GameState, stance: ContextualStanceId, selectedCropId: string | null): ContextualHotbarSlotDto[]`.
3. **Verify Pure Simulation Tests**:
   - Ensure existing tests (`npm test`) pass with zero regressions.

### Phase 2: Modular Component Authoring under `src/ui/hud/`
1. Author `PlayerUnitFrame.tsx` (top-left).
2. Author `NauticalCompassAlmanac.tsx` (top-right).
3. Author `MicroMenuPurseBar.tsx` (bottom-right).
4. Author `SmartContextualToolbar.tsx` (bottom-center).
5. Author `SmartActionPrompt.tsx` (bottom-center).
6. Extract and author `src/ui/components/FarmingActionStatus.tsx`.
7. Enhance `src/ui/components/PlantingSeedBar.tsx` with seasonal and soil indicators.
8. Enhance `src/ui/QuestTrackerHUD.tsx` with active contracts section.

### Phase 3: Integration into `HUD.tsx` and `GameUI.tsx`
1. Re-wire `HUD.tsx` to mount the 5 cluster subcomponents at `edge="top-left"`, `edge="top-right"`, `edge="bottom-left"`, `edge="bottom-center"`, `edge="bottom-right"`.
2. Clean up legacy scattered widgets in `HUD.tsx`.
3. Update `GameUI.tsx` to use the modular `FarmingActionStatus`.

### Phase 4: CSS Layering & Styling Polish
1. Add styling rules to `src/ui/coastal.css` and `src/ui/hud.css` using existing tokens (`--ui-slate`, `--ui-brass`, `--ui-gold`, `--ui-teal`, `--ui-ink`).
2. Verify responsive scaling and touch target minimums (48px) for mobile.

### Phase 5: Verification & Acceptance
1. `npm run typecheck` — 0 compiler errors.
2. `npm test` — all existing unit tests pass.
3. Add `tests/unit/mmo_hud_r1_r2.test.ts` testing:
   - Player Unit Frame rendering, labor/stamina values, status chip active states.
   - Nautical Compass angle rotations, cardinal bearings, marker calculations.
   - Collapsible tracker story quest and delivery contract toggling.
   - Micro-Menu modal invocations, purse counter, and capacity badges.
   - Contextual Stance switching across all 4 modes.
   - Viewport coverage assertions proving <25% on 1080p and 720p.

---

