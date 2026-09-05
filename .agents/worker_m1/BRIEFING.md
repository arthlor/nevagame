# BRIEFING — 2026-09-03T11:42:36Z

## Mission
Implement Milestone 1: ArcheAge/Palia-inspired Cozy MMO Persistent Gameplay HUD (R1) & Contextual Controls (R2).

## 🔒 My Identity
- Archetype: teamwork_preview_worker
- Roles: implementer, qa, specialist
- Working directory: /Users/anilkaraca/Desktop/Neva/.agents/worker_m1/
- Original parent: a66ec739-374f-4ce2-8658-fb981bd1acb8
- Milestone: M1 (R1 Persistent HUD & R2 Contextual Controls)

## 🔒 Key Constraints
- DO NOT CHEAT. All implementations must be genuine.
- Exclusive file ownership:
  - src/ui/hud/* (PlayerUnitFrame.tsx, NauticalCompassAlmanac.tsx, MicroMenuPurseBar.tsx, SmartContextualToolbar.tsx, SmartActionPrompt.tsx)
  - src/ui/components/FarmingActionStatus.tsx
  - src/ui/components/PlantingSeedBar.tsx
  - src/ui/QuestTrackerHUD.tsx
  - src/ui/HUD.tsx
  - src/ui/GameUI.tsx (only mounting/integrating M1 components)
  - src/ui/styles/hud.css
  - src/simulation/core/contracts.ts (extending WorldHudDto)
  - src/simulation/presentation/WorldHudPresentation.ts
  - tests/unit/hud_m1.test.ts
- Follow Neva project rules in AGENTS.md: deterministic simulation, presentation reads simulation state, no combat, no Math.random() in simulation.
- Pass `npm run typecheck` and `npm test`.

## Current Parent
- Conversation ID: a66ec739-374f-4ce2-8658-fb981bd1acb8
- Updated: not yet

## Task Summary
- **What to build**: ArcheAge / Palia-inspired Cozy MMO Persistent HUD (PlayerUnitFrame, NauticalCompassAlmanac, QuestTrackerHUD, MicroMenuPurseBar) and Contextual Controls (SmartContextualToolbar, FarmingActionStatus, SmartActionPrompt, PlantingSeedBar) with presentation DTOs and unit tests.
- **Success criteria**: All M1 UI components functional and styled; DTO pure mapping in WorldHudPresentation; tests pass in tests/unit/hud_m1.test.ts; typecheck passes; npm test passes.
- **Interface contracts**: src/simulation/core/contracts.ts, src/simulation/presentation/WorldHudPresentation.ts
- **Code layout**: src/ui/hud, src/ui/components, src/simulation

## Key Decisions Made
- Initializing workspace and planning M1 implementation.

## Artifact Index
- DISPATCH.md — Assignment instructions
- BRIEFING.md — Situational awareness
- progress.md — Heartbeat and step tracking
- handoff.md — Final completion report

## Change Tracker
- **Files modified**: none yet
- **Build status**: unknown
- **Pending issues**: none

## Quality Status
- **Build/test result**: pending
- **Lint status**: pending
- **Tests added/modified**: pending tests/unit/hud_m1.test.ts

## Loaded Skills
- none
