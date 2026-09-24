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
import { handleTabListKeyDown } from "./useTabListKeyboard";

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
type WardrobeCategory = "all" | "clothing" | "tools" | "rods";

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
  const [category, setCategory] = useState<WardrobeCategory>("all");
  const [hasRotated, setHasRotated] = useState(false);
  const [preview, setPreview] = useState<Partial<Record<CharacterSlot, string>>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const categoryCounts = useMemo(() => ({
    all: items.length,
    clothing: items.filter((i) => ["head", "outerwear", "feet"].includes(i.slot)).length,
    tools: items.filter((i) => ["watering-tool", "harvest-tool"].includes(i.slot)).length,
    rods: items.filter((i) => i.slot === "rod").length
  }), [items]);

  const filteredItems = useMemo(() => {
    if (category === "clothing") return items.filter((i) => ["head", "outerwear", "feet"].includes(i.slot));
    if (category === "tools") return items.filter((i) => ["watering-tool", "harvest-tool"].includes(i.slot));
    if (category === "rods") return items.filter((i) => i.slot === "rod");
    return items;
  }, [items, category]);
  const selected = filteredItems.find((item) => itemKey(item) === selectedKey) ?? filteredItems[0] ?? null;
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

  const selectCategory = (nextCategory: WardrobeCategory): void => {
    setCategory(nextCategory);
    const nextItems = nextCategory === "clothing"
      ? items.filter((item) => ["head", "outerwear", "feet"].includes(item.slot))
      : nextCategory === "tools"
        ? items.filter((item) => ["watering-tool", "harvest-tool"].includes(item.slot))
        : nextCategory === "rods"
          ? items.filter((item) => item.slot === "rod")
          : items;
    if (nextItems.length > 0 && !nextItems.some((item) => itemKey(item) === selectedKey)) {
      setSelectedKey(itemKey(nextItems[0]));
    }
    setFeedback(null);
  };

  const selectItem = (item: SelectableItem): void => {
    if (!filteredItems.some((candidate) => itemKey(candidate) === itemKey(item))) setCategory("all");
    setSelectedKey(itemKey(item));
    setFeedback(null);
  };

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
      const item = items.find((candidate) => candidate.slot === slot.slot && candidate.id === id);
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
        aria-describedby="character-screen-intro"
        tabIndex={-1}
      >
        <header className="modal-header character-screen__header">
          <div className="character-screen__title-block">
            <h2 id="character-screen-title">Character & Gear</h2>
            <p id="character-screen-intro" className="sr-only">Choose owned gear to inspect it. Try On previews a change; Equip wears it.</p>
            <div className="character-screen__capacity-pills">
              <span className="character-screen__pill">
                <strong>{character.wardrobe.used}</strong> / {character.wardrobe.capacity} Spaces
              </span>
              {character.wardrobe.reserved > 0 && (
                <span className="character-screen__pill character-screen__pill--reserved">
                  {character.wardrobe.reserved} In Progress
                </span>
              )}
            </div>
          </div>
          <ChromeClose onClick={onClose} label="Close character screen" />
        </header>

        <div className="character-screen__body">
          <section className="character-screen__loadout" aria-label="Equipped gear">
            <div className="character-section-header">
              <h3>Equipped</h3>
              <small>Currently worn</small>
            </div>
            <div className="character-slot-list">
              {character.slots.map((slot) => {
                const shownId = previewBySlot[slot.slot];
                const shown = items.find((item) => item.slot === slot.slot && item.id === shownId);
                const previewed = shownId !== slot.equippedId;
                const isSelected = selected?.slot === slot.slot && selected.id === shownId;
                return (
                  <button
                    type="button"
                    key={slot.slot}
                    className={`character-slot ${isSelected ? "is-selected" : ""} ${previewed ? "is-preview" : ""}`}
                    onClick={() => shown && selectItem(shown)}
                    aria-label={`${slot.label}: ${shown?.name ?? slot.equippedName}${previewed ? ", preview only" : ""}`}
                    aria-pressed={Boolean(isSelected)}
                    disabled={!shown}
                  >
                    <span className="character-slot__glyph" aria-hidden="true">
                      <AtlasImage src={itemSprite(shown)} size={28} aria-hidden="true" />
                      {!itemSprite(shown) && slotGlyph(slot.slot)}
                    </span>
                    <span className="character-slot__details">
                      <small>{slot.label}</small>
                      <strong>{shown?.name ?? slot.equippedName}</strong>
                    </span>
                    {previewed ? (
                      <em className="character-slot__status-tag">Try On</em>
                    ) : isSelected ? (
                      <span className="character-slot__active-pip" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="character-presets" aria-label="Outfit presets">
              <div className="character-presets__header">
                <h3>Outfits</h3>
                <small>Clothing presets</small>
              </div>
              <div className="character-presets__list">
                {character.presets.map((preset) => (
                  <div className="character-preset" key={preset.id}>
                    <div className="character-preset__info">
                      <strong>{preset.label}</strong>
                      <small>Clothing only</small>
                    </div>
                    <div className="character-preset__actions">
                      <ChromeButton
                        type="button"
                        variant="ghost"
                        onClick={() => run(onSavePreset(preset.id), `${preset.label} outfit saved`)}
                        title={`Save current gear to ${preset.label}`}
                      >Save Current</ChromeButton>
                      <ChromeButton
                        type="button"
                        onClick={() => applyPreset(preset.id, preset.label)}
                        title={`Equip ${preset.label} outfit`}
                      >Wear</ChromeButton>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="character-screen__preview" aria-label="Character preview">
            <div className="character-preview-stage">
              <div className="character-preview-pedestal" aria-hidden="true" />
              <CharacterPreview3D
                loadout={previewLoadout}
                selectedSlot={selected?.slot ?? null}
                descriptionId="character-preview-description"
                onRotateStart={() => setHasRotated(true)}
              />
              <p id="character-preview-description" className="sr-only">{previewDescription}</p>
              <div className="character-preview-meta">
                <span className="character-preview-label">
                  {Object.keys(preview).length > 0 ? "Trying on" : "Current gear"}
                </span>
                {!hasRotated && (
                  <span className="character-preview-hint" aria-hidden="true">
                    Drag to rotate
                  </span>
                )}
              </div>
            </div>
            {Object.keys(preview).length > 0 && (
              <ChromeButton type="button" variant="ghost" className="character-preview-reset" onClick={() => setPreview({})}>
                Reset Try On
              </ChromeButton>
            )}
          </section>

          <section className="character-screen__wardrobe" aria-label="Wardrobe">
            <div className="character-wardrobe__header">
              <div className="character-section-header">
                <h3>Owned Gear</h3>
                <small>{filteredItems.length} items</small>
              </div>
              <div className="character-category-filter" role="tablist" aria-label="Filter gear categories" onKeyDown={handleTabListKeyDown}>
                <button
                  type="button"
                  id="character-category-all"
                  role="tab"
                  aria-selected={category === "all"}
                  aria-controls="character-wardrobe-panel"
                  tabIndex={category === "all" ? 0 : -1}
                  className={`character-category-tab ${category === "all" ? "is-active" : ""}`}
                  onClick={() => selectCategory("all")}
                >
                  All <small>({categoryCounts.all})</small>
                </button>
                <button
                  type="button"
                  id="character-category-clothing"
                  role="tab"
                  aria-selected={category === "clothing"}
                  aria-controls="character-wardrobe-panel"
                  tabIndex={category === "clothing" ? 0 : -1}
                  className={`character-category-tab ${category === "clothing" ? "is-active" : ""}`}
                  onClick={() => selectCategory("clothing")}
                >
                  Clothes <small>({categoryCounts.clothing})</small>
                </button>
                <button
                  type="button"
                  id="character-category-tools"
                  role="tab"
                  aria-selected={category === "tools"}
                  aria-controls="character-wardrobe-panel"
                  tabIndex={category === "tools" ? 0 : -1}
                  className={`character-category-tab ${category === "tools" ? "is-active" : ""}`}
                  onClick={() => selectCategory("tools")}
                >
                  Tools <small>({categoryCounts.tools})</small>
                </button>
                <button
                  type="button"
                  id="character-category-rods"
                  role="tab"
                  aria-selected={category === "rods"}
                  aria-controls="character-wardrobe-panel"
                  tabIndex={category === "rods" ? 0 : -1}
                  className={`character-category-tab ${category === "rods" ? "is-active" : ""}`}
                  onClick={() => selectCategory("rods")}
                >
                  Rods <small>({categoryCounts.rods})</small>
                </button>
              </div>
            </div>

            <div id="character-wardrobe-panel" className="character-owned-list" role="tabpanel" aria-labelledby={`character-category-${category}`}>
              {filteredItems.map((item) => {
                const isItemEquipped = equippedBySlot[item.slot] === item.id;
                const isItemSelected = selected?.id === item.id;
                return (
                  <button
                    type="button"
                    key={itemKey(item)}
                    className={`character-owned-item ${isItemSelected ? "is-selected" : ""} ${isItemEquipped ? "is-equipped" : ""}`}
                    onClick={() => selectItem(item)}
                    aria-pressed={isItemSelected}
                    aria-controls="character-item-inspector"
                  >
                    <span className="character-owned-item__mark" aria-hidden="true">
                      <AtlasImage src={itemSprite(item)} size={28} aria-hidden="true" />
                      {!itemSprite(item) && slotGlyph(item.slot)}
                    </span>
                    <span className="character-owned-item__details">
                      <strong>{item.name}</strong>
                      <small>{item.slot.replace("-", " ")}</small>
                    </span>
                    {isItemEquipped && (
                      <span className="character-item-badge is-equipped">Equipped</span>
                    )}
                  </button>
                );
              })}
            </div>

            {filteredItems.length === 0 && <p className="character-wardrobe-empty">No gear in this category yet.</p>}

            {selected && (
              <article id="character-item-inspector" className="character-comparison" aria-label={`${selected.name} details`}>
                <div className="character-comparison__header">
                  <div className="character-comparison__slot-tag-row">
                    <span className="character-comparison__slot-tag">{selected.slot.replace("-", " ")}</span>
                    <small className="character-comparison__state-hint">
                      {isEquipped ? "Currently Equipped" : isPreviewing ? "In Preview" : "Owned"}
                    </small>
                  </div>
                  <h3>{selected.name}</h3>
                  <p className="character-comparison__desc">{selected.description}</p>
                <ul className="character-effect-list">
                  {selected.effectLines.map((line) => {
                    const isNone = line.toLowerCase().includes("no specialist bonus") || line.toLowerCase().includes("no bonus");
                    return (
                      <li key={line} className={`character-effect-item ${isNone ? "is-none" : "is-active"}`}>
                        {!isNone && <span className="character-effect-bullet" aria-hidden="true" />}
                        <span>{line}</span>
                      </li>
                    );
                  })}
                </ul>
                </div>

                {compared && compared.id !== selected.id && (
                  <div className="character-comparison__current">
                    <small className="character-comparison__current-label">Currently in this slot</small>
                    <div className="character-comparison__current-row">
                      <strong>{compared.name}</strong>
                    </div>
                    <ul className="character-effect-list">
                      {compared.effectLines.map((line) => {
                        const isNone = line.toLowerCase().includes("no specialist bonus") || line.toLowerCase().includes("no bonus");
                        return (
                          <li key={line} className={`character-effect-item ${isNone ? "is-none" : "is-active"}`}>
                            {!isNone && <span className="character-effect-bullet" aria-hidden="true" />}
                            <span>{line}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="character-comparison__actions">
                  {isEquipped ? (
                    <span className="character-equipped-badge">Currently Equipped</span>
                  ) : (
                    <>
                      <ChromeButton
                        type="button"
                        variant="ghost"
                        disabled={isPreviewing}
                        onClick={() => setPreview((current) => ({ ...current, [selected.slot]: selected.id }))}
                      >{isPreviewing ? "In Preview" : "Try On"}</ChromeButton>
                      <ChromeButton
                        type="button"
                        disabled={!character.canEquip}
                        aria-describedby={!character.canEquip && character.equipBlocker ? "character-equip-blocker" : undefined}
                        onClick={equipSelected}
                      >
                        Equip
                      </ChromeButton>
                    </>
                  )}
                </div>
                {!isEquipped && !character.canEquip && character.equipBlocker && (
                  <p id="character-equip-blocker" className="character-comparison__blocker">{character.equipBlocker}</p>
                )}
              </article>
            )}
          </section>
        </div>

        <footer className="modal-footer character-screen__footer">
          <div role="status" className="character-screen__status">
            {feedback ?? character.equipBlocker ?? "Try on gear here. Choose Equip to wear it on the coast."}
          </div>
          <ChromeButton type="button" variant="ghost" onClick={onOpenSatchel}>Open Satchel</ChromeButton>
          <ChromeButton type="button" variant="ghost" onClick={onOpenPause}>Game Menu</ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};
