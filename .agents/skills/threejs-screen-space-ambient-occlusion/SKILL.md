---
name: threejs-screen-space-ambient-occlusion
description: "Implement a production GTAO path in Three.js. Use for half-resolution horizon sampling, reversed-depth reconstruction, bent normals, bilateral reconstruction, contact grounding, and halo diagnosis. Not for cast shadows."
---

# Screen-Space Ambient Occlusion

- **Runtime contract.** Backend: WebGL2 (`WebGLRenderer`) — no `three/webgpu` dependency. Min three: verify the installed `three` before adapting. Fallback: n/a. Post chain is WebGL2 unless the project owns a WebGPU post graph. Verified: skill pack 2026-09.
- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

AO estimates missing ambient visibility. It must modulate indirect lighting, not repaint all scene color with a dark multiply.

## Workflow

1. Verify linear depth and view-space normals.
2. Reconstruct view position consistently.
3. Sample horizon visibility in a controlled radius.
4. Estimate AO and optional bent normal.
5. Denoise with depth/normal-aware filters.
6. Apply to indirect diffuse and environment response.

Read [references/gtao-bent-normal-pipeline.md](references/gtao-bent-normal-pipeline.md).

## Invariants and strong defaults

Use these checks for the affected mechanism. Preserve concrete ownership, correctness and reproducibility contracts; adapt stylistic and tuning defaults to the brief (`../CONVENTIONS.md`).

- direct light and emission are darkened;
- radius is specified only in pixels;
- foreground silhouettes cast thick screen-space halos;
- depth discontinuities are blurred together;
- AO remains strong at distances where its world radius is subpixel;
- bent normals are treated as ordinary geometric normals;
- the implementation claims temporal accumulation even though this path has none.

## Deliverable

- Inputs: linear depth and view normals, plus the world-space AO radius.
- Artifacts: AO and optional bent-normal targets, denoise weights, and an AO-only view.
- Acceptance: direct light and emission are unchanged; no foreground halos; AO fades where its world radius is subpixel.

## Routing boundary

This skill owns GTAO gathering, bent normals, denoising, and AO application.
Use `$threejs-image-pipeline` only when its depth/normal buffers or pass order
must be coordinated with other image-space systems.
