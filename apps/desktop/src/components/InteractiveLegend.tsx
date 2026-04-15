interface LegendPayloadItem {
  value: string;
  color: string;
}

interface InteractiveLegendProps {
  payload?: LegendPayloadItem[];
  hidden: Set<string>;
  onToggle: (name: string) => void;
}

/**
 * Custom Recharts legend with click-to-toggle series visibility.
 * Pass via <Legend content={(props) => <InteractiveLegend {...props} hidden={...} onToggle={...} />} />.
 */
export default function InteractiveLegend({ payload, hidden, onToggle }: InteractiveLegendProps) {
  if (!payload?.length) return null;

  return (
    <ul
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        justifyContent: "center",
        padding: "6px 0 0",
        margin: 0,
        listStyle: "none",
      }}
    >
      {payload.map(({ value, color }) => {
        const isHidden = hidden.has(value);
        return (
          <li key={value}>
            <button
              onClick={() => onToggle(value)}
              aria-pressed={isHidden}
              title={isHidden ? `Show ${value}` : `Hide ${value}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "none",
                border: "1px solid transparent",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: "4px",
                opacity: isHidden ? 0.35 : 1,
                transition: "opacity 0.15s",
                color: "var(--fg-base)",
                fontSize: "10px",
                fontFamily: "inherit",
                outline: "none",
              }}
              onFocus={(e) => { e.currentTarget.style.outline = "2px solid var(--accent)"; e.currentTarget.style.outlineOffset = "1px"; }}
              onBlur={(e) => { e.currentTarget.style.outline = "none"; }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: "10px",
                  height: "10px",
                  borderRadius: "2px",
                  background: color,
                  flexShrink: 0,
                }}
              />
              {value}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
