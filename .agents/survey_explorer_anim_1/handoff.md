# Handoff Report — survey_explorer_anim_1 (Animation & Rigging Survey)

## 1. Observation

Direct investigation of the codebase across Blender procedural generators, asset catalogs, runtime animation controllers, socket systems, ground adaptation/IK, secondary springs, and test suites yielded the following observations:

### A. Humanoid Skeletal Armature Structure
- **Generator Location**: `tools/blender/generators/characters.py:66-184` (`_create_character_rig`).
  - Armature creation builds an `ARMATURE` object named `spec["rigNode"]` (e.g. `char_player_rig`, `char_npc_elspeth_a_rig`, `char_npc_barnaby_a_rig`, `char_npc_silas_a_rig`, `char_npc_maeve_a_rig`).
  - Current bone hierarchy:
    ```
    rig_root (head=(0, 0, 0.02), tail=(0, 0, height * 0.18))
    └── rig_pelvis (head=(0, 0, height * 0.31), tail=(0, 0, height * 0.47))
        ├── rig_spine (head=(0, 0, height * 0.47), tail=(0, 0, height * 0.72))
        │   ├── rig_head (head=(0, 0, height * 0.72), tail=(0, 0, height * 0.98))
        │   │   └── rig_hat_brim (head=(0, -0.12, height * 0.90), tail=(0, -0.30, height * 0.90))
        │   ├── rig_upper_arm_left (head=(-0.22, 0, height * 0.67), tail=(-0.38, 0, height * 0.49), roll=-pi)
        │   │   └── rig_forearm_left (head=(-0.38, 0, height * 0.49), tail=(-0.38, -0.01, height * 0.33), roll=-pi)
        │   │       └── rig_hand_left (head=(-0.38, -0.01, height * 0.33), tail=(-0.38, -0.04, height * 0.25), roll=-pi)
        │   ├── rig_upper_arm_right (head=(0.22, 0, height * 0.67), tail=(0.38, 0, height * 0.49), roll=pi)
        │   │   └── rig_forearm_right (head=(0.38, 0, height * 0.49), tail=(0.38, -0.01, height * 0.33), roll=pi)
        │   │       └── rig_hand_right (head=(0.38, -0.01, height * 0.33), tail=(0.38, -0.04, height * 0.25), roll=pi)
        │   └── rig_backpack (head=(0, 0.16, height * 0.52), tail=(0, 0.34, height * 0.62))
        │       ├── rig_canteen_left (head=(-0.28, 0.18, height * 0.48), tail=(-0.28, 0.28, height * 0.50))
        │       └── rig_canteen_right (head=(0.28, 0.18, height * 0.48), tail=(0.28, 0.28, height * 0.50))
        ├── rig_thigh_left (head=(-0.13, 0, height * 0.39), tail=(-0.14, 0, height * 0.20), roll=-pi)
        │   └── rig_shin_left (head=(-0.14, 0, height * 0.20), tail=(-0.14, -0.01, height * 0.065), roll=-pi)
        │       └── rig_foot_left (head=(-0.14, -0.01, height * 0.065), tail=(-0.14, -0.22, height * 0.045), roll=-pi)
        └── rig_thigh_right (head=(0.13, 0, height * 0.39), tail=(0.14, 0, height * 0.20), roll=pi)
            └── rig_shin_right (head=(0.14, 0, height * 0.20), tail=(0.14, -0.01, height * 0.065), roll=pi)
                └── rig_foot_right (head=(0.14, -0.01, height * 0.065), tail=(0.14, -0.22, height * 0.045), roll=pi)
    ```
  - **Gap vs R2 Spec**: The current rig lacks intermediate chest (`rig_chest`), neck (`rig_neck`), and clavicle/shoulder bones (`rig_clavicle_left`, `rig_clavicle_right`). Spine connects directly to upper arms and head.

### B. Vertex Skinning & Weights
- **Skinning Logic**: `tools/blender/generators/characters.py:220-324` (`_bind_character_meshes` and `_assign_character_weights`).
  - `_rig_bone_for_mesh(name)` associates whole mesh components to a single primary bone by name tokens (e.g. `head`, `torso`, `thigh_left`, `shin_left`, etc.).
  - `_assign_character_weights` adds heuristic vertex weight sharing:
    - Torso/vest/coat vertices blend laterally to `rig_upper_arm_left` / `rig_upper_arm_right` when `abs(x) > 0.06` (weight up to 0.32).
    - `upper_arm` adds 0.2 weight to `forearm`.
    - `forearm` / `sleeve_cuff` adds 0.16 weight to `upper_arm`.
    - `thigh` adds 0.18 weight to `shin`.
    - `shin` / `trouser_cuff` adds 0.16 weight to `thigh`.
    - `backpack` adds 0.12 weight to `spine`.
    - All vertex influences are normalized so `sum(weights) == 1.0` per vertex.
  - Mesh objects are joined by material into `lod_prefix_material_XX` and bound with an `ARMATURE` modifier targeting the rig (`pipeline.py:104-109` asserts every mesh has 1 modifier targeting the rig and non-empty vertex groups).
  - **Limitation**: Geometry consists of separate disjoint primitives (boxes, cylinders, icos, tapered beams) rather than continuous topology across joints. Deep bends (e.g. rowing, kneeling) exhibit minor polygon interpenetration and seam gaps.

### C. Socket Attachment System
- **Blender Generator Sockets**: `tools/blender/generators/characters.py:644-675` (`_add_character_sockets`).
  - Five standard sockets per character:
    - `[prefix]_hand_socket_left` parented to `rig_hand_left` at `(-0.38, -0.05, height * 0.288)`.
    - `[prefix]_hand_socket_right` parented to `rig_hand_right` at `(0.38, -0.05, height * 0.288)`.
    - `[prefix]_tool_socket` parented to `rig_hand_right` at `(0.38, -0.05, height * 0.288)`.
    - `[prefix]_carry_socket` parented to `rig_spine` at `(0.0, 0.36, height * 0.54)`.
    - `[prefix]_hip_socket` parented to `rig_pelvis` at `(0.28, 0.02, height * 0.40)`.
  - All sockets are exported as Empty nodes parented with `parent_type = "BONE"` (`pipeline.py:111-116` validates socket nodes).
- **Runtime Tool & Prop Attachment**:
  - `src/render/assets/ToolSocketAttach.ts:1-66`:
    - Axis convention: Socket world identity at rest (+X right outward palm, +Y up, +Z forward).
    - `SHAFT_ALONG_FINGERS = [Math.PI, 0, 0]` rotates shaft tools (sickle, scoop, fishing rod) 180° so the handle follows fingers.
    - `IDENTITY_EULER = [0, 0, 0]` used for watering can, seed pouch, crop bundle, harvest basket.
  - `src/render/scene/WorldScene.ts:2325-2386` & `3067`:
    - Farming props attached via `socket.add(object)`.
    - Rowboat oars attached to left/right hand sockets.
    - Fishing rod line updates track tip position relative to tool socket base orientation.
  - `src/art-yard/main.ts:878-895`:
    - Art Yard dynamically mounts tools/props to character sockets for visual inspection.

### D. Runtime Animation Controllers
- **Controller Implementation**: `src/render/animation/AnimationController.ts:1-1120` (`HumanoidAnimator` / `AnimationController`).
  - **Layered Architecture**:
    - Full-body base clips: `this.actions`
    - Upper-body masked clips: `this.upperActions` (`maskedClip(clip, "upper")`, filtered by `UPPER_TRACK_TOKENS`)
    - Lower-body masked clips: `this.lowerActions` (`maskedClip(clip, "lower")`)
  - **Clip Resolution Matrix (`desiredLayers`)**:
    - Airborne: `jump_start` (rising phase) or `fall` (falling phase).
    - Sport Fishing: `brace`, `slack`, `reel`, `fishing_idle` over base `idle`.
    - Basic Fishing: `fishing_idle` over base `idle`.
    - Boating: `rowboat.row` (scaled and sign-flipped by throttle) / `rowboat_idle`, `skiff.skiff_drive` / `skiff_idle`.
    - On-foot Locomotion: `walk` / `run` (gait speed matched), overlaying `carry_walk` / `carry_run` when carrying, or `talk_gesture` when talking.
  - **Managed Transitions (`resolveTransition`)**:
    - Idle -> Move: `walk_start` (0.32s), `run_start` (0.28s).
    - Move -> Stop: `stop` (0.36s).
    - Turning in place: `turn_left` / `turn_right` (0.40s) when `turnRateRadiansPerSecond > 0.8`.
  - **Action One-Shots & Contact Recovery**:
    - One-shots (`play(action)`): `plant`, `water`, `harvest`, `pickup`, `place`, `workstation`, `cast`.
    - Upper-body one-shots (`UPPER_BODY_ONE_SHOTS`: `water`, `workstation`, `cast`) run on upper layer without stopping locomotion.
    - Landings (`updateContactRecovery`): `land_soft` (0.32s) or `land_hard` (0.48s).
  - **Speed Scaling & Footstep Contact Events**:
    - `playbackScale` computes scale based on `speed / referenceSpeedMetersPerSecond` (clamped `0.45` to `1.85` via `CANONICAL_RENDER_CONFIG.motion`).
    - `clipAdvance` advances time proportionally to travel distance to eliminate foot slide.
    - `collectEvents` evaluates timeline crossing of authored events (`footstep_left`, `footstep_right`, `tool_contact`, `transaction_commit`, `cast_release`, `landing_contact`), suppressing footstep audio when blocked by collision or stationary.
  - **Procedural Pose Fallback**:
    - `applyProceduralPose`: Analytic sine wave gait that drives `RIG_ALIASES` nodes if a model lacks authored glTF animation clips.

### E. Ground/Slope Adaptation & Secondary Dynamics
- **Ground Orientation & Stance**: `AnimationController.ts:830-884` (`updateGrounding`).
  - Gated by `motion.isGrounded`, `slopeRadians <= 38°`, and `on-foot`/`farm-placement` mode.
  - Calculates local normal in character yaw frame (`localNormalX`, `localNormalZ`).
  - Computes smoothed `groundPitch`, `groundRoll`, and differential foot offsets `desiredLeftFoot`, `desiredRightFoot` based on `halfStanceMeters = 0.16` and `groundingMaxFootOffsetMeters = 0.16`.
- **Two-Bone Foot IK**: `AnimationController.ts:908-935` (`applyTwoBoneFootIk`).
  - Direct analytical hip, knee, and ankle rotation adjustments:
    - `hip = groundPitch * 0.5 + offsetY * 2.2`
    - `knee = -groundPitch * 0.65 - offsetY * 3.1`
    - `ankle = groundPitch * 0.4 - offsetY * 0.8`
  - Falls back to vertical translation `applyFootGrounding()` under reduced motion or flat ground.
- **Secondary Dynamics (Spring-Damper)**: `AnimationController.ts:937-985` (`applySecondarySprings`).
  - 2nd-order damped oscillator for `backpack`, `canteen_left`, `canteen_right`, `hat_brim`.
  - Tuned by `CANONICAL_RENDER_CONFIG.motion.secondarySpringStiffness` (default 18) and `secondarySpringDamping` (default 9).
  - Driven by linear acceleration (`accelerationMetersPerSecondSquared`) and angular yaw turn rate (`turnRateRadiansPerSecond`).
  - Zeroed out when `reducedMotionSecondaryScale == 0`.

### F. Test Suites & Verification
- `tests/unit/animationController.test.ts`: 12 automated unit tests verifying node aliases, procedural poses, airborne gating, start/stop/run state transitions, speed matching, reduced motion landing recovery, footstep event emission gating, fishing/boating/carrying routing, talk gestures, two-bone foot IK, and backpack secondary spring response.
  - Command `npx vitest run tests/unit/animationController.test.ts` passed: 12/12 tests passing in 92ms.
- `tests/unit/artPipeline.test.ts`: Validates asset catalog schemas, clip metadata (`REQUIRED_CHARACTER_CLIPS` = 32 clips for player, `REQUIRED_NPC_CLIPS` = 6 clips for NPCs), commit markers, and required bone/socket nodes.

---

## 2. Logic Chain

1. **Armature Expansion (R2 Requirement)**:
   - *Observation A* demonstrates that the current rig connects `rig_spine` directly to `rig_upper_arm_*` and `rig_head`, lacking `rig_chest`, `rig_neck`, `rig_clavicle_left`, and `rig_clavicle_right`.
   - *Observation D* shows `UPPER_TRACK_TOKENS` and `RIG_ALIASES` in `AnimationController.ts` already list standard bone names (`rig_spine`, `rig_head`, `rig_upper_arm_`, etc.).
   - *Deduction*: Adding `rig_chest`, `rig_neck`, and `rig_clavicle_*` in `characters.py` will require updating:
     - `_create_character_rig` in `characters.py`.
     - `_key_rig_pose` and authored action dictionaries (`arms_forward`, `arms_carry`, `arms_tool_hold`, etc.) in `characters.py` to ensure clavicles/chest maintain natural rest orientation during all 32 clips.
     - `RIG_ALIASES` and `UPPER_TRACK_TOKENS` in `AnimationController.ts` to recognize chest, neck, and clavicles.

2. **Vertex Skinning Quality**:
   - *Observation B* shows that current skinning applies uniform weight blending per primitive (e.g. whole upper arm gets 0.2 forearm weight) rather than vertex-distance gradient falloff along limb segments.
   - *Deduction*: Smoothing joint deformation (preventing pinching/tearing at elbows, knees, shoulders, and waist) requires authored vertex weight gradients computed from vertex coordinate projection along each bone's axis, followed by existing normalization.

3. **Socket Tracking & Runtime Stability**:
   - *Observation C* verifies that all 5 sockets (`hand_socket_left`, `hand_socket_right`, `tool_socket`, `carry_socket`, `hip_socket`) are bone-parented empties with identity world orientation at rest, and runtime tools attach via `ToolSocketAttach.ts`.
   - *Deduction*: Maintaining identical socket node names and transform contracts preserves full backwards compatibility with `WorldScene.ts`, `ToolSocketAttach.ts`, `FishingPresentation.ts`, and `art-yard`.

4. **Active Ragdoll & Secondary Dynamics (R3 & R4 Requirements)**:
   - *Observation D & E* confirm that `AnimationController.ts` already receives continuous `PlayerMotionSample` (velocity, acceleration, slope normal, contact events) and controls secondary springs.
   - *Deduction*: Integrating Rapier physical ragdoll simulation (R3) requires coupling Rapier capsule/box rigid bodies to the humanoid bone hierarchy, with active motorized tracking during locomotion and pose blending upon recovery into `land_soft`/`land_hard`/`idle`.

---

## 3. Caveats

1. **NPC-Specific Actions**: The four village NPCs (`char_npc_elspeth_a`, `char_npc_barnaby_a`, `char_npc_silas_a`, `char_npc_maeve_a`) share the same rig topology as `char_player_a` but only author 6 required clips (`idle`, `talk_gesture`, `walk`, `carry_idle`, `turn_left`, `turn_right`). Any armature changes must be applied equally across `coastal_worker` and `npc_character` generators.
2. **Catalog Schema Validation**: `cli.mjs` and `pipeline.py` enforce strict validation on node names and clip durations. If bone names or socket names change, `asset-catalog.json`, `AssetCatalog.generated.ts`, and test fixtures must be updated synchronously.
3. **Ragdoll Physics System**: The current physics codebase (`src/physics/PhysicsWorld.ts`, `StaticCollision.ts`) handles kinematic player controller and static colliders. Full active Rapier multi-body ragdoll integration (R3) is an addition that interfaces with `AnimationController` and `PhysicsWorld`.

---

## 4. Conclusion

The existing animation and rigging pipeline in Neva is clean, robust, and well-structured, featuring:
- A catalog-driven Blender generator workflow producing rigged, bone-parented GLB assets.
- A 3-layer runtime `AnimationController` with speed-matching gait, state machine transitions, footstep event dispatch, slope adaptation, 2-bone foot IK, and 2nd-order secondary spring dynamics.
- A unified socket system handling tools, cargo, and boat oars seamlessly across gameplay and Art Yard.

**Recommended Action Plan for Overhaul (R1-R4)**:
1. **Rig Architecture**: Upgrade `_create_character_rig` in `tools/blender/generators/characters.py` to establish the complete 15+ joint hierarchy (Root, Pelvis, Spine, Chest, Neck, Head, Clavicles, UpperArms, Forearms, Hands, Thighs, Calves/Shins, Feet).
2. **Skinning Gradient**: Replace block-level weights in `_assign_character_weights` with geometric distance-falloff skin weighting across articulated joint capsules (elbows, knees, shoulders, neck, waist).
3. **Clips Update**: Refine authored keyframe actions in `_author_character_actions` for player (32 clips) and NPCs (6 clips) to utilize chest/neck/clavicle poses for natural posture.
4. **Active Ragdoll Integration**: Connect the humanoid bone hierarchy to Rapier ragdoll colliders/joints for motorized tracking and physical impact simulation.
5. **Controller & Validation**: Update `AnimationController.ts` aliases and ensure `npm run art:validate`, `npm run typecheck`, and `npm run test` pass with 0 errors.

---

## 5. Verification Method

To independently verify these findings:

1. **Execute Animation Unit Test Suite**:
   ```bash
   npx vitest run tests/unit/animationController.test.ts
   ```
   *Expected*: All 12 unit tests pass.

2. **Validate Art Pipeline & Catalog Contracts**:
   ```bash
   npm run art:validate
   ```
   *Expected*: Passes with 0 errors across catalog schemas, triangle budgets, socket nodes, and animation clip durations.

3. **Verify Full Test Suite & Typecheck**:
   ```bash
   npm run typecheck
   npm run test
   ```
   *Expected*: 0 TypeScript errors and all simulation/unit tests pass.

4. **Inspect Interactive Animation & Sockets in Art Yard**:
   Navigate to `http://localhost:5173/art-yard?asset=char_player_a` to inspect clips, scrub timelines, view contact events, and attach socket props.
