// src/ui/components/HudIcons.tsx
import React from "react";
import { AtlasImage } from "../chrome/AtlasImage";
import { UI_MENU, UI_STATUS, UI_TIME, UI_TOOLS, UI_WEATHER, UI_WORLD } from "../chrome/uiAtlas";

export interface IconProps {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  title?: string;
}

const AtlasIcon: React.FC<IconProps & { src: string }> = ({ src, size = 18, className, ...rest }) => (
  <AtlasImage src={src} size={size} className={`hud-atlas-icon ${className ?? ""}`.trim()} {...rest} />
);

export const IconCoin: React.FC<IconProps> = (props) => <AtlasIcon src={UI_STATUS.coin} size={20} {...props} />;
export const IconEnergy: React.FC<IconProps> = (props) => <AtlasIcon src={UI_STATUS.labor} size={18} {...props} />;
export const IconWarning: React.FC<IconProps> = (props) => <AtlasIcon src={UI_STATUS.warning} size={16} {...props} />;

export const IconBackpack: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.backpack} size={18} {...props} />;
export const IconJournal: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.journal} size={16} {...props} />;
export const IconLedger: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.ledger} size={16} {...props} />;
export const IconCompass: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.compass} size={16} {...props} />;
export const IconExpedition: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.expedition} size={16} {...props} />;
export const IconMenu: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.menu} size={16} {...props} />;

export const IconSprout: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WORLD.sprout} size={18} {...props} />;
export const IconFish: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WORLD.fish} size={18} {...props} />;
export const IconBoat: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WORLD.boat} size={18} {...props} />;

export const IconSun: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TIME.sun} size={18} {...props} />;
export const IconMoon: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TIME.moon} size={18} {...props} />;
export const IconDawn: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TIME.dawn} size={18} {...props} />;
export const IconDusk: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TIME.dusk} size={18} {...props} />;
export const IconWeatherClear: React.FC<IconProps> = (props) => <IconSun {...props} />;
export const IconWeatherOvercast: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.overcast} size={18} {...props} />;
export const IconWeatherLightRain: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER["light-rain"]} size={18} {...props} />;
export const IconWeatherRain: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.rain} size={18} {...props} />;
export const IconWeatherStorm: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.storm} size={18} {...props} />;
export const IconWeatherFog: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.fog} size={18} {...props} />;
export const IconThermometer: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.thermometer} size={16} {...props} />;
export const IconWind: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.wind} size={16} {...props} />;
export const IconWave: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.wave} size={16} {...props} />;

export const IconHoe: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.hoe} size={24} {...props} />;
export const IconAxe: React.FC<IconProps> = (props) => <IconHoe {...props} />;
export const IconWateringCan: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.watering_can} size={24} {...props} />;
export const IconBait: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.bait} size={24} {...props} />;
export const IconRod: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.rod} size={24} {...props} />;
export const IconPickaxe: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.pickaxe} size={24} {...props} />;
export const IconBasket: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.basket} size={24} {...props} />;
export const IconTools: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.hoe} size={24} {...props} />;
