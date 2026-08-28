# E2E Test Infra: Neva Character Overhaul

## Test Philosophy
- **Requirement-Driven & Opaque-Box**: Tests are derived strictly from `ORIGINAL_REQUEST.md`, Neva architecture guidelines, and character asset contracts without dependence on implementation internals.
- **Methodology**: Systematic 4-Tier verification incorporating Category-Partition testing, Boundary Value Analysis (BVA), Pairwise Combinatorial testing, and Real-World Workload testing.

## Feature Inventory & Test Matrix
| # | Feature | Source (Requirement) | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) |
|---|---------|----------------------|:----------------:|:-----------------:|:----------------------:|:-------------------:|
| 1 | Player Visual Model (`char_player_a`) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Gardener NPC Model (`char_npc_elspeth_a`) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | Handyman NPC Model (`char_npc_barnaby_a`) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 4 | Dockmaster NPC Model (`char_npc_silas_a`) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 5 | Merchant NPC Model (`char_npc_maeve_a`) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 6 | LOD0/LOD1 Budget & Ratio Contracts | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 7 | Palette Tokens & COLOR_0 Baking | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 8 | Humanoid Armature Hierarchy | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 9 | Smooth Vertex Skinning Weights | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 10 | Attachment Sockets Contract | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 11 | Authored Action Clips (32+6) | ORIGINAL_REQUEST §R2, §R4 | 5 | 5 | ✓ | ✓ |
| 12 | Rapier Multi-Body Colliders & Joints | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 13 | Active Motorized Joint Tracking | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 14 | Physical Ragdoll Transition on Impact | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 15 | Bi-Directional Slerp Pose Recovery | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 16 | Animation Controller Rig & Masks | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 17 | Ground/Slope Adaptation & Foot IK | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 18 | Secondary Spring-Damper Dynamics | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 19 | Socket Prop Mounting in World & Art Yard | ORIGINAL_REQUEST §R2, §R4 | 5 | 5 | ✓ | ✓ |
| 20 | Complete Pipeline & Build Integrity | ORIGINAL_REQUEST §AC | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Test Runner**: `vitest` / node test environment.
- **Commands**:
  - `npm run art:validate -- --family character`: Validates character catalog specs, triangle counts, LOD contracts, sockets, and animation clips.
  - `npx vitest run tests/unit/characterPipeline.test.ts`: Validates character generation, skinning, and catalog integration.
  - `npx vitest run tests/unit/ragdollPhysics.test.ts`: Validates Rapier ragdoll body creation, joint limits, active tracking, impact transition, and Slerp pose recovery.
  - `npx vitest run tests/unit/animationController.test.ts`: Validates layered animation controller, foot IK, and spring dynamics.
  - `npm run typecheck`: Strict TypeScript compilation check.
  - `npm run test`: Full test suite run.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Farming Loop with Tool Socket Swapping | F1, F10, F11, F16, F18, F19 | High |
| 2 | Coastal Slope Navigation & Uneven Terrain Foot IK | F1, F8, F9, F16, F17, F18 | High |
| 3 | High-Speed Cliff Drop & Ragdoll Settle-Recovery Cycle | F1, F8, F12, F13, F14, F15 | Very High |
| 4 | Rowboat Navigation & Dual Oar Hand Socket Synchronization | F1, F10, F11, F16, F19 | High |
| 5 | Village NPC Stance, Gestures & Dialogue Socket Inspection | F2, F3, F4, F5, F8, F9, F10, F11, F19 | High |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥ 100 test assertions across 20 features (5 per feature).
- **Tier 2 (Boundary & Corner)**: ≥ 100 boundary tests (zero speed, max slope, extreme angular impulses, max triangle limits, socket detached states).
- **Tier 3 (Cross-Feature Combinations)**: Pairwise coverage across locomotion + ragdoll, farming + sockets, slopes + IK + springs.
- **Tier 4 (Real-World Scenarios)**: 5 comprehensive end-to-end workload scenario tests.
- **Total Test Suite Volume**: ≥ 230 test cases/assertions verifying the entire character overhaul.
