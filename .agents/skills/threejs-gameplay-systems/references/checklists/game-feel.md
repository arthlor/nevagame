# Game Feel Checklist

Select checks for the feedback or movement mechanism being changed. Pair with the relevant sections of references/game-feel.md. These are technique defaults, not a requirement to add shake, hitstop, rumble or audio to every action; project timing and state ownership take precedence.

- The primary verb produces a visible response within 100ms of input.
- Every scoring, pickup, damage, and death event has at least one visual and one audio response.
- Screenshake is trauma-based with the `trauma²` curve, per-second decay, and a hard cap.
- Trauma magnitude scales with event weight (pickup subtle, explosion unmistakable).
- If the project permits hitstop, preserve its time and pause ownership. In Neva, a presentation hold must not stop or scale canonical simulation.
- Hitstop is reserved for heavy contact, not fired on every minor event.
- Keep input and rendering responsive during any permitted presentation hold; do not copy a demo’s gameplay-delta shortcut into another time owner.
- Squash-and-stretch preserves volume and settles with an overshoot (easeOutBack).
- FOV punch calls updateProjectionMatrix() and decays back to base.
- Impact flash stores the material's base emissive value and tweens back to it.
- Feedback never obscures the next player decision (shake/flash/hitstop stay readable).
- Gamepad rumble is feature-detected and matched in strength to the event.
- Repeated audio samples use pitch/volume variance so they never sound identical.
- Gameplay randomness uses the project’s deterministic RNG; presentation randomness follows the project’s own reproducibility rules, not a mandatory demo helper.
- Time-based effects are driven by accumulated game time, not wall clock.
- Each core event maps to a full feedback stack (see the tuning table), not a single cue.
