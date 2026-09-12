---
name: threejs-debug-profiler
description: "Debug and profile Three.js browser games. Use for blank canvas, render/runtime/loading/animation/resize/mobile bugs, draw calls, memory, shader cost, bundle size, and DPR or input issues. Not for QA sign-off."
---

# Three.js Debug Profiler

- **Stack contract.** Renderer: WebGL2 or WebGPU per project; verify context, loop, and resize ownership before profiling.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

## Purpose

Find root causes and optimize measured bottlenecks without breaking playability.

## Debug Workflow

Use the relevant section of `references/debug-profile-checklists.md` for the observed symptom or profiling question. Start from the failing caller and its owner; no reference ledger or unrelated diagnostic tour is required.

Load `references/checklists/scene-debugging.md` for render/runtime bug diagnosis, `references/checklists/performance-profile.md` for profiling work, and `references/checklists/mobile-input.md` for mobile render/input issues. Load `references/prompt-templates.md` only when the user asks for reusable debug/profile prompts or a task template.

Apply the following checks as relevant to the symptom; they are a diagnostic menu, not a mandatory sequence for every bug.

1. Reproduce locally.
2. Read console/page/network errors.
3. Check canvas display size and drawing-buffer size.
4. Check renderer/context/loop ownership.
5. Check camera, aspect, near/far, lights, materials, fog, scene contents, transforms.
6. Check asset paths/loaders/CORS/base path.
7. Check animation delta units, physics/update order, fixed timestep, collider/body ownership, input listeners, pointer/touch behavior, resize, and audio context unlock/decode errors when audio is involved.
8. Fix root cause in owning module.
9. Retest the broken path with evidence appropriate to the failure. Inspect changed rendering or motion when applicable; a screenshot/nonblank canvas alone does not prove the fix.

## Performance Workflow

1. Reproduce in correct build mode.
2. Record baseline: FPS/frame time, draw calls, triangles, geometries, textures, memory, bundle.
3. Identify CPU/GPU/memory/network bottleneck.
4. Optimize one thing at a time: instancing, shared resources, culling, LOD, DPR cap, cheaper shadows/post, texture discipline.
5. Re-measure same scenario and verify visuals/playability.

## Final Response

Lead with the demonstrated root cause or bottleneck, what changed, the failing path retested and material gaps. Include matching baseline/post metrics for performance claims; follow the project completion format.
