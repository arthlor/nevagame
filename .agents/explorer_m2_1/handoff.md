# Milestone M2 (In-Game Split-Corners HUD) — Comprehensive Investigation & Handoff Report

## 1. Observation

### 1.1 Context & Authority
This report investigates the architecture, state bindings, component structure, styling tokens, and simulation purity required for **Milestone M2 (Classic RPG Split-Corners In-Game HUD)** as mandated by `ORIGINAL_REQUEST.md (§R2)` and `PROJECT.md (Feature Inventory #5, #6, #7, #8)`.

### 1.2 Top-Left Cluster Analysis
In the current implementation of `src/ui/HUD.tsx`:
- **Current Location Mismatch**: Lines 129–140 show that `.hud-top-left-container` currently contains `severeAlert` and `<QuestTrackerHUD activeQuest={activeQuest} />`, while the clock, weather, and purse are placed in `.hud-top-right-cluster` (lines 149–192).
- **Missing Elements**:
  - `CelestialTimeDial` (defined in `src/ui/HudDecorations.tsx:158–242`) is currently **omitted** from the HUD; only a basic `WeatherIcon` and tiny time icon are rendered.
  - Temperature in °C is currently not displayed directly on the HUD (it only exists in the popover or in a `title` tooltip at `HUD.tsx:156`: `title={`${formatWeatherLabel(weather.type)}, ${Math.round(weather.temperatureC)}°`}`).
  - Gold display uses a generic `IconCoin` SVG from `src/ui/components/HudIcons.tsx:17` instead of the procedural `MedallionPurse` (`src/ui/HudDecorations.tsx:247–291`) or atlas coin with filigree framing.
- **State Dependencies for Top-Left**:
  - `state.clock`:
    - `clock.currentMinute` (0..1439): Used for digital clock (`hh:mm` via `Math.floor((currentMinute % 1440) / 60)` and `currentMinute % 60`) and celestial rotation.
    - `clock.season`: "spring" | "summer" | "autumn" | "winter" -> capitalized badge name.
    - `clock.dayCount`: total elapsed days -> `dayInSeason = ((clock.dayCount - 1) % 30) + 1`.
    - `clock.timeOfDay`: "dawn" | "day" | "dusk" | "night" -> atlas time icon / label.
  - `state.weather`:
    - `weather.type`: WeatherTag ("clear", "cloudy", "light-rain", "heavy-rain", "windy", "fog", "storm").
    - `weather.temperatureC`: number (e.g. 18.4°C) -> `Math.round(weather.temperatureC)}°C`.
    - `weather.precipitation`, `weather.windSpeed`, `weather.seaRoughness`, `weather.visibility`.
  - `state.player`:
    - `player.money`: number -> `player.money.toLocaleString()} G`.
- **FarmForecastPopover Interactivity**:
  - Controlled by local state `const [showForecast, setShowForecast] = useState(false);` in `HUD.tsx:69`.
  - Triggered by clicking the weather/clock card button (`aria-expanded={showForecast}`, `aria-controls="farm-forecast-popover"`).
  - Renders `src/ui/components/FarmForecastPopover.tsx` with `weather={weather}`, `clock={clock}`, `onClose={() => setShowForecast(false)}`.

### 1.3 Top-Right Cluster Analysis
In `src/ui/QuestTrackerHUD.tsx` (lines 1–77) and `src/ui/HUD.tsx`:
- **Current Component Structure**:
  - Uses `ChromePanel as="aside" tone="dock" className="quest-tracker-hud-wood"` (`QuestTrackerHUD.tsx:31–36`).
  - Has local collapse state `const [collapsed, setCollapsed] = useState(false);` (`QuestTrackerHUD.tsx:13`).
  - Toggle button contains `IconJournal`, `questTitle`, `objectiveDescription`, and chevron `▾` (`QuestTrackerHUD.tsx:38–54`).
  - Progress bar: rendered when `activeQuest.targetQuantity > 1` (`QuestTrackerHUD.tsx:58–65`).
  - Location hint: rendered when `activeQuest.targetLocation` is present (`📍 ${activeQuest.targetLocation.name}`).
  - Fallback state: When `!activeQuest`, renders an "Open Horizons" discovery card (`QuestTrackerHUD.tsx:15–24`).
- **Severe Weather Alert Chips**:
  - Evaluated in `HUD.tsx:88–94` from `weather.type === "storm"`, `weather.type === "fog" && weather.visibility < 0.5`, `weather.windSpeed >= 11`, and `weather.seaRoughness >= 0.7`.
  - Currently rendered in top-left; per split-corners design, this belongs docked in the Top-Right cluster alongside the tracker.
- **Game Menu Button**:
  - Button with `IconMenu` / Esc key action invoking `onOpenMenu` (which opens `EscapeMenuModal`).

### 1.4 Bottom-Left and Bottom-Center HUD Clusters
In `src/ui/HUD.tsx`:
- **Bottom-Left Vitals & Status**:
  - Labor meter: `ChromeMeter` with `fill="labor"`, `orientation="vertical"`, `value={laborCurrent}`, `max={laborMaximum}` (`HUD.tsx:277–287`).
  - Sprint stamina meter: `ChromeMeter` with `fill="sprint"` or `fill="danger"` when winded (`HUD.tsx:288–301`).
  - Contextual notes: `hud-context-statuses` showing "Low Labor" alert (`HUD.tsx:196–204`) and carried fish cargo weight/freshness badge (`HUD.tsx:205–214`).
  - Boat panel: `hud-boat-panel` (`HUD.tsx:218–273`) with hull integrity meter, speed in knots (`Math.round(activeBoat.speed * 1.944)} kn`), sea roughness state (`Calm`, `Swell`, `Rough`), and boat cargo grid (`boat-cargo-grid`) with freshness bars.
- **Bottom-Center Hotbar & Contextual Prompts**:
  - Hotbar tool belt: 5 slots (`toolButton(1..5)`) with `ChromeSlot`, slot number badge, active tool glow (`is-active`), and tool icons (`IconHoe`, `IconSprout`, `IconWateringCan`, `IconBait`, `IconRod`).
  - Contextual prompt banner: `interaction-prompt` with `KeycapBadge` (`[E]`, `[Space]`, `[F]`) and banner text (`HUD.tsx:305–343`).

### 1.5 CSS Token & Layout Discrepancies in `src/ui/hud.css`
- `src/ui/hud.css:3–10` sets `--hud-tray: rgba(245, 242, 233, 0.96);` (opaque beige Stardew-style paper).
- `src/ui/hud.css:29–51` forces `background-color: var(--hud-tray) !important;` on `.hud-clock-widget`, `.hud-tool-belt`, `.hud-vitals-tray`, `.quest-tracker-hud-wood`, `.hud-weather-chip`, `.interaction-prompt`, `.hud-toast-pill`, `.hud-boat-panel`, etc.
- In Milestone M1, `--mm-*` Modern-Medieval tokens were established in `src/ui/styles.css:10–65` and `src/ui/chrome/chrome.css:26–88`:
  - `--mm-slate-glass: rgba(14, 20, 28, 0.90)`
  - `--mm-slate-glass-card: rgba(28, 38, 51, 0.85)`
  - `--mm-timber-dark: #1b120c`, `--mm-timber-mid: #2c1d14`, `--mm-timber-gradient`
  - `--mm-gold-leaf: #d4af37`, `--mm-gold-bright: #f0dd9a`, `--mm-gold-glow`
  - `--mm-well-slate: radial-gradient(ellipse at 50% 50%, #16202c 0%, #0a0e14 100%)`
  - `--mm-text-ivory: #f5f0e6`, `--mm-text-gold: #f0dd9a`, `--mm-text-muted: #9e9589`
- The HUD CSS in `hud.css` needs to be purged of beige overrides so that all HUD containers cleanly adopt the Modern-Medieval dark slate glass, timber trim, and gold-leaf filigree aesthetic.

---

## 2. Logic Chain

### Step 1: RPG Split-Corners Layout Realignment
- **Observation**: `ORIGINAL_REQUEST.md §R2` mandates:
  - Top-Left: Celestial time dial, digital clock, season/day, weather glyph, temperature readout (°C), gold purse medallion, forecast popover.
  - Top-Right: Pinned Quest Tracker, ribbon header, collapsible objectives, severe weather warning chips, menu button.
  - Bottom-Left: Vitals & Status cluster (Labor, Sprint stamina, boat status, carried cargo).
  - Bottom-Center: Tool hotbar with embossed slot numbers, active tool glow, and contextual keycap prompts.
- **Inference**: In `HUD.tsx`, swap the misplaced Top-Left and Top-Right layout containers:
  - Place Almanac / Time / Weather / Temperature / Purse in `.hud-top-left-container` (`.hud-top-left`).
  - Place Severe Weather Chips, Quest Tracker, and Menu Button in `.hud-top-right-cluster` (`.hud-top-right`).

### Step 2: Celestial Time Dial Rotation Math & Integration
- **Observation**: `CelestialTimeDial` (`src/ui/HudDecorations.tsx:158–242`) has a rotating disk containing the Sun at top (`translate(27, 13)`) and Moon at bottom (`translate(27, 41)`).
- **Inference**:
  - A full 24-hour day in Neva has 1440 minutes (`clock.currentMinute` from 0 to 1439).
  - At noon (12:00 = minute 720), the Sun is at the zenith (top) -> `rotation = 0°`.
  - At dusk / sunset (18:00 = minute 1080), Sun is setting to the right -> `rotation = +90°`.
  - At midnight (0:00 = minute 0 / 1440), Moon is at the zenith -> `rotation = 180°`.
  - At dawn / sunrise (6:00 = minute 360), Sun is rising from the left -> `rotation = 270°` (or `-90°`).
  - **Deterministic Formula**:
    ```ts
    const dialRotation = ((clock.currentMinute - 720) / 1440) * 360;
    const isNightTime = clock.timeOfDay === "night" || clock.timeOfDay === "dusk" || hour < 6 || hour >= 20;
    ```
  - Integrate `<CelestialTimeDial size={44} rotation={dialRotation} isNight={isNightTime} />` into the Top-Left Almanac card.

### Step 3: Top-Left Cluster UI Refactoring
- **Structure**:
  - Frame: `<ChromePanel tone="slate" flourish={false} rivets={true} className="hud-almanac-panel">` or a unified dark slate HUD card.
  - Header Row: `CelestialTimeDial` (44px) + Digital Clock (`hh:mm` in tabular gold figures) + Season/Day badge (`AtlasImage` of time/season + `${seasonName} ${dayInSeason}`).
  - Weather & Temp Row: `WeatherIcon` (atlas sprite) + Weather Label (`formatWeatherLabel(weather.type)`) + Temperature Readout (`Math.round(weather.temperatureC)}°C`).
  - Purse Medallion Row / Section: `MedallionPurse` SVG (24px) or `IconCoin` + Gold balance (`player.money.toLocaleString()} G` in tabular gold).
  - Clicking this card opens the `FarmForecastPopover`, which positions directly below the Top-Left cluster (`top: calc(100% + 8px); left: 0;`).

### Step 4: Top-Right Quest Tracker & Weather Alert Refactoring
- **Structure**:
  - Weather Warning Chips: `<ChromeAlert tone={severeAlert.tone}>` or `.hud-weather-chip` with `IconWarning` and severe weather text.
  - Quest Tracker: `<ChromePanel tone="dock" corners={true} rivets={true} className="quest-tracker-hud">` with:
    - Parchment/Ribbon Header: Medieval ribbon banner (`ChromeRibbon` or styled ribbon) with `IconJournal` and `activeQuest.questTitle`.
    - Collapse Toggle: Chevron button toggling `collapsed` state with smooth CSS transition.
    - Objective Description: `activeQuest.objectiveDescription`.
    - Progress Bar: `<ChromeMeter variant="gold" fill="gold" value={current} max={target} showLabel={false} valueText={`${current}/${target}`} />` or gilded progress track.
    - Location Pin Hint: `📍 ${activeQuest.targetLocation.name}` with illuminated teal/gold text.
  - Menu Button: Circle button with `IconMenu` / Esc keycap tooltip.

### Step 5: `hud.css` Modern-Medieval Theme Overhaul
- **Inference**: Replace all beige Stardew styles in `hud.css` with Modern-Medieval design tokens:
  ```css
  #ui-container .hud-clock-widget,
  #ui-container .hud-almanac-panel,
  #ui-container .quest-tracker-hud,
  #ui-container .quest-tracker-hud-wood,
  #ui-container .hud-vitals-tray,
  #ui-container .hud-tool-belt,
  #ui-container .hud-weather-chip,
  #ui-container .hud-boat-panel,
  #ui-container .forecast-popover {
    color: var(--mm-text-ivory);
    background: var(--mm-slate-glass) !important;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1.5px solid var(--mm-timber-mid) !important;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(212, 175, 55, 0.35), var(--mm-shadow-panel) !important;
  }
  ```
- Update `.hud-hotbar-slot` and `.quickbar-wood-slot` to use `var(--mm-well-slate)` with `var(--mm-gold-leaf)` border on active selection and hover.
- Update `hud-menu-button` to dark slate circular plaque with gold filigree border and hover rotation.

### Step 6: Simulation Purity Verification
- **Inspection**:
  - `HUD.tsx`, `QuestTrackerHUD.tsx`, and `FarmForecastPopover.tsx` only receive immutable snapshot props (`state: GameState`, `activeQuest`, etc.).
  - All UI state changes (`showForecast`, `collapsed`, `activeToolSlot`) are purely presentation-level React `useState` hooks.
  - All user actions route upward via callbacks (`onSelectToolSlot(slot)`, `onOpenMenu()`).
  - No simulation state mutation, `Math.random()`, or domain formula duplication exists in the presentation components.

---

## 3. Caveats

1. **Placement Mode Interactions**:
   - In `mode === "farm-placement"`, `HUD.tsx:306` hides bottom contextual prompts to avoid collision with `PlantingSeedBar.tsx`. This behavior must be preserved.
2. **Mobile Responsive Breakpoints**:
   - `@media (max-width: 760px)` in `hud.css` scales down widgets and hides secondary elements (e.g. detailed season strings). Ensure that in mobile viewports, the Celestial dial scales to 32px and digital clock / temp remain legible.
3. **Audio Cues**:
   - Interactive UI elements (opening forecast popover, toggling quest collapse, clicking tool hotbar slots, clicking menu button) should invoke `playUiSound("click")` or `playUiSound("open")` from `src/ui/audio/uiAudio.ts`.
4. **Existing Test File Lint Notice**:
   - `tests/unit/empirical_m1_stress.test.ts` has a few TypeScript strict-null / unused-import warnings from M1 that can be cleanly resolved when running typecheck.

---

## 4. Conclusion

Milestone M2 is well-specified, highly modular, and ready for clean implementation:
1. **Top-Left**: Refactor into a unified Almanac plaque featuring `CelestialTimeDial` (with dynamic solar/lunar rotation), digital clock (`hh:mm`), season/day badge, weather glyph/label, °C temperature readout, and `MedallionPurse` gold display, with `FarmForecastPopover` anchored below.
2. **Top-Right**: Refactor into a pinned Quest Tracker with parchment/ribbon header, collapsible objectives, gold progress bar, location pin, docked severe weather warning chips, and the game menu button.
3. **Bottom-Left & Bottom-Center**: Upgrade vitals tray (vertical labor/stamina meters), boat panel, and tool belt quickbar to use `--mm-slate-glass`, `--mm-well-slate`, and embossed numerals.
4. **CSS Overhaul**: Purge old beige `#ui-container` rules in `hud.css` and style all HUD elements with the Witcher 3 / Manor Lords inspired dark slate, timber, and gold filigree tokens.
5. **Purity**: Zero simulation mutation; pure presentation architecture.

---

## 5. Verification Method

An implementer agent or reviewer can verify Milestone M2 with the following steps:

1. **Typecheck Verification**:
   ```bash
   npm run typecheck
   ```
   Ensures zero TypeScript errors across all HUD components and test suites.

2. **Asset Synchronization**:
   ```bash
   npm run assets:sync
   ```
   Ensures all atlas icons and generator catalogs are up-to-date.

3. **Unit & Empirical Testing**:
   Create and run a dedicated Vitest suite (e.g. `tests/unit/empirical_m2_hud.test.ts`):
   ```bash
   npx vitest run tests/unit/empirical_m2_hud.test.ts
   ```
   Testing:
   - Celestial dial rotation math across 24h cycle (00:00 = 180°, 06:00 = 270°, 12:00 = 0°, 18:00 = 90°).
   - Top-Left Almanac rendering (time, season, weather label, °C temperature, purse gold).
   - Quest tracker collapse toggle, progress percentage clamping, and location pin display.
   - FarmForecastPopover trigger and forecast slot computation.
   - Severe weather alert chip triggers under storm, fog, wind, and rough sea conditions.
   - UI sound cue dispatches on button/slot interactions.

4. **Production Build**:
   ```bash
   npm run build
   ```
   Ensures bundle compilation without errors.
