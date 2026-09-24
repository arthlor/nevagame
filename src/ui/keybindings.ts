// src/ui/keybindings.ts

/**
 * The single description of what the keyboard actually does.
 *
 * The title screen, the How to Play folio, and the pause menu each used to
 * carry their own hand-written list, and all three had drifted from
 * `InputRouter` — the journal, ledger, planner, quick tools, and the soil
 * overlay were missing everywhere. Every surface now renders from here, so a
 * new binding is described once.
 */
export interface KeyBinding {
  /** Rendered inside a keycap. Use " / " to offer an alternative. */
  readonly keys: string;
  readonly action: string;
  /** Modes where the binding does nothing, so the list can stay honest. */
  readonly note?: string;
}

export interface KeyBindingGroup {
  readonly id: string;
  readonly title: string;
  readonly bindings: readonly KeyBinding[];
}

export const KEY_BINDING_GROUPS: readonly KeyBindingGroup[] = [
  {
    id: "movement",
    title: "Moving around",
    bindings: [
      { keys: "W A S D", action: "Walk, or steer a boat" },
      { keys: "Arrows", action: "Walk, or steer a boat" },
      { keys: "Shift", action: "Sprint", note: "Costs stamina on foot" },
      { keys: "Space", action: "Jump" },
      { keys: "RMB drag", action: "Orbit the camera" },
      { keys: "Scroll", action: "Zoom the camera" }
    ]
  },
  {
    id: "world",
    title: "Working the world",
    bindings: [
      {
        keys: "E",
        action: "Contextual interaction — talk, board, harvest, cast",
        note: "Takes out the tool the action needs"
      },
      { keys: "LMB", action: "Use the pointed crop action, or cast at water" },
      {
        keys: "1 – 5",
        action: "Optional quick tools",
        note: "Available shortcuts change near farms, water, and boats"
      },
      { keys: "Alt", action: "Hold to read the soil overlay on a farm" },
      { keys: "F", action: "Open or close the farm forecast" },
      { keys: "RMB click", action: "Inspect a crop, or read the water at the shore" }
    ]
  },
  {
    id: "fishing",
    title: "Fishing",
    bindings: [
      { keys: "E", action: "Hold to charge a cast, release to cast" },
      { keys: "R", action: "Arm or put away a Woven Lure", note: "Required before sport fishing" },
      { keys: "Space", action: "Hook the bite, then hold to keep pressure" },
      { keys: "W", action: "Reel in", note: "Sport fishing" },
      { keys: "S", action: "Give slack", note: "Sport fishing" },
      { keys: "A / D", action: "Swing the rod against the run", note: "Sport fishing" }
    ]
  },
  {
    id: "menus",
    title: "Menus",
    bindings: [
      { keys: "Esc", action: "Pause, or close the open screen" },
      { keys: "C", action: "Character & Gear" },
      { keys: "I", action: "Satchel" },
      { keys: "J", action: "Field Journal" },
      { keys: "M", action: "Nautical chart" },
      { keys: "L", action: "Hold & Stores" },
      { keys: "P", action: "Expedition board", note: "Once unlocked" }
    ]
  }
] as const;

/** Flat list for compact surfaces that cannot afford section headings. */
export const KEY_BINDINGS: readonly KeyBinding[] = KEY_BINDING_GROUPS.flatMap(
  (group) => group.bindings
);

export function keyBindingsFor(groupId: string): readonly KeyBinding[] {
  return KEY_BINDING_GROUPS.find((group) => group.id === groupId)?.bindings ?? [];
}
