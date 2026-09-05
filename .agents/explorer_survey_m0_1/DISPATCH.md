# Dispatch — Explorer Survey M0-1: Persistent HUD & Contextual Toolbar Systems (R1 & R2)

## 1. Identity & Context
- Agent: explorer_survey_m0_1
- Archetype: teamwork_preview_explorer
- Working directory: /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/
- Parent: orchestrator_2 (ID: a66ec739-374f-4ce2-8658-fb981bd1acb8)

## 2. Objective
Map and investigate the full technical scope for R1 and R2 of the ArcheAge / Palia-inspired cozy MMO interface system overhaul:
- **R1: Persistent Gameplay HUD & Nautical Navigation**:
  - Player Unit Frame (top-left): Crest/avatar frame, Labor (Work Capacity current/max) bar with recharge feedback, Sprint Stamina bar (exhaustion warning), active status chips (Overburdened Cargo pack, Well Rested, Rain Soaked, Night Water chill).
  - Nautical Compass & Almanac (top-right): Celestial Time Dial (hour/min, day/season, solar/lunar rotation), Circular Nautical Compass Radar (cardinal bearings, wind arrow, sub-region title, nearby objective/station markers).
  - Collapsible Quest & Contract Tracker (under compass): active story quest steps & market delivery contracts with checkmarks and fold/unfold toggles.
  - Bottom-Right Micro-Menu & Purse Bar: Compact icon rack (Satchel [I], Field Journal [J], Nautical Chart [M], Hold & Stores [L], Expeditions [P], Menu [Esc]), Gold Purse counter, Bag/Cargo capacity badges.
- **R2: Contextual Toolbar, Action Channeling & Smart Prompts**:
  - Smart Contextual Stance Toolbar: Mode-driven dynamic loadout (Agronomy, Angling, Maritime, Explorer stances).
  - Farming & Interaction Action Cast Bar (`FarmingActionStatus`): MMO action-channeling progress bar.
  - Smart Labor Action Prompts: Contextual prompt display ([E], verb, target entity, labor cost badge).
  - Planting Seed Belt Selector (`PlantingSeedBar`): Docked horizontal tray with quantity badges, seasonal compatibility, soil suitability hints.

## 3. Authoritative Reference Documents (Read to the end)
- /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md (under section "## 2026-09-03T11:32:03Z")
- /Users/anilkaraca/Desktop/Neva/AGENTS.md
- /Users/anilkaraca/Desktop/Neva/LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md
- /Users/anilkaraca/Desktop/Neva/LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md
- /Users/anilkaraca/Desktop/Neva/LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md

## 4. Codebase Exploration Targets
Investigate:
- `src/ui/` and all subdirectories (`src/ui/hud/`, `src/ui/toolbar/`, `src/ui/components/`, `src/ui/state/`, `src/ui/styles/`)
- Existing HUD components, DTOs, controllers, and DOM mounting logic
- Style architecture (CSS/SCSS/modules/utility classes, color tokens, theme variables)
- Viewport coverage (<20-25% budget) and layout coordinates
- Simulation DTO contracts providing Player state (labor, stamina, status effects), Time/Season, Compass bearings, Quests, Contracts, Stance, Tool states.

## 5. Required Output
Write your comprehensive findings to `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/analysis.md` and a summarized `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/handoff.md`:
1. Current State: What exists vs what is missing or needs overhaul.
2. Architecture & File Inventory: Exact files to create, modify, or refactor.
3. Simulation DTO Dependencies: Which simulation interfaces supply the required data.
4. UI DOM & CSS Hierarchy: Proposed DOM structure, styling strategy, and viewport budget analysis.
5. Concrete Implementation Recommendations.


## 2026-09-03T11:34:25Z
<USER_REQUEST>
You are explorer_survey_m0_1. Your working directory is /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/.
Read your dispatch instructions in /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/DISPATCH.md and the authoritative user request in /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md (specifically section "## 2026-09-03T11:32:03Z").
Also read /Users/anilkaraca/Desktop/Neva/AGENTS.md.
Investigate R1 (Persistent Gameplay HUD & Nautical Navigation) and R2 (Contextual Toolbar, Action Channeling & Smart Prompts).
Survey all existing files under src/ui/ and related simulation modules.
Write your detailed report to /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/analysis.md and your summary to /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_1/handoff.md.
When finished, send a message to orchestrator_2 (parent) notifying completion.
</USER_REQUEST>
