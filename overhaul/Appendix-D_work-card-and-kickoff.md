# Appendix D — Agent Work Card and Progress Protocol

> Fragment of parent plan Appendix D.

## Work card (one per item, e.g. W02.1 or W07.3)

```text
Work item:
Player-visible outcome:
Current commit/input identity:
Owning source and affected callers:
Class: P / B / T
Allowed files / envelope:
Preserved contracts:
Approved differences:
Save/migration impact:
Implementation steps:
Focused tests and actual gameplay evidence:
Matching-quality performance check, where relevant:
Owning documentation updates:
Rollback boundary:
Result: implemented / validated scope / blocked gates
Evidence artifact paths:
Next dependency-safe work item:
```

Before reporting a work item complete, review the actual diff for unrelated
changes, duplicate authorities, changed identifiers, altered tuning, new
dependencies, weakened tests and regenerated output. Prefer a small reversible
commit rather than combining topology, shaders, assets and migrations into one
opaque patch.

Use one implementing agent per owning source. A reviewer can independently
inspect changes/evidence but must not claim tests it did not run. For parallel
read-only review, divide by evidence concern — geography, persistence,
rendering or art — then resolve changes through the same owner.

## Ready-to-use kickoff prompt

```text
Read NEVA_WORLD_OVERHAUL_IMPLEMENTATION_PLAN.md as a scoped work order.
Root AGENTS.md and its routed repository authorities remain authoritative.

Start with W00 only, followed by the necessary W01 reproductions when W00's
source/fixture isolation is established. Do not jump to final art, rewrite the
water renderer, upgrade dependencies, change production topology or touch
real player saves.

Verify the current checkout against the plan's audited SHA. Read the actual
owners and callers. Preserve unrelated working-tree changes. Check generated
adapter drift before any asset-sync prehook can regenerate it. Use the existing
world/visual/production evidence tools, not a parallel harness.

Deliver the baseline input identity, command results, affected-owner map,
protected-state fixture strategy, reproduced/not-reproduced audit findings,
and exact open visual/hardware gates. Distinguish source inference from actual
browser observation. Do not mark unrun checks as passed.

Then identify the next dependency-safe work item. Implement at most one bounded
work item at a time with its evidence and rollback boundary. No mass asset
production before the integrated slice's scoped visual approval. No production
release without the final save, browser, hardware and authorization gates.
```

The kickoff deliberately starts with evidence rather than directing the agent
to "make everything amazing." This prevents a broad request from becoming an
uncontrolled rewrite.
