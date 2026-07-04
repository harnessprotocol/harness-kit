import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: ReactNode;
  error?: boolean;
}

export function Input({ label, helperText, error, id, className = "", ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
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
        {...rest}
      />
      {helperText && (
        <div className="hk-helper-text" data-error={error ? "true" : undefined}>
          {helperText}
        </div>
      )}
    </div>
  );
}
