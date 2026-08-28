# Original User Request

## 2026-08-28T13:50:36Z

Overhaul the player character (`char_player_a`) and all four village NPCs (`char_npc_elspeth_a`, `char_npc_barnaby_a`, `char_npc_silas_a`, `char_npc_maeve_a`) across procedural visual modeling, humanoid skeletal rigging with smooth vertex skinning, active dual-mode Rapier ragdoll physics, and secondary animation dynamics conforming to Neva's faceted cozy coastal aesthetic.

Working directory: /Users/anilkaraca/Desktop/Neva
Integrity mode: development

## Verification Resources
- `npm run art:validate`: Validates asset catalog specs, triangle budgets, LOD contracts, node hierarchies, and palette tokens.
- `npm run typecheck`: Ensures strict TypeScript compilation without type regressions.
- `npm run test`: Executes unit tests for animation controllers, asset coverage, and physics integration.
- Art Yard interactive inspection (`http://localhost:5173/art-yard?asset=char_player_a`).

## Requirements

### R1. Character Visuals & Faceted Low-Poly Modeling
- Upgrade the 3D procedural generator geometry for the Player avatar (`char_player_a`) and the four village NPCs (`char_npc_elspeth_a`, `char_npc_barnaby_a`, `char_npc_silas_a`, `char_npc_maeve_a`).
- Deliver distinct, readable silhouettes with authored occupational garments (fisherman oilskins, botanist apron, harbor master coat, tavern apron) in accordance with the Neva Art Bible.
- Provide clean LOD0 and LOD1 mesh representations staying within catalog triangle and material limits using official palette tokens.

### R2. Humanoid Skeletal Rigging & Vertex Skinning
- Establish a complete humanoid skeletal armature (Root, Pelvis, Spine, Chest, Neck, Head, Clavicles/Shoulders, UpperArms, Forearms, Hands, Hips, Thighs, Calves, Feet) with correct joint orientations and anatomical pivot points.
- Implement smooth vertex skinning weights across articulated joints (elbows, knees, shoulders, waist) to eliminate mesh tearing, rigid segment disjoints, and pinching during poses.
- Provide secondary bones and attachment sockets for props and accessories (`char_player_hand_socket_left`, `char_player_hand_socket_right`, `char_player_tool_socket`, `char_player_carry_socket`, `char_player_hip_socket`, plus hat/hair/coat dynamics).

### R3. Dual-Mode Active Rapier Ragdoll Physics
- Construct a multi-body physical ragdoll system in Rapier with colliders (capsules/boxes/spheres) and joint constraints matching the character skeleton.
- Support dual-mode operation: active motorized joint tracking following gameplay locomotion and action animations, with automatic or triggered transition into physical unconstrained ragdoll simulation during high-speed impacts, falls, and knockback.
- Provide seamless bi-directional pose blending from physical ragdoll state back to keyframed recovery animations upon landing or standing up.

### R4. Animation Controller & Secondary Dynamics Integration
- Update the runtime animation controller to drive the updated skeletal structure across all character states (locomotion, tool usage, fishing, carrying, sitting/rowing, dialogue).
- Integrate procedural ground adaptation (slope pitch/roll orientation and foot placement) alongside velocity-driven secondary spring-damper dynamics for garments, hats, and carried cargo.

## Acceptance Criteria

### Visual & Catalog Certification
- [ ] All 5 character GLBs (`char_player_a`, `char_npc_elspeth_a`, `char_npc_barnaby_a`, `char_npc_silas_a`, `char_npc_maeve_a`) generate cleanly via the procedural generator toolchain.
- [ ] `npm run art:validate` passes with 0 errors across catalog schema, triangle budgets, required socket nodes, and palette tokens.
- [ ] LOD0 and LOD1 levels are present and valid for all characters.

### Rigging & Deformation Quality
- [ ] Armature includes all required joints and standard attachment sockets.
- [ ] Deforming meshes show smooth skinning transitions across major limb bends without unweighted vertices or mesh tearing.
- [ ] Tool, carry, and hip sockets accurately track hand and torso motions during action clip playback.

### Physics & Active Ragdoll
- [ ] Rapier ragdoll colliders and joint limits initialize deterministically and maintain numerical stability without explosions or jitter.
- [ ] Locomotion properly utilizes motorized joint tracking and transitions smoothly to physical ragdoll upon impact/falling.
- [ ] Ragdoll state recovers smoothly to idle/get-up animations without instant snap artifacts.

### Code & Pipeline Integrity
- [ ] `npm run typecheck` passes with 0 TypeScript errors.
- [ ] `npm run test` passes all unit and integration test suites.

## Follow-up — 2026-08-28T18:06:19Z

Overhaul the player character (`char_player_a`) and all four village NPCs (`char_npc_elspeth_a`, `char_npc_barnaby_a`, `char_npc_silas_a`, `char_npc_maeve_a`) across procedural visual modeling, humanoid skeletal rigging with smooth vertex skinning, active dual-mode Rapier ragdoll physics, and secondary animation dynamics conforming to Neva's faceted cozy coastal aesthetic.

Resume context: Milestone 1 (Procedural visual modeling and catalog specs) has passed review. Comprehensive test infrastructure is active in `TEST_INFRA.md` and `TEST_READY.md` (42 tests). Full project architecture and interface contracts are recorded in `PROJECT.md`. Resume execution directly from Milestone 2 (Humanoid Skeletal Rigging, Smooth Skinning & Sockets) through Milestone 3 (Dual-Mode Active Rapier Ragdoll Physics), Milestone 4 (Animation Controller & Secondary Dynamics), and Milestone 5 (Final E2E Verification & Hardening).

Working directory: /Users/anilkaraca/Desktop/Neva
Integrity mode: development

## Verification Resources
- `npm run art:validate`: Validates asset catalog specs, triangle budgets, LOD contracts, node hierarchies, and palette tokens.
- `npm run typecheck`: Ensures strict TypeScript compilation without type regressions.
- `npm run test`: Executes unit tests for animation controllers, asset coverage, and physics integration.
- Art Yard interactive inspection (`http://localhost:5173/art-yard?asset=char_player_a`).

## Requirements

### R1. Character Visuals & Faceted Low-Poly Modeling
- Upgrade the 3D procedural generator geometry for the Player avatar (`char_player_a`) and the four village NPCs (`char_npc_elspeth_a`, `char_npc_barnaby_a`, `char_npc_silas_a`, `char_npc_maeve_a`).
- Deliver distinct, readable silhouettes with authored occupational garments (fisherman oilskins, botanist apron, harbor master coat, tavern apron) in accordance with the Neva Art Bible.
- Provide clean LOD0 and LOD1 mesh representations staying within catalog triangle and material limits using official palette tokens.

### R2. Humanoid Skeletal Rigging & Vertex Skinning
- Establish a complete humanoid skeletal armature (Root, Pelvis, Spine, Chest, Neck, Head, Clavicles/Shoulders, UpperArms, Forearms, Hands, Hips, Thighs, Calves, Feet) with correct joint orientations and anatomical pivot points.
- Implement smooth vertex skinning weights across articulated joints (elbows, knees, shoulders, waist) to eliminate mesh tearing, rigid segment disjoints, and pinching during poses.
- Provide secondary bones and attachment sockets for props and accessories (`char_player_hand_socket_left`, `char_player_hand_socket_right`, `char_player_tool_socket`, `char_player_carry_socket`, `char_player_hip_socket`, plus hat/hair/coat dynamics).

### R3. Dual-Mode Active Rapier Ragdoll Physics
- Construct a multi-body physical ragdoll system in Rapier with colliders (capsules/boxes/spheres) and joint constraints matching the character skeleton.
- Support dual-mode operation: active motorized joint tracking following gameplay locomotion and action animations, with automatic or triggered transition into physical unconstrained ragdoll simulation during high-speed impacts, falls, and knockback.
- Provide seamless bi-directional pose blending from physical ragdoll state back to keyframed recovery animations upon landing or standing up.

### R4. Animation Controller & Secondary Dynamics Integration
- Update the runtime animation controller to drive the updated skeletal structure across all character states (locomotion, tool usage, fishing, carrying, sitting/rowing, dialogue).
- Integrate procedural ground adaptation (slope pitch/roll orientation and foot placement) alongside velocity-driven secondary spring-damper dynamics for garments, hats, and carried cargo.

## Acceptance Criteria

### Visual & Catalog Certification
- [ ] All 5 character GLBs (`char_player_a`, `char_npc_elspeth_a`, `char_npc_barnaby_a`, `char_npc_silas_a`, `char_npc_maeve_a`) generate cleanly via the procedural generator toolchain.
- [ ] `npm run art:validate` passes with 0 errors across catalog schema, triangle budgets, required socket nodes, and palette tokens.
- [ ] LOD0 and LOD1 levels are present and valid for all characters.

### Rigging & Deformation Quality
- [ ] Armature includes all required joints and standard attachment sockets.
- [ ] Deforming meshes show smooth skinning transitions across major limb bends without unweighted vertices or mesh tearing.
- [ ] Tool, carry, and hip sockets accurately track hand and torso motions during action clip playback.

### Physics & Active Ragdoll
- [ ] Rapier ragdoll colliders and joint limits initialize deterministically and maintain numerical stability without explosions or jitter.
- [ ] Locomotion properly utilizes motorized joint tracking and transitions smoothly to physical ragdoll upon impact/falling.
- [ ] Ragdoll state recovers smoothly to idle/get-up animations without instant snap artifacts.

### Code & Pipeline Integrity
- [ ] `npm run typecheck` passes with 0 TypeScript errors.
- [ ] `npm run test` passes all unit and integration test suites.
