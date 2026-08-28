## 2026-08-28T13:51:38Z
Investigate the skeletal rigging, skinning, socket attachments, and animation systems across the codebase:
1. Humanoid skeletal armature structure: Root, Pelvis, Spine, Chest, Neck, Head, Clavicles/Shoulders, UpperArms, Forearms, Hands, Hips, Thighs, Calves, Feet. Check how armatures are created in Blender generators or runtime loaders.
2. Vertex skinning & weights: how smooth skinning is configured (in Blender generator or procedural skinning code) to prevent tearing/pinching/disjoints.
3. Socket system: bone attachments and sockets (`char_player_hand_socket_left`, `char_player_hand_socket_right`, `char_player_tool_socket`, `char_player_carry_socket`, `char_player_hip_socket`, hat/hair/coat dynamics) and how props/tools/cargo attach to characters at runtime.
4. Runtime animation controllers (search `src/` for animation, character controller, state machines, clip playback, transitions across locomotion, tool use, fishing, carrying, sitting/rowing, dialogue).
5. Ground/slope adaptation (foot placement, slope orientation) and velocity-driven secondary dynamics (spring-damper for hair/hat/coat/cargo).
6. Existing animation test suites and runtime integration points.
