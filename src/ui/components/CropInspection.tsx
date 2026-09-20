import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CropInspectionDto } from "../../simulation/core/contracts";
import { IconSprout } from "./HudIcons";
import { ChromeClose } from "../chrome/Chrome";
import { GameSheet, Meter } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForCrop, atlasForGrowth } from "../chrome/uiAtlas";

export interface CropInspectionProps {
  inspection: CropInspectionDto;
  projectedPosition?: { x: number; y: number; visible: boolean } | null;
  onClose?: () => void;
  onUnroot?: (placedCropId: string) => void;
  className?: string;
}

const titleCase = (value: string): string =>
  value.replace(/(^|[-_])\w/g, (match) => match.replace(/[-_]/, "").toUpperCase());

/**
 * Browsers measure the card before paint; the static renderer does not measure
 * at all, where effects are inert anyway. This keeps the SSR markup warning-free.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export const CropInspection: React.FC<CropInspectionProps> = ({
  inspection,
  projectedPosition,
  onClose,
  onUnroot,
  className = ""
}) => {
  const sheetRef = useRef<HTMLElement | null>(null);
  const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number } | null>(null);
  const [unrootArmed, setUnrootArmed] = useState(false);

  const moistureTone =
    inspection.moisture.band === "wet"
      ? "wet"
      : inspection.moisture.band === "normal"
        ? "ideal"
        : "dry";
  const showsUnroot = Boolean(onUnroot) && inspection.stage !== "withered";

  // Measure the rendered card instead of trusting a magic height. The unroot
  // hint wraps to a variable number of lines, and an underestimated height let
  // the card drift down over the crop anchor it is supposed to sit above.
  useIsomorphicLayoutEffect(() => {
    const element = sheetRef.current;
    if (!element) return;
    const measure = (): void => {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (width <= 0 || height <= 0) return;
      setMeasuredSize((current) =>
        current && current.width === width && current.height === height
          ? current
          : { width, height }
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A different planting or a newly blocked action invalidates an armed confirm.
  useEffect(() => {
    setUnrootArmed(false);
  }, [inspection.placedCropId, inspection.actions.canUnroot]);

  const projectedStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!projectedPosition || !projectedPosition.visible) return undefined;
    if (typeof window === "undefined") return undefined;

    const cardWidth = measuredSize?.width ?? 300;
    const cardHeight = measuredSize?.height ?? 180;
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
      zIndex: 35
    };
  }, [projectedPosition, measuredSize]);

  return (
    <GameSheet
      ref={sheetRef}
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
          <div className="crop-meta-item crop-growth-item">
            <dt>Stage</dt>
            <dd className="crop-growth-status">
              {/* Simulation-owned progress; the UI never re-derives growth. */}
              <Meter
                className="crop-growth-meter"
                label="Growth"
                value={Math.round(inspection.maturityProgress * 100)}
                max={100}
                variant="labor"
                fill="labor"
                showLabel={false}
                valueText={inspection.stageTimingLabel}
                data-testid="crop-growth-meter"
              />
            </dd>
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

      {showsUnroot && onUnroot && (
        <div className={`crop-unroot-row${unrootArmed ? " is-armed" : ""}`}>
          {unrootArmed ? (
            <>
              <span className="crop-unroot-warning" role="status">
                Destroys the planting; no seed is returned
              </span>
              <div className="crop-unroot-actions">
                <button
                  type="button"
                  className="crop-unroot-btn is-armed"
                  data-testid="crop-unroot-confirm"
                  autoFocus
                  onClick={() => onUnroot(inspection.placedCropId)}
                >
                  Confirm unroot · {inspection.unrootWork.cost} Work
                </button>
                <button
                  type="button"
                  className="crop-unroot-cancel"
                  data-testid="crop-unroot-cancel"
                  onClick={() => setUnrootArmed(false)}
                >
                  Keep
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="crop-unroot-btn"
                data-testid="crop-unroot-action"
                disabled={!inspection.actions.canUnroot}
                title={
                  inspection.actions.unrootReason
                  ?? "Remove the planting for work; the seed is not returned"
                }
                onClick={() => setUnrootArmed(true)}
              >
                Unroot · {inspection.unrootWork.cost} Work
              </button>
              <span className="crop-unroot-reason">
                {inspection.actions.canUnroot
                  ? "Removes the planting; no seed is returned"
                  : inspection.actions.unrootReason}
              </span>
            </>
          )}
        </div>
      )}
    </GameSheet>
  );
};
