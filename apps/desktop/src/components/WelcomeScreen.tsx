import { createPortal } from "react-dom";
import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";

interface WelcomeScreenProps {
  onDismiss: () => void;
}

const cards: { title: string; body: React.ReactNode }[] = [
  {
    title: "Configure",
    body: "Keep harness.yaml as the source of truth, then compile it to Claude Code, Cursor, Copilot, Codex, and other native configs.",
  },
  {
    title: "Operate",
    body: "Use Board, Roadmap, Agents, Terminals, and Comparator to turn AI coding into a repeatable workflow instead of one-off sessions.",
  },
  {
    title: "Govern",
    body: (
      <>
        Inspect permissions, secrets, audit logs, local services, parity, and usage. AI Chat still needs{" "}
        <button
          onClick={() => open("https://ollama.ai")}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 500,
            textDecoration: "underline",
            textUnderlineOffset: "2px",
          }}
        >
          Ollama
        </button>
        .
      </>
    ),
  },
];

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
          <rect width="32" height="32" rx="7" fill="#13141d" />
          <g stroke="#7d8dff" strokeWidth="2.8" strokeLinecap="round" fill="none">
            <path d="M9 9.5 C 15 11, 17.5 13.5, 19.4 14.9" />
            <path d="M9 22.5 C 15 21, 17.5 18.5, 19.4 17.1" />
          </g>
          <circle cx="9" cy="9.5" r="1.9" fill="#7d8dff" />
          <circle cx="9" cy="22.5" r="1.9" fill="#7d8dff" />
          <circle cx="22" cy="16" r="3.3" fill="#7d8dff" />
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
            marginBottom: 28,
            textAlign: "center",
          }}
        >
          Portable AI coding governance, workflows, and observability across every tool your team uses.
        </p>

        {/* Info cards */}
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 32,
          }}
        >
          {cards.map((card) => (
            <div
              key={card.title}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-base)",
                borderRadius: 8,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--fg-base)",
                  marginBottom: 4,
                }}
              >
                {card.title}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--fg-muted)",
                  lineHeight: 1.55,
                }}
              >
                {card.body}
              </div>
            </div>
          ))}
        </div>

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
            color: "var(--accent-fg)",
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
          Get started →
        </button>
      </div>
    </div>,
    document.body,
  );
}
