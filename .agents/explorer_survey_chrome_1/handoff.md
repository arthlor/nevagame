# Survey & Architecture Report: Modern-Medieval UI Chrome, Tokens & Assets

**Agent**: Explorer 1 (`explorer_survey_chrome_1`)  
**Mission**: Survey UI chrome architecture, global CSS files, design tokens, asset pipeline for UI atlas sprites (`public/assets/ui/atlas`), and establish the Clean Modern-Medieval fantasy theme implementation blueprint.  
**Date**: 2026-08-27  

---

## 1. Observation

### 1.1 UI Chrome & CSS Files
- **`src/ui/chrome/Chrome.tsx`** (241 lines):
  - Exports core chrome primitives:
    - `ChromePanel`: Renders container frames with tones (`"plaque" | "dock" | "ghost" | "scroll" | "timber"`), optional brass rivets (`.chrome-rivet`), corner flourishes (`.chrome-flourish` using `UI_CHROME.corner_leaf` / `UI_CHROME.corner_rope`), wax seal (`.chrome-wax-seal`), and ribbon banner (`.chrome-ribbon-banner`).
    - `ChromeButton`: Button component with variants (`"primary" | "secondary" | "gold" | "danger" | "ghost"`).
    - `ChromeClose`: Circular close button with brass rim.
    - `ChromeKeycap`: Keycap badge for keyboard shortcuts (`[E]`, `[Space]`).
    - `ChromeDivider`: Ornate horizontal rule with diamond centerpiece (`<span /><i /><span />`).
    - `ChromeMeter`: Horizontal or vertical progress/vitals meters for `labor`, `sprint`, `hull`, `fishing`, `danger`, `gold`, `stamina`.
    - `ChromeQuality`: Renders quality medal icon (`normal`, `silver`, `gold`, `iridium`) with label.
    - `ChromeAlert`: Status alert banner (`caution`, `danger`, `success`, `guild`).
    - `ChromeSlot`: Interactive or static item/tool slot supporting `filled`, `quantity`, `selected`, and keyboard/click handlers.
- **`src/ui/chrome/chrome.css`** (1,601 lines, 33.3 KB):
  - Owns component class definitions for chrome panels, buttons, meters, slots, dialogue avatars, quickbars, and modals.
  - Currently styles panels with light parchment (`var(--ui-paper)` / `#f5f2e9`), dark brown frame borders (`#3e2723`), and brass corners.
- **`src/ui/styles.css`** (7,388 lines, 153.2 KB):
  - Owns global `:root` design tokens, base typography, modal overlays, layouts, tables, and component-specific legacy styles.
  - Currently contains light parchment color variables: `--ui-paper: #f5f2e9`, `--ui-paper-light: #fbf7ee`, `--ui-paper-deep: #e6d9b8`, `--ui-ink: #2c2118`, `--ui-ink-soft: #5c4a3a`, `--ui-rule: rgba(62, 39, 35, 0.42)`, `--ui-brass: #c4a46a`, `--ui-leather: #6b4428`, `--ui-teal: #3f6b73`, `--ui-moss: #667955`, `--ui-red: #9a574a`.
- **`src/ui/hud.css`** (2,374 lines, 48.7 KB):
  - Owns HUD layout styling for top-left (severe weather alerts, quest tracker), top-right (clock widget, purse gold, menu toggle), bottom-left (vitals meter tray), bottom-center (hotbar toolbelt, interaction prompt banners, boat piloting panel).
- **`src/ui/fishing/BasicFishingMinigame.css`** (787 lines, 17.5 KB):
  - Owns fishing minigame overlay styling: cast power card, bite alert banner, tension meter, vertical water track, green catch bar, and catch summary.

### 1.2 UI Atlas & Sprite Catalog
- **Manifest**: `assets/ui/ui-atlas.manifest.json` (353 lines) defines:
  - Output size: 256x256 keyed sprites with alpha transparency validation.
  - 19 Sprite Families (123 sprites total):
    1. `fish` (12 sprites): `fish-carp.png`, `fish-trout.png`, `fish-perch.png`, `fish-catfish.png`, `fish-pike.png`, `fish-arowana.png`, `fish-mackerel.png`, `fish-tuna.png`, `fish-sturgeon.png`, `fish-sailfish.png`, `fish-swordfish.png`, `fish-blue_marlin.png`.
    2. `seed` (8 sprites): `seed-wheat.png`, `seed-barley.png`, `seed-corn.png`, `seed-tomato.png`, `seed-potato.png`, `seed-carrot.png`, `seed-flax.png`, `seed-apple_sapling.png`.
    3. `produce` (8 sprites): `produce-wheat.png`, `produce-barley.png`, `produce-corn.png`, `produce-tomato.png`, `produce-potato.png`, `produce-carrot.png`, `produce-flax.png`, `produce-apple.png`.
    4. `plant` (8 sprites): `plant-wheat.png`, `plant-barley.png`, `plant-corn.png`, `plant-tomato.png`, `plant-potato.png`, `plant-carrot.png`, `plant-flax.png`, `plant-apple_tree.png`.
    5. `growth` (4 sprites): `growth-seeded.png`, `growth-growing.png`, `growth-mature.png`, `growth-withered.png`.
    6. `supply` (10 sprites): `item-ground_grain.png`, `item-bait_worms.png`, `item-chum_bucket.png`, `item-basic_lure.png`, `item-fish_scraps.png`, `item-basic_fertilizer.png`, `item-compost_starter.png`, `item-plant_matter.png`, `item-boat_fuel.png`, `item-crushed_ice.png`.
    7. `quality` (4 sprites): `quality-normal.png`, `quality-silver.png`, `quality-gold.png`, `quality-iridium.png`.
    8. `gis` (5 sprites): `gis-moist.png`, `gis-dry.png`, `gis-harvest-ready.png`, `gis-growing.png`, `gis-prepared.png`.
    9. `portrait` (4 sprites): `portrait-elspeth.png`, `portrait-barnaby.png`, `portrait-silas.png`, `portrait-maeve.png`.
    10. `weather` (9 sprites): `weather-clear.png`, `weather-overcast.png`, `weather-light-rain.png`, `weather-rain.png`, `weather-storm.png`, `weather-fog.png`, `weather-wind.png`, `weather-thermometer.png`, `weather-wave.png`.
    11. `time` (4 sprites): `time-sun.png`, `time-moon.png`, `time-dawn.png`, `time-dusk.png`.
    12. `tool` (6 sprites): `tool-hoe.png`, `tool-watering_can.png`, `tool-bait.png`, `tool-rod.png`, `tool-pickaxe.png`, `tool-basket.png`.
    13. `menu` (6 sprites): `menu-backpack.png`, `menu-journal.png`, `menu-ledger.png`, `menu-compass.png`, `menu-expedition.png`, `menu-menu.png`.
    14. `status` (3): `status-coin.png`, `status-labor.png`, `status-warning.png`.
    15. `world` (3): `world-sprout.png`, `world-fish.png`, `world-boat.png`.
    16. `action` (10): `action-plant.png`, `action-water.png`, `action-harvest.png`, `action-processing.png`, `action-pickup.png`, `action-place.png`, `action-workstation.png`, `action-cast.png`, `action-board.png`, `action-dock.png`.
    17. `behavior` (6): `behavior-run.png`, `behavior-dive.png`, `behavior-surface.png`, `behavior-burst.png`, `behavior-shake.png`, `behavior-tiring.png`.
    18. `mapnode` (8): `mapnode-homestead.png`, `mapnode-garden.png`, `mapnode-village.png`, `mapnode-river_crossing.png`, `mapnode-river.png`, `mapnode-harbor.png`, `mapnode-lighthouse.png`, `mapnode-offshore.png`.
    19. `chrome` (4): `chrome-demand_up.png`, `chrome-demand_down.png`, `chrome-corner_leaf.png`, `chrome-corner_rope.png`.
    - Textures (1): `parchment-grain.png` (512x512 seamless tile).
- **Pipeline Scripts**:
  - `tools/ui/codegen.mjs`: Reads manifest and generates typed maps in `src/ui/chrome/uiAtlas.generated.ts`.
  - `tools/ui/publish-atlas.mjs`: Validates transparency and copies sprites from `assets/ui/atlas/` to `public/assets/ui/atlas/`.
  - `npm run assets:sync`: Runs `art:codegen && ui:codegen && ui:publish` seamlessly.

### 1.3 UI Component Inventory
All UI files in `src/ui/` and `src/ui/components/`:
1. `Chrome.tsx` & `chrome.css` (Primitives: Panels, Buttons, Slots, Meters, Keycaps, Dividers, Seals, Alerts)
2. `AtlasImage.tsx` (Sprite image renderer with native sizes and zero distortion)
3. `uiAtlas.ts` & `uiAtlas.generated.ts` (Resolvers for items, fish, portraits, tools, weather, time, GIS, growth, quality)
4. `HUD.tsx` (In-Game Split-Corners RPG HUD, Weather/Clock, Purse, Hotbar, Vitals, Boat Pilot)
5. `QuestTrackerHUD.tsx` (Pinned Quest Tracker with ribbon header and collapsible tasks)
6. `InventoryModal.tsx` (Guild Satchel: Velvet slots, inspection panel, capacity gauge)
7. `MarketModal.tsx` (Merchant Plaza: Shopkeeper dialogue, Buy/Sell tabs, price trends, transaction sliders)
8. `JournalModal.tsx` (Guild Chronicle: Quests, Bestiary, Field Notes, Masteries, Guide)
9. `WorldMapModal.tsx` (Ornate framed cartography, regional paths, POI markers)
10. `LogisticsLedgerModal.tsx` (Trade routes, contracts, commodity arbitrage)
11. `DialogueModal.tsx` (NPC plaque, portrait, typewriter dialogue, medieval choice ribbons)
12. `EscapeMenuModal.tsx` (Dark slate pause menu, audio sliders, game settings, save/quit)
13. `StartScreen.tsx` (Atmospheric fantasy title screen, game mode selection, controls modal)
14. `ExpeditionBoard.tsx` (Expedition planning and supply loading)
15. `BasicFishingMinigameWidget.tsx` & `BasicFishingMinigame.css` (Tension gauge, cast meter, bite alert)
16. `FishingHUD.tsx` (Sport fishing HUD: behavior cues, stamina gauges, tension indicator)
17. `PlantingSeedBar.tsx` (Docked velvet seed carousel with slot counts and active glow)
18. `FarmGISLegend.tsx` (Soil moisture/growth stage field-sign legend)
19. `FarmForecastPopover.tsx` (Weather forecast cards, wind/sea condition readouts)
20. `CatchInspectionModal.tsx` (Landed catch toast & trophy celebration card)
21. `ContextualHintCard.tsx` (Tactile medieval toast & tutorial hints)
22. `HudIcons.tsx` (Icon components wrapping `AtlasImage` with atlas sprite mappings)
23. `HudDecorations.tsx` (SVG decorations: corner flourishes, ornate dividers, keycaps, compass dial)
24. `GameUI.tsx` (Main UI composition container wiring state to all HUD and modal overlays)

### 1.4 Audio Hooks
- `src/audio/AudioManager.ts` defines audio cues:
  - `ui-click` (button clicks, slot selection)
  - `ui-confirm` (actions, purchases, deliveries)
  - `ui-open` (modal opens, window reveals)
  - `ui-cloth` / `page-turn` (tab switches, journal folio flips)
- `gameAudio` is an exported singleton ready to be called on UI interactions.

---

## 2. Logic Chain

1. **Current Theme Gap**:
   - The current UI styling uses flat light parchment (`#f5f2e9`, `--ui-paper`) and simple brown frames (`#3e2723`) across both HUD and modal windows.
   - The user request requires a transition to a **Clean Modern-Medieval fantasy game aesthetic** (inspired by *The Witcher 3* and *Manor Lords*).
   - This requires deep translucent dark slate backgrounds, fine dark timber frames, crisp gold-leaf filigree borders and corners, velvet-lined item slot wells, ornate brass divider rules, and glowing active states.

2. **Design Token Hierarchy**:
   - Establishing a central token set in `src/ui/styles.css` `:root` enables all downstream components (`Chrome.tsx`, `HUD.tsx`, modals, minigames) to share consistent materials without duplicating color hex codes or shadow matrices.
   - Preserving backward compatibility with existing variable names (`--ui-paper`, `--ui-brass`, `--ui-ink`, `--color-surface`, etc.) while introducing structured `--mm-*` (Modern-Medieval) tokens ensures zero regression during incremental modal styling.

3. **Atlas Sprite Integration**:
   - All 123 sprites in `public/assets/ui/atlas` are transparent PNGs (e.g. tools, produce, seeds, fish, weather glyphs, NPC portraits).
   - In the new dark slate & velvet slots, sprites need subtle drop-shadow filters (`filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))`), metallic slot bezels, and velvet backgrounds (`radial-gradient(...)`) to pop vividly with rich tactile contrast.

4. **Procedural CSS & SVG Decoration Architecture**:
   - Rather than relying on heavy external raster assets that risk blurry scaling or 404s, the medieval flourishes, gold-leaf filigree corners, embossed keycaps, brass divider rules, and celestial dials are best built using crisp, scalable SVG components in `HudDecorations.tsx` combined with layered procedural CSS in `chrome.css`.
   - This provides crisp pixel fidelity at all DPRs, zero extra network requests, and smooth GPU-accelerated transitions.

5. **Audio Interaction Wiring**:
   - Connecting `gameAudio.playOneShot("ui-click")` to button and slot interactions, `gameAudio.playBank("ui-open")` to modal reveals, `gameAudio.playOneShot("ui-cloth")` / `"page-turn"` to tab flips, and `gameAudio.playOneShot("ui-confirm")` to purchases and deliveries fulfills Requirement R5 and brings game feel to AAA standard.

---

## 3. Caveats

- **Read-Only Scope**: This report is purely an architectural survey and specification plan; no files in `src/` have been modified during this exploration.
- **Simulation Invariance**: The UI remains strictly presentation-only, consuming `GameState` via props and emitting user intent through action callbacks without mutating game state directly.
- **Atlas Catalog Completeness**: All 123 sprites in the manifest are verified and existing in `public/assets/ui/atlas/`. No sprite IDs are missing from the codegen adapter.

---

## 4. Conclusion & Implementation Plan

### 4.1 Modern-Medieval Design Token Specification

```css
:root {
  /* Surface & Container Translucencies */
  --mm-slate-900: #0c1017;
  --mm-slate-800: #141b24;
  --mm-slate-700: #1c2633;
  --mm-slate-glass: rgba(14, 20, 28, 0.90);
  --mm-slate-glass-elevated: rgba(22, 30, 42, 0.94);
  --mm-slate-glass-subtle: rgba(12, 17, 24, 0.75);

  /* Fine Timber & Wood Trim */
  --mm-timber-dark: #1b120c;
  --mm-timber-mid: #2c1d14;
  --mm-timber-light: #442d1f;
  --mm-timber-gradient: linear-gradient(180deg, #2a1c13 0%, #170f0a 100%);
  --mm-timber-border: 2px solid #4a3224;

  /* Gold-Leaf, Filigree & Brass */
  --mm-gold-leaf: #d4af37;
  --mm-gold-bright: #f0dd9a;
  --mm-gold-burnished: #aa820a;
  --mm-gold-dark: #63450e;
  --mm-gold-glow: rgba(212, 175, 55, 0.45);
  --mm-gold-border: 1.5px solid #d4af37;
  --mm-gold-filigree-rim: 
    inset 0 0 0 1px rgba(240, 221, 154, 0.6),
    inset 0 0 0 2.5px rgba(20, 14, 10, 0.8),
    0 0 0 1px #805e26;

  /* Velvet Wells (Sunken Slot Interiors) */
  --mm-well-slate: radial-gradient(ellipse at 50% 50%, #16202c 0%, #0a0e14 100%);
  --mm-well-crimson: radial-gradient(ellipse at 50% 50%, #2e1014 0%, #120507 100%);
  --mm-well-emerald: radial-gradient(ellipse at 50% 50%, #11261b 0%, #06120b 100%);
  --mm-well-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.75), inset 0 0 0 1px rgba(0, 0, 0, 0.6);

  /* Typography & Colors */
  --mm-text-ivory: #f5f0e6;
  --mm-text-gold: #f0dd9a;
  --mm-text-muted: #9e9589;
  --mm-text-dim: #6e675d;
  --font-serif: "Crimson Pro", "Lora", Georgia, "Times New Roman", serif;
  --font-sans: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Multi-Layered Tactical Shadows */
  --mm-shadow-modal: 0 24px 64px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(212, 175, 55, 0.25);
  --mm-shadow-panel: 0 12px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  --mm-glow-active: 0 0 16px rgba(212, 175, 55, 0.55);
  --mm-glow-cyan: 0 0 16px rgba(78, 205, 196, 0.45);
}
```

### 4.2 Tactical Chrome Primitive Enhancements (`Chrome.tsx` & `chrome.css`)
- **`ChromePanel`**:
  - `tone="slate"`: Dark slate translucency (`backdrop-filter: blur(12px)`), fine timber header/border, gold filigree corners.
  - `tone="timber"`: Rich carved dark wood texture with brass studs and gold inlays.
  - `tone="scroll"`: Authentic aged parchment with burned edges and wax seal.
  - `tone="dock"`: Sleek minimal slate glass for HUD widgets.
- **`ChromeSlot`**:
  - Velvet recessed well styling with deep inner shadow.
  - Embossed gold slot numbers in the top-left corner.
  - Active/hover state: warm amber aura glow (`box-shadow: 0 0 12px var(--mm-gold-glow)`), border illumination (`#f0dd9a`).
  - Drop-shadow filter on contained sprite image so icons float gracefully over the velvet bed.
- **`ChromeButton`**:
  - `variant="primary"`: Deep navy/slate velvet fill with burnished brass border and gold text.
  - `variant="gold"`: Metallic gold-leaf gradient with embossed text and tactile active depression.
  - `variant="secondary"`: Translucent dark slate with fine gold border.
  - `variant="danger"`: Deep crimson velvet with gold studs.
  - Micro-interactions: scale(1.02) on hover with subtle brightness boost and tactile translateY(1px) on active.
- **`ChromeMeter`**:
  - Brass framed track with ornate endcaps.
  - Labor: Emerald green crystal gradient (`#34d399` to `#059669`) with specular sheen.
  - Sprint / Stamina: Cyan sapphire gradient (`#38bdf8` to `#0284c7`).
  - Danger / Tension: Ruby gradient (`#f87171` to `#dc2626`).
  - Gold: Liquid gold shimmer (`#facc15` to `#ca8a04`).
- **`ChromeDivider`**:
  - Ornate horizontal rule with center diamond flourish and brass gradient fade (`linear-gradient(90deg, transparent, #d4af37 50%, transparent)`).
- **`ChromeKeycap`**:
  - Tactile medieval stone/bone/brass keycap badge with 3D bottom bevel and crisp typography.

### 4.3 SVG Flourish & Asset Kit (`HudDecorations.tsx`)
Expand and enhance SVG components:
1. `FiligreeCornerTL` / `FiligreeCornerTR` / `FiligreeCornerBL` / `FiligreeCornerBR`: Author intricate gold filigree brackets for modal and panel corners.
2. `OrnateBrassDivider`: Etched horizontal divider with central medieval leaf/diamond flourish.
3. `CelestialTimeDial`: Rotating sun/moon celestial dial with compass rose and brass rim.
4. `MedallionPurse`: Ornate golden purse medallion holding the gold readout.
5. `EmbossedKeycap`: Tactile 3D keycap badge (`[E]`, `[Space]`, `[1]..[5]`).

### 4.4 Audio Micro-Interaction Mapping (`uiAudio.ts` / `Chrome.tsx`)
Create a lightweight UI audio utility module:
- Button hover / click: `gameAudio.playOneShot("ui-click")`
- Modal open: `gameAudio.playBank("ui-open")`
- Modal close: `gameAudio.playOneShot("ui-click")`
- Tab switch / Folio flip: `gameAudio.playOneShot("ui-cloth")` or `gameAudio.playOneShot("page-turn")`
- Trade / Purchase / Gold transaction: `gameAudio.playOneShot("ui-confirm")`
- Tool select: `gameAudio.playOneShot("ui-click")`

---

## 5. Verification Method

To independently verify the architecture, assets, and token integrity:

1. **Verify Asset Pipeline Synchronization**:
   ```bash
   npm run assets:sync
   ```
   *Expected output*: `[NEVA CODEGEN] Catalog adapter unchanged`, `[NEVA UI] Atlas adapter unchanged`, `[NEVA UI] Published 123 sprites to public/assets/ui/atlas`.

2. **Verify TypeScript Type Integrity**:
   ```bash
   npm run typecheck
   ```
   *Expected output*: Zero TypeScript compiler errors (`tsc --noEmit` exits with 0).

3. **Verify Build & Bundle Integrity**:
   ```bash
   npm run build
   ```
   *Expected output*: Vite build completes with production bundles generated under `dist/`.

4. **Verify CSS & Layout Files**:
   - Inspect `src/ui/styles.css`, `src/ui/hud.css`, `src/ui/chrome/chrome.css`, `src/ui/fishing/BasicFishingMinigame.css`.
   - Confirm all class names and token variables map cleanly without orphaned selectors.
