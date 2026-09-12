import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  InteractionResult,
  ProcessingRecipeRowDto,
  ProcessingStationDto
} from "../simulation/core/contracts";
import type { RecipeId } from "../simulation/core/types";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import { GameSheet } from "./coastal/CoastalUI";
import { useModalAccessibility } from "./useModalAccessibility";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForEquipment, atlasForItem } from "./chrome/uiAtlas";

export interface CraftingModalProps {
  station: ProcessingStationDto;
  onClose: () => void;
  onStart: (recipeId: RecipeId, stationId: string) => InteractionResult;
}

function stationTitle(type: string): string {
  return {
    "hand-mill": "Hand Mill",
    workbench: "Workbench",
    "fish-table": "Fish Table",
    "compost-bin": "Compost Bin"
  }[type] ?? "Crafting Station";
}

function stateLabel(state: ProcessingRecipeRowDto["state"]): string {
  return {
    "quest-target": "Quest",
    craftable: "Ready",
    blocked: "Blocked",
    locked: "Locked"
  }[state];
}

function recipeSprite(recipe: ProcessingRecipeRowDto): string | undefined {
  return recipe.result.kind === "equipment"
    ? atlasForEquipment(recipe.result.equipmentId)
    : atlasForItem(recipe.result.stacks[0]?.itemId);
}

export const CraftingModal: React.FC<CraftingModalProps> = ({ station, onClose, onStart }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);
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

  useEffect(() => {
    if (!station.recipes.some((recipe) => recipe.recipeId === selectedId)) setSelectedId(firstUsefulId);
  }, [firstUsefulId, selectedId, station.recipes]);

  const begin = (): void => {
    if (!selected) return;
    const result = onStart(selected.recipeId, station.stationId);
    if (result.success) onClose();
    else setFeedback(result.reason ?? "That job cannot start");
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
            <h2 id="crafting-modal-title">{stationTitle(station.stationType)}</h2>
            <p>{station.job ? "Your work at this station" : "Choose what to make"}</p>
          </div>
          <ChromeClose onClick={onClose} label="Close crafting" />
        </header>

        {station.job ? (
          <div className="crafting-job-state" aria-live="polite">
            <span className={`crafting-job-state__seal is-${station.job.status}`} aria-hidden="true">⌛</span>
            <div>
              <small>{station.job.status === "complete" ? "Ready to collect" : "In progress"}</small>
              <h3>{station.job.recipeName}</h3>
              <p>{station.job.waitBriefing}</p>
              <strong>{station.job.outputName}</strong>
            </div>
          </div>
        ) : (
          <div className="crafting-modal__body">
            <nav className="crafting-recipe-list" aria-label="Recipes">
              {station.recipes.map((recipe) => (
                <button
                  type="button"
                  key={recipe.recipeId}
                  className={`crafting-recipe-row is-${recipe.state} ${selected?.recipeId === recipe.recipeId ? "is-selected" : ""}`}
                  onClick={() => {
                    setSelectedId(recipe.recipeId);
                    setFeedback(null);
                  }}
                  aria-pressed={selected?.recipeId === recipe.recipeId}
                >
                  <span className="crafting-recipe-row__mark" aria-hidden="true">
                    <AtlasImage src={recipeSprite(recipe)} size={30} aria-hidden="true" />
                    {!recipeSprite(recipe) && (recipe.result.kind === "equipment" ? "◇" : "▧")}
                  </span>
                  <span><strong>{recipe.name}</strong><small>{recipe.outputLabel}</small></span>
                  <em>{stateLabel(recipe.state)}</em>
                </button>
              ))}
            </nav>

            <section className="crafting-recipe-detail" aria-live="polite">
              {selected ? (
                <>
                  <div className="crafting-recipe-detail__title">
                    <div>{selected.workTier === "masterwork" && <small>Masterwork</small>}<h3>{selected.name}</h3></div>
                    <strong>{selected.outputLabel}</strong>
                  </div>

                  <div className="crafting-requirements">
                    <h4>Materials</h4>
                    {selected.inputs.map((input) => (
                      <div className={`crafting-requirement ${input.enough ? "is-ready" : "is-short"}`} key={input.itemId}>
                        <span className="crafting-requirement__item">
                          <AtlasImage src={atlasForItem(input.itemId)} size={28} aria-hidden="true" />
                          <span>{input.name}</span>
                        </span>
                        <strong>{input.owned} / {input.required}</strong>
                      </div>
                    ))}
                  </div>

                  <dl className="crafting-job-facts">
                    <div><dt>Work</dt><dd>{selected.work.cost}{saved > 0 ? ` (${saved} saved)` : ""}</dd></div>
                    <div><dt>Duration</dt><dd>{selected.durationLabel}</dd></div>
                  </dl>
                  <p className="crafting-collection-note">Collect here when ready. Make room in your storage before collecting.</p>

                  {(selected.work.roundingLimited || selected.work.throughputCapLimited) && (
                    <p className="crafting-rounding-note">
                      {selected.work.roundingLimited
                        ? "This small job already uses the least Work it can."
                        : "Your gear gives the full Work saving available for this job."}
                    </p>
                  )}

                  {selected.blockers.length > 0 && (
                    <div className="crafting-blockers" role="status">
                      <strong>{selected.state === "locked" ? "Not learned yet" : "Before starting"}</strong>
                      <ul>{selected.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
                    </div>
                  )}
                </>
              ) : <p>There is nothing to make at this station yet.</p>}
            </section>
          </div>
        )}

        <footer className="modal-footer crafting-modal__footer">
          <span role="status">{feedback ?? (station.job ? "Return to the station when the job is ready." : "Materials and Work are used when you begin making this.")}</span>
          {!station.job && selected && (
            <ChromeButton
              type="button"
              disabled={selected.state === "locked" || selected.blockers.length > 0}
              onClick={begin}
            >Start {selected.name}</ChromeButton>
          )}
        </footer>
      </GameSheet>
    </div>
  );
};
