# Project: Neva Character Overhaul (Player & Village NPCs)

## Architecture
The Neva Character Overhaul unifies procedural 3D modeling, anatomical humanoid rigging, smooth vertex skinning, active Rapier ragdoll physics, and runtime animation control into a cohesive pipeline conforming to the Neva Art Bible (`LLM/04_ART_DIRECTION_BIBLE_PREMIUM_COZY_LOW_POLY.md`) and Technical Architecture (`LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md`).

### Data & Execution Flow
```
[Asset Catalog Specs (asset-catalog.json)]
              │
              ▼
[Procedural Blender Generators (characters.py)]
 ├── Low-Poly Faceted Modeling (LOD0 & LOD1)
 ├── Humanoid Armature (15+ articulated joints)
 ├── Smooth Distance-Falloff Skinning Weights
 ├── 5 Bone-Parented Sockets (Tool, Carry, Hip, Hands)
 └── Authored Keyframe Action Clips (32 Player / 6 NPC)
              │
              ▼ (npm run art:validate / art:generate)
[Optimized GLB Assets with COLOR_0 & Meshopt]
              │
              ├──► [Runtime Animation Controller (AnimationController.ts)]
              │     ├── 3-Layer Clip Masking (Base, Upper, Lower)
              │     ├── Two-Bone Foot IK & Ground Adaptation
              │     ├── Secondary Spring-Damper Dynamics
              │     └── Socket Attachment (ToolSocketAttach.ts)
              │
              └──► [Dual-Mode Rapier Ragdoll Physics (src/physics/ragdoll/)]
                    ├── 11 Rigid Bodies & 10 Constrained Joints
                    ├── Active Mode: PD Motor Tracking of Animation Poses
                    ├── Physical Mode: Unconstrained Impact / Fall Simulation
                    └── Settle & Slerp Pose Recovery Blending
```

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Player Visual Model (`char_player_a`) | Faceted cozy low-poly traveler/farmer model with straw hat, utility vest, quilted lapels, cargo pockets, trousers, boots | M1 | Survey §3.4 |
| 2 | Gardener NPC Visual Model (`char_npc_elspeth_a`) | Faceted model with sun bonnet, hair bun, apron bib/skirt, gardening trowel holster | M1 | Survey §3.5 |
| 3 | Handyman NPC Visual Model (`char_npc_barnaby_a`) | Faceted craftsman model with flat cap, ear pencil, work apron, tool belt, hammer holster | M1 | Survey §3.6 |
| 4 | Dockmaster NPC Visual Model (`char_npc_silas_a`) | Faceted dockmaster model with sou'wester hat, deep sea coat, foam-white beard, brass watch chain | M1 | Survey §3.7 |
| 5 | Merchant NPC Visual Model (`char_npc_maeve_a`) | Faceted fishmonger/shopkeeper model with braided hair bun, neck scarf, apron, scale pin | M1 | Survey §3.8 |
| 6 | LOD0/LOD1 Representations & Budget Validation | Multi-level LODs adhering to triangle budgets (Player 12k/18k, NPCs 8k-8.5k/16k) and <=6 palette materials | M1 | Survey §3.2 |
| 7 | Palette Token & Linear COLOR_0 Baking | Material assignment and vertex color baking strictly adhering to `neva.palette.json` tokens | M1 | Survey §3.13 |
| 8 | Humanoid Skeletal Armature | 15+ joint articulated humanoid skeleton (Root, Pelvis, Spine, Chest, Neck, Head, Clavicles L/R, UpperArms L/R, Forearms L/R, Hands L/R, Thighs L/R, Shins L/R, Feet L/R) | M2 | Survey §3.9 |
| 9 | Smooth Vertex Skinning Weights | Geometric distance-falloff skin weighting across articulated joints (elbows, knees, shoulders, waist, neck) | M2 | Survey §3.10 |
| 10 | Standard Bone-Parented Sockets | 5 empty socket markers (`hand_socket_left`, `hand_socket_right`, `tool_socket`, `carry_socket`, `hip_socket`) parented to corresponding bones | M2 | Survey §3.3 |
| 11 | Authored Keyframe Action Suite | Refined 32 player action clips and 6 NPC action clips utilizing full skeletal articulation | M2 | Survey §3.11, §3.12 |
| 12 | Rapier Multi-Body Ragdoll Architecture | 11 dynamic/kinematic rigid bodies and 10 anatomical joint constraints matching humanoid armature | M3 | Survey §3.4 (Phys) |
| 13 | Active Motorized Joint Tracking | Motorized joint tracking following animation poses with spring-damper compliance during locomotion | M3 | Survey §3.4 (Phys) |
| 14 | Physical Ragdoll Transition & Impact Trigger | Unconstrained physical simulation triggered on high-speed impact (`>10m/s`), hard landing (`>=8.5m/s`), or knockback with velocity transfer | M3 | Survey §3.4 (Phys) |
| 15 | Bi-Directional Pose Blending & Settle Recovery | Settle detection, prone/supine classification, kinematic root realignment, and 0.35s Slerp pose recovery blending | M3 | Survey §3.4 (Phys) |
| 16 | Animation Controller Expanded Rig Support | Runtime node alias mapping and multi-layer track filtering supporting Chest, Neck, and Clavicle bones | M4 | Survey §3.16 |
| 17 | Ground & Slope Adaptation (Foot IK) | Real-time terrain normal alignment, ground pitch/roll stance, and two-bone analytical foot IK | M4 | Survey §3.16 |
| 18 | Secondary Spring-Damper Dynamics | Velocity and acceleration-driven 2nd-order damped oscillators for garments, hats, backpacks, and cargo | M4 | Survey §3.16 |
| 19 | Socket Prop Mounting & Art Yard Integration | Seamless prop attachment (tools, cargo, rods, oars) across gameplay and interactive Art Yard visual inspection | M4 | Survey §3.17 |
| 20 | 100% E2E Verification & Adversarial Hardening | Verification against all E2E test suites (Tiers 1-4) and white-box adversarial coverage hardening (Tier 5) | M5 | Survey §1.5 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Procedural 3D Visual Modeling & Catalog Validation | Visual modeling of Player & 4 NPCs in `characters.py`, occupational garments, LOD0/LOD1, palette tokens, `art:validate` | none | DONE |
| M2 | Humanoid Skeletal Rigging, Vertex Skinning & Sockets | 15+ joint armature, distance-falloff skin weighting, 5 sockets, 32+6 animation clips | M1 | DONE |
| M3 | Dual-Mode Active Rapier Ragdoll Physics System | `src/physics/ragdoll/`, 11 rigid bodies, 10 joints, active motorized tracking, impact transition, Slerp recovery blending | M2 | DONE |
| M4 | Animation Controller, Foot IK & Secondary Dynamics | `AnimationController.ts` rig support, 2-bone foot IK, secondary spring dynamics, socket prop mounting, Art Yard integration | M2, M3 | PLANNED |
| M5 | Final E2E Test Suite Validation & Hardening | Pass 100% of E2E test suite (Tiers 1-4) and complete Tier 5 adversarial coverage hardening | M1, M2, M3, M4, TEST_READY | PLANNED |

---

## Interface Contracts

### 1. Blender Generator ↔ Catalog Schema Contract
- Generator signatures:
  - `coastal_worker(spec: dict, context: dict) -> dict`
  - `npc_character(spec: dict, context: dict) -> dict`
- Required Nodes in exported GLB:
  - `[asset_id]_root`: Root empty node.
  - `lod0`: LOD0 empty parent node.
  - `lod1`: LOD1 empty parent node.
  - `[asset_id]_rig`: Armature object with 15+ primary bones and secondary bones.
  - `[asset_id]_hand_socket_left`: Parented to `rig_hand_left`.
  - `[asset_id]_hand_socket_right`: Parented to `rig_hand_right`.
  - `[asset_id]_tool_socket`: Parented to `rig_hand_right`.
  - `[asset_id]_carry_socket`: Parented to `rig_spine`.
  - `[asset_id]_hip_socket`: Parented to `rig_pelvis`.
- Bone Naming Standard:
  - `rig_root`, `rig_pelvis`, `rig_spine`, `rig_chest`, `rig_neck`, `rig_head`
  - `rig_clavicle_left`, `rig_upper_arm_left`, `rig_forearm_left`, `rig_hand_left`
  - `rig_clavicle_right`, `rig_upper_arm_right`, `rig_forearm_right`, `rig_hand_right`
  - `rig_thigh_left`, `rig_shin_left`, `rig_foot_left`
  - `rig_thigh_right`, `rig_shin_right`, `rig_foot_right`
  - `rig_hat_brim`, `rig_backpack`, `rig_canteen_left`, `rig_canteen_right`

### 2. Physics Ragdoll ↔ Animation Controller Contract
- Interface `HumanoidRagdoll`:
  ```ts
  export interface HumanoidRagdoll {
    readonly mode: "kinematic-active" | "physical-ragdoll" | "recovering";
    initialize(world: RAPIER.World, initialPose: CharacterPoseSnapshot): void;
    updateActiveTracking(targetPose: CharacterPoseSnapshot, dt: number): void;
    triggerPhysicalRagdoll(linearVelocity: RAPIER.Vector3, angularVelocity: RAPIER.Vector3): void;
    updateRecovery(dt: number): RagdollRecoverySample | null;
    getBoneTransforms(): Map<string, { position: [number, number, number]; quaternion: [number, number, number, number] }>;
    dispose(world: RAPIER.World): void;
  }
  ```

### 3. Socket Attachment Contract
- `ToolSocketAttach.ts`:
  - Rest orientation: `+X` right outward palm, `+Y` up along grip, `+Z` forward.
  - Shaft tools apply `SHAFT_ALONG_FINGERS = [Math.PI, 0, 0]`.
  - Non-shaft tools apply `IDENTITY_EULER = [0, 0, 0]`.

---

## Code Layout
```
tools/blender/
├── generators/
│   ├── characters.py             # Procedural character mesh, rig, skinning, and clip generator
│   └── registry.py               # Generator mapping ("coastal_worker", "npc_character")
├── common/
│   ├── geometry.py               # Low-poly faceted primitives and COLOR_0 baking
│   ├── lod.py                    # LOD0/LOD1 hierarchy
│   ├── materials.py              # Palette BSDF materials
│   └── pipeline.py               # Validation and glTF export pipeline
└── cli.mjs                       # Catalog and GLB validation CLI

src/
├── physics/
│   ├── PhysicsWorld.ts           # Master physics coordinator
│   └── ragdoll/
│       ├── HumanoidRagdoll.ts        # Rapier multi-body ragdoll lifecycle & bodies
│       ├── RagdollBoneMapping.ts     # Bone-to-collider & joint definitions
│       ├── RagdollMotorController.ts # PD motor tracking in active mode
│       └── RagdollPoseBlender.ts     # Settle detection & Slerp recovery blending
└── render/
    └── animation/
        ├── AnimationController.ts    # 3-layer animation controller, foot IK, springs
        └── types.ts                  # Animation and motion data structures
```
