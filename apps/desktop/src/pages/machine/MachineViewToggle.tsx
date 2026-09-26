import type { MachineView } from "./machine-view-model";

const OPTIONS: { view: MachineView; label: string }[] = [
  { view: "grid", label: "Resources" },
  { view: "drift", label: "Drift vs harness.yaml" },
];

export interface MachineViewToggleProps {
  view: MachineView;
  onChange: (view: MachineView) => void;
}

/**
 * Two-option segmented control under the summary strip (spec AC-18): the
 * surface grid, or Drift against harness.yaml. Toggle buttons in a labelled
 * group; pressing the option already shown does nothing, so it adds no
 * history entry.
 */
export function MachineViewToggle({ view, onChange }: MachineViewToggleProps) {
  return (
    <div className="hk-machine-view-toggle" role="group" aria-label="Machine view">
      {OPTIONS.map((option) => {
        const active = option.view === view;
        return (
          <button
            key={option.view}
            type="button"
            className="hk-machine-view-option"
            aria-pressed={active}
            data-active={active ? "true" : undefined}
            onClick={() => {
              if (!active) onChange(option.view);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
