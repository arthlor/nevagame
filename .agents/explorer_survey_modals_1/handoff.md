# Explorer 3 Survey Report: Modals, Audio Manager & State Contracts

## 1. Observation

### 1.1 Complete Modal & Dialog Inventory
We inspected all 14 modal, dialog, and popover components across `src/ui/`:

| Component | File Path | Triggers / Modes | Props / State Invariants | Core Responsibilities |
|---|---|---|---|---|
| **Inventory Modal** | `src/ui/InventoryModal.tsx` | `activeModal === "inventory"` (Key `I`, Pause menu) | `state: GameState`, `onClose()`, `onSelectPlantCrop(cropId)` | Satchel grid, 4 category filter tabs (All, Farming, Fishing, Supplies), item inspection pane (quantity, base value, total stack worth, category tag, starter crop planting action). |
| **Market Modal** | `src/ui/MarketModal.tsx` | `activeModal === "market"` (`E` interact at Village/Harbor stalls) | `state: GameState`, `marketId: MarketId`, `onSellItem`, `onBuySeed`, `onSellFishCargo`, `onDiscardFishCargo`, `onDeliverContractItems`, `onDeliverFishCargo`, `onClose` | Stalls (Produce seeds, fertilizers, crushed ice), batch selling (produce, fish), commodities pricing table with demand %, docked sport fish cargo sales, market intelligence (regional price arbitrage between Village & Harbor), royal guild contracts. |
| **Journal & Bestiary** | `src/ui/JournalModal.tsx` | `activeModal === "journal"` (Key `J`, Pause menu) | `state: GameState`, `onClose()`, `initialFolio?: JournalFolio` | 5 Folio tabs: Quests/Chronicles (Hero quest card, progress bar, completed annals, unlocked features), Guild Masteries (Farming, Fishing, Sailing, Trading, Crafting ranks & XP), Bestiary (discovered/silhouette fish records, catch counts, largest weight records), Field Notes (farming & market tips), How to Play Guide (`HowToPlayGuide.tsx`). |
| **World Map Modal** | `src/ui/components/WorldMapModal.tsx` | `activeModal === "map"` (Key `M`, Pause menu) | `state: GameState`, `onClose()` | SVG illuminated cartography map of Neva island, 4 lenses (Geography, Trade Guilds, Fishing Grounds, Farmlands), POI landmarks (Homestead, Village, River Crossing, River Corridor, Harbor, Lighthouse, Offshore), player position beacon, gilded compass rose, cartographer sidebar telemetry (distance, foot travel time, demand trends, fish school activity, soil fertility). |
| **Logistics Ledger** | `src/ui/components/LogisticsLedgerModal.tsx` | `activeModal === "ledger"` (Key `L`, Pause menu) | `state: GameState`, `onClose()` | Captain's financial ledger with 2 tabs: Money (Gold on hand, vessels at cost, fish at harbor prices, estimated holdings total, physical stores summary) and Cargo & Boats (Homestead plots, registered vessels, active boat spatial bay hold slots with species, weight kg, and freshness %). |
| **Expedition Board** | `src/ui/ExpeditionBoard.tsx` | `activeModal === "expedition"` (Key `P`, Pause menu when `feature.expedition_planner` unlocked) | `state: GameState`, `onClose()` | Departure readiness board: Maritime weather (conditions, temp °C, wind kn, sea roughness %), registered vessel status (condition %, hold occupancy), supplies check (chum buckets, worm bait, crushed ice), harbor fish demand rates. |
| **Dialogue Modal** | `src/ui/DialogueModal.tsx` | `activeModal === "dialogue"` (`E` interact with NPC) | `npcId: string`, `state: GameState`, `onClose()`, `onTalkNpc(npcId)`, `activeQuest: ActiveQuestDto \| null` | Character portrait avatar, speaker name, role badge, district, paginated dialogue narrative (`Space`/`Enter`/`E` advance), quest completion rewards panel (coins, items, skill XP, unlocked features). |
| **Escape Menu Modal** | `src/ui/EscapeMenuModal.tsx` | `activeModal === "pause"` (Key `Esc`) | `state: GameState`, `onClose()`, `onResetPlayerToSafePlace()`, `onQuickSave()`, navigation callbacks (`onOpenInventory`, `onOpenJournal`, `onOpenGuide`, `onOpenMap`, `onOpenLedger`, `onOpenExpedition`), `expeditionUnlocked` | Pause status plaque (region, day in season, clock time, purse gold, work capacity), menu action buttons, audio settings column (`AudioControls` sliders for Master, Music, SFX, Ambience with mute toggles). |
| **Start Screen** | `src/ui/StartScreen.tsx` | `startup.status !== "ready"` (Initial boot / reload) | `startup: StartupState`, `onStart()`, `onStartNewGame()`, `onStartWithoutSaving()`, `onRetry()` | Game boot loader (asset progress bar, status message), brand lockup ("Neva"), Harbor Log save record card (day count, season, region, saved date), main actions (Enter / Continue / Start New Game), Options dialog (audio sliders, fullscreen toggle, keybinds reference), New Game confirmation modal. |
| **Catch Summary Toast** | `src/ui/components/CatchInspectionModal.tsx` | `landedCatch !== null` (Sport fish caught) | `cargo: FishCargoState`, `harborMarket?: MarketState`, `onDismiss()` | Ephemeral catch toast with species atlas icon, weight in kg, quality badge, storage location (hand/hold), harbor price estimate, freshness %, auto-dismiss timer (5.2s). |
| **Crop Inspection** | `src/ui/GameUI.tsx` (lines 440-524) | `inspectedCrop !== null` (Targeting crop plot) | `inspection: CropInspectionDto`, `onClose?()` | Floating plaque with crop/stage atlas icon, growth status / minutes remaining, soil moisture band, climate fit, fertility band, expected yield range, labor cost. |
| **Farm Forecast Popover** | `src/ui/components/FarmForecastPopover.tsx` | Clock/Weather click in HUD | `weather: WeatherState`, `clock: ClockState`, `onClose()` | 3-slot weather forecast (Now, +2h, +5h) with weather glyphs, season name, rain %, wind kn, sea roughness %. |
| **Planting Seed Bar** | `src/ui/components/PlantingSeedBar.tsx` | `mode === "farm-placement"` | `state: GameState`, `selectedCropId`, `onSelectCrop`, `onCancel` | Bottom-docked seed selector carousel with inventory quantities, active crop highlight, climate preference chip, cancel action. |
| **Contextual Hint Card** | `src/ui/ContextualHintCard.tsx` | `activeHint !== null` (Tutorial triggers) | `hintId`, `title`, `message`, `icon?`, `onDismiss(hintId)` | Tutorial mechanic toast card with compass glyph, title, body, close button, auto-dismiss timer (7s). |

---

### 1.2 Audio Architecture & Sound Manifest
We inspected `src/audio/AudioManager.ts`, `src/audio/AudioSettings.ts`, and `assets/audio/audio-manifest.json`:

1. **Audio Engine**:
   - `AudioManager.ts` (line 98) manages the Web Audio API graph (`AudioContext`, `masterGain`, `sfxGain`, `uiGain`, `fishingGain`, `boatGain`, `ambienceGain`, `weatherGain`, `musicGain`).
   - Line 96 states: `/** Presentation-only audio. Canonical game state never waits on or reads this service. */`
   - Master volume, SFX, Ambience, and Music gains are bound to reactive `audioSettings` observables.

2. **Available UI Sound Cues in `assets/audio/audio-manifest.json`**:
   - `"ui-click"`: `bus: "ui"`, offset: 0, duration: 0.28s, gain: 0.38 (Soft UI button click)
   - `"ui-confirm"`: `bus: "ui"`, offset: 0, duration: 0.60s, gain: 0.40 (Waterdrop click / clean confirm)
   - `"ui-open"`: `bus: "ui"`, offset: 0, duration: 0.80s, gain: 0.34 (Satchel / bag open)
   - `"ui-cloth"`: `bus: "ui"`, offset: 0, duration: 1.07s, gain: 0.32 (Cloth rustle / inventory flap)
   - `"coins"`: `bus: "ui"`, offset: 0, duration: 0.95s, gain: 0.42 (Coin drop / gold trade)
   - `"page-turn"`: `bus: "ui"`, offset: 0.04s, duration: 0.90s, gain: 0.38 (Book page turn)
   - `"quest-chime"`: `bus: "ui"`, offset: 0, duration: 2.60s, gain: 0.32 (Timid quest bell chime)
   - Audio Bank `"ui-open"`: `["ui-open", "ui-cloth"]`
   - Audio Bank `"ui-click"`: `["ui-click"]`

3. **Current UI Audio Trigger Gaps**:
   - `GameApp.ts` (lines 502-514) triggers overlay sounds when opening/closing modals (`page-turn` for journal, `ui-open` for other modals, `ui-click` on close).
   - **Crucial finding**: Within React UI components (`InventoryModal`, `MarketModal`, `JournalModal`, `WorldMapModal`, `DialogueModal`, `EscapeMenuModal`, `StartScreen`, `ChromeButton`), there are currently **zero interactive sound triggers** on button clicks, tab switches, slot clicks, slider drags, or buy/sell actions.

---

### 1.3 State Contracts & Presentation Boundaries
We inspected `src/app/GameApp.ts` (lines 2664-2820), `src/app/ModeController.ts`, `src/app/ModalStack.ts`, and `src/ui/useModalAccessibility.ts`:

1. **State Ownership**:
   - `Simulation` owns 100% of canonical game state (`GameState`).
   - `GameApp` passes `state` as an immutable snapshot to `GameUI` on each animation frame.
   - UI components never mutate `state` or simulation properties directly.
   - All mutations are dispatched through typed callbacks (`onSellItem`, `onBuySeed`, `onSellFishCargo`, `onDiscardFishCargo`, `onDeliverContractItems`, `onDeliverFishCargo`, `onTalkNpc`, `onSelectPlantCrop`, `onSetActiveModal`).
   - `GameApp` wraps each callback in `this.sim.execute({ type: ... })` and displays resulting toast messages.

2. **Modal Stack & Game Loop Coordination**:
   - `ModeController.ts` uses `ModalStack` to manage active overlays (`inventory`, `market`, `journal`, `expedition`, `dialogue`, `pause`, `map`, `ledger`, `new-game-confirm`).
   - `pausesSimulation`: true for `pause` and `new-game-confirm`.
   - `blocksWorldInput`: true whenever any overlay is active.
   - `blocksHudOverlaysAndTools`: true during `basic-fishing` and `sport-fishing` minigames.

3. **Accessibility & Focus Trapping**:
   - `src/ui/useModalAccessibility.ts` provides universal focus trapping, keyboard `Escape` handling (with event interception), and focus restoration to the previously active element or `#ui-container`.

---

### 1.4 Micro-Interactions & Styling Foundations
We inspected `src/ui/chrome/Chrome.tsx`, `src/ui/chrome/chrome.css`, `src/ui/styles.css`, and `src/ui/hud.css`:
- Existing primitives: `ChromePanel` (tones: `plaque`, `scroll`, `timber`, `dock`, `ghost`), `ChromeButton` (variants: `primary`, `secondary`, `gold`, `danger`, `ghost`), `ChromeClose`, `ChromeDivider`, `ChromeMeter`, `ChromeQuality`, `ChromeAlert`, `ChromeSlot`, `AtlasImage`.
- Visual styling tokens currently rely on beige parchment backgrounds (`--ui-paper: #f5f2e9`), dark brown frame borders (`--chrome-frame: #3e2723`), brass highlights (`--ui-brass: #c4a46a`), and navy accents (`--chrome-navy: #2d4158`).

---

## 2. Logic Chain

1. **Clean Modern-Medieval Transformation Logic**:
   - The user requested a Clean Modern-Medieval aesthetic (The Witcher 3 / Manor Lords) replacing flat beige cards with dark slate and fine timber translucency (`rgba(18, 22, 20, 0.94)` / `#2a1c14`), crisp gold filigree borders, velvet-lined item slot wells, and ornate divider rules.
   - All 14 modal surfaces identified in Section 1.1 already use standard semantic containers (`ChromePanel`, `modal-header`, `modal-body`, `modal-footer`), making a unified design token and CSS overhaul cleanly applicable across all modals without altering simulation mechanics.

2. **UI Audio Architecture Logic**:
   - Because `AudioManager` (`gameAudio`) is strictly a presentation service (`AudioManager.ts:96`), importing and invoking `gameAudio.playOneShot(cueId)` from React UI event handlers is 100% compliant with the non-negotiable rule that simulation truth is separated from presentation.
   - Building a lightweight UI audio utility module (`src/ui/audio/uiAudio.ts` or helper hook `useUiAudio`) allows declarative sound invocation across all modals, tabs, buttons, slots, and transactions without duplicating audio logic.

3. **State Integrity Preservation**:
   - Because all modal interactions already pass through clean callback signatures (`onSellItem`, `onBuySeed`, etc.), restyling modal presentations and injecting audio feedback introduces **zero risk** of simulation drift or state mutation violations.

---

## 3. Caveats

- **No Caveats on Architecture**: The engine-to-UI contract is cleanly structured.
- **Audio Autoplay Policy**: Web browsers require user gesture to resume `AudioContext`. `AudioManager.ts` already handles this via `pointerdown`/`keydown` listeners on `window`. UI audio calls before user interaction gracefully resolve without errors.
- **Performance**: GameApp renders the React tree on animation frames. Modal components use `useMemo` and `useRef` for event handlers (`useModalAccessibility`) to avoid unnecessary callback reinstantiations. Any new UI audio helpers should avoid creating closure leaks or unthrottled timers.

---

## 4. Conclusion & Strategy

### 4.1 Modal Redesign Blueprint

1. **Global Modal Frame System (`ChromePanel` tone="plaque" & "timber")**:
   - **Background**: Translucent dark slate (`background: linear-gradient(180deg, rgba(24, 28, 26, 0.96) 0%, rgba(14, 18, 16, 0.98) 100%)`) with fine timber border trim.
   - **Borders & Filigree**: Crisp 1.5px gold filigree rule (`border: 1.5px solid #c4a46a`), 4-corner brass rivets (`.chrome-rivet`), and ornate corner flourishes (`UI_CHROME.corner_leaf` / `UI_CHROME.corner_rope`).
   - **Dividers**: Ornate brass rules (`.chrome-divider--ornate`) with rotating diamond crest center.

2. **Inventory Modal (`InventoryModal.tsx`)**:
   - Velvet item slot wells (`background: #111613; box-shadow: inset 0 2px 5px rgba(0,0,0,0.7); border: 1px solid rgba(196,164,106,0.3)`).
   - Category filter tabs styled as medieval illuminated ribbons with gold underline on active selection.
   - Item inspection card on right with gilded atlas well, quality gem chip, stack value pill, and gold "Plant Crop" button.
   - Audio: `ui-click` on slot selection, `page-turn` on category tab switch, `ui-cloth`/`ui-confirm` on planting.

3. **Market Modal (`MarketModal.tsx`)**:
   - Shopkeeper dialogue header with NPC title plaque and purse gold medallion (`IconCoin` in gilded pill).
   - Tabbed/column layout: Seed stall list, Commodities table with dynamic demand arrows (▲ green / ▼ red), Docked Fish Cargo cards with freshness gauge.
   - Right sidebar: Regional Market Intelligence (Village vs. Harbor price arbitrage, profit indicators).
   - Audio: `coins` on buy/sell transactions, `ui-click` on commodity selection, `ui-confirm` on batch sell.

4. **Journal & Bestiary (`JournalModal.tsx`)**:
   - 5 Folio bookmark tabs across top with leather-and-gold trim.
   - Quests folio: Act badge, quest title, illuminated progress bar, seal checkmarks.
   - Bestiary folio: Discovered fish in gilded portrait wells; undiscovered mystery silhouettes with embossed question mark.
   - Audio: `page-turn` on every folio tab switch.

5. **World Map Modal (`WorldMapModal.tsx`)**:
   - Illuminated antique parchment SVG canvas surrounded by a dark walnut/slate frame with brass corner brackets.
   - 4 Lens filter tabs (Geography, Trade Guilds, Fishing Grounds, Farmlands) styled as medieval heraldic seals.
   - Interactive POI landmark nodes with glowing selection rings and lens telemetry badges.
   - Audio: `ui-click` on landmark selection, `page-turn` on lens change.

6. **Logistics Ledger (`LogisticsLedgerModal.tsx`)**:
   - Medieval double-entry accounting ledger sheet with illuminated headers.
   - Spatial vessel hold section with numbered velvet slot wells for each cargo compartment.
   - Audio: `page-turn` on Money / Cargo tab toggle.

7. **Dialogue Modal (`DialogueModal.tsx`)**:
   - Character portrait plaque with gold-leaf filigree bevel.
   - Dark slate dialogue box with crisp gold borders, typewriter reveal, and pagination dots.
   - Quest completion rewards ribbon with gold coins, items, and skill XP badges.
   - Audio: `ui-click` / `page-turn` on dialogue advance, `quest-chime` / `ui-confirm` on quest completion.

8. **Escape Menu & Settings (`EscapeMenuModal.tsx`)**:
   - Clean dark slate pause menu plaque.
   - Brass slider tracks with circular gilded thumbs for Master, Music, SFX, Ambience volume.
   - Styled medieval keycap badges (`[Esc]`, `[I]`, `[J]`, `[M]`, `[L]`, `[P]`).
   - Audio: `ui-click` on button clicks and slider interactions.

9. **Start Screen (`StartScreen.tsx`)**:
   - Atmospheric medieval game title screen with dark slate translucent panels, gold-leaf brand rule, and illuminated typography.
   - Harbor Log save summary card with parchment texture and gold seal.
   - Options dialog with brass audio sliders and fullscreen toggle.
   - Audio: `ui-confirm` on Enter/Continue game, `ui-click` on options toggle.

---

### 4.2 UI Audio Helper Plan (`src/ui/audio/uiAudio.ts`)

```typescript
// Proposed src/ui/audio/uiAudio.ts
import { gameAudio, type AudioCueId } from "../../audio/AudioManager";

export type UiSoundType =
  | "click"      // Standard button click / slot select (ui-click)
  | "confirm"    // Confirm action / primary button (ui-confirm)
  | "open"       // Modal open / satchel open (ui-open)
  | "cloth"      // Inventory flap / seed select (ui-cloth)
  | "coins"      // Buy / sell / gold trade (coins)
  | "page-turn"  // Tab switch / folio turn / dialogue next (page-turn)
  | "chime";     // Quest complete / reward claim (quest-chime)

export function playUiSound(sound: UiSoundType | AudioCueId): void {
  try {
    switch (sound) {
      case "click":
        gameAudio.playOneShot("ui-click");
        break;
      case "confirm":
        gameAudio.playOneShot("ui-confirm");
        break;
      case "open":
        gameAudio.playBank("ui-open");
        break;
      case "cloth":
        gameAudio.playOneShot("ui-cloth");
        break;
      case "coins":
        gameAudio.playOneShot("coins");
        break;
      case "page-turn":
        gameAudio.playOneShot("page-turn");
        break;
      case "chime":
        gameAudio.playOneShot("quest-chime");
        break;
      default:
        gameAudio.playOneShot(sound as AudioCueId);
        break;
    }
  } catch (error) {
    // Presentation audio failure must never crash the UI
    console.debug("[Neva UI Audio] Sound playback skipped:", error);
  }
}
```

---

## 5. Verification Method

To independently verify these findings and confirm system health:

1. **TypeScript Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected result*: `tsc --noEmit` exits with code 0.

2. **Asset and Atlas Synchronization**:
   ```bash
   npm run assets:sync
   ```
   *Expected result*: Codegen and atlas publishing report clean sync (123 sprites published to `public/assets/ui/atlas`).

3. **Production Build**:
   ```bash
   npm run build
   ```
   *Expected result*: Vite compiles the production bundle without errors.

4. **Code Inspection of State Boundaries**:
   - Inspect `src/ui/GameUI.tsx`: verify no direct simulation mutation calls (all mutations route through `onSellItem`, `onBuySeed`, `onTalkNpc`, etc.).
   - Inspect `src/ui/useModalAccessibility.ts`: verify focus trapping and keyboard Escape handling across all dialogs.
   - Inspect `src/audio/AudioManager.ts`: verify `gameAudio` is presentation-only and exports needed sound cues.
