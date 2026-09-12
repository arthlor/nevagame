import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import { JournalModal } from "../../src/ui/JournalModal";
import type { PeoplePageDto } from "../../src/simulation/core/contracts";

const people: PeoplePageDto = {
  total: 2,
  recognizedCount: 1,
  people: [
    {
      id: "npc.silas",
      name: "Old Silas",
      title: "Harbor Salt & Master Angler",
      district: "Neva Harbor Pier",
      locationName: "Harbor Fish Table",
      portraitIcon: "anchor",
      line: "You read the water like a local.",
      standingLabel: "Trusted",
      standingTier: 2,
      questsCompleted: 3,
      recognized: true
    },
    {
      id: "npc.ines",
      name: "Ines",
      title: "Terrace Grower",
      district: "Sunreach Terraces",
      locationName: "Terrace Rows",
      portraitIcon: "sprout",
      line: "The terraces remember rain.",
      standingLabel: "New to the coast",
      standingTier: 0,
      questsCompleted: 0,
      recognized: false
    }
  ]
};

describe("People folio render", () => {
  it("renders each person with standing, location and recognition state", () => {
    const html = renderToString(React.createElement(JournalModal, {
      pages: { completedStories: [], fishRecords: [], cropRecords: [], knowledge: [], records: [] },
      activeQuest: null,
      skills: [],
      people,
      initialFolio: "people",
      onClose: () => {}
    }));

    expect(html).toContain("Old Silas");
    expect(html).toContain("Harbor Fish Table");
    expect(html).toContain("Trusted");
    expect(html).toContain("New to the coast");
    expect(html).toContain("data-recognized=\"true\"");
    expect(html).toContain("data-recognized=\"false\"");
    expect(html).toContain("journal-person-medallion");
    expect(html).toContain("journal-people-summary");
    expect(html).toContain("commission");
    expect(html).toContain("Terrace Rows");
  });

  it("shows an empty-state line when the directory has no entries", () => {
    const html = renderToString(React.createElement(JournalModal, {
      pages: { completedStories: [], fishRecords: [], cropRecords: [], knowledge: [], records: [] },
      activeQuest: null,
      skills: [],
      people: { total: 0, recognizedCount: 0, people: [] },
      initialFolio: "people",
      onClose: () => {}
    }));
    expect(html).toContain("No one has crossed your path yet.");
  });

  it("hides the People tab when no page is supplied", () => {
    const html = renderToString(React.createElement(JournalModal, {
      pages: { completedStories: [], fishRecords: [], cropRecords: [], knowledge: [], records: [] },
      activeQuest: null,
      skills: [],
      initialFolio: "story",
      onClose: () => {}
    }));
    expect(html).not.toContain("journal-people-page");
  });
});
