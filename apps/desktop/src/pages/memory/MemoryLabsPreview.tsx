import { setMembrainEnabled } from "../../lib/preferences";

interface Props {
  onEnable: () => void;
}

export default function MemoryLabsPreview({ onEnable }: Props) {
  function handleEnable() {
    setMembrainEnabled(true);
    onEnable();
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "48px 32px",
        textAlign: "center",
        gap: 0,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: "var(--accent-light)",
          border: "1px solid var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
          flexShrink: 0,
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent-text)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
        </svg>
      </div>

      {/* Title + badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--fg-base)",
            margin: 0,
            letterSpacing: "-0.3px",
          }}
        >
          Memory
        </h1>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "2px 7px",
            borderRadius: 4,
            background: "var(--accent-light)",
            color: "var(--accent-text)",
            border: "1px solid var(--accent)",
          }}
        >
          Labs
        </span>
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: 13,
          color: "var(--fg-muted)",
          maxWidth: 360,
          lineHeight: 1.6,
          margin: "0 0 6px",
        }}
      >
        A graph-based knowledge store that remembers everything across your Claude sessions —
        entities, relationships, observations, and the reasoning behind them.
      </p>

      {/* Feature list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          margin: "20px 0 28px",
          maxWidth: 340,
          textAlign: "left",
          width: "100%",
        }}
      >
        {[
          ["Graph", "Force-directed visualization of what you know and how it connects"],
          ["Trace", "BFS traversal animation — follow any concept through your graph"],
          ["Context", "Compile a focused context window from any slice of the graph"],
          ["Episodes", "Capture session knowledge as timestamped episodes"],
        ].map(([name, desc]) => (
          <div key={name} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--accent-text)",
                background: "var(--accent-light)",
                padding: "2px 7px",
                borderRadius: 4,
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {name}
            </span>
            <span style={{ fontSize: 12, color: "var(--fg-subtle)", lineHeight: 1.5 }}>{desc}</span>
          </div>
        ))}
      </div>

      {/* Alpha notice */}
      <div
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-base)",
          fontSize: 12,
          color: "var(--fg-muted)",
          maxWidth: 360,
          lineHeight: 1.5,
          marginBottom: 20,
          textAlign: "left",
        }}
      >
        <strong style={{ color: "var(--fg-base)", display: "block", marginBottom: 3 }}>
          Alpha — personal use only
        </strong>
        Memory connects to your local membrain graph. It&apos;s designed for a single user and not
        yet suitable for sharing. Requires{" "}
        <code
          style={{
            fontSize: 11,
            background: "var(--bg-base)",
            padding: "1px 4px",
            borderRadius: 3,
          }}
        >
          mem
        </code>{" "}
        installed on your machine.
      </div>

      {/* Enable button */}
      <button
        onClick={handleEnable}
        style={{
          padding: "9px 24px",
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 7,
          border: "1px solid var(--accent)",
          background: "var(--accent)",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Enable Memory
      </button>

      <p style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 10 }}>
        You can turn this off in Preferences → Labs at any time.
      </p>
    </div>
  );
}
