import React, { useEffect, useState } from "react";
import { WORLD_ATLAS } from "../../world/WorldAtlasProjection";
import { loadWorldAtlasImage } from "./worldAtlasImage";
import { useTranslation } from "../../i18n/useTranslation";

/** Mounted only by the lazy map modal. No preload, timers, RAF, or global listeners. */
export const WorldAtlasTerrain = React.memo(function WorldAtlasTerrain() {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => loadWorldAtlasImage(WORLD_ATLAS.textureUrl, () => setReady(true), () => setFailed(true)), []);
  const { locale } = useTranslation();
  return <g className="world-atlas-terrain" data-testid="world-atlas-terrain" data-texture={WORLD_ATLAS.textureUrl}>
    {ready && <image href={WORLD_ATLAS.textureUrl} x={0} y={0} width={WORLD_ATLAS.width} height={WORLD_ATLAS.height}
      preserveAspectRatio="none" aria-hidden="true" onError={() => setFailed(true)} />}
    {!ready && !failed && <text x={WORLD_ATLAS.width / 2} y={WORLD_ATLAS.height / 2} textAnchor="middle" fill="#fff0bc" fontSize="16" role="status">
      {locale === "tr" ? "Harita yükleniyor…" : "Loading chart…"}
    </text>}
    {failed && <text x={WORLD_ATLAS.width / 2} y={WORLD_ATLAS.height / 2} textAnchor="middle" fill="#fff0bc" fontSize="16" role="status">
      {locale === "tr" ? "Harita resmi yüklenemedi. Yer listesi kullanılabilir." : "Chart image unavailable. The place directory is still available."}
    </text>}

  </g>;
});
