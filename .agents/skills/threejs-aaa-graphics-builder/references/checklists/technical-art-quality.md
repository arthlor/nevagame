# Technical Art Quality Checklist

Select items relevant to changed rendering, assets or resource cost. `references/technical-art.md` supplies techniques; the project owns budgets and completion gates.

- Technical art brief converts art direction into shapes, material roles, lighting, VFX, camera, UI/world motifs, and budgets.
- Hero surfaces and support surfaces are identified separately.
- Materials use the project’s shared roles and cache; the reference names are illustrative.
- Shader/post-processing choices have player-facing purpose and measured or bounded cost.
- VFX follow the event-driven language in `references/technical-art.md`: readable, short-lived, and not hiding collision, threats, rewards, or UI.
- Instancing is used for large repeated same-geometry/same-material detail where appropriate.
- LOD, culling, or simplified far variants are planned for heavy background/imported assets.
- Imported/generated models have scale, pivot/orientation, bounds, file size, triangle/material/texture counts when available, and collision proxies checked.
- Decals/trim/detail systems reinforce function, route, faction, scale, or state.
- Threats, rewards, interactables, and player state are not communicated by color alone.
- DPR cap, shadow settings, post-processing passes, and mobile tradeoffs are reported.
- Renderer diagnostics match the render budget reporting in `references/technical-art.md`: calls, triangles, geometries, textures, and material count when available.
- Performance claims cite applicable measurements and project budgets; screenshots alone cannot establish cost.
