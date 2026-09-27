import { useRef, type KeyboardEvent } from "react";
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
 * WAI-ARIA tab list controlling MACHINE_VIEW_PANEL_ID. Only the selected tab
 * is in the Tab order; Left/Right (wrapping) and Home/End move to a tab and
 * select it. Choosing the tab already selected does nothing, so it adds no
 * history entry.
 */
export function MachineViewToggle({ view, onChange }: MachineViewToggleProps) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    const option = OPTIONS[index];
    // Focus first: the tab elements are keyed by view, so they survive the
    // re-render the view change causes and focus stays where it moved.
    tabs.current[index]?.focus();
    if (option.view !== view) onChange(option.view);
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
    select(target);
  }

  return (
    <div className="hk-machine-view-toggle" role="tablist" aria-label="Machine view">
      {OPTIONS.map((option, index) => {
        const active = option.view === view;
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
            tabIndex={active ? 0 : -1}
            data-active={active ? "true" : undefined}
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
