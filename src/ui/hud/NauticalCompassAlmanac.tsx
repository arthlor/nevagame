import React from "react";
import type { WorldHudDto } from "../../simulation/core/contracts";
import { formatWeatherLabel } from "../weatherPresentation";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForWeather } from "../chrome/uiAtlas";
import { GuildcraftArt } from "./GuildcraftArt";
import { HudIcon } from "../components/HudIcons";
import { WorldMinimap } from "./WorldMinimap";
import { placeLabel, seasonLabel } from "../../i18n/placesTr";
import { useTranslation } from "../../i18n/useTranslation";

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
}> = React.memo(({ compass, onOpenMap }) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const region = placeLabel(compass.subRegionTitle, locale);
  return (
    <button type="button" className="guild-navigation interactive" onClick={onOpenMap}
      aria-label={isTr ? `Deniz haritasını aç. ${region}, rota ${compass.headingDegrees} derece ${compass.headingCardinal}` : `Open nautical chart. ${compass.subRegionTitle}, heading ${compass.headingDegrees} degrees ${compass.headingCardinal}`}
      title={`${region} · ${compass.headingDegrees}° ${compass.headingCardinal} · ${isTr ? "Haritayı aç (M)" : "Open chart (M)"}`}
      data-testid="tidebook-navigation">
      <span className="guild-region">{region}</span>
      <span className="guild-compass-rule" aria-hidden="true" />
      <span className="guild-compass-markers" aria-hidden="true">
        {compass.nearbyMarkers.filter((marker) => Math.abs(marker.relativeBearingDeg) <= 70).map((marker) => (
          <span key={marker.id} className="guild-compass-marker"
            data-kind={marker.kind ?? marker.type}
            style={{ left: `${50 + marker.relativeBearingDeg / 1.6}%` }}
            title={`${placeLabel(marker.label, locale)} · ${marker.distanceMeters} m`}>
            <HudIcon name={marker.icon} className="guild-compass-marker-mark" />
            {(marker.kind === "quest" || marker.kind === "quest-secondary" || marker.kind === "waypoint") && (
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
});

export const NauticalCompassAlmanac: React.FC<NauticalCompassAlmanacProps> = React.memo(({
  clock, weather, compass, playerPosition, onOpenMap, onToggleForecast, showForecast = false, className = "", passive = false
}) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  return (
    <div className={`nautical-compass-almanac guild-almanac ${className}`}
      data-testid="nautical-compass-almanac" role="region" aria-label={isTr ? "Deniz seyrüseferi ve takvimi" : "Nautical navigation and almanac"}>
      {playerPosition && (onOpenMap || passive) && <WorldMinimap player={playerPosition} compass={compass} onOpenMap={onOpenMap} />}
      <button type="button" className="guild-weather-medallion" disabled={passive} onClick={onToggleForecast}
        aria-label={isTr ? `Mevcut koşulları ve çiftlik tahminini aç. ${formatWeatherLabel(weather.type, locale)}, ${weather.temperatureC} derece` : `Open current conditions and farm forecast. ${formatWeatherLabel(weather.type)}, ${weather.temperatureC} degrees`}
        aria-expanded={showForecast} aria-controls="farm-forecast-popover"
        title={`${formatWeatherLabel(weather.type, locale)} · ${weather.temperatureC}°C · ${isTr ? "Rüzgâr" : "Wind"} ${compass.windDegrees}° · ${isTr ? "Hava Tahmini (F)" : "Forecast (F)"}`}>
        {weather.type === "clear" && !clock.isNight ? <GuildcraftArt art="sun" />
          : <><GuildcraftArt art="ring" /><AtlasImage className="guild-weather-painting" src={atlasForWeather(weather.type, clock.isNight ? "night" : "day")} /></>}
      </button>
      <button type="button" className="guild-calendar" disabled={passive} onClick={onToggleForecast}
        aria-expanded={showForecast} aria-controls="farm-forecast-popover"
        aria-label={isTr ? "Mevcut koşulları ve çiftlik tahminini aç" : "Open current conditions and farm forecast"}>
        <span data-testid="game-clock">{clock.label}</span><span aria-hidden="true"> · </span>
        <span>{seasonLabel(clock.seasonLabel, locale)} {clock.dayInSeason}</span>
      </button>
    </div>
  );
}, (prev, next) => {
  if (prev.showForecast !== next.showForecast) return false;
  if (prev.passive !== next.passive) return false;
  if (prev.className !== next.className) return false;
  if (prev.clock.label !== next.clock.label) return false;
  if (prev.clock.isNight !== next.clock.isNight) return false;
  if (prev.clock.dayInSeason !== next.clock.dayInSeason) return false;
  if (prev.weather.type !== next.weather.type) return false;
  if (prev.weather.temperatureC !== next.weather.temperatureC) return false;
  if (prev.compass.headingDegrees !== next.compass.headingDegrees) return false;
  if (prev.compass.windDegrees !== next.compass.windDegrees) return false;
  if (prev.compass.subRegionTitle !== next.compass.subRegionTitle) return false;
  if (prev.compass.nearbyMarkers !== next.compass.nearbyMarkers) return false;

  if (prev.playerPosition && next.playerPosition) {
    const dx = prev.playerPosition.x - next.playerPosition.x;
    const dz = prev.playerPosition.z - next.playerPosition.z;
    if (dx * dx + dz * dz > 0.04) return false;
  } else if (prev.playerPosition !== next.playerPosition) {
    return false;
  }

  return true;
});
