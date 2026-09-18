import React from "react";
import { worldIslandDefinitions } from "../../world/WorldIslands";
import { WorldLayout, type WorldPoint } from "../../world/WorldLayout";
import { worldPointToMapSvg, worldRouteToMapSvgPath } from "../../world/WorldMapProjection";
import { NEVA_HEADWATERS } from "../../world/NevaHeadwaters";
import { STARTER_FARM_LAYOUT, PLAYER_HOMESTEAD_LAYOUT, SUNREACH_FARM_LAYOUT } from "../../world/FarmLayout";

// These paths are derived once from the authored world. They are shared by
// the chart and minimap, so neither map invents a second coastline or road.
const islands = worldIslandDefinitions().map((island) => ({
  id: island.id, path: `${worldRouteToMapSvgPath(island.coastLoop)} Z`
}));
const banks: [WorldPoint[], WorldPoint[]] = [[], []];
for (let z = NEVA_HEADWATERS.source.z; z <= 90; z += 2) {
  const section = WorldLayout.riverSectionAt(z);
  banks[0].push({ x: section.centerX - section.leftWaterWidth, z });
  banks[1].push({ x: section.centerX + section.rightWaterWidth, z });
}
const river = `${worldRouteToMapSvgPath([...banks[0], ...banks[1].reverse()])} Z`;
const routes = WorldLayout.routeDefinitions().filter((route) => route.scope === "regional")
  .map((route) => ({ id: route.id, kind: route.kind, path: worldRouteToMapSvgPath(route.points) }));
const farms = [STARTER_FARM_LAYOUT, PLAYER_HOMESTEAD_LAYOUT, SUNREACH_FARM_LAYOUT];
const fields = farms.flatMap((farm) => farm.plantableAreas.map((area, i) => {
  const a = worldPointToMapSvg({ x: farm.origin.x + area.minX, z: farm.origin.z + area.minZ });
  const b = worldPointToMapSvg({ x: farm.origin.x + area.maxX, z: farm.origin.z + area.maxZ });
  return { id: `${farm.farmId}-${i}`, x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}));
const farmPaths = farms.flatMap((farm) => farm.paths.map((route) => ({
  id: `${farm.farmId}-${route.id}`, path: worldRouteToMapSvgPath(route.points.map((p) => ({
    x: p.x + farm.origin.x, z: p.z + farm.origin.z
  })))
})));

// Precomputed medieval portolan rhumb navigation lines radiating from nautical windrose centers.
// Precomputed medieval portolan rhumb navigation lines radiating from nautical windrose centers.
const RHUMB_CENTERS = [
  { cx: 250, cy: 410, r: 170 },
  { cx: 760, cy: 300, r: 190 }
];

const RHUMB_RAYS = RHUMB_CENTERS.flatMap((center, cIdx) =>
  Array.from({ length: 16 }, (_, i) => {
    const angle = (i * Math.PI) / 8;
    const len = 1100;
    return {
      id: `rhumb-${cIdx}-${i}`,
      x1: center.cx,
      y1: center.cy,
      x2: Math.round(center.cx + Math.cos(angle) * len),
      y2: Math.round(center.cy + Math.sin(angle) * len),
      isCardinal: i % 4 === 0
    };
  })
);

export interface WorldChartTerrainProps {
  activeLens?: "geography" | "markets" | "fishing" | "farmland";
}

export const WorldChartTerrain = React.memo(function WorldChartTerrain({ activeLens = "geography" }: WorldChartTerrainProps) {
  return (
    <g className="guild-chart-terrain" aria-hidden="true">
      <defs>
        {/* Medieval sea gradient: deep charted nautical waters */}
        <radialGradient id="portolan-sea-depth" cx="48%" cy="48%" r="62%">
          <stop offset="0%" stopColor="#253730" />
          <stop offset="55%" stopColor="#1e2c26" />
          <stop offset="100%" stopColor="#15201b" />
        </radialGradient>

        {/* Parchment banner fill */}
        <linearGradient id="cartouche-parchment" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#faecd0" />
          <stop offset="100%" stopColor="#ddcaa0" />
        </linearGradient>

        {/* Fishing depth gradients */}
        <radialGradient id="fishing-estuary" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3ca676" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#253730" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ocean base */}
      <rect x="0" y="0" width="1000" height="700" fill="url(#portolan-sea-depth)" />

      {/* Medieval Portolan Rhumb Lines / Loxodromic Navigation Network */}
      <g className="chart-rhumb-lines" strokeLinecap="round">
        <line
          x1={RHUMB_CENTERS[0].cx}
          y1={RHUMB_CENTERS[0].cy}
          x2={RHUMB_CENTERS[1].cx}
          y2={RHUMB_CENTERS[1].cy}
          stroke="#d4af37"
          strokeWidth="1.2"
          strokeDasharray="6 4"
          opacity="0.32"
        />

        {RHUMB_RAYS.map((ray) => (
          <line
            key={ray.id}
            x1={ray.x1}
            y1={ray.y1}
            x2={ray.x2}
            y2={ray.y2}
            stroke={ray.isCardinal ? "#d4af37" : "#a88a4d"}
            strokeWidth={ray.isCardinal ? "0.8" : "0.5"}
            opacity={ray.isCardinal ? "0.2" : "0.12"}
          />
        ))}

        {RHUMB_CENTERS.map((center, i) => (
          <g key={`wind-ring-${i}`}>
            <circle
              cx={center.cx}
              cy={center.cy}
              r={center.r}
              fill="none"
              stroke="#d4af37"
              strokeWidth="0.6"
              strokeDasharray="4 6"
              opacity="0.18"
            />
            <circle
              cx={center.cx}
              cy={center.cy}
              r={center.r * 0.45}
              fill="none"
              stroke="#a88a4d"
              strokeWidth="0.5"
              strokeDasharray="2 4"
              opacity="0.14"
            />
            <circle cx={center.cx} cy={center.cy} r="3" fill="#8f743c" opacity="0.35" />
            <circle cx={center.cx} cy={center.cy} r="1" fill="#f5da96" opacity="0.6" />
          </g>
        ))}
      </g>

      {/* Coastal Bathymetric Depth & Stippled Reef Shoals */}
      <g className="chart-coastal-bathymetry">
        {islands.map((island) => (
          <path
            key={`shelf-deep-${island.id}`}
            d={island.path}
            fill="none"
            stroke="#2e443b"
            strokeWidth="24"
            strokeLinejoin="round"
            opacity="0.65"
          />
        ))}
        {islands.map((island) => (
          <path
            key={`shelf-shallow-${island.id}`}
            d={island.path}
            fill="none"
            stroke="#3a554a"
            strokeWidth="12"
            strokeLinejoin="round"
            opacity="0.75"
          />
        ))}
        {islands.map((island) => (
          <path
            key={`shoal-contour-${island.id}`}
            d={island.path}
            fill="none"
            stroke="#c9aa66"
            strokeWidth="1.8"
            strokeDasharray="3 4"
            strokeLinejoin="round"
            opacity="0.55"
          />
        ))}
      </g>

      {/* Islands Landmasses (Aged Portolan Vellum) */}
      <g className="chart-islands">
        {islands.map((island) => (
          <path
            key={island.id}
            d={island.path}
            fill={island.id === "island.neva" ? "#d5c8a4" : "#ded2b1"}
            stroke="#4a371c"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
        ))}
      </g>

      {/* Inked river waterways */}
      <path d={river} fill="#2a3d35" stroke="#4a371c" strokeWidth="1.8" strokeLinejoin="round" />

      {/* Farm plantable fields with medieval crop hatchings */}
      <g fill="#9e915e" stroke="#685532" strokeWidth="0.8">
        {fields.map((field) => (
          <g key={field.id}>
            <rect x={field.x} y={field.y} width={field.width} height={field.height} rx="1" />
            {[0.25, 0.5, 0.75].map((fraction) => (
              <path
                key={fraction}
                d={`M${field.x},${field.y + field.height * fraction} h${field.width}`}
                stroke="#544324"
                strokeWidth="0.6"
                strokeDasharray="2 1"
              />
            ))}
            {activeLens === "farmland" && (
              <rect
                x={field.x - 2}
                y={field.y - 2}
                width={field.width + 4}
                height={field.height + 4}
                fill="none"
                stroke="#7ea853"
                strokeWidth="1.2"
                strokeDasharray="3 2"
                opacity="0.8"
              />
            )}
          </g>
        ))}
      </g>

      {/* Farm paths */}
      {farmPaths.map((route) => (
        <path key={route.id} d={route.path} fill="none" stroke="#947442" strokeWidth="1.2" strokeDasharray="2 2" />
      ))}

      {/* Arterial roads and regional trails */}
      {routes.map((route) => (
        <path
          key={route.id}
          d={route.path}
          fill="none"
          stroke={route.kind === "arterial" ? "#8a7558" : "#9e8a6a"}
          strokeWidth={route.kind === "arterial" ? 1.8 : 1}
          strokeDasharray={route.kind === "trail" ? "3 3" : "5 4"}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
        />
      ))}

      {/* LENS OVERLAY: Trade Shipping Lanes (Markets Lens) */}
      {activeLens === "markets" && (
        <g className="chart-lens-markets">
          {/* Main Archipelago Shipping Lane between Neva Harbor and Sunreach Cove */}
          <path
            d="M 220 310 C 380 340, 520 420, 740 390"
            fill="none"
            stroke="#d4af37"
            strokeWidth="2.4"
            strokeDasharray="6 5"
            opacity="0.85"
          />
          {/* Directional trade flow chevron */}
          <polygon points="495,385 510,392 495,399" fill="#d4af37" opacity="0.9" />
          {/* Shipping Lane Banner */}
          <g transform="translate(480, 415)">
            <rect x="-85" y="-10" width="170" height="20" rx="3" fill="rgba(30, 22, 14, 0.9)" stroke="#c4a46a" strokeWidth="1" />
            <text x="0" y="4" fill="#f5da96" fontSize="9.5" fontWeight="bold" fontFamily="serif" textAnchor="middle">
              Channel Trade Lane · Arbitrage
            </text>
          </g>
        </g>
      )}

      {/* LENS OVERLAY: Depth Soundings & Habitat Zones (Fishing Lens) */}
      {activeLens === "fishing" && (
        <g className="chart-lens-fishing" opacity="0.75">
          {/* Estuary soundings */}
          <text x="210" y="275" fill="#a4cfbd" fontSize="9" fontFamily="serif" fontStyle="italic">6 fm</text>
          {/* Channel deep trench soundings */}
          <text x="480" y="320" fill="#75b2b8" fontSize="9" fontFamily="serif" fontStyle="italic">34 fm</text>
          <text x="560" y="480" fill="#75b2b8" fontSize="9" fontFamily="serif" fontStyle="italic">52 fm</text>
          <text x="820" y="450" fill="#a4cfbd" fontSize="9" fontFamily="serif" fontStyle="italic">14 fm</text>
        </g>
      )}

      {/* Mythical Sea Leviathan / Hic Sunt Dracones in Southwest Outer Deep */}
      <g className="chart-sea-monster" transform="translate(130, 570) scale(0.9)" opacity="0.45">
        {/* Stylized wave arcs */}
        <path d="M -50,15 Q -40,8 -30,15 Q -20,8 -10,15" fill="none" stroke="#7ea392" strokeWidth="1.2" />
        <path d="M 0,20 Q 15,12 30,20 Q 45,12 60,20" fill="none" stroke="#7ea392" strokeWidth="1.2" />
        <path d="M -30,30 Q -15,22 0,30 Q 15,22 30,30" fill="none" stroke="#7ea392" strokeWidth="1.2" />

        {/* Serpentine body coils */}
        <path
          d="M -35,12 C -30,-8 -15,-10 -10,12 C -5,28 10,26 15,10 C 20,-15 35,-18 42,8"
          fill="none"
          stroke="#42301c"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Dorsal spines */}
        <polygon points="-22,-5 -20,-12 -17,-4" fill="#694d2d" />
        <polygon points="26,-7 29,-15 32,-6" fill="#694d2d" />

        {/* Dragon head */}
        <path d="M 42,8 C 45,2 52,2 54,6 C 56,10 50,14 44,12 Z" fill="#42301c" />
        <circle cx="49" cy="5" r="1" fill="#f5da96" />

        {/* Tail fin */}
        <path d="M -35,12 C -42,16 -48,10 -46,6 C -44,10 -38,11 -35,12 Z" fill="#694d2d" />

        {/* Inscription banner */}
        <text x="0" y="48" fill="#a48c66" fontSize="10" fontFamily="serif" fontStyle="italic" textAnchor="middle" letterSpacing="0.08em">
          Hic sunt dracones
        </text>
      </g>

      {/* Engraved Maritime Title Cartouche */}
      <g className="chart-cartouche" transform="translate(500, 36)">
        {/* Cartouche parchment scroll */}
        <path
          d="M -130,-16 L 130,-16 C 142,-16 148,-10 148,0 C 148,10 142,16 130,16 L -130,16 C -142,16 -148,10 -148,0 C -148,-10 -142,-16 -130,-16 Z"
          fill="url(#cartouche-parchment)"
          stroke="#856837"
          strokeWidth="1.6"
        />
        <rect x="-124" y="-12" width="248" height="24" fill="none" stroke="#bfa369" strokeWidth="0.8" strokeDasharray="3 2" />
        {/* Ornate curled ribbon tails */}
        <path d="M -148,0 L -162,-8 L -156,0 L -162,8 Z" fill="#c4aa76" stroke="#856837" strokeWidth="1" />
        <path d="M 148,0 L 162,-8 L 156,0 L 162,8 Z" fill="#c4aa76" stroke="#856837" strokeWidth="1" />

        {/* Classical title typography */}
        <text y="-1" fill="#2c1d10" fontSize="11" fontWeight="bold" fontFamily="serif" textAnchor="middle" letterSpacing="0.14em">
          ARCHIPELAGUS NEVENSIS
        </text>
        <text y="9.5" fill="#6e502c" fontSize="6.8" fontStyle="italic" fontFamily="serif" textAnchor="middle" letterSpacing="0.08em">
          TABULA HYDROGRAPHICA ET NAUTICA
        </text>
      </g>

      {/* Quad-Fold Parchment Creases Overlay */}
      <g className="chart-parchment-creases" opacity="0.6">
        {/* Horizontal fold line */}
        <line x1="0" y1="350" x2="1000" y2="350" stroke="rgba(15, 10, 5, 0.22)" strokeWidth="1" />
        <line x1="0" y1="351" x2="1000" y2="351" stroke="rgba(255, 252, 238, 0.16)" strokeWidth="0.8" />

        {/* Vertical fold line */}
        <line x1="500" y1="0" x2="500" y2="700" stroke="rgba(15, 10, 5, 0.22)" strokeWidth="1" />
        <line x1="501" y1="0" x2="501" y2="700" stroke="rgba(255, 252, 238, 0.16)" strokeWidth="0.8" />

        {/* Center fold crease wear */}
        <circle cx="500" cy="350" r="14" fill="rgba(15, 10, 5, 0.08)" />
      </g>

      {/* Graticule Border Rulers / Nautical Neatline */}
      <g className="chart-graticule-border">
        {/* Outer and inner framing */}
        <rect x="4" y="4" width="992" height="692" fill="none" stroke="#4a371c" strokeWidth="1.8" />
        <rect x="11" y="11" width="978" height="678" fill="none" stroke="#8c7042" strokeWidth="0.8" />

        {/* Corner degree medallions */}
        <text x="8" y="22" fill="#d4af37" fontSize="8" fontFamily="serif" fontWeight="bold">34°N</text>
        <text x="968" y="22" fill="#d4af37" fontSize="8" fontFamily="serif" fontWeight="bold">34°N</text>
        <text x="8" y="684" fill="#d4af37" fontSize="8" fontFamily="serif" fontWeight="bold">12°W</text>
        <text x="968" y="684" fill="#d4af37" fontSize="8" fontFamily="serif" fontWeight="bold">12°W</text>
      </g>
    </g>
  );
});
