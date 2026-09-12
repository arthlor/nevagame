---
name: threejs-qa-release
description: "Verify an explicitly requested release or visual-gold gate for a Three.js browser game: production build, preview, required player routes, hosting paths and release risks. Not for routine asset, styling or bug-fix verification; use the project task matrix for those."


---

# Three.js QA Release

- **Stack contract.** Browser QA via Playwright against the project's Vite dev/preview server; renderer WebGL2 or WebGPU per project.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

## Purpose

Prove the game works as a player encounters it, then prepare a shippable browser build with known risks.

## QA Workflow

Read the applicable sections of `references/qa-release-checklists.md` and the
checklists for the release gate: `references/checklists/release.md`,
`references/checklists/playtest-qa.md` or `references/checklists/visual-verification.md`.
Neva's `03` §4 and phase gates define required coverage, while `04` §19 owns
visual acceptance. Skills do not add another score threshold.

1. Inspect scripts, configuration, runtime capabilities and existing evidence.
2. Run the required production/static checks and affected player routes. Inspect
   actual rendering, UI and motion at the supported target viewports.
3. Check relevant loading, lifecycle, input, console and resource failures.
4. Use existing regression and playtest harnesses. Read
   `references/visual-test-harness.md` and its checklist when screenshot baselines
   address a concrete regression risk. Read `references/playtest-bot.md` and its
   checklist when scripted play is required by the gate or needed for repeatable
   route evidence. Do not introduce scaffold hooks or a bot merely for “premium”.
5. Separate human approval, local publication, production measurements and
   deployment. Record the required gate outcomes and material gaps.

Read `references/prompt-templates.md` only for reusable QA prompts.

## Packaged Canvas Inspector

Use the bundled inspector when the target project does not already include one:

```bash
node <this-skill-dir>/scripts/inspect-threejs-canvas.mjs --url http://127.0.0.1:5188
```

For mobile emulation, add `--mobile`. Add `--state <name>` (and optionally `--seed <n>`) to drive the game's `__THREE_GAME_TEST_HOOKS__` before capture, so every named state (active-play, fail, stress) can be measured deterministically without live play — outputs are suffixed per state. Generated games from the packaged scaffold also include their own `scripts/inspect-threejs-canvas.mjs` and `npm run inspect:canvas`.

The inspector JSON includes pixel statistics and a `renderBudget` comparison against generic starting budgets. Pixel statistics can diagnose blank or changed output, not visual quality. Use project-owned budgets for performance claims. Check the inspector’s assumptions before reuse; Neva uses its existing harness and does not import scaffold test hooks.

## Release Workflow

1. Inspect package scripts, Vite config, base path, public/assets.
2. Gate debug UI/logging/test helpers.
3. Run production build and preview/static server.
4. Verify built output desktop/mobile.
5. Review bundle and large assets.
6. Document deploy command, host assumptions, and residual risks.

## Final Response

Report the requested gate outcomes, relevant commands/artifacts, observed issues
and remaining gaps in the project format. Include baseline/playtest coverage or
deployment details only when in scope. Do not report unused harness decisions,
reference ledgers or subjective numeric scores as completion evidence.
