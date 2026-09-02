import React from "react";
import { KEY_BINDING_GROUPS, type KeyBinding } from "../keybindings";
import { KeyHint } from "../coastal/CoastalUI";

const KeycapSequence: React.FC<{ keys: string }> = ({ keys }) => (
  <span className="controls-keycaps">
    {keys.split(" / ").map((key, index) => (
      <React.Fragment key={key}>
        {index > 0 && <span className="controls-key-or">or</span>}
        <KeyHint keyName={key} />
      </React.Fragment>
    ))}
  </span>
);

const BindingRow: React.FC<{ binding: KeyBinding }> = ({ binding }) => (
  <li className="controls-row">
    <KeycapSequence keys={binding.keys} />
    <span className="controls-action">
      {binding.action}
      {binding.note && <span className="controls-note">{binding.note}</span>}
    </span>
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
          <h4 className="controls-group-title">{group.title}</h4>
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
