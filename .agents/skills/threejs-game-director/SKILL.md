---
name: threejs-game-director
description: "Coordinate explicitly requested whole-game creation or orchestration across named game systems. Use when the user selects this director for that scope. Not for polish/upgrade adjectives alone, routine assets, a single system, or a narrow defect."
---

# Three.js Game Director

- **Stack contract.** Use the project's frontend, renderer backend and runtime owners.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and repository `AGENTS.md`.

This director is explicit-only. Coordinate the requested outcome without turning
one visual or gameplay improvement into a whole-game rebuild. In Neva, root
`AGENTS.md` owns routing and `03` owns milestones and verification. Do not use
the bundled scaffold or start this director for “Generate assets”.

## Workflow

1. Inspect the current project and define the requested playable result,
   affected systems and dependencies. Reuse its design and architecture decisions.
2. Select only the phases needed for that result. Read the matching skill and
   relevant references when entering that phase. No all-sibling preload is needed.
3. Work in integrated increments and exercise the actual affected player paths.
   Continue through the requested quality level, fixing observed shortcomings
   within scope rather than adding unrelated systems.
4. Verify against the repository's task matrix and accepted art brief. Inspect
   changed visuals and motion; profile when the change affects performance.
5. Report the delivered result, relevant evidence and remaining approval or access
   gaps. A build, screenshot, human approval and release are different claims.

For complex coordination, [references/phase-playbook.md](references/phase-playbook.md)
provides optional phase guidance. Keep a working record only when dependencies
or blockers need it. Delegate only when the user or applicable instructions
authorize subagents, with bounded ownership and integration review.

## Phase selection

| Affected outcome | Skill |
| --- | --- |
| Mechanics, loop, progression, input or physics | `$threejs-gameplay-systems` |
| Broad authored visual improvement | `$threejs-aaa-graphics-builder` |
| Specific visual mechanism | `$threejs-skill-router` or its owning specialist |
| HUD, menus and interaction fit | `$threejs-game-ui-designer` |
| Diagnosis or measured performance | `$threejs-debug-profiler` |
| Release or visual-gold verification | `$threejs-qa-release` |

Resolve siblings at `../<skill-name>/SKILL.md`, preferring this repo copy. Use the
session skill catalog if a path is absent; disclose a missing capability and
continue work supported by the implementation and available documentation.

## Assets and tools

Use suitable existing or procedural assets when they satisfy the brief. External
generation is optional and requires the explicit human request specified by root
`AGENTS.md`; load only the authorized 3D, image or audio generator. Do not probe
credentials to justify choosing another source. A generated output is not a
quality certificate. Neva static assets always use its catalog and registered
Blender publication path; never publish a downloaded GLB directly.

Inspect actual package scripts and browser capabilities before using them. Do
not assume scaffold commands or test hooks exist. When a check cannot run, state
the exact evidence gap and complete independent work. No numeric scorecard,
report-audit script or fixed ledger format is a completion gate.

Read [references/prompt-templates.md](references/prompt-templates.md) only when
the user asks for a reusable director prompt.
