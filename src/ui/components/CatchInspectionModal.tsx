import { useModalAccessibility } from "../useModalAccessibility";
import React, { useEffect, useRef } from "react";
import type { TrophyCatchDto } from "../../simulation/core/contracts";
import { IconFish, IconSparkle, IconStar} from "./HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { ChromeButton, ChromeClose, ChromeQuality } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { playUiSound } from "../audio/uiAudio";
import { useTranslation } from "../../i18n/useTranslation";

export { CatchSummaryToast, type CatchSummaryToastProps } from "./CatchSummaryToast";

export interface CatchInspectionModalProps {
  catchData: TrophyCatchDto;
  onDismiss: () => void;
  onOpenHoldOrSatchel?: () => void;
  className?: string;
}

const RECORD_LABELS_EN: Record<"first" | "weight" | "quality", { title: string; subtitle: string }> = {
  first: { title: "A new discovery", subtitle: "Added to your almanac" },
  weight: { title: "Your heaviest yet", subtitle: "A new personal weight record" },
  quality: { title: "Your finest yet", subtitle: "A new personal quality record" }
};

const RECORD_LABELS_TR: Record<"first" | "weight" | "quality", { title: string; subtitle: string }> = {
  first: { title: "Yeni bir keşif", subtitle: "Almanağına eklendi" },
  weight: { title: "En ağır avın", subtitle: "Yeni kişisel ağırlık rekoru" },
  quality: { title: "En kusursuz avın", subtitle: "Yeni kişisel kalite rekoru" }
};

export const CatchInspectionModal: React.FC<CatchInspectionModalProps> = ({
  catchData,
  onDismiss,
  onOpenHoldOrSatchel,
  className = ""
}) => {
  const { locale, getLocalizedFish } = useTranslation();
  const modalRef = useRef<HTMLElement>(null);
  useModalAccessibility(modalRef, onDismiss);
  useEffect(() => { playUiSound("perfect"); }, []);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === " " || event.key === "Enter") && event.target instanceof Element && event.target.closest("button, input, select, textarea, a[href]")) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      } else if ((event.key === "i" || event.key === "I") && onOpenHoldOrSatchel) {
        event.preventDefault();
        event.stopPropagation();
        onOpenHoldOrSatchel();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onDismiss, onOpenHoldOrSatchel]);

  const recordLabels = locale === "tr" ? RECORD_LABELS_TR : RECORD_LABELS_EN;
  const speciesDisplayName = (locale === "tr" ? getLocalizedFish(catchData.speciesId).name : null) || catchData.speciesName;
  const storageLabel = locale === "tr" ? {
    "player-carry": "Elde taşınıyor", "boat-hold": "Tekne ambarında",
    "boat-hook": "Ayna kancasında", "cold-storage": "Soğuk depoda",
    crate: "Sandıkta", carriage: "Araba kasasında", ground: "Yerde"
  }[catchData.storageDestination] : catchData.storageLocationLabel;
  const cargoClass = locale === "tr" ? {
    small: "Küçük yük", medium: "Orta yük", large: "Büyük yük", gargantuan: "Dev yük"
  }[catchData.cargoClass] : `${catchData.cargoClass.toUpperCase()} CLASS`;

  return (
    <div
      className="modal-backdrop catch-inspection-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <GameSheet
        ref={modalRef}
        as="section"
        className={`catch-inspection-modal interactive ${className}`.trim()}
        tone="plaque"
        corners
        rivets
        role="dialog"
        aria-modal="true"
        aria-labelledby="catch-modal-title"
        tabIndex={-1}
        data-testid="catch-inspection-modal"
      >
        <header className="catch-modal-header">
          <div className="catch-celebration-title">
            <span className="catch-celebration-subtitle sr-only">
              {locale === "tr" ? "Kıyı Sportif Balıkçılığı" : "Coastal Sport Angling"}
            </span>
            <strong id="catch-modal-title" className="catch-celebration-headline">
              {locale === "tr" ? "Balık karaya çekildi" : "Catch landed"}
            </strong>
          </div>
          <ChromeClose
            onClick={onDismiss}
            label={locale === "tr" ? "Kupa incelemesini kapat" : "Close trophy inspection"}
            className="catch-modal-close"
          />
        </header>

        {catchData.record && (
          <div className={`catch-record-banner record-${catchData.record}`} role="status">
            <span className="record-star-glyph"><IconSparkle size={13} /></span>
            <div className="record-text-group">
              <strong className="record-title">{recordLabels[catchData.record].title}</strong>
              {catchData.record === "first" && <span className="record-subtitle">{recordLabels[catchData.record].subtitle}</span>}
            </div>
            <span className="record-star-glyph"><IconSparkle size={13} /></span>
          </div>
        )}

        <div className="catch-modal-body">
          <div className="catch-portrait-column">
            <div className="catch-portrait-frame">
              <AtlasImage src={atlasForFish(catchData.speciesId)} alt={speciesDisplayName} size={96} />
              {!atlasForFish(catchData.speciesId) && <IconFish size={64} aria-hidden="true" />}
            </div>
            <div className="catch-quality-badge-row">
              <span
                className="catch-stars"
                aria-label={locale === "tr" ? `4 yıldız üzerinden ${catchData.qualityStars} yıldız` : `${catchData.qualityStars} out of 4 stars`}
              >
                {Array.from({ length: 4 }, (_, index) => (
                  <IconStar
                    key={index}
                    size={14}
                    filled={index < catchData.qualityStars}
                    className={index < catchData.qualityStars ? "is-earned" : "is-unearned"}
                  />
                ))}
              </span>
              <ChromeQuality quality={catchData.quality} />
            </div>
            <span className="catch-cargo-class">
              {cargoClass}
            </span>
          </div>

          <div className="catch-details-column">
            <h3 className="catch-species-name">{speciesDisplayName}</h3>

            <dl className="catch-metrics-grid">
              <div className="catch-metric-tile">
                <dt>{locale === "tr" ? "Ağırlık" : "Weight"}</dt>
                <dd className="metric-weight">{`${catchData.weightKg.toFixed(2)} kg`}</dd>
              </div>

              <div className="catch-metric-tile">
                <dt>{locale === "tr" ? "Boy" : "Length"}</dt>
                <dd className="metric-length">{`${catchData.lengthCm.toFixed(1)} cm`}</dd>
              </div>

              <div className="catch-metric-tile catch-metric-tile--freshness">
                <dt>{locale === "tr" ? "Tazelik" : "Freshness"}</dt>
                <dd className={`metric-freshness freshness-${catchData.freshnessTone}`}>
                  <span className="freshness-value">{`${catchData.freshnessPercent}%`}</span>
                  <small className="freshness-shelf">
                    {locale === "tr"
                      ? `~${catchData.estimatedShelfLifeMinutes} dk kaldı`
                      : `~${catchData.estimatedShelfLifeMinutes}m remaining`}
                  </small>
                </dd>
              </div>
            </dl>

            <div className="catch-storage-box">
              <span className="storage-destination-label">{locale === "tr" ? "Depo:" : "Storage:"}</span>
              <strong>{storageLabel}</strong>
            </div>
          </div>
        </div>

        <footer className="catch-modal-footer">
          {onOpenHoldOrSatchel && (
            <ChromeButton
              variant="secondary"
              onClick={onOpenHoldOrSatchel}
              className="catch-inspect-hold-btn"
            >
              {locale === "tr" ? "Heybeyi Aç" : "Open Satchel"} <kbd className="catch-keycap" aria-hidden="true">[I]</kbd>
            </ChromeButton>
          )}
          <ChromeButton
            variant="primary"
            onClick={onDismiss}
            className="catch-continue-btn"
          >
            {locale === "tr" ? "Kıyıya Dön" : "Back to the coast"} <kbd className="catch-keycap" aria-hidden="true">[Space]</kbd>
          </ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};
