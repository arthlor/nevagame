import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorldChartTerrain } from "../../src/ui/components/WorldChartTerrain";
import { WorldLayout } from "../../src/world/WorldLayout";
import { worldRouteToMapSvgPath } from "../../src/world/WorldMapProjection";

function expectRoads(markup: string) {
  for (const route of WorldLayout.compiledRouteNetwork()) {
    const path = worldRouteToMapSvgPath(route.samples.map(({ point }) => point));
    expect(markup, route.route.id).toContain(`d="${path}"`);
  }
}

describe("shared chart and minimap road paths", () => {
  it("draws each regional and farmstead road from the same compiled curve as the world", () => {
    const markup = renderToStaticMarkup(React.createElement(WorldChartTerrain));
    const minimal = renderToStaticMarkup(React.createElement(WorldChartTerrain, { minimal: true }));
    expectRoads(markup);
    expectRoads(minimal);
    for (const sheet of [markup, minimal]) {
      expect(sheet).not.toContain("filter=");
      expect(sheet).not.toContain("feTurbulence");
    }
    expect(minimal.length).toBeLessThan(markup.length);
    const curved = WorldLayout.compiledRouteNetwork().find(({ route }) => route.id === "village-harbor")!;
    expect(worldRouteToMapSvgPath(curved.samples.map(({ point }) => point)))
      .not.toBe(worldRouteToMapSvgPath(curved.route.points));
  });
});
