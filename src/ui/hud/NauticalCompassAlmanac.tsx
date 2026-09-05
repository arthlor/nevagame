import React from "react";
import type { WorldHudDto } from "../../simulation/core/contracts";
import { formatWeatherLabel } from "../weatherPresentation";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForMapNode, UI_FISH, UI_TIME } from "../chrome/uiAtlas";
import { TidebookArt } from "./TidebookArt";

export interface NauticalCompassAlmanacProps {
  clock: WorldHudDto["clock"];
  weather: WorldHudDto["weather"];
  compass: WorldHudDto["compass"];
  onToggleForecast: () => void;
  showForecast?: boolean;
  className?: string;
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export const TidebookNavigation: React.FC<{
  compass: WorldHudDto["compass"];
  onOpenMap: () => void;
}> = ({ compass, onOpenMap }) => (
  <button type="button" className="tidebook-navigation interactive" onClick={onOpenMap}
    aria-label={`Open nautical chart. ${compass.subRegionTitle}, heading ${compass.headingDegrees} degrees ${compass.headingCardinal}`}
    title={`${compass.subRegionTitle} · ${compass.headingDegrees}° ${compass.headingCardinal} · Open chart (M)`}
    data-testid="tidebook-navigation">
    <TidebookArt art="navigation-rail" className="tidebook-navigation-rail" />
    <span className="tidebook-region">{compass.subRegionTitle}</span>
    <span className="tidebook-cardinals" aria-hidden="true">
      {CARDINALS.map((label, index) => {
        const bearing = ((index * 45 - compass.headingDegrees + 540) % 360) - 180;
        if (Math.abs(bearing) > 70) return null;
        return <span key={label} style={{ left: `${50 + bearing / 1.6}%` }}>{label}</span>;
      })}
    </span>
    <TidebookArt art="pointer" className="tidebook-navigation-pointer" />
    <span className="tidebook-navigation-markers" aria-hidden="true">
      {compass.nearbyMarkers.filter((marker) => Math.abs(marker.relativeBearingDeg) < 68).map((marker) => (
        <span key={marker.id} style={{ left: `${50 + marker.relativeBearingDeg / 1.6}%` }}
          title={`${marker.label} · ${marker.distanceMeters} m`}>
          <AtlasImage src={marker.type === "fish-school" ? UI_FISH["fish.trout"] : atlasForMapNode(marker.id)} size={17} />
        </span>
      ))}
    </span>
  </button>
);

export const NauticalCompassAlmanac: React.FC<NauticalCompassAlmanacProps> = ({
  clock, weather, compass, onToggleForecast, showForecast = false, className = ""
}) => (
  <div className={`nautical-compass-almanac tidebook-almanac ${className}`.trim()}
    data-testid="nautical-compass-almanac" role="region" aria-label="Nautical navigation and almanac">
    <button type="button" className="tidebook-dial" onClick={onToggleForecast}
      aria-label={`Open current conditions and farm forecast. ${clock.label}, ${formatWeatherLabel(weather.type)}, ${weather.temperatureC} degrees`}
      aria-expanded={showForecast} aria-controls="farm-forecast-popover"
      title={`${clock.timeOfDayLabel} · Wind ${compass.windDegrees}° · Forecast (F)`}>
      <TidebookArt art="clock-face" className="tidebook-dial-face" />
      <span className="tidebook-clock-hand" style={{ transform: `rotate(${clock.dialRotation}deg)` }}>
        <TidebookArt art="pointer" />
      </span>
      {clock.isNight && <AtlasImage src={UI_TIME.moon} className="tidebook-night-mark" />}
    </button>
    <button type="button" className="tidebook-calendar" onClick={onToggleForecast}
      title={`${formatWeatherLabel(weather.type)}, ${weather.temperatureC}°C — Open forecast (F)`}
      aria-expanded={showForecast} aria-controls="farm-forecast-popover"
      aria-label="Open current conditions and farm forecast">
      <span className="tidebook-calendar-copy">
        <span className="tidebook-season">{clock.seasonLabel} {clock.dayInSeason}</span>
        <span className="tidebook-time" data-testid="game-clock">{clock.label}</span>
        <span className="tidebook-weather">{formatWeatherLabel(weather.type)}</span>
      </span>
    </button>
  </div>
);
