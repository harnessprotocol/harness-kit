import { useId, useState } from "react";
import { Eye, EyeOff, Plus, X } from "lucide-react";
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

/** Names used by more than one row, trimmed, in first-seen order. */
export function duplicateKeys(pairs: readonly KeyValuePair[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { key } of pairs) {
    const name = key.trim();
    if (!name) continue;
    if (seen.has(name)) repeated.add(name);
    seen.add(name);
  }
  return [...repeated];
}

/**
 * Rows of name/value pairs. Values are masked by default (env vars and
 * headers are where tokens live), with a per-row reveal.
 */
export default function KeyValueEditor({
  pairs,
  onChange,
  rowLabel,
  keyPlaceholder = "KEY",
  valuePlaceholder = "value",
  disabled = false,
}: KeyValueEditorProps) {
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const duplicateErrorId = useId();
  const duplicates = duplicateKeys(pairs);
  const noun = rowLabel.toLowerCase();

  function update(index: number, patch: Partial<KeyValuePair>) {
    onChange(pairs.map((pair, i) => (i === index ? { ...pair, ...patch } : pair)));
  }

  function toggleReveal(rowKey: string) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {pairs.map((pair, index) => {
        const rowKey = pair.id ?? String(index);
        const shown = revealed.has(rowKey);
        const duplicated = duplicates.includes(pair.key.trim());
        return (
          <div key={rowKey} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: "0 0 38%", minWidth: 0 }}>
              <Input
                aria-label={`${rowLabel} ${index + 1} name`}
                value={pair.key}
                onChange={(e) => update(index, { key: e.target.value })}
                placeholder={keyPlaceholder}
                disabled={disabled}
                spellCheck={false}
                error={duplicated}
                aria-describedby={duplicated ? duplicateErrorId : undefined}
                style={{ fontFamily: MONO }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Input
                aria-label={`${rowLabel} ${index + 1} value`}
                type={shown ? "text" : "password"}
                autoComplete="off"
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
              onClick={() => toggleReveal(rowKey)}
              disabled={disabled}
              aria-label={`${shown ? "Hide" : "Show"} ${noun} ${index + 1} value`}
              aria-pressed={shown}
            >
              {shown
                ? <EyeOff size={13} strokeWidth={1.7} aria-hidden="true" />
                : <Eye size={13} strokeWidth={1.7} aria-hidden="true" />}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onChange(pairs.filter((_, i) => i !== index))}
              disabled={disabled}
              aria-label={`Remove ${noun} ${index + 1}`}
            >
              <X size={13} strokeWidth={1.7} aria-hidden="true" />
            </Button>
          </div>
        );
      })}
      {duplicates.length > 0 && (
        <div id={duplicateErrorId} className="hk-helper-text" data-error="true">
          {duplicates.join(", ")} {duplicates.length === 1 ? "is" : "are"} used more than once. Each name
          can appear once.
        </div>
      )}
      <div>
        <Button
          type="button"
          size="sm"
          onClick={() => onChange([...pairs, { id: crypto.randomUUID(), key: "", value: "" }])}
          disabled={disabled}
        >
          <Plus size={13} strokeWidth={1.7} aria-hidden="true" style={{ marginRight: 4 }} />
          Add {noun}
        </Button>
      </div>
    </div>
  );
}
