# Milestone M2 (Bottom-Left & Bottom-Center In-Game HUD) Explorer Handoff Report

## 1. Observation

### 1.1 Bottom-Left HUD Cluster
- **Vitals Tray Component (`HUD.tsx:275-303`)**:
  - `aside.hud-bottom-left.hud-vitals.interactive` container positioned at `bottom: var(--ui-safe-bottom); left: var(--ui-safe-left)`.
  - **Labor Stamina Meter**:
    - Invokes `<ChromeMeter className="hud-labor-meter" label="Labor" value={laborCurrent} max={laborMaximum} orientation="vertical" showLabel={false} showValue={false} fill="labor" icon={<IconEnergy size={16} aria-hidden="true" />} />`.
    - `laborCurrent = Math.round(player.workCapacity.current)` and `laborMaximum = player.workCapacity.maximum`.
    - Rendered via vertical orientation track with fill `fill="labor"`.
    - `chrome.css:622` currently assigns an emerald green gradient (`#059669 -> #10b981 -> #34d399`), whereas `PROJECT.md` Feature 7 and design guidelines specify warm amber/gold fill (`#b45309 -> #f59e0b -> #fde68a` or `--mm-gold-*`) to represent physical labor and exertion.
  - **Sprint Stamina Meter**:
    - Conditionally rendered via `showSprintStamina` (`HUD.tsx:74-78`), displaying only when `sprintStamina < sprintMaximum - 0.01` or `player.traversal.sprintExhausted`.
    - Invokes `<ChromeMeter className="hud-sprint-meter..." label="Sprint" value={sprintStamina} max={sprintMaximum} orientation="vertical" showLabel={false} showValue={false} valueText={player.traversal.sprintExhausted ? "Winded" : undefined} fill={player.traversal.sprintExhausted ? "danger" : "sprint"} data-testid="sprint-stamina" />`.
    - Styled with emerald/cyan gradient (`#0369a1 -> #0284c7 -> #38bdf8`) during normal sprint and pulsing crimson danger gradient (`#991b1b -> #dc2626 -> #f87171`) when winded.
- **Low-Labor Warning Alerts & Carried Cargo Notes (`HUD.tsx:194-216`)**:
  - Rendered when `showLaborNote` (`laborCurrent < 20`) or `carriedFish` (`player.carriedFishCargoId`).
  - Low labor note renders `<div className="hud-context-note hud-labor-note" role="status">` with `<IconEnergy size={14} /> Low Labor {laborCurrent}/{laborMaximum}`.
  - Carried cargo note renders fish atlas sprite via `<AtlasImage src={atlasForFish(carriedFish.speciesId)} size={28} />`, species name, weight in kg (`carriedFish.weightKg.toFixed(1)} kg`), freshness %, and quality badge.
  - **Layout Drift**: In `hud.css:459-463`, `.hud-context-statuses` was positioned on the bottom right (`right: var(--ui-safe-right); bottom: calc(88px + env(safe-area-inset-bottom))`). In the modern-medieval split-corners architecture (ORIGINAL_REQUEST §R2), this belongs anchored cleanly in the **Bottom-Left** status cluster stacked above the vitals tray.
- **Active Boat Hull Integrity & Piloting Status Panel (`HUD.tsx:218-273`)**:
  - Displayed when `activeBoat` (`player.activeBoatId`) and `boatDef` exist.
  - Header displays `<IconBoat size={18} />`, boat name, nautical speed in knots (`Math.round(activeBoat.speed * 1.944)} kn`), and sea condition label (`seaStateLabel(weather.seaRoughness)`: "Calm" / "Swell" / "Rough").
  - Includes night waters chip if `clock.timeOfDay === "night"` or `"dusk"`.
  - Hull integrity meter: `<ChromeMeter className="hud-boat-hull" label="Hull" value={activeBoat.durability} max={100} showLabel={false} valueText={`${Math.round(activeBoat.durability)}%`} fill={activeBoat.durability < 30 ? "danger" : "hull"} />`.
  - Boat cargo grid: renders `boatCargoSlots` using `<ChromeSlot className="boat-cargo-slot">` with `<AtlasImage src={atlasForFish(cargo.speciesId)} size={28} />`, `<ChromeQuality quality={cargo.quality} />`, and a 3-tier freshness progress fill bar (`cargo-freshness-track`).
  - **Layout Drift**: In `hud.css:475-485`, `.hud-boat-panel` was styled on the bottom right (`right: var(--ui-safe-right)`). In split-corners HUD, it belongs in the Bottom-Left cluster (above or alongside the vitals tray).

---

### 1.2 Bottom-Center HUD Cluster
- **Play Cluster Structure (`HUD.tsx:305-356`)**:
  - Container `.hud-play-cluster` centered at `left: 50%; transform: translateX(-50%); bottom: var(--ui-safe-bottom);`.
  - **5-Slot Tool Hotbar**:
    - Contained in `aside.hud-hotbar` > `div.hud-tool-belt` > `div.hud-tool-slots`.
    - Slots:
      1. Slot 1: Hand Tools & Hoe (`IconHoe` -> `UI_TOOLS.hoe`)
      2. Slot 2: Seeds (`IconSprout` -> `UI_WORLD.sprout` or seeds)
      3. Slot 3: Watering Can (`IconWateringCan` -> `UI_TOOLS.watering_can`)
      4. Slot 4: Fishing Bait (`IconBait` -> `UI_TOOLS.bait`)
      5. Slot 5: Fishing Rod (`IconRod` -> `UI_TOOLS.rod`)
    - Tool button construction (`HUD.tsx:112-125`):
      ```tsx
      <ChromeSlot
        className={`hud-hotbar-slot ${activeToolSlot === slot ? "is-active" : ""}`}
        selected={activeToolSlot === slot}
        onClick={() => onSelectToolSlot?.(slot)}
        label={`${label}, tool slot ${slot}`}
        data-testid={`tool-slot-${slot}`}
      >
        <span className="slot-num-badge" aria-hidden="true">{slot}</span>
        {icon}
      </ChromeSlot>
      ```
    - Numerals: Currently rendered via `.slot-num-badge`. Can use `EmbossedKeycap` / `ChromeKeycap` or embossed brass numeral styling (`--mm-text-gold`).
    - Active Tool Glow: `selected={activeToolSlot === slot}` triggers `.is-active` / `.is-selected`, applying gold border (`--mm-gold-leaf`), active gold filigree glow (`0 0 14px var(--mm-gold-glow)`), and slight vertical elevation.
  - **Contextual Interaction Keycap Banners (`HUD.tsx:306-343`)**:
    - Displayed directly above the hotbar when `state.basicFishing` or `parsedPrompt` is active (and `!isPlacementActive`).
    - `parsePrompt` (`HUD.tsx:39-51`) extracts bracketed keycaps (e.g. `[E]`, `[Space]`, `[F]`) and label strings, defaulting to key `"E"`.
    - Renders tactile key badge `<KeycapBadge keyName={parsedPrompt.key} />` (which invokes `<ChromeKeycap keyName={key} />`) alongside `<span className="banner-text">`.
    - Preserves test ID `data-testid="context-prompt"`.
    - In basic fishing minigame, renders phase-specific interaction banners:
      - `charging-cast`: "Release to cast"
      - `bite-reaction` / `bite`: `[Space] Hook the fish` (with `.is-bite-alert`)
      - `minigame`: "Hold Space to keep the fish in the bar"
      - `caught`: `[Space] Collect catch`
      - `escaped`: "The fish got away"
      - default: "Waiting for a bite"

---

### 1.3 Event Wiring & Tool Selection Pipeline
- **Input Sources**:
  1. Mouse/Touch Click: Clicking a `ChromeSlot` triggers `onClick` -> `onSelectToolSlot?.(slot)`.
  2. Keyboard Hotkeys: Keys `1`, `2`, `3`, `4`, `5` handled by `InputRouter` / `GameApp.ts:936-950` -> `this.selectToolSlot(slot)`.
- **GameApp Routing (`GameApp.ts:2066-2114`)**:
  - Slot 1: Exits crop placement, equips Hand Tools & Hoe, shows toast "Equipped: Hand Tools & Hoe".
  - Slot 2: Searches inventory for starter crop seeds (`crop.wheat`, `crop.tomato`, `crop.potato`). If present, calls `enterCropPlacement(targetCropId)`; otherwise toasts "No seeds in backpack. Visit the Village Market to buy seeds.".
  - Slot 3: Exits crop placement, equips Watering Can, shows toast "Equipped: Watering Can".
  - Slot 4: Exits crop placement, checks inventory for `item.bait_worms`, displays available bait count toast.
  - Slot 5: Exits crop placement, calls `handleCastFishing()`.
- **UI State Purity**:
  - `HUD.tsx` receives `activeToolSlot` as a read-only prop and triggers the parent callback `onSelectToolSlot`.
  - Zero simulation state mutations occur in `HUD.tsx` or any UI component.

---

## 2. Logic Chain

1. **Clean Modern-Medieval Transformation**:
   - `hud.css` still contains legacy Stardew-era beige/brown parchment container rules (`--hud-tray: rgba(245, 242, 233, 0.96)`, `--hud-well: #3a281c`) that override the modern-medieval design tokens from `Chrome.tsx` and `styles.css`.
   - Applying `ChromePanel tone="slate"` / `tone="dock"` and using `--mm-slate-glass`, `--mm-well-slate`, `--mm-gold-leaf`, `--mm-gold-glow`, and embossed brass accents cleanly unifies the HUD with the Manor Lords / Witcher 3 aesthetic.

2. **Split-Corners Architectural Integrity**:
   - In the classic split-corners layout:
     - **Top-Left**: Celestial dial, Purse gold medallion, Temperature, Weather.
     - **Top-Right**: Pinned Quest Tracker, severe weather warnings, Esc menu button.
     - **Bottom-Left**: Vitals tray (Labor meter + Sprint meter), Low-labor warnings, Carried cargo card, Active boat piloting panel.
     - **Bottom-Center**: 5-slot tool hotbar with embossed brass numbers + Contextual interaction banners (`[E]`, `[Space]`, `[F]`).
   - Relocating `.hud-context-statuses` and `.hud-boat-panel` from the legacy bottom-right anchor to the Bottom-Left cluster strictly fulfills the 4-corner spatial contract and clears the right side of the screen for world inspection, quest logs, and modals.

3. **Meter Color & Visual Grammar**:
   - Labor meter represents physical stamina/work capacity; updating its gradient from green to amber-gold (`#b45309 -> #f59e0b -> #fde68a` or `--mm-gold-*`) matches `PROJECT.md` Feature 7.
   - Sprint meter represents swift kinetic stamina; its emerald/cyan gradient (`#059669 -> #10b981 -> #38bdf8`) contrasts with labor and turns crimson danger (`#991b1b -> #dc2626 -> #f87171`) when exhausted/winded.
   - Boat hull durability uses nautical teal (`#0f766e -> #0d9488 -> #2dd4bf`) and switches to danger fill when below 30%.

4. **Context Prompts & Keycaps**:
   - Contextual prompts directly above the hotbar provide immediate feedback with tactile embossed keycaps (`ChromeKeycap` / `EmbossedKeycap`), serif text, and bite-alert highlights.
   - Preserving test ID `data-testid="context-prompt"` and slot test IDs `data-testid="tool-slot-${slot}"` guarantees test harness stability.

---

## 3. Caveats
- `tests/unit/empirical_m1_stress.test.ts` has 4 minor TypeScript test fixture type discrepancies from M1 that should be cleaned up during M6 verification. Production code in `src/` has zero TypeScript errors.
- The boat piloting panel is only visible when `player.activeBoatId` is truthy, so layout adjustments must test both walking and sailing gameplay modes.
- Carried heavy sport fish cargo note only displays when `player.carriedFishCargoId` is non-null.

---

## 4. Conclusion & Recommendations
1. **Refactor Bottom-Left Vitals & Status Layout**:
   - Position `.hud-bottom-left` in the lower-left corner (`bottom: var(--ui-safe-bottom); left: var(--ui-safe-left)`).
   - Stack `.hud-context-statuses` (low-labor warning, carried cargo badge) and `.hud-boat-panel` directly above the vitals tray in the bottom-left corner.
   - Update Labor meter gradient in `chrome.css` / `hud.css` to warm amber-gold (`#b45309 -> #f59e0b -> #fde68a`).
   - Enhance Sprint meter with emerald/cyan fill and smooth transition when winded (`sprint-stamina-winded`).
   - Wrap boat status panel in `ChromePanel tone="slate"` with brass headers, knots speed readout, sea condition, hull integrity meter, and cargo hold slot grid with freshness tracks.

2. **Refactor Bottom-Center Tool Hotbar & Contextual Banners**:
   - Maintain center alignment (`left: 50%; transform: translateX(-50%); bottom: var(--ui-safe-bottom)`).
   - Style 5 tool slots with `--mm-well-slate`, dark slate rim, embossed brass numerals (1–5), drop-shadowed atlas tool icons (`UI_TOOLS`), and gold filigree selection glow (`--mm-gold-glow`).
   - Enhance contextual prompt banner with dark slate plaque framing, glowing `ChromeKeycap` (`[E]`, `[Space]`, `[F]`), serif label typography, and crimson bite alerts.
   - Retain all `data-testid` attributes (`tool-slot-1..5`, `sprint-stamina`, `context-prompt`, `game-clock`).

3. **Preserve Simulation Purity**:
   - Keep all UI components purely presentational, consuming immutable `GameState` and routing actions through `onSelectToolSlot`, `onOpenMenu`, and `sim.execute(...)`.

---

## 5. Verification Method
1. **TypeScript Typecheck**:
   `npm run typecheck`
2. **Asset & Atlas Sync**:
   `npm run assets:sync`
3. **Simulation & Unit Test Suite**:
   `npx vitest run tests/simulation`
4. **End-to-End Controls & HUD Test**:
   `npx vitest run tests/unit/inputRouter.test.ts tests/unit/modeController.test.ts`
