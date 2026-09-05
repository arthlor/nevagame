import React from "react";
import { GameSheet } from "../coastal/CoastalUI";
import { UI_GIS } from "../chrome/uiAtlas";
import { AtlasImage } from "../chrome/AtlasImage";

export interface FarmGISLegendProps {
  visible: boolean;
  className?: string;
}

export const FarmGISLegend: React.FC<FarmGISLegendProps> = ({ visible, className = "" }) => {
  if (!visible) return null;

  return (
    <GameSheet
      family="ink"
      as="aside"
      className={`farm-gis-legend interactive ${className}`.trim()}
      tone="slate"
      corners
      role="status"
      aria-label="Field signs"
      data-testid="farm-gis-legend"
    >
      <div className="gis-legend-header">
        <strong className="gis-legend-title">Field signs</strong>
        <span className="gis-legend-hint">Release Alt to hide</span>
      </div>

      <div className="gis-legend-items">
        <div className="gis-legend-group">
          <span className="gis-group-label">Moisture Tiers</span>
          <div className="gis-legend-item">
            <AtlasImage src={UI_GIS.moist} alt="" />
            <span>Good moisture</span>
          </div>
          <div className="gis-legend-item">
            <AtlasImage src={UI_GIS.dry} alt="" />
            <span>Dry soil</span>
          </div>
          <div className="gis-legend-item">
            <span className="gis-swatch gis-swatch--saturated" aria-hidden="true" />
            <span>Saturated soil</span>
          </div>
        </div>

        <div className="gis-legend-group">
          <span className="gis-group-label">Soil Fertility</span>
          <div className="gis-legend-item">
            <span className="gis-swatch gis-swatch--rich" aria-hidden="true" />
            <span>Rich fertility</span>
          </div>
          <div className="gis-legend-item">
            <span className="gis-swatch gis-swatch--fair" aria-hidden="true" />
            <span>Fair fertility</span>
          </div>
          <div className="gis-legend-item">
            <span className="gis-swatch gis-swatch--depleted" aria-hidden="true" />
            <span>Depleted soil</span>
          </div>
        </div>

        <div className="gis-legend-group">
          <span className="gis-group-label">Field Progress</span>
          <div className="gis-legend-item">
            <AtlasImage src={UI_GIS.harvestReady} alt="" />
            <span>Ready to harvest</span>
          </div>
          <div className="gis-legend-item">
            <AtlasImage src={UI_GIS.growing} alt="" />
            <span>Growing</span>
          </div>
          <div className="gis-legend-item">
            <AtlasImage src={UI_GIS.prepared} alt="" />
            <span>Prepared soil</span>
          </div>
        </div>
      </div>
    </GameSheet>
  );
};
