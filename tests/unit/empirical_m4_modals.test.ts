import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { LogisticsLedgerModal } from "../../src/ui/components/LogisticsLedgerModal";
import { DialogueModal } from "../../src/ui/DialogueModal";
import { EscapeMenuModal } from "../../src/ui/EscapeMenuModal";
import { StartScreen } from "../../src/ui/StartScreen";
import { ExpeditionBoard } from "../../src/ui/ExpeditionBoard";
import { createStartupState } from "../../src/app/StartupState";
import { playUiSound } from "../../src/ui/audio/uiAudio";
import { gameAudio } from "../../src/audio/AudioManager";

describe("Milestone M4 ornate modal presentation", () => {
  it("renders the captain's ledger with money tabs and estimated holdings", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(LogisticsLedgerModal, {
        state: sim.state,
        onClose: () => {}
      })
    );

    expect(html).toMatch(/Captain(?:'|&#x27;)s ledger/);
    expect(html).toContain("ledger-modal");
    expect(html).toContain('data-testid="ledger-tabs"');
    expect(html).toContain("Gold on hand");
    expect(html).toContain("Estimated holdings");
    expect(html).toContain("Money");
    expect(html).toContain("Cargo &amp; boats");
  });

  it("renders numbered velvet hold wells on the cargo ledger tab", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(LogisticsLedgerModal, {
        state: sim.state,
        onClose: () => {},
        initialTab: "cargo"
      })
    );

    expect(html).toContain("Wooden Rowboat hold");
    expect(html).toContain("Hold occupancy");
    expect(html).toContain('data-testid="ledger-hold-grid"');
    expect(html).toContain("chrome-slot");
    expect(html).toContain("Empty hold slot");
  });

  it("renders dialogue with a portrait plaque, speaker, and continue control", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(DialogueModal, {
        npcId: "npc.elspeth",
        state: sim.state,
        activeQuest: sim.questDomain.getActiveQuestDto(),
        onClose: () => {},
        onTalkNpc: () => ({
          success: true,
          dialogue: ["The soil here is rich and eager for seed."]
        })
      })
    );

    expect(html).toContain("Elspeth");
    expect(html).toContain("Village Baker");
    expect(html).toContain("dialogue-card");
    expect(html).toContain("dialogue-avatar");
    expect(html).toContain("Continue");
    expect(html).toContain("Skip talk");
    expect(html).toContain('data-testid="dialogue-skip-talk"');
    expect(html).toContain('data-testid="dialogue-text"');
  });

  it("renders the pause plaque with labor meter and medieval keycaps", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(EscapeMenuModal, {
        state: sim.state,
        onClose: () => {},
        onResetPlayerToSafePlace: () => {},
        onQuickSave: () => {},
        onOpenInventory: () => {},
        onOpenJournal: () => {},
        onOpenGuide: () => {},
        onOpenMap: () => {},
        onOpenLedger: () => {},
        onOpenExpedition: () => {}
      })
    );

    expect(html).toContain("pause-modal");
    expect(html).toContain("Pause");
    expect(html).toContain("Resume");
    expect(html).toContain("Labor");
    expect(html).toContain("chrome-meter");
    expect(html).toContain("chrome-keycap");
    expect(html).toContain("Sound");
    expect(html).toContain("Ledger");
  });

  it("renders the title screen harbor lockup and continue control", () => {
    const html = renderToString(
      React.createElement(StartScreen, {
        startup: {
          ...createStartupState(12),
          status: "title",
          saveStatus: "empty"
        },
        onStart: () => {},
        onStartNewGame: () => {},
        onStartWithoutSaving: () => {},
        onRetry: () => {}
      })
    );

    expect(html).toContain("start-screen");
    expect(html).toContain("Grow a home. Follow the tide.");
    expect(html).toContain('data-testid="startup-start-button"');
    expect(html).toContain("Enter Neva");
    expect(html).toContain('data-testid="startup-options-button"');
  });

  it("renders expedition readiness with hull meter and supply checklist", () => {
    const sim = new Simulation();
    const html = renderToString(
      React.createElement(ExpeditionBoard, {
        state: sim.state,
        onClose: () => {}
      })
    );

    expect(html).toContain("Prepare to depart");
    expect(html).toContain("expedition-modal");
    expect(html).toContain("Wooden Rowboat");
    expect(html).toContain("hull");
    expect(html).toContain('data-testid="expedition-checklist"');
    expect(html).toContain("Chum buckets");
    expect(html).toContain("Worm bait");
    expect(html).toContain("Crushed ice");
  });

  it("keeps UI audio presentation-only for M4 cues", () => {
    const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
    playUiSound("page-turn");
    playUiSound("chime");
    playUiSound("confirm");
    expect(playOneShotSpy).toHaveBeenCalledWith("page-turn");
    expect(playOneShotSpy).toHaveBeenCalledWith("quest-chime");
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-confirm");
    playOneShotSpy.mockRestore();
  });
});
