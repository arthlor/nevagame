import React, { useMemo } from "react";
import type { CropInspectionDto } from "../../simulation/core/contracts";
import { IconSprout } from "./HudIcons";
import { ChromeClose } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForCrop, atlasForGrowth } from "../chrome/uiAtlas";

export interface CropInspectionProps {
  inspection: CropInspectionDto;
  projectedPosition?: { x: number; y: number; visible: boolean } | null;
  onClose?: () => void;
  className?: string;
}

const titleCase = (value: string): string =>
  value.replace(/(^|[-_])\w/g, (match) => match.replace(/[-_]/, "").toUpperCase());

export const CropInspection: React.FC<CropInspectionProps> = ({
  inspection,
  projectedPosition,
  onClose,
  className = ""
}) => {
  const moistureTone =
    inspection.moisture.band === "wet"
      ? "wet"
      : inspection.moisture.band === "normal"
        ? "ideal"
        : "dry";

  const projectedStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!projectedPosition || !projectedPosition.visible) return undefined;
    if (typeof window === "undefined") return undefined;

    const cardWidth = 300;
    const cardHeight = 180;
    const margin = 16;
    const viewportWidth = window.innerWidth || 1920;
    const viewportHeight = window.innerHeight || 1080;

    // Center card horizontally above projected 3D ground anchor
    const rawLeft = projectedPosition.x - cardWidth / 2;
    const rawTop = projectedPosition.y - cardHeight - 20;

    // Viewport clamping with safe margin
    const clampedLeft = Math.max(margin, Math.min(viewportWidth - cardWidth - margin, rawLeft));
    const clampedTop = Math.max(margin, Math.min(viewportHeight - cardHeight - margin, rawTop));

    return {
      position: "fixed",
      left: `${Math.round(clampedLeft)}px`,
      top: `${Math.round(clampedTop)}px`,
      right: "auto",
      bottom: "auto",
      transform: "none",
      zIndex: 30
    };
  }, [projectedPosition]);

  return (
    <GameSheet
      family="ink"
      as="section"
      className={`crop-inspection interactive ${className}`.trim()}
      style={projectedStyle}
      tone="slate"
      flourish={false}
      corners={false}
      rivets={false}
      role="region"
      aria-label={`${inspection.name} crop inspection`}
      tabIndex={0}
      data-testid="crop-inspection"
      data-projected={Boolean(projectedStyle)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onClose) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <header className="crop-inspection-title">
        <div className="crop-title-group">
          <IconSprout size={18} className="crop-title-icon" />
          <strong>{inspection.name}</strong>
        </div>
        <div className="crop-header-right">
          <span className={`crop-stage-chip stage-${inspection.stage}`}>
            {titleCase(inspection.stage)}
          </span>
          {onClose && (
            <ChromeClose
              onClick={onClose}
              label="Close crop inspection"
              className="crop-inspection-close-btn"
            />
          )}
        </div>
      </header>

      <div className="crop-inspect-layout">
        <div className="crop-inspect-plate">
          <AtlasImage
            src={atlasForCrop(inspection.cropId) ?? atlasForGrowth(inspection.stage)}
            alt=""
          />
        </div>
        <dl className="crop-inspection-grid">
          <div className="crop-meta-item">
            <dt>Stage</dt>
            <dd className="crop-growth-status">{inspection.stageTimingLabel}</dd>
          </div>
          <div className="crop-meta-item">
            <dt>Moisture</dt>
            <dd className={`moisture-badge moisture-${moistureTone}`}>
              {titleCase(inspection.moisture.band)}
            </dd>
          </div>
          {inspection.soil && (
            <div className="crop-meta-item">
              <dt>Soil</dt>
              <dd className={`soil-badge soil-${inspection.soil.band}`}>
                {titleCase(inspection.soil.band)}
              </dd>
            </div>
          )}
          <div className="crop-meta-item crop-next-action">
            <dt>Next</dt>
            <dd>
              <strong>{inspection.immediateAction.label}</strong>
              {inspection.immediateAction.cost != null && (
                <span>{inspection.immediateAction.cost} Work</span>
              )}
              {inspection.immediateAction.blockerReason && (
                <span>{inspection.immediateAction.blockerReason}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </GameSheet>
  );
};
