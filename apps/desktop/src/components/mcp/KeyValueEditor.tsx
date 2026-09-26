import { Plus, X } from "lucide-react";
import { Button, Input } from "@harness-kit/ui";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export interface KeyValuePair {
  id?: string;
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  /** Singular noun for one row, used in accessible labels ("Environment variable 1 name"). */
  rowLabel: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  disabled?: boolean;
}

export default function KeyValueEditor({
  pairs,
  onChange,
  rowLabel,
  keyPlaceholder = "KEY",
  valuePlaceholder = "value",
  disabled = false,
}: KeyValueEditorProps) {
  function update(index: number, patch: Partial<KeyValuePair>) {
    onChange(pairs.map((pair, i) => (i === index ? { ...pair, ...patch } : pair)));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {pairs.map((pair, index) => (
        <div key={pair.id ?? String(index)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: "0 0 38%", minWidth: 0 }}>
            <Input
              aria-label={`${rowLabel} ${index + 1} name`}
              value={pair.key}
              onChange={(e) => update(index, { key: e.target.value })}
              placeholder={keyPlaceholder}
              disabled={disabled}
              spellCheck={false}
              style={{ fontFamily: MONO }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Input
              aria-label={`${rowLabel} ${index + 1} value`}
              value={pair.value}
              onChange={(e) => update(index, { value: e.target.value })}
              placeholder={valuePlaceholder}
              disabled={disabled}
              spellCheck={false}
              style={{ fontFamily: MONO }}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => onChange(pairs.filter((_, i) => i !== index))}
            disabled={disabled}
            aria-label={`Remove ${rowLabel.toLowerCase()} ${index + 1}`}
          >
            <X size={13} strokeWidth={1.7} aria-hidden="true" />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          size="sm"
          onClick={() => onChange([...pairs, { id: crypto.randomUUID(), key: "", value: "" }])}
          disabled={disabled}
        >
          <Plus size={13} strokeWidth={1.7} aria-hidden="true" style={{ marginRight: 4 }} />
          Add {rowLabel.toLowerCase()}
        </Button>
      </div>
    </div>
  );
}
