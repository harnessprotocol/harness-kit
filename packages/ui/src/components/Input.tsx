import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: ReactNode;
  error?: boolean;
}

export function Input({
  label,
  helperText,
  error,
  id,
  className = "",
  "aria-describedby": describedBy,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  // The helper text is the control's description, so a screen reader hears
  // an error message with the field it belongs to.
  const helperId = `${inputId}-helper`;
  const ariaDescribedBy =
    [describedBy, helperText ? helperId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <div className="hk-field">
      {label && (
        <label className="hk-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={["hk-input", className].filter(Boolean).join(" ")}
        data-error={error ? "true" : undefined}
        aria-invalid={error || undefined}
        aria-describedby={ariaDescribedBy}
        {...rest}
      />
      {helperText && (
        <div id={helperId} className="hk-helper-text" data-error={error ? "true" : undefined}>
          {helperText}
        </div>
      )}
    </div>
  );
}
