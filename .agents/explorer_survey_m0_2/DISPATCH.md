# Dispatch — Explorer Survey M0-2: In-World Inspectors, Fishing Minigames & Maritime Console (R3, R4, R5)

## 1. Identity & Context
- Agent: explorer_survey_m0_2
- Archetype: teamwork_preview_explorer
- Working directory: /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_2/
- Parent: orchestrator_2 (ID: a66ec739-374f-4ce2-8658-fb981bd1acb8)

## 2. Objective
Map and investigate the full technical scope for R3, R4, and R5 of the ArcheAge / Palia-inspired cozy MMO interface system overhaul:
- **R3: In-World Inspectors, GIS Overlays & Toasts**:
  - Crop Inspection Card (`CropInspection`): Crop icon, name, growth stage chip, stage countdown/progress label, soil moisture band, next action, Work cost.
  - Farm GIS Legend & Soil Overlay (`FarmGISLegend`): [Alt] hold tile tinting & HUD legend (moisture & fertility).
  - Trophy Catch Inspection & Toast (`CatchInspectionModal` & `CatchSummaryToast`): Celebratory card on landing sport fish (species, weight kg, length, star quality, freshness timer, market value, PB badge).
  - Contextual Hint Cards (`ContextualHintCard`): Non-intrusive tips for boating, sport fishing, soil care.
  - Notice Stack & Weather Hazards (`NoticeStack`, `weather.hazard`): Floating notifications for items/labor and top-right maritime hazard banners (fog, squall, storm waves).
- **R4: Dual Fishing Minigames & Cockpits**:
  - Basic Fishing Minigame (`BasicFishingMinigameWidget`): Cast charge meter sweet spot, bobber alert, bite-reaction hook prompt, tension mini-bar, victory/escape.
  - Sport Fishing Telemetry HUD (`FishingHUD`): Circular line-tension gauge, fish stamina, run distance to boat, water depth, rod deflection angle & counter-swing guidance [A]/[D], Reeling [W] vs Slacking [S] tactile controls.
- **R5: Maritime Vessel Console (`hud-boat-panel`)**:
  - Contextual helm console: Vessel name, registration insignia, docking status chip, Speed log in knots, heading bearing, sea-state condition, Hull integrity bar, Fuel tank level gauge.
  - Physical Cargo Hold bay grid: loaded fish cargo / trade packs, species sprites, quality medallions, real-time freshness decay bars.

## 3. Authoritative Reference Documents (Read to the end)
- /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md (under section "## 2026-09-03T11:32:03Z")
- /Users/anilkaraca/Desktop/Neva/AGENTS.md
- /Users/anilkaraca/Desktop/Neva/LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md
- /Users/anilkaraca/Desktop/Neva/LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md
- /Users/anilkaraca/Desktop/Neva/LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md

## 4. Codebase Exploration Targets
Investigate:
- `src/ui/` inspectors, fishing widgets, modals, overlays, and boat panels
- Fishing simulation and minigame states (`src/fishing/`, `src/sim/`, `src/app/`)
- In-world projection and 3D-to-2D screen coordinate mapping for inspectors / GIS overlays
- Boat physics/telemetry and cargo hold state representation (`src/boat/`, `src/world/`, `src/sim/`)
- Notification / toast dispatching architecture
- Simulation DTOs and event channels for fishing events, weather hazards, and boat state.

## 5. Required Output
Write your comprehensive findings to `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_2/analysis.md` and a summarized `/Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_2/handoff.md`:
1. Current State: What exists vs what is missing or needs overhaul.
2. Architecture & File Inventory: Exact files to create, modify, or refactor.
3. Simulation DTO Dependencies: Which simulation interfaces supply the required data.
4. Input exclusivity & modal blocking during active fishing and boating.
5. Concrete Implementation Recommendations.

## 2026-09-03T11:34:25Z
You are explorer_survey_m0_2. Your working directory is /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_2/.
Read your dispatch instructions in /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_2/DISPATCH.md and the authoritative user request in /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md (specifically section "## 2026-09-03T11:32:03Z").
Also read /Users/anilkaraca/Desktop/Neva/AGENTS.md.
Investigate R3 (In-World Inspectors, GIS Overlays & Toasts), R4 (Dual Fishing Minigames & Cockpits), and R5 (Maritime Vessel Console).
Survey all existing files under src/ui/, src/fishing/, src/boat/, src/sim/, etc.
Write your detailed report to /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_2/analysis.md and your summary to /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_m0_2/handoff.md.
When finished, send a message to orchestrator_2 (parent) notifying completion.
