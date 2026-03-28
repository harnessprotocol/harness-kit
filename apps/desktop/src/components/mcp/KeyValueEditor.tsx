export interface KeyValuePair {
  id?: string;
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  disabled?: boolean;
}

export default function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "KEY",
  valuePlaceholder = "value",
  disabled = false,
}: KeyValueEditorProps) {
  function handleKeyChange(index: number, newKey: string) {
    const updated = pairs.map((p, i) => (i === index ? { ...p, key: newKey } : p));
    onChange(updated);
  }

  function handleValueChange(index: number, newValue: string) {
    const updated = pairs.map((p, i) => (i === index ? { ...p, value: newValue } : p));
    onChange(updated);
  }

  function handleDelete(index: number) {
    onChange(pairs.filter((_, i) => i !== index));
  }

  function handleAdd() {
    onChange([...pairs, { id: crypto.randomUUID(), key: "", value: "" }]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {pairs.map((pair, index) => (
        <div
          key={pair.id ?? String(index)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <input
            className="form-input"
            style={{ flex: "0 0 35%", minWidth: 0 }}
            value={pair.key}
            onChange={(e) => handleKeyChange(index, e.target.value)}
            placeholder={keyPlaceholder}
            disabled={disabled}
            spellCheck={false}
          />
          <span
            style={{
              fontSize: 12,
              color: "var(--fg-subtle)",
              userSelect: "none",
              flexShrink: 0,
            }}
          >
            =
          </span>
          <input
            className="form-input"
            style={{ flex: 1, minWidth: 0 }}
            value={pair.value}
            onChange={(e) => handleValueChange(index, e.target.value)}
            placeholder={valuePlaceholder}
            disabled={disabled}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => handleDelete(index)}
            disabled={disabled}
            aria-label="Remove row"
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              padding: 0,
              border: "none",
              borderRadius: 4,
              background: "transparent",
              color: "var(--fg-subtle)",
              cursor: disabled ? "not-allowed" : "pointer",
              fontSize: 14,
              lineHeight: 1,
              opacity: disabled ? 0.5 : 1,
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--danger)";
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--hover-bg)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--fg-subtle)";
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
            }}
          >
            ×
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleAdd}
          disabled={disabled}
        >
          + Add
        </button>
      </div>
    </div>
  );
}
