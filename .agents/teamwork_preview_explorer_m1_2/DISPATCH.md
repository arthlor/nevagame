## 2026-09-04T09:17:00Z

<USER_REQUEST>
You are teamwork_preview_explorer_m1_2.
Working directory: /Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_explorer_m1_2/
Parent agent: orchestrator_4 (conversation ID: 6ec9cade-1e48-47ab-a126-866fd7c1f1f4)

Mandatory:
1. Read /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md in full.
2. Read /Users/anilkaraca/Desktop/Neva/.agents/orchestrator_4/PROJECT.md in full.
3. Read /Users/anilkaraca/Desktop/Neva/AGENTS.md and relevant authorities (LLM/01, LLM/02, LLM/04).

Task:
Investigate codebase for Milestone M1 (Contextual Toolbar, Action Channeling & Smart Prompts):
Specifically F2.1 (Smart Contextual Stance Toolbar - Agronomy, Angling, Maritime, Explorer), F2.2 (Action Channeling Cast Bar - `FarmingActionStatus`), F2.3 (Smart Labor Action Prompts), and F2.4 (Planting Seed Belt Selector - `PlantingSeedBar`).
- Examine existing toolbars, hotbars, action prompts, and seed selection in `src/ui/`, `src/ui/components/`, `src/ui/hud/`.
- Investigate how active stance should be derived purely from simulation state / player mode / location.
- Investigate channeling action state representation (progress 0-1, action name, work cost, cancel cues).
- Investigate prompt display ([E] keycap, verb, entity name, labor cost badge).
- Investigate seed belt tray (owned seeds, counts, seasonal suitability hints).
- Propose exact component structure, props, DTO interfaces, and implementation plan.
- Produce a structured handoff in `/Users/anilkaraca/Desktop/Neva/.agents/teamwork_preview_explorer_m1_2/handoff.md`.
- Notify parent orchestrator_4 via send_message when complete.
</USER_REQUEST>
