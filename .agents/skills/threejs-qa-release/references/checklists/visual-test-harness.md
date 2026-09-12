# Visual Test Harness Checklist

Use when visual regression testing is part of the requested gate or addresses an identified regression risk. Reuse existing project coverage first.

- Harness decision is explicit: added / extended / skipped.
- The selected coverage protects a concrete behavior or visual regression; quality adjectives alone do not require a harness.
- Active-play desktop state is covered or a reason is reported.
- Active-play mobile state is covered when mobile is in scope or a reason is reported.
- Important menu/HUD/fail/retry/generated-asset states are covered when those surfaces changed.
- Randomness, camera shake, particles, time, debug UI, and dynamic overlays are seeded, paused, hidden, or intentionally excluded.
- Fonts, textures, GLTFs, and first rendered frames are awaited before screenshots.
- `toHaveScreenshot()` thresholds are narrow enough to catch real regressions.
- Masks are used only for dynamic areas that are not acceptance criteria.
- Canvas pixel/nonblank smoke checks still run; screenshot baselines do not replace interaction checks.
- Baseline update command and comparison command are reported.
- Artifacts/snapshot paths are reported.
- Flake risks and unsupported states are listed.
