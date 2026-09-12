import React from "react";
import { KEY_BINDING_GROUPS, type KeyBinding } from "../keybindings";
import { KeyHint } from "../coastal/CoastalUI";
import { IconCompass, IconFish, IconJournal, IconSprout } from "./HudIcons";

const GROUP_ICONS: Record<string, React.ReactNode> = {
  movement: <IconCompass size={15} aria-hidden="true" />,
  world: <IconSprout size={15} aria-hidden="true" />,
  fishing: <IconFish size={15} aria-hidden="true" />,
  menus: <IconJournal size={15} aria-hidden="true" />
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

const KeycapSequence: React.FC<{ keys: string }> = ({ keys }) => (
  <span className="controls-keycaps">
    {keys.split(" / ").map((key, index) => (
      <React.Fragment key={key}>
        {index > 0 && <span className="controls-key-or">or</span>}
        {renderKeyFragment(key)}
      </React.Fragment>
    ))}
  </span>
);

const BindingRow: React.FC<{ binding: KeyBinding }> = ({ binding }) => (
  <li className="controls-row">
    <div className="controls-keycaps-wrapper">
      <KeycapSequence keys={binding.keys} />
    </div>
    <div className="controls-action-block">
      <span className="controls-action">{binding.action}</span>
      {binding.note && <span className="controls-note">{binding.note}</span>}
    </div>
  </li>
);

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
  const groups = groupIds
    ? KEY_BINDING_GROUPS.filter((group) => groupIds.includes(group.id))
    : KEY_BINDING_GROUPS;

  return (
    <div className={`controls-reference ${className}`.trim()} data-testid="controls-reference">
      {groups.map((group) => (
        <section className="controls-group" key={group.id}>
          <h4 className="controls-group-title">
            {GROUP_ICONS[group.id]}
            <span>{group.title}</span>
          </h4>
          <ul className="controls-list">
            {group.bindings.map((binding) => (
              <BindingRow key={`${group.id}-${binding.keys}-${binding.action}`} binding={binding} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};
