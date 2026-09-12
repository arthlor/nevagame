# Skill Pack Conventions

Repository `AGENTS.md` owns task routing and project constraints. These skills
supply techniques; their examples and checklists do not expand the user's task.

## Scope and verification

Choose process by the affected behavior and failure risk. A one-line migration
can need substantial verification; a large prose edit can need only a diff and
reference check. “Premium”, “polish” and “AAA” describe quality intent, not a
release request or a requirement to load every phase.

In Neva, `03` §4 defines verification and `BLENDER.md` defines asset production.
Read the owning sections and selected technical references completely; load
another skill only for an affected mechanism. Use existing checks and diagnostics
before adding a harness. Broaden for changed inputs, failures or unresolved risk.

## Constraints and art intent

Preserve concrete contracts such as state ownership, supported backends, resource
lifetime, save compatibility and required determinism. Diagnose physical or
sampling errors against the implemented mechanism and intended result; physical
realism is not a universal rule for stylized art. Visual-only randomness is allowed
where the project permits it and does not compromise required reproducibility.

Style, composition and tuning suggestions are adaptable defaults. Follow the
current brief and owning art direction. Explain a departure only when its
tradeoff matters; no “Artistic deviation” form is required. Reuse established art
intent; discuss alternatives only when the task leaves a meaningful design choice.

## Examples and evidence

Read source before borrowing it. Check installed Three.js version, backend,
resource ownership and provenance. Preserve the mechanism's necessary contracts;
adapt its parameters, scene, materials and supporting systems to the project.
No example authorizes a backend migration or a parallel production pipeline.

Inspect changed visuals or interactions at their intended camera and scale.
Focused captures, motion checks and diagnostics are useful evidence. Numeric
style scores, pixel entropy and edge density cannot establish visual quality.
Keep static checks, observed runtime behavior, human approval and release status
separate. An inaccessible runtime is a reported evidence gap, not a passing check.

Use a compact working record only when a long task has dependencies, decisions
or blockers worth retaining. No skill-loading/reference/sourcing ledgers are
required. Handoffs follow the project format and report the outcome, evidence
and material gaps without repeating every reference or check.
