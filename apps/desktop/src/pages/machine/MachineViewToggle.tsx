import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import type { MachineView } from "./machine-view-model";

const OPTIONS: { view: MachineView; label: string }[] = [
  { view: "grid", label: "Resources" },
  { view: "drift", label: "Drift vs harness.yaml" },
];

/** The one panel both tabs control: its content follows the selected view. */
export const MACHINE_VIEW_PANEL_ID = "machine-view-panel";

/** The id of a view's tab, for the panel's aria-labelledby. */
export function machineViewTabId(view: MachineView): string {
  return `machine-view-tab-${view}`;
}

export interface MachineViewToggleProps {
  view: MachineView;
  onChange: (view: MachineView) => void;
}

/**
 * Resources | Drift vs harness.yaml under the summary strip (spec AC-18).
 * Two mutually exclusive options that switch the content below, so it is a
 * WAI-ARIA tab list controlling MACHINE_VIEW_PANEL_ID.
 *
 * Manual activation: Left/Right (wrapping) and Home/End only move focus;
 * Enter, Space or a click selects. Selecting Drift mounts DriftPage, which
 * migrates acknowledgements, asks for project access and scans, so moving
 * focus across the tabs must not do it. The focused tab holds the one
 * tabIndex 0; when focus leaves the list it returns to the selected tab, so
 * Tab back in lands there. Choosing the tab already selected does nothing,
 * so it adds no history entry; choosing the other one is navigation and
 * pushes one.
 */
export function MachineViewToggle({ view, onChange }: MachineViewToggleProps) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = OPTIONS.findIndex((option) => option.view === view);
  const [focused, setFocused] = useState(selected);
  // A view change from outside (a link, the strip's Drift cell) moves the
  // roving stop to the newly selected tab.
  const [lastSelected, setLastSelected] = useState(selected);
  if (lastSelected !== selected) {
    setLastSelected(selected);
    setFocused(selected);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = OPTIONS.length - 1;
    const target =
      event.key === "ArrowRight"
        ? (index + 1) % OPTIONS.length
        : event.key === "ArrowLeft"
          ? (index + last) % OPTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    setFocused(target);
    tabs.current[target]?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(selected);
  }

  return (
    <div className="hk-machine-view-toggle" role="tablist" aria-label="Machine view" onBlur={handleBlur}>
      {OPTIONS.map((option, index) => {
        const active = index === selected;
        return (
          <button
            key={option.view}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={machineViewTabId(option.view)}
            className="hk-machine-view-option"
            aria-selected={active}
            aria-controls={MACHINE_VIEW_PANEL_ID}
            tabIndex={index === focused ? 0 : -1}
            data-active={active ? "true" : undefined}
            onFocus={() => setFocused(index)}
            onClick={() => {
              if (!active) onChange(option.view);
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
