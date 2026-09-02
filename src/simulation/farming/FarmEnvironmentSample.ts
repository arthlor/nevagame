import type { ClimateId, FarmState, WeatherState } from "../core/types";
import { farmWorldOrigin } from "../../world/FarmLayout";
import { WorldLayout } from "../../world/WorldLayout";
import type { WorldBiomeId, WorldIslandId } from "../../world/WorldIslands";

/** Pure crop-environment input shared by realtime and offline progression. */
export interface FarmEnvironmentSample {
  farmId: string;
  islandId: WorldIslandId;
  biomeId: WorldBiomeId;
  climateId: ClimateId;
  weatherType: WeatherState["type"];
  temperatureC: number;
  rainfallEffectiveness: number;
  evaporationMultiplier: number;
  exposure: number;
  moistureRetention: number;
}

export function sampleFarmEnvironment(
  farm: Pick<FarmState, "id" | "climateId" | "soil">,
  weather: Readonly<WeatherState>
): FarmEnvironmentSample {
  const origin = farmWorldOrigin(farm.id);
  const local = WorldLayout.climateSampleAt(origin.x, origin.z, weather);
  const localTemperatureMultiplier = Math.max(
    0.75,
    Math.min(1.4, 1 + (local.temperatureC - weather.temperatureC) * 0.025)
  );
  return {
    farmId: farm.id,
    islandId: local.islandId,
    biomeId: local.biomeId,
    climateId: farm.climateId,
    weatherType: weather.type,
    temperatureC: local.temperatureC,
    rainfallEffectiveness: local.rainfallEffectiveness,
    evaporationMultiplier: local.evaporationMultiplier * localTemperatureMultiplier,
    exposure: local.exposure,
    moistureRetention: farm.soil.moistureRetention
  };
}
