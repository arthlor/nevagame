import React from "react";
import type { WorldHudDto } from "../../simulation/core/contracts";
import { WORLD_CHART_NODES } from "../../world/WorldGameplayLocations";
import { worldPointToMapSvg, worldPointToMapSvgUnclamped } from "../../world/WorldMapProjection";
import { WorldChartTerrain } from "../components/WorldChartTerrain";
import { GuildcraftArt } from "./GuildcraftArt";
import { placeLabel } from "../../i18n/placesTr";
import { useTranslation } from "../../i18n/useTranslation";

/** Chart units from the player before a mark falls outside the dial. */
const VIEW_RADIUS = 76;
/** Where an out-of-view pin parks as a directional rim chevron. */
const RIM_RADIUS = 66;

const QuestMark: React.FC<{ x: number; y: number; focused: boolean }> = ({ x, y, focused }) => (
  <g transform={`translate(${x},${y})`}>
    <path
      d="M0 -6 L4.5 0 L0 6 L-4.5 0 Z"
      fill={focused ? "#ffd700" : "#d8be82"}
      stroke="#3b2b0a"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    {focused && <circle r="1.5" fill="#fffdf5" />}
  </g>
);

const QuestChevron: React.FC<{ x: number; y: number; angleDeg: number; focused: boolean }> = ({
  x,
  y,
  angleDeg,
  focused
}) => (
  <g transform={`translate(${x},${y}) rotate(${angleDeg})`}>
    <path
      d="M0 -6.5 L4.5 3.5 L0 1.2 L-4.5 3.5 Z"
      fill={focused ? "#ffd700" : "#d8be82"}
      stroke="#3b2b0a"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </g>
);

const WaypointMark: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x},${y})`}>
    <circle r="4.5" fill="#9e3223" stroke="#ffd700" strokeWidth="1.2" />
    <circle r="1.5" fill="#fff5d0" />
  </g>
);

const WaypointChevron: React.FC<{ x: number; y: number; angleDeg: number }> = ({ x, y, angleDeg }) => (
  <g transform={`translate(${x},${y}) rotate(${angleDeg})`}>
    <path d="M0 -6.5 L4.2 3.5 L0 1 L-4.2 3.5 Z" fill="#e85d43" stroke="#3b1d16" strokeWidth="1.1" strokeLinejoin="round" />
  </g>
);

// Major settlement anchors shown as subtle dots on the minimap
const MAJOR_MINIMAP_ANCHORS = new Set([
  "chart.neva_harbor",
  "chart.neva_village",
  "chart.neva_farm",
  "chart.neva_homestead",
  "chart.sunreach_cove",
  "chart.sunreach_terraces"
]);

export const WorldMinimap: React.FC<{
  player: { x: number; z: number };
  compass: WorldHudDto["compass"];
  onOpenMap?: () => void;
}> = ({ player, compass, onOpenMap }) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const region = placeLabel(compass.subRegionTitle, locale);
  const at = worldPointToMapSvg(player);

  const questMarkers = compass.nearbyMarkers.filter(
    (marker) => marker.kind === "quest" || marker.kind === "quest-secondary"
  );
  const waypointMarker = compass.nearbyMarkers.find((marker) => marker.kind === "waypoint");
  const questName = questMarkers[0] ? placeLabel(questMarkers[0].label, locale) : "";
  const questLabel = questMarkers[0]
    ? isTr
      ? ` Hedef ${questName}, ${questMarkers[0].distanceMeters} metre.`
      : ` Objective ${questMarkers[0].label}, ${questMarkers[0].distanceMeters} metres.`
    : "";
  const waypointLabel = waypointMarker
    ? isTr
      ? ` İşaret ${waypointMarker.distanceMeters} metre.`
      : ` Waypoint ${waypointMarker.distanceMeters} metres.`
    : "";

  return (
    <button
      type="button"
      disabled={!onOpenMap}
      className="guild-minimap"
      data-testid="world-minimap"
      onClick={onOpenMap}
      aria-label={`${
        onOpenMap
          ? isTr
            ? "Haritayı aç. "
            : "Open chart. "
          : isTr
          ? "Bulunduğun yer. "
          : "Current position. "
      }${region}.${questLabel}${waypointLabel}`}
      title={`${region}${onOpenMap ? (isTr ? " · Harita (M)" : " · Chart (M)") : ""}`}
    >
      <svg
        className="guild-minimap-chart"
        viewBox={`${at.x - 84} ${at.y - 84} 168 168`}
        aria-hidden="true"
        focusable="false"
      >
        {/* Lightweight minimal terrain for optimal 60fps rendering */}
        <WorldChartTerrain minimal />

        {/* Subtle key landmark dots (clean, no image clutter) */}
        {WORLD_CHART_NODES.map((node) => {
          if (!MAJOR_MINIMAP_ANCHORS.has(node.id)) return null;
          const p = worldPointToMapSvg(node.position);
          if (Math.hypot(p.x - at.x, p.y - at.y) > VIEW_RADIUS) return null;
          return (
            <circle
              key={node.id}
              cx={p.x}
              cy={p.y}
              r="2.5"
              fill="#fdf7e7"
              stroke="#5c4427"
              strokeWidth="1"
              opacity="0.85"
            />
          );
        })}

        {/* Feeding fish schools: gentle subtle water ripple dots */}
        {compass.nearbyMarkers
          .filter((marker) => marker.kind === "fish-school")
          .map((marker) => {
            const p = worldPointToMapSvg(marker);
            return Math.hypot(p.x - at.x, p.y - at.y) > VIEW_RADIUS ? null : (
              <circle
                key={marker.id}
                cx={p.x}
                cy={p.y}
                r="3"
                fill="#3ca092"
                stroke="#edf4f2"
                strokeWidth="0.8"
                opacity="0.8"
              />
            );
          })}

        {/* Custom Waypoint beacon or edge chevron */}
        {waypointMarker &&
          (() => {
            const p = worldPointToMapSvgUnclamped(waypointMarker);
            const origin = worldPointToMapSvgUnclamped(player);
            const dx = p.x - origin.x;
            const dy = p.y - origin.y;
            const distance = Math.hypot(dx, dy);
            if (distance <= VIEW_RADIUS) {
              return <WaypointMark key={waypointMarker.id} x={p.x} y={p.y} />;
            }
            const scale = RIM_RADIUS / (distance || 1);
            const angleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
            return (
              <WaypointChevron
                key={waypointMarker.id}
                x={at.x + dx * scale}
                y={at.y + dy * scale}
                angleDeg={angleDeg}
              />
            );
          })()}

        {/* Objective Quest Markers */}
        {questMarkers.map((marker) => {
          const p = worldPointToMapSvgUnclamped(marker);
          const origin = worldPointToMapSvgUnclamped(player);
          const dx = p.x - origin.x;
          const dy = p.y - origin.y;
          const distance = Math.hypot(dx, dy);
          const focused = marker.kind === "quest";
          if (distance <= VIEW_RADIUS) {
            return <QuestMark key={marker.id} x={p.x} y={p.y} focused={focused} />;
          }
          const scale = RIM_RADIUS / (distance || 1);
          const angleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
          return (
            <QuestChevron
              key={marker.id}
              x={at.x + dx * scale}
              y={at.y + dy * scale}
              angleDeg={angleDeg}
              focused={focused}
            />
          );
        })}

        {/* Subtle, crisp player indicator with heading arrow */}
        <g transform={`translate(${at.x},${at.y}) rotate(${compass.headingDegrees})`}>
          <circle r="3.5" fill="#9e3223" stroke="#fff8e2" strokeWidth="1.2" />
          <path d="M0 -9 L3.5 -1 L0 -3 L-3.5 -1 Z" fill="#ffd700" stroke="#4a3010" strokeWidth="0.8" />
        </g>
      </svg>

      {/* Cozy brass/wood rim & subtle North compass mark */}
      <GuildcraftArt art="ring" className="guild-minimap-rim" />
      <span className="guild-minimap-north" aria-hidden="true">
        N
      </span>
    </button>
  );
};
