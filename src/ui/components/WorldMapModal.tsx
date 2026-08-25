// src/ui/components/WorldMapModal.tsx
import React, { useState } from "react";
import { GameState } from "../../simulation/core/types";
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
  x: number; // percentage on map SVG
  y: number;
  marketInfo?: {
    demandItem: string;
    demandTrend: string;
    priceMultiplier: string;
  };
  fishingInfo?: {
    waterType: string;
    activity: string;
    dominantSpecies: string;
  };
  farmlandInfo?: {
    fertility: string;
    climate: string;
    activePlots: number;
  };
}

const MAP_NODES: MapNode[] = [
  {
    id: "node_home_farm",
    name: "Starter Homestead & Yard",
    category: "farm",
    x: 22,
    y: 28,
    marketInfo: { demandItem: "Fish Scraps", demandTrend: "Steady", priceMultiplier: "100%" },
    farmlandInfo: { fertility: "Good (Moist Loam)", climate: "Temperate Maritime", activePlots: 4 }
  },
  {
    id: "node_uplands",
    name: "Northeast Plateau & Windmill",
    category: "farm",
    x: 68,
    y: 20,
    farmlandInfo: { fertility: "High (Volcanic Silt)", climate: "Breezy Upland", activePlots: 8 }
  },
  {
    id: "node_village",
    name: "Central Village & Market Hall",
    category: "village",
    x: 48,
    y: 45,
    marketInfo: { demandItem: "Wheat & Grain", demandTrend: "▲ +18%", priceMultiplier: "118%" }
  },
  {
    id: "node_river",
    name: "Silverwater River Corridor",
    category: "fishing",
    x: 35,
    y: 58,
    fishingInfo: { waterType: "Freshwater", activity: "High", dominantSpecies: "River Trout, Salmon" }
  },
  {
    id: "node_harbor",
    name: "Seabreak Harbor & Fish Market",
    category: "harbor",
    x: 75,
    y: 72,
    marketInfo: { demandItem: "Sport Fish & Shellfish", demandTrend: "▲ +28%", priceMultiplier: "128%" },
    fishingInfo: { waterType: "Coastal Saltwater", activity: "Very High", dominantSpecies: "Bluefin Tuna, Bass" }
  },
  {
    id: "node_lighthouse",
    name: "Southwest Cliffs & Lighthouse",
    category: "lighthouse",
    x: 18,
    y: 80,
    fishingInfo: { waterType: "Deep Coastal", activity: "Moderate", dominantSpecies: "Halibut, Cod" }
  },
  {
    id: "node_offshore",
    name: "Deep Sea Offshore Grounds",
    category: "fishing",
    x: 85,
    y: 88,
    fishingInfo: { waterType: "Open Saltwater", activity: "High (Chum Recommended)", dominantSpecies: "Blue Marlin, Tuna" }
  }
];

export const WorldMapModal: React.FC<WorldMapModalProps> = ({ state, onClose }) => {
  const [activeLens, setActiveLens] = useState<MapLens>("geography");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("node_village");

  const playerX = state.player.x;
  const playerZ = state.player.z;

  // Approximate player SVG coords from world coords (-100 to 100 range mapped to 15%..85%)
  const playerMapX = Math.max(10, Math.min(90, 50 + (playerX / 120) * 40));
  const playerMapY = Math.max(10, Math.min(90, 50 + (playerZ / 120) * 40));

  const selectedNode = MAP_NODES.find((n) => n.id === selectedNodeId) ?? MAP_NODES[0];

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
                  <stop offset="0%" stopColor="#182A30" />
                  <stop offset="100%" stopColor="#0E171A" />
                </radialGradient>
                <linearGradient id="terrainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#2D3B31" />
                  <stop offset="100%" stopColor="#202A24" />
                </linearGradient>
              </defs>

              {/* Water Background */}
              <rect width="1000" height="700" fill="url(#oceanGrad)" />

              {/* Coastlines & Landmass */}
              <path
                d="M 120,200 C 160,80 340,60 500,80 C 680,100 820,140 860,280 C 900,420 840,620 680,660 C 500,700 280,680 180,600 C 80,500 80,320 120,200 Z"
                fill="url(#terrainGrad)"
                stroke="rgba(243, 240, 230, 0.18)"
                strokeWidth="3"
              />

              {/* River Arterial Channel */}
              <path
                d="M 480,120 Q 420,300 350,580 Q 300,640 220,660"
                fill="none"
                stroke="#3E6B7A"
                strokeWidth="16"
                strokeLinecap="round"
              />
              <path
                d="M 480,120 Q 420,300 350,580 Q 300,640 220,660"
                fill="none"
                stroke="#5C94A6"
                strokeWidth="8"
                strokeLinecap="round"
              />

              {/* Roads / Arterials */}
              <path
                d="M 220,200 Q 340,320 480,315 T 750,500"
                fill="none"
                stroke="rgba(221, 168, 83, 0.35)"
                strokeWidth="4"
                strokeDasharray="6 4"
              />

              {/* Landmark Nodes */}
              {MAP_NODES.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const px = node.x * 10;
                const py = node.y * 7;
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
                      fill={node.category === "village" ? "#DDA853" : node.category === "harbor" ? "#5C94A6" : node.category === "farm" ? "#7EA874" : "#E6C364"}
                      stroke="#F3F0E6"
                      strokeWidth={isSelected ? 3 : 1.5}
                      className="map-node-dot"
                    />

                    {/* Lens specific badges */}
                    {activeLens === "markets" && node.marketInfo && (
                      <g transform={`translate(${px + 14}, ${py - 8})`}>
                        <rect width="110" height="22" rx="4" fill="rgba(21, 26, 23, 0.92)" stroke="#DDA853" strokeWidth="1" />
                        <text x="6" y="15" fill="#F3F0E6" fontSize="11" fontWeight="bold">
                          {node.marketInfo.demandTrend}
                        </text>
                      </g>
                    )}

                    {activeLens === "fishing" && node.fishingInfo && (
                      <g transform={`translate(${px + 14}, ${py - 8})`}>
                        <rect width="125" height="22" rx="4" fill="rgba(21, 26, 23, 0.92)" stroke="#5C94A6" strokeWidth="1" />
                        <text x="6" y="15" fill="#5C94A6" fontSize="11" fontWeight="bold">
                          🐟 {node.fishingInfo.dominantSpecies.split(",")[0]}
                        </text>
                      </g>
                    )}

                    {activeLens === "farmland" && node.farmlandInfo && (
                      <g transform={`translate(${px + 14}, ${py - 8})`}>
                        <rect width="120" height="22" rx="4" fill="rgba(21, 26, 23, 0.92)" stroke="#7EA874" strokeWidth="1" />
                        <text x="6" y="15" fill="#7EA874" fontSize="11" fontWeight="bold">
                          🌱 {node.farmlandInfo.activePlots} plots
                        </text>
                      </g>
                    )}

                    <text
                      x={px}
                      y={py + 26}
                      fill="#F3F0E6"
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
              <g transform={`translate(${playerMapX * 10}, ${playerMapY * 7})`}>
                <circle r="9" fill="#C86A58" stroke="#FFFFFF" strokeWidth="2.5" />
                <circle r="18" fill="none" stroke="#C86A58" strokeWidth="1.5" opacity="0.6" className="player-pulse-ring" />
                <text y="-14" fill="#FFFFFF" fontSize="11" fontWeight="bold" textAnchor="middle">
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
                    <span>Distance from Current:</span>
                    <strong>1.4 km</strong>
                  </div>
                  <div className="route-row">
                    <span>Est. Travel Time (Cart):</span>
                    <strong>2 min 10s</strong>
                  </div>
                  <div className="route-row">
                    <span>Terrain Condition:</span>
                    <span className="tag-safe">Paved Arterial</span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "markets" && selectedNode.marketInfo && (
              <div className="sidebar-section">
                <h4>Market Demand Overview</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>High Demand Commodity:</span>
                    <strong style={{ color: "#DDA853" }}>{selectedNode.marketInfo.demandItem}</strong>
                  </div>
                  <div className="route-row">
                    <span>Current Price Rate:</span>
                    <strong>{selectedNode.marketInfo.priceMultiplier}</strong>
                  </div>
                  <div className="route-row">
                    <span>Demand Movement:</span>
                    <span className="tag-up">{selectedNode.marketInfo.demandTrend}</span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "fishing" && selectedNode.fishingInfo && (
              <div className="sidebar-section">
                <h4>Marine & Fishing Conditions</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Salinity / Water:</span>
                    <strong>{selectedNode.fishingInfo.waterType}</strong>
                  </div>
                  <div className="route-row">
                    <span>School Activity:</span>
                    <strong style={{ color: "#5C94A6" }}>{selectedNode.fishingInfo.activity}</strong>
                  </div>
                  <div className="route-row">
                    <span>Key Species:</span>
                    <span>{selectedNode.fishingInfo.dominantSpecies}</span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "farmland" && selectedNode.farmlandInfo && (
              <div className="sidebar-section">
                <h4>Agricultural Soil Profile</h4>
                <div className="route-stat-card">
                  <div className="route-row">
                    <span>Soil Fertility:</span>
                    <strong style={{ color: "#7EA874" }}>{selectedNode.farmlandInfo.fertility}</strong>
                  </div>
                  <div className="route-row">
                    <span>Climate Type:</span>
                    <span>{selectedNode.farmlandInfo.climate}</span>
                  </div>
                  <div className="route-row">
                    <span>Active Land Plots:</span>
                    <strong>{selectedNode.farmlandInfo.activePlots} Plots</strong>
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
