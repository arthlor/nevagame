import React from "react";
import { KEY_BINDING_GROUPS, type KeyBinding } from "../keybindings";
import { KeyHint } from "../coastal/CoastalUI";
import { IconCompass, IconFish, IconJournal, IconSprout } from "./HudIcons";
import { useTranslation } from "../../i18n/useTranslation";

const GROUP_ICONS: Record<string, React.ReactNode> = {
  movement: <IconCompass size={15} aria-hidden="true" />,
  world: <IconSprout size={15} aria-hidden="true" />,
  fishing: <IconFish size={15} aria-hidden="true" />,
  menus: <IconJournal size={15} aria-hidden="true" />
};

const TR_GROUP_TITLES: Record<string, string> = {
  movement: "Hareket & Yön",
  world: "Dünya & Çiftlik",
  fishing: "Balıkçılık & Deniz",
  menus: "Menüler & Defter"
};

const TR_ACTION_MAP: Record<string, string> = {
  "Walk, or steer a boat": "Yürü veya tekneye yön ver",
  "Sprint": "Depar at",
  "Jump": "Zıpla",
  "Orbit the camera": "Kamerayı döndür",
  "Zoom the camera": "Kamerayı yaklaştır / uzaklaştır",
  "Contextual interaction — talk, board, harvest, cast": "Etkileşim — konuş, bin, topla, savur",
  "Use the pointed crop action, or cast at water": "İşaretlenen mahsul eylemini yap veya suya savur",
  "Optional quick tools": "İsteğe bağlı hızlı aletler",
  "Hold to read the soil overlay on a farm": "Tarlada toprak durumunu görmek için basılı tut",
  "Open or close the farm forecast": "Çiftlik hava tahminini aç veya kapat",
  "Inspect a crop, or read the water at the shore": "Mahsulü incele veya kıyıda suları oku",
  "Call your donkey to your side": "Eşeğini çağır",
  "Hold to charge a cast, release to cast": "Savurma gücünü ayarlamak için basılı tut, savurmak için bırak",
  "Arm or put away a Woven Lure": "Örme Sahte Yemi tak veya kaldır",
  "Hook the bite, then hold to keep pressure": "Balığı kancala, gerilimi korumak için basılı tut",
  "Reel in": "Makarayı sar",
  "Give slack": "Boşluk ver",
  "Swing the rod against the run": "Kamışı balığın kaçış yönünün tersine çek",
  "Pause, or close the open screen": "Oyunu duraklat veya açık ekranı kapat",
  "Character & Gear": "Karakter & Donanım",
  "Satchel": "Heybe",
  "Field Journal": "Günlük",
  "Nautical chart": "Deniz Haritası",
  "Hold & Stores": "Ambar & Depolar",
  "Expedition board": "Sefer Panosu"
};

const TR_NOTE_MAP: Record<string, string> = {
  "Costs stamina on foot": "Yürürken dayanıklılık harcar",
  "Takes out the tool the action needs": "İşin gerektirdiği aleti otomatik kuşanır",
  "Available shortcuts change near farms, water, and boats": "Çiftlik, su ve tekne yakınında kısayollar değişir",
  "Required before sport fishing": "Sportif balıkçılık öncesinde gereklidir",
  "Sport fishing": "Sportif balıkçılık",
  "Once unlocked": "Açıldığında",
  "On foot; it needs a clear, level spot beside you": "Yürürken; yanında boş ve düz bir yer gerekir"
};

const renderKeyFragment = (keyStr: string) => {
  const parts = keyStr.trim().split(/\s+/);
  // "1 – 5" is a range, not three keycaps: render the endpoints around the dash.
  if (parts.length === 3 && /^[–—-]$/.test(parts[1])) {
    return (
      <span className="controls-keycaps-cluster">
        <KeyHint keyName={parts[0]} />
        <span className="controls-key-range">–</span>
        <KeyHint keyName={parts[2]} />
      </span>
    );
  }
  // If it's a sequence of individual single characters (e.g. "W A S D"), render each as its own keycap
  if (parts.length > 1 && parts.every((p) => p.length === 1 && !/[–—-]/.test(p))) {
    return (
      <span className="controls-keycaps-cluster">
        {parts.map((p) => (
          <KeyHint key={p} keyName={p} />
        ))}
      </span>
    );
  }
  return <KeyHint keyName={keyStr} />;
};

const KeycapSequence: React.FC<{ keys: string; isTr: boolean }> = ({ keys, isTr }) => (
  <span className="controls-keycaps">
    {keys.split(" / ").map((key, index) => (
      <React.Fragment key={key}>
        {index > 0 && <span className="controls-key-or">{isTr ? "veya" : "or"}</span>}
        {renderKeyFragment(key)}
      </React.Fragment>
    ))}
  </span>
);

const BindingRow: React.FC<{ binding: KeyBinding; isTr: boolean }> = ({ binding, isTr }) => {
  const actionText = isTr
    ? (TR_ACTION_MAP[binding.action] ?? binding.action)
    : binding.action === "Field Journal" ? "Journal" : binding.action;
  const noteText = binding.note ? (isTr ? (TR_NOTE_MAP[binding.note] ?? binding.note) : binding.note) : undefined;

  return (
    <li className="controls-row">
      <div className="controls-keycaps-wrapper">
        <KeycapSequence keys={binding.keys} isTr={isTr} />
      </div>
      <div className="controls-action-block">
        <span className="controls-action">{actionText}</span>
        {noteText && <span className="controls-note">{noteText}</span>}
      </div>
    </li>
  );
};

export interface ControlsReferenceProps {
  /** Restricts the reference to named groups; omit for all of them. */
  groupIds?: readonly string[];
  className?: string;
}

/**
 * Renders the shared keybinding table. Every surface that lists controls uses
 * this so none of them can drift out of date independently.
 */
export const ControlsReference: React.FC<ControlsReferenceProps> = ({
  groupIds,
  className = ""
}) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";

  const groups = groupIds
    ? KEY_BINDING_GROUPS.filter((group) => groupIds.includes(group.id))
    : KEY_BINDING_GROUPS;

  return (
    <div className={`controls-reference ${className}`.trim()} data-testid="controls-reference">
      {groups.map((group) => {
        const title = isTr ? (TR_GROUP_TITLES[group.id] ?? group.title) : group.title;
        return (
          <section className="controls-group" key={group.id}>
            <h4 className="controls-group-title">
              {GROUP_ICONS[group.id]}
              <span>{title}</span>
            </h4>
            <ul className="controls-list">
              {group.bindings.map((binding) => (
                <BindingRow
                  key={`${group.id}-${binding.keys}-${binding.action}`}
                  binding={binding}
                  isTr={isTr}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
};
