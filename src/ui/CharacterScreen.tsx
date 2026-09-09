import React, { useMemo, useRef, useState } from "react";
import type {
  CharacterEquipmentDto,
  CharacterEquipmentItemDto,
  CharacterRodDto,
  InteractionResult
} from "../simulation/core/contracts";
import type {
  EquipmentId,
  EquipmentPresetId,
  EquipmentSlot,
  RodId
} from "../simulation/core/types";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import { GameSheet } from "./coastal/CoastalUI";
import { useModalAccessibility } from "./useModalAccessibility";
import { CharacterPreview3D } from "./CharacterPreview3D";
import type { CharacterVisualLoadout } from "../render/animation/CharacterEquipmentAssembler";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForEquipment, atlasForRod } from "./chrome/uiAtlas";

type CharacterSlot = EquipmentSlot | "rod";
type SelectableItem =
  | (CharacterEquipmentItemDto & { kind: "equipment" })
  | (CharacterRodDto & { kind: "rod"; slot: "rod"; description: string });

export interface CharacterScreenProps {
  character: CharacterEquipmentDto;
  onClose: () => void;
  onEquipEquipment: (equipmentId: EquipmentId) => InteractionResult;
  onEquipRod: (rodId: RodId) => InteractionResult;
  onSavePreset: (presetId: EquipmentPresetId) => InteractionResult;
  onApplyPreset: (presetId: EquipmentPresetId) => InteractionResult;
  onOpenSatchel: () => void;
  onOpenPause: () => void;
}

function itemKey(item: SelectableItem): string {
  return `${item.kind}:${item.id}`;
}

function slotGlyph(slot: CharacterSlot): string {
  return {
    head: "⌒",
    outerwear: "◇",
    feet: "⌄",
    "watering-tool": "◒",
    "harvest-tool": "◜",
    rod: "╱"
  }[slot];
}

function itemSprite(item: SelectableItem | null | undefined): string | undefined {
  if (!item) return undefined;
  return item.kind === "rod" ? atlasForRod(item.id) : atlasForEquipment(item.id);
}

/**
 * Character equipment remains a simulation query. Try On is deliberately
 * local to this mounted screen and disappears without touching the save.
 */
export const CharacterScreen: React.FC<CharacterScreenProps> = ({
  character,
  onClose,
  onEquipEquipment,
  onEquipRod,
  onSavePreset,
  onApplyPreset,
  onOpenSatchel,
  onOpenPause
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);
  const items = useMemo<SelectableItem[]>(() => [
    ...character.ownedEquipment.map((item) => ({ ...item, kind: "equipment" as const })),
    ...character.ownedRods.map((item) => ({
      ...item,
      kind: "rod" as const,
      slot: "rod" as const,
      description: "A physical fishing rod carried from the wardrobe into the world."
    }))
  ], [character.ownedEquipment, character.ownedRods]);
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const currentHead = character.slots.find((slot) => slot.slot === "head")?.equippedId;
    return `equipment:${currentHead ?? character.ownedEquipment[0]?.id ?? ""}`;
  });
  const [preview, setPreview] = useState<Partial<Record<CharacterSlot, string>>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const selected = items.find((item) => itemKey(item) === selectedKey) ?? items[0] ?? null;
  const equippedBySlot = useMemo(
    () => Object.fromEntries(character.slots.map((slot) => [slot.slot, slot.equippedId])) as Record<CharacterSlot, string>,
    [character.slots]
  );
  const previewBySlot = { ...equippedBySlot, ...preview };
  const compared = selected
    ? items.find((item) => item.slot === selected.slot && item.id === equippedBySlot[selected.slot]) ?? null
    : null;
  const isEquipped = selected ? equippedBySlot[selected.slot] === selected.id : false;
  const isPreviewing = selected
    ? preview[selected.slot] === selected.id && !isEquipped
    : false;

  const run = (result: InteractionResult, successCopy: string): void => {
    setFeedback(result.success ? successCopy : result.reason ?? "That change is not available");
  };

  const equipSelected = (): void => {
    if (!selected) return;
    const result = selected.kind === "rod"
      ? onEquipRod(selected.id)
      : onEquipEquipment(selected.id);
    run(result, `${selected.name} equipped`);
    if (result.success) {
      setPreview((current) => {
        const next = { ...current };
        delete next[selected.slot];
        return next;
      });
    }
  };

  const applyPreset = (presetId: EquipmentPresetId, label: string): void => {
    const result = onApplyPreset(presetId);
    run(result, `${label} outfit equipped`);
    if (result.success) setPreview({});
  };

  const previewDescription = character.slots
    .map((slot) => {
      const id = previewBySlot[slot.slot];
      const item = items.find((candidate) => candidate.id === id);
      return `${slot.label}: ${item?.name ?? slot.equippedName}`;
    })
    .join(". ");
  const previewAsset = (slot: CharacterSlot): { assetId: string; scale?: number } | null => {
    const id = previewBySlot[slot];
    const item = items.find((candidate) => candidate.slot === slot && candidate.id === id);
    if (!item?.assetId) return null;
    return {
      assetId: item.assetId,
      scale: item.kind === "equipment" ? item.scale : undefined
    };
  };
  const previewLoadout: CharacterVisualLoadout = {
    head: previewAsset("head"),
    outerwear: previewAsset("outerwear"),
    feet: previewAsset("feet"),
    wateringTool: previewAsset("watering-tool") ?? { assetId: "tool_watering_can_a" },
    harvestTool: previewAsset("harvest-tool") ?? { assetId: "tool_sickle_a" },
    rod: previewAsset("rod") ?? { assetId: "tool_fishing_rod_a" }
  };

  return (
    <div className="modal-overlay interactive character-screen-overlay" onClick={onClose}>
      <GameSheet
        ref={modalRef}
        as="section"
        className="neva-panel modal-content character-screen"
        tone="slate"
        corners
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-screen-title"
        aria-describedby="character-preview-description"
        tabIndex={-1}
      >
        <header className="modal-header character-screen__header">
          <div>
            <h2 id="character-screen-title">Character & Gear</h2>
            <p>{character.wardrobe.used} owned · {character.wardrobe.reserved} being made · {character.wardrobe.capacity} spaces</p>
          </div>
          <ChromeClose onClick={onClose} label="Close character screen" />
        </header>

        <div className="character-screen__body">
          <section className="character-screen__loadout" aria-label="Equipped gear">
            <h3>Equipped</h3>
            <div className="character-slot-list">
              {character.slots.map((slot) => {
                const shownId = previewBySlot[slot.slot];
                const shown = items.find((item) => item.id === shownId);
                const previewed = shownId !== slot.equippedId;
                return (
                  <button
                    type="button"
                    key={slot.slot}
                    className={`character-slot ${previewed ? "is-preview" : ""}`}
                    onClick={() => shown && setSelectedKey(itemKey(shown))}
                    aria-label={`${slot.label}: ${shown?.name ?? slot.equippedName}${previewed ? ", preview only" : ""}`}
                  >
                    <span className="character-slot__glyph" aria-hidden="true">
                      <AtlasImage src={itemSprite(shown)} size={28} aria-hidden="true" />
                      {!itemSprite(shown) && slotGlyph(slot.slot)}
                    </span>
                    <span><small>{slot.label}</small><strong>{shown?.name ?? slot.equippedName}</strong></span>
                    {previewed && <em>Try On</em>}
                  </button>
                );
              })}
            </div>

            <div className="character-presets" aria-label="Outfit presets">
              <h3>Outfits</h3>
              {character.presets.map((preset) => (
                <div className="character-preset" key={preset.id}>
                  <span><strong>{preset.label}</strong><small>Clothing only</small></span>
                  <ChromeButton
                    type="button"
                    variant="ghost"
                    onClick={() => run(onSavePreset(preset.id), `${preset.label} outfit saved`)}
                  >Save Current</ChromeButton>
                  <ChromeButton
                    type="button"
                    onClick={() => applyPreset(preset.id, preset.label)}
                  >Wear</ChromeButton>
                </div>
              ))}
            </div>
          </section>

          <section className="character-screen__preview" aria-label="Character preview">
            <div className="character-preview-stage">
              <div className="character-preview-halo" aria-hidden="true" />
              <CharacterPreview3D
                loadout={previewLoadout}
                selectedSlot={selected?.slot ?? null}
                descriptionId="character-preview-description"
              />
              <p id="character-preview-description" className="sr-only">{previewDescription}</p>
              <span className="character-preview-label">{Object.keys(preview).length > 0 ? "Local preview" : "Current gear"}</span>
            </div>
            {Object.keys(preview).length > 0 && (
              <ChromeButton type="button" variant="ghost" onClick={() => setPreview({})}>Reset Try On</ChromeButton>
            )}
          </section>

          <section className="character-screen__wardrobe" aria-label="Wardrobe">
            <h3>Owned Gear</h3>
            <div className="character-owned-list">
              {items.map((item) => (
                <button
                  type="button"
                  key={itemKey(item)}
                  className={`character-owned-item ${selected?.id === item.id ? "is-selected" : ""} ${equippedBySlot[item.slot] === item.id ? "is-equipped" : ""}`}
                  onClick={() => setSelectedKey(itemKey(item))}
                  aria-pressed={selected?.id === item.id}
                >
                  <span className="character-owned-item__mark" aria-hidden="true">
                    <AtlasImage src={itemSprite(item)} size={28} aria-hidden="true" />
                    {!itemSprite(item) && slotGlyph(item.slot)}
                  </span>
                  <span><strong>{item.name}</strong><small>{equippedBySlot[item.slot] === item.id ? "Equipped" : item.slot.replace("-", " ")}</small></span>
                </button>
              ))}
            </div>

            {selected && (
              <article className="character-comparison" aria-live="polite">
                <div>
                  <small>Selected</small>
                  <h3>{selected.name}</h3>
                  <p>{selected.description}</p>
                  <ul>{selected.effectLines.map((line) => <li key={line}>{line}</li>)}</ul>
                </div>
                {compared && compared.id !== selected.id && (
                  <div className="character-comparison__current">
                    <small>Currently in this slot</small>
                    <strong>{compared.name}</strong>
                    <ul>{compared.effectLines.map((line) => <li key={line}>{line}</li>)}</ul>
                  </div>
                )}
                <div className="character-comparison__actions">
                  <ChromeButton
                    type="button"
                    variant="ghost"
                    disabled={isPreviewing || isEquipped}
                    onClick={() => setPreview((current) => ({ ...current, [selected.slot]: selected.id }))}
                  >{isEquipped ? "Current" : isPreviewing ? "In Preview" : "Try On"}</ChromeButton>
                  <ChromeButton type="button" disabled={isEquipped || !character.canEquip} onClick={equipSelected}>
                    {isEquipped ? "Equipped" : "Equip"}
                  </ChromeButton>
                </div>
              </article>
            )}
          </section>
        </div>

        <footer className="modal-footer character-screen__footer">
          <div role="status" className="character-screen__status">
            {feedback ?? character.equipBlocker ?? "Try On changes only this preview. Equip writes the real loadout."}
          </div>
          <ChromeButton type="button" variant="ghost" onClick={onOpenSatchel}>Open Satchel</ChromeButton>
          <ChromeButton type="button" variant="ghost" onClick={onOpenPause}>Game Menu</ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};
