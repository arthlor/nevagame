import React from "react";
import type { WorldHudDto } from "../../simulation/core/contracts";
import { formatWeatherLabel } from "../weatherPresentation";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForWeather } from "../chrome/uiAtlas";
import { GuildcraftArt } from "./GuildcraftArt";
import { HudIcon } from "../components/HudIcons";
import { WorldMinimap } from "./WorldMinimap";

export interface NauticalCompassAlmanacProps {
  clock: WorldHudDto["clock"];
  weather: WorldHudDto["weather"];
  compass: WorldHudDto["compass"];
  playerPosition?: { x: number; z: number };
  onOpenMap?: () => void;
  onToggleForecast: () => void;
  showForecast?: boolean;
  className?: string;
  passive?: boolean;
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const TidebookNavigation: React.FC<{
  compass: WorldHudDto["compass"]; onOpenMap: () => void;
}> = ({ compass, onOpenMap }) => (
  <button type="button" className="guild-navigation interactive" onClick={onOpenMap}
    aria-label={`Open nautical chart. ${compass.subRegionTitle}, heading ${compass.headingDegrees} degrees ${compass.headingCardinal}`}
    title={`${compass.subRegionTitle} · ${compass.headingDegrees}° ${compass.headingCardinal} · Open chart (M)`}
    data-testid="tidebook-navigation">
    <span className="guild-region">{compass.subRegionTitle}</span>
    <span className="guild-compass-rule" aria-hidden="true" />
    <span className="guild-compass-markers" aria-hidden="true">
      {compass.nearbyMarkers.filter((marker) => Math.abs(marker.relativeBearingDeg) <= 70).map((marker) => (
        <span key={marker.id} className="guild-compass-marker"
          data-kind={marker.kind ?? marker.type}
          style={{ left: `${50 + marker.relativeBearingDeg / 1.6}%` }}
          title={`${marker.label} · ${marker.distanceMeters} m`}>
          <HudIcon name={marker.icon} className="guild-compass-marker-mark" />
          {(marker.kind === "quest" || marker.kind === "quest-secondary") && (
            <span className="guild-compass-marker-range">{marker.distanceMeters} m</span>
          )}
        </span>
      ))}
    </span>
    <span className="guild-cardinals" aria-hidden="true">
      {CARDINALS.map((label, index) => {
        const bearing = ((index * 45 - compass.headingDegrees + 540) % 360) - 180;
        return Math.abs(bearing) > 70 ? null : <span key={label} style={{ left: `${50 + bearing / 1.6}%` }}>{label}</span>;
      })}
    </span>
    <span className="guild-compass-caret" aria-hidden="true">◆</span>
  </button>
);

export const NauticalCompassAlmanac: React.FC<NauticalCompassAlmanacProps> = ({
  clock, weather, compass, playerPosition, onOpenMap, onToggleForecast, showForecast = false, className = "", passive = false
}) => (
  <div className={`nautical-compass-almanac guild-almanac ${className}`}
    data-testid="nautical-compass-almanac" role="region" aria-label="Nautical navigation and almanac">
    {playerPosition && (onOpenMap || passive) && <WorldMinimap player={playerPosition} compass={compass} onOpenMap={onOpenMap} />}
    <button type="button" className="guild-weather-medallion" disabled={passive} onClick={onToggleForecast}
      aria-label={`Open current conditions and farm forecast. ${formatWeatherLabel(weather.type)}, ${weather.temperatureC} degrees`}
      aria-expanded={showForecast} aria-controls="farm-forecast-popover"
      title={`${formatWeatherLabel(weather.type)} · ${weather.temperatureC}°C · Wind ${compass.windDegrees}° · Forecast (F)`}>
      {weather.type === "clear" && !clock.isNight ? <GuildcraftArt art="sun" />
        : <><GuildcraftArt art="ring" /><AtlasImage className="guild-weather-painting" src={atlasForWeather(weather.type, clock.isNight ? "night" : "day")} /></>}
    </button>
    <button type="button" className="guild-calendar" disabled={passive} onClick={onToggleForecast}
      aria-expanded={showForecast} aria-controls="farm-forecast-popover"
      aria-label="Open current conditions and farm forecast">
      <span data-testid="game-clock">{clock.label}</span><span aria-hidden="true"> · </span>
      <span>{clock.seasonLabel} {clock.dayInSeason}</span>
    </button>
  </div>
);
