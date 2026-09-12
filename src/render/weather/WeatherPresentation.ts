import type { WeatherState } from "../../simulation/core/types";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";

export interface WeatherAppearance {
  weather: WeatherState;
  storm: number;
  clear: number;
}

const CONTINUOUS_FIELDS = [
  "windSpeed", "precipitation", "cloudCover", "seaRoughness", "visibility", "temperatureC"
] as const;

/** One transition for visible weather; the simulation and forecast stay untouched. */
export class WeatherPresentation {
  public current: WeatherAppearance | null = null;
  private lastTime = Number.NaN;
  private lastSeed = Number.NaN;

  public sample(source: Readonly<WeatherState>, worldSeed: number, time: number): WeatherAppearance {
    if (!this.current || time < this.lastTime || worldSeed !== this.lastSeed) {
      this.current = {
        weather: { ...source }, storm: source.type === "storm" ? 1 : 0,
        clear: source.type === "clear" ? 1 : 0
      };
    } else {
      const alpha = 1 - Math.exp(-Math.max(0, time - this.lastTime)
        / CANONICAL_RENDER_CONFIG.atmosphere.weatherResponseSeconds);
      const output = this.current.weather;
      for (const key of CONTINUOUS_FIELDS) output[key] += (source[key] - output[key]) * alpha;
      const angle = ((source.windDirectionDeg - output.windDirectionDeg + 540) % 360) - 180;
      output.windDirectionDeg = (output.windDirectionDeg + angle * alpha + 360) % 360;
      this.current.storm += ((source.type === "storm" ? 1 : 0) - this.current.storm) * alpha;
      this.current.clear += ((source.type === "clear" ? 1 : 0) - this.current.clear) * alpha;
      output.type = source.type;
      output.nextWeatherType = source.nextWeatherType;
      output.nextWeatherMinute = source.nextWeatherMinute;
    }
    this.lastTime = time;
    this.lastSeed = worldSeed;
    return this.current;
  }
}
