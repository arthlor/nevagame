---
name: threejs-gameplay-systems
description: "Build playable Three.js game loops and systems. Use for new Vite/TS game setup, architecture, mechanics, entities, input, camera, collision/physics, scoring, level/encounter design, and game feel. Not for pure graphics or UI-only work."
---

# Three.js Gameplay Systems

- **Stack contract.** Frontend: Vite + TypeScript + three (WebGL2 or WebGPU per project). Physics/collision engine per `references/physics-engine-selection.md`.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

## Purpose

Create or evolve a playable browser game loop with clear ownership, responsive controls, deterministic update order, strong design intent, playable spaces, and verified player-facing behavior.

## Use When

Starting a new game, repairing a weak prototype, adding mechanics/entities, designing architecture, defining a game design brief, planning levels/arenas/tracks/waves/holes/puzzles, tuning camera/controls, implementing rules/objectives, building encounters, or improving game feel.

## Workflow

Select references by the changed contract and read the relevant sections:

- `references/gameplay-workflows.md`: first playable, mechanics and runtime ownership.
- `references/game-design-level-design.md`: new-game, major progression or level design.
- `references/physics-engine-selection.md`: selecting or changing a physics architecture;
  an existing controller repair starts with its current engine and owning source.
- `references/game-feel.md`: changed movement, camera or feedback timing.
- Matching checklists under `references/checklists/`: `new-game-definition-of-done.md`,
  `game-design-level-design.md`, `game-feel.md`, or `endless-runner-premium-quality.md`
  only when the corresponding work is in scope. Genre examples do not add mechanics.
- `references/prompt-templates.md`: only for reusable prompts.

For audio behavior, inspect the existing event, manifest and playback owners.
Load `threejs-audio-generator` only for explicitly requested provider generation
or processing. Existing audio and procedural synthesis remain valid sources.

For new games, establish the design and loop below. For a focused change, reuse
the current design and inspect only its affected owners and callers.

1. Inspect project structure, scripts, dependencies, current loop, input, camera, entities, state, UI, and diagnostics.
2. Write the compact game design brief: player promise, target feeling, primary verb, objective, pressure, reward, fail/retry, skill expression, non-goals.
3. Define the core loop contract: verb, objective, pressure, reward/progression, fail/retry.
4. Define the level/encounter plan before implementation: start, first decision, first threat, first reward, landmarks, escalation, recovery beats, readability, and tuning knobs.
5. Use the existing architecture. For an empty project, choose small ownership boundaries only where needed.
6. Implement mechanics in playable increments: input, state, entity, collision/physics, feedback, HUD/audio hook, diagnostics.
7. Tune feel with `references/game-feel.md`: movement, acceleration, camera follow/FOV/shake, hitstop, impact feedback, cooldowns, difficulty, restart loop.
8. Keep hot paths allocation-light and update order explicit.
9. Follow the project verification matrix. Exercise the affected player path when interaction changes, and use focused domain tests for state/formula behavior. A screenshot or nonblank canvas does not prove a loop.

## Packaged Scaffold

Use the bundled scaffold when starting a new project or when the user asks for a starter game:

```bash
python3 <this-skill-dir>/scripts/create_threejs_game.py ./my-game
```

The script copies `assets/threejs-vite-game/`, rewrites the project name in `package.json` and `package-lock.json`, and keeps generated games self-contained with their own visual test and canvas-inspection script. Use `--force` only when the target directory may be overwritten.

## Library Guidance

- Use TypeScript, Vite, Three.js modules.
- Physics/collision engine choice (custom collision vs Rapier vs cannon-es), timestep, and collider strategy: follow `references/physics-engine-selection.md`.
- `lil-gui` for live-tuned constants when useful.
- Web Audio for runtime playback and procedural feedback; `threejs-audio-generator` for generated game audio assets.

## Common Failure Modes

- Static demo instead of playable loop.
- Static scene with mechanics bolted on after the fact, instead of a design brief plus level/encounter plan driving implementation.
- Core loop is described but not proven through real input, pressure, reward/progression, and fail/retry.
- Level/track/arena/map is decorative and does not shape player decisions.
- Mechanic compiles but cannot be triggered by real input.
- Camera/controls feel delayed or hide the next decision.
- State changes do not drive UI/audio/VFX.
- Architecture abstractions appear before mechanics need them.

## Final Response

Report the changed player behavior, relevant verification and remaining gaps. Include design or architecture decisions only when this task changed them; use the repository completion format.
