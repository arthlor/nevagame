import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { GameClock } from "../../src/simulation/core/GameClock";
import { mainQuestTrack } from "../../src/simulation/core/QuestTypes";
import { npcAnchorAt, NPC_TALK_RADIUS } from "../../src/simulation/presentation/NpcPresentation";
import { assertNpcStationBeatRadius, npcStationBeatAt } from "../../src/render/scene/npcStationBeat";
import { WorldLayout } from "../../src/world/WorldLayout";

const hours = [0, 4, 8, 18, 22, 24];

describe("NPC schedules", () => {
  it("resolves exact clock boundaries and home fallback without saved NPC state", () => {
    const expected = ["Farmhouse Workbench", "Farmhouse Workbench", "Village Market", "Village Inn Porch", "Farmhouse Workbench", "Farmhouse Workbench"];
    for (const [index, hour] of hours.entries()) {
      const clock = new GameClock({ currentMinute: hour * 60 }).getState();
      expect(npcAnchorAt("npc.barnaby", clock).locationName).toBe(expected[index]);
    }
  });

  it("keeps every phase beat on supported ground inside authoritative talk range", () => {
    for (const hour of [4, 8, 18, 22]) {
      const clock = new GameClock({ currentMinute: hour * 60 }).getState();
      for (const npc of ContentRegistry.npcs.values()) {
        const anchor = npcAnchorAt(npc.id, clock);
        const beat = npcStationBeatAt(npc.id, clock)!;
        expect(() => assertNpcStationBeatRadius(beat), `${npc.id}/${clock.timeOfDay}`).not.toThrow();
        for (const point of beat.waypoints) {
          const label = `${npc.id}/${clock.timeOfDay}/${point.dx},${point.dz}`;
          const x = anchor.x + point.dx;
          const z = anchor.z + point.dz;
          expect(WorldLayout.isWalkable(x, z), label).toBe(true);
          expect(WorldLayout.isWater(x, z), label).toBe(false);
          expect(WorldLayout.traversalSurfaceSample(x, z).normal.y, label).toBeGreaterThanOrEqual(Math.cos(38 * Math.PI / 180));
          expect(Math.hypot(point.dx, point.dz), label).toBeLessThan(NPC_TALK_RADIUS);
        }
      }
    }
  });

  it("talking and nearby detection agree with the renderer station at every phase", () => {
    const sim = new Simulation();
    for (const hour of [4, 8, 18, 22]) {
      sim.clock.setDebugMinute(hour * 60);
      sim.state.clock = { ...sim.clock.getState() };
      for (const npc of ContentRegistry.npcs.values()) {
        const anchor = npcAnchorAt(npc.id, sim.state.clock);
        Object.assign(sim.state.player, { x: anchor.x, z: anchor.z });
        expect(sim.getNearbyNpcId(), `${npc.id}/${hour}`).toBe(npc.id);
        expect(sim.execute({ type: "quest.talk-npc", npcId: npc.id })).toMatchObject({ success: true });
      }
    }
    sim.questDomain.dispose();
  });

  it("retargets talk objectives and ready turn-ins, and rejects the previous station", () => {
    const sim = new Simulation();
    const track = mainQuestTrack(sim.state.quests);
    track.activeQuestId = "quest.act1_welcome";
    sim.clock.setDebugMinute(18 * 60);
    sim.state.clock = { ...sim.clock.getState() };
    const anchor = npcAnchorAt("npc.elspeth", sim.state.clock);
    expect(sim.questDomain.getActiveQuestDto()?.targetLocation).toEqual({ x: anchor.x, z: anchor.z, name: anchor.locationName });
    const oldAnchor = ContentRegistry.npcs.get("npc.elspeth")!.anchor;
    Object.assign(sim.state.player, { x: oldAnchor.x, z: oldAnchor.z });
    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" })).toMatchObject({ success: false });
    Object.assign(sim.state.player, { x: anchor.x, z: anchor.z });
    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" })).toMatchObject({ success: true });
    expect(sim.questDomain.getActiveQuestDto()).toMatchObject({ isQuestReadyToTurnIn: true, targetDistanceMeters: 0, targetLocation: { x: anchor.x, z: anchor.z } });
    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" })).toMatchObject({ success: true, questCompleted: true });
    sim.questDomain.dispose();
  });

  it("holds a quest speaker at their role anchor for a turn-in earned elsewhere", () => {
    const sim = new Simulation();
    // At 08:00 Barnaby keeps his market beat while there is nothing to hand in.
    sim.clock.setDebugMinute(8 * 60);
    sim.state.clock = { ...sim.clock.getState() };
    expect(npcAnchorAt("npc.barnaby", sim.state.clock, sim.state.quests).locationName).toBe("Village Market");

    // Finishing Act 2's world-work moves him back to the workbench he names.
    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act2_harvest_and_compost";
    mainQuestTrack(sim.state.quests).activeStepIndex = 1;
    mainQuestTrack(sim.state.quests).stepProgress = { "step.act2_compost_worms": 1 };
    const anchor = npcAnchorAt("npc.barnaby", sim.state.clock, sim.state.quests);
    expect(anchor.locationName).toBe("Farmhouse Workbench");

    // The market beat is rejected; the role anchor settles the quest.
    const market = ContentRegistry.npcs.get("npc.barnaby")!.schedule!.find((slot) => slot.phase === "day")!.position;
    Object.assign(sim.state.player, { x: market.x, z: market.z });
    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.barnaby" })).toMatchObject({ success: false });
    Object.assign(sim.state.player, { x: anchor.x, z: anchor.z });
    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.barnaby" })).toMatchObject({ success: true, questCompleted: true });
    sim.questDomain.dispose();
  });
});
