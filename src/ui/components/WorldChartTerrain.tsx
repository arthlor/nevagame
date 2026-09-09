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

export const WorldChartTerrain = React.memo(function WorldChartTerrain() {
  return <g className="guild-chart-terrain" aria-hidden="true">
    <rect x="0" y="0" width="1000" height="700" fill="#657f76" />
    <g stroke="#d9c393" strokeWidth=".5" opacity=".22">
      {Array.from({ length: 20 }, (_, i) => <path key={i} d={`M${i * 50},0 V700 M0,${i * 50} H1000`} />)}
    </g>
    {islands.map((island) => <path key={island.id} d={island.path}
      fill={island.id === "island.neva" ? "#c8bd8a" : "#d6bf8c"}
      stroke="#8f865e" strokeWidth="5" strokeLinejoin="round" />)}
    <path d={river} fill="#657f76" stroke="#9caa87" strokeWidth="1.5" />
    <g fill="#a39966" stroke="#81744f" strokeWidth=".7">
      {fields.map((field) => <g key={field.id}>
        <rect x={field.x} y={field.y} width={field.width} height={field.height} />
        {[.2, .4, .6, .8].map((fraction) => <path key={fraction}
          d={`M${field.x},${field.y + field.height * fraction} h${field.width}`} />)}
      </g>)}
    </g>
    {farmPaths.map((route) => <path key={route.id} d={route.path} fill="none" stroke="#aa8854" strokeWidth="1" />)}
    {routes.map((route) => <path key={route.id} d={route.path} fill="none"
      stroke={route.kind === "arterial" ? "#987342" : "#a58854"}
      strokeWidth={route.kind === "arterial" ? 3 : 1.5}
      strokeDasharray={route.kind === "trail" ? "3 3" : undefined}
      strokeLinecap="round" strokeLinejoin="round" />)}
  </g>;
});
