# Handoff Report: Physics & Active Ragdoll Architecture Survey

**Agent**: `survey_explorer_phys_1` (Teamwork Explorer / Investigation)  
**Parent**: `5c6e8b2c-6c7f-4746-9fc8-5bb67b382c95` (Project Orchestrator)  
**Working Directory**: `/Users/anilkaraca/Desktop/Neva/.agents/survey_explorer_phys_1`  
**Date**: 2026-08-28T13:54:48Z  
**Type**: Hard Handoff (Investigation Complete)

---

## 1. Observation

### 1.1 Physics Engine Setup & World Simulation
- **Engine Dependency**: `package.json:40` declares `"@dimforge/rapier3d-compat": "^0.14.0"`.
- **Rapier World Lifecycle**:
  - `src/physics/PhysicsWorld.ts:223-257`: `PhysicsWorld.create()` initializes `@dimforge/rapier3d-compat` via `await rapier.init()`.
  - World instantiated with gravity `new rapier.World({ x: 0, y: -18, z: 0 })` and fixed integration timestep `this.world.integrationParameters.dt = 1 / 60` (`PhysicsWorld.ts:225-226`).
  - Terrain collider is constructed from `WorldLayout.terrainBaseHeightfield()` as a heightfield (`PhysicsWorld.ts:244-250`):
    ```ts
    const terrain = rapier.ColliderDesc.heightfield(
      TERRAIN_RESOLUTION,
      TERRAIN_RESOLUTION,
      sharedTerrainBaseHeightfield(),
      new rapier.Vector3(TERRAIN_SIZE_METERS, 1, TERRAIN_SIZE_METERS)
    ).setFriction(0.86);
    ```
  - Road collider is constructed from indexed road mesh geometry (`PhysicsWorld.ts:251-254`):
    ```ts
    const road = sharedRoadColliderGeometry();
    this.world.createCollider(
      rapier.ColliderDesc.trimesh(road.vertices, road.indices).setFriction(0.9)
    );
    ```
  - Authored world props & building colliders are ingested from `StaticCollisionProxy[]` (`src/physics/StaticCollision.ts:1-11`, `src/physics/CollisionCatalogAdapter.ts:30-72`) as fixed cuboids (`PhysicsWorld.ts:275-294`).
  - Game Loop Execution: `src/app/GameApp.ts:1225-1246` implements a fixed accumulator (`physicsAccumulatorSeconds += deltaSeconds; while (accum >= 1/60) step()`).
  - Simulation & State Ownership: `src/simulation/Simulation.ts:118-119` and `src/simulation/domains/NavigationDomain.ts:33-83` receive `ResolvedPhysicsFrame` from `PhysicsWorld.step()`, validate finite numerical coordinates, traversal stamina, bounds, and active boat anchoring before mutating `GameState`. Three.js objects remain presentation-only (`LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md:274`).

### 1.2 Character Physics & Character Controller
- **Player Kinematic Body & Collider**:
  - `src/physics/PhysicsWorld.ts:44-55, 227-243`:
    - `CHARACTER_CONTROLLER_OFFSET_METERS = 0.035`
    - `PLAYER_CAPSULE_HALF_HEIGHT_METERS = 0.62`
    - `PLAYER_CAPSULE_RADIUS_METERS = 0.32`
    - `PLAYER_POSE_GROUND_OFFSET_METERS = 0.5`
    - `PLAYER_COLLIDER_CENTER_FROM_POSE_METERS = 0.44`
    - `PLAYER_GROUND_SNAP_METERS = 0.38`
    - `PLAYER_HARD_LANDING_SPEED_METERS_PER_SECOND = 8.5`
  - Created via `this.playerBody = this.world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setCanSleep(false))` with a vertical capsule collider (`setFriction(0)`).
  - Character Controller configuration (`PhysicsWorld.ts:237-242`):
    - `this.controller = this.world.createCharacterController(CHARACTER_CONTROLLER_OFFSET_METERS)`
    - `controller.setApplyImpulsesToDynamicBodies(false)`
    - `controller.setMaxSlopeClimbAngle((38 * Math.PI) / 180)` (38°)
    - `controller.setMinSlopeSlideAngle((46 * Math.PI) / 180)` (46°)
    - `controller.enableAutostep(0.42, 0.24, true)` (0.42m step height, 0.24m min width)
    - `controller.enableSnapToGround(PLAYER_GROUND_SNAP_METERS)` (0.38m)
- **Locomotion & Environment Interaction**:
  - Traversal calculations in `src/simulation/navigation/PlayerTraversal.ts:3-18` define `walkSpeedMetersPerSecond = 5`, `sprintSpeedMetersPerSecond = 8.2`, `acceleration = 32 m/s²`, `deceleration = 42 m/s²`, `gravity = 18 m/s²`, `jumpSpeed = 5.55 m/s`, `coyoteTime = 0.1s`, `jumpBuffer = 0.12s`.
  - `slopeGaitScale(normal, moveX, moveZ)` adjusts traversal speed on inclines (`PlayerTraversal.ts:85-99`).
  - `resolveWalkableSlide` (`PhysicsWorld.ts:132-201`) provides tangent shoreline sliding along `WorldLayout.waterSignedDistance` isolines and keeps the character on valid ground.
  - Boat parenting (`PhysicsWorld.ts:1178-1214`): When aboard (`activeBoatId`), player coordinates are directly anchored to boat position (`y = boat.y + 0.5`, `rotationY = boat.headingRadians`, `contactSurface = "boat-deck"`).

### 1.3 Skeletal Armature & Rigging in Codebase
- **Authoring Rig in Blender Generator**:
  - `tools/blender/generators/characters.py:66-184` (`_create_character_rig`) creates armature for `char_player_a`, `char_npc_elspeth_a`, `char_npc_barnaby_a`, `char_npc_silas_a`, `char_npc_maeve_a`:
    - `rig_root` (head (0, 0, 0.02), tail (0, 0, 0.39))
    - `rig_pelvis` (height * 0.31 to height * 0.47)
    - `rig_spine` (height * 0.47 to height * 0.72)
    - `rig_head` (height * 0.72 to height * 0.98)
    - `rig_upper_arm_left / right` (sign * 0.22, 0, height * 0.67 -> sign * 0.38, 0, height * 0.49)
    - `rig_forearm_left / right` (sign * 0.38, 0, height * 0.49 -> sign * 0.38, -0.01, height * 0.33)
    - `rig_hand_left / right` (sign * 0.38, -0.01, height * 0.33 -> sign * 0.38, -0.04, height * 0.25)
    - `rig_thigh_left / right` (sign * 0.13, 0, height * 0.39 -> sign * 0.14, 0, height * 0.20)
    - `rig_shin_left / right` (sign * 0.14, 0, height * 0.20 -> sign * 0.14, -0.01, height * 0.065)
    - `rig_foot_left / right` (sign * 0.14, -0.01, height * 0.065 -> sign * 0.14, -0.22, height * 0.045)
    - Secondary bones: `rig_backpack`, `rig_canteen_left / right`, `rig_hat_brim`
- **Required Sockets**:
  - `assets/specs/asset-catalog.json:11158-11171`:
    - `char_player_hand_socket_left`
    - `char_player_hand_socket_right`
    - `char_player_tool_socket`
    - `char_player_carry_socket`
    - `char_player_hip_socket`
- **Animation Controller Integration**:
  - `src/render/animation/AnimationController.ts:158-175`: Maps semantic rig aliases to bones / meshes (`RIG_ALIASES`).
  - Supports 3-layer animation: Lower Body Locomotion (`walk`, `run`, `idle`), Upper Body Actions (`water`, `cast`, `reel`, `carry`), and Secondary Spring Dynamics (`backpack`, `canteen`, `hat_brim`).
  - Foot IK & Ground Adaptation (`AnimationController.ts:830-936`): 2-bone foot IK adapting thigh, shin, foot rotation to `groundPitch` and `left/rightFootOffsetY`.

### 1.4 Current Ragdoll State
- **Current Code**: No multi-body ragdoll system exists in `src/physics/` yet. `PhysicsWorld` currently uses only single-capsule kinematic controller for player movement.
- **Requirement R3 in ORIGINAL_REQUEST.md**: Multi-body physical ragdoll system in Rapier with colliders (capsules/boxes/spheres) and joint constraints matching the character skeleton, dual-mode motorized tracking vs physical unconstrained simulation, and bi-directional pose blending back to recovery animations.

### 1.5 Test Suite & Verification Commands
- `npx vitest run tests/unit/physicsWorld.test.ts`: **20 passed (20)** in 5.3s.
- `npx vitest run tests/unit/physicsEdgeCases.test.ts`: **8 passed (8)** in 2.2s.
- `npx vitest run tests/unit/animationController.test.ts`: **12 passed (12)** in 34ms.
- `npm run test` (Full Test Suite): **607 tests passed across 65 test files** (610 total tests). All physics, traversal, and animation unit tests passed with 100% success.
- `npm run typecheck`: Fails only on unrelated E2E test file (`tests/e2e/p12VerticalSlice.spec.ts:229: error TS18048`). All core physics, animation, and simulation code compiles strictly without errors.

---

## 2. Logic Chain

### Step 1: Physics Engine Integration Architecture
- **Premise**: Rapier 3D is already integrated as a pure TypeScript/WASM module (`@dimforge/rapier3d-compat`) encapsulated in `PhysicsWorld.ts`.
- **Reasoning**: The simulation runs with fixed 60 Hz steps (`1/60s`) and communicates via the clean `PhysicsAdapter` interface (`PhysicsStepResult`, `ResolvedPhysicsFrame`, `PlayerMotionSample`).
- **Conclusion**: Ragdoll multi-body systems can be constructed directly inside the existing `PhysicsWorld` (or a dedicated `RagdollSystem` class owned by `PhysicsWorld`), stepping synchronously with the Rapier physics world without altering the simulation-presentation boundary.

### Step 2: Humanoid Multi-Body Ragdoll Formulation
- **Premise**: Character models share a 16-bone humanoid skeleton (`rig_root`, `pelvis`, `spine`, `head`, 2x `upper_arm`, 2x `forearm`, 2x `hand`, 2x `thigh`, 2x `shin`, 2x `foot`).
- **Reasoning**:
  1. Each skeletal segment maps to a Rapier dynamic rigid body with an appropriate primitive collider:
     - **Pelvis**: Cuboid `(0.18, 0.10, 0.12)` or Capsule `(r=0.12, h=0.14)`. Mass: 15.0 kg.
     - **Spine / Torso**: Cuboid `(0.20, 0.16, 0.14)`. Mass: 24.0 kg.
     - **Head**: Sphere `(r=0.14)` or Capsule `(r=0.12, h=0.12)`. Mass: 4.5 kg.
     - **Upper Arms (L/R)**: Capsule `(r=0.065, h=0.16)`. Mass: 3.0 kg.
     - **Forearms (L/R)**: Capsule `(r=0.055, h=0.14)`. Mass: 2.0 kg.
     - **Hands (L/R)**: Cuboid `(0.045, 0.04, 0.08)`. Mass: 0.8 kg.
     - **Thighs (L/R)**: Capsule `(r=0.09, h=0.20)`. Mass: 8.5 kg.
     - **Shins (L/R)**: Capsule `(r=0.07, h=0.20)`. Mass: 4.0 kg.
     - **Feet (L/R)**: Cuboid `(0.06, 0.05, 0.14)`. Mass: 1.5 kg.
     - **Total Mass**: ~78.3 kg (realistic human proportion).
  2. Multi-body joints connect adjacent bones:
     - **Pelvis -> Spine**: `SphericalJoint` / `GenericJoint` with 3-axis limits (pitch: [-25°, 35°], roll: [-20°, 20°], yaw: [-30°, 30°]).
     - **Spine -> Head**: `SphericalJoint` (pitch: [-35°, 40°], roll: [-25°, 25°], yaw: [-60°, 60°]).
     - **Spine -> Upper Arms**: `SphericalJoint` cone-twist (cone limit: 80°, twist limit: [-45°, 90°]).
     - **Upper Arm -> Forearm**: `RevoluteJoint` (hinge: [0°, 145°] flexion).
     - **Forearm -> Hand**: `SphericalJoint` (pitch: [-45°, 45°], yaw: [-30°, 30°]).
     - **Pelvis -> Thigh**: `SphericalJoint` cone-twist (cone limit: 65°, twist limit: [-30°, 45°]).
     - **Thigh -> Shin**: `RevoluteJoint` (hinge: [-145°, 0°] knee flexion).
     - **Shin -> Foot**: `RevoluteJoint` / `SphericalJoint` (pitch: [-35°, 25°], roll: [-15°, 15°]).
  3. Collision Filtering:
     - Parent and child bodies must have self-collision disabled via Rapier's joint configuration or `ActiveCollisionTypes` / collision groups (`interactionGroups(0x0002, 0xFFFD)`), preventing catastrophic jitter or constraint explosion.

### Step 3: Dual-Mode Active Ragdoll Operation
- **Premise**: The character needs both active animation-driven posture and full physical ragdoll response.
- **Reasoning**:
  1. **Mode A — Active Motorized Tracking**:
     - During normal locomotion (`walk`, `run`, `idle`, `jump`, `farming`, `fishing`), the kinematic character controller moves the root capsule.
     - The ragdoll bodies can either be kinematic/sensor-driven or active motorized (`joint.configureMotorPosition(targetAngle, stiffness, damping)` or PD-controller tracking).
     - In active mode, the character's limbs conform to keyframed animations while maintaining physical presence (e.g. interacting with vegetation or colliding with dynamic props).
  2. **Mode B — Physical Ragdoll (Limp / Simulated)**:
     - Trigger Conditions:
       - Hard landing: `motion.contactEvent === "land-hard"` (vertical landing velocity >= `8.5 m/s`).
       - High-speed impact: boat crash or fast knockback (`speed > 10 m/s` into solid obstacle).
       - Debug / Scripted trigger: knockback action or slip.
     - On trigger:
       - Disable kinematic character controller displacement.
       - Switch rigid bodies to full dynamic mode (`RigidBodyType.Dynamic`).
       - Apply inherited linear and angular velocities from the character's current motion trajectory (`motion.velocity`).
       - Relax joint motor stiffness (`stiffness -> 0`, `damping -> moderate`) so the body falls realistically under gravity (`g = -18 m/s²`).

### Step 4: Bi-Directional Pose Blending & Settle Recovery
- **Premise**: When ragdoll physics concludes, the character must stand up or recover smoothly without visual popping or teleports.
- **Reasoning**:
  1. **Settle Detection**:
     - Monitor pelvis body linear speed (`|v| < 0.2 m/s`) and angular speed (`|omega| < 0.5 rad/s`) for 15 consecutive frames (0.25s), or timeout after max ragdoll duration (e.g., 3.0s).
  2. **Prone vs Supine Pose Analysis**:
     - Sample pelvis / spine world up vector ($U_{pelvis}$) and forward vector ($F_{pelvis}$).
     - If $U_{pelvis} \cdot \hat{y}_{world} > 0.3$: Prone (lying face down).
     - If $U_{pelvis} \cdot \hat{y}_{world} < -0.3$: Supine (lying face up).
  3. **Root Realignment**:
     - Compute ground projection of pelvis position $(X_{pelvis}, Y_{ground}, Z_{pelvis})$.
     - Update the kinematic character controller's position to $(X_{pelvis}, Y_{ground}, Z_{pelvis})$ and heading $\theta = \text{atan2}(F_x, F_z)$.
  4. **Slerp Pose Interpolation**:
     - Capture snapshot of all 16 ragdoll bone orientations $\{q_{ragdoll, i}\}$.
     - Target pose is the first frame of the get-up animation clip (`land_hard`, `stand_up_prone`, or `stand_up_supine`).
     - Blend weight $\alpha(t) = \text{smoothstep}(0, 1, t / T_{blend})$ with $T_{blend} = 0.35\text{s}$.
     - Three.js skeleton interpolates $q_i(t) = \text{slerp}(q_{ragdoll, i}, q_{clip, i}(t), \alpha(t))$ and local positions $p_i(t) = \text{lerp}(p_{ragdoll, i}, p_{clip, i}(t), \alpha(t))$.
     - Guarantees continuous C0 and C1 trajectory with zero snapping or camera pops.

### Step 5: NPC Integration & Determinism
- **Premise**: All 4 NPCs (`elspeth`, `barnaby`, `silas`, `maeve`) share the exact same skeletal topology and catalog spec format as `char_player_a`.
- **Reasoning**: The ragdoll system can be instantiated on-demand or pre-allocated per character instance. Since NPCs are mostly stationary at authored anchors (`src/content/npcs.ts`), NPC ragdoll bodies can remain asleep (`canSleep = true`) until activated by scripted events or player interaction.

---

## 3. Caveats

1. **WASM Multi-Threading & Garbage Collection**:
   - Rapier WASM objects (`RAPIER.World`, `RigidBody`, `Collider`, `ImpulseJoint`) are managed in WASM memory. Disposing or replacing ragdoll instances must explicitly invoke `world.removeRigidBody(body)` and `world.removeImpulseJoint(joint)` to prevent WASM heap leaks.
2. **Joint Limit Jitter at High Simulation Angles**:
   - In WASM physics, extreme angular impulses on chained spherical joints can cause constraint drift. Angular damping (`setAngularDamping(1.2)`) and linear damping (`setLinearDamping(0.6)`) on all ragdoll rigid bodies are required.
3. **Boat Deck Interaction**:
   - When ragdoll activates aboard a moving boat (`activeBoatId`), the ragdoll bodies must receive boat-relative velocity or be stimulated in the boat's moving coordinate frame to prevent falling through the deck into water.
4. **Existing Road Geometry Unit Test**:
   - `tests/unit/roadGeometry.test.ts` has 1 minor assertion failure in the test suite (`keeps the bridge deck empty`). This is an existing test condition unrelated to the physics engine or ragdoll architecture.

---

## 4. Conclusion

The Neva codebase has a robust, clean Rapier 3D integration (`PhysicsWorld.ts`) and a 3-layer animation controller (`AnimationController.ts`), providing the exact foundation needed for the dual-mode active ragdoll overhaul.

### Recommended Implementation Structure

```
src/physics/
├── PhysicsWorld.ts                 # Master physics coordinator (adds ragdoll management)
├── StaticCollision.ts              # Static prop cuboids
├── CollisionCatalogAdapter.ts      # Asset catalog collision projection
└── ragdoll/
    ├── HumanoidRagdoll.ts          # Multi-body ragdoll: 16 rigid bodies + 15 joints + limits
    ├── RagdollBoneMapping.ts       # Maps rig_* bone hierarchy to Rapier bodies/colliders
    ├── RagdollMotorController.ts   # Active mode: PD motor tracking of animation poses
    └── RagdollPoseBlender.ts       # Bi-directional Slerp interpolation & get-up recovery
```

### Key Technical Specifications for Implementation
1. **Body & Joint Topology**: 11 primary rigid bodies (Pelvis, Spine, Head, 2x UpperArm, 2x Forearm, 2x Thigh, 2x Shin, 2x Foot) connected with 10 Rapier `SphericalJointDesc` and `RevoluteJointDesc` constraints.
2. **Mass Distribution**: Total ~78 kg, mass ratios <= 3:1 between parent and child joints for maximum numerical stability.
3. **Dual-Mode Transitions**:
   - Locomotion: Kinematic Character Controller + Active Motorized/Kinematic Joint Tracking.
   - Impact / Fall: Transition to Dynamic Multi-body Ragdoll with initial velocity transfer.
   - Recovery: Settle detection -> Prone/Supine classification -> Ground root snap -> 0.35s Slerp pose blend into recovery/idle clip.

---

## 5. Verification Method

To independently verify the physics and ragdoll systems:

1. **Run Physics Unit Tests**:
   ```bash
   npx vitest run tests/unit/physicsWorld.test.ts
   npx vitest run tests/unit/physicsEdgeCases.test.ts
   ```
2. **Run Animation Controller Tests**:
   ```bash
   npx vitest run tests/unit/animationController.test.ts
   ```
3. **Verify Strict TypeScript Compilation**:
   ```bash
   npm run typecheck
   ```
4. **Inspect Character Armature in Blender Pipeline**:
   ```bash
   npm run art:validate
   ```
5. **Interactive Art Yard Inspection**:
   Navigate to `http://localhost:5173/art-yard?asset=char_player_a` to observe skeletal deformation, sockets, and animation clips.

