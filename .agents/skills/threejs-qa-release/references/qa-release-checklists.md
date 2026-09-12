# QA And Release Checklists

Select the applicable sections for a requested release or visual-gold gate. The repository task matrix owns required coverage; this checklist does not turn a narrow fix or polish request into release work.

## Browser QA Matrix

Coverage to select against the actual gate and supported devices:

- Dependencies installed or known.
- Build/typecheck passes.
- Dev or preview server opened at the correct URL.
- Console/page/network errors captured.
- Canvas nonblank and visually varied through pixel sampling.
- Desktop active-play screenshot.
- Mobile active-play screenshot when mobile is in scope.
- Main input path changes game state.
- Objective/progress path works.
- Fail/retry or pause/resume path works when relevant.
- Recent or risky code paths triggered.
- Physics-heavy games: engine choice, fixed timestep, body/collider count, collision/trigger path, high-speed tunneling check, and restart body cleanup verified.
- HUD text fit, overlap, safe areas, and touch targets checked when UI changed.
- Renderer diagnostics captured when graphics complexity changed.
- Imported/generated asset paths, file sizes, and runtime load behavior checked when external assets changed.
- Audio unlock, decode/load, loop cleanup, mute/volume, and main SFX triggers checked when audio changed.
- Existing visual regression coverage exercised when required by the gate; extend it only for a meaningful uncovered regression risk.

## Interaction QA

Test what a player actually does:

- Start or resume.
- Move/aim/steer/jump/attack/boost as appropriate.
- Collect or score.
- Avoid or hit a hazard.
- Trigger a state change: combo, wave, checkpoint, damage, shield, fail, win.
- Pause and resume.
- Restart after fail.
- For physics games, verify bodies reset cleanly after restart and no stale bodies keep simulating.
- For audio, verify user-gesture unlock, main SFX triggers, ambience loop start/stop, pause/resume, restart cleanup, and mute/volume controls.
- Resize or rotate when responsive/mobile is in scope.

Do not rely only on screenshots for gameplay changes.

## Visual QA

For the visual surfaces covered by the requested gate:

- Inspect the actual gameplay views and motion against the accepted brief.
- Check relevant silhouette, material, lighting, repetition and readability.
- Confirm UI and effects preserve the action, route and next decision.
- Inspect supported viewports and changed imported-asset scale, orientation,
  collision, attachments or animation where applicable.
- Use measured renderer/production evidence for cost claims. Pixel complexity
  and subjective numeric scores are not visual acceptance criteria.
- Reuse the project’s regression harness; add or extend it for a concrete gap.
  Neva's `04` §19 governs human approval and baseline replacement.

## Visual Test Harness QA

When a visual harness is warranted:

- Reuse project-owned deterministic setup for seed, camera, time and relevant state; extend it only for the comparison being added. Do not import scaffold hooks into Neva.
- Cover active desktop and active mobile screenshots when mobile is in scope.
- Cover changed HUD/menu/fail/generated-asset states.
- Use Playwright screenshot comparisons with deliberate thresholds.
- Keep canvas-pixel smoke and interaction tests; visual baselines are additional evidence.
- Report baseline update command, compare command, snapshot paths, masks, thresholds, and flake risks.

## Mobile QA

- Touch controls emit game intents.
- Pointer release/cancel/blur cannot leave controls stuck.
- Safe areas respected.
- Touch targets reachable and separated.
- Page scroll does not steal gameplay input.
- Orientation/resize preserves canvas and HUD.
- DPR/performance acceptable.
- Desktop input still works unless intentionally removed.
- UI remains readable on narrow screens.

## Performance QA

When draw calls, asset counts, shaders, shadows, or post-processing changed:

- Record renderer calls, triangles, geometries, textures.
- Record FPS/frame time if available.
- Record physics engine, timestep, body count, collider count, active sensors, CCD bodies, and known expensive colliders when physics changed.
- Note DPR cap and post/shadow settings.
- Check active gameplay, not only idle view.
- Compare before/after if performance work was requested.
- Report any unmeasured risk honestly.

## Release Checks

Before release-ready:

- Production build passes.
- Production preview/static server tested.
- Vite `base` and asset URLs match target host.
- Debug GUI, diagnostics overlays, verbose logs, and test shortcuts are gated or removed from player-facing release.
- Bundle and large assets reviewed.
- API keys are not present in client-side code, checked-in files, built assets, or browser-visible environment.
- Public assets load under static hosting assumptions.
- Browser support assumptions documented.
- Deployment command or static artifact location reported.
- Residual risks listed.

## Evidence Format

Use the repository completion format. For a standalone report, select relevant
fields below and omit unused sections.

```text
QA result: pass/fail
Commands:
URL:
Controls tested:
Screenshots/artifacts:
Console/page/network errors:
Canvas pixel check:
Desktop/mobile viewports:
Renderer/performance diagnostics:
Visual test harness:
Physics diagnostics:
External asset evidence:
Audio evidence:
Issues found/fixed:
Residual risks:
```

## Bug Report Format

```text
Title:
Severity:
Reproduction steps:
Expected:
Actual:
Browser/viewport/device:
Console/page errors:
Screenshot/artifact:
Likely owner:
Suggested fix:
```

## Common Release Failures

- Testing dev server but shipping untested production build.
- Static host base path breaks assets.
- Debug UI visible to players.
- Mobile UI passes screenshot but controls do not work.
- Canvas is nonblank but wrong app is running on the port.
- Physics gameplay looks right visually but collision proxies, sensors, or restart cleanup were not tested.
- Screenshots are title/idle views instead of active play.
- A visual, temporal or performance claim lacks evidence for that specific property.
- 3D/image/audio generation API key or generated temporary URLs accidentally exposed in client code.
