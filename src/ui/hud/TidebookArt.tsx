import React from "react";
import { AtlasImage } from "../chrome/AtlasImage";
import { UI_TIDEBOOK } from "../chrome/uiAtlas.generated";

export type TidebookArtId = keyof typeof UI_TIDEBOOK;

/** Authored paintings use the existing trimmed, packed UI atlas. */
export const TidebookArt: React.FC<{
  art: TidebookArtId;
  className?: string;
  style?: React.CSSProperties;
}> = ({ art, className = "", style }) => (
  <AtlasImage src={UI_TIDEBOOK[art]} fit={art === "meter-frame" ? "fill" : "contain"}
    className={`tidebook-art ${className}`.trim()} style={style} aria-hidden="true" />
);
