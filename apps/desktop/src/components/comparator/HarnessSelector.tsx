import type { HarnessInfo } from "@harness-kit/shared";

const MODEL_OPTIONS: Record<string, string[]> = {
  claude: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
  cursor: ["gpt-4o", "claude-sonnet-4-6", "gemini-2.5-pro"],
  "gh-copilot": ["gpt-4o", "gpt-4"],
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
        const models = MODEL_OPTIONS[h.id] || [];
        const atMax = selected.length >= 4 && !isSelected;

        const cardClass = [
          "harness-card",
          isSelected && "selected",
          !h.available && "unavailable",
          atMax && "at-max",
        ].filter(Boolean).join(" ");

        return (
          <div
            key={h.id}
            className={cardClass}
            onClick={() => {
              if (!h.available || atMax) return;
              onToggle(h.id);
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)" }}>
                {h.name}
              </span>
              {!h.available && <span className="badge badge-danger">Not found</span>}
              {h.available && h.mode === "unsupported" && (
                <span className="badge badge-warning">Unconfirmed</span>
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
