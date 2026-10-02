import { tradePackName } from "../i18n/tradePackNames";
import { villageTradeTextTr } from "../i18n/villageTradeText";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  InteractionResult,
  ProcessingRecipeRowDto,
  ProcessingStationDto
} from "../simulation/core/contracts";
import type { RecipeId } from "../simulation/core/types";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import { IconHourglass, IconPack } from "./components/HudIcons";
import { GameSheet } from "./coastal/CoastalUI";
import { useModalAccessibility } from "./useModalAccessibility";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForEquipment, atlasForItem } from "./chrome/uiAtlas";
import { useTranslation } from "../i18n/useTranslation";

export interface CraftingModalProps {
  station: ProcessingStationDto;
  onClose: () => void;
  onStart: (recipeId: RecipeId, stationId: string) => InteractionResult;
}

function recipeSprite(recipe: ProcessingRecipeRowDto): string | undefined {
  return recipe.result.kind === "equipment"
    ? atlasForEquipment(recipe.result.equipmentId)
    : atlasForItem(recipe.result.kind === "farm-pack" ? recipe.result.itemId : recipe.result.stacks[0]?.itemId);
}

export const CraftingModal: React.FC<CraftingModalProps> = ({ station, onClose, onStart }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);
  const {
    t,
    getLocalizedRecipe,
    getLocalizedItem,
    getLocalizedMarket,
    getLocalizedStationTitle,
    getLocalizedCraftingState,
    translateReason,
    locale
  } = useTranslation();
  const isTr = locale === "tr";
  const outputLabel = (recipe: ProcessingRecipeRowDto) => recipe.result.kind === "farm-pack"
    ? recipe.result.tradePackId ? tradePackName(recipe.result.tradePackId, recipe.outputLabel, locale)
      : `${getLocalizedItem(recipe.result.itemId).name} ${isTr ? "paketi" : "trade pack"}` : recipe.outputLabel;

  const firstUsefulId = useMemo(
    () => station.recipes.find((recipe) => recipe.state === "quest-target" || recipe.state === "craftable")?.recipeId
      ?? station.recipes[0]?.recipeId
      ?? null,
    [station.recipes]
  );
  const [selectedId, setSelectedId] = useState<RecipeId | null>(firstUsefulId);
  const [feedback, setFeedback] = useState<string | null>(null);
  const selected = station.recipes.find((recipe) => recipe.recipeId === selectedId)
    ?? station.recipes[0]
    ?? null;
  const blockerLabel = (blocker: string): string => {
    if (!isTr || !selected) return blocker;
    const need = blocker.match(/^Need (\d+) (.+)$/);
    const input = need && selected.inputs.find(item => item.name === need[2]);
    return input ? `${need![1]} ${getLocalizedItem(input.itemId).name} gerekiyor` : villageTradeTextTr(blocker);
  };

  useEffect(() => {
    if (!station.recipes.some((recipe) => recipe.recipeId === selectedId)) setSelectedId(firstUsefulId);
  }, [firstUsefulId, selectedId, station.recipes]);

  const begin = (): void => {
    if (!selected) return;
    const result = onStart(selected.recipeId, station.stationId);
    if (result.success) onClose();
    else setFeedback(blockerLabel(result.reason ?? (isTr ? "Bu iş başlatılamıyor" : "That job cannot start")));
  };

  const neutral = selected?.work.neutralCost ?? selected?.work.cost;
  const saved = selected ? Math.max(0, neutral - selected.work.cost) : 0;

  return (
    <div className="modal-overlay interactive crafting-modal-overlay" onClick={onClose}>
      <GameSheet
        ref={modalRef}
        as="section"
        className="neva-panel modal-content crafting-modal"
        tone="slate"
        corners
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crafting-modal-title"
        tabIndex={-1}
      >
        <header className="modal-header crafting-modal__header">
          <div>
            <h2 id="crafting-modal-title">{station.stationType === "trading-station" ? (isTr ? "Köy Paketleme Tezgâhı" : "Village Packing Yard") : getLocalizedStationTitle(station.stationType)}</h2>
          </div>
          <ChromeClose onClick={onClose} label={isTr ? "Üretimi kapat" : "Close crafting"} />
        </header>

        {station.job ? (
          <div className="crafting-job-state" aria-live="polite">
            <span className={`crafting-job-state__seal is-${station.job.status}`} aria-hidden="true"><IconHourglass size={34} /></span>
            <div>
              <small>{station.job.status === "complete" ? (isTr ? "Teslim almaya hazır" : "Ready to collect") : (isTr ? "Sürüyor" : "In progress")}</small>
              <h3>{getLocalizedRecipe(station.job.recipeId).name ?? station.job.recipeName}</h3>
              {station.job.status !== "complete" && <p>{isTr ? `${station.job.remainingMinutes} oyun dakikası · ${station.job.readyClockLabel} hazır` : station.job.waitBriefing}</p>}
              <strong>{tradePackName(station.job.tradePackId, station.job.outputName, locale)}</strong>
              <p>{isTr ? `+${station.job.xpReward} İşleme TP` : `+${station.job.xpReward} Processing XP`}</p>
            </div>
          </div>
        ) : (
          <div className="crafting-modal__body">
            <nav className="crafting-recipe-list" aria-label={isTr ? "Tarifler" : "Recipes"}>
              {station.recipes.map((recipe) => {
                const localizedName = getLocalizedRecipe(recipe.recipeId).name ?? recipe.name;
                return (
                  <button
                    type="button"
                    key={recipe.recipeId}
                    className={`crafting-recipe-row is-${recipe.state} ${selected?.recipeId === recipe.recipeId ? "is-selected" : ""}`}
                    onClick={() => {
                      setSelectedId(recipe.recipeId);
                      setFeedback(null);
                    }}
                    aria-pressed={selected?.recipeId === recipe.recipeId}
                    aria-controls="crafting-recipe-detail"
                  >
                    <span className="crafting-recipe-row__mark" aria-hidden="true">
                      <AtlasImage src={recipeSprite(recipe)} size={30} aria-hidden="true" />
                      {!recipeSprite(recipe) && (recipe.result.kind === "farm-pack" ? <IconPack size={26} /> : recipe.result.kind === "equipment" ? "◇" : "▧")}
                    </span>
                    <span><strong>{localizedName}</strong><small>{outputLabel(recipe)}</small></span>
                    <em>{getLocalizedCraftingState(recipe.state)}</em>
                  </button>
                );
              })}
            </nav>

            <section id="crafting-recipe-detail" className="crafting-recipe-detail" aria-live="polite">
              {selected ? (
                <>
                  <div className="crafting-recipe-detail__title">
                    <div>{selected.workTier === "masterwork" && <small>{isTr ? "Usta İşi" : "Masterwork"}</small>}<h3>{getLocalizedRecipe(selected.recipeId).name ?? selected.name}</h3></div>
                    <strong>{outputLabel(selected)}</strong>
                  </div>

                  <div className="crafting-requirements">
                    <h4>{t("crafting.ingredientsRequired")}</h4>
                    {selected.inputs.map((input) => (
                      <div className={`crafting-requirement ${input.enough ? "is-ready" : "is-short"}`} key={input.itemId}>
                        <span className="crafting-requirement__item">
                          <AtlasImage src={atlasForItem(input.itemId)} size={28} aria-hidden="true" />
                          <span>{getLocalizedItem(input.itemId).name ?? input.name}
                            {input.sources && input.sources.length > 0 && <details className="crafting-ingredient-sources"><summary>{isTr ? "Nereden alınır?" : "Where to buy"}</summary>
                              {input.sources.map(source => <p key={source.marketId}>{getLocalizedMarket(source.marketId).name} · {source.stock} {isTr ? "stokta" : "in stock"} · {input.required} {isTr ? "adet" : "units"}: {source.cost} G</p>)}
                            </details>}
                          </span>
                        </span>
                        <strong>{input.owned} / {input.required}</strong>
                      </div>
                    ))}
                  </div>

                  <dl className="crafting-job-facts">
                    {selected.result.kind === 'farm-pack' && <div><dt>{isTr ? "Paketleme ücreti" : "Packing fee"}</dt><dd>{selected.costMoney ?? 0} G</dd></div>}
                    <div><dt>{t("hud.workCapacity")}</dt><dd>{selected.work.cost}{saved > 0 ? (isTr ? ` (${saved} tasarruf)` : ` (${saved} saved)`) : ""}</dd></div>
                    <div><dt>{isTr ? "Süre" : "Duration"}</dt><dd>{selected.durationLabel}</dd></div>
                    <div><dt>{isTr ? "Teslim alınca" : "On collection"}</dt><dd>{isTr ? `+${selected.xpReward} İşleme TP` : `+${selected.xpReward} Processing XP`}</dd></div>
                  </dl>
                  {selected.tradeDestinations && <section className="crafting-trade-routes">
                    <details className="crafting-trade-details"><summary>{isTr ? "Teslimat teklifleri" : "Delivery estimates"}</summary>
                    <p>{isTr ? "Varıştaki talep ve tazeliğe göre değişir. Benzer paketler talebi paylaşır." : "Values change with demand and freshness. Related packs share demand."}</p>
                    <p>{isTr ? "Malzeme + paketleme" : "Ingredients + packing"}: {selected.replacementCost === null ? (isTr ? "Stok yetersiz" : "Not enough market stock") : `${selected.replacementCost} G`}. {isTr ? "Kendi ürünlerin alış fiyatıyla hesaplanır. Yol masrafları hariç." : "Own ingredients use purchase prices. Travel costs excluded."}</p>
                    <p>{selected.decayPerMinute === 0 ? (isTr ? "Bozulmaz." : "Does not spoil.") : (isTr ? "Tazelik zamanla azalır." : "Freshness decreases over time.")}</p>
                    <dl className="crafting-job-facts">{selected.tradeDestinations.map(route => <div key={route.marketId}>
                      <dt>{getLocalizedMarket(route.marketId).name} · {(route.routeMeters / 1000).toFixed(1)} km</dt><dd>{route.gold} G · +{route.tradingXp} {isTr ? "Ticaret TP" : "Trading XP"}<br />
                        {isTr ? "Kazanç" : "Margin"}: {route.estimatedMargin === null ? '—' : `${route.estimatedMargin} G`} · {isTr ? "Talep" : "Demand"}: {route.demandPercent}%</dd>
                    </div>)}</dl>
                    </details>
                  </section>}
                  <p className="crafting-collection-note">{selected.result.kind === "farm-pack" ? (isTr ? "Boş ellerinle al, köy tezgâhına taşı." : "Collect with empty hands; carry to a village counter.") : isTr ? "Hazır olduğunda buradan al. Heybende yer ayır." : "Collect here when ready. Leave room in your satchel."}</p>

                  {(selected.work.roundingLimited || selected.work.throughputCapLimited) && (
                    <p className="crafting-rounding-note">
                      {isTr
                        ? (selected.work.roundingLimited
                          ? "En düşük Emek maliyeti."
                          : "Donanım tasarrufu azami düzeyde.")
                        : (selected.work.roundingLimited
                          ? "Minimum Work cost."
                          : "Maximum gear saving.")}
                    </p>
                  )}

                  {selected.blockers.length > 0 && (
                    <div className="crafting-blockers" role="status">
                      <strong>{selected.state === "locked" ? (isTr ? "Henüz öğrenilmedi" : "Not learned yet") : (isTr ? "Başlamadan önce" : "Before starting")}</strong>
                      <ul>{selected.blockers.map((blocker) => <li key={blocker}>{blockerLabel(blocker)}</li>)}</ul>
                    </div>
                  )}
                </>
              ) : <p>{isTr ? "Bu tezgâhta henüz üretilecek bir şey yok." : "There is nothing to make at this station yet."}</p>}
            </section>
          </div>
        )}

        <footer className="modal-footer crafting-modal__footer">
          <span role="status">{
            !station.withinReach
              ? (translateReason(station.reachBlocker) || (isTr ? "Tezgâha yaklaş." : "Move to the station."))
              : feedback ?? (station.job ? (station.job.status === "complete" ? (isTr ? "Kapat, tezgâhtan teslim al." : "Close, then collect at the station.") : (isTr ? "Hazır olduğunda tezgâha dön." : "Return when ready.")) : (isTr ? "Malzemeler, Emek ve ücret başlangıçta harcanır." : "Materials, Work and fees are spent on start."))
          }</span>
          {!station.job && selected && (
            <ChromeButton
              type="button"
              disabled={selected.state === "locked" || selected.blockers.length > 0 || !station.withinReach}
              onClick={begin}
            aria-label={isTr ? `${getLocalizedRecipe(selected.recipeId).name ?? selected.name} başlat` : `Start ${getLocalizedRecipe(selected.recipeId).name ?? selected.name}`}
            >{isTr ? "Başlat" : "Start"}</ChromeButton>
          )}
        </footer>

      </GameSheet>
    </div>
  );
};
