import React, { useRef, useState } from "react";
import type { MarketId } from "../../simulation/core/types";
import type { CompassMarkerDto, MarketDemandSignal, WorldMapDto } from "../../simulation/core/contracts";
import {
  WorldLayout,
  type WorldPoint
} from "../../world/WorldLayout";
import { WORLD_CHART_NODES, type WorldChartNode } from "../../world/WorldGameplayLocations";
import { worldPointToMapSvg, worldPointToMapSvgUnclamped, mapSvgToWorldPoint } from "../../world/WorldMapProjection";
import { IconCoin, IconCompass, IconFish, IconSprout } from "./HudIcons";
import { useModalAccessibility } from "../useModalAccessibility";
import { handleTabListKeyDown } from "../useTabListKeyboard";
import { ChromeClose } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForMapNode } from "../chrome/uiAtlas";
import { WorldChartTerrain } from "./WorldChartTerrain";
import { playUiSound } from "../audio/uiAudio";

export interface WorldMapModalProps {
  map: WorldMapDto;
  /**
   * Story targets, already resolved by `QuestDomain` and carried on the HUD
   * compass. The chart draws the same marks the compass ribbon and the minimap
   * do, so all three agree about where the errand is.
   */
  questMarkers?: ReadonlyArray<CompassMarkerDto>;
  customWaypoint?: { x: number; z: number } | null;
  onSetCustomWaypoint?: (waypoint: { x: number; z: number } | null) => void;
  onInspectMarketDemand: (marketId: MarketId) => MarketDemandSignal;
  onClose: () => void;
}

type MapLens = "geography" | "markets" | "fishing" | "farmland";

function chartAreaViewBox(area: "sea" | "neva" | "sunreach") {
  if (area === "sea") return { x: 0, y: 0, width: 1000, height: 700 };
  const bounds = WorldLayout.islands().find((island) => island.id === `island.${area}`)!.authoredBounds;
  const min = worldPointToMapSvgUnclamped({ x: bounds.minX, z: bounds.minZ });
  const max = worldPointToMapSvgUnclamped({ x: bounds.maxX, z: bounds.maxZ });
  const width = Math.max(250, max.x - min.x + 64, (max.y - min.y + 64) * 10 / 7);
  const height = width * 0.7;
  return { x: (min.x + max.x - width) * 0.5, y: (min.y + max.y - height) * 0.5, width, height };
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function nodeSupportsLens(node: MapNode, lens: MapLens): boolean {
  if (lens === "markets") return Boolean(node.marketId);
  if (lens === "fishing") return Boolean(node.fishingHabitat);
  if (lens === "farmland") return Boolean(node.farmId);
  return true;
}

function nodeIsInArea(node: MapNode, area: "sea" | "neva" | "sunreach"): boolean {
  if (area === "neva") return node.islandId === "island.neva";
  if (area === "sunreach") return node.islandId === "island.sunreach";
  return true;
}

function nodesForView(area: "sea" | "neva" | "sunreach", lens: MapLens): MapNode[] {
  return MAP_NODES.filter((node) => nodeIsInArea(node, area) && nodeSupportsLens(node, lens));
}

function destinationForView(area: "sea" | "neva" | "sunreach", lens: MapLens, current: MapNode): MapNode {
  const candidates = nodesForView(area, lens);
  if (candidates.some((node) => node.id === current.id)) return current;
  if (lens === "geography") {
    const areaAnchor = area === "sunreach" ? "chart.sunreach_cove" : "chart.neva_harbor";
    return candidates.find((node) => node.id === areaAnchor) ?? candidates[0] ?? current;
  }
  return candidates.reduce<MapNode | null>((nearest, node) => {
    if (!nearest) return node;
    const distance = Math.hypot(node.worldPosition.x - current.worldPosition.x, node.worldPosition.z - current.worldPosition.z);
    const nearestDistance = Math.hypot(nearest.worldPosition.x - current.worldPosition.x, nearest.worldPosition.z - current.worldPosition.z);
    return distance < nearestDistance ? node : nearest;
  }, null) ?? current;
}

const MAP_LENS_ICONS: Record<MapLens, React.ReactNode> = {
  geography: <IconCompass size={18} aria-hidden="true" />,
  markets: <IconCoin size={18} aria-hidden="true" />,
  fishing: <IconFish size={18} aria-hidden="true" />,
  farmland: <IconSprout size={18} aria-hidden="true" />
};

const MAP_LENS_LABELS: Record<MapLens, string> = {
  geography: "Chart",
  markets: "Markets",
  fishing: "Fishing notes",
  farmland: "Farms"
};

interface MapNode {
  id: string;
  name: string;
  islandId: WorldChartNode["islandId"];
  category: "farm" | "village" | "harbor" | "lighthouse" | "fishing";
  worldPosition: WorldPoint;
  marketId?: MarketId;
  farmId?: string;
  fishingHabitat?: "river" | "lake" | "coast" | "offshore";
  fishingEcologyId?: "ecology.neva" | "ecology.sunreach";
}

const MAP_NODES: MapNode[] = WORLD_CHART_NODES.map((node) => ({
  id: node.id,
  name: node.label,
  islandId: node.islandId,
  category: node.kind === "farm"
    ? "farm"
    : node.kind === "dock"
      ? "harbor"
      : node.kind === "water"
        ? "fishing"
        : node.kind === "market"
          ? "village"
          : node.label.includes("Lighthouse")
            ? "lighthouse"
            : "village",
  worldPosition: node.position,
  marketId: node.marketId,
  farmId: node.farmId,
  fishingHabitat: node.fishingHabitat,
  fishingEcologyId: node.fishingEcologyId
}));

const MAP_LABEL_OFFSETS: Record<string, { x: number; y: number; textAnchor: "start" | "middle" | "end" }> = {
  "chart.knowledge.discovery.overlook": { x: -10, y: -30, textAnchor: "end" },
  "chart.neva_farm": { x: 0, y: -47, textAnchor: "middle" },
  "chart.neva_homestead": { x: 22, y: -14, textAnchor: "start" },
  "chart.neva_village": { x: 22, y: 27, textAnchor: "start" },
  "chart.neva_mill": { x: 0, y: -20, textAnchor: "middle" },
  "chart.neva_crossing": { x: 18, y: 23, textAnchor: "start" },
  "chart.neva_river": { x: -17, y: 27, textAnchor: "end" },
  "chart.neva_harbor": { x: 16, y: 24, textAnchor: "start" },
  "chart.neva_lighthouse": { x: -10, y: 25, textAnchor: "end" },
  "chart.neva_offshore": { x: 0, y: -18, textAnchor: "middle" },
  "chart.sunreach_cove": { x: 18, y: 16, textAnchor: "start" },
  "chart.sunreach_open_channel": { x: -18, y: 16, textAnchor: "end" },
  "chart.sunreach_terraces": { x: 0, y: 24, textAnchor: "middle" },
  "chart.sunreach_ridge": { x: 18, y: 16, textAnchor: "start" },
  "chart.sunreach_shelf": { x: 0, y: 24, textAnchor: "middle" }
};

const MAP_QUEST_LABEL_OFFSETS: Record<string, { x: number; y: number; textAnchor: "start" | "middle" | "end" }> = {
  "Starter Garden Gate": { x: -115, y: 34, textAnchor: "start" }
};

function mapLabelPosition(nodeId: string, x: number, y: number, offsetScale = 1): { x: number; y: number; textAnchor: "start" | "middle" | "end" } {
  const offset = MAP_LABEL_OFFSETS[nodeId] ?? { x: 0, y: 26, textAnchor: "middle" as const };
  return {
    x: Math.max(18, Math.min(982, x + offset.x * offsetScale)),
    y: Math.max(18, Math.min(682, y + offset.y * offsetScale)),
    textAnchor: offset.textAnchor
  };
}

function questMarkerLabelPosition(label: string): { x: number; y: number; textAnchor: "start" | "middle" | "end" } {
  const offset = MAP_QUEST_LABEL_OFFSETS[label] ?? { x: 0, y: -19, textAnchor: "middle" as const };
  return {
    x: offset.x,
    y: offset.y,
    textAnchor: offset.textAnchor
  };
}

function fishingInsight(map: WorldMapDto, node: MapNode): {
  waterType: string;
  species: string[];
  record: string | null;
} | null {
  if (!node.fishingHabitat) return null;
  return map.fishingNotes[`${node.fishingEcologyId ?? "ecology.neva"}:${node.fishingHabitat}`];
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  map, questMarkers = [], customWaypoint, onSetCustomWaypoint, onInspectMarketDemand, onClose
}) => {
  const [chartArea, setChartArea] = useState<"sea" | "neva" | "sunreach">("sea");
  const [activeLens, setActiveLens] = useState<MapLens>("geography");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("chart.neva_harbor");
  const [internalWaypoint, setInternalWaypoint] = useState<{ x: number; z: number } | null>(customWaypoint ?? null);

  const activeWaypoint = customWaypoint !== undefined ? customWaypoint : internalWaypoint;
  const setWaypoint = (wp: { x: number; z: number } | null) => {
    setInternalWaypoint(wp);
    onSetCustomWaypoint?.(wp);
  };

  const [viewBox, setViewBox] = useState(() => chartAreaViewBox(chartArea));

  const modalRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useModalAccessibility(modalRef, onClose);

  const dragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    startViewBox: { x: number; y: number; width: number; height: number };
    totalDist: number;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    startViewBox: { x: 0, y: 0, width: 1000, height: 700 },
    totalDist: 0
  });

  const playerX = map.player.x;
  const playerZ = map.player.z;
  const playerMapPosition = worldPointToMapSvg({ x: playerX, z: playerZ });

  const selectedNode = MAP_NODES.find((n) => n.id === selectedNodeId) ?? MAP_NODES[0];
  const waypointDestination = activeWaypoint
    ? MAP_NODES.find((node) => node.worldPosition.x === activeWaypoint.x && node.worldPosition.z === activeWaypoint.z)
    : null;
  const selectedMarketInsight = selectedNode.marketId
    ? onInspectMarketDemand(selectedNode.marketId)
    : null;
  const selectedFishingInsight = fishingInsight(map, selectedNode);
  const selectedFarm = selectedNode.farmId ? map.farms[selectedNode.farmId] : undefined;
  const selectedDistance = Math.hypot(selectedNode.worldPosition.x - playerX, selectedNode.worldPosition.z - playerZ);
  const selectedTerrain = WorldLayout.isSailable(selectedNode.worldPosition.x, selectedNode.worldPosition.z)
    ? "Navigable water"
    : WorldLayout.isWalkable(selectedNode.worldPosition.x, selectedNode.worldPosition.z)
      ? "Road or trail"
      : "Rough ground";

  const areaIncludes = (node: MapNode) => chartArea === "neva" ? node.islandId === "island.neva"
    : chartArea === "sunreach" ? node.islandId === "island.sunreach"
    : node.islandId !== "island.neva" || node.id === "chart.neva_harbor" || node.id === "chart.neva_lighthouse";

  const zoomRatio = 1000 / viewBox.width;
  const isZoomed = zoomRatio > 1.6;
  const isMacro = zoomRatio < 1.35;
  const markerScale = Math.min(1, Math.max(0.38, 1 / (zoomRatio * 0.75)));
  const questScale = markerScale;
  const playerScale = markerScale;
  const chartView = `${viewBox.x.toFixed(1)} ${viewBox.y.toFixed(1)} ${viewBox.width.toFixed(1)} ${viewBox.height.toFixed(1)}`;

  const isMajorSeaHub = (nodeId: string) => [
    "chart.neva_harbor",
    "chart.sunreach_cove",
    "chart.knowledge.discovery.cay",
    "chart.knowledge.discovery.shoal",
    "chart.knowledge.discovery.rest",
    "chart.sunreach_open_channel",
    "chart.neva_lighthouse"
  ].includes(nodeId);

  const isNodeVisible = (node: MapNode) => {
    if (!nodeSupportsLens(node, activeLens)) return false;
    const { x: px, y: py } = worldPointToMapSvg(node.worldPosition);
    const inView = px >= viewBox.x - 60 && px <= viewBox.x + viewBox.width + 60 &&
                   py >= viewBox.y - 60 && py <= viewBox.y + viewBox.height + 60;
    if (!inView) return false;
    if (!isMacro) return true;
    return isMajorSeaHub(node.id) || node.id === selectedNodeId || areaIncludes(node);
  };

  const directoryNodes = nodesForView(chartArea, activeLens);

  // Dynamic Compass positioning so it always remains anchored in the viewport
  const compassX = viewBox.x + viewBox.width - 85 * (viewBox.width / 1000);
  const compassY = viewBox.y + 85 * (viewBox.height / 700);
  const compassScale = Math.min(1, Math.max(0.42, viewBox.width / 1000));

  // Waypoint Course Calculations
  const waypointMapPosition = activeWaypoint ? worldPointToMapSvg(activeWaypoint) : null;
  const waypointDistance = activeWaypoint
    ? Math.round(Math.hypot(activeWaypoint.x - playerX, activeWaypoint.z - playerZ))
    : 0;
  const waypointBearingDeg = activeWaypoint
    ? Math.round((Math.atan2(activeWaypoint.x - playerX, -(activeWaypoint.z - playerZ)) * 180 / Math.PI + 360) % 360)
    : 0;
  const bearingCardinal = CARDINALS[Math.round(waypointBearingDeg / 45) % 8];

  // Focus and select node with automatic camera centering when zoomed
  const focusNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    const node = MAP_NODES.find((n) => n.id === nodeId);
    if (!node) return;
    const { x: px, y: py } = worldPointToMapSvg(node.worldPosition);
    if (isZoomed && (px < viewBox.x + 30 || px > viewBox.x + viewBox.width - 30 || py < viewBox.y + 30 || py > viewBox.y + viewBox.height - 30)) {
      const minX = -100;
      const maxX = 1100 - viewBox.width;
      const minY = -80;
      const maxY = 780 - viewBox.height;
      setViewBox((prev) => ({
        ...prev,
        x: Math.max(minX, Math.min(maxX, px - prev.width / 2)),
        y: Math.max(minY, Math.min(maxY, py - prev.height / 2))
      }));
    }
  };

  // Switching preset camera bookmarks
  const switchArea = (area: "sea" | "neva" | "sunreach") => {
    setChartArea(area);
    setSelectedNodeId(destinationForView(area, activeLens, selectedNode).id);
    setViewBox(chartAreaViewBox(area));
  };

  // Continuous Drag Panning Handlers with HTML5 Pointer Capture


  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const clickedInteractive = (e.target as Element)?.closest?.(".map-node-group, .map-school, .map-compass-rose");
    if (clickedInteractive) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored for environments without pointer capture
    }

    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startViewBox: { ...viewBox },
      totalDist: 0
    };

  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.isDragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scaleFactor = dragRef.current.startViewBox.width / rect.width;
    const dx = (e.clientX - dragRef.current.startX) * scaleFactor;
    const dy = (e.clientY - dragRef.current.startY) * scaleFactor;
    dragRef.current.totalDist = Math.hypot(e.clientX - dragRef.current.startX, e.clientY - dragRef.current.startY);

    const minX = -100;
    const maxX = 1100 - dragRef.current.startViewBox.width;
    const minY = -80;
    const maxY = 780 - dragRef.current.startViewBox.height;

    setViewBox((prev) => ({
      ...prev,
      x: Math.max(minX, Math.min(maxX, dragRef.current.startViewBox.x - dx)),
      y: Math.max(minY, Math.min(maxY, dragRef.current.startViewBox.y - dy))
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.isDragging) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignored
    }

    const wasDrag = dragRef.current.totalDist > 6;
    dragRef.current.isDragging = false;


    // Direct click-to-pin nautical waypoint on open water or land
    if (!wasDrag && svgRef.current) {
      const clickedInteractive = (e.target as Element)?.closest?.(".map-node-group, .map-school, .map-compass-rose");
      if (clickedInteractive) return;

      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const svgX = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.width;
      const svgY = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.height;
      const clampedSvgX = Math.max(20, Math.min(980, svgX));
      const clampedSvgY = Math.max(20, Math.min(680, svgY));
      const worldTarget = mapSvgToWorldPoint({ x: clampedSvgX, y: clampedSvgY });
      playUiSound("click");
      setWaypoint(worldTarget);
    }
  };

  const handlePointerCancel = () => {
    dragRef.current.isDragging = false;
  };

  // Mousewheel Smooth Zooming Centered on Cursor
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const cursorSvgX = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.width;
    const cursorSvgY = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.height;

    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
    const newWidth = Math.max(160, Math.min(1000, viewBox.width * zoomFactor));
    const newHeight = newWidth * 0.7;

    const newX = cursorSvgX - (cursorSvgX - viewBox.x) * (newWidth / viewBox.width);
    const newY = cursorSvgY - (cursorSvgY - viewBox.y) * (newHeight / viewBox.height);

    setViewBox({
      x: Math.max(-100, Math.min(1100 - newWidth, newX)),
      y: Math.max(-80, Math.min(780 - newHeight, newY)),
      width: newWidth,
      height: newHeight
    });
  };

  const handleZoomIn = () => {
    setViewBox((prev) => {
      const newWidth = Math.max(160, prev.width * 0.75);
      const newHeight = newWidth * 0.7;
      const centeredX = prev.x + (prev.width - newWidth) / 2;
      const centeredY = prev.y + (prev.height - newHeight) / 2;
      return {
        x: Math.max(-100, Math.min(1100 - newWidth, centeredX)),
        y: Math.max(-80, Math.min(780 - newHeight, centeredY)),
        width: newWidth,
        height: newHeight
      };
    });
  };

  const handleZoomReset = () => {
    setChartArea("sea");
    setViewBox({ x: 0, y: 0, width: 1000, height: 700 });
  };

  const handleZoomOut = () => {
    setViewBox((prev) => {
      const newWidth = Math.min(1000, prev.width * 1.33);
      const newHeight = newWidth * 0.7;
      return {
        x: Math.max(-100, Math.min(1100 - newWidth, prev.x - (newWidth - prev.width) / 2)),
        y: Math.max(-80, Math.min(780 - newHeight, prev.y - (newHeight - prev.height) / 2)),
        width: newWidth,
        height: newHeight
      };
    });
  };

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <GameSheet
        ref={modalRef}
        as="div"
        className="world-map-modal"
        tone="slate"
        corners
        rivets={false}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-title"
        tabIndex={-1}
      >
        <header className="map-modal-header">
          <div className="map-title-group">
            <span className="map-header-icon" aria-hidden="true">
              <IconCompass size={22} />
            </span>
            <div>
              <h2 id="map-title" className="map-title">Nautical Chart of the Neva Archipelago</h2>
              <span className="map-subtitle">Islands, sea lanes, farms, and fishing notes</span>
              {map.activeSchools.length > 0 && (
                <span className="map-school-tally" data-testid="map-school-tally">
                  {`${map.activeSchools.length} school${map.activeSchools.length === 1 ? "" : "s"} working`}
                  {` · nearest ${map.activeSchools[0].distanceMeters} m`}
                </span>
              )}
            </div>
          </div>

          <ChromeClose onClick={onClose} label="Close map" className="map-close-btn" />
        </header>

        <div className="map-modal-content" data-lens={activeLens}>
          <div className="map-lenses-bar" role="tablist" aria-label="Chart lenses" data-testid="map-lenses" onKeyDown={handleTabListKeyDown}>
            {(["geography", "markets", "fishing", "farmland"] as MapLens[]).map((lens) => (
              <button
                key={lens}
                type="button"
                id={`map-lens-${lens}`}
                role="tab"
                aria-selected={activeLens === lens}
                aria-controls="map-lens-details"
                tabIndex={activeLens === lens ? 0 : -1}
                className={`map-lens-btn ${activeLens === lens ? "is-active" : ""}`}
                aria-label={MAP_LENS_LABELS[lens]}
                title={MAP_LENS_LABELS[lens]}
                onClick={() => {
                  playUiSound("page-turn");
                  setActiveLens(lens);
                  setSelectedNodeId(destinationForView(chartArea, lens, selectedNode).id);
                }}
              >
                {MAP_LENS_ICONS[lens]}
                <span className="map-lens-label">{MAP_LENS_LABELS[lens]}</span>
              </button>
            ))}
          </div>

          <div className="map-canvas-container">
            {/* Regional Navigation Bookmark Ribbon */}
            <nav className="map-area-tabs" aria-label="Chart area">
              {(["sea", "neva", "sunreach"] as const).map((area) => (
                <button
                  className="map-area-tab"
                  key={area}
                  type="button"
                  aria-pressed={chartArea === area}
                  onClick={() => switchArea(area)}
                >
                  {area === "sea" ? "Open sea" : area === "neva" ? "Neva" : "Sunreach"}
                </button>
              ))}
            </nav>

            {/* On-Canvas Brass Zoom Controls */}
            <div className="map-zoom-controls" aria-label="Chart zoom controls">
              <button type="button" className="map-zoom-btn" onClick={handleZoomIn} title="Zoom in" aria-label="Zoom in">+</button>
              <button type="button" className="map-zoom-btn map-zoom-reset" onClick={handleZoomReset} title="Reset chart view" aria-label="Reset chart view">1:1</button>
              <button type="button" className="map-zoom-btn" onClick={handleZoomOut} title="Zoom out" aria-label="Zoom out">−</button>
            </div>

            <svg
              ref={svgRef}
              viewBox={chartView}
              className="map-svg-canvas"
              role="group"
              aria-label="Map of Neva, Sunreach and the channel islands"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onWheel={handleWheel}
              style={{ cursor: dragRef.current.isDragging ? "grabbing" : "grab" }}
            >
              <WorldChartTerrain activeLens={activeLens} />

              {MAP_NODES.filter(isNodeVisible).map((node) => {
                const isSelected = selectedNodeId === node.id;
                const { x: px, y: py } = worldPointToMapSvg(node.worldPosition);
                const nodeMarketInsight = node.marketId
                  ? onInspectMarketDemand(node.marketId)
                  : null;
                const nodeFishingInsight = fishingInsight(map, node);
                const nodeFarm = node.farmId ? map.farms[node.farmId] : undefined;
                const shouldShowLabel = !isMacro || isSelected || isMajorSeaHub(node.id);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${px * (1 - markerScale)} ${py * (1 - markerScale)}) scale(${markerScale})`}
                    className="map-node-group"
                    data-lens-relevant={nodeSupportsLens(node, activeLens)}
                    data-major={isMajorSeaHub(node.id) || undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      playUiSound("click");
                      focusNode(node.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        playUiSound("click");
                        focusNode(node.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${node.name}`}
                    aria-pressed={isSelected}
                  >
                    {isSelected && (
                      <circle
                        cx={px}
                        cy={py}
                        r={15}
                        fill="none"
                        stroke="#c4a46a"
                        strokeWidth="1.5"
                        className="map-node-selection-ring"
                      />
                    )}

                    <circle
                      cx={px}
                      cy={py}
                      r={22}
                      fill="transparent"
                      className="map-node-halo"
                      aria-hidden="true"
                    />

                    <circle
                      cx={px}
                      cy={py}
                      r={isSelected ? 11 : 7}
                      fill={isSelected ? "#fbf7ee" : "#f0e6d0"}
                      stroke={isSelected ? "#4a371c" : "#8a7a65"}
                      strokeWidth={isSelected ? 1.8 : 1.2}
                      className="map-node-dot"
                    />

                    {isSelected && (
                      <image
                        href={atlasForMapNode(node.id)}
                        x={px - 8}
                        y={py - 8}
                        width={16}
                        height={16}
                        preserveAspectRatio="xMidYMid meet"
                      />
                    )}

                    {activeLens === "markets" && isSelected && nodeMarketInsight && (
                      <g transform={`translate(${px + 14}, ${py - 10})`}>
                        <rect width="112" height="22" rx="4" fill="rgba(42, 28, 20, 0.92)" stroke="#c4a46a" strokeWidth="1" />
                        <text x="6" y="15" fill="#fbf7ee" fontSize="11" fontWeight="700">
                          {nodeMarketInsight.demandLabel ?? "Steady"}
                        </text>
                      </g>
                    )}

                    {activeLens === "fishing" && isSelected && nodeFishingInsight && nodeFishingInsight.species.length > 0 && (
                      <g transform={`translate(${px + 14}, ${py - 10})`}>
                        <rect width="128" height="22" rx="4" fill="rgba(30, 48, 56, 0.92)" stroke="#5ea3ad" strokeWidth="1" />
                        <text x="6" y="15" fill="#e0f4f7" fontSize="11" fontWeight="700">
                          {nodeFishingInsight.species[0] ?? "No notes yet"}
                        </text>
                      </g>
                    )}

                    {activeLens === "farmland" && isSelected && nodeFarm && (
                      <g transform={`translate(${px + 14}, ${py - 10})`}>
                        <rect width="115" height="22" rx="4" fill="rgba(40, 56, 32, 0.92)" stroke="#88aa6e" strokeWidth="1" />
                        <text x="6" y="15" fill="#f0fae8" fontSize="11" fontWeight="700">
                          {nodeFarm.plantedCount} Crops Planted
                        </text>
                      </g>
                    )}

                    {shouldShowLabel && (
                      <text
                        {...mapLabelPosition(node.id, px, py)}
                        fill={isSelected ? "#4a2810" : "#5a4a38"}
                        fontSize={isSelected ? "10" : "9"}
                        fontWeight={isSelected ? "700" : "500"}
                        fontFamily="serif"
                        className="map-node-text"
                      >
                        {node.name}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Live schools sit under the player mark so they never hide it */}
              <g className="map-school-layer" data-testid="map-school-layer">
                {map.activeSchools.map((school) => {
                  const at = worldPointToMapSvg({ x: school.x, z: school.z });
                  return (
                    <g
                      key={school.schoolId}
                      transform={`translate(${at.x}, ${at.y}) scale(${markerScale})`}
                      className={`map-school${school.feeding ? " is-feeding" : ""}`}
                      data-testid="map-school"
                      data-feeding={school.feeding ? "true" : "false"}
                    >
                      <circle
                        r="8"
                        fill="rgba(56, 189, 248, 0.06)"
                        stroke={school.feeding ? "#f0a020" : "#5a9aaa"}
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      <circle r="2" fill={school.feeding ? "#f0a020" : "#5a9aaa"} />
                      <title>{`${school.waterLabel} school · ${school.minutesRemaining} min left${school.feeding ? " · feeding" : ""}`}</title>
                    </g>
                  );
                })}
              </g>

              {/* Objective Quest Markers */}
              <g className="map-quest-layer" data-testid="map-quest-layer">
                {questMarkers.map((marker) => {
                  const at = worldPointToMapSvg({ x: marker.x, z: marker.z });
                  const focused = marker.kind === "quest";
                  const labelPosition = questMarkerLabelPosition(marker.label);
                  return (
                    <g key={marker.id} data-testid="map-quest-mark" data-kind={marker.kind}>
                      <line
                        x1={playerMapPosition.x} y1={playerMapPosition.y}
                        x2={at.x} y2={at.y}
                        stroke={focused ? "#b8862b" : "#a8935f"}
                        strokeWidth={focused ? (isZoomed ? 1.4 : 2.2) : (isZoomed ? 1 : 1.5)}
                        strokeDasharray={focused ? "8 5" : "4 5"}
                        opacity={focused ? 0.85 : 0.5}
                      />
                      <g transform={`translate(${at.x}, ${at.y}) scale(${questScale})`}>
                        <path d="M0 -13 L9.5 0 L0 13 L-9.5 0 Z"
                          fill={focused ? "#d9a63c" : "#c2ad84"}
                          stroke="#4a3a12" strokeWidth="2" strokeLinejoin="round" />
                        {focused && <path d="M0 -6.4 L4.7 0 L0 6.4 L-4.7 0 Z" fill="#fff6dd" opacity="0.6" />}
                        <text {...labelPosition} fill="#2c2118" fontSize="10.5" fontWeight="bold" fontFamily="serif">
                          {marker.label}
                        </text>
                        <text y="25" fill="#5a4a2c" fontSize="9.5" textAnchor="middle" fontFamily="serif">
                          {`${marker.distanceMeters} m`}
                        </text>
                        <title>{`Objective · ${marker.label} · ${marker.distanceMeters} m`}</title>
                      </g>
                    </g>
                  );
                })}
              </g>

              {/* Plotted Nautical Course Waypoint */}
              {activeWaypoint && waypointMapPosition && (
                <g className="map-custom-waypoint-layer" data-testid="map-custom-waypoint">
                  <line
                    x1={playerMapPosition.x}
                    y1={playerMapPosition.y}
                    x2={waypointMapPosition.x}
                    y2={waypointMapPosition.y}
                    stroke="#c4a46a"
                    strokeWidth={markerScale * 1.4}
                    strokeDasharray={`${markerScale * 6} ${markerScale * 4}`}
                    opacity="0.6"
                  />
                  <g transform={`translate(${waypointMapPosition.x}, ${waypointMapPosition.y}) scale(${markerScale})`}>
                    <circle r="6" fill="#9a3528" stroke="#f5da96" strokeWidth="1.5" />
                    <polygon points="0,-4 1.5,-1.5 4,0 1.5,1.5 0,4 -1.5,1.5 -4,0 -1.5,-1.5" fill="#f5da96" />
                    <text y="16" fill="#c4a46a" fontSize="8" fontWeight="600" fontFamily="serif" textAnchor="middle">
                      {`${bearingCardinal} ${waypointBearingDeg}° · ${waypointDistance} m`}
                    </text>
                  </g>
                </g>
              )}

              {/* Player Position Beacon */}
              <g transform={`translate(${playerMapPosition.x}, ${playerMapPosition.y}) scale(${playerScale})`}>
                <circle r="10" fill="none" stroke="#9a3528" strokeWidth="1.2" opacity="0.5" className="player-pulse-ring" />
                <circle r="5" fill="#9a3528" stroke="#fbf7ee" strokeWidth="1.5" />
                <text y="-10" fill="#4a2810" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="serif">
                  YOU
                </text>
              </g>

              {/* Compact 4-point windrose dynamically anchored */}
              <g
                transform={`translate(${compassX}, ${compassY}) scale(${compassScale * 0.65})`}
                className="map-compass-rose"
              >
                <circle r="25" fill="rgba(247, 243, 230, 0.85)" stroke="#bfa369" strokeWidth="1.5" />
                <circle r="21" fill="none" stroke="#bfa369" strokeWidth="0.5" />

                {/* Cardinal pointers only */}
                <polygon points="0,0 3,4 0,18" fill="#362516" />
                <polygon points="0,0 -3,4 0,18" fill="#5c442c" />
                <polygon points="0,0 4,3 18,0" fill="#362516" />
                <polygon points="0,0 4,-3 18,0" fill="#5c442c" />
                <polygon points="0,0 -4,3 -18,0" fill="#362516" />
                <polygon points="0,0 -4,-3 -18,0" fill="#5c442c" />

                {/* North pointer (red) */}
                <polygon points="0,-19 3,-5 0,-1" fill="#9e2a2b" />
                <polygon points="0,-19 -3,-5 0,-1" fill="#6c1d1e" />

                <circle r="3" fill="#bfa369" stroke="#362516" strokeWidth="0.8" />

                <text y="-21" textAnchor="middle" fill="#8f2628" fontSize="8" fontWeight="bold" fontFamily="serif">N</text>
                <text y="26" textAnchor="middle" fill="#5a4a38" fontSize="7" fontWeight="600" fontFamily="serif">S</text>
                <text x="25" y="3" textAnchor="middle" fill="#5a4a38" fontSize="7" fontWeight="600" fontFamily="serif">E</text>
                <text x="-25" y="3" textAnchor="middle" fill="#5a4a38" fontSize="7" fontWeight="600" fontFamily="serif">W</text>
              </g>
            </svg>
          </div>

          <aside
            id="map-lens-details"
            className="map-sidebar-details"
            role="tabpanel"
            aria-labelledby={`map-lens-${activeLens}`}
            tabIndex={0}
          >
            <label className="guild-chart-destination">Place
              <select aria-label="Chart destination" value={selectedNodeId} onChange={(event) => focusNode(event.target.value)}>
                {directoryNodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </label>
            <header className="sidebar-node-header">
              <AtlasImage src={atlasForMapNode(selectedNode.id)} alt="" size={40} className="sidebar-node-atlas" />
              <div>
                <span className="sidebar-category-badge">{selectedNode.category.toUpperCase()}</span>
                <h3 className="sidebar-node-name">{selectedNode.name}</h3>
              </div>
            </header>

            {/* Set Course to Selected Location button */}
            <button
              type="button"
              className="map-plot-course-btn"
              onClick={() => {
                playUiSound("click");
                setWaypoint(selectedNode.worldPosition);
              }}
            >
              <IconCompass size={14} aria-hidden="true" />
              <span>Plot course to {selectedNode.name}</span>
            </button>

            {/* Active Plotted Waypoint Card */}
            {activeWaypoint && (
              <div className="map-active-course-card">
                <div className="map-course-header">
                  <span className="map-course-title">Course to {waypointDestination?.name ?? "chart point"}</span>
                  <button
                    type="button"
                    className="map-course-clear-btn"
                    onClick={() => {
                      playUiSound("click");
                      setWaypoint(null);
                    }}
                    title="Clear active course"
                    aria-label="Clear active course"
                  >
                    Clear
                  </button>
                </div>
                <div className="map-course-stats">
                  <div className="route-row">
                    <span>Bearing</span>
                    <strong>{bearingCardinal} {waypointBearingDeg}°</strong>
                  </div>
                  <div className="route-row">
                    <span>Direct distance</span>
                    <strong>{waypointDistance} m</strong>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "geography" && (
              <div className="sidebar-section">
                <h4>Route</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Direct distance</span>
                    <strong>{Math.round(selectedDistance)} m</strong>
                  </div>
                  <div className="route-row">
                    <span>Approach</span>
                    <span className="tag-safe">{selectedTerrain}</span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "markets" && selectedMarketInsight?.success && (
              <div className="sidebar-section">
                <h4>Market note</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Most wanted</span>
                    <strong>{selectedMarketInsight.itemName}</strong>
                  </div>
                  <div className="route-row">
                    <span>Demand</span>
                    <span className="tag-up">{selectedMarketInsight.demandLabel}</span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "fishing" && selectedFishingInsight && (
              <div className="sidebar-section">
                <h4>Fishing notes</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Water</span>
                    <strong>{selectedFishingInsight.waterType}</strong>
                  </div>
                  <div className="route-row">
                    <span>Discovered here</span>
                    <strong>{selectedFishingInsight.species.length > 0 ? selectedFishingInsight.species.join(", ") : "No notes yet"}</strong>
                  </div>
                  {selectedFishingInsight.record && (
                    <div className="route-row"><span>Record</span><span>{selectedFishingInsight.record}</span></div>
                  )}
                </div>
              </div>
            )}

            {activeLens === "farmland" && selectedFarm && (
              <div className="sidebar-section">
                <h4>Farm notes</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Soil</span>
                    <strong className="farm-soil-value">{selectedFarm.fertilityPercent}%</strong>
                  </div>
                  <div className="route-row">
                    <span>Climate</span>
                    <span>{selectedFarm.climateLabel}</span>
                  </div>
                  <div className="route-row">
                    <span>Planted</span>
                    <strong>{selectedFarm.plantedCount} plots</strong>
                  </div>
                </div>
              </div>
            )}

            <div className="map-sidebar-tip">
              <span>{activeLens === "fishing"
                ? "Select a waterway to read your discoveries and catches."
                : activeLens === "farmland"
                  ? "Select a farm to read its soil and planting notes."
                  : activeLens === "markets"
                    ? "Select a market to see trade lanes and arbitrage."
                    : "Select a place, then plot its course, or click the chart to pin a point."}</span>
            </div>

            <div className="map-sidebar-directory">
              <div className="map-directory-header">
                <span className="map-directory-title">
                  {activeLens === "markets" ? "Markets" : activeLens === "fishing" ? "Fishing places" : activeLens === "farmland" ? "Farms" : chartArea === "sea" ? "Charted places" : chartArea === "neva" ? "Neva mainland places" : "Sunreach isle places"}
                </span>
                <span className="map-directory-count">
                  {directoryNodes.length} charted
                </span>
              </div>
              <ul className="map-directory-list" role="list">
                {directoryNodes.map((node) => {
                  const isNodeSelected = node.id === selectedNodeId;
                  const dist = Math.round(Math.hypot(node.worldPosition.x - playerX, node.worldPosition.z - playerZ));
                  return (
                    <li key={node.id}>
                      <button
                        type="button"
                        className={`map-directory-item ${isNodeSelected ? "is-selected" : ""}`}
                        aria-pressed={isNodeSelected}
                        onClick={() => {
                          playUiSound("click");
                          focusNode(node.id);
                        }}
                      >
                        <span className="map-directory-item-name">{node.name}</span>
                        <span className="map-directory-item-dist">{dist} m</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      </GameSheet>
    </div>
  );
};
