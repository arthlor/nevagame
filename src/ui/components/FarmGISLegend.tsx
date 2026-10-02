import React from "react";
import { GameSheet } from "../coastal/CoastalUI";
import { UI_GIS } from "../chrome/uiAtlas";
import { AtlasImage } from "../chrome/AtlasImage";
import { useTranslation } from "../../i18n/useTranslation";

export interface FarmGISLegendProps {
  visible: boolean;
  className?: string;
}

export const FarmGISLegend: React.FC<FarmGISLegendProps> = ({ visible, className = "" }) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";

  if (!visible) return null;

  return (
    <GameSheet
      family="ink"
      as="aside"
      className={`farm-gis-legend interactive ${className}`.trim()}
      tone="slate"
      corners
      role="status"
      aria-label={isTr ? "Tarla işaretleri" : "Field signs"}
      data-testid="farm-gis-legend"
    >
      <div className="gis-legend-header">
        <strong className="gis-legend-title">{isTr ? "Tarla İşaretleri" : "Field signs"}</strong>
        <span className="gis-legend-hint">{isTr ? "Gizlemek için Alt'ı bırak" : "Release Alt to hide"}</span>
      </div>

      <div className="gis-legend-items">
        <div className="gis-legend-group">
          <span className="gis-group-label">{isTr ? "Nem" : "Moisture"}</span>
          <div className="gis-legend-item">
            <AtlasImage src={UI_GIS.moist} alt="" />
            <span>{isTr ? "İdeal" : "Ideal"}</span>
          </div>
          <div className="gis-legend-item">
            <AtlasImage src={UI_GIS.dry} alt="" />
            <span>{isTr ? "Kuru" : "Dry"}</span>
          </div>
          <div className="gis-legend-item">
            <span className="gis-swatch gis-swatch--saturated" aria-hidden="true" />
            <span>{isTr ? "Fazla ıslak" : "Saturated"}</span>
          </div>
        </div>

        <div className="gis-legend-group">
          <span className="gis-group-label">{isTr ? "Toprak" : "Soil"}</span>
          <div className="gis-legend-item">
            <span className="gis-swatch gis-swatch--rich" aria-hidden="true" />
            <span>{isTr ? "Verimli" : "Rich"}</span>
          </div>
          <div className="gis-legend-item">
            <span className="gis-swatch gis-swatch--fair" aria-hidden="true" />
            <span>{isTr ? "Orta" : "Fair"}</span>
          </div>
          <div className="gis-legend-item">
            <span className="gis-swatch gis-swatch--depleted" aria-hidden="true" />
            <span>{isTr ? "Yorgun" : "Depleted"}</span>
          </div>
        </div>

        <div className="gis-legend-group">
          <span className="gis-group-label">{isTr ? "Ekin" : "Crop"}</span>
          <div className="gis-legend-item">
            <AtlasImage src={UI_GIS.harvestReady} alt="" />
            <span>{isTr ? "Hasada hazır" : "Ready to harvest"}</span>
          </div>
          <div className="gis-legend-item">
            <AtlasImage src={UI_GIS.growing} alt="" />
            <span>{isTr ? "Büyüyor" : "Growing"}</span>
          </div>
          <div className="gis-legend-item">
            <AtlasImage src={UI_GIS.prepared} alt="" />
            <span>{isTr ? "İşlenmiş toprak" : "Prepared soil"}</span>
          </div>
        </div>
      </div>
    </GameSheet>
  );
};
