import { useEffect, useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { Button, Input, Toggle } from "@harness-kit/ui";
import type { YamlPatch } from "../../../lib/harness-yaml-patch";
import { asList } from "./shape";

/** What a section calls to change harness.yaml. Absent means the section is read-only. */
export type OnPatch = ((patch: YamlPatch) => void) | undefined;

/** Local draft that follows the value from outside (a Monaco edit, another field). */
function useDraft(value: string): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return [draft, setDraft];
}

const staticValueStyle: CSSProperties = { fontSize: "13px", color: "var(--fg-base)", margin: 0, wordBreak: "break-word" };
const labelStyle: CSSProperties = { fontSize: "12px", fontWeight: 550, color: "var(--fg-muted)" };

interface TextFieldProps {
  label: string;
  value: string;
  /** Called on blur or Enter when the text changed. Absent renders the value as text. */
  onCommit?: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  mono?: boolean;
  /** Accessible name when the visible label repeats across entries ("Name" in every plugin). */
  ariaLabel?: string;
}

/** A labelled text field that writes through on blur or Enter, not on every keystroke. */
export function TextField({ label, value, onCommit, multiline, placeholder, mono, ariaLabel }: TextFieldProps) {
  const [draft, setDraft] = useDraft(value);
  const id = useId();

  if (!onCommit) {
    if (!value) return null;
    return (
      <div>
        <div style={{ ...labelStyle, fontSize: "11px" }}>{label}</div>
        <p style={{ ...staticValueStyle, fontFamily: mono ? "ui-monospace, monospace" : undefined, whiteSpace: multiline ? "pre-wrap" : undefined }}>
          {value}
        </p>
      </div>
    );
  }

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  if (multiline) {
    return (
      <div className="hk-field">
        <label className="hk-label" htmlFor={id}>{label}</label>
        <textarea
          id={id}
          aria-label={ariaLabel}
          className="hk-input"
          rows={5}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          style={{ fontFamily: "ui-monospace, monospace", resize: "vertical" }}
        />
      </div>
    );
  }

  return (
    <Input
      id={id}
      label={label}
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      style={mono ? { fontFamily: "ui-monospace, monospace" } : undefined}
    />
  );
}

/** A labelled on/off switch. */
export function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange?: (next: boolean) => void }) {
  const id = useId();
  if (!onChange) return checked ? <span style={{ ...labelStyle, fontSize: "11px" }}>{label}</span> : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <Toggle id={id} checked={checked} onChange={onChange} aria-label={label} />
      <label htmlFor={id} style={labelStyle}>{label}</label>
    </div>
  );
}

/** Icon button that removes a list entry or map key. */
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} aria-label={label} title={label} style={{ flexShrink: 0 }}>
      <X size={12} strokeWidth={1.8} aria-hidden="true" />
    </Button>
  );
}

/** One entry in an editable list: its fields in a column, a remove button beside them. */
export function EntryRow({ children, onRemove, removeLabel }: { children: ReactNode; onRemove?: () => void; removeLabel: string }) {
  return (
    <div className="row-list-item" style={{ alignItems: "flex-start", gap: "8px" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>{children}</div>
      {onRemove && <RemoveButton label={removeLabel} onClick={onRemove} />}
    </div>
  );
}

interface AddFormProps {
  /** Names the form for assistive tech and the submit button: "Add plugin". */
  title: string;
  fields: Array<{ key: string; label: string; required?: boolean; placeholder?: string }>;
  onAdd: (values: Record<string, string>) => void;
}

/** Inline form that adds one entry. Submit stays off until the required fields have text. */
export function AddForm({ title, fields, onAdd }: AddFormProps) {
  const empty = () => Object.fromEntries(fields.map((f) => [f.key, ""]));
  const [values, setValues] = useState<Record<string, string>>(empty);
  const ready = fields.every((f) => !f.required || values[f.key].trim() !== "");

  function submit() {
    if (!ready) return;
    onAdd(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])));
    setValues(empty());
  }

  return (
    <form
      role="group"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}
    >
      {fields.map((f) => (
        <Input
          key={f.key}
          label={f.label}
          value={values[f.key]}
          placeholder={f.placeholder}
          onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
        />
      ))}
      <div>
        <Button type="submit" variant="ghost" size="sm" disabled={!ready}>
          {title}
        </Button>
      </div>
    </form>
  );
}

/** Editable list of strings: one field per entry with Remove, plus an add field. */
export function StringListEditor({
  label,
  items,
  path,
  onPatch,
  itemLabel,
}: {
  label: string;
  items: string[];
  path: ReadonlyArray<string | number>;
  onPatch: NonNullable<OnPatch>;
  itemLabel: string;
}) {
  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: "6px" }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {asList<string>(items).map((item, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextField
                label={`${itemLabel} ${i + 1}`}
                ariaLabel={`${label}: ${itemLabel.toLowerCase()} ${i + 1}`}
                value={item}
                mono
                onCommit={(next) =>
                  onPatch(next.trim() === "" ? { op: "remove", path: [...path, i] } : { op: "set", path: [...path, i], value: next.trim() })
                }
              />
            </div>
            <RemoveButton label={`Remove ${itemLabel.toLowerCase()} ${item}`} onClick={() => onPatch({ op: "remove", path: [...path, i] })} />
          </div>
        ))}
        <AddForm
          title={`Add ${itemLabel.toLowerCase()} to ${label.toLowerCase()}`}
          fields={[{ key: "value", label: `New ${itemLabel.toLowerCase()}`, required: true }]}
          onAdd={({ value }) => onPatch({ op: "append", path, value })}
        />
      </div>
    </div>
  );
}
