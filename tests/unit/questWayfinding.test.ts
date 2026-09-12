import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { buildCompassMarkers } from "../../src/simulation/presentation/WorldHudPresentation";
import { projectWorldToScreen } from "../../src/ui/hud/worldScreenProjection";
import { fitQuestPointerToHud } from "../../src/ui/hud/QuestPointerOverlay";
import { questBeaconRangeMix } from "../../src/render/scene/WorldScene";
import type { ActiveQuestDto } from "../../src/simulation/core/QuestTypes";

const quest = (overrides: Partial<ActiveQuestDto> = {}): ActiveQuestDto => ({
  questId: "quest.act1_welcome",
  trackId: "track.main",
  trackTitle: "The Neva Spine",
  actId: "act1_homestead_awakening",
  actTitle: "Homestead Awakening",
  questTitle: "The Inherited Soil",
  speakerId: "npc.elspeth",
  speakerName: "Elspeth",
  currentStepIndex: 1,
  totalSteps: 1,
  objectiveDescription: "Talk to Elspeth",
  currentProgress: 0,
  targetQuantity: 1,
  isStepComplete: false,
  isQuestReadyToTurnIn: false,
  targetLocation: { x: -63.5, z: -62, name: "Starter Garden Gate" },
  ...overrides
} as ActiveQuestDto);

describe("quest compass markers", () => {
  it("emits no quest marker when no quest carries a location", () => {
    const state = createInitialGameState();
    const markers = buildCompassMarkers(state, 0, [quest({ targetLocation: undefined })]);
    expect(markers.some((m) => m.kind === "quest")).toBe(false);
  });

  it("marks the focused track as `quest` and later tracks as `quest-secondary`", () => {
    const state = createInitialGameState();
    const markers = buildCompassMarkers(state, 0, [
      quest(),
      quest({ trackId: "track.tides", targetLocation: { x: 83, z: 61, name: "Harbor Pier" } })
    ]);
    expect(markers[0].kind).toBe("quest");
    expect(markers[0].icon).toBe("quest");
    expect(markers[1].kind).toBe("quest-secondary");
  });

  it("keeps a quest target past the 350 m chart-node cull", () => {
    const state = createInitialGameState();
    // Ines' terrace on the far island, well beyond the chart-node horizon.
    const far = quest({ targetLocation: { x: 459.2, z: 2.6, name: "Sunreach Cistern Terrace" } });
    const distance = Math.hypot(459.2 - state.player.x, 2.6 - state.player.z);
    expect(distance).toBeGreaterThan(350);

    const marker = buildCompassMarkers(state, 0, [far]).find((m) => m.kind === "quest");
    expect(marker).toBeDefined();
    expect(marker!.distanceMeters).toBe(Math.round(distance));
  });

  it("never truncates quest markers away, even with a full ribbon", () => {
    const state = createInitialGameState();
    const quests = [
      quest(),
      quest({ trackId: "track.tides", targetLocation: { x: 83, z: 61, name: "Harbor Pier" } }),
      quest({ trackId: "track.homestead", targetLocation: { x: 60, z: -60, name: "Private Homestead" } }),
      quest({ trackId: "track.tradelanes", targetLocation: { x: 64, z: 60, name: "Fish Market" } })
    ];
    const markers = buildCompassMarkers(state, 0, quests);
    expect(markers.filter((m) => m.kind === "quest" || m.kind === "quest-secondary")).toHaveLength(4);
  });

  it("suppresses the chart node a quest target is standing on", () => {
    const state = createInitialGameState();
    // chart.neva_village sits exactly on the village market anchor.
    const onVillage = quest({ targetLocation: { x: 53.2, z: -51.5, name: "Village Market" } });
    const markers = buildCompassMarkers(state, 0, [onVillage]);
    expect(markers.some((m) => m.id === "chart.neva_village")).toBe(false);
    expect(markers.some((m) => m.kind === "quest")).toBe(true);
  });
});

describe("world to screen projection", () => {
  const viewport = { width: 1600, height: 900 };
  const camera = () => {
    const c = new THREE.PerspectiveCamera(50, viewport.width / viewport.height, 0.1, 1000);
    c.position.set(0, 0, 0);
    c.lookAt(0, 0, -1); // looking down -z
    c.updateMatrixWorld(true);
    return c;
  };

  it("puts a point straight ahead in the middle of the screen", () => {
    const result = projectWorldToScreen({ x: 0, y: 0, z: -20 }, camera(), viewport);
    expect(result.onScreen).toBe(true);
    expect(result.x).toBeCloseTo(viewport.width / 2, 1);
    expect(result.y).toBeCloseTo(viewport.height / 2, 1);
  });

  it("reports a point behind the camera as off-screen pointing back, not forward", () => {
    // Behind and to the LEFT. The naive perspective divide mirrors this into
    // the lower right, which would send the player the wrong way.
    const result = projectWorldToScreen({ x: -10, y: 0, z: 20 }, camera(), viewport);
    expect(result.onScreen).toBe(false);
    // Pointing somewhere in the left half-plane: bearing between -180 and 0.
    expect(result.angleDeg).toBeLessThan(0);
    expect(result.angleDeg).toBeGreaterThan(-180);
  });

  it("clamps an off-screen target onto the margin rect", () => {
    const result = projectWorldToScreen({ x: 400, y: 0, z: -20 }, camera(), viewport, 56);
    expect(result.onScreen).toBe(false);
    expect(result.x).toBeLessThanOrEqual(viewport.width - 56 + 0.001);
    expect(result.y).toBeGreaterThanOrEqual(56 - 0.001);
    expect(result.y).toBeLessThanOrEqual(viewport.height - 56 + 0.001);
  });

  it("points straight down for a target directly behind the lens", () => {
    const result = projectWorldToScreen({ x: 0, y: 0, z: 20 }, camera(), viewport);
    expect(result.onScreen).toBe(false);
    expect(Math.abs(result.angleDeg)).toBeCloseTo(180, 0);
  });
});

describe("quest pointer HUD fit", () => {
  it("keeps the full 120 px pointer plate inside the side gutters", () => {
    expect(fitQuestPointerToHud({ x: 10, y: 180, onScreen: false }, { width: 844, height: 390 }).x).toBe(68);
    expect(fitQuestPointerToHud({ x: 840, y: 180, onScreen: false }, { width: 844, height: 390 }).x).toBe(776);
  });

  it("reserves the lower touch HUD lane in short landscape", () => {
    expect(fitQuestPointerToHud({ x: 700, y: 370, onScreen: false }, { width: 844, height: 390 }).y).toBe(195);
  });

  it("allows more world space below the pointer on desktop", () => {
    expect(fitQuestPointerToHud({ x: 900, y: 880, onScreen: true }, { width: 1600, height: 900 }).y).toBe(796);
  });
});

describe("quest beacon range hand-off", () => {
  it("runs the shaft at full strength from across a region", () => {
    expect(questBeaconRangeMix(120).shaftStrength).toBe(1);
    expect(questBeaconRangeMix(42).shaftStrength).toBe(1);
  });

  it("retires the shaft entirely once the player has arrived", () => {
    // A 14 m pillar standing on the NPC you walked here to talk to hides them.
    expect(questBeaconRangeMix(18).shaftStrength).toBe(0);
    expect(questBeaconRangeMix(4).shaftStrength).toBe(0);
  });

  it("cross-fades rather than cutting between the two ranges", () => {
    const mid = questBeaconRangeMix(30);
    expect(mid.shaftStrength).toBeGreaterThan(0);
    expect(mid.shaftStrength).toBeLessThan(1);
  });

  it("hands the ring its full weight exactly as the shaft lets go", () => {
    expect(questBeaconRangeMix(18).ringStrength).toBeCloseTo(1, 5);
    // Never fully dark at range, so the exact spot stays readable.
    expect(questBeaconRangeMix(200).ringStrength).toBeCloseTo(0.35, 5);
  });

  it("moves the two strengths in opposite directions", () => {
    const near = questBeaconRangeMix(20);
    const far = questBeaconRangeMix(60);
    expect(far.shaftStrength).toBeGreaterThan(near.shaftStrength);
    expect(far.ringStrength).toBeLessThan(near.ringStrength);
  });
});
