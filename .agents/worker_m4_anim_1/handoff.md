# Milestone 4 Handoff Report: Animation Controller, Foot IK & Secondary Dynamics

## 1. Observation
- **Target Files**:
  - `src/render/animation/AnimationController.ts`: Core runtime character animation controller implementation.
  - `src/render/assets/ToolSocketAttach.ts`: Defines canonical socket attach poses for tools, cargo, and props.
  - `tests/unit/animationController.test.ts`: Unit test suite verifying animation states, 3-layer masking, Foot IK, secondary dynamics, and socket alignments.
  - `tests/unit/characterPipeline.test.ts`: Pipeline integration test suite verifying 20 features across all characters.
- **Armature Mapping**:
  - Full 20-bone humanoid rig mapped via `RIG_ALIASES` across:
    - Root (`rig_root`), Pelvis (`rig_pelvis`), Spine (`rig_spine`), Chest (`rig_chest`), Neck (`rig_neck`), Head (`rig_head`)
    - Left Arm: Clavicle (`rig_clavicle_left`), Upper Arm (`rig_upper_arm_left`), Forearm (`rig_forearm_left`), Hand (`rig_hand_left`)
    - Right Arm: Clavicle (`rig_clavicle_right`), Upper Arm (`rig_upper_arm_right`), Forearm (`rig_forearm_right`), Hand (`rig_hand_right`)
    - Left Leg: Thigh (`rig_thigh_left`), Shin (`rig_shin_left`), Boot/Foot (`rig_foot_left`)
    - Right Leg: Thigh (`rig_thigh_right`), Shin (`rig_shin_right`), Boot/Foot (`rig_foot_right`)
  - 4 Secondary bones mapped via `SECONDARY_RIG_ALIASES`:
    - `rig_hat_brim`: Hat brim spring sway
    - `rig_backpack`: Backpack load inertia
    - `rig_canteen_left`: Left canteen pendular swing
    - `rig_canteen_right`: Right canteen pendular swing
- **3-Layer Track Filtering**:
  - Track classification via `UPPER_TRACK_TOKENS` separating upper body joints from lower body joints.
  - Base layer plays lower actions when upper actions (e.g., `water`, `workstation`, `cast`, `carry_walk`, `talk_gesture`) are active, ensuring clean independent locomotion and action masking.
- **Analytical Two-Bone Foot IK & Ground Adaptation**:
  - Real-time ground normal vector alignment computing ground pitch and roll within canonical limits (`CANONICAL_RENDER_CONFIG.motion.groundingMaxTiltRadians`).
  - Lateral foot height offsets computed from cross-slope terrain stance width ($0.16\text{m}$).
  - Analytical two-bone trigonometric adjustments distributed across hip, knee, and ankle rotations.
- **2nd-Order Damped Harmonic Oscillators**:
  - Velocity and acceleration-driven second-order spring dynamics with stiffness $k$ and damping $c$, decaying to zero at rest and suppressed under reduced motion.
- **Socket Attachment**:
  - Full conformance with `ToolSocketAttach.ts` (`SHAFT_ALONG_FINGERS = [Math.PI, 0, 0]` for shaft tools, `[0, 0, 0]` for non-shaft tools/pouches/baskets).

## 2. Logic Chain
1. **Humanoid & Secondary Bone Resolution**:
   - The animation controller initializes with bone alias maps covering both primary 20-bone humanoid rigs and 4 secondary bones.
   - Rest transforms are cached upon instantiation for deterministic relative spring and procedural offsets.
2. **Layer Masking & Clip Management**:
   - Animations are split into upper and lower tracks via `maskedClip()`.
   - When one-shot upper-body actions (e.g. `water`, `workstation`, `cast`) or state-driven upper-body layers (`carry_walk`, `talk_gesture`) are triggered, the controller routes them to `upperActions` while keeping locomotion (`walk`, `run`, `idle`) on `lowerActions`.
3. **Foot IK & Slope Adaptation**:
   - Terrain normal is decomposed into local pitch (Z-axis) and roll (X-axis) using character heading.
   - Left and right foot target offsets are calculated as $y_{\text{offset}} = \pm \frac{\mathbf{n}_x \cdot w}{\mathbf{n}_y}$.
   - Hip, knee, and ankle joint angles are adjusted analytically according to the elevation offset and slope pitch, keeping feet grounded and legs aligned.
4. **Physical Secondary Oscillations**:
   - Spring state $(\theta, \dot{\theta})$ integrates acceleration $a$ and turn rate $\dot{\psi}$ using 2nd-order damped harmonic physics.
   - Under reduced motion or zero motion, springs damp smoothly to rest positions without popping or drift.
5. **Prop Sockets**:
   - Sockets mounted to `rig_hand_right`, `rig_hand_left`, `rig_spine`, and `rig_pelvis` apply `socketAttachFor(assetId)` position, rotation, and scaling transforms matching Art Yard and in-game specifications.

## 3. Caveats
- No caveats. The controller architecture adheres to Neva's presentation-only simulation decoupling and strictly respects canonical render configurations.

## 4. Conclusion
Milestone 4 implementation is complete, fully verified, and hardened. All 20 humanoid bones, 4 secondary oscillators, 3-layer track filtering, two-bone foot IK, and prop socket mounting are operational and certified across unit and integration test suites.

## 5. Verification Method
- `npm run typecheck`: Passed (0 errors, strict mode).
- `npx vitest run tests/unit/animationController.test.ts`: Passed (17/17 tests).
- `npx vitest run tests/unit/characterPipeline.test.ts`: Passed (29/29 tests).
- `npx vitest run tests/unit/humanoidRagdoll.test.ts tests/unit/empirical_m1_challenger_characters.test.ts tests/unit/empirical_m2_challenger_rigging.test.ts tests/unit/empirical_m3_challenger_ragdoll.test.ts`: Passed (46/46 tests).
- `node tools/blender/cli.mjs validate --family character`: Passed (5/5 published character assets validated).
