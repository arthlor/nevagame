import type { GameState, WeatherState } from "../../simulation/core/types";
import type { WaterConditions } from "../water/WaterSurface";
import { WeatherPresentation, type WeatherAppearance } from "../weather/WeatherPresentation";

/** Shares one weather transition across lighting, ambient motion and water per frame. */
export class WeatherFramePresentation {
  private readonly weather = new WeatherPresentation();
  private appearance: WeatherAppearance | null = null;
  private timeSeconds = Number.NaN;
  private worldSeed = Number.NaN;
  private readonly waterConditionsSnapshot: WaterConditions = {
    seaRoughness: 0,
    windDirectionDeg: 0,
    windSpeed: 0
  };

  public sample(state: Readonly<GameState>, timeSeconds: number): WeatherAppearance {
    if (!this.appearance || timeSeconds !== this.timeSeconds || state.worldSeed !== this.worldSeed) {
      this.appearance = this.weather.sample(state.weather, state.worldSeed, timeSeconds);
      this.timeSeconds = timeSeconds;
      this.worldSeed = state.worldSeed;
    }
    return this.appearance;
  }

  public currentWeather(fallback: WeatherState): WeatherState {
    return this.weather.current?.weather ?? fallback;
  }

  public waterConditions(fallback: WeatherState, effectiveWindSpeed: number): WaterConditions {
    const weather = this.currentWeather(fallback);
    this.waterConditionsSnapshot.seaRoughness = weather.seaRoughness;
    this.waterConditionsSnapshot.windDirectionDeg = weather.windDirectionDeg;
    this.waterConditionsSnapshot.windSpeed = effectiveWindSpeed;
    this.waterConditionsSnapshot.precipitation = weather.precipitation;
    return this.waterConditionsSnapshot;
  }
}
