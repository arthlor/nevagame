# Explorer 2 Survey Dispatch: HUD, Overlays & Minigames

## Objective
Survey the in-game HUD layout, split-corner structure, gameplay overlays (Fishing, Boat piloting, Farming/Seed dock, Farm GIS, Crop inspection, Hints & Toasts).

## Reference Paths
- `/Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md`
- `/Users/anilkaraca/Desktop/Neva/AGENTS.md`
- `src/ui/HUD.tsx` (or `src/ui/hud.tsx`)
- `src/ui/FishingHUD.tsx`
- `src/ui/BasicFishingMinigameWidget.tsx`
- `src/ui/PlantingSeedBar.tsx`
- `src/ui/FarmGISLegend.tsx`
- `src/ui/ContextualHintCard.tsx`
- Related UI component files in `src/ui/`

## Requirements
Map:
1. Current HUD layout components and styling.
2. Top-Left (celestial clock, weather, temp, purse), Top-Right (quest tracker, weather warnings), Bottom-Left (vitals, labor/stamina, boat hull), Bottom-Center (hotbar, keycaps).
3. Minigame widgets: fishing tension dial, bobber, reeling/slacking, bite alerts.
4. Overlays: boat speed/hull/cargo freshness, seed bar, GIS legend, crop inspection, notifications/toasts.
5. Props and presentation boundaries (ensuring presentation-only, no state mutations).
6. Output detailed report to `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_hud_1/handoff.md`.

## 2026-08-27T14:12:43Z
User Request received for Explorer 2 (HUD, Overlays & Minigames):
Investigate:
1. `src/ui/HUD.tsx` (and any related HUD components), `src/ui/hud.css`.
2. Classic RPG Split-Corners HUD:
   - Top-Left: celestial sun/moon time dial, weather glyph, temperature readout, purse/gold medallion.
   - Top-Right: Pinned Quest Tracker, ribbon header, collapsible objectives, weather warnings.
   - Bottom-Left: Vitals/Status cluster (Labor & Sprint Stamina curved/metered bars, boat hull indicator, low labor alerts).
   - Bottom-Center: Tool hotbar, embossed numbers, active glow, contextual keycaps ([E], [Space]).
3. Gameplay Overlays & Minigames:
   - Fishing HUD & Minigame (`BasicFishingMinigameWidget.tsx`, `FishingHUD.tsx`): tension gauge, bobber dial, reeling/slacking, bite alert.
   - Boat piloting HUD in `HUD.tsx`: nautical speed/sea condition, hull integrity, boat cargo hold grid with fresh-to-stale gradient indicators.
   - Farming & Seed Dock (`PlantingSeedBar.tsx`, `FarmGISLegend.tsx`, Crop Inspection): docked velvet carousel, GIS legend, crop inspection.
   - Contextual hints & toasts (`ContextualHintCard.tsx`, toast notifications).
4. Verify props, simulation boundaries (presentation-only).
5. Write your complete findings, component breakdown, data contracts, and implementation plan into /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_hud_1/handoff.md and report back via send_message.
