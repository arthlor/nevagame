# 02 — Evidence Baseline: What Is Known vs. What Must Be Reproduced

> Fragment of parent plan §2. The audit was source-based; its browser could not
> create a WebGL context. It did not prove runtime appearance, frame time, or
> test results. Treat D01–D06 as **reproduction targets**, not pre-approved
> screenshots or universal runtime failures.

| ID | Source-supported observation | Required reproduction before changing it |
|---|---|---|
| D01 | Neva's render water profile uses distance from `coastlineZ(x)` for river weights in its legacy branch, although Neva has a closed coast loop. | Show current profile and physical water membership at `(-220, -60)` and representative points around every side. Confirm the problematic branch on the current commit. |
| D02 | Legacy shore foam iterates across the southern coastline; continuous optical swash is weighted by harbor influence. | Produce a coverage overlay and actual coast views; identify all existing foam owners and double coverage. Do not assume every uncovered point should have visible foam. |
| D03 | Sunreach coastal access uses a shoreline-gradient approach; Neva's ordinary coastal fallback uses the southern coastline. | Exercise accessible western/eastern/northern bank candidates and distinguish unsupported cliffs from genuinely missed access. |
| D04 | Headwaters interpolate 20 → 12 → 3 → 0 m between the authored knots and use slope-based rapids. | Capture current source/rapids geometry, water baseline, collider support and camera views. This is an enhancement target, not automatically a defective waterfall. |
| D05 | Optical depth is generated from sampled terrain support; the marine bathymetry field generally uses a distance approximation outside the harbor treatment. | Trace every depth consumer and measure differences; preserve gameplay tuning where it intentionally uses a proxy. |
| D06 | Terrain, roads, water, composition fields, spatial batching and test tools already exist. | Map actual runtime use; do not infer streaming, LOD, or release coverage solely from a helper's filename. |

**Owners:** `WaterSurface.ts`, `ShoreFoam.ts`, `CoastalOptics.ts`,
`WorldLayout.ts`, `WorldIslands.ts`, `NevaHeadwaters.ts`, the existing water
tests and composition infrastructure. [R07–R13]

**Rule:** when a finding no longer reproduces, record
**"not reproduced at \<commit\>"**, retain the regression test where useful,
and skip its corrective patch. Never reintroduce an old defect to make a plan
step relevant.
