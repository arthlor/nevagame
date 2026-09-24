import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { questTrackProgress } from "../../src/simulation/core/QuestTypes";
import { DialogueRewardsPanel } from "../../src/ui/DialogueModal";
import { buildDialoguePages, pageShowsRewards, segmentHeading } from "../../src/ui/dialogueConversation";
import { JournalModal } from "../../src/ui/JournalModal";
import { QuestTrackerHUD } from "../../src/ui/QuestTrackerHUD";

function simAt(questId: string): Simulation {
  const sim = new Simulation();
  const progress = questTrackProgress(sim.state.quests, "track.main");
  progress.activeQuestId = questId;
  progress.activeStepIndex = 0;
  progress.stepProgress = {};
  return sim;
}

describe("story flow presentation", () => {
  it("shows what an acquisition step still waits on, from the simulation's own numbers", () => {
    const sim = simAt("quest.act7_open_channel");
    sim.state.player.proficiencies.fishing = 5100;
    const html = renderToString(
      React.createElement(QuestTrackerHUD, { activeQuest: sim.questDomain.getActiveQuestDto() })
    );
    expect(html).toContain('data-testid="quest-requirements"');
    expect(html).toContain("Fishing XP");
    expect(html).toContain(`${(5100).toLocaleString()} / ${(7500).toLocaleString()}`);
    expect(html).toContain("Gold");
  });

  it("heads each conversation beat and shows rewards throughout a completion", () => {
    const pages = buildDialoguePages({
      success: true,
      segments: [
        {
          kind: "completion",
          questId: "quest.act4_restore_rowboat",
          questTitle: "Commissioning the Old Rowboat",
          lines: ["She's cleared for sea!", "Step down to the slip."],
          rewards: { items: [{ itemId: "item.basic_lure", quantity: 2 }] },
          paid: { money: 30 }
        },
        {
          kind: "intro",
          questId: "quest.act5_maiden_voyage",
          questTitle: "The Call of the Deep",
          startsQuest: true,
          lines: ["This is what it's all about."]
        }
      ]
    }, []);
    expect(pages.map((page) => segmentHeading(page.segment))).toEqual([
      "Errand complete · Commissioning the Old Rowboat",
      "Errand complete · Commissioning the Old Rowboat",
      "New errand · The Call of the Deep"
    ]);
    expect(pages.map(pageShowsRewards)).toEqual([true, true, false]);
    expect(pages.map((page) => page.opensSegment)).toEqual([true, false, true]);

    const plate = renderToString(
      React.createElement(DialogueRewardsPanel, { rewards: pages[1].segment.rewards, paid: pages[1].segment.paid })
    );
    expect(plate).toContain("Woven Lure");
    expect(plate).toContain("Handed over");
    expect(plate).toContain("30 G");
  });

  it("turns a refused talk into one plain page that says why", () => {
    const pages = buildDialoguePages({ success: false, reason: "Move closer to Old Silas to talk" }, []);
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toBe("Move closer to Old Silas to talk");
    expect(segmentHeading(pages[0].segment)).toBeNull();
  });

  it("keeps the ask readable in the journal, in the herald's words until the speaker is reached", () => {
    const sim = simAt("quest.act7_open_channel");
    const html = renderToString(
      React.createElement(JournalModal, {
        pages: sim.inspectJournalPages(),
        activeQuest: sim.questDomain.getActiveQuestDto(),
        skills: [],
        onClose: () => {}
      })
    );
    expect(html).toContain('data-testid="journal-story-brief"');
    expect(html).toContain("What Old Silas said");
    expect(html).toContain("Coastal Fishing Skiff");
  });

  it("hides manual record following when endgame guidance owns the HUD tracker", () => {
    const pages = {
      completedStories: [],
      fishRecords: [],
      cropRecords: [],
      knowledge: [],
      records: [{
        id: "record.harvest.wheat",
        tier: "field" as const,
        title: "Wheat mastery",
        detail: "Harvest 100 wheat.",
        achieved: false,
        followable: true,
        progress: 0.25,
        currentLabel: "25 / 100"
      }]
    };
    const renderRecords = (canFollowRecords: boolean) => renderToString(
      React.createElement(JournalModal, {
        pages,
        activeQuest: null,
        skills: [],
        initialFolio: "records",
        followingRecordId: null,
        canFollowRecords,
        onFollowRecord: () => {},
        onClose: () => {}
      })
    );

    const duringStory = renderRecords(true);
    const afterStory = renderRecords(false);

    expect(duringStory).toContain("journal-record-follow");
    expect(afterStory).toContain("Wheat mastery");
    expect(afterStory).not.toContain("journal-record-follow");
  });
});
