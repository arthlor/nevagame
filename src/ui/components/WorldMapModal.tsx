import React, { useRef, useState } from "react";
import type { MarketId } from "../../simulation/core/types";
import type { CompassMarkerDto, MarketDemandSignal, WorldMapDto } from "../../simulation/core/contracts";
import {
  WorldLayout,
  type WorldPoint
} from "../../world/WorldLayout";
import { WORLD_CHART_NODES } from "../../world/WorldGameplayLocations";
import { worldPointToMapSvg } from "../../world/WorldMapProjection";
import { IconCoin, IconCompass, IconFish, IconSprout } from "./HudIcons";
import { useModalAccessibility } from "../useModalAccessibility";
import { handleTabListKeyDown } from "../useTabListKeyboard";
import { ChromeClose } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForMapNode } from "../chrome/uiAtlas";
import { WorldChartTerrain } from "./WorldChartTerrain";
import { playUiSound } from "../audio/uiAudio";

interface WorldMapModalProps {
  map: WorldMapDto;
  /**
   * Story targets, already resolved by `QuestDomain` and carried on the HUD
   * compass. The chart draws the same marks the compass ribbon and the minimap
   * do, so all three agree about where the errand is.
   */
  questMarkers?: ReadonlyArray<CompassMarkerDto>;
  onInspectMarketDemand: (marketId: MarketId) => MarketDemandSignal;
  onClose: () => void;
}

type MapLens = "geography" | "markets" | "fishing" | "farmland";

function nodeSupportsLens(node: MapNode, lens: MapLens): boolean {
  if (lens === "markets") return Boolean(node.marketId);
  if (lens === "fishing") return Boolean(node.fishingHabitat);
  if (lens === "farmland") return Boolean(node.farmId);
  return true;
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
  "chart.neva_farm": { x: -16, y: -17, textAnchor: "end" },
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

function mapLabelPosition(nodeId: string, x: number, y: number): { x: number; y: number; textAnchor: "start" | "middle" | "end" } {
  const offset = MAP_LABEL_OFFSETS[nodeId] ?? { x: 0, y: 26, textAnchor: "middle" as const };
  return {
    x: Math.max(18, Math.min(982, x + offset.x)),
    y: Math.max(18, Math.min(682, y + offset.y)),
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
  map, questMarkers = [], onInspectMarketDemand, onClose
}) => {
  const [activeLens, setActiveLens] = useState<MapLens>("geography");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("chart.neva_village");
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const playerX = map.player.x;
  const playerZ = map.player.z;
  const playerMapPosition = worldPointToMapSvg({ x: playerX, z: playerZ });

  const selectedNode = MAP_NODES.find((n) => n.id === selectedNodeId) ?? MAP_NODES[0];
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
              <h2 id="map-title" className="map-title">Nautical Chart of Neva & Sunreach</h2>
              <span className="map-subtitle">Roads, waterways, farms, and fishing notes</span>
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
                  if (!nodeSupportsLens(selectedNode, lens)) {
                    const destination = MAP_NODES.find((node) => nodeSupportsLens(node, lens));
                    if (destination) setSelectedNodeId(destination.id);
                  }
                }}
              >
                {MAP_LENS_ICONS[lens]}
                <span className="map-lens-label">{MAP_LENS_LABELS[lens]}</span>
              </button>
            ))}
          </div>

          <div className="map-canvas-container">
            {/* A group, not an img: an img's children are presentational, which
                hid every selectable location button from assistive tech. */}
            <svg viewBox="0 0 1000 700" className="map-svg-canvas" role="group" aria-label="Map of Neva and Sunreach islands">
              <WorldChartTerrain />

              {MAP_NODES.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const { x: px, y: py } = worldPointToMapSvg(node.worldPosition);
                const nodeMarketInsight = node.marketId
                  ? onInspectMarketDemand(node.marketId)
                  : null;
                const nodeFishingInsight = fishingInsight(map, node);
                const nodeFarm = node.farmId ? map.farms[node.farmId] : undefined;

                return (
                  <g
                    key={node.id}
                    className="map-node-group"
                    data-lens-relevant={nodeSupportsLens(node, activeLens)}
                    onClick={() => {
                      playUiSound("click");
                      setSelectedNodeId(node.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        playUiSound("click");
                        setSelectedNodeId(node.id);
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
                        r={22}
                        fill="none"
                        stroke="#ffd700"
                        strokeWidth="3"
                        strokeDasharray="4 2"
                        className="map-node-selection-ring"
                      />
                    )}

                    <circle
                      cx={px}
                      cy={py}
                      r={isSelected ? 16 : 13}
                      fill="#fbf7ee"
                      stroke="#3e2723"
                      strokeWidth={isSelected ? 2.5 : 1.8}
                      className="map-node-dot"
                    />

                    <image
                      href={atlasForMapNode(node.id)}
                      x={px - (isSelected ? 12 : 10)}
                      y={py - (isSelected ? 12 : 10)}
                      width={isSelected ? 24 : 20}
                      height={isSelected ? 24 : 20}
                      preserveAspectRatio="xMidYMid meet"
                    />

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

                    <text
                      {...mapLabelPosition(node.id, px, py)}
                      fill="#2c2118"
                      fontSize="12"
                      fontWeight="700"
                      fontFamily="serif"
                      className="map-node-text"
                    >
                      {node.name}
                    </text>
                  </g>
                );
              })}

              {/* Live schools sit under the player mark so they never hide it.
                  A school is a passing opportunity, so it carries its own
                  remaining time rather than reading as a fixed landmark. */}
              <g className="map-school-layer" data-testid="map-school-layer">
                {map.activeSchools.map((school) => {
                  const at = worldPointToMapSvg({ x: school.x, z: school.z });
                  return (
                    <g
                      key={school.schoolId}
                      transform={`translate(${at.x}, ${at.y})`}
                      className={`map-school${school.feeding ? " is-feeding" : ""}`}
                      data-testid="map-school"
                      data-feeding={school.feeding ? "true" : "false"}
                    >
                      <circle
                        r="13"
                        fill="rgba(56, 189, 248, 0.16)"
                        stroke={school.feeding ? "#f0a020" : "#2f7d9a"}
                        strokeWidth="1.6"
                        strokeDasharray="4 3"
                      />
                      <circle r="3.4" fill={school.feeding ? "#f0a020" : "#2f7d9a"} />
                      <title>{`${school.waterLabel} school · ${school.minutesRemaining} min left${school.feeding ? " · feeding" : ""}`}</title>
                    </g>
                  );
                })}
              </g>

              {/* The course line is drawn before the player mark so it runs
                  under it, and every quest pin sits above the chart nodes it
                  may share a position with. */}
              <g className="map-quest-layer" data-testid="map-quest-layer">
                {questMarkers.map((marker) => {
                  const at = worldPointToMapSvg({ x: marker.x, z: marker.z });
                  const focused = marker.kind === "quest";
                  return (
                    <g key={marker.id} data-testid="map-quest-mark" data-kind={marker.kind}>
                      <line
                        x1={playerMapPosition.x} y1={playerMapPosition.y}
                        x2={at.x} y2={at.y}
                        stroke={focused ? "#b8862b" : "#a8935f"}
                        strokeWidth={focused ? 2.2 : 1.5}
                        strokeDasharray={focused ? "9 6" : "4 6"}
                        opacity={focused ? 0.8 : 0.5}
                      />
                      <g transform={`translate(${at.x}, ${at.y})`}>
                        <path d="M0 -13 L9.5 0 L0 13 L-9.5 0 Z"
                          fill={focused ? "#d9a63c" : "#c2ad84"}
                          stroke="#4a3a12" strokeWidth="2" strokeLinejoin="round" />
                        {focused && <path d="M0 -6.4 L4.7 0 L0 6.4 L-4.7 0 Z" fill="#fff6dd" opacity="0.6" />}
                        <text y="-19" fill="#2c2118" fontSize="11" fontWeight="bold" textAnchor="middle">
                          {marker.label}
                        </text>
                        <text y="26" fill="#5a4a2c" fontSize="10" textAnchor="middle">
                          {`${marker.distanceMeters} m`}
                        </text>
                        <title>{`Objective · ${marker.label} · ${marker.distanceMeters} m`}</title>
                      </g>
                    </g>
                  );
                })}
              </g>

              <g transform={`translate(${playerMapPosition.x}, ${playerMapPosition.y})`}>
                <circle r="16" fill="none" stroke="#9a3528" strokeWidth="2" opacity="0.6" className="player-pulse-ring" />
                <circle r="8" fill="#9a3528" stroke="#fbf7ee" strokeWidth="2" />
                <text y="-14" fill="#2c2118" fontSize="11" fontWeight="bold" textAnchor="middle">
                  YOU
                </text>
              </g>

              <g transform="translate(910, 90)" className="map-compass-rose">
                <circle r="36" fill="rgba(245, 242, 233, 0.9)" stroke="#c4a46a" strokeWidth="2" />
                <circle r="32" fill="none" stroke="#3e2723" strokeWidth="1" strokeDasharray="3 3" />
                <polygon points="0,-28 6,-8 0,-4" fill="#9a3528" />
                <polygon points="0,-28 -6,-8 0,-4" fill="#611512" />
                <polygon points="0,28 6,8 0,4" fill="#3e2723" />
                <polygon points="0,28 -6,8 0,4" fill="#6b4428" />
                <polygon points="28,0 8,6 4,0" fill="#3e2723" />
                <polygon points="28,0 8,-6 4,0" fill="#6b4428" />
                <polygon points="-28,0 -8,6 -4,0" fill="#3e2723" />
                <polygon points="-28,0 -8,-6 -4,0" fill="#6b4428" />
                <circle r="4" fill="#d4af37" stroke="#3e2723" strokeWidth="1" />
                <text y="-31" textAnchor="middle" fill="#802b2b" fontSize="11" fontWeight="bold" fontFamily="serif">N</text>
                <text y="41" textAnchor="middle" fill="#3e2723" fontSize="10" fontWeight="bold" fontFamily="serif">S</text>
                <text x="36" y="4" textAnchor="middle" fill="#3e2723" fontSize="10" fontWeight="bold" fontFamily="serif">E</text>
                <text x="-36" y="4" textAnchor="middle" fill="#3e2723" fontSize="10" fontWeight="bold" fontFamily="serif">W</text>
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
              <select aria-label="Chart destination" value={selectedNodeId} onChange={(event) => setSelectedNodeId(event.target.value)}>
                {MAP_NODES.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </label>
            <header className="sidebar-node-header">
              <AtlasImage src={atlasForMapNode(selectedNode.id)} alt="" size={40} className="sidebar-node-atlas" />
              <div>
                <span className="sidebar-category-badge">{selectedNode.category.toUpperCase()}</span>
                <h3 className="sidebar-node-name">{selectedNode.name}</h3>
              </div>
            </header>

            {activeLens === "geography" && (
              <div className="sidebar-section">
                <h4>Route</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Distance</span>
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
                    ? "Select a market to see what it needs."
                    : "Select a place to read its route notes."}</span>
            </div>
          </aside>
        </div>
      </GameSheet>
    </div>
  );
};
