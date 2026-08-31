# BRIEFING — 2026-08-30T10:44:00Z

## Mission
Implement Milestone 4 (R4: Category-Based Bus Audio Normalization) with 2-pass EBU R128 loudnorm, manifest sync, CLI options, and tests.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa
- Working directory: /Users/anilkaraca/Desktop/Neva/.agents/worker_r4/
- Original parent: f2c82b53-0804-475c-80b4-755579100dfb
- Milestone: R4 (Category-Based Bus Audio Normalization)

## 🔒 Key Constraints
- Genuine implementation with 2-pass EBU R128 loudnorm using ffmpeg
- Category target matrix preserved (ui_transient, tools_work, footsteps_movement, environment_ambience, animals_wildlife, water_splashes, dialogue_vocals, music, weather)
- Synchronize with assets/audio/audio-manifest.json (recompute duration, channels, sha256 hash)
- Typescript definitions in tools/audio/normalizeBus.d.mts
- Zero typecheck errors, all tests pass
- Integrity: no hardcoded outputs, genuine audio processing logic

## Current Parent
- Conversation ID: f2c82b53-0804-475c-80b4-755579100dfb
- Updated: not yet

## Task Summary
- **What to build**: tools/audio/normalizeBus.mjs, tools/audio/normalizeBus.d.mts, npm scripts, tests in tests/unit/audioNormalization.test.ts
- **Success criteria**: 2-pass loudnorm, bus targeting, manifest updates, tests pass, typecheck passes
- **Interface contracts**: tools/TOOLS_UPGRADE_IMPLEMENTATION_SPEC.md § Subsystem 4

## Change Tracker
- **Files modified**: none yet
- **Build status**: pending
- **Pending issues**: none

## Quality Status
- **Build/test result**: pending
- **Lint status**: pending
- **Tests added/modified**: pending

## Key Decisions Made
- [TBD]

## Artifact Index
- [TBD]
