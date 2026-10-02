import React, { useRef, useState } from "react";
import type { MarketId } from "../../simulation/core/types";
import type { CompassMarkerDto, MarketDemandSignal, WorldMapDto } from "../../simulation/core/contracts";
import {
  WorldLayout,
  type WorldPoint
} from "../../world/WorldLayout";
import { WORLD_CHART_NODES, type WorldChartNode } from "../../world/WorldGameplayLocations";
import { worldPointToMapSvg } from "../../world/WorldMapProjection";
import { IconCompass } from "./HudIcons";
import { useModalAccessibility } from "../useModalAccessibility";
import { ChromeClose } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForMapNode } from "../chrome/uiAtlas";
import { WorldChartTerrain } from "./WorldChartTerrain";
import { playUiSound } from "../audio/uiAudio";
import { placeLabel } from "../../i18n/placesTr";
import { useTranslation } from "../../i18n/useTranslation";

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

function chartAreaViewBox(area: "sea" | "neva" | "sunreach") {
  if (area === "sea") return { x: 0, y: 0, width: 1000, height: 700 };
  const bounds = WorldLayout.islands().find((island) => island.id === `island.${area}`)!.authoredBounds;
  const min = worldPointToMapSvg({ x: bounds.minX, z: bounds.minZ });
  const max = worldPointToMapSvg({ x: bounds.maxX, z: bounds.maxZ });
  const width = Math.max(260, max.x - min.x + 60, ((max.y - min.y + 60) * 10) / 7);
  const height = width * 0.7;
  return { x: (min.x + max.x - width) * 0.5, y: (min.y + max.y - height) * 0.5, width, height };
}

function nodeIsInArea(node: MapNode, area: "sea" | "neva" | "sunreach"): boolean {
  if (area === "neva") return node.islandId === "island.neva";
  if (area === "sunreach") return node.islandId === "island.sunreach";
  return true;
}

function nodesForView(area: "sea" | "neva" | "sunreach"): MapNode[] {
  return MAP_NODES.filter((node) => nodeIsInArea(node, area));
}

function destinationForView(area: "sea" | "neva" | "sunreach", current: MapNode): MapNode {
  const candidates = nodesForView(area);
  if (candidates.some((node) => node.id === current.id)) return current;
  const areaAnchor = area === "sunreach" ? "chart.sunreach_cove" : "chart.neva_harbor";
  return candidates.find((node) => node.id === areaAnchor) ?? candidates[0] ?? current;
}

interface MapNode {
  id: string;
  name: string;
  islandId: WorldChartNode["islandId"];
  category: "farm" | "village" | "harbor" | "lighthouse" | "fishing" | "landmark";
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
  category:
    node.kind === "farm"
      ? "farm"
      : node.kind === "dock"
        ? "harbor"
        : node.kind === "water"
          ? "fishing"
          : node.kind === "market"
            ? "village"
            : node.label.includes("Lighthouse")
              ? "lighthouse"
              : "landmark",
  worldPosition: node.position,
  marketId: node.marketId,
  farmId: node.farmId,
  fishingHabitat: node.fishingHabitat,
  fishingEcologyId: node.fishingEcologyId
}));

const CHART_INK = "#3a342c";
const CHART_PAPER = "#f4ead6";

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  map,
  questMarkers = [],
  onClose
}) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const chartName = (name: string) => placeLabel(name, locale);
  const [chartArea, setChartArea] = useState<"sea" | "neva" | "sunreach">("sea");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("chart.neva_harbor");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredQuestId, setHoveredQuestId] = useState<string | null>(null);

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
  const selectedDistance = Math.hypot(selectedNode.worldPosition.x - playerX, selectedNode.worldPosition.z - playerZ);
  const selectedTerrain = isTr
    ? WorldLayout.isSailable(selectedNode.worldPosition.x, selectedNode.worldPosition.z)
      ? "Seyredilebilir su"
      : WorldLayout.isWalkable(selectedNode.worldPosition.x, selectedNode.worldPosition.z)
        ? "Yol veya patika"
        : "Engebeli arazi"
    : WorldLayout.isSailable(selectedNode.worldPosition.x, selectedNode.worldPosition.z)
      ? "Navigable water"
      : WorldLayout.isWalkable(selectedNode.worldPosition.x, selectedNode.worldPosition.z)
        ? "Road or trail"
        : "Rough ground";

  const zoomRatio = 1000 / viewBox.width;
  const markerScale = Math.min(1, Math.max(0.48, 1 / (zoomRatio * 0.75)));
  const schoolScale = Math.min(1, Math.max(0.78, markerScale));
  const questScale = markerScale;
  const playerScale = markerScale;
  const chartView = `${viewBox.x.toFixed(1)} ${viewBox.y.toFixed(1)} ${viewBox.width.toFixed(1)} ${viewBox.height.toFixed(1)}`;

  const isNodeVisible = (node: MapNode) => {
    const { x: px, y: py } = worldPointToMapSvg(node.worldPosition);
    return (
      px >= viewBox.x - 40 &&
      px <= viewBox.x + viewBox.width + 40 &&
      py >= viewBox.y - 40 &&
      py <= viewBox.y + viewBox.height + 40
    );
  };

  const directoryNodes = nodesForView(chartArea);

  // Dynamic Compass positioning
  const compassX = viewBox.x + viewBox.width - 64 * (viewBox.width / 1000);
  const compassY = viewBox.y + 64 * (viewBox.height / 700);
  const compassScale = Math.min(1, Math.max(0.45, viewBox.width / 1000));

  const focusNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    const node = MAP_NODES.find((n) => n.id === nodeId);
    if (!node) return;
    const { x: px, y: py } = worldPointToMapSvg(node.worldPosition);
    const minX = -100;
    const maxX = 1100 - viewBox.width;
    const minY = -80;
    const maxY = 780 - viewBox.height;
    setViewBox((prev) => ({
      ...prev,
      x: Math.max(minX, Math.min(maxX, px - prev.width / 2)),
      y: Math.max(minY, Math.min(maxY, py - prev.height / 2))
    }));
  };

  const switchArea = (area: "sea" | "neva" | "sunreach") => {
    setChartArea(area);
    setSelectedNodeId(destinationForView(area, selectedNode).id);
    setViewBox(chartAreaViewBox(area));
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const clickedInteractive = (e.target as Element)?.closest?.(".map-node-group, .map-school, .map-compass-rose");
    if (clickedInteractive) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored
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

    dragRef.current.isDragging = false;
  };

  const handlePointerCancel = () => {
    dragRef.current.isDragging = false;
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const cursorSvgX = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.width;
    const cursorSvgY = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.height;

    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
    const newWidth = Math.max(180, Math.min(1000, viewBox.width * zoomFactor));
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
      const newWidth = Math.max(180, prev.width * 0.75);
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
              <h2 id="map-title" className="map-title">
                {isTr ? "Harita" : "Chart"}
              </h2>
              {map.activeSchools.length > 0 && (
                <span className="map-school-tally" data-testid="map-school-tally">
                  {isTr
                    ? `${map.activeSchools.length} sürü faal · en yakını ${map.activeSchools[0].distanceMeters} m`
                    : `${map.activeSchools.length} school${
                        map.activeSchools.length === 1 ? "" : "s"
                      } working · nearest ${map.activeSchools[0].distanceMeters} m`}
                </span>
              )}
            </div>
          </div>

          <ChromeClose onClick={onClose} label={isTr ? "Haritayı kapat" : "Close map"} className="map-close-btn" />
        </header>

        <div className="map-modal-content">
          <div className="map-canvas-container">
            {/* Regional navigation pills */}
            <nav className="map-area-tabs" aria-label={isTr ? "Harita bölgesi" : "Chart area"}>
              {(["sea", "neva", "sunreach"] as const).map((area) => (
                <button
                  className="map-area-tab"
                  key={area}
                  type="button"
                  aria-pressed={chartArea === area}
                  onClick={() => switchArea(area)}
                >
                  {area === "sea" ? (isTr ? "Tümü" : "All") : area === "neva" ? "Neva" : isTr ? "Gündoğumu" : "Sunreach"}
                </button>
              ))}
            </nav>

            {/* Subtle Zoom Controls */}
            <div
              className="map-zoom-controls"
              aria-label={isTr ? "Harita yakınlaştırma kontrolleri" : "Chart zoom controls"}
            >
              <button
                type="button"
                className="map-zoom-btn"
                onClick={handleZoomIn}
                title={isTr ? "Yakınlaş" : "Zoom in"}
                aria-label={isTr ? "Yakınlaş" : "Zoom in"}
              >
                +
              </button>
              <button
                type="button"
                className="map-zoom-btn map-zoom-reset"
                onClick={handleZoomReset}
                title={isTr ? "Sıfırla" : "Reset view"}
                aria-label={isTr ? "Sıfırla" : "Reset view"}
              >
                ↺
              </button>
              <button
                type="button"
                className="map-zoom-btn"
                onClick={handleZoomOut}
                title={isTr ? "Uzaklaş" : "Zoom out"}
                aria-label={isTr ? "Uzaklaş" : "Zoom out"}
              >
                −
              </button>
            </div>

            <svg
              ref={svgRef}
              viewBox={chartView}
              className="map-svg-canvas"
              role="group"
              aria-label={
                isTr ? "Neva, Güneşeren ve boğaz adaları haritası" : "Map of Neva, Sunreach and the channel islands"
              }
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onWheel={handleWheel}
              style={{ cursor: dragRef.current.isDragging ? "grabbing" : "grab" }}
            >
              <WorldChartTerrain />

              {/* Handcrafted Medieval POI Emblems - NO permanent copy, tooltip on hover/select */}
              {MAP_NODES.filter(isNodeVisible).map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const { x: px, y: py } = worldPointToMapSvg(node.worldPosition);
                const displayName = chartName(node.name);
                const labelWidth = Math.max(54, displayName.length * 6.8 + 16);
                // No permanent copy: only show tooltip on hover or active selection
                const showTooltip = isHovered || isSelected;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${px * (1 - markerScale)} ${py * (1 - markerScale)}) scale(${markerScale})`}
                    className={`map-node-group ${isSelected ? "is-selected" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      playUiSound("click");
                      focusNode(node.id);
                    }}
                    onPointerEnter={() => setHoveredNodeId(node.id)}
                    onPointerLeave={() => setHoveredNodeId(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        playUiSound("click");
                        focusNode(node.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={isTr ? `${displayName} seç` : `Select ${node.name}`}
                    aria-pressed={isSelected}
                  >
                    {/* Interactive hit halo */}
                    <circle cx={px} cy={py} r={22} fill="transparent" className="map-node-halo" />
                    {isSelected && (
                      <circle
                        cx={px}
                        cy={py}
                        r={18}
                        fill="none"
                        stroke="#8a6230"
                        strokeWidth="1.15"
                        strokeDasharray="3 2"
                        className="map-node-selection-ring"
                      />
                    )}

                    {/* Sleek Tooltip - ONLY on hover or selection (NO permanent copy) */}
                    {showTooltip && (
                      <g className="map-node-label-pill" pointerEvents="none">
                        <rect
                          x={px - labelWidth / 2}
                          y={py - 24}
                          width={labelWidth}
                          height={16}
                          rx={4}
                          fill="rgba(30, 22, 14, 0.94)"
                          stroke="#c4a46a"
                          strokeWidth={0.8}
                        />
                        <text
                          x={px}
                          y={py - 13}
                          textAnchor="middle"
                          fill="#fef9eb"
                          fontSize={9}
                          fontWeight="bold"
                          fontFamily="serif"
                          className="map-node-text"
                        >
                          {displayName}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Live fishing schools */}
              <g className="map-school-layer" data-testid="map-school-layer">
                {map.activeSchools.map((school) => {
                  const at = worldPointToMapSvg({ x: school.x, z: school.z });
                  return (
                    <g
                      key={school.schoolId}
                      transform={`translate(${at.x}, ${at.y}) scale(${schoolScale})`}
                      className={`map-school${school.feeding ? " is-feeding" : ""}`}
                      data-testid="map-school"
                      data-feeding={school.feeding ? "true" : "false"}
                    >
                      <image
                        href="/ui-chart/school.png"
                        x="-18"
                        y="-9"
                        width="36"
                        height="18"
                        preserveAspectRatio="xMidYMid meet"
                      />
                      {school.feeding && (
                        <ellipse rx="19" ry="10" fill="none" stroke="#c4842a" strokeWidth="1.05" />
                      )}
                      <title>
                        {isTr
                          ? `${school.waterLabel} sürüsü · ${school.minutesRemaining} dk kaldı${
                              school.feeding ? " · besleniyor" : ""
                            }`
                          : `${school.waterLabel} school · ${school.minutesRemaining} min left${
                              school.feeding ? " · feeding" : ""
                            }`}
                      </title>
                    </g>
                  );
                })}
              </g>

              {/* Objective Quest Markers - NO permanent text copy, tooltip on hover */}
              <g className="map-quest-layer" data-testid="map-quest-layer">
                {questMarkers.map((marker) => {
                  const at = worldPointToMapSvg({ x: marker.x, z: marker.z });
                  const focused = marker.kind === "quest";
                  const markerName = chartName(marker.label);
                  const pillWidth = Math.max(50, markerName.length * 6.5 + 14);
                  const isHovered = hoveredQuestId === marker.id;

                  return (
                    <g
                      key={marker.id}
                      data-testid="map-quest-mark"
                      data-kind={marker.kind}
                      onPointerEnter={() => setHoveredQuestId(marker.id)}
                      onPointerLeave={() => setHoveredQuestId(null)}
                      style={{ cursor: "pointer" }}
                    >
                      <g transform={`translate(${at.x}, ${at.y}) scale(${questScale})`}>
                        <path
                          d="M0 -11 L8 0 L0 11 L-8 0 Z"
                          fill={focused ? "#c47a3a" : "#a89474"}
                          stroke={CHART_INK}
                          strokeWidth="1.15"
                          strokeLinejoin="round"
                        />
                        {focused && <path d="M0 -5 L3.5 0 L0 5 L-3.5 0 Z" fill={CHART_PAPER} opacity="0.85" />}

                        {/* Tooltip on hover only (no permanent copy) */}
                        {isHovered && (
                          <g pointerEvents="none">
                            <rect
                              x={-pillWidth / 2}
                              y={-27}
                              width={pillWidth}
                              height={15}
                              rx={3}
                              fill="rgba(30, 22, 14, 0.94)"
                              stroke="#c4a46a"
                              strokeWidth={0.8}
                            />
                            <text
                              y={-16}
                              fill="#fcf6e8"
                              fontSize="8.5"
                              fontWeight="bold"
                              fontFamily="serif"
                              textAnchor="middle"
                            >
                              {markerName}
                            </text>
                          </g>
                        )}

                        <title>
                          {isTr
                            ? `Hedef · ${markerName} · ${marker.distanceMeters} m`
                            : `Objective · ${marker.label} · ${marker.distanceMeters} m`}
                        </title>
                      </g>
                    </g>
                  );
                })}
              </g>

              {/* Player Position Beacon */}
              <g transform={`translate(${playerMapPosition.x}, ${playerMapPosition.y}) scale(${playerScale})`}>
                <circle r="9" fill="none" stroke="#9e3223" strokeWidth="1.05" opacity="0.45" className="player-pulse-ring" />
                <circle r="4.5" fill="#9e3223" stroke={CHART_PAPER} strokeWidth="1.3" />
                <polygon points="0,-8 2.2,-1.2 0,-2.4 -2.2,-1.2" fill="#e2c15a" stroke={CHART_INK} strokeWidth="0.5" />
                <text y="-10" fill={CHART_INK} fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="serif" opacity="0.9">
                  {isTr ? "SEN" : "YOU"}
                </text>
              </g>

              {/* Minimal Cozy Medieval Compass Rose */}
              <g
                transform={`translate(${compassX}, ${compassY}) scale(${compassScale * 0.6})`}
                className="map-compass-rose"
                aria-hidden="true"
              >
                <circle r="22" fill={CHART_PAPER} stroke={CHART_INK} strokeWidth="1" />
                <circle r="16" fill="none" stroke={CHART_INK} strokeWidth="0.45" />
                <path d="M0 14 L1.3 2 L0 0 L-1.3 2 Z" fill={CHART_PAPER} stroke={CHART_INK} strokeWidth="0.6" strokeLinejoin="round" />
                <path d="M14 0 L2 1.2 L0 0 L2 -1.2 Z" fill="none" stroke={CHART_INK} strokeWidth="0.7" strokeLinejoin="round" />
                <path d="M-14 0 L-2 1.2 L0 0 L-2 -1.2 Z" fill="none" stroke={CHART_INK} strokeWidth="0.7" strokeLinejoin="round" />
                <path d="M0 -15 L1.5 -2 L0 0 L-1.5 -2 Z" fill="#9e3223" stroke={CHART_INK} strokeWidth="0.45" strokeLinejoin="round" />
                <circle r="1.5" fill={CHART_INK} />

                <text y="-18" textAnchor="middle" fill="#9e3223" fontSize="8" fontWeight="bold" fontFamily="serif">
                  {isTr ? "K" : "N"}
                </text>
                <text y="23" textAnchor="middle" fill={CHART_INK} fontSize="6.5" fontWeight="600" fontFamily="serif">
                  {isTr ? "G" : "S"}
                </text>
                <text x="22" y="2.5" textAnchor="middle" fill={CHART_INK} fontSize="6.5" fontWeight="600" fontFamily="serif">
                  {isTr ? "D" : "E"}
                </text>
                <text x="-22" y="2.5" textAnchor="middle" fill={CHART_INK} fontSize="6.5" fontWeight="600" fontFamily="serif">
                  {isTr ? "B" : "W"}
                </text>
              </g>
            </svg>
          </div>

          {/* Clean, Cozy Sidebar Details */}
          <aside className="map-sidebar-details">
            <label className="guild-chart-destination">
              {isTr ? "Yer" : "Place"}
              <select
                aria-label={isTr ? "Harita hedefi" : "Chart destination"}
                value={selectedNodeId}
                onChange={(event) => focusNode(event.target.value)}
              >
                {directoryNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {chartName(node.name)}
                  </option>
                ))}
              </select>
            </label>

            {/* Selected Location Card */}
            <header className="sidebar-node-header">
              <AtlasImage src={atlasForMapNode(selectedNode.id)} alt="" size={36} className="sidebar-node-atlas" />
              <div>
                <span className="sidebar-category-badge">
                  {isTr
                    ? selectedNode.category === "farm"
                      ? "ÇİFTLİK"
                      : selectedNode.category === "village"
                        ? "KÖY"
                        : selectedNode.category === "harbor"
                          ? "LİMAN"
                          : selectedNode.category === "lighthouse"
                            ? "FENER"
                            : "KEŞİF"
                    : selectedNode.category.toUpperCase()}
                </span>
                <h3 className="sidebar-node-name">{chartName(selectedNode.name)}</h3>
              </div>
            </header>

            <div className="sidebar-section">
              <h4>{isTr ? "Konum" : "Location"}</h4>
              <div className="route-stat-card">
                <div className="route-row">
                  <span>{isTr ? "Mesafe" : "Distance"}</span>
                  <strong>{Math.round(selectedDistance)} m</strong>
                </div>
                <div className="route-row">
                  <span>{isTr ? "Zemin" : "Approach"}</span>
                  <span className="tag-safe">{selectedTerrain}</span>
                </div>
              </div>
            </div>

            <details className="map-sidebar-directory">
              <summary className="map-directory-header">
                <span className="map-directory-title">
                  {isTr ? "Kayıtlı Yerler" : "Charted Places"}
                </span>
                <span className="map-directory-count">{directoryNodes.length}</span>
              </summary>
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
                        <span className="map-directory-item-name">{chartName(node.name)}</span>
                        <span className="map-directory-item-dist">{dist} m</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </details>
          </aside>
        </div>
      </GameSheet>
    </div>
  );
};
