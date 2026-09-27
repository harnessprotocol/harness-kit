import { useId, type ReactNode, type SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  helperText?: ReactNode;
  error?: boolean;
  options: SelectOption[];
}

export function Select({
  label,
  helperText,
  error,
  options,
  id,
  className = "",
  "aria-describedby": describedBy,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  // The helper text is the control's description, so a screen reader hears
  // an error message with the field it belongs to.
  const helperId = `${selectId}-helper`;
  const ariaDescribedBy =
    [describedBy, helperText ? helperId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <div className="hk-field">
      {label && (
        <label className="hk-label" htmlFor={selectId}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={["hk-select", className].filter(Boolean).join(" ")}
        data-error={error ? "true" : undefined}
        aria-invalid={error || undefined}
        aria-describedby={ariaDescribedBy}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {helperText && (
        <div id={helperId} className="hk-helper-text" data-error={error ? "true" : undefined}>
          {helperText}
        </div>
      )}
    </div>
  );
}
