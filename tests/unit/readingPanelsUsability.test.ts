import { afterEach, describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { localeStore } from "../../src/i18n/localeStore";
import { CoastalChronicle } from "../../src/ui/components/CoastalChronicle";
import { AlmanacPage } from "../../src/ui/components/AlmanacPage";
import { HowToPlayGuide } from "../../src/ui/components/HowToPlayGuide";
import { WorldMapModal } from "../../src/ui/components/WorldMapModal";

afterEach(() => localeStore.set("en"));

describe("reading panel usability", () => {
  it("connects Chronicle filters to their selected reading panel, including an empty category", () => {
    const html = renderToString(React.createElement(CoastalChronicle, {
      entries: [],
      activeFilter: "story",
      onSelectFilter: () => {}
    }));
    expect(html).toContain('id="chronicle-tab-story" role="tab" aria-selected="true" aria-controls="chronicle-feed"');
    expect(html).toContain('id="chronicle-feed" role="tabpanel" aria-labelledby="chronicle-tab-story"');
    expect(html).toContain("No entries in this category.");
    expect(html).toContain('data-testid="chronicle-filter-trade"');
  });

  it("keeps fish-finding guidance visible while preserving reference facts in a disclosure", () => {
    const sim = new Simulation();
    const html = renderToString(React.createElement(AlmanacPage, { almanac: sim.inspectAlmanac() }));
    const firstEntry = html.match(/<li[^>]*data-testid="almanac-fish-entry"[\s\S]*?<\/li>/)?.[0];
    expect(firstEntry).toBeDefined();
    const [findingGuidance, details] = firstEntry!.split('<details class="almanac-entry-details">');
    expect(findingGuidance).toContain("Waters");
    expect(findingGuidance).toContain("Now");
    expect(findingGuidance).toContain("Runs");
    expect(findingGuidance).toContain("Rod");
    expect(details).toContain("Season");
    expect(details).toContain("Weight");
    expect(details).toContain("Value");
    expect(details).toContain('aria-label="Details for ');
  });

  it("explains the actual Plant entry and separates basic-catch guidance from sport controls", () => {
    const field = renderToString(React.createElement(HowToPlayGuide, { initialPage: "field" }));
    const waters = renderToString(React.createElement(HowToPlayGuide, { initialPage: "waters" }));
    expect(field).toContain("Choose Plant at a farm, then select a seed.");
    expect(field).not.toContain("tool belt");
    expect(waters).toContain("Hold to raise the catch bar; release to lower it.");
    expect(waters).toContain("For sport fish, follow the highlighted response");
    expect(waters).toContain("Before sport fishing, chum the school and arm a lure with R");
  });

  it("keeps the chart action specific for assistive technology while folding the repeated place list", () => {
    const sim = new Simulation();
    const html = renderToString(React.createElement(WorldMapModal, {
      map: sim.inspectWorldMap(),
      onInspectMarketDemand: (marketId) => sim.inspectMarketDemand(marketId),
      onClose: () => {}
    }));
    expect(html).not.toContain("Plot course");
    expect(html).not.toContain('data-testid="map-lenses"');
    expect(html).toContain('<details class="map-sidebar-directory"><summary class="map-directory-header">');
    expect(html).toContain('aria-label="Chart destination"');
    expect(html).not.toContain('class="map-subtitle"');
  });
});
