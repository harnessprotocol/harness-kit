import type { HarnessInfo } from "@harness-kit/shared";

const LOGIN_COMMANDS: Record<string, string> = {
  claude: "claude login",
  cursor: "cursor agent login",
  "gh-copilot": "copilot auth login",
};

interface SelectedHarness {
  harnessId: string;
  model: string;
}

interface HarnessSelectorProps {
  harnesses: HarnessInfo[];
  selected: SelectedHarness[];
  onToggle: (harnessId: string) => void;
  onModelChange: (harnessId: string, model: string) => void;
}

export default function HarnessSelector({
  harnesses,
  selected,
  onToggle,
  onModelChange,
}: HarnessSelectorProps) {
  const selectedIds = new Set(selected.map((s) => s.harnessId));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
      {harnesses.map((h) => {
        const isSelected = selectedIds.has(h.id);
        const sel = selected.find((s) => s.harnessId === h.id);
        const models = h.models ?? [];
        const atMax = selected.length >= 4 && !isSelected;
        const needsAuth = h.available && !h.authenticated;
        const disabled = !h.available || needsAuth || atMax;

        const cardClass = [
          "harness-card",
          isSelected && "selected",
          (!h.available || needsAuth) && "unavailable",
          atMax && "at-max",
        ].filter(Boolean).join(" ");

        return (
          <div
            key={h.id}
            className={cardClass}
            onClick={() => {
              if (disabled) return;
              onToggle(h.id);
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)" }}>
                {h.name}
              </span>
              {!h.available && <span className="badge badge-danger">Not found</span>}
              {h.available && h.mode === "unsupported" && (
                <span className="badge badge-warning">Unconfirmed</span>
              )}
              {needsAuth && (
                <span className="badge badge-warning">Login required</span>
              )}
            </div>

            {h.version && (
              <div style={{
                fontSize: "11px",
                color: "var(--fg-subtle)",
                marginBottom: "8px",
                fontFamily: "ui-monospace, monospace",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {h.version}
              </div>
            )}

            {needsAuth && (
              <div style={{
                fontSize: "11px",
                color: "var(--fg-muted)",
                marginTop: "4px",
                padding: "4px 8px",
                borderRadius: "4px",
                background: "var(--bg-surface)",
                fontFamily: "ui-monospace, monospace",
                cursor: "text",
                userSelect: "all",
              }}
                onClick={(e) => e.stopPropagation()}
              >
                {LOGIN_COMMANDS[h.id] ?? `${h.command} login`}
              </div>
            )}

            {isSelected && models.length > 0 && (
              <select
                className="form-select"
                value={sel?.model || models[0]}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onModelChange(h.id, e.target.value)}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}

export type { SelectedHarness };
