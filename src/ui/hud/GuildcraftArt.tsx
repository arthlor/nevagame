import React from "react";
import { AtlasImage } from "../chrome/AtlasImage";
import { UI_GUILDCRAFT } from "../chrome/uiAtlas.generated";

/** Painted chrome is presentation only; labels, fills and interaction stay live. */
export const GuildcraftArt: React.FC<{
  art: keyof typeof UI_GUILDCRAFT;
  className?: string;
  style?: React.CSSProperties;
}> = ({ art, className = "", style }) => (
  <AtlasImage src={UI_GUILDCRAFT[art]} className={`guild-art ${className}`}
    fit={art === "meter" || art === "cartouche" ? "fill" : "contain"}
    style={style} aria-hidden="true" />
);
