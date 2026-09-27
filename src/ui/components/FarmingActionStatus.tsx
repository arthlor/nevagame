import React from "react";
import type { FarmingActionSnapshot } from "../../app/FarmingActionController";
import { AUTHORED_ACTION_TIMINGS } from "../../app/FarmingActionController";
import { GameSheet, Meter } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForAction } from "../chrome/uiAtlas";
import { IconEnergy } from "./HudIcons";
import { useTranslation } from "../../i18n/useTranslation";

export interface FarmingActionStatusProps {
  action: FarmingActionSnapshot;
  className?: string;
}

export const ACTION_LABELS: Record<FarmingActionSnapshot["action"], { title: string; hint?: string }> = {
  plant: { title: "Planting seeds…", hint: "Sowing seed into tilled soil" },
  water: { title: "Watering soil…", hint: "Irrigating crop bed" },
  fertilize: { title: "Fertilizing soil…", hint: "Enriching soil nutrients" },
  harvest: { title: "Harvesting crop…", hint: "Gathering farm produce" },
  unroot: { title: "Uprooting…", hint: "Removing the planting" },
  "processing-start": { title: "Preparing the station…", hint: "Loading artisan station" },
  "processing-collect": { title: "Collecting your work…", hint: "Gathering processed goods" },
  pickup: { title: "Picking up…", hint: "Lifting physical item" },
  place: { title: "Placing…", hint: "Setting down item" },
  workstation: { title: "Working…", hint: "Operating artisan station" },
  cast: { title: "Casting line…", hint: "Deploying fishing tackle" },
  board: { title: "Boarding vessel…", hint: "Stepping onto deck" },
  dock: { title: "Docking vessel…", hint: "Securing boat to pier" }
};

export const ACTION_LABELS_TR: Record<FarmingActionSnapshot["action"], { title: string; hint?: string }> = {
  plant: { title: "Tohum ekiliyor…", hint: "Sürülmüş toprağa tohum serpiliyor" },
  water: { title: "Toprak sulanıyor…", hint: "Ekin yatağı sulanıyor" },
  fertilize: { title: "Gübreleniyor…", hint: "Toprağın besini artırılıyor" },
  harvest: { title: "Hasat ediliyor…", hint: "Çiftlik mahsulü toplanıyor" },
  unroot: { title: "Kökünden sökülüyor…", hint: "Ekin topraktan kaldırılıyor" },
  "processing-start": { title: "Tezgâh hazırlanıyor…", hint: "Zanaat tezgâhı dolduruluyor" },
  "processing-collect": { title: "Mahsul toplanıyor…", hint: "İşlenmiş ürünler toplanıyor" },
  pickup: { title: "Yerden alınıyor…", hint: "Eşya kaldırılıyor" },
  place: { title: "Yerleştiriliyor…", hint: "Eşya yere bırakılıyor" },
  workstation: { title: "Çalışılıyor…", hint: "Zanaat tezgâhı işletiliyor" },
  cast: { title: "Olta savruluyor…", hint: "Balık oltası denize atılıyor" },
  board: { title: "Tekneye biniliyor…", hint: "Güverteye adım atılıyor" },
  dock: { title: "Yanaşılıyor…", hint: "Tekne iskeleye bağlanıyor" }
};

const FALLBACK_TIMING = { durationMs: 2000, commitMs: 1000 };

export const FarmingActionStatus: React.FC<FarmingActionStatusProps> = ({ action, className = "" }) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const labelMap = isTr ? ACTION_LABELS_TR : ACTION_LABELS;

  const meta = action.action === "harvest" && action.workCost === 0
    ? (isTr ? { title: "Ekin temizleniyor…", hint: "Kurumuş ekin kaldırılıyor" } : { title: "Clearing crop…", hint: "Removing withered crop" })
    : labelMap[action.action] ?? (isTr ? { title: "Çalışılıyor…", hint: "Eylem devam ediyor" } : { title: "Working…", hint: "Action in progress" });
  const progress = Number.isFinite(action.progress) ? Math.max(0, Math.min(1, action.progress)) : 0;
  const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));
  const isCommitted = action.committed;

  const timing = (AUTHORED_ACTION_TIMINGS && AUTHORED_ACTION_TIMINGS[action.action]) || FALLBACK_TIMING;
  const totalSec = timing.durationMs / 1000;
  const elapsedSec = (progress * timing.durationMs) / 1000;
  const commitPercent = Math.min(100, Math.max(0, Math.round((timing.commitMs / timing.durationMs) * 100)));
  const workCost = action.commitSucceeded === false ? null : action.workCost;

  return (
    <GameSheet
      family="ink"
      tone="slate"
      corners
      className={`farming-action-status action-${action.action} mmo-cast-bar ${className}`.trim()}
      role="status"
      aria-live="polite"
      data-testid="farming-action-status"
    >
      <div className="cast-bar-inner">
        <div className="cast-bar-header">
          <div className="cast-bar-title-row">
            <AtlasImage
              src={atlasForAction(action.action)}
              className="farming-action-icon cast-bar-action-icon"
              size={22}
              aria-hidden="true"
            />
            <strong className="cast-bar-action-title">{meta.title}</strong>
            {workCost != null && workCost > 0 && (
              <span
                className="cast-bar-work-chip"
                title={isTr ? `${workCost} Emek tüketir` : `Consumes ${workCost} Work`}
                data-testid="cast-bar-work-cost"
              >
                <IconEnergy size={12} aria-hidden="true" /> {`-${workCost} ${isTr ? "Emek" : "Work"}`}
              </span>
            )}
          </div>
          <span className="cast-bar-timing" aria-hidden="true">
            {`${elapsedSec.toFixed(1)}s / ${totalSec.toFixed(1)}s`}
          </span>
        </div>

        <div className="cast-bar-track-wrapper">
          <Meter
            className="farming-action-meter cast-bar-meter"
            label={meta.title}
            value={percent}
            max={100}
            valueText={`${percent}%`}
            variant="gold"
            showLabel={false}
            showValue={false}
          />
          {/* Commit Marker Threshold */}
          <div
            className="cast-bar-commit-marker"
            style={{ left: `${commitPercent}%` }}
            title={isTr ? "Emek burada işlenir" : "Work takes effect here"}
            aria-hidden="true"
          />
          {/* Channeling Progress Spark */}
          <div
            className="cast-bar-spark"
            style={{ left: `${percent}%` }}
            aria-hidden="true"
          />
        </div>

        <footer className="cast-bar-footer">
          <span className={`cast-bar-status-text ${isCommitted ? "is-committed" : ""}`}>
            {isCommitted ? "Finishing…" : "Working…"}
          </span>
          {action.interruptible && !isCommitted ? (
            <span className="cast-bar-cancel-hint">
              Move or press <kbd>Esc</kbd> to cancel
            </span>
          ) : isCommitted ? (
            <span className="cast-bar-cancel-hint is-committed-hint">
              Cannot cancel now
            </span>
          ) : null}
        </footer>
      </div>
    </GameSheet>
  );
};
