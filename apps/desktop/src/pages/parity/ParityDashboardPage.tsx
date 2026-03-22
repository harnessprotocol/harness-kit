import { useEffect, useState, useCallback } from "react";
import {
  runParityScan,
  getParitySnapshot,
  getParityDrift,
  acknowledgeDrift,
} from "../../lib/tauri";
import type { ParitySnapshot, ParityFeature, ParityDriftItem } from "../../lib/tauri";

// ── Helpers ──────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isOlderThan24h(isoString: string): boolean {
  return Date.now() - new Date(isoString).getTime() > 24 * 60 * 60 * 1000;
}

const CATEGORY_LABELS: Record<string, string> = {
  config_file: "Config Files",
  settings_key: "Settings Keys",
  cli_flag: "CLI Flags",
  cli_subcommand: "CLI Subcommands",
  mcp_transport: "MCP Transports",
  mcp_server: "MCP Servers",
  plugin_type: "Plugin Component Types",
};

const CATEGORY_ORDER = [
  "config_file",
  "settings_key",
  "cli_flag",
  "cli_subcommand",
  "mcp_transport",
  "mcp_server",
  "plugin_type",
];

const CATEGORY_COLORS: Record<string, string> = {
  settings_key: "#0d9488",
  cli_flag: "#2563eb",
  mcp_transport: "#7c3aed",
  plugin_type: "#ea580c",
  config_file: "#16a34a",
  mcp_server: "#64748b",
  cli_subcommand: "#64748b",
};

// ── Stat card ────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: "var(--bg-surface)",
        border: `1px solid ${accent ? "var(--accent)" : "var(--border-base)"}`,
        borderRadius: "8px",
        padding: "12px 16px",
      }}
    >
      <div
        style={{
          fontSize: "20px",
          fontWeight: 600,
          letterSpacing: "-0.5px",
          color: accent ? "var(--accent)" : "var(--fg-base)",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: "4px" }}>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 500,
            fontVariantCaps: "all-small-caps",
            letterSpacing: "0.03em",
            color: "var(--fg-subtle)",
          }}
        >
          {label}
        </span>
      </div>
      {sub && (
        <div
          style={{
            marginTop: "2px",
            fontSize: "11px",
            color: "var(--fg-subtle)",
            opacity: 0.7,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────

function StatusBadge({ status }: { status: "ok" | "new" | "not_found" | "info" }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    ok: { bg: "rgba(22,163,74,0.12)", color: "#16a34a", label: "OK" },
    new: { bg: "rgba(245,158,11,0.12)", color: "#d97706", label: "New" },
    not_found: { bg: "rgba(100,116,139,0.10)", color: "var(--fg-subtle)", label: "Not found" },
    info: { bg: "rgba(100,116,139,0.10)", color: "var(--fg-subtle)", label: "Info" },
  };
  const s = styles[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: "10px",
        fontSize: "10px",
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        letterSpacing: "0.02em",
      }}
    >
      {s.label}
    </span>
  );
}

function featureStatus(feature: ParityFeature): "ok" | "new" | "not_found" | "info" {
  // Config files have special logic based on value field
  if (feature.category === "config_file") {
    if (feature.value === "detected") {
      return feature.knownToHarness ? "ok" : "new";
    }
    return "not_found";
  }
  // Informational categories
  if (feature.category === "mcp_server" || feature.category === "cli_subcommand") {
    return "info";
  }
  return feature.knownToHarness ? "ok" : "new";
}

// ── Feature matrix section ───────────────────────────────────

function FeatureSection({
  category,
  features,
}: {
  category: string;
  features: ParityFeature[];
}) {
  const [open, setOpen] = useState(true);
  const label = CATEGORY_LABELS[category] ?? category;
  const newCount = features.filter((f) => featureStatus(f) === "new").length;

  return (
    <div
      style={{
        border: "1px solid var(--border-base)",
        borderRadius: "8px",
        overflow: "hidden",
        marginBottom: "8px",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          background: "var(--bg-surface)",
          border: "none",
          cursor: "pointer",
          color: "var(--fg-base)",
          fontSize: "12px",
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            color: "var(--fg-subtle)",
            flexShrink: 0,
          }}
        >
          <path d="M3 2l4 3-4 3V2z" />
        </svg>
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ color: "var(--fg-subtle)", fontWeight: 400, fontSize: "11px" }}>
          {features.length} {features.length === 1 ? "item" : "items"}
        </span>
        {newCount > 0 && (
          <span
            style={{
              padding: "1px 7px",
              borderRadius: "10px",
              fontSize: "10px",
              fontWeight: 600,
              background: "rgba(245,158,11,0.12)",
              color: "#d97706",
            }}
          >
            {newCount} new
          </span>
        )}
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--border-base)" }}>
          {features.length === 0 ? (
            <div
              style={{
                padding: "12px 14px",
                fontSize: "12px",
                color: "var(--fg-subtle)",
              }}
            >
              No items detected
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "var(--bg-base)" }}>
                  <th
                    style={{
                      padding: "6px 14px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--fg-subtle)",
                      fontSize: "10px",
                      fontVariantCaps: "all-small-caps",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      padding: "6px 14px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--fg-subtle)",
                      fontSize: "10px",
                      fontVariantCaps: "all-small-caps",
                      letterSpacing: "0.05em",
                      width: "120px",
                    }}
                  >
                    Harness Support
                  </th>
                  <th
                    style={{
                      padding: "6px 14px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--fg-subtle)",
                      fontSize: "10px",
                      fontVariantCaps: "all-small-caps",
                      letterSpacing: "0.05em",
                      width: "100px",
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature, idx) => (
                  <tr
                    key={feature.name}
                    style={{
                      borderTop: idx === 0 ? "none" : "1px solid var(--separator)",
                    }}
                  >
                    <td style={{ padding: "7px 14px", color: "var(--fg-base)", fontFamily: "monospace", fontSize: "11px" }}>
                      {feature.name}
                    </td>
                    <td style={{ padding: "7px 14px", color: "var(--fg-subtle)" }}>
                      {feature.knownToHarness ? "Tracked" : "—"}
                    </td>
                    <td style={{ padding: "7px 14px" }}>
                      <StatusBadge status={featureStatus(feature)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Drift alert row ───────────────────────────────────────────

function DriftRow({
  item,
  onAcknowledge,
}: {
  item: ParityDriftItem;
  onAcknowledge: (id: number) => void;
}) {
  const color = CATEGORY_COLORS[item.category] ?? "#64748b";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "10px 14px",
        borderBottom: "1px solid var(--separator)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: "10px",
          fontSize: "10px",
          fontWeight: 600,
          background: `${color}18`,
          color,
          flexShrink: 0,
          marginTop: "1px",
        }}
      >
        {CATEGORY_LABELS[item.category] ?? item.category}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg-base)", fontFamily: "monospace" }}>
          {item.featureName}
        </div>
        {item.details && (
          <div style={{ fontSize: "11px", color: "var(--fg-subtle)", marginTop: "2px" }}>
            {item.details}
          </div>
        )}
      </div>
      <div style={{ fontSize: "11px", color: "var(--fg-subtle)", flexShrink: 0 }}>
        {relativeTime(item.detectedAt)}
      </div>
      {!item.acknowledged && (
        <button
          onClick={() => onAcknowledge(item.id)}
          style={{
            padding: "3px 10px",
            borderRadius: "5px",
            border: "1px solid var(--border-base)",
            background: "transparent",
            color: "var(--fg-subtle)",
            fontSize: "11px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function ParityDashboardPage() {
  const [snapshot, setSnapshot] = useState<ParitySnapshot | null>(null);
  const [driftItems, setDriftItems] = useState<ParityDriftItem[]>([]);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [snap, drift] = await Promise.all([
        getParitySnapshot(),
        getParityDrift(false),
      ]);
      setSnapshot(snap);
      setDriftItems(drift);
      return snap;
    } catch (err) {
      setError(String(err));
      return null;
    }
  }, []);

  const triggerScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      await runParityScan();
      await loadData();
    } catch (err) {
      setError(String(err));
    } finally {
      setScanning(false);
    }
  }, [loadData]);

  useEffect(() => {
    loadData().then((snap) => {
      // Auto-scan if no snapshot exists or last scan was > 24h ago
      if (!snap || isOlderThan24h(snap.timestamp)) {
        triggerScan();
      }
    });
  }, [loadData, triggerScan]);

  const handleAcknowledge = useCallback(
    async (driftId: number) => {
      try {
        await acknowledgeDrift(driftId);
        setDriftItems((prev) => prev.filter((d) => d.id !== driftId));
      } catch (err) {
        setError(String(err));
      }
    },
    [],
  );

  const handleShowAcknowledged = useCallback(async () => {
    const next = !showAcknowledged;
    setShowAcknowledged(next);
    try {
      const drift = await getParityDrift(next);
      setDriftItems(drift);
    } catch (err) {
      setError(String(err));
    }
  }, [showAcknowledged]);

  const ccVersion = snapshot?.ccVersion ?? null;
  const ccInstalled = snapshot?.ccInstalled ?? false;
  const lastScan = snapshot?.timestamp ?? null;
  const totalFeatures = snapshot
    ? Object.values(snapshot.categories).reduce((sum, arr) => sum + arr.length, 0)
    : 0;
  const activeDrift = driftItems.filter((d) => !d.acknowledged).length;

  const orderedCategories = CATEGORY_ORDER.filter(
    (cat) => snapshot?.categories[cat] && snapshot.categories[cat].length > 0,
  );

  return (
    <div style={{ padding: "24px", maxWidth: "900px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--fg-base)" }}>
            Parity
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--fg-subtle)" }}>
            Track Claude Code feature parity with Harness Kit
          </p>
        </div>
        <button
          onClick={triggerScan}
          disabled={scanning}
          style={{
            padding: "7px 14px",
            borderRadius: "6px",
            border: "1px solid var(--border-base)",
            background: scanning ? "var(--bg-surface)" : "var(--accent)",
            color: scanning ? "var(--fg-subtle)" : "white",
            fontSize: "12px",
            fontWeight: 500,
            cursor: scanning ? "not-allowed" : "pointer",
            opacity: scanning ? 0.7 : 1,
          }}
        >
          {scanning ? "Scanning…" : "Scan Now"}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "6px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "#dc2626",
            fontSize: "12px",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "24px" }}>
        <StatCard
          label="Claude Code"
          value={ccInstalled ? (ccVersion ?? "Installed") : "Not installed"}
          sub={ccInstalled ? "installed" : undefined}
        />
        <StatCard
          label="Last Scan"
          value={lastScan ? relativeTime(lastScan) : "Never"}
          sub={lastScan ? new Date(lastScan).toLocaleDateString() : undefined}
        />
        <StatCard
          label="Features Detected"
          value={scanning ? "…" : String(totalFeatures)}
        />
        <StatCard
          label="Drift Items"
          value={scanning ? "…" : String(activeDrift)}
          accent={activeDrift > 0}
        />
      </div>

      {/* Feature matrix */}
      <div style={{ marginBottom: "24px" }}>
        <h2
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--fg-subtle)",
            margin: "0 0 10px",
            fontVariantCaps: "all-small-caps",
            letterSpacing: "0.05em",
          }}
        >
          Feature Matrix
        </h2>

        {!snapshot && !scanning && (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "var(--fg-subtle)",
              fontSize: "12px",
              border: "1px solid var(--border-base)",
              borderRadius: "8px",
            }}
          >
            No scan data yet. Click "Scan Now" to detect Claude Code features.
          </div>
        )}

        {scanning && !snapshot && (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "var(--fg-subtle)",
              fontSize: "12px",
              border: "1px solid var(--border-base)",
              borderRadius: "8px",
            }}
          >
            Scanning…
          </div>
        )}

        {snapshot &&
          orderedCategories.map((cat) => (
            <FeatureSection
              key={cat}
              category={cat}
              features={snapshot.categories[cat] ?? []}
            />
          ))}
      </div>

      {/* Drift alerts */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
          }}
        >
          <h2
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--fg-subtle)",
              margin: 0,
              fontVariantCaps: "all-small-caps",
              letterSpacing: "0.05em",
            }}
          >
            Drift Alerts
          </h2>
          <button
            onClick={handleShowAcknowledged}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "11px",
              color: "var(--fg-subtle)",
              cursor: "pointer",
              padding: "2px 4px",
            }}
          >
            {showAcknowledged ? "Hide dismissed" : "Show dismissed"}
          </button>
        </div>

        <div
          style={{
            border: "1px solid var(--border-base)",
            borderRadius: "8px",
            overflow: "hidden",
            background: "var(--bg-surface)",
          }}
        >
          {driftItems.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                textAlign: "center",
                color: "var(--fg-subtle)",
                fontSize: "12px",
              }}
            >
              {scanning ? "Scanning for drift…" : "No drift items."}
            </div>
          ) : (
            driftItems.map((item) => (
              <DriftRow key={item.id} item={item} onAcknowledge={handleAcknowledge} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
