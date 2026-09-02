---
name: gauntlet-loop
description: "Turn a concrete goal into a reference-driven builder and independent-critic loop. Use when the user says gauntlet loop, gauntlet this, or asks to iterate until the result beats a named reference."
metadata:
  short-description: "Run reference-driven builder and critic loops"
---

# Gauntlet Loop

Use this skill for a user-requested quality loop around a build, design, writing, research, or code task. It has two modes: write a reusable prompt, or run that prompt as the lead agent when the user explicitly asks to proceed.

> Adapted from [gauntlet-loop](https://github.com/robonuggets/gauntlet-loop) by Jay E / RoboNuggets, based on Matt Shumer's technique. This Codex/Neva adaptation changes the agent and project-routing instructions; the original work is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Write-prompt mode

1. Understand the goal without expanding its scope.
2. If the user supplied a reference, use it. Otherwise offer exactly two or three candidate quality bars, one line each, and stop for the user's choice.
3. A valid bar is named, fetchable, and comparable. Prefer a measurable companion when the goal has one: a test suite, benchmark, load time, pass rate, word count, or similar.
4. After the bar is chosen, return one short paste-ready prompt, normally 120–180 words, followed by one flat line: `I can run this here.`

The generated prompt should tell the lead agent to get the real reference first, break the goal into the smallest independently judgeable pieces, and use a builder plus a separate critic with fresh context for each piece. The critic inspects the actual output, compares it side by side with the reference with labels removed, makes a binary choice about which is better, and names the single biggest remaining gap. The builder then addresses that gap. Keep iterating until the critic picks the work or the user stops; do not invent a fixed round limit or a default budget. Keep a concise progress log in the task. Use parallel Codex subagents for independent builders and critics when available; otherwise perform clearly separated passes and label the limitation.

Do not fabricate a comparison when a reference cannot be fetched. For correctness or systems work, use a named implementation plus its tests or benchmark as the bar rather than forcing a visual comparison. Do not add tool names, architecture, file layout, or stack choices to the generated prompt unless the goal requires them.

## Run mode

When the user says to run, execute, proceed, or otherwise authorizes the generated loop, become the lead agent and follow it. Read and obey the repository's current instructions before making changes. In Neva, `AGENTS.md` and its routed canonical authorities remain higher priority than the bar or the generated prompt; the loop cannot override state ownership, no-combat rules, save/migration discipline, required gates, or verification boundaries.

Keep the critic independent of the builder's reasoning. If subagents are available, give critics only the goal, bar, and actual artifacts needed for judgment. If a bar is inaccessible, the comparison is not meaningful, or the user stops the loop, report the exact boundary and the best evidence reached. A gauntlet result is not by itself runtime, browser, visual-approval, release, hosted, or production proof.
