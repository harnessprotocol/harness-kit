import { createPortal } from "react-dom";
import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";

interface WelcomeScreenProps {
  onDismiss: () => void;
}

const cards: { title: string; body: React.ReactNode }[] = [
  {
    title: "AI Chat",
    body: (
      <>
        Requires Ollama running locally.{" "}
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
          Download Ollama ↗
        </button>
      </>
    ),
  },
  {
    title: "Board, Roadmap & Memory",
    body: "These features run a local server. They start automatically when you navigate to them.",
  },
  {
    title: "Plugins",
    body: (
      <>
        Add the Claude Code marketplace to install skills:{" "}
        <code
          style={{
            fontSize: "11px",
            background: "var(--bg-base)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "4px",
            padding: "1px 5px",
            color: "var(--fg-base)",
            letterSpacing: "0",
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            wordBreak: "break-all",
          }}
        >
          /plugin marketplace add harnessprotocol/harness-kit
        </code>
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
        {/* Logo */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 28 28"
          style={{
            width: 36,
            height: 36,
            marginBottom: 16,
            filter: "drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 60%, transparent))",
            flexShrink: 0,
          }}
        >
          <rect width="28" height="28" rx="6" fill="#0d0d0d" />
          <text
            x="14"
            y="19"
            textAnchor="middle"
            fontFamily="system-ui, sans-serif"
            fontWeight="700"
            fontSize="13"
            fill="var(--accent)"
          >
            hk
          </text>
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
          Your all-in-one desktop companion for Claude Code — manage harnesses, plugins,
          AI chat, boards, and more.
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
