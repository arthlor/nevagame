import React from "react";

import {
  layoutEditWarningMessage,
  type LayoutEditHudSelection
} from "../layout-editor/layoutEdit";

interface PlacementEditorHudProps {
  active: boolean;
  selected: LayoutEditHudSelection | null;
  status: string | null;
  onToggle: () => void;
}

const formatCoord = (value: number): string => value.toFixed(2);
const formatYaw = (value: number): string => `${((value * 180) / Math.PI).toFixed(1)}°`;

export const PlacementEditorHud: React.FC<PlacementEditorHudProps> = ({
  active,
  selected,
  status,
  onToggle
}) => {
  const warning = selected ? layoutEditWarningMessage(selected.warning) : null;
  return (
    <div
      className="layout-editor-hud is-debug"
      data-layout-editor={active ? "on" : "off"}
    >
      <button
        type="button"
        className={`layout-editor-chip ${active ? "is-active" : ""}`}
        onClick={onToggle}
      >
        Place
        <span className="layout-editor-chip-key">F2</span>
      </button>
      {active && (
        <div className="layout-editor-banner" role="status">
          <p className="layout-editor-title">Layout editor</p>
          {selected ? (
            <p className="layout-editor-meta">
              {selected.id}
              {" · "}
              {selected.kind}
              {" · "}
              {formatCoord(selected.x)}, {formatCoord(selected.z)}
              {" · "}
              {formatYaw(selected.rotationY)}
              {" · "}
              {selected.sourceFile}
            </p>
          ) : (
            <p className="layout-editor-meta">Click to select. Drag to move. ⌘/Ctrl+C copy · ⌘/Ctrl+V paste · Delete. Q/E rotate. Drop writes source.</p>
          )}
          {status && <p className="layout-editor-status">{status}</p>}
          {warning && <p className="layout-editor-warning">{warning}</p>}
        </div>
      )}
    </div>
  );
};
