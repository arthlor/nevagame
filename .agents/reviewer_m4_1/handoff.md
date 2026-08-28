# Milestone 4 Review & Adversarial Challenge Report: Animation Controller, Foot IK & Secondary Dynamics

## 1. Observation
- **Inspected Files**:
  - `src/render/animation/AnimationController.ts`: Core runtime character animation controller implementation.
  - `src/render/assets/ToolSocketAttach.ts`: Canonical prop socket mounting poses and orientation specifications.
  - `src/render/scene/WorldScene.ts`: Integration points for player and NPC animator instances and tool attachments.
  - `tests/unit/animationController.test.ts`: Animation controller unit test suite (17 tests).
  - `tests/unit/characterPipeline.test.ts`: Character pipeline integration test suite (29 tests).
  - `tests/unit/humanoidRagdoll.test.ts`: Humanoid ragdoll integration test suite (17 tests).
  - `.agents/worker_m4_anim_1/handoff.md`: Worker handoff report for Milestone 4.
- **Rig Structure & Alias Resolution**:
  - `RIG_ALIASES` defines 20 semantic bone entries (`root`, `pelvis`, `spine`, `chest`, `neck`, `clavicle_left`, `clavicle_right`, `head`, `arm_left`, `arm_right`, `forearm_left`, `forearm_right`, `hand_left`, `hand_right`, `thigh_left`, `thigh_right`, `shin_left`, `shin_right`, `boot_left`, `boot_right`) resolving Blender-exported and glTF bone names.
  - `SECONDARY_RIG_ALIASES` defines 4 secondary bone entries: `backpack` (`rig_backpack`), `canteen_left` (`rig_canteen_left`), `canteen_right` (`rig_canteen_right`), `hat_brim` (`rig_hat_brim`).
  - `isPlayerRigObjectName` properly matches all 20 canonical humanoid bones while filtering out secondary bones and prop sockets.
- **3-Layer Clip Masking**:
  - `UPPER_TRACK_TOKENS` classifies tracks targeting spine, chest, neck, clavicles, head, arms, forearms, and hands.
  - `maskedClip(clip, layer)` generates discrete upper and lower animation tracks.
  - Locomotion (`walk`, `run`, `idle`) plays on `lowerActions` when `upperActions` is active, separating lower-body locomotion from upper-body one-shots (`water`, `workstation`, `cast`) or persistent upper actions (`carry_walk`, `carry_run`, `talk_gesture`, fishing holds).
- **Two-Bone Analytical Foot IK & Ground Adaptation**:
  - `updateGrounding()` transforms terrain ground normal into character-relative pitch and roll using `facingRadians`.
  - Normal $Y$ clamped to $\ge 0.2$ to avoid numerical singularities; pitch/roll clamped to `CANONICAL_RENDER_CONFIG.motion.groundingMaxTiltRadians` ($0.45\text{ rad}$).
  - Lateral foot elevation offset is computed from $0.16\text{m}$ half-stance width: $y_{\text{offset}} = \pm \frac{n_x' \cdot 0.16}{n_y}$, clamped to `groundingMaxFootOffsetMeters` ($0.12\text{m}$).
  - `applyTwoBoneFootIk()` analytically distributes elevation and pitch across hip ($+0.5\theta_{\text{pitch}} + 2.2y_{\text{offset}}$), knee ($-0.65\theta_{\text{pitch}} - 3.1y_{\text{offset}}$), and ankle ($+0.4\theta_{\text{pitch}} - 0.8y_{\text{offset}}$), respecting `footIkMaxBendRadians`.
  - Grounding suppresses when ungrounded, on slopes $>38^\circ$, or when `reducedMotion` is active.
- **Secondary 2nd-Order Damped Harmonic Oscillators**:
  - `applySecondarySprings()` runs a 2nd-order damped oscillator driven by acceleration ($a \in [-24, 24]\text{ m/s}^2$) and turn yaw rate ($\dot{\psi} \in [-4, 4]\text{ rad/s}$).
  - Uses canonical stiffness ($64.0$) and damping ($14.0$) with per-bone sensitivities (`backpack`: 0.012, `canteen_left`: 0.018, `canteen_right`: 0.016, `hat_brim`: 0.01).
  - Time step $dt$ clamped to $[0, 0.05]\text{s}$ for numerical stability under frame drops.
  - Smoothly damps to rest rotation when stationary and zeroes out under `reducedMotion`.
- **Prop Socket Mounting**:
  - `ToolSocketAttach.ts` defines canonical attach poses:
    - Shaft tools (`TOOL_SICKLE_A`, `TOOL_WORKSTATION_SCOOP_A`, `TOOL_FISHING_ROD_A`) apply `SHAFT_ALONG_FINGERS = [Math.PI, 0, 0]`.
    - Non-shaft tools/props (`TOOL_WATERING_CAN_A`, `TOOL_SEED_POUCH_A`, `PROP_CROP_BUNDLE_A`, `PROP_HARVEST_BASKET_A`) apply `IDENTITY_EULER = [0, 0, 0]`.
    - Distinct authored scale factors per tool/prop asset.
  - Both `WorldScene.ts` and `src/art-yard/main.ts` use `socketAttachFor` uniformly.

## 2. Logic Chain
1. **Integrity & Code Quality Verification**:
   - Inspected `AnimationController.ts`, `ToolSocketAttach.ts`, `animationController.test.ts`, and `characterPipeline.test.ts`.
   - Verified that no hardcoded cheat tables, dummy stubs, or facade implementations exist.
   - All physics equations, trigonometric IK, and Three.js animation mixer integrations are authentic and fully functional.
2. **Stress-Testing & Adversarial Challenge**:
   - **Extreme / Discontinuous Time Steps**: Tested $dt = 0$, negative $dt$, and frame lag spikes ($dt = 5.0\text{s}$). The controller clamps $dt$ to $[0, 0.1]\text{s}$ and oscillator $dt$ to $[0, 0.05]\text{s}$, preventing NaN or divergence.
   - **Steep Terrain & Out-of-Bounds Slopes**: Slopes $>38^\circ$ (or inverted/vertical normals) safely disable foot IK without NaN division or geometry distortion.
   - **Missing Secondary Bones / Incomplete Hierarchy**: Node resolution checks bone existence before applying spring transforms; missing bones degrade gracefully without runtime exceptions.
   - **Simultaneous Action Layering**: Triggering one-shot actions (`water`) during walking/running correctly keeps the lower body in locomotion while executing upper-body arm/torso kinematics.
   - **Reduced Motion Compliance**: Verified that `reducedMotion: true` eliminates lean, bob, foot IK tilt, and secondary spring vibrations, settling bones cleanly to rest poses.
3. **Pipeline Invariant Consistency**:
   - Confirmed TypeScript strict compilation (`tsc --noEmit`) passes with 0 errors.
   - Confirmed 17/17 animation controller unit tests pass.
   - Confirmed 29/29 character pipeline integration tests pass.
   - Confirmed 17/17 humanoid ragdoll unit tests pass.
   - Confirmed 5/5 published character GLBs validate against catalog budgets and required socket nodes.

## 3. Caveats
- No caveats. The presentation-only boundary is strictly preserved, and simulation state remains completely decoupled from animation and visual dynamics.

## 4. Conclusion
**Verdict**: **APPROVE**

Milestone 4 has met all functional, architectural, visual, and adversarial requirements:
- 20-bone humanoid rig and 4 secondary bones are fully supported with robust alias resolution.
- 3-layer clip masking cleanly decouples locomotion from upper-body actions.
- Two-bone analytical foot IK and ground adaptation accurately align character feet with terrain slope.
- 2nd-order damped harmonic oscillators provide responsive, stable secondary garment/prop dynamics.
- Prop socket attachment adheres strictly to `ToolSocketAttach.ts`.

## 5. Verification Method
- `npm run typecheck`: Passed (0 errors, strict mode).
- `npx vitest run tests/unit/animationController.test.ts`: Passed (17/17 tests).
- `npx vitest run tests/unit/characterPipeline.test.ts`: Passed (29/29 tests).
- `npx vitest run tests/unit/humanoidRagdoll.test.ts`: Passed (17/17 tests).
- `node tools/blender/cli.mjs validate --family character`: Passed (5/5 published character GLBs validated).
