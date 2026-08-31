## 2026-08-30T09:54:08Z

<USER_REQUEST>
You are Explorer 3 for the Neva Tools v2.0 upgrade survey.
Your working directory is: /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_3/

Read the following authoritative sources:
1. /Users/anilkaraca/Desktop/Neva/.agents/ORIGINAL_REQUEST.md
2. /Users/anilkaraca/Desktop/Neva/tools/TOOLS_UPGRADE_IMPLEMENTATION_SPEC.md (specifically Subsystem 4: Category-Based Bus Audio Normalization, and Subsystem 5: Deterministic Visual Regression CI & Unified Developer CLI)
3. Existing code in tools/audio/ (normalizeBus.mjs), tests/e2e/ (visual-regression.spec.ts), tools/cli.mjs, package.json, audio assets / public folders, and scripts.

Investigate and document:
- Current state of audio tools, visual regression tests, CLI, and package.json vs spec requirements.
- Subsystem 4 details: normalizeBus.mjs requirements, audio bus categorization (SFX, Ambience, Music, UI, Voice), target LUFS / True Peak standards per category, loudness normalization algorithms, format handling (WAV, MP3, OGG), batch processing and manifest generation.
- Subsystem 5 details:
  - tests/e2e/visual-regression.spec.ts: Playwright test setup, deterministic harness (freezing time / performance.now, fixed random seeds, disabling CSS animations and particles, waiting for textures/shaders to compile), visual screenshot capture, pixel diffing thresholds.
  - tools/cli.mjs: Unified developer CLI command interface, subcommands (art, layout, ui, audio, test, ci, clean, etc.), arg parsing, chalk/prompts formatting, process execution.
  - package.json script additions/updates.
- Dependencies, test commands, and prerequisites.

Write your comprehensive findings to /Users/anilkaraca/Desktop/Neva/.agents/explorer_survey_3/survey_r4_r5.md and write a handoff.md in your directory. When done, send a message back to parent.
</USER_REQUEST>
