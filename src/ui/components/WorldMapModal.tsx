// src/ui/components/WorldMapModal.tsx
import React, { useRef, useState } from "react";
import { GameState, MarketId } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { calculateCommodityUnitPrice } from "../../simulation/economy/calculateCommodityValue";
import {
  WORLD_LAYOUT_V5,
  WORLD_REGIONAL_PATHS,
  WORLD_ROUTES,
  WorldLayout,
  type WorldPoint
} from "../../world/WorldLayout";
import { worldPointToMapSvg, worldRouteToMapSvgPath } from "../../world/WorldMapProjection";
import { IconCoin, IconCompass, IconFish, IconSprout, IconWarning } from "./HudIcons";
import { useModalAccessibility } from "../useModalAccessibility";
import { ChromeClose, ChromePanel } from "../chrome/Chrome";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForMapNode } from "../chrome/uiAtlas";
import { playUiSound } from "../audio/uiAudio";

interface WorldMapModalProps {
  state: GameState;
  onClose: () => void;
}

type MapLens = "geography" | "markets" | "fishing" | "farmland";

const MAP_LENS_ICONS: Record<MapLens, React.ReactNode> = {
  geography: <IconCompass size={18} aria-hidden="true" />,
  markets: <IconCoin size={18} aria-hidden="true" />,
  fishing: <IconFish size={18} aria-hidden="true" />,
  farmland: <IconSprout size={18} aria-hidden="true" />
};

interface MapNode {
  id: string;
  name: string;
  category: "farm" | "village" | "harbor" | "lighthouse" | "fishing";
  worldPosition: WorldPoint;
  marketId?: MarketId;
  farmId?: string;
  fishingHabitat?: "river" | "lake" | "coast" | "offshore";
}

const MAP_NODES: MapNode[] = [
  {
    id: "node_home_farm",
    name: "Starter Homestead & Yard",
    category: "farm",
    worldPosition: WORLD_LAYOUT_V5.anchors.playerSpawn,
    farmId: "farm.starter_garden"
  },
  {
    id: "node_uplands",
    name: "Private Homestead Garden",
    category: "farm",
    worldPosition: WORLD_LAYOUT_V5.anchors.privateHomestead,
    farmId: "farm.player_homestead"
  },
  {
    id: "node_village",
    name: "Neva Village Market",
    category: "village",
    worldPosition: WORLD_LAYOUT_V5.anchors.villageMarket,
    marketId: "market.village"
  },
  {
    id: "node_mill",
    name: "Village Mill",
    category: "village",
    worldPosition: { x: WorldLayout.landmark("windmill").x, z: WorldLayout.landmark("windmill").z }
  },
  {
    id: "node_crossing",
    name: "River Crossing",
    category: "fishing",
    worldPosition: WORLD_LAYOUT_V5.anchors.riverCrossing,
    fishingHabitat: "river"
  },
  {
    id: "node_river",
    name: "Silverwater River Corridor",
    category: "fishing",
    worldPosition: { x: WorldLayout.riverCenterX(-40), z: -40 },
    fishingHabitat: "river"
  },
  {
    id: "node_harbor",
    name: "Seabreak Harbor & Fish Market",
    category: "harbor",
    worldPosition: WORLD_LAYOUT_V5.anchors.fishMarket,
    marketId: "market.harbor",
    fishingHabitat: "coast"
  },
  {
    id: "node_lighthouse",
    name: "Southwest Cliffs & Lighthouse",
    category: "lighthouse",
    worldPosition: WORLD_LAYOUT_V5.anchors.lighthouse,
    fishingHabitat: "coast"
  },
  {
    id: "node_offshore",
    name: "Deep Sea Offshore Grounds",
    category: "fishing",
    worldPosition: { x: WORLD_LAYOUT_V5.riverMouth.x, z: 170 },
    fishingHabitat: "offshore"
  }
];

const MAP_LABEL_OFFSETS: Record<string, { x: number; y: number; textAnchor: "start" | "middle" | "end" }> = {
  node_home_farm: { x: -14, y: 24, textAnchor: "end" },
  node_uplands: { x: -14, y: -12, textAnchor: "end" },
  node_village: { x: 16, y: 26, textAnchor: "start" },
  node_crossing: { x: 16, y: -12, textAnchor: "start" },
  node_river: { x: 14, y: 24, textAnchor: "start" },
  node_harbor: { x: 16, y: 24, textAnchor: "start" },
  node_lighthouse: { x: -14, y: 24, textAnchor: "end" },
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

function marketInsight(state: GameState, node: MapNode): { demandItem: string; demandTrend: string; price: string; demand: string } | null {
  if (!node.marketId) return null;
  const market = state.markets[node.marketId];
  if (!market) return null;
  const commodity = Object.values(market.commodities).sort((a, b) => b.demandIndex - a.demandIndex)[0];
  if (!commodity) return null;
  const price = calculateCommodityUnitPrice(commodity);
  const item = ContentRegistry.items.get(commodity.itemId) ?? ContentRegistry.fishSpecies.get(commodity.itemId);
  const delta = price.demandPercent - 100;
  return {
    demandItem: item?.name ?? commodity.itemId,
    demandTrend: delta === 0 ? "Steady" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}%`,
    price: `${price.unitPrice} G`,
    demand: `${price.demandPercent}%`
  };
}

function fishingInsight(state: GameState, node: MapNode): { waterType: string; activity: string; dominantSpecies: string } | null {
  if (!node.fishingHabitat) return null;
  const waterType = node.fishingHabitat === "river" || node.fishingHabitat === "lake"
    ? "Freshwater"
    : node.fishingHabitat === "coast" ? "Coastal Saltwater" : "Deep Sea Waters";
  const schools = Object.values(state.world.activeSchools).filter((school) =>
    school.habitatId === node.fishingHabitat &&
    state.clock.currentMinute >= school.spawnedAtMinute &&
    state.clock.currentMinute < school.expiresAtMinute &&
    school.remainingCatchPotential > 0 &&
    Math.hypot(school.x - node.worldPosition.x, school.z - node.worldPosition.z) <= Math.max(40, school.radius * 2)
  );
  const speciesIds = [...new Set(
    schools
      .flatMap((school) => [...school.speciesWeights].sort((a, b) => b.weight - a.weight).map((entry) => entry.speciesId))
  )];
  const speciesNames = speciesIds
    .map((speciesId) => ContentRegistry.fishSpecies.get(speciesId)?.name ?? speciesId)
    .slice(0, 3);
  return {
    waterType,
    activity: schools.length === 0 ? "Quiet Waters" : `${schools.length} Active School${schools.length === 1 ? "" : "s"}`,
    dominantSpecies: speciesNames.length > 0 ? speciesNames.join(", ") : "No active schools sighted"
  };
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({ state, onClose }) => {
  const [activeLens, setActiveLens] = useState<MapLens>("geography");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("node_village");
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const playerX = state.player.x;
  const playerZ = state.player.z;
  const playerMapPosition = worldPointToMapSvg({ x: playerX, z: playerZ });

  const selectedNode = MAP_NODES.find((n) => n.id === selectedNodeId) ?? MAP_NODES[0];
  const selectedMarketInsight = marketInsight(state, selectedNode);
  const selectedFishingInsight = fishingInsight(state, selectedNode);
  const selectedFarm = selectedNode.farmId ? state.farms[selectedNode.farmId] : undefined;
  const selectedDistance = Math.hypot(selectedNode.worldPosition.x - playerX, selectedNode.worldPosition.z - playerZ);
  const estimatedWalkingSeconds = Math.round(selectedDistance / 4.2); // ~4.2 m/s walk speed

  const selectedTerrain = WorldLayout.isSailable(selectedNode.worldPosition.x, selectedNode.worldPosition.z)
    ? "Navigable Waterway"
    : WorldLayout.isWalkable(selectedNode.worldPosition.x, selectedNode.worldPosition.z)
      ? "Walkable Highway & Trail"
      : "Rugged Terrain";

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <ChromePanel
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
        {/* Header with Lens Toggles */}
        <header className="map-modal-header">
          <div className="map-title-group">
            <span className="map-header-icon" aria-hidden="true">
              <IconCompass size={22} />
            </span>
            <div>
              <h2 id="map-title" className="map-title">Illuminated Realm of Neva</h2>
              <span className="map-subtitle">Arterial Roads, Silverwater Channel & Coastal Docks</span>
            </div>
          </div>

          <div className="map-lenses-bar mm-ribbon-tabs" role="tablist" aria-label="Map lenses" data-testid="map-lenses">
            {(["geography", "markets", "fishing", "farmland"] as MapLens[]).map((lens) => (
              <button
                key={lens}
                type="button"
                role="tab"
                aria-selected={activeLens === lens}
                aria-controls="map-lens-details"
                className={`map-lens-btn ${activeLens === lens ? "is-active" : ""}`}
                onClick={() => {
                  playUiSound("page-turn");
                  setActiveLens(lens);
                }}
              >
                {MAP_LENS_ICONS[lens]}
                {lens === "geography"
                  ? "Geography"
                  : lens === "markets"
                    ? "Trade Guilds"
                    : lens === "fishing"
                      ? "Fishing Grounds"
                      : "Farmlands"}
              </button>
            ))}
          </div>

          <ChromeClose onClick={onClose} label="Close map" className="map-close-btn" />
        </header>



        <div className="map-modal-content">
          {/* SVG Map Canvas */}
          <div className="map-canvas-container">
            <svg viewBox="0 0 1000 700" className="map-svg-canvas" role="img" aria-label="Map of Neva Island">
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

              {/* Water Background */}
              <rect width="1000" height="700" fill="url(#waterGrad)" />

              {/* Subtle Nautical/Cartography Grid Lines */}
              <g stroke="rgba(255, 255, 255, 0.12)" strokeWidth="0.75" strokeDasharray="4 8">
                <line x1="0" y1="175" x2="1000" y2="175" />
                <line x1="0" y1="350" x2="1000" y2="350" />
                <line x1="0" y1="525" x2="1000" y2="525" />
                <line x1="250" y1="0" x2="250" y2="700" />
                <line x1="500" y1="0" x2="500" y2="700" />
                <line x1="750" y1="0" x2="750" y2="700" />
              </g>

              {/* Island Landmass with Shading */}
              <path
                d="M 120,200 C 160,80 340,60 500,80 C 680,100 820,140 860,280 C 900,420 840,620 680,660 C 500,700 280,680 180,600 C 80,500 80,320 120,200 Z"
                fill="url(#landGrad)"
                stroke="#3e2723"
                strokeWidth="3.5"
                filter="url(#shadowFilter)"
              />

              {/* River Arterial Channel */}
              <path
                d="M 480,120 Q 420,300 350,580 Q 300,640 220,660"
                fill="none"
                stroke="#2a5860"
                strokeWidth="18"
                strokeLinecap="round"
              />
              <path
                d="M 480,120 Q 420,300 350,580 Q 300,640 220,660"
                fill="none"
                stroke="#4d8790"
                strokeWidth="10"
                strokeLinecap="round"
              />

              {/* Canonical Regional Routes */}
              {WORLD_ROUTES.map((route, index) => (
                <path
                  key={route.id}
                  d={worldRouteToMapSvgPath(WORLD_REGIONAL_PATHS[index])}
                  fill="none"
                  stroke={route.kind === "arterial" ? "#6b4428" : "#8b5a36"}
                  strokeWidth={route.kind === "arterial" ? 5.5 : route.kind === "lane" ? 3.5 : 2.5}
                  strokeDasharray={route.kind === "trail" ? "6 5" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                />
              ))}

              {/* Landmark Nodes */}
              {MAP_NODES.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const { x: px, y: py } = worldPointToMapSvg(node.worldPosition);
                const nodeMarketInsight = marketInsight(state, node);
                const nodeFishingInsight = fishingInsight(state, node);
                const nodeFarm = node.farmId ? state.farms[node.farmId] : undefined;

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

                    {/* Lens specific badges */}
                    {activeLens === "markets" && nodeMarketInsight && (
                      <g transform={`translate(${px + 14}, ${py - 10})`}>
                        <rect width="112" height="22" rx="4" fill="rgba(42, 28, 20, 0.92)" stroke="#c4a46a" strokeWidth="1" />
                        <text x="6" y="15" fill="#fbf7ee" fontSize="11" fontWeight="700">
                          {nodeMarketInsight.demandTrend}
                        </text>
                      </g>
                    )}

                    {activeLens === "fishing" && nodeFishingInsight && (
                      <g transform={`translate(${px + 14}, ${py - 10})`}>
                        <rect width="128" height="22" rx="4" fill="rgba(30, 48, 56, 0.92)" stroke="#5ea3ad" strokeWidth="1" />
                        <text x="6" y="15" fill="#e0f4f7" fontSize="11" fontWeight="700">
                          {nodeFishingInsight.dominantSpecies.split(",")[0]}
                        </text>
                      </g>
                    )}

                    {activeLens === "farmland" && nodeFarm && (
                      <g transform={`translate(${px + 14}, ${py - 10})`}>
                        <rect width="115" height="22" rx="4" fill="rgba(40, 56, 32, 0.92)" stroke="#88aa6e" strokeWidth="1" />
                        <text x="6" y="15" fill="#f0fae8" fontSize="11" fontWeight="700">
                          {nodeFarm.placedCropIds.length} Crops Planted
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

              {/* Player Position Pin & Beacon */}
              <g transform={`translate(${playerMapPosition.x}, ${playerMapPosition.y})`}>
                <circle r="16" fill="none" stroke="#9a3528" strokeWidth="2" opacity="0.6" className="player-pulse-ring" />
                <circle r="8" fill="#9a3528" stroke="#fbf7ee" strokeWidth="2" />
                <text y="-14" fill="#2c2118" fontSize="11" fontWeight="bold" textAnchor="middle">
                  YOU
                </text>
              </g>

              {/* Gilded Compass Rose */}
              <g transform="translate(910, 90)" className="map-compass-rose">
                <circle r="36" fill="rgba(245, 242, 233, 0.9)" stroke="#c4a46a" strokeWidth="2" />
                <circle r="32" fill="none" stroke="#3e2723" strokeWidth="1" strokeDasharray="3 3" />
                {/* 4 Points */}
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

          {/* Sidebar: Cartographer Intelligence */}
          <aside id="map-lens-details" className="map-sidebar-details">
            <header className="sidebar-node-header">
              <AtlasImage src={atlasForMapNode(selectedNode.id)} alt="" size={40} className="sidebar-node-atlas" />
              <div>
                <span className="sidebar-category-badge">{selectedNode.category.toUpperCase()}</span>
                <h3 className="sidebar-node-name">{selectedNode.name}</h3>
              </div>
            </header>

            {activeLens === "geography" && (
              <div className="sidebar-section">
                <h4>Route Navigation</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Distance from Player:</span>
                    <strong>{Math.round(selectedDistance)} m</strong>
                  </div>
                  <div className="route-row">
                    <span>Est. Foot Travel:</span>
                    <strong>~{estimatedWalkingSeconds}s</strong>
                  </div>
                  <div className="route-row">
                    <span>Terrain Passage:</span>
                    <span className="tag-safe">{selectedTerrain}</span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "markets" && selectedMarketInsight && (
              <div className="sidebar-section">
                <h4>Merchant Guild Ledger</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Top Demand Good:</span>
                    <strong style={{ color: "#c4a46a" }}>{selectedMarketInsight.demandItem}</strong>
                  </div>
                  <div className="route-row">
                    <span>Stall Price:</span>
                    <strong>{selectedMarketInsight.price}</strong>
                  </div>
                  <div className="route-row">
                    <span>Demand Index:</span>
                    <span className="tag-up">
                      {selectedMarketInsight.demand} ({selectedMarketInsight.demandTrend})
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "fishing" && selectedFishingInsight && (
              <div className="sidebar-section">
                <h4>Angling & Habitat Telemetry</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Water Body:</span>
                    <strong>{selectedFishingInsight.waterType}</strong>
                  </div>
                  <div className="route-row">
                    <span>School Activity:</span>
                    <strong style={{ color: "#3f6b73" }}>{selectedFishingInsight.activity}</strong>
                  </div>
                  <div className="route-row">
                    <span>Dominant Species:</span>
                    <span>{selectedFishingInsight.dominantSpecies}</span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "farmland" && selectedFarm && (
              <div className="sidebar-section">
                <h4>Agrarian Soil Report</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Soil Fertility:</span>
                    <strong style={{ color: "#4e7a42" }}>{Math.round(selectedFarm.soil.fertility)}%</strong>
                  </div>
                  <div className="route-row">
                    <span>Regional Climate:</span>
                    <span>{selectedFarm.climateId}</span>
                  </div>
                  <div className="route-row">
                    <span>Active Till Plots:</span>
                    <strong>{selectedFarm.placedCropIds.length} Plots</strong>
                  </div>
                </div>
              </div>
            )}



            <div className="map-sidebar-tip">
              <IconWarning size={14} aria-hidden="true" />
              <span>Transporting fresh fish across the island requires crushed ice to avoid spoilage.</span>
            </div>
          </aside>
        </div>
      </ChromePanel>
    </div>
  );
};
