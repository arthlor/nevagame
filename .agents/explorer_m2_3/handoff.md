# Milestone M2 Investigation & Architecture Report: In-Game Split-Corners HUD CSS Styling & Layout

## 1. Observation

### 1.1 CSS Cascade & Specificity Conflict in `src/ui/hud.css`
- **File**: `src/main.ts` (Lines 2–4):
  ```typescript
  import "./ui/styles.css";
  import "./ui/chrome/chrome.css";
  import "./ui/hud.css";
  ```
  `hud.css` is imported **last** in the stylesheet cascade.
- **File**: `src/ui/hud.css` (Lines 3–10 & Lines 42–51):
  ```css
  #ui-container {
    --hud-tray: rgba(245, 242, 233, 0.96);
    --hud-well: #3a281c;
    --hud-well-rim: #1c140e;
    --hud-tray-shadow:
      inset 0 0 0 2px rgba(196, 164, 106, 0.95),
      0 6px 16px rgba(44, 33, 24, 0.3);
  }

  #ui-container .hud-clock-widget,
  #ui-container .hud-tool-belt,
  #ui-container .hud-vitals-tray,
  #ui-container .quest-tracker-hud-wood,
  #ui-container .hud-weather-chip,
  #ui-container .interaction-prompt,
  #ui-container .hud-toast-pill,
  #ui-container .hud-context-note,
  #ui-container .hud-boat-panel,
  #ui-container .planting-dock-shell,
  #ui-container .fishing-hud-container,
  #ui-container .farming-action-status,
  #ui-container .farm-gis-legend {
    color: var(--ui-ink);
    background-color: var(--hud-tray) !important;
    background-image: var(--chrome-grain) !important;
    background-size: 220px 220px !important;
    background-repeat: repeat !important;
    border: 1.5px solid var(--chrome-frame) !important;
    border-radius: 6px;
    box-shadow: var(--hud-tray-shadow) !important;
    text-shadow: none;
  }
  ```
  **Direct Impact**: The `#ui-container ... !important` selector in `hud.css` has higher specificity than `chrome.css` primitive classes (`.chrome-panel--slate`, `.chrome-panel--dock`, `.chrome-slot`). As a result, all HUD plaques, toolbars, vitals trays, and prompt pills are forced to render as flat, opaque beige paper cards (`rgba(245, 242, 233, 0.96)`) with dark brown ink and thick brown frame borders, clobbering the intended Modern-Medieval translucent dark slate glass (`--mm-slate-glass`), gold filigree, and backdrop blur.

### 1.2 Layout & 4-Corner Split Positioning
- **Root Container & Overlay Structure**:
  - `src/ui/styles.css` (Lines 207–219):
    ```css
    #ui-root {
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 10;
      pointer-events: none;
    }
    .interactive {
      pointer-events: auto;
    }
    ```
  - `src/ui/GameUI.tsx` (Line 211):
    ```tsx
    <div id="ui-container" tabIndex={-1} style={{ width: "100%", height: "100%", position: "relative" }}>
    ```
- **Top-Left Corner** (`.hud-top-left-container`, `.hud-top-left`):
  - `src/ui/hud.css` (Lines 53–75):
    - `position: absolute; top: var(--ui-safe-top); left: var(--ui-safe-left); z-index: 10; width: min(280px, calc(100vw - 120px)); pointer-events: none;`
    - Child `.hud-top-left` has `pointer-events: auto; display: flex; flex-direction: column; align-items: flex-start; gap: 6px;`
  - In `HUD.tsx`, Top-Left contains `{severeAlert && ...}` and `{showQuest && <QuestTrackerHUD ... />}` or the Celestial Sun/Moon dial & Purse medallion depending on the layout routing.
- **Top-Right Corner** (`.hud-top-right-cluster`, `.hud-top-right`):
  - `src/ui/hud.css` (Lines 158–180):
    - `position: absolute; top: var(--ui-safe-top); right: var(--ui-safe-right); z-index: 10; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;`
    - Contains `.hud-clock-widget` (Clock face, Season/Day, Time, Purse medallion `hud-purse-note`) and `.hud-menu-button` (game menu trigger), plus `.forecast-popover` positioned below it.
- **Bottom-Left Corner** (`.hud-bottom-left`, `.hud-vitals`):
  - `src/ui/hud.css` (Lines 355–375):
    - `position: absolute; bottom: var(--ui-safe-bottom); left: var(--ui-safe-left); z-index: 10; display: flex; flex-direction: column; align-items: flex-start; gap: 6px;`
    - Contains `.hud-vitals-tray` housing `.hud-labor-meter` (vertical labor meter) and `.hud-sprint-meter` (vertical sprint stamina meter).
    - Floating context status cards: `.hud-context-statuses` (Lines 459–473) housing `.hud-labor-note` (Low labor warning) and `.hud-cargo-note` (Carried fish cargo details).
- **Bottom-Center Cluster** (`.hud-play-cluster`, `.hud-bottom-center`, `.hud-hotbar`):
  - `src/ui/hud.css` (Lines 311–354):
    - `position: absolute; bottom: var(--ui-safe-bottom); left: 50%; z-index: 10; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px;`
    - Contains `.hud-bottom-center` with `.interaction-prompt` (contextual interaction banners, e.g. `[E] Interact`, `[Space] Hook fish`, bite alerts) and `.hud-hotbar` housing `.hud-tool-belt` with 5 `.hud-hotbar-slot` buttons.
- **Toast Notifications** (`.hud-toast-container`, `.hud-toast-pill`):
  - `src/ui/hud.css` (Lines 291–310):
    - `position: absolute; top: calc(var(--ui-safe-top) + 56px); left: 50%; transform: translateX(-50%); z-index: 12; pointer-events: none;`

### 1.3 Available Modern-Medieval Design Tokens & Chrome Primitives
- **Design Tokens** in `src/ui/styles.css` (Lines 10–65):
  - Surfaces: `--mm-slate-glass: rgba(14, 20, 28, 0.90)`, `--mm-slate-glass-elevated: rgba(22, 30, 42, 0.94)`, `--mm-slate-glass-subtle: rgba(12, 17, 24, 0.75)`
  - Timber: `--mm-timber-dark: #1b120c`, `--mm-timber-mid: #2c1d14`, `--mm-timber-light: #442d1f`
  - Gold & Filigree: `--mm-gold-leaf: #d4af37`, `--mm-gold-bright: #f0dd9a`, `--mm-gold-glow: rgba(212, 175, 55, 0.45)`, `--mm-gold-border: 1.5px solid #d4af37`, `--mm-gold-filigree-rim`
  - Sunken Wells: `--mm-well-slate: radial-gradient(ellipse at 50% 50%, #16202c 0%, #0a0e14 100%)`, `--mm-well-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.75), inset 0 0 0 1px rgba(0, 0, 0, 0.6)`
  - Typography: `--mm-text-ivory: #f5f0e6`, `--mm-text-gold: #f0dd9a`, `--mm-text-muted: #9e9589`
  - Shadows: `--mm-shadow-panel: 0 12px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
- **Procedural SVGs** in `src/ui/HudDecorations.tsx`:
  - `FiligreeCornerTL`, `FiligreeCornerTR`, `FiligreeCornerBL`, `FiligreeCornerBR`
  - `OrnateBrassDivider`
  - `CelestialTimeDial` (rotating sun/moon disk with celestial basin plate)
  - `MedallionPurse` (leather pouch with gold relief coin medallion)
  - `EmbossedKeycap` (3D stone/brass keycap badge)

---

## 2. Logic Chain

### 2.1 Why Current `hud.css` Must Be Modernized
1. **Observation 1.1** proves that `hud.css` currently forces a Stardew-like flat beige background (`--hud-tray`) on all HUD elements via `#ui-container ... !important`.
2. Because `hud.css` is loaded last in `main.ts`, these rules override `chrome.css` and prevent the Modern-Medieval fantasy theme (`--mm-*`) from rendering.
3. Therefore, `hud.css` must be completely refactored to consume `--mm-*` tokens directly, removing all hardcoded light parchment colors, brown well borders, and unnecessary `!important` declarations.

### 2.2 Z-Index Layering and Stacking Hierarchy
To avoid visual overlap, input stealing, and rendering bugs, the z-index hierarchy must be strictly layered:
```
┌─────────────────────────────────────────────────────────────┐
│ 1000: Debug Diagnostics Overlay (DebugOverlay)             │
├─────────────────────────────────────────────────────────────┤
│ 500:  Start / Load Screen (StartScreen)                     │
├─────────────────────────────────────────────────────────────┤
│ 200–300: Full Modals & Dialogue (Inventory, Market, Esc)   │
├─────────────────────────────────────────────────────────────┤
│ 100–120: Minigame HUDs (FishingHUD, BasicFishingMinigame)   │
├─────────────────────────────────────────────────────────────┤
│ 20–30: Popovers & Inspect Cards (ForecastPopover, CropInsp)│
├─────────────────────────────────────────────────────────────┤
│ 15:   Toast Banners (hud-toast-container, CatchSummary)     │
├─────────────────────────────────────────────────────────────┤
│ 11–12: Contextual Overlays (hud-boat-panel, planting-dock)  │
├─────────────────────────────────────────────────────────────┤
│ 10:   Base Split-Corners HUD (Top-L, Top-R, Bot-L, Bot-C)   │
├─────────────────────────────────────────────────────────────┤
│ 1:    Three.js WebGL Canvas (#canvas-container)            │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Pointer-Events Pass-Through Matrix
1. **Rule**: Players interact directly with the 3D world (moving character, harvesting crops, casting fishing lines, steering boats). Non-interactive HUD space MUST be clickable.
2. `#ui-root` and `#ui-container` have `pointer-events: none`.
3. Corner anchor containers (`.hud-top-left-container`, `.hud-top-right-cluster`, `.hud-play-cluster`, `.hud-toast-container`) have `pointer-events: none`.
4. Only interactive children have `pointer-events: auto` (e.g. `.hud-clock`, `.hud-menu-button`, `.quest-tracker-toggle`, `.hud-hotbar-slot`, `.forecast-popover`, `.planting-seed-card`).

### 2.4 4-Corner Split Alignment & Responsiveness
1. **Top-Left (Celestial Dial & Purse)**:
   - Fixed to `top: var(--ui-safe-top); left: var(--ui-safe-left);`.
   - Combines the Sun/Moon celestial disk (`CelestialTimeDial`), digital clock (`hh:mm` tabular), season/day header, and gold medallion purse (`MedallionPurse` + tabular count).
2. **Top-Right (Quest Tracker & Weather Alerts)**:
   - Fixed to `top: var(--ui-safe-top); right: var(--ui-safe-right);`.
   - Houses the Pinned Quest Tracker (`.quest-tracker-hud-wood` with dark slate glass, gold filigree rim, parchment ribbon title, collapsible chevron, location pin, and progress bar) and Severe Weather Warning chips (`.hud-weather-chip--danger` with pulsing glow).
   - Menu button (`.hud-menu-button`) docked next to or above for easy pause access.
3. **Bottom-Left (Vitals & Status Cluster)**:
   - Fixed to `bottom: var(--ui-safe-bottom); left: var(--ui-safe-left);`.
   - Houses vertical meters for Labor (`.hud-labor-meter`, emerald/gold fill) and Sprint Stamina (`.hud-sprint-meter`, cyan/blue fill with winded state), low labor warnings, carried fish notes, and the Boat Piloting HUD (`.hud-boat-panel`).
4. **Bottom-Center (Tool Hotbar & Contextual Prompts)**:
   - Centered at `bottom: var(--ui-safe-bottom); left: 50%; transform: translateX(-50%);`.
   - Houses the 5-slot quickbar with velvet sunken wells (`--mm-well-slate`), embossed brass numbers `[1]..[5]`, active tool gold filigree glow, and contextual interaction banners (`.interaction-prompt` with 3D embossed keycaps `[E]`, `[Space]`).
5. **Responsive Scaling Rules**:
   - Fluid sizing using `min()` and `clamp()`:
     - `width: min(280px, calc(100vw - 32px));` for corner widgets.
     - `width: min(320px, calc(100vw - 24px));` for hotbar and boat panel.
   - Slot sizing: `48px x 48px` on desktop, gracefully scaling to `44px x 44px` on screens `< 768px`.
   - Safe-area insets: `max(14px, env(safe-area-inset-top))` ensures zero clipping on notched mobile/tablet displays.

---

## 3. Caveats

1. **TypeScript Lint in Test File**:
   - `npm run typecheck` returned TypeScript errors in `tests/unit/empirical_m1_stress.test.ts` due to unused variable declarations and strict type narrowing in the test file. This does not affect runtime UI execution, but should be addressed during subsequent milestone cleanup.
2. **Component File Routing**:
   - `HUD.tsx` and `QuestTrackerHUD.tsx` are the presentation components that instantiate these classes. The CSS classes defined in `hud.css` must match the JSX structure in both components exactly.
3. **Modal Styles Co-location**:
   - `hud.css` historically had leftover modal classes (satchel tabs, guidebook, bestiary cards). In the refactored architecture, `hud.css` should focus strictly on the in-game HUD, floating overlays, and docked controls, while modals are styled via `chrome.css` and `styles.css`.

---

## 4. Conclusion & Recommended Refactoring Plan

### 4.1 Target Architecture for `src/ui/hud.css`
The refactored `hud.css` must be organized into 8 clean, modular sections:

```
/* ==========================================================================
   1. ROOT VARIABLES & HUD DESIGN TOKEN BINDINGS
   ========================================================================== */
#ui-container {
  --hud-bg-glass: var(--mm-slate-glass);             /* rgba(14, 20, 28, 0.90) */
  --hud-bg-elevated: var(--mm-slate-glass-elevated); /* rgba(22, 30, 42, 0.94) */
  --hud-bg-subtle: var(--mm-slate-glass-subtle);     /* rgba(12, 17, 24, 0.75) */
  --hud-border-gold: var(--mm-gold-leaf);            /* #d4af37 */
  --hud-border-subtle: rgba(212, 175, 55, 0.35);
  --hud-filigree-rim:
    inset 0 0 0 1px rgba(240, 221, 154, 0.45),
    inset 0 0 0 2px rgba(20, 14, 10, 0.8),
    0 0 0 1px #805e26;
  --hud-well-bg: var(--mm-well-slate);
  --hud-well-shadow: var(--mm-well-shadow);
  --hud-shadow: var(--mm-shadow-panel);
}

/* ==========================================================================
   2. 4-CORNER BASE CONTAINERS & POINTER-EVENTS
   ========================================================================== */
- Layout shells: transparent backgrounds, 0 border, no box-shadow.
- Top-Left: .hud-top-left-container (absolute top/left, z-index 10, pointer-events: none)
- Top-Right: .hud-top-right-cluster (absolute top/right, z-index 10, pointer-events: none)
- Bottom-Left: .hud-bottom-left / .hud-vitals (absolute bottom/left, z-index 10, pointer-events: none)
- Bottom-Center: .hud-play-cluster (absolute bottom/center 50% translateX, z-index 10, pointer-events: none)
- All interactive plaques: pointer-events: auto; backdrop-filter: blur(12px);

/* ==========================================================================
   3. TOP-LEFT: CELESTIAL DIAL, WEATHER & PURSE
   ========================================================================== */
- .hud-clock-widget: Dark slate glass plaque, gold filigree rim, backdrop-filter blur(12px).
- .hud-clock: Flex alignment, celestial dial SVG icon (36x36px), serif season/day, tabular time.
- .hud-purse-note: Ornate purse medallion SVG, tabular gold readout, gold text shadow.
- .forecast-popover: Elevated plaque (z-index 25), dark slate background, weather condition forecast list.

/* ==========================================================================
   4. TOP-RIGHT: PINNED QUEST TRACKER & WEATHER ALERTS
   ========================================================================== */
- .quest-tracker-hud-wood: Dark slate glass plaque, gold filigree border, ribbon title header, collapsible objective text.
- .quest-progress-bar-track & fill: Gold gradient progress track (height 6px), count readout.
- .hud-weather-chip: Danger/caution chips with dark slate background, red/amber borders, and alert pulse animation.
- .hud-menu-button: Circular slate glass button with gold rim and hover glow.

/* ==========================================================================
   5. BOTTOM-LEFT: VITALS, CARGO & BOAT PANEL
   ========================================================================== */
- .hud-vitals-tray: Dark slate glass plaque, vertical labor & sprint stamina meters.
- .hud-labor-meter: Emerald/gold fill gradient, smooth height transition, lightning icon.
- .hud-sprint-meter: Cyan/blue fill gradient, red winded state (.sprint-stamina-winded).
- .hud-context-statuses: Low labor note & Carried fish note with atlas sprite, weight, freshness bar.
- .hud-boat-panel: Nautical brass speed readout, sea state condition, hull durability meter, cargo hold grid.

/* ==========================================================================
   6. BOTTOM-CENTER: TOOL HOTBAR & CONTEXTUAL PROMPTS
   ========================================================================== */
- .hud-tool-belt: Dark slate glass tray with gold filigree border.
- .hud-hotbar-slot: 48x48px velvet slate sunken well, embossed slot number badge, drop-shadowed icon.
- Active slot state: Border #fff2be, gold glow (0 0 14px var(--mm-gold-glow)), -2px translateY lift.
- .interaction-prompt: Dark slate pill, gold border, embossed stone/brass keycaps ([E], [Space]).

/* ==========================================================================
   7. TOASTS, OVERLAYS & MINIGAMES
   ========================================================================== */
- .hud-toast-container & .hud-toast-pill: Slide-down animation, dark slate glass pill with gold filigree rim.
- .planting-dock-shell: Dark slate seed selection carousel with velvet slot wells.
- .crop-inspection: Dark slate inspection card with crop growth timer and soil status.
- .farm-gis-legend: Diegetic field sign card with GIS moisture/growth indicators.
- .fishing-hud-container: Sport fishing tension meter plaque.

/* ==========================================================================
   8. ANIMATIONS, MEDIA QUERIES & RESPONSIVE SCALING
   ========================================================================== */
- Keyframes: @keyframes mm-glow-pulse, @keyframes mm-toast-enter, @keyframes mm-alert-pulse.
- Breakpoints: @media (max-width: 768px) and @media (max-width: 480px).
- Accessibility: @media (prefers-reduced-motion: reduce).
```

### 4.2 Exact Class Refactoring Specification
| Component / Selector | Current Styling (Old) | Refactored Clean Modern-Medieval Styling |
|---|---|---|
| `#ui-container` HUD tokens | `--hud-tray: rgba(245, 242, 233, 0.96); --hud-well: #3a281c;` | Bound to `var(--mm-slate-glass)`, `var(--mm-gold-leaf)`, `var(--mm-well-slate)`, `var(--mm-shadow-panel)` |
| `.hud-clock-widget` | Flat beige card, `#1b120c` border | `background: var(--mm-slate-glass); backdrop-filter: blur(12px); border: 1.5px solid var(--mm-gold-leaf); box-shadow: var(--mm-shadow-panel), var(--mm-gold-filigree-rim);` |
| `.hud-clock-time`, `.hud-gold-text` | Flat dark ink `#2c2118` | `color: var(--mm-text-ivory); font-family: var(--font-sans); font-weight: 750; font-variant-numeric: tabular-nums;` |
| `.hud-purse-note` | Flat beige card with border-left | `color: var(--mm-text-gold); border-left: 1px solid rgba(212, 175, 55, 0.35);` |
| `.quest-tracker-hud-wood` | Flat beige card, dark ink | `background: var(--mm-slate-glass); backdrop-filter: blur(12px); border: 1.5px solid var(--mm-gold-leaf); box-shadow: var(--mm-shadow-panel), var(--mm-gold-filigree-rim); color: var(--mm-text-ivory);` |
| `.hud-vitals-tray`, `.hud-tool-belt` | Flat beige tray, brown borders | `background: var(--mm-slate-glass); backdrop-filter: blur(12px); border: 1.5px solid var(--mm-gold-leaf); box-shadow: var(--mm-shadow-panel), var(--mm-gold-filigree-rim); border-radius: 6px;` |
| `.hud-hotbar-slot` | Brown background `#3a281c`, `#1c140e` rim | `background: var(--mm-well-slate); border: 1.5px solid rgba(212, 175, 55, 0.3); box-shadow: var(--mm-well-shadow); border-radius: 4px;` |
| `.hud-hotbar-slot.is-active` | Brown `#4a3424`, brass border | `border-color: #fff2be; box-shadow: var(--mm-well-shadow), 0 0 14px var(--mm-gold-glow), inset 0 0 0 1px var(--mm-gold-bright); transform: translateY(-2px);` |
| `.interaction-prompt` | Flat beige pill | `background: var(--mm-slate-glass-elevated); backdrop-filter: blur(12px); border: 1.5px solid var(--mm-gold-leaf); box-shadow: var(--mm-shadow-panel); border-radius: 20px; color: var(--mm-text-ivory);` |
| `.hud-weather-chip` | Flat beige chip | `background: var(--mm-slate-glass); backdrop-filter: blur(8px); border: 1.5px solid var(--mm-gold-leaf); border-radius: 4px; color: var(--mm-text-gold);` |
| `.hud-toast-pill` | Flat beige pill | `background: var(--mm-slate-glass-elevated); backdrop-filter: blur(14px); border: 1.5px solid var(--mm-gold-leaf); box-shadow: 0 12px 32px rgba(0,0,0,0.7); border-radius: 20px; color: var(--mm-text-ivory);` |
| `.hud-boat-panel` | Flat beige card | `background: var(--mm-slate-glass); backdrop-filter: blur(12px); border: 1.5px solid var(--mm-gold-leaf); box-shadow: var(--mm-shadow-panel), var(--mm-gold-filigree-rim); color: var(--mm-text-ivory);` |

---

## 5. Verification Method

### 5.1 Static Verification Commands
- Asset sync and atlas codegen:
  ```bash
  npm run assets:sync
  ```
- Build check:
  ```bash
  npm run build
  ```

### 5.2 Browser & Layout Inspection Steps
1. **Top-Left Corner Inspection**:
   - Verify Celestial dial, season/day text, digital time, and purse medallion render on a translucent dark slate plaque with gold filigree border.
   - Click clock widget to verify `FarmForecastPopover` opens smoothly without clipping.
2. **Top-Right Corner Inspection**:
   - Verify Pinned Quest Tracker renders on dark slate with gold filigree rim and collapsible chevron.
   - Verify storm/fog danger chips pulse cleanly.
   - Verify game menu button opens the Escape menu.
3. **Bottom-Left Corner Inspection**:
   - Verify vertical Labor (green/gold) and Sprint Stamina (cyan/blue) meters render in dark recessed tracks.
   - Drive a boat to verify the Boat Piloting panel displays nautical speed, sea roughness, hull meter, and cargo hold grid.
4. **Bottom-Center Cluster Inspection**:
   - Verify 5-slot hotbar renders with velvet sunken wells and embossed brass numerals `[1]..[5]`.
   - Switch active tool slot to verify gold glow (`--mm-glow-active`) and `-2px` lift.
   - Trigger contextual prompts (`[E] Interact`, `[Space] Hook fish`) to verify 3D embossed keycaps.
5. **Pointer-Events Pass-Through Check**:
   - Click in empty space between corners: verify mouse events pass directly to the 3D scene (camera orbit, character move, tile harvest).
6. **Responsive Scaling Check**:
   - Resize viewport from `1920x1080` down to `768x1024` and `375x667`: verify no overlapping or off-screen clipping occurs.

### 5.3 Invalidation Conditions
- Any HUD container displaying opaque `#f5f2e9` beige paper backgrounds or brown `#3a281c` wells.
- Pointer events blocked in open game areas between HUD corners.
- Z-index conflicts where modals or toasts appear beneath HUD plaques.
