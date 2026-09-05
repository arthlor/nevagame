# Milestone M2 UI Architecture Handoff Report: F3.3, F3.4, and F3.5

**Working Directory**: `/Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_explorer_m2_2`  
**Author**: `teamwork_preview_explorer_m2_2`  
**Parent Agent**: `orchestrator_4` (`6ec9cade-1e48-47ab-a126-866fd7c1f1f4`)  
**Scope**: 
- **F3.3 Trophy Catch Inspection Card & Toast** (`CatchInspectionModal.tsx`, `CatchSummaryToast.tsx`)
- **F3.4 Contextual Hint Cards** (`ContextualHintCard.tsx`)
- **F3.5 Notice Stack & Weather Hazards** (`NoticeStack.tsx`, weather warnings)

---

## 1. Observation

### 1.1 F3.3: Current Catch Presentation & Domain State
1. **Existing Component State**:
   - `src/ui/components/CatchInspectionModal.tsx` contains only `CatchSummaryToast` (53 lines). There is **no modal dialog or popover card** named `CatchInspectionModal`:
     ```tsx
     // src/ui/components/CatchInspectionModal.tsx:16
     export const CatchSummaryToast: React.FC<CatchSummaryToastProps> = ({ cargo, onDismiss }) => {
     ```
   - Currently, `CatchSummaryToast` renders a compact `GameSheet` with species name, weight (kg), `ChromeQuality`, storage label ("Carried by hand" or "Stowed in hold"), and freshness percentage, auto-dismissing after 5,200 ms.
   - Missing required features: species portrait frame, calculated fish length (cm), star quality tier badges (★☆☆☆ to ★★★★), live freshness shelf-life countdown, calculated market trade value in Gold, and personal best record badges.
2. **Simulation Event & State Pipeline**:
   - `src/simulation/domains/CargoDomain.ts:60-86`: Evaluates personal records upon landing a sport fish:
     ```ts
     const priorBest = record.catchCount > 0 ? record : null;
     let catchRecord: "first" | "weight" | "quality" | undefined;
     if (!priorBest) catchRecord = "first";
     else if (fish.weightKg > (priorBest.largestWeightKg ?? 0)) catchRecord = "weight";
     else if (qualityRank(fish.quality) > qualityRank(priorBest.bestQuality)) catchRecord = "quality";
     ```
   - `src/simulation/core/EventBus.ts:40`: `FishLanded` event emits:
     ```ts
     FishLanded: { cargoId: FishCargoId; speciesId: FishSpeciesId; ecologyId: FishingEcologyId; boatId?: BoatId; weightKg: number; quality: FishQuality; record?: "first" | "weight" | "quality"; minute: GameMinute };
     ```
   - **Crucial Runtime Limitation in GameApp**: In `src/app/GameApp.ts:1512-1515`:
     ```ts
     const carriedId = this.sim.state.player.carriedFishCargoId;
     if (carriedId && this.sim.state.fishCargo[carriedId]) {
       this.pendingCatchCargo = this.sim.state.fishCargo[carriedId];
     }
     ```
     - **Bug/Gap A**: If the player lands a fish from a vessel and it is auto-stowed into the vessel cargo hold (`location.type === "boat-hold"`), `player.carriedFishCargoId` is `null`, causing `this.pendingCatchCargo` to remain `null`. The catch is never presented!
     - **Bug/Gap B**: The `record` field (`"first" | "weight" | "quality"`) from the `FishLanded` event is used only to construct a transient chat string (`line 1510`), but is discarded before reaching `this.pendingCatchCargo` or `GameUIProps.landedCatch`.
3. **Fish Species & Pricing Formulas**:
   - `src/content/types.ts:87-106`: `FishSpeciesDefinition` owns `weightKg: { min, average, max }`, `baseMarketValue`, `baseDecayRatePerMinute`, `minimumRodClass`, `cargoClass`, and `habitats`.
   - Fish length is not explicitly stored on fish definitions or cargo instances; standard ichthyological allometric cubic scaling $L \propto \sqrt[3]{W}$ is required to estimate length in cm consistently.
   - `src/simulation/economy/calculateFishValue.ts:41-79`: `calculateFishPrice(species, weightKg, quality, freshness, demandIndex, seasonalModifier)` owns the canonical formula for fish valuation.

---

### 1.2 F3.4: Contextual Hint Cards
1. **Existing Component State**:
   - `src/ui/ContextualHintCard.tsx` (129 lines) exists at the root of `src/ui/`, not in `src/ui/components/ContextualHintCard.tsx` as planned in `PROJECT.md:76`.
   - It takes:
     ```ts
     export interface ContextualHintCardProps {
       hintId: string;
       title: string;
       message: string;
       icon?: string;
       onDismiss: (hintId: string) => void;
       captureEscape?: boolean;
     }
     ```
   - Auto-dismisses using dynamic reading-speed calculation:
     ```ts
     export function hintVisibleMs(message: string): number {
       return Math.min(15000, Math.max(5000, message.length * 40));
     }
     ```
   - Pauses countdown when hovered or focused (`data-held="true"`), and dismisses on `Escape`, `Enter`, or `Space`.
2. **Current Hint Coverage in Runtime**:
   - In `src/app/GameApp.ts`, hints are triggered on first occurrence via `this.showContextualHint()` and recorded in `sim.questDomain`:
     - `hint.cargo_freshness` (line 1518): "The Catch Is Perishable" (sport fishing landing)
     - `hint.season_turn` (line 1595): "The Season Turns" (calendar change)
     - `hint.farming_plant` (line 3237): "Field Cultivation" (entering placement mode)
     - `hint.farming_water` (line 3581): "Crop Hydration" (watering dry soil)
     - `hint.work_capacity` (line 3605): "Work Capacity" (first crop harvest)
     - `hint.boat_steering` (line 3635): "Rowboat/Skiff Navigation" (boarding vessel)
     - `hint.fishing_sport` (line 3724): "Sport Fishing" (hooking sport school)
     - `hint.processing_wait.*` (line 3764): Mill/Compost job wait times
     - `hint.fishing_basic` (line 3873): "River Angling" (charging basic rod cast)
3. **Identified Missing Polish**:
   - Cards lack category identification badges (e.g. `[NAVIGATION]`, `[ANGLING]`, `[AGRONOMY]`, `[MARITIME]`).
   - Cards lack visible keyboard shortcut hints (e.g. `[Esc] Dismiss` keycap).
   - Styles in `src/ui/overlays.css:38-48` position the hint at `top: calc(118px + env(safe-area-inset-top, 0px))`, directly beneath the top-left player frame.

---

### 1.3 F3.5: Notice Stack & Weather Hazards
1. **Notice Stack (`src/ui/components/NoticeStack.tsx` & `src/ui/notifications.ts`)**:
   - `NoticeQueue` supports tones: `"info" | "success" | "warning" | "danger" | "reward"`.
   - Max 3 visible notices (`NOTICE_MAX_VISIBLE`), auto-pruned based on tone duration floors (1200ms–3000ms).
   - Consecutive identical notices coalesce into `notice.count` badges (`x2`, `x3`).
   - Retains exiting notices with `.is-exiting` for 200 ms (`NOTICE_EXIT_MS`) to allow smooth CSS exit animations.
   - **Gaps**: Notices currently only take raw text strings. There is no structured presentation for:
     - **Item gains/losses**: e.g., `+3 Winter Carrot`, `-1 Crushed Ice`, with item icon.
     - **Labor shifts**: e.g., `-12 Work`, `+200 Work (Rested)`, or low-labor warnings.
     - **Gold/Money transactions**: e.g., `+85 G (Produce Sold)`.
2. **Weather Hazards in Simulation & Presentation**:
   - `src/simulation/presentation/WorldHudPresentation.ts:540-549`:
     ```ts
     const hazard =
       weather.type === "storm"
         ? { text: "Storm Warning", tone: "danger" as const }
         : weather.type === "fog" && weather.visibility < 0.5
           ? { text: "Dense Fog", tone: "caution" as const }
           : weather.windSpeed >= 11
             ? { text: "Gale Winds", tone: "caution" as const }
             : weather.seaRoughness >= 0.7
               ? { text: "Rough Swell", tone: "caution" as const }
               : null;
     ```
   - Currently rendered inside `src/ui/hud/NauticalCompassAlmanac.tsx:196-206` as a small inline chip (`.hud-weather-chip`).
   - **Gaps**: Requirement F3.5 demands prominent top-right warning banners for maritime hazards (dense fog, squall, storm waves) with actionable maritime navigation advice, not merely a 14px text chip.

---

## 2. Logic Chain

### 2.1 F3.3: Trophy Catch Inspection Card & Toast
1. **Separation of Concerns (Celebratory Modal vs Compact Toast)**:
   - Observation 1.1.1 shows only `CatchSummaryToast` exists in `CatchInspectionModal.tsx`.
   - When an angler lands a large sport fish after an intense fight, ArcheAge/Palia UX requires an immediate, rewarding celebratory moment: the full trophy inspection card.
   - However, during rapid repetitive fishing or when minimized, a floating compact toast is preferred.
   - Therefore, the codebase should provide two complementary components:
     1. `CatchInspectionModal.tsx`: A centered celebratory popover modal card.
     2. `CatchSummaryToast.tsx`: A lightweight, non-modal notification toast with quick stats and an "Inspect" action.
2. **DTO Design (`TrophyCatchDto`)**:
   - In accordance with the purity rule (LLM/01 §16 & PROJECT.md §Architecture), UI components must never compute pricing formulas, fish biology, or decay math inline.
   - Observation 1.1.2 shows that `cargoId` and `record` are generated in `CargoDomain.ts` during `FishLanded`.
   - We introduce a pure DTO `TrophyCatchDto` constructed via a simulation helper `buildTrophyCatchDto(cargo, record, demandModifier)`:
     - `speciesPortrait`: Atlas image URL via `atlasForFish(cargo.speciesId)`.
     - `weightKg`: Formatted to 2 decimal places.
     - `lengthCm`: Evaluated deterministically via allometric scaling $L = L_{\text{base}} \cdot \sqrt[3]{W / W_{\text{avg}}}$.
     - `quality`: `"common" | "fine" | "exceptional" | "trophy"`, mapped to 1–4 stars.
     - `freshnessPercent`: 0–100% integer.
     - `freshnessTone`: `"pristine" | "fresh" | "stale" | "spoiled"`.
     - `shelfLifeMinutes`: Estimated time until fish reaches 0% freshness.
     - `estimatedValue`: Calculated via `calculateFishPrice`.
     - `personalBest`: Optional badge for `"first"` (New Species), `"weight"` (Heaviest Catch), or `"quality"` (Finest Grade).
     - `storageLocationLabel`: "Stowed in Vessel Hold" vs "Carried by Hand".
3. **Resolving the GameApp Auto-Stow & Record Discard Bug**:
   - Observation 1.1.2 demonstrated that `GameApp.ts:1512` loses catches stowed directly into boat holds and drops the `record` argument.
   - By updating `GameApp.ts` event handler for `FishLanded({ cargoId, record })`:
     ```ts
     const cargo = this.sim.state.fishCargo[cargoId];
     if (cargo) {
       this.pendingCatchCargo = cargo;
       this.pendingCatchRecord = record ?? null;
     }
     ```
   - This ensures all catches—whether hand-carried or boat-stowed—trigger the trophy modal with their proper record badge.

---

### 2.2 F3.4: Contextual Hint Cards Architecture
1. **Module Placement & Backward Compatibility**:
   - Observation 1.2.1 notes `ContextualHintCard.tsx` is currently at `src/ui/ContextualHintCard.tsx`.
   - It should be located at `src/ui/components/ContextualHintCard.tsx` alongside `NoticeStack.tsx` and `CropInspection.tsx`, with `src/ui/ContextualHintCard.tsx` maintaining a re-export for backwards compatibility.
2. **Enhancing Visual Ergonomics & Polish**:
   - Discovery tips span three core pillars: **Boating Navigation**, **Sport Fishing Mechanics**, and **Soil Care & Agronomy**.
   - Props should accept an optional `category: "boating" | "angling" | "farming" | "weather" | "general"`.
   - Each category receives a distinct brass filigree badge and category icon (e.g. Ship Wheel for boating, Crossed Fishhooks for angling, Sprout for agronomy).
   - An embossed `[Esc]` keycap badge informs the player that pressing Escape immediately dismisses the tip.
   - Accessibility features (`aria-live="polite"`, reading-time pause on hover/focus, minimum 44px touch targets) must be preserved.

---

### 2.3 F3.5: Notice Stack & Weather Hazards Architecture
1. **Rich Floating Notifications for Item & Labor Deltas**:
   - Observation 1.3.1 reveals `NoticeStack` handles only plain strings.
   - In a cozy MMO, seeing immediate tactile feedback for production activities is critical:
     - `+3 Winter Carrot [Harvest]`
     - `-12 Work [Planting]`
     - `+200 Work [Rested until Morning]`
     - `+85 G [Produce Sold]`
   - We extend `Notice` to include structured metadata:
     ```ts
     export type NoticeKind = "standard" | "item" | "labor" | "money" | "hazard";
     export interface NoticeDelta {
       kind: "item" | "labor" | "money";
       amount: number; // positive = gain (+), negative = loss (-)
       label: string;
       itemId?: string;
       icon?: string;
     }
     ```
   - `NoticeStack.tsx` inspects `notice.delta` to render:
     - Signed delta badges (`+` green, `-` amber/red).
     - Specialized icon (Atlas item thumbnail for items, `IconEnergy` for labor, `IconCoin` for money).
2. **Top-Right Maritime Warning Banners**:
   - Observation 1.3.2 notes weather hazards are currently compressed into a 14px chip in the compass.
   - Maritime hazards (dense fog, squall winds, rough storm waves) are dangerous conditions in Neva where visibility drops and small vessels risk damage or drifting off course.
   - We introduce a dedicated component: `WeatherHazardBanner.tsx` mounted directly under the Nautical Compass in the top-right cluster (`src/ui/HUD.tsx`):
     - **Dense Fog**: Caution banner, Foghorn icon, "Visibility restricted to <50m. Rely on nautical compass bearings."
     - **Squall / Gale Winds**: Caution banner, Wind arrow icon, "Gale-force gusts (>22 kn). High vessel drift; steer into wind."
     - **Storm Waves / Rough Swell**: Danger banner, Pulsing wave alert, "Hazardous sea swell (>0.70). Small craft risk taking hull damage."

---

## 3. Proposed Concrete Component Architecture & DTOs

### 3.1 DTO Contracts (`src/simulation/core/contracts.ts` / Presentation Models)

```ts
// ============================================================================
// F3.3 Trophy Catch Presentation DTO
// ============================================================================
export interface TrophyCatchDto {
  cargoId: string;
  speciesId: string;
  speciesName: string;
  habitats: string[];
  cargoClass: "small" | "medium" | "large" | "gargantuan";
  weightKg: number;
  lengthCm: number;
  quality: "common" | "fine" | "exceptional" | "trophy";
  qualityStars: 1 | 2 | 3 | 4;
  freshnessPercent: number;
  freshnessLossPerMinute: number;
  estimatedShelfLifeMinutes: number;
  estimatedMarketValue: number;
  record: "first" | "weight" | "quality" | null;
  storageDestination: "player-carry" | "boat-hold" | "boat-hook" | "cold-storage";
  storageLocationLabel: string;
}

// ============================================================================
// F3.4 Contextual Hint Types
// ============================================================================
export type HintCategory = "boating" | "angling" | "farming" | "weather" | "general";

export interface ContextualHintDto {
  hintId: string;
  title: string;
  message: string;
  category: HintCategory;
  icon?: string;
  shortcutKey?: string;
}

// ============================================================================
// F3.5 Structured Notices & Maritime Hazard DTOs
// ============================================================================
export type NoticeCategory = "standard" | "item" | "labor" | "money" | "hazard";

export interface NoticeDelta {
  kind: "item" | "labor" | "money";
  amount: number;
  label: string;
  itemId?: string;
  icon?: string;
}

export interface MaritimeHazardDto {
  hazardId: "dense-fog" | "squall" | "storm-waves" | "storm";
  title: string;
  severity: "caution" | "danger";
  conditionLabel: string;
  navigationalAdvisory: string;
  speedPenaltyPercent?: number;
}
```

---

### 3.2 Component Props & Implementation Contracts

#### 1. `CatchInspectionModal.tsx` (`src/ui/components/CatchInspectionModal.tsx`)
```tsx
export interface CatchInspectionModalProps {
  catchData: TrophyCatchDto;
  onDismiss: () => void;
  onOpenHoldOrSatchel?: () => void;
}

export const CatchInspectionModal: React.FC<CatchInspectionModalProps> = ({
  catchData,
  onDismiss,
  onOpenHoldOrSatchel
}) => {
  // 1. Accessibility trap & escape/space keyboard listeners
  // 2. Celebratory header with "SPORT CATCH LANDED!"
  // 3. Left pane: AtlasImage portrait, quality medallion, star tier (1-4)
  // 4. Right pane: Weight (kg), Length (cm), Market Value (Gold coin), Freshness gauge
  // 5. Personal Best badge banner if record is present
  // 6. Action buttons: "Stow & Continue [Space]" and "Inspect Hold [L]"
};
```

#### 2. `CatchSummaryToast.tsx` (`src/ui/components/CatchSummaryToast.tsx`)
```tsx
export interface CatchSummaryToastProps {
  catchData: TrophyCatchDto;
  onDismiss: () => void;
  onClick?: () => void;
}

export const CatchSummaryToast: React.FC<CatchSummaryToastProps> = ({
  catchData,
  onDismiss,
  onClick
}) => {
  // 1. Auto-dismiss timer: 5,200ms
  // 2. Compact single/dual-line coastal pill
  // 3. Fish thumbnail + name + weight + quality stars + freshness percent
  // 4. Click opens full CatchInspectionModal
};
```

#### 3. `ContextualHintCard.tsx` (`src/ui/components/ContextualHintCard.tsx`)
```tsx
export interface ContextualHintCardProps {
  hintId: string;
  title: string;
  message: string;
  category?: HintCategory;
  icon?: string;
  shortcutKey?: string;
  onDismiss: (hintId: string) => void;
  captureEscape?: boolean;
}

export const ContextualHintCard: React.FC<ContextualHintCardProps> = ({
  hintId,
  title,
  message,
  category = "general",
  icon = "✦",
  shortcutKey = "Escape",
  onDismiss,
  captureEscape = true
}) => {
  // 1. Dynamic reading duration: min 5s, max 15s (40ms/char)
  // 2. Pause on hover/focus: data-held="true"
  // 3. Category badge (e.g. [BOATING], [ANGLING], [SOIL CARE])
  // 4. Shortcut pill: [Esc] Dismiss
  // 5. Progress bar indicator
};
```

#### 4. `NoticeStack.tsx` (`src/ui/components/NoticeStack.tsx`)
```tsx
export interface NoticeStackProps {
  notices: readonly Notice[];
}

export const NoticeStack: React.FC<NoticeStackProps> = ({ notices }) => {
  // 1. Up to 3 visible notices, sorted by priority (danger > warning > reward > labor > success > info)
  // 2. Renders item deltas (+3 Winter Carrot) with Atlas thumbnail
  // 3. Renders labor shifts (-12 Work / +200 Work) with energy spark styling
  // 4. Retains exiting notices for 200ms with .is-exiting
  // 5. Coalescing duplicate counts
};
```

#### 5. `WeatherHazardBanner.tsx` (`src/ui/components/WeatherHazardBanner.tsx`)
```tsx
export interface WeatherHazardBannerProps {
  hazard: MaritimeHazardDto | null;
  onDismiss?: () => void;
}

export const WeatherHazardBanner: React.FC<WeatherHazardBannerProps> = ({ hazard, onDismiss }) => {
  // 1. Anchored under top-right Nautical Compass & Almanac
  // 2. Renders prominent caution/danger banner for Dense Fog, Squall, Storm Waves
  // 3. Visual warning icon, advisory text, and navigation effect
};
```

---

## 4. Caveats

1. **Length Formulation Is Authoritative Presentation, Not Stored Physics**:
   - In `src/simulation/core/types.ts:660-671`, `FishCargoState` persists `weightKg`, `quality`, and `cargoClass`, but does **not** persist `lengthCm`.
   - Length is an estimated presentation value derived from allometric cubic scaling. It must not be added to saved `GameState` to avoid schema migrations.
2. **Fish Pricing Demand Signal**:
   - In open waters away from a market dock, `calculateFishPrice` defaults to neutral demand ($1.00\times$). When near a dock, local market demand signals are used.
3. **No Combat or Hostile Nautical Monsters**:
   - In accordance with Neva's core non-negotiable rules, weather hazards represent environmental navigational challenges (drift, reduced visibility, hull stress), **never** sea monster attacks or combat encounters.
4. **Persistent HUD Budget**:
   - Persistent HUD elements must stay under 20–25% screen coverage on 1080p and 720p. `WeatherHazardBanner` and `CatchInspectionModal` are contextual and temporary; they do not count toward persistent HUD coverage.

---

## 5. Conclusion

1. **F3.3**: Split current stub `CatchInspectionModal.tsx` into a true celebratory popover card modal (`CatchInspectionModal.tsx`) and an accompanying HUD toast (`CatchSummaryToast.tsx`), powered by a pure `TrophyCatchDto` with allometric length scaling and personal best record badges. Fix `GameApp.ts:1512` so vessel-stowed catches and `record` arguments are preserved.
2. **F3.4**: Elevate `ContextualHintCard.tsx` with category insignia badges (Boating, Angling, Agronomy, Weather), visible `[Esc]` shortcut badges, reading-length timers with hover pause, and place it cleanly in `src/ui/components/`.
3. **F3.5**: Upgrade `NoticeStack.tsx` to handle structured item gain/loss deltas and labor shifts, and introduce `WeatherHazardBanner.tsx` in the top-right cluster for maritime hazards (dense fog, squall, storm waves).

---

## 6. Verification Method

To verify the proposed implementation when written, run:

1. **Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected*: Zero TypeScript compilation errors.
2. **Existing Unit Tests**:
   ```bash
   npx vitest run tests/unit/adversarial_m2_hud.test.ts tests/unit/uiModals.test.ts
   ```
   *Expected*: All existing HUD and modal tests pass.
3. **Dedicated New Test Suite**: `tests/unit/m2_inspectors_and_notices.test.ts`
   - Test `CatchInspectionModal` renders species portrait, weight, calculated length, 1–4 quality stars, freshness gauge, and personal best badges ("first", "weight", "quality").
   - Test `CatchSummaryToast` auto-dismisses after 5,200 ms and triggers inspection on click.
   - Test `ContextualHintCard` handles reading time calculations (min 5s, max 15s), pause on hover, and dismiss on `Escape`/`Enter`/`Space`.
   - Test `NoticeStack` formats item deltas (`+3 Carrot`), labor shifts (`-12 Work`), and priority ordering.
   - Test `WeatherHazardBanner` renders caution for Dense Fog (<0.5 vis) and Gale Squalls (>=11 m/s), and danger for Storm Waves (>=0.7 seaRoughness).
4. **Build Verification**:
   ```bash
   npm run build
   ```
   *Expected*: Clean production Vite build with 0 bundling errors.
