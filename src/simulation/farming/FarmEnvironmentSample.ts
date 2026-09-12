import type { ClimateId, FarmState, WeatherState } from "../core/types";
import { farmWorldOrigin, type FarmPoint } from "../../world/FarmLayout";
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

/**
 * Samples the environment at a crop's local farm position (defaults to the
 * farm origin). Position matters on Sunreach, where the exposed ridge is
 * hotter and drier than the sheltered cove; sampling the origin for every crop
 * would erase that distinction.
 */
export function sampleFarmEnvironment(
  farm: Pick<FarmState, "id" | "climateId" | "soil">,
  weather: Readonly<WeatherState>,
  local: FarmPoint = { x: 0, z: 0 }
): FarmEnvironmentSample {
  const origin = farmWorldOrigin(farm.id);
  const sampleX = origin.x + local.x;
  const sampleZ = origin.z + local.z;
  const sample = WorldLayout.climateSampleAt(sampleX, sampleZ, weather);
  const localTemperatureMultiplier = Math.max(
    0.75,
    Math.min(1.4, 1 + (sample.temperatureC - weather.temperatureC) * 0.025)
  );
  return {
    farmId: farm.id,
    islandId: sample.islandId,
    biomeId: sample.biomeId,
    climateId: farm.climateId,
    weatherType: weather.type,
    temperatureC: sample.temperatureC,
    rainfallEffectiveness: sample.rainfallEffectiveness,
    evaporationMultiplier: sample.evaporationMultiplier * localTemperatureMultiplier,
    exposure: sample.exposure,
    moistureRetention: farm.soil.moistureRetention
  };
}
