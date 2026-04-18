import { useState, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────

type ServiceStatus = "unknown" | "up" | "down" | "checking";

interface ServiceConfig {
  id: string;
  name: string;
  description: string;
  port: number;
  healthUrl: string;
  devFilter: string;
}

interface ServiceState {
  status: ServiceStatus;
}

// ── Config ───────────────────────────────────────────────────

const SERVICES: ServiceConfig[] = [
  {
    id: "board-server",
    name: "Board & Roadmap Server",
    description: "Powers the Kanban board, roadmap, and competitor analysis",
    port: 4800,
    healthUrl: "http://localhost:4800/health",
    devFilter: "board-server",
  },
  {
    id: "agent-server",
    name: "Agent Server",
    description: "Runs AI agent tasks attached to board cards",
    port: 4802,
    healthUrl: "http://localhost:4802/health",
    devFilter: "agent-server",
  },
  {
    id: "chat-relay",
    name: "Chat Relay",
    description: "WebSocket relay for team chat sessions",
    port: 4801,
    healthUrl: "http://localhost:4801/health",
    devFilter: "chat-relay",
  },
  {
    id: "membrain",
    name: "Membrain (Memory)",
    description: "MCP knowledge graph server for the Memory feature",
    port: 4803,
    healthUrl: "http://localhost:4803/health",
    devFilter: "membrain",
  },
];

const TIMEOUT_MS = 2500;

// ── Design tokens ────────────────────────────────────────────

const t = {
  bgBase: "var(--bg-base)",
  bgSurface: "var(--bg-surface)",
  bgElevated: "var(--bg-elevated)",
  fgBase: "var(--fg-base)",
  fgMuted: "var(--fg-muted)",
  fgSubtle: "var(--fg-subtle)",
  borderBase: "var(--border-base)",
  borderSubtle: "var(--border-subtle)",
  accent: "var(--accent)",
  accentLight: "var(--accent-light)",
  accentText: "var(--accent-text)",
  success: "var(--success)",
  successLight: "var(--success-light)",
  shadowSm: "var(--shadow-sm)",
};

// ── Helpers ──────────────────────────────────────────────────

async function pingService(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ── Status dot ───────────────────────────────────────────────

function StatusDot({ status }: { status: ServiceStatus }) {
  const color =
    status === "up"
      ? "var(--success)"
      : status === "checking"
      ? "var(--accent)"
      : "var(--fg-subtle)";

  return (
    <span
      aria-label={status}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        ...(status === "checking"
          ? { animation: "hk-pulse 1.2s ease-in-out infinite" }
          : {}),
      }}
    />
  );
}

// ── Port badge ───────────────────────────────────────────────

function PortBadge({ port }: { port: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 7px",
        borderRadius: 4,
        border: `1px solid ${t.borderBase}`,
        background: t.bgBase,
        fontSize: 11,
        fontFamily: "ui-monospace, monospace",
        color: t.fgSubtle,
        flexShrink: 0,
      }}
    >
      :{port}
    </span>
  );
}

// ── Service card ─────────────────────────────────────────────

function ServiceCard({
  service,
  state,
  onCheck,
}: {
  service: ServiceConfig;
  state: ServiceState;
  onCheck: () => void;
}) {
  const statusLabel =
    state.status === "up"
      ? "Running"
      : state.status === "checking"
      ? "Checking…"
      : state.status === "down"
      ? "Unreachable"
      : "Unknown";

  const statusColor =
    state.status === "up"
      ? t.success
      : state.status === "checking"
      ? t.accent
      : t.fgSubtle;

  return (
    <div
      style={{
        background: t.bgElevated,
        border: `1px solid ${t.borderBase}`,
        borderRadius: 10,
        padding: "16px 18px",
        boxShadow: t.shadowSm,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StatusDot status={state.status} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: t.fgBase,
            flex: 1,
            minWidth: 0,
          }}
        >
          {service.name}
        </span>
        <PortBadge port={service.port} />
      </div>

      {/* Description */}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.6,
          color: t.fgMuted,
        }}
      >
        {service.description}
      </p>

      {/* Status + action row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>
          {statusLabel}
        </span>
        <button
          onClick={onCheck}
          disabled={state.status === "checking"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 12px",
            borderRadius: 6,
            border: `1px solid ${t.borderBase}`,
            background: t.bgBase,
            color: t.fgMuted,
            fontSize: 11,
            fontWeight: 500,
            cursor: state.status === "checking" ? "default" : "pointer",
            opacity: state.status === "checking" ? 0.6 : 1,
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (state.status !== "checking") {
              (e.currentTarget as HTMLButtonElement).style.background =
                t.accentLight;
              (e.currentTarget as HTMLButtonElement).style.color = t.accentText;
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = t.bgBase;
            (e.currentTarget as HTMLButtonElement).style.color = t.fgMuted;
          }}
          aria-label={`Check status of ${service.name}`}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clipRule="evenodd"
            />
          </svg>
          Check status
        </button>
      </div>

      {/* Tip when down */}
      {state.status === "down" && (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            background: t.bgSurface,
            border: `1px solid ${t.borderSubtle}`,
            fontSize: 11,
            color: t.fgSubtle,
            lineHeight: 1.5,
          }}
        >
          Start it with:{" "}
          <code
            style={{
              fontFamily: "ui-monospace, monospace",
              color: t.fgMuted,
              background: t.bgBase,
              padding: "1px 5px",
              borderRadius: 3,
              border: `1px solid ${t.borderSubtle}`,
            }}
          >
            pnpm --filter {service.devFilter} dev
          </code>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function ServicesPage() {
  const [states, setStates] = useState<Record<string, ServiceState>>(() =>
    Object.fromEntries(SERVICES.map((s) => [s.id, { status: "unknown" as ServiceStatus }]))
  );

  const checkService = useCallback(async (service: ServiceConfig) => {
    setStates((prev) => ({
      ...prev,
      [service.id]: { status: "checking" },
    }));
    const ok = await pingService(service.healthUrl);
    setStates((prev) => ({
      ...prev,
      [service.id]: { status: ok ? "up" : "down" },
    }));
  }, []);

  const checkAll = useCallback(() => {
    SERVICES.forEach((s) => checkService(s));
  }, [checkService]);

  // Auto-check on mount
  useEffect(() => {
    checkAll();
  }, [checkAll]);

  const allUp = SERVICES.every((s) => states[s.id]?.status === "up");
  const upCount = SERVICES.filter((s) => states[s.id]?.status === "up").length;
  const anyChecking = SERVICES.some((s) => states[s.id]?.status === "checking");

  return (
    <>
      {/* Pulse animation for checking dots */}
      <style>{`
        @keyframes hk-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>

      <div
        style={{
          padding: "28px 32px",
          maxWidth: 720,
          margin: "0 auto",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
        }}
      >
        {/* Page header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: t.fgBase,
                letterSpacing: "-0.3px",
              }}
            >
              Background Services
            </h1>
            <p
              style={{
                margin: "5px 0 0",
                fontSize: 12,
                lineHeight: 1.65,
                color: t.fgMuted,
                maxWidth: 500,
              }}
            >
              These local servers power Board, Roadmap, Memory, and AI Chat.
              They start automatically — this page shows their status.
            </p>
          </div>

          {/* Summary badge + refresh */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: allUp ? t.success : t.fgSubtle,
                padding: "3px 10px",
                borderRadius: 20,
                border: `1px solid ${allUp ? "var(--success)" : t.borderBase}`,
                background: allUp ? "var(--success-light)" : t.bgSurface,
              }}
            >
              {upCount}/{SERVICES.length} running
            </span>
            <button
              onClick={checkAll}
              disabled={anyChecking}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: 7,
                border: `1px solid ${t.borderBase}`,
                background: t.bgElevated,
                color: t.fgMuted,
                fontSize: 11,
                fontWeight: 500,
                cursor: anyChecking ? "default" : "pointer",
                opacity: anyChecking ? 0.6 : 1,
                transition: "background 0.15s",
                boxShadow: t.shadowSm,
              }}
              aria-label="Refresh all service statuses"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                style={anyChecking ? { animation: "hk-pulse 1.2s ease-in-out infinite" } : {}}
              >
                <path
                  fillRule="evenodd"
                  d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                  clipRule="evenodd"
                />
              </svg>
              Refresh all
            </button>
          </div>
        </div>

        {/* Service cards grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
          }}
        >
          {SERVICES.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              state={states[service.id]}
              onCheck={() => checkService(service)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
