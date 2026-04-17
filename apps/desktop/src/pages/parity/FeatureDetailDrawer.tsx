import type { HarnessInfo } from "@harness-kit/shared";
import type { TargetPlatform } from "@harness-kit/core";
import type { Capability } from "./capability-catalog";
import { isSelectable } from "./capability-catalog";

type FileState = "detected" | "missing" | "not_applicable";

interface Props {
  cap: Capability | null;
  harnesses: HarnessInfo[];
  probedFiles: Record<string, FileState>;
  onClose: () => void;
  onAddToSelection: (cap: Capability, installedTargets: TargetPlatform[]) => void;
}

function stateGlyph(fileState: FileState | undefined, supported: boolean): string {
  if (!supported) return "—";
  if (fileState === "detected") return "●";
  if (fileState === "missing") return "○";
  return "○";
}

function stateColor(fileState: FileState | undefined, supported: boolean): string {
  if (!supported) return "var(--fg-subtle)";
  if (fileState === "detected") return "var(--fg-muted)";
  return "var(--warning)";
}

export function FeatureDetailDrawer({ cap, harnesses, probedFiles, onClose, onAddToSelection }: Props) {
  const visible = cap !== null;

  const installedTargets = harnesses
    .filter((h) => h.available)
    .map((h) => h.id as TargetPlatform);

  const hasMissingSelectable =
    cap !== null &&
    isSelectable(cap) &&
    installedTargets.some((tid) => {
      const sup = cap.support[tid];
      if (!sup?.supported) return false;
      const fileState = probedFiles[`${tid}::${cap.id}`];
      return fileState === "missing";
    });

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 15,
          background: "rgba(0,0,0,0.25)",
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity 180ms ease",
        }}
      />

      {/* Drawer */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          maxWidth: "92vw",
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border-base)",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1)",
          zIndex: 16,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--separator)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-base)" }}>
              {cap?.label ?? ""}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginTop: 2,
              }}
            >
              {cap?.category ?? ""}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--fg-subtle)",
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 18px", flex: 1 }}>
          {cap && (
            <>
              <p
                style={{
                  margin: "0 0 18px",
                  fontSize: 12.5,
                  color: "var(--fg-muted)",
                  lineHeight: 1.55,
                }}
              >
                {cap.description}
              </p>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Harness", "Path", "State"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          fontWeight: 500,
                          color: "var(--fg-subtle)",
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "6px 8px",
                          borderBottom: "1px solid var(--separator)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {harnesses.map((h) => {
                    const sup = cap.support[h.id as TargetPlatform];
                    const fileState = probedFiles[`${h.id}::${cap.id}`];
                    const glyph = stateGlyph(fileState, sup?.supported ?? false);
                    const color = stateColor(fileState, sup?.supported ?? false);
                    return (
                      <tr
                        key={h.id}
                        style={{ opacity: h.available ? 1 : 0.45 }}
                      >
                        <td
                          style={{
                            padding: "8px",
                            borderBottom: "1px solid var(--separator)",
                            color: "var(--fg-base)",
                          }}
                        >
                          {h.name}
                        </td>
                        <td
                          style={{
                            padding: "8px",
                            borderBottom: "1px solid var(--separator)",
                            fontFamily: "ui-monospace, monospace",
                            fontSize: 11,
                            color: "var(--fg-muted)",
                          }}
                        >
                          {sup?.path ?? "—"}
                        </td>
                        <td
                          style={{
                            padding: "8px",
                            borderBottom: "1px solid var(--separator)",
                            color,
                            fontSize: 13,
                          }}
                        >
                          {glyph}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid var(--separator)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ flex: 1, fontSize: 11.5, color: "var(--fg-subtle)" }}>
            {cap ? `Tracked since ${cap.added_at}` : ""}
          </span>
          {hasMissingSelectable && (
            <button
              onClick={() => cap && onAddToSelection(cap, installedTargets)}
              style={{
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 500,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--border-base)",
                background: "transparent",
                color: "var(--fg-base)",
                cursor: "pointer",
              }}
            >
              Add to selection
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
