import React, { useRef, useState } from "react";
import type { MarketId } from "../../simulation/core/types";
import type { MarketDemandSignal, WorldMapDto } from "../../simulation/core/contracts";
import {
  WorldLayout,
  type WorldPoint
} from "../../world/WorldLayout";
import { WORLD_CHART_NODES } from "../../world/WorldGameplayLocations";
import { worldPointToMapSvg, worldRouteToMapSvgPath } from "../../world/WorldMapProjection";
import { IconCoin, IconCompass, IconFish, IconSprout, IconWarning } from "./HudIcons";
import { useModalAccessibility } from "../useModalAccessibility";
import { handleTabListKeyDown } from "../useTabListKeyboard";
import { ChromeClose } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForMapNode } from "../chrome/uiAtlas";
import { playUiSound } from "../audio/uiAudio";

interface WorldMapModalProps {
  map: WorldMapDto;
  onInspectMarketDemand: (marketId: MarketId) => MarketDemandSignal;
  onClose: () => void;
}

type MapLens = "geography" | "markets" | "fishing" | "farmland";

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
  node_home_farm: { x: -14, y: 24, textAnchor: "end" },
  node_uplands: { x: -14, y: -12, textAnchor: "end" },
  node_village: { x: 16, y: 26, textAnchor: "start" },
  node_crossing: { x: 16, y: -12, textAnchor: "start" },
  node_river: { x: 14, y: 24, textAnchor: "start" },
  node_harbor: { x: 16, y: 24, textAnchor: "start" },
  node_lighthouse: { x: 16, y: 24, textAnchor: "start" },
  node_offshore: { x: 0, y: -18, textAnchor: "middle" }
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

export const WorldMapModal: React.FC<WorldMapModalProps> = ({ map, onInspectMarketDemand, onClose }) => {
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



        <div className="map-modal-content">
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
                }}
              >
                {MAP_LENS_ICONS[lens]}
                <span className="map-lens-label">{MAP_LENS_LABELS[lens]}</span>
              </button>
            ))}
          </div>

          <div className="map-canvas-container">
            <svg viewBox="0 0 1000 700" className="map-svg-canvas" role="img" aria-label="Map of Neva and Sunreach islands">
              <defs>
                <radialGradient id="waterGrad" cx="50%" cy="50%" r="70%">
                  <stop offset="0%" stopColor="#7a9d96" />
                  <stop offset="100%" stopColor="#5d817a" />
                </radialGradient>
                <radialGradient id="landGrad" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="#eee0bc" />
                  <stop offset="85%" stopColor="#ddcca0" />
                  <stop offset="100%" stopColor="#c8b584" />
                </radialGradient>
                <filter id="shadowFilter" x="-10%" y="-10%" width="130%" height="130%">
                  <feDropShadow dx="2" dy="4" stdDeviation="4" floodOpacity="0.35" />
                </filter>
              </defs>

              <rect width="1000" height="700" fill="url(#waterGrad)" />

              <g stroke="rgba(255, 255, 255, 0.12)" strokeWidth="0.75" strokeDasharray="4 8">
                <line x1="0" y1="175" x2="1000" y2="175" />
                <line x1="0" y1="350" x2="1000" y2="350" />
                <line x1="0" y1="525" x2="1000" y2="525" />
                <line x1="250" y1="0" x2="250" y2="700" />
                <line x1="500" y1="0" x2="500" y2="700" />
                <line x1="750" y1="0" x2="750" y2="700" />
              </g>

              <path
                d="M 72,210 C 104,112 236,76 355,116 C 430,155 440,300 410,446 C 382,566 244,610 120,548 C 54,478 42,318 72,210 Z"
                fill="url(#landGrad)"
                stroke="#3e2723"
                strokeWidth="3.5"
                filter="url(#shadowFilter)"
              />

              <path
                d="M 574,281 C 602,215 694,192 785,221 C 858,246 904,323 887,421 C 866,520 775,567 671,523 C 598,492 548,391 574,281 Z"
                fill="url(#landGrad)"
                stroke="#3e2723"
                strokeWidth="3.5"
                filter="url(#shadowFilter)"
              />

              <path
                d="M 260,120 Q 247,295 226,515 Q 194,558 150,580"
                fill="none"
                stroke="#2a5860"
                strokeWidth="18"
                strokeLinecap="round"
              />
              <path
                d="M 260,120 Q 247,295 226,515 Q 194,558 150,580"
                fill="none"
                stroke="#4d8790"
                strokeWidth="10"
                strokeLinecap="round"
              />

              {WorldLayout.routeDefinitions().filter((route) => route.scope === "regional").map((route) => (
                <path
                  key={route.id}
                  d={worldRouteToMapSvgPath(route.points)}
                  fill="none"
                  stroke={route.kind === "arterial" ? "#6b4428" : "#8b5a36"}
                  strokeWidth={route.kind === "arterial" ? 5.5 : route.kind === "lane" ? 3.5 : 2.5}
                  strokeDasharray={route.kind === "trail" ? "6 5" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                />
              ))}

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

                    {activeLens === "markets" && nodeMarketInsight && (
                      <g transform={`translate(${px + 14}, ${py - 10})`}>
                        <rect width="112" height="22" rx="4" fill="rgba(42, 28, 20, 0.92)" stroke="#c4a46a" strokeWidth="1" />
                        <text x="6" y="15" fill="#fbf7ee" fontSize="11" fontWeight="700">
                          {nodeMarketInsight.demandLabel ?? "Steady"}
                        </text>
                      </g>
                    )}

                    {activeLens === "fishing" && nodeFishingInsight && nodeFishingInsight.species.length > 0 && (
                      <g transform={`translate(${px + 14}, ${py - 10})`}>
                        <rect width="128" height="22" rx="4" fill="rgba(30, 48, 56, 0.92)" stroke="#5ea3ad" strokeWidth="1" />
                        <text x="6" y="15" fill="#e0f4f7" fontSize="11" fontWeight="700">
                          {nodeFishingInsight.species[0] ?? "No notes yet"}
                        </text>
                      </g>
                    )}

                    {activeLens === "farmland" && nodeFarm && (
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
                      <title>
                        {`${school.waterLabel} school · ${school.minutesRemaining} min left`}
                        {school.feeding ? " · feeding" : ""}
                      </title>
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
              <IconWarning size={14} aria-hidden="true" />
              <span>The chart keeps fixed places; fishing notes show only discoveries and records.</span>
            </div>
          </aside>
        </div>
      </GameSheet>
    </div>
  );
};
