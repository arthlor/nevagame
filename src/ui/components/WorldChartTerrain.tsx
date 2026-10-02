import React from "react";
import { worldIslandDefinitions } from "../../world/WorldIslands";
import { WorldLayout, type WorldPoint } from "../../world/WorldLayout";
import { worldPointToMapSvg, worldRouteToMapSvgPath } from "../../world/WorldMapProjection";
import { NEVA_HEADWATERS } from "../../world/NevaHeadwaters";
import { mainlandBrookCourses } from "../../world/MainlandBrooks";
import { MAINLAND_LAKE, MAINLAND_RIVER } from "../../world/NevaMainland";
import { WORLD_SAILING_ROUTES } from "../../world/WorldMoorings";
import { WORLD_MAP_PROJECTION } from "../../world/WorldMapProjection";
import { STARTER_FARM_LAYOUT, PLAYER_HOMESTEAD_LAYOUT, SUNREACH_FARM_LAYOUT } from "../../world/FarmLayout";
import { WORLD_CHART_NODES, type WorldChartNode } from "../../world/WorldGameplayLocations";

/** Drawn chart. One painted sheet, ink coast, and stamped illustrations. No SVG filters. */
const INK = "#3a342c";
const SEA = "#8aa6b0";
const FIELD = "#c6aa62";
const FURROW = "#7d6840";
const DIRT = "#f6edd6";
const DIRT_EDGE = "#8d7350";
const CHART_SEA_SHEET = "/ui-chart/sea.jpg";
const CHART_MEADOW_SHEET = "/ui-chart/meadow.jpg";

const CHART_ART = {
  leafy: "/assets/ui/chart/leafy.png",
  pine: "/assets/ui/chart/pine.png",
  ridge: "/assets/ui/chart/ridge.png",
  hamlet: "/assets/ui/chart/hamlet.png",
  barn: "/assets/ui/chart/barn.png",
  harbor: "/assets/ui/chart/harbor.png",
  lighthouse: "/assets/ui/chart/lighthouse.png",
  mill: "/assets/ui/chart/mill.png"
} as const;

type ChartStamp = keyof typeof CHART_ART;

// Island definitions and terrain geometry derived once from the authored world.
const islands = worldIslandDefinitions().map((island) => ({
  id: island.id,
  path: `${worldRouteToMapSvgPath(island.coastLoop)} Z`
}));

const banks: [WorldPoint[], WorldPoint[]] = [[], []];
for (let z = NEVA_HEADWATERS.source.z; z <= 90; z += 2) {
  const section = WorldLayout.riverSectionAt(z);
  banks[0].push({ x: section.centerX - section.leftWaterWidth, z });
  banks[1].push({ x: section.centerX + section.rightWaterWidth, z });
}
const river = `${worldRouteToMapSvgPath([...banks[0], ...banks[1].reverse()])} Z`;
const mainlandRiver = worldRouteToMapSvgPath(MAINLAND_RIVER);

const brooks = mainlandBrookCourses().map((course) => ({
  id: course.id,
  path: worldRouteToMapSvgPath(course.knots.map(([x, z]) => ({ x, z }))),
  width: Math.min(0.7, 0.28 + Math.sqrt(course.knots[course.knots.length - 1][3]) * 0.12)
}));

const mainlandLake = worldPointToMapSvg(MAINLAND_LAKE.center);

const soundings = [MAINLAND_RIVER[0], MAINLAND_RIVER[3], { x: -250, z: 300 }, { x: 500, z: 325 }].map((point) => ({
  ...worldPointToMapSvg(point),
  depth: Math.max(0, -WorldLayout.terrainHeight(point.x, point.z)).toFixed(1)
}));

const chartRoutes = WorldLayout.compiledRouteNetwork();
const routes = chartRoutes
  .filter(({ route }) => route.scope === "regional")
  .map(({ route, samples }) => ({
    id: route.id,
    kind: route.kind,
    path: worldRouteToMapSvgPath(samples.map(({ point }) => point))
  }));

const farms = [STARTER_FARM_LAYOUT, PLAYER_HOMESTEAD_LAYOUT, SUNREACH_FARM_LAYOUT];
const fields = farms.flatMap((farm) =>
  farm.plantableAreas.map((area, i) => {
    const a = worldPointToMapSvg({ x: farm.origin.x + area.minX, z: farm.origin.z + area.minZ });
    const b = worldPointToMapSvg({ x: farm.origin.x + area.maxX, z: farm.origin.z + area.maxZ });
    return { id: `${farm.farmId}-${i}`, x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  })
);

const farmPaths = chartRoutes
  .filter(({ route }) => route.scope === "farmstead")
  .map(({ route, samples }) => ({
    id: route.id,
    path: worldRouteToMapSvgPath(samples.map(({ point }) => point))
  }));

const MAINLAND_RIVER_HALF_METERS = 7;

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function inChartChannel(point: WorldPoint): boolean {
  const lake = MAINLAND_LAKE;
  if (Math.hypot((point.x - lake.center.x) / lake.radiusX, (point.z - lake.center.z) / lake.radiusZ) <= 1) return true;
  for (let i = 1; i < MAINLAND_RIVER.length; i += 1) {
    const a = MAINLAND_RIVER[i - 1];
    const b = MAINLAND_RIVER[i];
    if (distanceToSegment(point.x, point.z, a.x, a.z, b.x, b.z) <= MAINLAND_RIVER_HALF_METERS) return true;
  }
  return point.z >= NEVA_HEADWATERS.source.z - 4
    && point.z <= 92
    && WorldLayout.riverWaterSignedDistance(point.x, point.z) > 0.8;
}

/** Short decks where a road actually crosses a channel, so the track does not paint through the water. */
const chartBridges = chartRoutes.flatMap(({ route, samples }) => {
  if (route.kind === "trail") return [];
  const points = samples.map(({ point }) => point);
  const spans: { id: string; path: string }[] = [];
  let wetStart = -1;
  const closeSpan = (end: number) => {
    if (wetStart <= 0 || end >= points.length) return;
    const from = points[wetStart - 1];
    const to = points[end];
    const span = Math.hypot(to.x - from.x, to.z - from.z);
    if (span < 4 || span > 36) return;
    spans.push({ id: `${route.id}-${wetStart}`, path: worldRouteToMapSvgPath([from, to]) });
  };
  for (let i = 0; i < points.length; i += 1) {
    const wet = inChartChannel(points[i]);
    if (wet && wetStart < 0) wetStart = i;
    if (!wet && wetStart >= 0) {
      closeSpan(i);
      wetStart = -1;
    }
  }
  return spans;
});

/** A few hatched ranges standing in for the old field of triangle peaks. */
interface RidgeMark {
  cx: number;
  cy: number;
  w: number;
  h: number;
  snow?: boolean;
}

const RIDGES: readonly RidgeMark[] = [
  { cx: 242, cy: 170, w: 86, h: 46, snow: true },
  { cx: 186, cy: 190, w: 52, h: 32, snow: true },
  { cx: 324, cy: 182, w: 64, h: 36, snow: true },
  { cx: 150, cy: 236, w: 42, h: 30 },
  { cx: 126, cy: 318, w: 36, h: 26 },
  { cx: 140, cy: 424, w: 40, h: 28 },
  { cx: 228, cy: 542, w: 72, h: 30 },
  { cx: 832, cy: 356, w: 38, h: 20 }
];

/** Indexes drawn on the minimap. The open chart draws the full set. */
const MINIMAL_RIDGE_INDEXES = new Set([0, 3, 6, 7]);

/** Grove anchors. Each one instances a shared clump symbol rather than its own polygons. */
interface ForestTree {
  cx: number;
  cy: number;
  type: "pine" | "leafy";
  w: number;
  h: number;
}

const FOREST_GROVES: readonly ForestTree[] = [
  // Pinewatch Great Forest (around lake and western foothills)
  { cx: 165, cy: 275, type: "pine", w: 9, h: 14 },
  { cx: 178, cy: 268, type: "pine", w: 8, h: 13 },
  { cx: 192, cy: 282, type: "pine", w: 10, h: 15 },
  { cx: 205, cy: 270, type: "pine", w: 8, h: 12 },
  { cx: 218, cy: 285, type: "pine", w: 9, h: 14 },
  { cx: 232, cy: 275, type: "pine", w: 8, h: 13 },
  { cx: 155, cy: 310, type: "pine", w: 9, h: 14 },
  { cx: 170, cy: 325, type: "pine", w: 10, h: 15 },
  { cx: 185, cy: 340, type: "pine", w: 8, h: 13 },
  { cx: 202, cy: 320, type: "pine", w: 9, h: 14 },
  { cx: 216, cy: 335, type: "pine", w: 10, h: 15 },
  { cx: 230, cy: 315, type: "pine", w: 8, h: 12 },
  { cx: 245, cy: 330, type: "pine", w: 9, h: 14 },
  { cx: 160, cy: 355, type: "pine", w: 8, h: 13 },
  { cx: 175, cy: 370, type: "pine", w: 10, h: 15 },
  { cx: 190, cy: 360, type: "pine", w: 9, h: 14 },
  { cx: 206, cy: 375, type: "pine", w: 8, h: 12 },
  { cx: 222, cy: 355, type: "pine", w: 9, h: 14 },
  { cx: 236, cy: 370, type: "pine", w: 8, h: 13 },
  { cx: 250, cy: 352, type: "pine", w: 10, h: 15 },
  { cx: 180, cy: 395, type: "pine", w: 9, h: 14 },
  { cx: 195, cy: 410, type: "pine", w: 8, h: 13 },
  { cx: 212, cy: 396, type: "pine", w: 10, h: 15 },

  // River Valley Woodlands & Copses
  { cx: 268, cy: 338, type: "pine", w: 8, h: 13 },
  { cx: 282, cy: 352, type: "leafy", w: 10, h: 12 },
  { cx: 296, cy: 334, type: "leafy", w: 9, h: 11 },
  { cx: 312, cy: 348, type: "pine", w: 8, h: 13 },
  { cx: 276, cy: 382, type: "leafy", w: 10, h: 12 },
  { cx: 306, cy: 378, type: "leafy", w: 9, h: 11 },

  // Homestead & Farm Orchard Copses
  { cx: 346, cy: 318, type: "leafy", w: 9, h: 11 },
  { cx: 362, cy: 328, type: "leafy", w: 10, h: 12 },
  { cx: 376, cy: 314, type: "leafy", w: 8, h: 10 },
  { cx: 392, cy: 324, type: "leafy", w: 9, h: 11 },
  { cx: 338, cy: 366, type: "leafy", w: 9, h: 11 },
  { cx: 354, cy: 374, type: "leafy", w: 10, h: 12 },

  // Sunreach scrub, kept on the island rather than the old sea coordinates.
  { cx: 784, cy: 394, type: "pine", w: 8, h: 12 },
  { cx: 808, cy: 410, type: "leafy", w: 9, h: 11 },
  { cx: 848, cy: 390, type: "leafy", w: 8, h: 10 },
  { cx: 832, cy: 418, type: "pine", w: 7, h: 11 }
];

function placeArt(node: WorldChartNode): { kind: ChartStamp; w: number; h: number } | null {
  const id = node.id;
  if (node.kind === "water" || id === "chart.sunreach_ridge") return null;
  if (id === "chart.neva_lighthouse") return { kind: "lighthouse", w: 18, h: 40 };
  if (id === "chart.island.lantern") return { kind: "lighthouse", w: 14, h: 30 };
  if (id === "chart.neva_mill") return { kind: "mill", w: 28, h: 26 };
  if (node.kind === "dock") return { kind: "harbor", w: 46, h: 34 };
  if (id === "chart.island.driftwood") return { kind: "harbor", w: 28, h: 22 };
  if (node.kind === "farm") return { kind: "barn", w: 32, h: 28 };
  if (node.kind === "market") return { kind: "hamlet", w: 40, h: 34 };
  if (id === "chart.island.gull_rest") return { kind: "hamlet", w: 24, h: 20 };
  return null;
}

const placeStamps = WORLD_CHART_NODES.flatMap((node) => {
  const art = placeArt(node);
  if (!art) return [];
  const at = worldPointToMapSvg(node.position);
  return [{ id: node.id, ...art, x: at.x, y: at.y }];
});

export interface WorldChartTerrainProps {
  activeLens?: "geography" | "markets" | "fishing" | "farmland";
  minimal?: boolean;
}

/**
 * Illustrated chart shared by the world map and the minimap.
 * Coasts, water and roads stay on the authored paths. Trees, ridges and
 * buildings are a few ink stamps. `minimal` skips brooks, fields, buildings
 * and most of the clumps so the HUD map stays light.
 */
export const WorldChartTerrain = React.memo(function WorldChartTerrain({
  activeLens = "geography",
  minimal = false
}: WorldChartTerrainProps) {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const art = (kind: ChartStamp) => `#${uid}-${kind}`;

  return (
    <g className="guild-chart-terrain" aria-hidden="true">
      <defs>
        <clipPath id={`${uid}-land`}>
          {islands.map((island) => (
            <path key={island.id} d={island.path} />
          ))}
        </clipPath>
        <radialGradient id={`${uid}-edge`} cx="50%" cy="46%" r="72%">
          <stop offset="64%" stopColor="#2a3330" stopOpacity="0" />
          <stop offset="100%" stopColor="#2a3330" stopOpacity="0.14" />
        </radialGradient>
        {(Object.keys(CHART_ART) as ChartStamp[]).map((kind) => (
          <symbol key={kind} id={`${uid}-${kind}`} viewBox="0 0 100 100" overflow="visible">
            <image href={CHART_ART[kind]} width="100" height="100" preserveAspectRatio="xMidYMax meet" />
          </symbol>
        ))}
      </defs>

      <image
        href={CHART_SEA_SHEET}
        x="0"
        y="0"
        width="1000"
        height="700"
        preserveAspectRatio="none"
      />
      <image
        href={CHART_MEADOW_SHEET}
        x="0"
        y="0"
        width="1000"
        height="700"
        preserveAspectRatio="none"
        clipPath={`url(#${uid}-land)`}
      />
      <g className="chart-islands" fill="none">
        {islands.map((island) => (
          <path
            key={island.id}
            d={island.path}
            stroke={INK}
            strokeWidth={minimal ? 1.5 : 2.1}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </g>

      {!minimal && (
        <g className="chart-fields">
          {fields.map((field) => (
            <g key={field.id}>
              <rect
                x={field.x}
                y={field.y}
                width={field.width}
                height={field.height}
                fill={FIELD}
                fillOpacity="0.28"
                stroke={INK}
                strokeWidth="0.4"
                strokeOpacity="0.35"
              />
              <line
                x1={field.x + 1}
                y1={field.y + field.height * 0.38}
                x2={field.x + field.width - 1}
                y2={field.y + field.height * 0.38}
                stroke={FURROW}
                strokeWidth="0.35"
                strokeOpacity="0.45"
              />
              <line
                x1={field.x + 1}
                y1={field.y + field.height * 0.68}
                x2={field.x + field.width - 1}
                y2={field.y + field.height * 0.68}
                stroke={FURROW}
                strokeWidth="0.35"
                strokeOpacity="0.45"
              />
              {activeLens === "farmland" && (
                <rect
                  x={field.x - 2}
                  y={field.y - 2}
                  width={field.width + 4}
                  height={field.height + 4}
                  fill="none"
                  stroke="#5f7a3a"
                  strokeWidth="1.1"
                  strokeDasharray="3 2"
                />
              )}
            </g>
          ))}
        </g>
      )}

      <g className="chart-ridges" clipPath={`url(#${uid}-land)`}>
        {RIDGES.map((ridge, idx) => {
          if (minimal && !MINIMAL_RIDGE_INDEXES.has(idx)) return null;
          const w = ridge.w * 1.35;
          const h = ridge.h * 1.45;
          return (
            <use
              key={`ridge-${idx}`}
              href={art("ridge")}
              x={ridge.cx - w / 2}
              y={ridge.cy - h}
              width={w}
              height={h}
            />
          );
        })}
      </g>

      <g className="chart-forest-groves" clipPath={`url(#${uid}-land)`}>
        {FOREST_GROVES.map((tree, idx) => {
          if (minimal ? idx % 3 !== 0 : idx % 2 !== 0) return null;
          const width = tree.w * (minimal ? 2.2 : 2.35);
          const height = tree.h * (tree.type === "pine" ? (minimal ? 1.6 : 1.75) : minimal ? 1.4 : 1.5);
          return (
            <use
              key={`tree-${idx}`}
              href={art(tree.type === "pine" ? "pine" : "leafy")}
              x={tree.cx - width / 2}
              y={tree.cy - height}
              width={width}
              height={height}
            />
          );
        })}
      </g>

      {!minimal && (
        <g className="chart-brooks" fill="none" stroke={SEA} strokeLinecap="round" strokeLinejoin="round" opacity="0.38">
          {brooks.map((brook) => (
            <path key={brook.id} d={brook.path} strokeWidth={brook.width} />
          ))}
        </g>
      )}

      {farmPaths.map((route) =>
        minimal ? (
          <path
            key={route.id}
            d={route.path}
            fill="none"
            stroke={INK}
            strokeWidth="0.55"
            strokeDasharray="2 2"
            strokeLinecap="round"
            opacity="0.32"
          />
        ) : (
          <path
            key={route.id}
            d={route.path}
            fill="none"
            stroke={DIRT}
            strokeWidth="1.05"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.4"
          />
        )
      )}
      {routes.map((route) => {
        if (route.kind === "trail") {
          return (
            <path
              key={route.id}
              d={route.path}
              fill="none"
              stroke={INK}
              strokeWidth={minimal ? 0.45 : 0.5}
              strokeDasharray="2.5 3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={minimal ? 0.28 : 0.32}
            />
          );
        }
        const arterial = route.kind === "arterial";
        const width = minimal ? (arterial ? 1.45 : 0.85) : arterial ? 3.5 : 1.35;
        return (
          <g key={route.id}>
            {!minimal && arterial && (
              <path
                d={route.path}
                fill="none"
                stroke={DIRT_EDGE}
                strokeWidth={width + 0.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.28"
              />
            )}
            <path
              d={route.path}
              fill="none"
              stroke={minimal ? DIRT_EDGE : DIRT}
              strokeWidth={width}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={minimal ? 0.5 : arterial ? 0.94 : 0.5}
            />
          </g>
        );
      })}

      <path d={river} fill={SEA} stroke={INK} strokeWidth={minimal ? 0.8 : 1.15} strokeLinejoin="round" />
      <path
        d={mainlandRiver}
        fill="none"
        stroke={INK}
        strokeWidth={14 * WORLD_MAP_PROJECTION.scaleX + (minimal ? 0.8 : 1.4)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={mainlandRiver}
        fill="none"
        stroke={SEA}
        strokeWidth={14 * WORLD_MAP_PROJECTION.scaleX}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <ellipse
        cx={mainlandLake.x}
        cy={mainlandLake.y}
        rx={MAINLAND_LAKE.radiusX * WORLD_MAP_PROJECTION.scaleX}
        ry={MAINLAND_LAKE.radiusZ * WORLD_MAP_PROJECTION.scaleZ}
        fill={SEA}
        stroke={INK}
        strokeWidth="1.05"
      />
      {chartBridges.map((bridge) => (
        <g key={bridge.id}>
          <path d={bridge.path} fill="none" stroke={INK} strokeWidth="2.1" strokeLinecap="round" opacity="0.55" />
          <path d={bridge.path} fill="none" stroke={DIRT} strokeWidth="1.25" strokeLinecap="round" />
        </g>
      ))}

      {!minimal && (
        <g className="chart-places">
          {placeStamps.map((stamp) => (
            <use
              key={stamp.id}
              href={art(stamp.kind)}
              x={stamp.x - stamp.w / 2}
              y={stamp.y - stamp.h}
              width={stamp.w}
              height={stamp.h}
            />
          ))}
        </g>
      )}

      {!minimal && activeLens === "markets" && (
        <g className="chart-lens-markets">
          {WORLD_SAILING_ROUTES.map((route) => (
            <path
              key={route.id}
              d={worldRouteToMapSvgPath(route.points)}
              fill="none"
              stroke="#8a6230"
              strokeWidth="1.6"
              strokeDasharray="5 4"
              strokeLinecap="round"
              opacity={0.8}
            />
          ))}
        </g>
      )}

      {!minimal && activeLens === "fishing" && (
        <g className="chart-lens-fishing" opacity={0.9}>
          {soundings.map((point) => (
            <text
              key={`${point.x},${point.y}`}
              x={point.x + 4}
              y={point.y}
              fill={INK}
              fontSize="8.5"
              fontFamily="serif"
              fontStyle="italic"
            >
              {point.depth} m
            </text>
          ))}
        </g>
      )}
      <rect x="0" y="0" width="1000" height="700" fill={`url(#${uid}-edge)`} pointerEvents="none" />
    </g>
  );
});
