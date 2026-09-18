import React from "react";
import type { WorldHudDto } from "../../simulation/core/contracts";
import { WORLD_CHART_NODES } from "../../world/WorldGameplayLocations";
import { worldPointToMapSvg, worldPointToMapSvgUnclamped } from "../../world/WorldMapProjection";
import { WorldChartTerrain } from "../components/WorldChartTerrain";
import { GuildcraftArt } from "./GuildcraftArt";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForMapNode } from "../chrome/uiAtlas";

/** Chart units from the player before a mark falls outside the dial. */
const VIEW_RADIUS = 78;
/**
 * Where an out-of-view quest pin parks instead of disappearing. A story target
 * is routinely on the far island, so the pin becomes a rim chevron pointing at
 * it rather than vanishing — a pin the player watches blink out is a pin they
 * stop trusting.
 */
const RIM_RADIUS = 68;

const QuestMark: React.FC<{ x: number; y: number; focused: boolean }> = ({ x, y, focused }) => (
  <g transform={`translate(${x},${y})`}>
    <path d="M0 -7 L5.4 0 L0 7 L-5.4 0 Z"
      fill={focused ? "#ffd98a" : "#c9b184"}
      stroke="#4a3a12" strokeWidth="1.4" strokeLinejoin="round" />
    {focused && <path d="M0 -3.4 L2.6 0 L0 3.4 L-2.6 0 Z" fill="#fff8e2" opacity="0.55" />}
  </g>
);

const QuestChevron: React.FC<{ x: number; y: number; angleDeg: number; focused: boolean }> = ({
  x, y, angleDeg, focused
}) => (
  <g transform={`translate(${x},${y}) rotate(${angleDeg})`}>
    <path d="M0 -7.5 L5.6 4.5 L0 1.4 L-5.6 4.5 Z"
      fill={focused ? "#ffd98a" : "#c9b184"}
      stroke="#4a3a12" strokeWidth="1.3" strokeLinejoin="round" />
  </g>
);

const WaypointMark: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x},${y})`}>
    <circle r="6" fill="none" stroke="#e69c24" strokeWidth="1.2" strokeDasharray="2 2" />
    <circle r="3.5" fill="#9a3528" stroke="#ffd700" strokeWidth="1" />
    <polygon points="0,-2.5 1,-1 2.5,0 1,1 0,2.5 -1,1 -2.5,0 -1,-1" fill="#ffd700" />
  </g>
);

const WaypointChevron: React.FC<{ x: number; y: number; angleDeg: number }> = ({
  x, y, angleDeg
}) => (
  <g transform={`translate(${x},${y}) rotate(${angleDeg})`}>
    <path d="M0 -7.5 L5 4 L0 1.2 L-5 4 Z"
      fill="#ffd700"
      stroke="#7c4a15" strokeWidth="1.2" strokeLinejoin="round" />
  </g>
);

export const WorldMinimap: React.FC<{
  player: { x: number; z: number };
  compass: WorldHudDto["compass"];
  onOpenMap?: () => void;
}> = ({ player, compass, onOpenMap }) => {
  const at = worldPointToMapSvg(player);
  const questMarkers = compass.nearbyMarkers.filter(
    (marker) => marker.kind === "quest" || marker.kind === "quest-secondary"
  );
  const waypointMarker = compass.nearbyMarkers.find((marker) => marker.kind === "waypoint");
  const questLabel = questMarkers[0]
    ? ` Objective ${questMarkers[0].label}, ${questMarkers[0].distanceMeters} metres.`
    : "";
  const waypointLabel = waypointMarker
    ? ` Waypoint ${waypointMarker.distanceMeters} metres.`
    : "";
  return <button type="button" disabled={!onOpenMap} className="guild-minimap" data-testid="world-minimap"
    onClick={onOpenMap} aria-label={`${onOpenMap ? "Open nautical chart. " : "Current position. "}${compass.subRegionTitle}.${questLabel}${waypointLabel}`}
    title={`${compass.subRegionTitle}${onOpenMap ? " · Open chart (M)" : ""}`}>
    <svg className="guild-minimap-chart" viewBox={`${at.x - 84} ${at.y - 84} 168 168`}
      aria-hidden="true" focusable="false">
      <WorldChartTerrain />
      {WORLD_CHART_NODES.map((node) => {
        const p = worldPointToMapSvg(node.position);
        if (Math.hypot(p.x - at.x, p.y - at.y) > VIEW_RADIUS) return null;
        return <g key={node.id} transform={`translate(${p.x - 8},${p.y - 8})`}>
          <AtlasImage src={atlasForMapNode(node.id)} size={16} aria-hidden="true" />
        </g>;
      })}
      {compass.nearbyMarkers.filter((marker) => marker.kind === "fish-school").map((marker) => {
        const p = worldPointToMapSvg(marker);
        return Math.hypot(p.x - at.x, p.y - at.y) > VIEW_RADIUS ? null : <circle key={marker.id}
          cx={p.x} cy={p.y} r="4" fill="#396b6c" stroke="#eee1b9" strokeWidth="1" />;
      })}
      {/* Plotted Custom Waypoint beacon on the minimap */}
      {waypointMarker && (() => {
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
        return <WaypointChevron key={waypointMarker.id} x={at.x + dx * scale} y={at.y + dy * scale} angleDeg={angleDeg} />;
      })()}
      {questMarkers.map((marker) => {
        // Unclamped on both ends: a clamped player and a clamped target on the
        // same frame edge would collapse to a bearing of zero.
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
        // The chevron points the way the target lies, not the way north is.
        const angleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
        return <QuestChevron key={marker.id} x={at.x + dx * scale} y={at.y + dy * scale}
          angleDeg={angleDeg} focused={focused} />;
      })}
      <g transform={`translate(${at.x},${at.y}) rotate(${compass.headingDegrees})`}>
        <path d="M0 -9 L6 7 L0 3 L-6 7 Z" fill="#fff0bc" stroke="#514226" strokeWidth="1.5" />
      </g>
    </svg>
    <GuildcraftArt art="ring" className="guild-minimap-rim" />
    <span className="guild-minimap-north" aria-hidden="true">N</span>
  </button>;
};
