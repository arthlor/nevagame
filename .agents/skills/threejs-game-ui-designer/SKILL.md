---
name: threejs-game-ui-designer
description: "Design or refine Three.js game HUDs, menus, overlays, settings, touch controls, typography, responsive layout, safe areas and text fit. Apply to the requested surfaces and states. Not for 3D diegetic props or whole-game orchestration."
---

# Three.js Game UI Designer

- **Stack contract.** Use the project's existing DOM/CSS or overlay layer.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

Make affected UI readable, responsive and consistent with the game's identity.
In Neva, `04` §17 owns visual direction; simulation DTOs own gameplay truth.

## Workflow

1. Inspect the actual affected surface, content, caller and state transitions.
2. Read relevant sections of `references/ui-patterns.md`. Select the relevant
   checklist for hierarchy (`references/checklists/game-ui-quality.md`), HUD
   readability (`references/checklists/hud-readability.md`), responsive fit
   (`references/checklists/responsive-ui-fit.md`) or changed touch controls
   (`references/checklists/mobile-input.md`). No all-checklist preload is needed.
3. Improve hierarchy, spacing, fit and feedback using the established visual
   language and suitable components. Do not introduce cards, badges, status
   fields or modal states simply because an example contains them.
4. Keep gameplay formulas and mutations in their existing owner. Wire controls
   through real actions and preserve focus, accessible names and supported inputs.
5. Inspect changed states at affected viewports. Exercise callbacks when interaction
   changed; screenshots alone cannot prove them. Follow `03` §4 for checks.

Use existing UI art where suitable. Load an image or 3D provider generator only
for explicitly requested generation; new icons or backgrounds are not mandatory
for polish. Read `references/prompt-templates.md` only for reusable prompts.

## Handoff

Report the UI result, relevant interaction/fit evidence and remaining gaps in
the project completion format. No reference ledger or full UI inventory is
required for a scoped change.
