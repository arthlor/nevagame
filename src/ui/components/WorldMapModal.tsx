// src/ui/components/WorldMapModal.tsx
import React, { useState } from "react";
import { GameState, MarketId } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { calculateCommodityUnitPrice } from "../../simulation/economy/calculateCommodityValue";
import {
  WORLD_LAYOUT_V3,
  WORLD_REGIONAL_PATHS,
  WORLD_ROUTES,
  WorldLayout,
  type WorldPoint
} from "../../world/WorldLayout";
import { worldPointToMapSvg, worldRouteToMapSvgPath } from "../../world/WorldMapProjection";
import { IconWarning } from "./HudIcons";

interface WorldMapModalProps {
  state: GameState;
  onClose: () => void;
}

type MapLens = "geography" | "markets" | "fishing" | "farmland";

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
    worldPosition: WORLD_LAYOUT_V3.anchors.playerSpawn,
    farmId: "farm.starter_garden"
  },
  {
    id: "node_uplands",
    name: "Northeast Plateau & Windmill",
    category: "farm",
    worldPosition: WORLD_LAYOUT_V3.anchors.privateHomestead,
    farmId: "farm.player_homestead"
  },
  {
    id: "node_village",
    name: "Central Village & Market Hall",
    category: "village",
    worldPosition: WORLD_LAYOUT_V3.anchors.villageMarket,
    marketId: "market.village"
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
    worldPosition: WORLD_LAYOUT_V3.anchors.fishMarket,
    marketId: "market.harbor",
    fishingHabitat: "coast"
  },
  {
    id: "node_lighthouse",
    name: "Southwest Cliffs & Lighthouse",
    category: "lighthouse",
    worldPosition: WORLD_LAYOUT_V3.anchors.lighthouse,
    fishingHabitat: "coast"
  },
  {
    id: "node_offshore",
    name: "Deep Sea Offshore Grounds",
    category: "fishing",
    worldPosition: { x: WORLD_LAYOUT_V3.riverMouth.x, z: 170 },
    fishingHabitat: "offshore"
  }
];

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
    : node.fishingHabitat === "coast" ? "Coastal saltwater" : "Open saltwater";
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
    activity: schools.length === 0 ? "No active school" : `${schools.length} active school${schools.length === 1 ? "" : "s"}`,
    dominantSpecies: speciesNames.length > 0 ? speciesNames.join(", ") : "No active school observed"
  };
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({ state, onClose }) => {
  const [activeLens, setActiveLens] = useState<MapLens>("geography");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("node_village");

  const playerX = state.player.x;
  const playerZ = state.player.z;
  const playerMapPosition = worldPointToMapSvg({ x: playerX, z: playerZ });

  const selectedNode = MAP_NODES.find((n) => n.id === selectedNodeId) ?? MAP_NODES[0];
  const selectedMarketInsight = marketInsight(state, selectedNode);
  const selectedFishingInsight = fishingInsight(state, selectedNode);
  const selectedFarm = selectedNode.farmId ? state.farms[selectedNode.farmId] : undefined;
  const selectedDistance = Math.hypot(selectedNode.worldPosition.x - playerX, selectedNode.worldPosition.z - playerZ);
  const selectedTerrain = WorldLayout.isSailable(selectedNode.worldPosition.x, selectedNode.worldPosition.z)
    ? "Water route"
    : WorldLayout.isWalkable(selectedNode.worldPosition.x, selectedNode.worldPosition.z)
      ? "Walkable ground"
      : "Outside traversable surface";

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <div className="world-map-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Regional Map">
        {/* Header with Lens Toggles */}
        <header className="map-modal-header">
          <div className="map-title-group">
            <span className="map-header-icon">🧭</span>
            <div>
              <h2 className="map-title">REGIONAL MARITIME & ECONOMIC MAP</h2>
              <span className="map-subtitle">Authored Coastline & Trade Corridors</span>
            </div>
          </div>

          <div className="map-lenses-bar" role="tablist" aria-label="Map lenses">
            {(["geography", "markets", "fishing", "farmland"] as MapLens[]).map((lens) => (
              <button
                key={lens}
                type="button"
                role="tab"
                aria-selected={activeLens === lens}
                className={`map-lens-btn ${activeLens === lens ? "is-active" : ""}`}
                onClick={() => setActiveLens(lens)}
              >
                {lens.charAt(0).toUpperCase() + lens.slice(1)}
              </button>
            ))}
          </div>

          <button type="button" className="map-close-btn" onClick={onClose} aria-label="Close map">
            ✕
          </button>
        </header>

        <div className="map-modal-content">
          {/* SVG Map Canvas */}
          <div className="map-canvas-container">
            <svg viewBox="0 0 1000 700" className="map-svg-canvas">
              {/* Island Landmass Shapes */}
              <defs>
                <radialGradient id="oceanGrad" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="#C2D9D2" />
                  <stop offset="100%" stopColor="#8EB6B4" />
                </radialGradient>
                <linearGradient id="terrainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#E8D8AE" />
                  <stop offset="100%" stopColor="#C7B47D" />
                </linearGradient>
              </defs>

              {/* Water Background */}
              <rect width="1000" height="700" fill="url(#oceanGrad)" />

              {/* Coastlines & Landmass */}
              <path
                d="M 120,200 C 160,80 340,60 500,80 C 680,100 820,140 860,280 C 900,420 840,620 680,660 C 500,700 280,680 180,600 C 80,500 80,320 120,200 Z"
                fill="url(#terrainGrad)"
                stroke="rgba(64, 58, 49, 0.42)"
                strokeWidth="3"
              />

              {/* River Arterial Channel */}
              <path
                d="M 480,120 Q 420,300 350,580 Q 300,640 220,660"
                fill="none"
                stroke="#3B7078"
                strokeWidth="16"
                strokeLinecap="round"
              />
              <path
                d="M 480,120 Q 420,300 350,580 Q 300,640 220,660"
                fill="none"
                stroke="#6B9EA0"
                strokeWidth="8"
                strokeLinecap="round"
              />

              {/* Canonical regional routes. Local farm paths stay in the world
                  network but are intentionally omitted at this map scale. */}
              {WORLD_ROUTES.map((route, index) => (
                <path
                  key={route.id}
                  d={worldRouteToMapSvgPath(WORLD_REGIONAL_PATHS[index])}
                  fill="none"
                  stroke={route.kind === "arterial" ? "rgba(118, 84, 49, 0.62)" : "rgba(118, 84, 49, 0.42)"}
                  strokeWidth={route.kind === "arterial" ? 5 : route.kind === "lane" ? 3.5 : 2.5}
                  strokeDasharray={route.kind === "trail" ? "6 5" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
                    onClick={() => setSelectedNodeId(node.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      cx={px}
                      cy={py}
                      r={isSelected ? 16 : 11}
                      fill={node.category === "village" ? "#B67B38" : node.category === "harbor" ? "#4D8790" : node.category === "farm" ? "#718761" : "#C48E3D"}
                      stroke="#FBF4DF"
                      strokeWidth={isSelected ? 3 : 1.5}
                      className="map-node-dot"
                    />

                    {/* Lens specific badges */}
                    {activeLens === "markets" && nodeMarketInsight && (
                      <g transform={`translate(${px + 14}, ${py - 8})`}>
                        <rect width="110" height="22" rx="4" fill="rgba(64, 58, 49, 0.9)" stroke="#B67B38" strokeWidth="1" />
                        <text x="6" y="15" fill="#FBF4DF" fontSize="11" fontWeight="bold">
                          {nodeMarketInsight.demandTrend}
                        </text>
                      </g>
                    )}

                    {activeLens === "fishing" && nodeFishingInsight && (
                      <g transform={`translate(${px + 14}, ${py - 8})`}>
                        <rect width="125" height="22" rx="4" fill="rgba(64, 58, 49, 0.9)" stroke="#4D8790" strokeWidth="1" />
                        <text x="6" y="15" fill="#A9D2CF" fontSize="11" fontWeight="bold">
                          🐟 {nodeFishingInsight.dominantSpecies.split(",")[0]}
                        </text>
                      </g>
                    )}

                    {activeLens === "farmland" && nodeFarm && (
                      <g transform={`translate(${px + 14}, ${py - 8})`}>
                        <rect width="120" height="22" rx="4" fill="rgba(64, 58, 49, 0.9)" stroke="#718761" strokeWidth="1" />
                        <text x="6" y="15" fill="#B8CB9D" fontSize="11" fontWeight="bold">
                          🌱 {nodeFarm.placedCropIds.length} plots
                        </text>
                      </g>
                    )}

                    <text
                      x={px}
                      y={py + 26}
                      fill="#403A31"
                      fontSize="12"
                      fontWeight="600"
                      textAnchor="middle"
                      className="map-node-text"
                    >
                      {node.name}
                    </text>
                  </g>
                );
              })}

              {/* Player Position Marker */}
              <g transform={`translate(${playerMapPosition.x}, ${playerMapPosition.y})`}>
                <circle r="9" fill="#B9684F" stroke="#FBF4DF" strokeWidth="2.5" />
                <circle r="18" fill="none" stroke="#B9684F" strokeWidth="1.5" opacity="0.6" className="player-pulse-ring" />
                <text y="-14" fill="#403A31" fontSize="11" fontWeight="bold" textAnchor="middle">
                  YOU
                </text>
              </g>
            </svg>
          </div>

          {/* Sidebar: Route & Logistics Planner */}
          <aside className="map-sidebar-details">
            <header className="sidebar-node-header">
              <span className="sidebar-category-badge">{selectedNode.category.toUpperCase()}</span>
              <h3 className="sidebar-node-name">{selectedNode.name}</h3>
            </header>

            {activeLens === "geography" && (
              <div className="sidebar-section">
                <h4>Route Planning</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>World distance from current:</span>
                    <strong>{Math.round(selectedDistance)} m</strong>
                  </div>
                  <div className="route-row">
                    <span>Surface:</span>
                    <span className="tag-safe">{selectedTerrain}</span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "markets" && selectedMarketInsight && (
              <div className="sidebar-section">
                <h4>Market Demand Overview</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>High Demand Commodity:</span>
                      <strong style={{ color: "#B67B38" }}>{selectedMarketInsight.demandItem}</strong>
                  </div>
                  <div className="route-row">
                    <span>Current unit price:</span>
                    <strong>{selectedMarketInsight.price}</strong>
                  </div>
                  <div className="route-row">
                    <span>Demand Movement:</span>
                    <span className="tag-up">{selectedMarketInsight.demand} ({selectedMarketInsight.demandTrend})</span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "fishing" && selectedFishingInsight && (
              <div className="sidebar-section">
                <h4>Marine & Fishing Conditions</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Salinity / Water:</span>
                      <strong>{selectedFishingInsight.waterType}</strong>
                  </div>
                  <div className="route-row">
                    <span>School Activity:</span>
                    <strong style={{ color: "#4D8790" }}>{selectedFishingInsight.activity}</strong>
                  </div>
                  <div className="route-row">
                    <span>Key Species:</span>
                    <span>{selectedFishingInsight.dominantSpecies}</span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "farmland" && selectedFarm && (
              <div className="sidebar-section">
                <h4>Agricultural Soil Profile</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Soil Fertility:</span>
                      <strong style={{ color: "#718761" }}>{Math.round(selectedFarm.soil.fertility)}%</strong>
                  </div>
                  <div className="route-row">
                    <span>Climate Type:</span>
                    <span>{selectedFarm.climateId}</span>
                  </div>
                  <div className="route-row">
                    <span>Active Land Plots:</span>
                    <strong>{selectedFarm.placedCropIds.length} Plots</strong>
                  </div>
                </div>
              </div>
            )}

            <div className="map-sidebar-tip">
              <IconWarning size={14} />
              <span>Transporting fresh fish over distance incurs spoilage unless packed with ice.</span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
