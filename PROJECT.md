# Project: Neva Clean Modern-Medieval UI Overhaul

## Architecture
- **Presentation-Only UI Layer**: React UI components in `src/ui/` consume immutable `GameState` snapshots and dispatch actions via typed callbacks (`GameApp.ts` -> `sim.execute(...)`). Zero simulation ownership or mutations in UI.
- **Design Token System**: Defined in `src/ui/styles.css` `:root`, `src/ui/chrome/chrome.css`, and `src/ui/hud.css`. Implements the Clean Modern-Medieval Fantasy aesthetic (inspired by *The Witcher 3* and *Manor Lords*): dark slate glass translucency (`rgba(14, 20, 28, 0.90)`), fine dark timber trim (`#2a1c13`), crisp gold-leaf filigree borders (`#d4af37`), velvet recessed slot wells (`radial-gradient`), and ornate brass dividers.
- **2D Atlas Sprite Integration**: 123 sprites across 19 families in `public/assets/ui/atlas/`, resolved via `uiAtlas.ts` and rendered via `AtlasImage.tsx` with metallic bezels and drop-shadows.
- **Procedural SVG Elements**: Scalable vector flourishes in `src/ui/HudDecorations.tsx` (gold filigree corner brackets, ornate brass dividers, celestial time dial, gold purse medallion, embossed keycaps).
- **UI Audio System**: Presentation-only sound helper in `src/ui/audio/uiAudio.ts` wiring `AudioManager.ts` cues (`ui-click`, `ui-confirm`, `ui-open`, `ui-cloth`, `coins`, `page-turn`, `quest-chime`) to interactive UI events.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | CSS Design Tokens & Base Theme | `--mm-*` surface translucencies, timber trim, gold filigree, velvet wells, brass rules, typography, shadows | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Chrome Primitives Overhaul | Upgrade `ChromePanel`, `ChromeButton`, `ChromeSlot`, `ChromeMeter`, `ChromeDivider`, `ChromeKeycap`, `ChromeClose`, `ChromeQuality`, `ChromeAlert` | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Procedural SVG Flourish & Asset Kit | Scalable gold filigree corner brackets, ornate dividers, dials in `HudDecorations.tsx` | M1 | ORIGINAL_REQUEST §R1 |
| 4 | UI Audio Helper & Primitives Wiring | `src/ui/audio/uiAudio.ts` helper and interactive click/hover/open sounds on chrome primitives | M1 | ORIGINAL_REQUEST §R5 |
| 5 | HUD Top-Left Celestial Dial & Purse | Sun/Moon celestial dial, digital time, season/day, weather glyph, temperature readout (°C), gold coin purse medallion, forecast popover | M2 | ORIGINAL_REQUEST §R2 |
| 6 | HUD Top-Right Pinned Quest Tracker | Parchment/ribbon header, collapsible objectives, progress bar, location pin, severe weather warning chips, menu button | M2 | ORIGINAL_REQUEST §R2 |
| 7 | HUD Bottom-Left Vitals & Status Cluster | Labor meter (amber/gold fill + tooltips), Sprint stamina meter (emerald/cyan fill), low labor alerts, boat panel & carried cargo | M2 | ORIGINAL_REQUEST §R2 |
| 8 | HUD Bottom-Center Tool Hotbar & Prompts | 5-slot tool quickbar with embossed brass numerals, active tool gold filigree glow, contextual interaction keycaps ([E], [Space], [F]) | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Inventory Modal (`InventoryModal.tsx`) | Velvet grid slots, item inspection pane with quantity/quality/value badges, capacity gauges, category filter ribbons | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Market Modal (`MarketModal.tsx`) | Shopkeeper dialogue header, tabbed buy/sell stalls, dynamic demand arrows (▲/▼), docked fish cargo cards, price arbitrage sidebar | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Journal & Bestiary (`JournalModal.tsx`) | 5 Folio bookmark tabs (Quests, Masteries, Bestiary, Field Notes, Guide), discovered fish wells, undiscovered mystery silhouettes | M3 | ORIGINAL_REQUEST §R3 |
| 12 | World Map Modal (`WorldMapModal.tsx`) | Framed parchment cartography, 4 heraldic lens tabs, interactive POI landmarks with glowing rings, player beacon, compass rose | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Logistics Ledger (`LogisticsLedgerModal.tsx`) | Double-entry accounting ledger sheet, spatial vessel hold section with numbered velvet slot wells, freshness gradients | M4 | ORIGINAL_REQUEST §R3 |
| 14 | Dialogue Modal (`DialogueModal.tsx`) | Character portrait plaque with gold filigree bevel, dark slate dialogue box, typewriter reveal, quest rewards ribbon | M4 | ORIGINAL_REQUEST §R3 |
| 15 | Escape Menu & Settings (`EscapeMenuModal.tsx`) | Dark slate pause plaque, brass audio sliders, medieval keycaps, save/reset actions | M4 | ORIGINAL_REQUEST §R3 |
| 16 | Start Screen (`StartScreen.tsx`) | Atmospheric fantasy title screen, brand lockup, Harbor Log save card, options dialog | M4 | ORIGINAL_REQUEST §R3 |
| 17 | Expedition Board (`ExpeditionBoard.tsx`) | Departure readiness board with weather forecast, boat integrity %, supply checklist, market demand rates | M4 | ORIGINAL_REQUEST §R3 |
| 18 | Basic Fishing Minigame Widget | 5-phase minigame: cast meter, bite alert banner, gilded water column reeling track, green catch bar, gold catch summary plaque | M5 | ORIGINAL_REQUEST §R4 |
| 19 | Sport Fishing HUD (`FishingHUD.tsx`) | Dark slate plaque, illuminated 3-zone tension gauge, fish stamina bar, tactile action buttons (`[W] Reel`, `[Space] Brace`, `[S] Slack`) | M5 | ORIGINAL_REQUEST §R4 |
| 20 | Boat Piloting HUD (`HUD.tsx`) | Speed in knots, sea condition, hull integrity meter, boat cargo hold grid with fresh-to-stale gradient indicators | M5 | ORIGINAL_REQUEST §R4 |
| 21 | Farming & Seed Dock (`PlantingSeedBar.tsx`) | Docked velvet seed carousel, botanical framing, quantity counter badge, gold selection glow | M5 | ORIGINAL_REQUEST §R4 |
| 22 | Farm GIS Legend & Crop Inspection | Soil moisture/growth status badges, herbalist inspection plaque with growth minutes, climate fit, fertility, yield | M5 | ORIGINAL_REQUEST §R4 |
| 23 | Contextual Notifications & Toasts | Dark slate & gold toast banners, CatchSummaryToast, auto-dismiss hints | M5 | ORIGINAL_REQUEST §R4 |
| 24 | Micro-Interaction Polish & Sound Wiring | Smooth CSS transitions, active glows, focus rings, complete audio cue integration across all modals and overlays | M5 | ORIGINAL_REQUEST §R5 |
| 25 | Verification & Build Certification | `npm run typecheck`, `npm run assets:sync`, `npm run build` | M6 | ORIGINAL_REQUEST §Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Visual Theme, Tokens & Chrome Primitives | CSS Tokens, `Chrome.tsx`, `chrome.css`, `styles.css`, `HudDecorations.tsx`, `uiAudio.ts` | none | DONE |
| M2 | Classic RPG Split-Corners In-Game HUD | `HUD.tsx`, `QuestTrackerHUD.tsx`, `hud.css`, `FarmForecastPopover.tsx` | M1 | DONE |
| M3 | Slate & Gold Ornate Modals (Part A) | `InventoryModal.tsx`, `MarketModal.tsx`, `JournalModal.tsx`, `WorldMapModal.tsx`, `HowToPlayGuide.tsx` | M1 | DONE |
| M4 | Slate & Gold Ornate Modals (Part B) | `LogisticsLedgerModal.tsx`, `DialogueModal.tsx`, `EscapeMenuModal.tsx`, `StartScreen.tsx`, `ExpeditionBoard.tsx` | M1 | DONE |
| M5 | Tactile Overlays, Minigames & Audio Polish | `BasicFishingMinigameWidget.tsx`, `BasicFishingMinigame.css`, `FishingHUD.tsx`, `PlantingSeedBar.tsx`, `FarmGISLegend.tsx`, `CatchInspectionModal.tsx`, `ContextualHintCard.tsx`, `GameUI.tsx` | M1, M2 | DONE |
| M6 | Final Verification & Build Certification | Full test suite, typecheck, asset sync, production build | M1, M2, M3, M4, M5 | DONE |

## Interface Contracts
### UI Chrome ↔ Components
- `ChromePanel`: `<ChromePanel tone="slate" | "timber" | "scroll" | "dock" | "ghost" header={...} footer={...} rivets={true} corners={true}>`
- `ChromeSlot`: `<ChromeSlot filled={boolean} quantity={number} selected={boolean} rarity={...} badge={...} onClick={...} onSelect={...}>`
- `ChromeMeter`: `<ChromeMeter variant="labor" | "sprint" | "hull" | "fishing" | "danger" | "gold" value={number} max={number} showValue={boolean}>`
- `ChromeButton`: `<ChromeButton variant="primary" | "secondary" | "gold" | "danger" | "ghost" size="sm" | "md" | "lg" onClick={...}>`
- `ChromeKeycap`: `<ChromeKeycap keyName="E" | "Space" | "W" | "S" | "Esc" glow={boolean} />`

### UI Audio Helper
- `playUiSound(sound: "click" | "confirm" | "open" | "cloth" | "coins" | "page-turn" | "chime" | AudioCueId): void`

### Engine ↔ UI Presentation Boundary
- `GameUI`: Receives `state: GameState`, `promptText: string | null`, `toastMessage?: string | null`, `activeModal: ActiveModal`, `activeQuest: ActiveQuestDto | null`, `inspectedCrop: CropInspectionDto | null`, and action callbacks.
- All actions route via `GameApp.ts` to `sim.execute(...)`. Zero state mutation inside UI components.

## Code Layout
- `src/ui/chrome/Chrome.tsx` — Chrome primitives implementation
- `src/ui/chrome/chrome.css` — Chrome component styles
- `src/ui/chrome/uiAtlas.ts` — Atlas sprite mapping resolvers
- `src/ui/styles.css` — Global CSS tokens, modal layouts, tables
- `src/ui/hud.css` — In-game HUD layout & overlays
- `src/ui/modals.css` — M3+ slate-and-gold modal cascade
- `src/ui/overlays.css` — M5 overlay cascade winner (imported last after `modals.css`)
- `src/ui/HudDecorations.tsx` — Procedural SVG gold filigree corners, dividers, dials, keycaps
- `src/ui/audio/uiAudio.ts` — UI sound effect dispatcher
- `src/ui/HUD.tsx` — Main split-corners in-game HUD
- `src/ui/QuestTrackerHUD.tsx` — Top-Right pinned quest tracker
- `src/ui/InventoryModal.tsx` — Satchel modal
- `src/ui/MarketModal.tsx` — Merchant stall & commodities modal
- `src/ui/JournalModal.tsx` — Guild chronicle & bestiary modal
- `src/ui/components/WorldMapModal.tsx` — Illuminated map modal
- `src/ui/components/LogisticsLedgerModal.tsx` — Financial & cargo ledger modal
- `src/ui/DialogueModal.tsx` — NPC dialogue modal
- `src/ui/EscapeMenuModal.tsx` — Pause menu modal
- `src/ui/StartScreen.tsx` — Game title & load screen
- `src/ui/ExpeditionBoard.tsx` — Expedition planner modal
- `src/ui/fishing/BasicFishingMinigameWidget.tsx` — Starter fishing minigame
- `src/ui/fishing/BasicFishingMinigame.css` — Fishing minigame styles
- `src/ui/FishingHUD.tsx` — Sport fishing encounter HUD
- `src/ui/components/PlantingSeedBar.tsx` — Seed selection dock
- `src/ui/components/FarmGISLegend.tsx` — GIS legend
- `src/ui/components/FarmForecastPopover.tsx` — Weather forecast popover
- `src/ui/components/CatchInspectionModal.tsx` — Landed catch toast
- `src/ui/ContextualHintCard.tsx` — Mechanics toast
- `src/ui/GameUI.tsx` — UI root composition container
