import { createPortal } from "react-dom";
import { useEffect } from "react";

interface WelcomeScreenProps {
  onDismiss: () => void;
}

export default function WelcomeScreen({ onDismiss }: WelcomeScreenProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter") {
        e.preventDefault();
        onDismiss();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-base)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          padding: "0 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        {/* Logo — PROVISIONAL mark, mirrors website HarnessKitLogo.tsx (redesign planned) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 32 32"
          style={{
            width: 36,
            height: 36,
            marginBottom: 16,
            filter: "drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 60%, transparent))",
            flexShrink: 0,
          }}
        >
          <rect width="32" height="32" rx="7" fill="#131215" />
          <g stroke="#6BC0F5" strokeWidth="2.8" strokeLinecap="round" fill="none">
            <path d="M9 9.5 C 15 11, 17.5 13.5, 19.4 14.9" />
            <path d="M9 22.5 C 15 21, 17.5 18.5, 19.4 17.1" />
          </g>
          <circle cx="9" cy="9.5" r="1.9" fill="#6BC0F5" />
          <circle cx="9" cy="22.5" r="1.9" fill="#6BC0F5" />
          <circle cx="22" cy="16" r="3.3" fill="#6BC0F5" />
        </svg>

        {/* Headline */}
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--fg-base)",
            letterSpacing: "-0.4px",
            margin: 0,
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          Welcome to Harness Kit
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: "13px",
            color: "var(--fg-muted)",
            lineHeight: 1.55,
            margin: 0,
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          The control plane for your AI coding harnesses.
        </p>

        {/* CTA */}
        <button
          onClick={onDismiss}
          autoFocus
          style={{
            fontSize: "13px",
            fontWeight: 600,
            padding: "8px 28px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent)",
            // White label on the azure fill (primary button); --accent-fg
            // is the link/hover text color and is unreadable on --accent.
            color: "#f7f8f8",
            cursor: "pointer",
            letterSpacing: "-0.1px",
            outline: "none",
          }}
          onKeyDown={(e) => e.key === "Enter" && onDismiss()}
          onFocus={(e) =>
            (e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent)")
          }
          onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
        >
          Continue →
        </button>
      </div>
    </div>,
    document.body,
  );
}
