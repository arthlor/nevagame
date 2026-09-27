import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CropInspectionDto } from "../../simulation/core/contracts";
import { IconSprout } from "./HudIcons";
import { ChromeClose } from "../chrome/Chrome";
import { GameSheet, Meter } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForCrop, atlasForGrowth } from "../chrome/uiAtlas";
import { useTranslation } from "../../i18n/useTranslation";

export interface CropInspectionProps {
  inspection: CropInspectionDto;
  projectedPosition?: { x: number; y: number; visible: boolean } | null;
  onClose?: () => void;
  onUnroot?: (placedCropId: string) => void;
  className?: string;
}

const titleCase = (value: string): string =>
  value.replace(/(^|[-_])\w/g, (match) => match.replace(/[-_]/, "").toUpperCase());

const STAGE_TR: Record<string, string> = {
  seed: "Tohum",
  sprout: "Filiz",
  vegetative: "Gelişme",
  flowering: "Çiçeklenme",
  mature: "Olgun",
  harvestable: "Hasada Hazır",
  withered: "Solmuş"
};

const MOISTURE_TR: Record<string, string> = {
  dry: "Kuru",
  normal: "İdeal",
  wet: "Islak"
};

const SOIL_TR: Record<string, string> = {
  poor: "Zayıf",
  fair: "Orta",
  good: "İyi",
  rich: "Verimli"
};

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
  const { locale, getLocalizedCrop } = useTranslation();
  const isTr = locale === "tr";

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

    const rawLeft = projectedPosition.x - cardWidth / 2;
    const rawTop = projectedPosition.y - cardHeight - 20;

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

  const cropDisplayName = (isTr ? getLocalizedCrop(inspection.cropId).name : null) || inspection.name;
  const stageDisplay = isTr ? (STAGE_TR[inspection.stage] ?? titleCase(inspection.stage)) : titleCase(inspection.stage);
  const moistureDisplay = isTr ? (MOISTURE_TR[inspection.moisture.band] ?? titleCase(inspection.moisture.band)) : titleCase(inspection.moisture.band);
  const soilDisplay = inspection.soil ? (isTr ? (SOIL_TR[inspection.soil.band] ?? titleCase(inspection.soil.band)) : titleCase(inspection.soil.band)) : null;

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
      aria-label={`${cropDisplayName} crop inspection`}
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
          <strong>{cropDisplayName}</strong>
        </div>
        <div className="crop-header-right">
          <span className={`crop-stage-chip stage-${inspection.stage}`}>
            {stageDisplay}
          </span>
          {onClose && (
            <ChromeClose
              onClick={onClose}
              label={isTr ? "Ekin incelemesini kapat" : "Close crop inspection"}
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
            <dt>{isTr ? "Aşama" : "Stage"}</dt>
            <dd className="crop-growth-status">
              <Meter
                className="crop-growth-meter"
                label={isTr ? "Büyüme" : "Growth"}
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
            <dt>{isTr ? "Nem" : "Moisture"}</dt>
            <dd className={`moisture-badge moisture-${moistureTone}`}>
              {moistureDisplay}
            </dd>
          </div>
          {inspection.soil && (
            <div className="crop-meta-item">
              <dt>{isTr ? "Toprak" : "Soil"}</dt>
              <dd className={`soil-badge soil-${inspection.soil.band}`}>
                {soilDisplay}
              </dd>
            </div>
          )}
          <div className="crop-meta-item crop-next-action">
            <dt>{isTr ? "Sıradaki" : "Next"}</dt>
            <dd>
              <strong>{inspection.immediateAction.label}</strong>
              {inspection.immediateAction.cost != null && (
                <span>{inspection.immediateAction.cost} {isTr ? "Emek" : "Work"}</span>
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
                {isTr ? "Ekini söker; tohum geri gelmez" : "Destroys the planting; no seed is returned"}
              </span>
              <div className="crop-unroot-actions">
                <button
                  type="button"
                  className="crop-unroot-btn is-armed"
                  data-testid="crop-unroot-confirm"
                  autoFocus
                  onClick={() => onUnroot(inspection.placedCropId)}
                >
                  {isTr
                    ? `Sökmeyi onayla · ${inspection.unrootWork.cost} Emek`
                    : `Confirm unroot · ${inspection.unrootWork.cost} Work`}
                </button>
                <button
                  type="button"
                  className="crop-unroot-cancel"
                  data-testid="crop-unroot-cancel"
                  onClick={() => setUnrootArmed(false)}
                >
                  {isTr ? "Vazgeç" : "Keep"}
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
                  ?? (isTr
                      ? "Emek karşılığı ekini kaldır; tohum geri gelmez"
                      : "Remove the planting for work; the seed is not returned")
                }
                onClick={() => setUnrootArmed(true)}
              >
                {isTr
                  ? `Kökünden sök · ${inspection.unrootWork.cost} Emek`
                  : `Unroot · ${inspection.unrootWork.cost} Work`}
              </button>
              <span className="crop-unroot-reason">
                {inspection.actions.canUnroot
                  ? (isTr ? "Ekini kaldırır; tohum geri gelmez" : "Removes the planting; no seed is returned")
                  : inspection.actions.unrootReason}
              </span>
            </>
          )}
        </div>
      )}
    </GameSheet>
  );
};
