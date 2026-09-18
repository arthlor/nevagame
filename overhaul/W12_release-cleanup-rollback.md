# W12 — Release Candidate, Cleanup and Compatible Rollback

> Fragment of parent plan §16. Class: release. Depends on: G11.
> Exit gate: **G12** — all required candidate-specific gates pass and release
> authorization exists. This work order itself does not authorize deployment or
> destructive repository operations.

**Outcome:** One reproducible candidate can be shipped without pretending
visual approval, software rendering and save compatibility are interchangeable
evidence.

## W12.1 — Clean the implementation boundary

- [ ] Remove obsolete effect coverage, duplicate masks and temporary debug
      scaffolding no longer required.
- [ ] Retain useful diagnostics through the existing DEV/test gates; do not
      ship test cheats or auto-teleport helpers in ordinary play.
- [ ] Keep one final owner for coast/reach definitions, depth generation, water
      conditions, material parameters and palette.
- [ ] Update the owning architecture/art/pipeline/audio sections and the single
      migration ledger only where the contract changed.
- [ ] Ensure proposed interfaces in this plan have not been copied into
      canonical docs as though they exist when they do not.
- [ ] Preserve user changes and approved references unrelated to the overhaul.

## W12.2 — Run final acceptance on the exact candidate

Run the verified CI-style generated checks/static/tests/build/download checks,
production budget suite, relevant E2E/visual suites, full frozen world
acceptance, retained save fixtures and connected-loop play/reload matrix. Asset
certification and human visual approval remain separate gates. Use the existing
tooling's real options, not imagined CLI flags.

Re-run expensive evidence after changes to included source, catalog, asset,
palette or render config. Record input hashes. A screenshot or hardware pass on
an earlier build does not certify a materially different final candidate.

## W12.3 — Verify deployment consistency

Package compatible code, catalog adapters, assets and generated maps as one
versioned release. Check missing/old asset responses, browser cache behaviour
and stale-page refresh. If a service worker exists, inspect and test its update
path; do not introduce one for this task or assume one is already present.

Preserve the old compatible asset set long enough for already-loaded clients to
resolve its versioned resources. Check the supported older-client/newer-save
behaviour, update messaging and multi-tab write protection before release.
Avoid mixing old data textures with new geometry through cached filenames.

## W12.4 — Prepare rollback by change class

| Failure | Safe response |
|---|---|
| Pure shader/particle/audio regression | Revert compatible presentation code or use a tested reduced visual path |
| New asset/config defect, unchanged topology | Restore compatible asset/config bundle; preserve IDs and generated ownership |
| New topology not yet used by real saves | Restore candidate and copied fixtures to the previous tested revision |
| New topology already persisted | Forward-compatible repair or reviewed reverse migration; do not blindly deploy an unreadable older binary |
| Migration/load failure | Preserve original/backup, show recovery path, do not silently start a new world |
| One browser lacks an optical capability | Supported reduced optics with the same geometry/gameplay, or a clear recoverable unsupported state |
| Missing required human/hardware approval | Keep release gate open; report what is ready and what evidence is missing |

## W12.5 — Record completion precisely

Final report includes the source/asset input identity, changed scopes, approved
differences, all gate results, commands/artifacts, migration versions, human
approval references, hardware/browser details, known limitations and compatible
rollback method.

Use **implemented**, **unit-tested**, **browser-verified**, **visually
accepted**, **hardware-profiled** and **release-ready** as separate states. No
unchecked required gate becomes "passed" because an agent completed the code.

**G12 exit:** all required candidate-specific gates pass and release
authorization exists.
