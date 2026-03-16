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
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
      {harnesses.map((h) => {
        const isSelected = selectedIds.has(h.id);
        const sel = selected.find((s) => s.harnessId === h.id);
        const models = MODEL_OPTIONS[h.id] || [];
        const atMax = selected.length >= 3 && !isSelected;

        return (
          <div
            key={h.id}
            onClick={() => {
              if (!h.available || atMax) return;
              onToggle(h.id);
            }}
            style={{
              flex: "1 1 160px",
              maxWidth: "220px",
              padding: "14px",
              borderRadius: "10px",
              border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border-base)"}`,
              background: isSelected ? "var(--accent-light)" : "var(--bg-surface)",
              opacity: h.available ? 1 : 0.5,
              cursor: h.available && !atMax ? "pointer" : "not-allowed",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)" }}>
                {h.name}
              </span>
              {!h.available && (
                <span
                  style={{
                    fontSize: "10px",
                    padding: "1px 6px",
                    borderRadius: "4px",
                    background: "var(--danger)",
                    color: "#fff",
                  }}
                >
                  Not found
                </span>
              )}
              {h.available && h.mode === "unsupported" && (
                <span
                  style={{
                    fontSize: "10px",
                    padding: "1px 6px",
                    borderRadius: "4px",
                    background: "var(--warning)",
                    color: "#fff",
                  }}
                >
                  Unconfirmed
                </span>
              )}
            </div>

            {h.version && (
              <div style={{ fontSize: "11px", color: "var(--fg-subtle)", marginBottom: "8px", fontFamily: "ui-monospace, monospace" }}>
                {h.version}
              </div>
            )}

            {isSelected && models.length > 0 && (
              <select
                value={sel?.model || models[0]}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onModelChange(h.id, e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "11px",
                  padding: "4px 6px",
                  borderRadius: "5px",
                  border: "1px solid var(--border-base)",
                  background: "var(--bg-elevated)",
                  color: "var(--fg-base)",
                  cursor: "pointer",
                }}
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
