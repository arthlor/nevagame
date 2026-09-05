import { describe, expect, it } from "vitest";
import { characterPreviewContext, clipLoops, displayedClipTime } from "../../src/art-yard/characterPreview";

const spec = {
  animationClips: [{ name: "run", durationSeconds: 0.8, loop: true, referenceSpeedMetersPerSecond: 4.2 },
    { name: "hookset", durationSeconds: 0.5, loop: false }],
  additionalAnimationClips: [{ name: "idle_variant", durationSeconds: 2, loop: true }]
};

describe("Art Yard character playback contract", () => {
  it("uses catalog loop behavior for required and retained source clips", () => {
    expect(clipLoops(spec, "run")).toBe(true);
    expect(clipLoops(spec, "idle_variant")).toBe(true);
    expect(clipLoops(spec, "hookset")).toBe(false);
    expect(displayedClipTime(1.4, 0.5, false)).toBe(0.5);
    expect(displayedClipTime(0.5, 0.5, true)).toBe(0.5);
    expect(displayedClipTime(1.4, 0.5, true)).toBeCloseTo(0.4);
  });

  it("feeds catalog speed and actual boat posture into the production controller", () => {
    expect(characterPreviewContext("run", spec, null).motion.speedMetersPerSecond).toBe(4.2);
    const fishing = characterPreviewContext("hookset", spec, "boat_rowboat_a");
    expect(fishing.mode).toBe("sport-fishing");
    expect(fishing.boatInput?.boatTypeId).toBe("boat.rowboat");
    expect(fishing.motion.speedMetersPerSecond).toBe(0);
  });
});
