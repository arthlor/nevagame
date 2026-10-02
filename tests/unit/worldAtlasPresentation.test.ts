import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldMapModal } from "../../src/ui/components/WorldMapModal";
import { worldPointToAtlas } from "../../src/world/WorldAtlasProjection";
import type { WorldMapDto, CompassMarkerDto } from "../../src/simulation/core/contracts";
import { localeStore } from "../../src/i18n/localeStore";
import { readFileSync } from "node:fs";

const map: WorldMapDto = { player: { x: 100, z: -50 }, activeSchools: [], fishingNotes: {}, farms: {} };
const quest: CompassMarkerDto = { id: "quest.test", type: "quest", kind: "quest", x: 1200, z: 100,
  label: "Sunreach Cove", icon: "pin", distanceMeters: 1110, relativeBearingDeg: 0 };
const market = vi.fn(() => ({ success: false, marketId: "market.harbor", reason: "test" }));
const render = () => renderToString(React.createElement(WorldMapModal, {
  map, headingDegrees: 123, questMarkers: [quest], customWaypoint: { x: 500, z: 200 },
  onInspectMarketDemand: market, onClose: () => {}
}));
afterEach(() => { localeStore.set("en"); vi.clearAllMocks(); });

describe("atlas modal semantic rendering", () => {
  it("leaves only live overlays and one lazily decoded texture, with no baked label forest", () => {
    const html = render();
    expect(html).toContain('data-testid="world-atlas-terrain"');
    expect(html).toContain('data-texture="/assets/world-map/world-map-2048.webp');
    expect(html).toContain("Loading chart…");
    expect(html).not.toContain('class="guild-chart-terrain"');
    expect(html).not.toContain("7200.webp");
    expect(html).not.toContain("chart-rhumb-lines");
    expect(html).toContain('role="dialog"'); expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Chart destination"');
    expect(html).toContain('data-testid="map-custom-waypoint"');
    expect(html).toContain('data-testid="map-quest-mark"');
    expect(html).toContain('data-testid="map-player-heading" transform="rotate(123)"');
    const player = worldPointToAtlas(map.player);
    const target = worldPointToAtlas(quest);
    expect(html).toContain(`translate(${player.x}, ${player.y})`);
    expect(html).toContain(`translate(${target.x}, ${target.y})`);
    expect(market).not.toHaveBeenCalled();
  });
  it("keeps place names and controls localized above the same unlabelled image", () => {
    localeStore.set("tr"); const html = render();
    expect(html).toContain("Harita yükleniyor…");
    expect(html).toContain('aria-label="Haritayı kapat"');
    expect(html).toContain('aria-label="Harita hedefi"');
    expect(html).toContain("Gündoğumu");
    expect(html).toContain("world-map-2048.webp");
  });
  it("retains conditional modal mount and excludes raster imports from the normal minimap", () => {
    // Static ownership guard, not a substitute for browser open/close profiling.
    const layer = readFileSync("src/ui/GameUiModalLayer.tsx", "utf8");
    const minimap = readFileSync("src/ui/hud/WorldMinimap.tsx", "utf8");
    expect(layer).toContain('activeModal === "map" && (');
    expect(layer).toContain('React.lazy(async () => ({ default: (await import("./components/WorldMapModal"))');
    expect(minimap).not.toMatch(/WorldAtlas|world-map-2048/);
    const modal = readFileSync("src/ui/components/WorldMapModal.tsx", "utf8");
    expect(modal).toContain('svg.removeEventListener("wheel", wheel)');
    expect(modal).not.toContain("requestAnimationFrame");
  });
});
