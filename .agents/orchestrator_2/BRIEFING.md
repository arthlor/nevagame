# BRIEFING — 2026-09-03T11:42:45Z

## Mission
Comprehensively overhaul every user-facing UI, HUD, modal, inspector, minigame, and screen across Neva into an ArcheAge / Palia-inspired cozy MMO interface system adhering to non-combat game logic, <25% viewport budget, and 100% simulation ownership.

## 🔒 My Identity
- Archetype: teamwork_preview_orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_2/
- Original parent: sentinel_1
- Original parent conversation ID: 2a99a372-c982-4853-bdee-254f89bd7d60

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_2/PROJECT.md
1. **Decompose**: Decompose comprehensive MMO UI specification into milestones (M0 Survey, M1 Core HUD, M2 Inspectors/Overlays, M3 Fishing Minigames, M4 Windows/Inventories, M5 Folio/System/Mobile, M6 E2E Verification).
2. **Dispatch & Execute**:
   - M0 Survey: COMPLETE (3 parallel explorers analyzed R1-R8, DTOs, and test harnesses).
   - Milestone 1: IN_PROGRESS (Worker M1 dispatched).
   - Verification Gate per milestone: Worker -> 2 Reviewers + 2 Challengers + Forensic Auditor -> Gate.
3. **On failure**: Retry -> Replace -> Skip -> Redistribute -> Redesign.
4. **Succession**: Self-succeed at 16 spawns, write handoff.md, spawn successor.
- **Work items**:
  1. M0: Comprehensive UI codebase & spec survey [done]
  2. M1: Persistent Gameplay HUD & Nautical Navigation (R1 & R2) [in-progress]
  3. M2: In-World Inspectors, GIS Overlays & Maritime Console (R3 & R5) [pending]
  4. M3: Dual Fishing Minigames & Cockpits (R4) [pending]
  5. M4: Dockable MMO Windows & Inventories (R6) [pending]
  6. M5: Folio, Almanac & System Overlays (R7 & R8) [pending]
  7. M6: Final Verification & E2E Validation (F9.1) [pending]
- **Current phase**: 1 (Milestone 1 Implementation)
- **Current focus**: Milestone 1 (R1 Persistent HUD & R2 Contextual Controls)

## 🔒 Key Constraints
- Never write, modify, or create source code directly.
- Never run build/test commands yourself.
- Dispatch Explorers for technical exploration and investigation.
- Maintain strict forensic audit gating (binary veto).
- UI must consume read-only DTOs (100% simulation ownership).
- Persistent HUD coverage < 25% of viewport.
- Touch targets >= 48px.
- Never reuse a subagent after it has delivered its handoff.

## Current Parent
- Conversation ID: 2a99a372-c982-4853-bdee-254f89bd7d60
- Updated: 2026-09-03T11:33:11Z

## Key Decisions Made
- Completed M0 Survey. Consolidated 30 features into 6 milestones in PROJECT.md.
- Dispatched worker_m1 for Milestone 1 (R1 & R2).

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| explorer_survey_m0_1 | teamwork_preview_explorer | Survey R1 & R2 | completed | 84d1006d-335f-4ca3-bdbc-e6db5c5e255e |
| explorer_survey_m0_2 | teamwork_preview_explorer | Survey R3, R4 & R5 | completed | b11513f1-2beb-48b8-8c40-377093aec7b4 |
| explorer_survey_m0_3 | teamwork_preview_explorer | Survey R6, R7, R8, Tests | completed | 96535a06-f78e-4cc1-9fe6-0563e25a8c85 |
| worker_m1 | teamwork_preview_worker | Implementation of M1 (R1 & R2) | running | 10e4cb7a-dae0-4452-9ec8-49a3aa573534 |

## Succession Status
- Succession required: no
- Spawn count: 4 / 16
- Pending subagents: 10e4cb7a-dae0-4452-9ec8-49a3aa573534
- Predecessor: orchestrator_1 (conv ID: 4f404edd-28e6-4a75-8889-85439b0ff686)
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: task-23 (*/10 * * * *)
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md — User request specification
- /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_2/PROJECT.md — Global architecture and milestone plan
- /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_2/plan.md — Detailed execution plan
- /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_2/DISPATCH.md — Initial dispatch instructions
- /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_2/BRIEFING.md — Persistent working memory
- /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_2/progress.md — Execution progress tracking
