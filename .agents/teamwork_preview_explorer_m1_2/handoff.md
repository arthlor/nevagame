# Milestone M1 Architectural Handoff: Contextual Toolbar, Action Channeling & Smart Prompts

> **Agent**: `teamwork_preview_explorer_m1_2`  
> **Target Subsystem**: Milestone M1 (F2.1 Smart Contextual Stance Toolbar, F2.2 Action Channeling Cast Bar, F2.3 Smart Labor Action Prompts, F2.4 Planting Seed Belt Selector)  
> **Parent**: `orchestrator_4` (`6ec9cade-1e48-47ab-a126-866fd7c1f1f4`)  
> **Target Worker**: `worker_m1`

---

## 1. Observation

### 1.1 Existing Component Inventory & Code Map
Direct inspection of the codebase revealed existing modular implementations of all four target features:
- **F2.1 Smart Contextual Stance Toolbar**: `src/ui/hud/SmartContextualToolbar.tsx` (195 lines), consumed in `src/ui/HUD.tsx` (lines 370–376).
- **F2.2 Action Channeling Cast Bar**: `src/ui/components/FarmingActionStatus.tsx` (91 lines), consumed in `src/ui/GameUI.tsx` (lines 381–383).
- **F2.3 Smart Labor Action Prompts**: `src/ui/hud/SmartActionPrompt.tsx` (156 lines), consumed in `src/ui/HUD.tsx` (lines 359–363).
- **F2.4 Planting Seed Belt Selector**: `src/ui/components/PlantingSeedBar.tsx` (175 lines), consumed in `src/ui/GameUI.tsx` (lines 388–395).

### 1.2 Stance Derivation Logic
In `src/simulation/presentation/WorldHudPresentation.ts` (lines 48–60):
```typescript
export function detectContextualStance(state: GameState): ContextualStanceId {
  if (state.player.activeBoatId) {
    return "maritime";
  }
  if (findFarmIdAtWorld(state.player.x, state.player.z) !== null) {
    return "agronomy";
  }
  const fishing = WorldLayout.fishingAccessAt(state.player.x, state.player.z);
  if (fishing && fishing.habitat !== null) {
    return "angling";
  }
  return "explorer";
}
```
And `buildContextualHotbar(state, stance, selectedCropId)` generates 5 slots per stance (Agronomy, Angling, Maritime, Explorer) with sub-meters for watering can (10/10), vessel hull integrity (%), and fuel tank (%).

### 1.3 Channeling Action Timings and Work Costs
In `src/app/FarmingActionController.ts` (lines 78–91):
`AUTHORED_ACTION_TIMINGS` maps all 12 authored presentation actions (`plant`, `water`, `fertilize`, `harvest`, `processing-start`, `processing-collect`, `pickup`, `place`, `workstation`, `cast`, `board`, `dock`) to `{ durationMs: number; commitMs: number }` based on catalog clip contracts.
In `src/simulation/domains/FarmingDomain.ts` (lines 48–54):
`FARMING_ACTION_COST` defines canonical work costs:
```typescript
export const FARMING_ACTION_COST = {
  plant: 12,
  water: 5,
  harvest: 30,
  fertilize: 8,
  irrigate: 8
} as const;
```
Fishing costs 15 Work (`BASIC_FISHING_WORK_COST = 15`), and workstation processing costs 35 Work.

In `FarmingActionStatus.tsx`, currently only integer percentage (`{percent}%`) and status caption (`Channeling…` / `Completing action…`) are displayed. The exact timing readout (`1.2s / 2.0s · 60%`), commit marker threshold tick, and Work cost badge are not yet rendered.

### 1.4 Prompt Text Duplication Issue
In `src/ui/hud/SmartActionPrompt.tsx` (lines 58–105 & 137–151):
When the raw prompt is `"[E] Fertilize soil · 8 Work"`, `parsed.fullLabel` is assigned `"Fertilize soil · 8 Work"`, while `parsed.laborCost` is `8`.
`SmartActionPrompt` renders `{parsed.fullLabel}` in `.prompt-action-description` and simultaneously renders `<span className="prompt-labor-cost-value">-{parsed.laborCost} Work</span>`. This produces visually duplicate text:
`[E] Fertilize soil · 8 Work [-8 Work]`
The labor cost should be sanitized from the description text when the labor badge is rendered.

### 1.5 Crop Catalog Discrepancy & Atlas Gap in PlantingSeedBar
In `src/ui/components/PlantingSeedBar.tsx` (lines 18–59):
`CROP_SEASON_MAP` contains a non-existent crop (`crop.pumpkin`) and omits 3 of the 10 canonical crops defined in `src/content/crops.ts`:
- `crop.flax` (seasons: `["spring", "summer"]`)
- `crop.apple_tree` (seasons: `["spring", "autumn"]`, regrows: `true`)
- `crop.olive_tree` (seasons: `["summer", "autumn"]`, regrows: `true`)

Furthermore, in `src/content/crops.ts` (line 148), the seed item for Olive Tree is `seed.olive_sapling`. In `src/ui/chrome/uiAtlas.generated.ts` (line 38), the sprite key is `seed.olive_pit`. In `src/ui/chrome/uiAtlas.ts`, `atlasForSeedItem("seed.olive_sapling")` looks up `UI_SEEDS["seed.olive_sapling"]`, which returns `undefined`. An alias `"seed.olive_sapling": "seed.olive_pit"` is missing from `ITEM_SPRITE_ALIASES`.

### 1.6 Current Test and Build Verification
Executed commands and results:
- `npx vitest run tests/unit/hud_m1.test.ts` -> 9/9 tests passed (1.17s)
- `npm run typecheck` -> TypeScript compiled cleanly with 0 errors

---

## 2. Logic Chain

1. **Stance Purity**:
   - `detectContextualStance` is 100% pure query on `GameState` and static world coordinates.
   - However, if a player is in an active boat AND initiates fishing (`state.basicFishing !== null` or `state.sportFishing !== null`), the boat check currently overrides angling. Prioritizing active fishing over boat navigation ensures the hotbar switches to Angling gear while fighting a catch.

2. **Icon Quality & Visual Homogeneity**:
   - `SmartContextualToolbar.tsx` currently falls back to Unicode emojis (`🌱`, `🧺`, `🪝`, `🐟`, `🤲`, `🎒`, `🗺️`, `🏮`) for 8 slots.
   - Neva has authored atlas sprites and SVG icons in `HudIcons.tsx` (`IconBasket`, `IconFish`, `IconSatchel`, `IconJournal`) and `AtlasImage` with `UI_SUPPLIES` (`item.basic_fertilizer`, `item.basic_lure`). Replacing emojis with atlas assets ensures visual consistency with Neva's faceted low-poly art bible (`LLM/04`).

3. **MMO Cast Bar Polish**:
   - Because `AUTHORED_ACTION_TIMINGS[action.action]` is available synchronously with `durationMs` and `commitMs`, the elapsed seconds can be deterministically calculated as `(action.progress * timing.durationMs) / 1000`.
   - The commit marker percentage is `(timing.commitMs / timing.durationMs) * 100`. Placing an authored tick mark at this position visually communicates the "point of no return" where the action cannot be cancelled by movement or Esc.
   - Mapping `action.action` to its canonical Labor cost (`12` for plant, `5` for water, `8` for fertilize, `30` for harvest, `15` for cast, `35` for workstation) enables an integrated Work Cost chip in the cast bar header.

4. **Prompt Text Sanitization**:
   - Splitting raw prompt text into `rawKey`, `verb`, `target`, `laborCost`, and `cleanLabel` ensures that the Work cost is displayed once in the dedicated labor badge, with color-coded warning when player labor is insufficient.

5. **Seed Belt Completeness & Atlas Resolution**:
   - Expanding `CROP_SEASON_MAP` to cover all 10 canonical crops (`wheat`, `barley`, `corn`, `tomato`, `potato`, `carrot`, `flax`, `apple_tree`, `sunflower`, `olive_tree`) guarantees that every seed purchased in markets or given in quests has seasonal hints and soil suitability telemetry.
   - Mapping `seed.olive_sapling` to `seed.olive_pit` in `ITEM_SPRITE_ALIASES` fixes the missing seed icon in the dock.

---

## 3. Caveats

1. **Placement Mode Exclusivity**:
   - When `mode === "farm-placement"`, `HUD.tsx` hides `SmartContextualToolbar` and `GameUI.tsx` renders `PlantingSeedBar`. This is intentional to prevent UI stacking and keep screen coverage under 20%.
2. **Animation Clip Commit Markers**:
   - `AUTHORED_ACTION_TIMINGS` relies on animation clip metadata. For any action without a one-shot clip, it falls back to default 1.5s duration.
3. **No Direct Simulation Mutation**:
   - Hotbar slots and seed belt clicks emit presentation events (`onSelectSlot`, `onSelectCrop`), but gameplay mutations remain strictly inside `GameApp.ts` and `Simulation.ts`.

---

## 4. Conclusion & Implementation Plan for Worker M1

### 4.1 Proposed Refinements by Component

#### A. `SmartContextualToolbar.tsx`
- **Props**:
  ```typescript
  export interface SmartContextualToolbarProps {
    stance: ContextualStanceId;
    hotbar: readonly ContextualHotbarSlotDto[];
    activeSlot: number;
    onSelectSlot?: (slot: number) => void;
    className?: string;
  }
  ```
- **Updates**:
  - Replace emoji slot icons with `HudIcons` / `AtlasImage`:
    - `harvest` -> `<IconBasket size={24} />`
    - `fish` -> `<IconFish size={24} />`
    - `satchel` -> `<IconSatchel size={24} />`
    - `journal` -> `<IconJournal size={24} />`
    - `fertilizer` -> `<AtlasImage src={UI_SUPPLIES["item.basic_fertilizer"]} size={24} />`
    - `lure` -> `<AtlasImage src={UI_SUPPLIES["item.basic_lure"]} size={24} />`
  - Add gold corner brackets on `.hud-hotbar-slot.is-active`.
  - Add smooth stance transition fade animation between stance loadouts.

#### B. `FarmingActionStatus.tsx`
- **Props**:
  ```typescript
  export interface FarmingActionStatusProps {
    action: FarmingActionSnapshot;
    className?: string;
  }
  ```
- **Updates**:
  - Import `AUTHORED_ACTION_TIMINGS` from `../../app/FarmingActionController`.
  - Compute `elapsedSec = (action.progress * timing.durationMs) / 1000` and `totalSec = timing.durationMs / 1000`.
  - Display timing readout: `<span className="cast-bar-timing">{elapsedSec.toFixed(1)}s / {totalSec.toFixed(1)}s · {percent}%</span>`.
  - Render commit marker tick: `<div className="cast-bar-commit-marker" style={{ left: `${commitPercent}%` }} />`.
  - Render Labor badge if `workCost > 0`: `<span className="cast-bar-work-chip"><IconEnergy size={12} /> -{workCost} Work</span>`.
  - Display cancel cue when interruptible: `Move or press <kbd>Esc</kbd> to cancel`.
  - Display committed cue when committed: `Committed · Finishing…`.

#### C. `SmartActionPrompt.tsx`
- **Props**:
  ```typescript
  export interface SmartActionPromptProps {
    promptText: string | null;
    toastMessage?: string | null;
    touchChrome?: boolean;
    currentWork?: number;
    className?: string;
  }
  ```
- **Updates**:
  - Sanitize `fullLabel` to strip `· X Work` and `(-X Work)`.
  - Render verb in bold and target in distinct span:
    `<strong className="prompt-verb">{parsed.verb}</strong> <span className="prompt-target">{parsed.target}</span>`.
  - If `currentWork !== undefined && parsed.laborCost != null && currentWork < parsed.laborCost`, add `.is-insufficient` class with warning color and tooltip `Insufficient Work Capacity`.

#### D. `PlantingSeedBar.tsx` & `uiAtlas.ts`
- **Updates**:
  - In `src/ui/chrome/uiAtlas.ts`, add `"seed.olive_sapling": "seed.olive_pit"` to `ITEM_SPRITE_ALIASES` and check `ITEM_SPRITE_ALIASES` in `atlasForSeedItem`.
  - In `PlantingSeedBar.tsx`, update `CROP_SEASON_MAP` to include all 10 canonical crops:
    - `crop.wheat`: spring, summer, autumn
    - `crop.barley`: spring, autumn
    - `crop.corn`: summer
    - `crop.tomato`: spring, summer
    - `crop.potato`: spring, autumn, winter
    - `crop.carrot`: autumn, winter, spring
    - `crop.flax`: spring, summer
    - `crop.apple_tree`: spring, autumn (regrows)
    - `crop.sunflower`: summer
    - `crop.olive_tree`: summer, autumn (regrows)
    Remove unused `crop.pumpkin`.
  - Add quick hotkey hints `[1]`, `[2]`, `[3]` for seed selection.

---

## 5. Verification Method

To independently verify these components:

1. **Unit Test Verification**:
   ```bash
   npx vitest run tests/unit/hud_m1.test.ts
   ```
   Must pass all 9 test cases covering stance detection, prompt rendering, cast bar channeling, and seed bar suitability.

2. **TypeScript Type Safety**:
   ```bash
   npm run typecheck
   ```
   Must compile with 0 errors across all UI files.

3. **Visual Viewport Assertion**:
   Ensure total persistent HUD area remains strictly below 20% on 720p (actual ~16%) and 10% on 1080p (actual ~7.1%), verified by `hud_m1.test.ts` viewport audit.
