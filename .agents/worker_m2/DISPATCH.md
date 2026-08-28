## 2026-08-27T17:11:31Z
<USER_REQUEST>
You are the Implementation Worker for Milestone M2 (Classic RPG Split-Corners In-Game HUD) of Neva's Clean Modern-Medieval UI Overhaul.
Your working directory is /Users/anilkaraca/Desktop/Neva/.agents/worker_m2.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Authority and Specification documents:
- /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md
- /Users/anilkaraca/Desktop/Neva/PROJECT.md
- /Users/anilkaraca/Desktop/Neva/.agents/explorer_m2_1/handoff.md
- /Users/anilkaraca/Desktop/Neva/.agents/explorer_m2_2/handoff.md
- /Users/anilkaraca/Desktop/Neva/.agents/explorer_m2_3/handoff.md

Your Assigned File Ownership:
- `src/ui/HUD.tsx`
- `src/ui/QuestTrackerHUD.tsx`
- `src/ui/components/FarmForecastPopover.tsx`
- `src/ui/hud.css`
- `tests/unit/empirical_m2_hud.test.ts`
- `tests/unit/empirical_m1_stress.test.ts` (if any type adjustments are needed for clean typecheck)

Key Deliverables:
1. **Top-Left HUD Cluster (`src/ui/HUD.tsx`, `FarmForecastPopover.tsx`, `hud.css`)**:
   - Invert the misplaced layout: Top-Left MUST house the Almanac plaque.
   - Embed `CelestialTimeDial` (from `src/ui/HudDecorations.tsx`) with dynamic solar/lunar rotation (`((clock.currentMinute - 720) / 1440) * 360`) and night state detection.
   - Render digital clock (`hh:mm` in tabular numbers), Season/Day badge, Weather glyph + label, and explicit temperature readout (`Math.round(weather.temperatureC)}°C`).
   - Embed `MedallionPurse` or gold coin medallion with formatted gold balance (`player.money.toLocaleString()} G`).
   - Ensure clicking the almanac card toggles `FarmForecastPopover` (and plays UI sound), positioned cleanly below Top-Left.
   - Refactor `FarmForecastPopover.tsx` to use dark slate glass (`--mm-slate-glass-elevated`), timber borders, and gold badges.

2. **Top-Right HUD Cluster (`src/ui/QuestTrackerHUD.tsx`, `src/ui/HUD.tsx`, `hud.css`)**:
   - Pinned Quest Tracker in Top-Right with parchment/ribbon header (`ChromeRibbon` or styled ribbon), `IconJournal`, quest title, and collapsible chevron toggle with smooth transition.
   - Render step objective description, gold progress bar (`ChromeMeter variant="gold"` / gold fill track), and location pin hint (`📍 ${activeQuest.targetLocation.name}`).
   - Dock severe weather warning alert chips (`.hud-weather-chip`) in Top-Right with pulsing amber/red glow.
   - Include game menu button (`IconMenu` / Esc trigger with sound).

3. **Bottom-Left HUD Cluster (`src/ui/HUD.tsx`, `hud.css`)**:
   - Vitals tray with vertical Labor stamina meter (`ChromeMeter fill="labor"` using warm amber-gold gradient `#b45309 -> #f59e0b -> #fde68a`) and vertical Sprint stamina meter (`ChromeMeter fill="sprint"` with cyan/emerald gradient and red winded state).
   - Stack `.hud-context-statuses` (low-labor warning, carried heavy fish cargo card) and `.hud-boat-panel` in the Bottom-Left cluster.
   - Style `.hud-boat-panel` with dark slate plaque, brass speed in knots, sea roughness condition, hull integrity meter, and boat cargo hold grid with freshness fill tracks.

4. **Bottom-Center HUD Cluster (`src/ui/HUD.tsx`, `hud.css`)**:
   - 5-slot tool hotbar with velvet sunken wells (`--mm-well-slate`), embossed brass numerals `[1]..[5]`, drop-shadowed atlas tool icons, active tool gold filigree glow (`0 0 14px var(--mm-gold-glow)`), and click/key handlers.
   - Contextual interaction banners directly above hotbar with dark slate pill, gold border, and 3D embossed keycaps (`ChromeKeycap` `[E]`, `[Space]`, `[F]`) and crimson bite alerts.
   - Preserve test IDs: `tool-slot-1..5`, `sprint-stamina`, `context-prompt`, `game-clock`.

5. **CSS Overhaul (`src/ui/hud.css`)**:
   - Completely purge old flat beige paper `#ui-container ... !important` styles.
   - Unify all HUD plaques, toolbars, and prompt pills under Modern-Medieval tokens (`--mm-slate-glass`, `--mm-gold-leaf`, `--mm-timber-gradient`, `--mm-well-slate`, `backdrop-filter: blur(12px)`).
   - Maintain strict 4-corner split layout, z-index layering (10 for HUD, 25 for popovers, 15 for toasts), and pointer-events pass-through (`pointer-events: none` on shells, `auto` on interactive plaques).

6. **Validation**:
   - Write comprehensive unit tests in `tests/unit/empirical_m2_hud.test.ts`.
   - Run and verify: `npm run typecheck`, `npm run assets:sync`, `npm run build`, and `npx vitest run tests/unit/empirical_m2_hud.test.ts`.
   - Verify zero simulation state mutations in UI components.
</USER_REQUEST>
