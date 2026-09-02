import React from "react";
import type { FarmForecastDto } from "../../src/simulation/core/contracts";
import type { GameState } from "../../src/simulation/core/types";
import { buildWorldHudDto } from "../../src/simulation/presentation/WorldHudPresentation";
import { HUD, type HUDProps } from "../../src/ui/HUD";

const EMPTY_FARM_FORECAST: FarmForecastDto = {
  seasonLabel: "Spring",
  currentTemperatureC: 0,
  slots: [
    { label: "Now", type: "clear" },
    { label: "+2h", type: "clear" },
    { label: "+5h", type: "clear" }
  ],
  rainLabel: "Mostly dry",
  windLabel: "Light",
  seaLabel: "Calm"
};

type LegacyHudProps = Omit<HUDProps, "hud" | "onInspectFarmForecast"> & {
  state: GameState;
};

/**
 * Keeps legacy server-rendered HUD tests focused on presentation assertions
 * while adapting their old state-shaped fixture to the live DTO contract.
 */
export const LegacyHUD: React.FC<LegacyHudProps> = ({ state, ...props }) => (
  React.createElement(HUD, {
    hud: buildWorldHudDto(state),
    onInspectFarmForecast: () => EMPTY_FARM_FORECAST,
    ...props
  })
);
