# Dispatch — Worker M1: Persistent Gameplay HUD & Contextual Controls (R1 & R2)

## 1. Identity & Context
- Agent: worker_m1
- Archetype: teamwork_preview_worker
- Working directory: /Users/anilkaraca/Desktop/Neva/.agents/worker_m1/
- Workspace root: /Users/anilkaraca/Desktop/Neva
- Parent: orchestrator_2 (ID: a66ec739-374f-4ce2-8658-fb981bd1acb8)

## 2. Mandatory Instructions & Integrity Warning
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read the following documents before editing code:
- `/Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md` (specifically section "## 2026-09-03T11:32:03Z")
- `/Users/anilkaraca/Desktop/Neva/AGENTS.md`
- `/Users/anilkaraca/Desktop/Neva/.agents/orchestrator_2/PROJECT.md`
- `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/analysis.md`
- `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/handoff.md`
- `LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md`
- `LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md`
- `LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md`

## 3. Objective & Requirements (R1 & R2)
Implement the ArcheAge / Palia-inspired Cozy MMO Persistent HUD and Contextual Controls:

### R1. Persistent Gameplay HUD & Nautical Navigation
1. **Top-Left Player Unit Frame (`src/ui/hud/PlayerUnitFrame.tsx`)**:
   - Crest/avatar frame.
   - Labor (Work Capacity `current/maximum`) bar with animated recharge feedback pulse.
   - Sprint Stamina bar with exhaustion warning state.
   - Active status chips (`statusEffects`): Overburdened Cargo pack, Well Rested, Rain Soaked, Night Water chill.
2. **Top-Right Nautical Compass & Almanac (`src/ui/hud/NauticalCompassAlmanac.tsx`)**:
   - Integrated Celestial Time Dial (hour/minute, day/season, solar/lunar astronomical rotation).
   - Circular Nautical Compass Radar displaying cardinal bearings (N, NE, E, SE, S, SW, W, NW), wind direction arrow, current sub-region title, and nearby objective/station markers (Farm plot, Harbor dock, Active Quest beacon, Fishing school).
3. **Collapsible Quest & Contract Tracker (`src/ui/QuestTrackerHUD.tsx`)**:
   - Pinned under top-right compass.
   - Displays active story quest steps AND market delivery contracts (`state.contracts`) with checkmarks, counts, and fold/unfold toggles.
4. **Bottom-Right Micro-Menu & Purse Bar (`src/ui/hud/MicroMenuPurseBar.tsx`)**:
   - Compact 6-button icon rack for major panels: Satchel `[I]`, Field Journal `[J]`, Nautical Chart `[M]`, Hold & Stores `[L]`, Expeditions `[P]`, Menu `[Esc]`.
   - Anchored with animated Gold Purse counter.
   - Bag capacity badge (e.g. `14/20` slots) and Back Pack physical cargo badge (e.g. `1/1` Back Pack).

### R2. Contextual Toolbar, Action Channeling & Smart Prompts
5. **Smart Contextual Stance Toolbar (`src/ui/hud/SmartContextualToolbar.tsx`)**:
   - Mode-driven hotbar that dynamically shifts loadouts based on player context (`detectContextualStance`):
     - *Agronomy Stance* (On farm plot): Slots 1–5 bind to Hoe, Seed Belt Flyout, Watering Can, Fertilizer/Compost, and Weeding/Harvest.
     - *Angling Stance* (Near water/in boat): Slots 1–5 bind to Cast Rod, Lure/Tacklebox, Chum/Bait Bucket, Keepnet/Fish Bag, and Stow Rod.
     - *Maritime Stance* (Boating): Integrated vehicle dashboard showing Helm control, Knots/Heading, Hull Integrity, Fuel tank, and Fish Cargo Hold slots.
     - *Explorer Stance* (Travel): Satchel, Pocket Chart, Rations, Lantern.
6. **Action Channeling Cast Bar (`src/ui/components/FarmingActionStatus.tsx`)**:
   - Standalone high-polish MMO progress bar for planting, tilling, watering, fertilizing, harvesting, processing, boarding, docking, and crafting with progress spark and cancel cues.
7. **Smart Labor Action Prompts (`src/ui/hud/SmartActionPrompt.tsx`)**:
   - Floating contextual prompt display with embossed keycap (`[E]`), interaction verb, target entity name, and Labor cost badge (`-5 Work`).
8. **Planting Seed Belt Selector (`src/ui/components/PlantingSeedBar.tsx`)**:
   - Enhanced docked horizontal tray with owned seed quantity badges, seasonal compatibility icons, and soil suitability hints.

### Presentation DTOs & Simulation Purity
- Extend `WorldHudDto` in `src/simulation/core/contracts.ts` to include: `stance`, `compass`, `statusEffects`, `capacity`, `activeContracts`.
- Populate these fields in `src/simulation/presentation/WorldHudPresentation.ts` deterministically from `GameState` using pure queries (`findFarmIdAtWorld`, `fishingAccessAt`, `activeBoatId`).
- Update `src/ui/HUD.tsx` to mount these components in their correct viewport anchor locations.
- Update `src/ui/styles/hud.css` to provide polished, tactile, cozy MMO styling.
- Write unit tests in `tests/unit/hud_m1.test.ts` verifying rendering and DTO bindings.

## 4. Exclusive File Ownership
You own:
- `src/ui/hud/*` (`PlayerUnitFrame.tsx`, `NauticalCompassAlmanac.tsx`, `MicroMenuPurseBar.tsx`, `SmartContextualToolbar.tsx`, `SmartActionPrompt.tsx`)
- `src/ui/components/FarmingActionStatus.tsx`
- `src/ui/components/PlantingSeedBar.tsx`
- `src/ui/QuestTrackerHUD.tsx`
- `src/ui/HUD.tsx`
- `src/ui/GameUI.tsx` (only for mounting/integrating M1 components)
- `src/ui/styles/hud.css`
- `src/simulation/core/contracts.ts` (extending WorldHudDto)
- `src/simulation/presentation/WorldHudPresentation.ts`
- `tests/unit/hud_m1.test.ts`

## 5. Verification Commands
Before delivering your handoff report, you MUST run:
```bash
npm run typecheck
npm test
```
Document exact command outputs and test counts in your handoff report.
84: Write your report to `/Users/anilkaraca/Desktop/Neva/.agents/worker_m1/handoff.md`.
85: 

## 2026-09-03T11:42:36Z
You are worker_m1. Your working directory is /Users/anilkaraca/Desktop/Neva/.agents/worker_m1/.
Read your dispatch instructions in /Users/anilkaraca/Desktop/Neva/.agents/worker_m1/DISPATCH.md and the authoritative user request in /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md.
Also read /Users/anilkaraca/Desktop/Neva/AGENTS.md and /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/analysis.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement Milestone 1 (R1 Persistent HUD & R2 Contextual Controls):
- PlayerUnitFrame.tsx (crest, labor bar with recharge pulse, stamina bar with exhaustion warning, status chips)
- NauticalCompassAlmanac.tsx (celestial time dial + circular nautical compass radar, bearings, wind arrow, region title, POIs)
- QuestTrackerHUD.tsx (tracking both active quests & delivery contracts with fold toggle)
- MicroMenuPurseBar.tsx (6-button micro-menu, gold counter, bag/cargo capacity badges)
- SmartContextualToolbar.tsx (stance-driven dynamic loadout: Agronomy, Angling, Maritime, Explorer)
- FarmingActionStatus.tsx (extracted high-polish MMO progress bar)
- SmartActionPrompt.tsx ([E], verb, target entity, labor cost badge)
- PlantingSeedBar.tsx (seasonal compatibility & soil suitability hints)
- DTO expansion in contracts.ts and WorldHudPresentation.ts
- HUD.tsx and hud.css integration
- Unit tests in tests/unit/hud_m1.test.ts

Run `npm run typecheck` and `npm test` to verify your implementation.
Write your completion report to /Users/anilkaraca/Desktop/Neva/.agents/worker_m1/handoff.md and send a message to orchestrator_2 (parent).

## 2026-09-03T11:42:58Z
From: orchestrator_2 (a66ec739-374f-4ce2-8658-fb981bd1acb8)
**Context**: Survey findings relevant to M1 implementation in GameUI.tsx and HUD.tsx
**Content**: Explorer survey discovered two important items to keep in mind while modifying `GameUI.tsx` and `HUD.tsx`:
1. In `GameUI.tsx(415,10)`, verify and fix the props passed to `FishingHUD` (e.g. `onSetDrag`) so `npm run typecheck` succeeds cleanly.
2. In `HUD.tsx`, replace the fragile speed-based docked check (`boat && boat.speedKnots === 0...`) with proper `isDocked` state from `WorldHudBoatDto` to avoid stationary floating boats falsely hiding gauges.
**Action**: Please ensure these fixes are incorporated as you integrate the M1 HUD components.
