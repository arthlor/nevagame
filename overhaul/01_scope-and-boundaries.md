# 01 — Scope and Non-Negotiable Boundaries

> Fragment of `NEVA_WORLD_OVERHAUL_IMPLEMENTATION_PLAN.md` §1. Not an authority.
> Root `AGENTS.md` routes; owning docs decide.

## 1.1 Preserve

- The no-combat farming → processing → preparation → fishing → cargo → market →
  progression loop; existing balance, costs, unlocks, quest identities and content IDs.
- Plain TypeScript/Vite/Three.js rendering, existing React/DOM UI, Rapier
  integration, fixed-step simulation ownership and deterministic gameplay RNG.
  Do not replace the engine or upgrade libraries as part of this overhaul.
- `WorldLayout` as the compatibility interface while internals improve
  incrementally; existing terrain/traversal support, bridge and pier exceptions,
  route grading, and working-ground protection.
- Existing water optics, CPU/GPU low-frequency wave agreement, near-water detail,
  lighting/atmosphere, composition fields and quality tiers. Extend their owners
  rather than starting replacements.
- Catalog-driven Blender → validated/optimized GLB → runtime loader pipeline,
  palette tokens and `VisualRenderConfig` ownership. Terrain/water-generated
  geometry continues through its existing runtime construction path; static rocks
  and architectural assets remain catalog-backed GLBs.
- Primary and backup save semantics. Do not invent a third manual save slot,
  reset IndexedDB, silently repair a save by deletion, or run candidate topology
  against the developer's only save.
- Player changes unrelated to this scope; approved harbor appearance; existing
  accepted art and gameplay-camera baselines outside a declared change envelope.
  [R01–R04, R07–R10]

**Dependency note:** the inspected `package.json` declares `three` and
`@types/three` as `^0.174.0`, Rapier as `^0.14.0`, React as `^18.3.1`; these are
declared ranges, not proof of installed versions. CI uses Node 22. Resolve actual
versions from the lockfile and installed packages in W00. Do not implement
against a newer Three.js example without checking the locked API. [R02, R03]

## 1.2 Deliver

1. Correct all-around-island ocean/river classification and coastal
   fishing-access targeting.
2. Shared coast/reach projections and consistent derived maps, without creating
   multiple geographical authorities.
3. Shore treatment appropriate to sand, rock, cliff and shelter on both islands.
4. A connected spring → upper reach → waterfall → plunge pool → downstream
   river slice.
5. Stronger landform silhouettes, bank/road/shore transitions, and selective
   authored rock geometry.
6. More distinctive river reaches, sheltered/exposed sea behaviour, and purposeful
   shallow seabed shapes.
7. Habitat-based rock/vegetation composition, restrained atmosphere, waterfall
   audio and nonintrusive camera framing.
8. Save-safe topology integration, production performance evidence and
   cross-browser validation.

## 1.3 Explicitly excluded

No full fluid simulation, FFT ocean, dynamic erosion simulation, voxel terrain,
ECS rewrite, WebGPU migration, new networking/backend, new combat, map-size
expansion, character/NPC overhaul, economic rebalance, automatic tides/flooding,
mandatory planar reflections, new third-party asset service, or wholesale
vegetation replacement.

No swimming, boat passage through waterfalls, new fish species, new rewards, or
reclassification of the existing estuary "lake" habitat by artistic implication.
Preserve the existing lake/lagoon identity and quest contracts unless a separately
approved gameplay change explicitly replaces them. The waterfall's upper reach and
pool remain non-sailable and non-fishable in this work order unless an existing
gameplay authority already permits the exact location. [R09]

## 1.4 Change classes (assign BEFORE editing each work package)

| Class | Examples | Required protection |
|---|---|---|
| **P — Presentation only** | Reflection filtering, particle density, visual current streaks, local sound | No canonical save/world change; quality tiers may change appearance only |
| **B — Behaviour correction, unchanged topology** | Correct render water-region weights; coastal access targeting a genuinely adjacent accessible shore | Explicit allowed behavioural differences; prove all protected gameplay states and membership fields remain unchanged |
| **T — Topology/support change** | River footprint, water level, rock collider, altered path support, steep bank, moved building approach | Candidate revision, affected-entity analysis, migration/reload fixtures, collision/traversal integration and rollback strategy before release |

- A change to a collider can be class T even when the ground's X/Z footprint
  is unchanged. A render-only fix becomes class T when it changes authoritative
  movement, navigation or saved support.
- Assign the class before editing each work package.
