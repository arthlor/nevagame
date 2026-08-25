// src/ui/components/FarmGISLegend.tsx
import React from "react";

interface FarmGISLegendProps {
  visible: boolean;
}

export const FarmGISLegend: React.FC<FarmGISLegendProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <aside className="farm-gis-legend interactive" role="status" aria-label="Agricultural Soil & Crop GIS Overlay">
      <div className="gis-legend-header">
        <span className="gis-legend-icon">🌱</span>
        <strong className="gis-legend-title">AGRICULTURAL GIS OVERLAY</strong>
        <span className="gis-legend-hint">Release [Alt] to exit</span>
      </div>

      <div className="gis-legend-items">
        <div className="gis-legend-item">
          <span className="gis-color-swatch swatch-moist" />
          <span>Optimal Moisture</span>
        </div>
        <div className="gis-legend-item">
          <span className="gis-color-swatch swatch-dry" />
          <span>Moisture Problem / Dry</span>
        </div>
        <div className="gis-legend-item">
          <span className="gis-color-swatch swatch-mature" />
          <span>Ready to Harvest</span>
        </div>
        <div className="gis-legend-item">
          <span className="gis-color-swatch swatch-growing" />
          <span>Growing (Normal)</span>
        </div>
        <div className="gis-legend-item">
          <span className="gis-color-swatch swatch-empty" />
          <span>Tilled / Unplanted</span>
        </div>
      </div>
    </aside>
  );
};
