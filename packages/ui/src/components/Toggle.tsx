export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
}

/** 36x20-ish track, 16px thumb. Off = --border-strong, on = --accent. */
export function Toggle({ checked, onChange, disabled, id, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      className="hk-toggle"
      data-checked={checked ? "true" : undefined}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className="hk-toggle-thumb" />
    </button>
  );
}
