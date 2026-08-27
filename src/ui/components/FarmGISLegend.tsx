import React from "react";
import { ChromePanel } from "../chrome/Chrome";
import { UI_GIS } from "../chrome/uiAtlas";
import { AtlasImage } from "../chrome/AtlasImage";

interface FarmGISLegendProps {
  visible: boolean;
}

export const FarmGISLegend: React.FC<FarmGISLegendProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <ChromePanel as="aside" className="farm-gis-legend interactive" tone="slate" flourish corners role="status" aria-label="Field signs" data-testid="farm-gis-legend">
      <div className="gis-legend-header">
        <strong className="gis-legend-title">Field signs</strong>
        <span className="gis-legend-hint">Release Alt to hide</span>
      </div>

      <div className="gis-legend-items">
        <div className="gis-legend-item">
          <AtlasImage src={UI_GIS.moist} alt="" />
          <span>Good moisture</span>
        </div>
        <div className="gis-legend-item">
          <AtlasImage src={UI_GIS.dry} alt="" />
          <span>Dry soil</span>
        </div>
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
    </ChromePanel>
  );
};
