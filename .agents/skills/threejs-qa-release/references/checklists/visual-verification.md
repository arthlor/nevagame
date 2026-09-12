# Visual Verification Checklist

Select checks for the affected visual contract and required release/gold gate.
Routine verification follows the repository task matrix directly.

- Open the correct local runtime and inspect the changed gameplay view.
- Check relevant console/page errors, canvas size and resize behavior.
- Capture a view when it helps compare or report the result; use pixel sampling
  for blank-output diagnosis, not visual quality.
- Inspect affected supported viewports, UI fit and camera framing.
- Exercise the changed real input path; screenshots cannot prove callbacks.
- Inspect motion for temporal stability claims.
- For snapshot comparisons, stabilize relevant inputs and mask only unrelated
  dynamic areas. Use the existing harness and project-approved baselines.
- Select the owning UI/model/material checklist when it answers a concrete
  remaining question. Do not load all checklists for “premium” or “complete”.
- Record exact gaps and keep agent assessment separate from human approval.
