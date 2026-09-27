import { AlertTriangle, XCircle } from "lucide-react";
import { Button } from "./Button.js";

export type ErrorNoticeTone = "danger" | "warning";

export interface ErrorNoticeAction {
  label: string;
  onClick: () => void;
}

export interface ErrorNoticeProps {
  /** What failed, in plain words: "Couldn't scan this machine". */
  title: string;
  /** The one thing to do about it, usually a retry. */
  action?: ErrorNoticeAction;
  /** The raw error, shown only when the reader opens "Details". */
  details?: string;
  /** "danger" (default) for a failure; "warning" for a partial result. */
  tone?: ErrorNoticeTone;
  className?: string;
}

/**
 * A failed scan or load (spec AC-20, design D14): one sentence naming what
 * failed, at most one action, and the raw error behind a "Details"
 * disclosure so it never reads as the message.
 *
 * Only the title is a live region. role="alert" is atomic, so a region that
 * also held the disclosure would re-announce itself when Details opens.
 */
export function ErrorNotice({ title, action, details, tone = "danger", className = "" }: ErrorNoticeProps) {
  const Icon = tone === "warning" ? AlertTriangle : XCircle;
  return (
    <div className={["hk-error-notice", className].filter(Boolean).join(" ")} data-tone={tone}>
      <div className="hk-error-notice-row">
        <Icon className="hk-error-notice-icon" size={16} strokeWidth={1.7} aria-hidden="true" />
        <p className="hk-error-notice-title" role={tone === "danger" ? "alert" : "status"}>
          {title}
        </p>
        {action && (
          <Button type="button" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
      {details && (
        <details className="hk-error-notice-details">
          <summary>Details</summary>
          <pre>{details}</pre>
        </details>
      )}
    </div>
  );
}
