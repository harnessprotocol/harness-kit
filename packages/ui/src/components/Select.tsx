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

export function Select({ label, helperText, error, options, id, className = "", ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
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
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {helperText && (
        <div className="hk-helper-text" data-error={error ? "true" : undefined}>
          {helperText}
        </div>
      )}
    </div>
  );
}
