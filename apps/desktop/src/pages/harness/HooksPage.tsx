import { useEffect, useState } from "react";
import { readHooks } from "../../lib/tauri";
import type { HooksConfig, HookCommand } from "@harness-kit/shared";

export default function HooksPage() {
  const [hooks, setHooks] = useState<HooksConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readHooks()
      .then(setHooks)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const hookEntries = hooks ? Object.entries(hooks) : [];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--fg-base)" }}>
          Hooks
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--fg-muted)" }}>
          Claude Code hooks configured in your settings.
        </p>
      </div>

      {loading && (
        <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>Loading hooks…</p>
      )}

      {error && (
        <div
          className="rounded-lg p-4 text-sm"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-base)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      {!loading && !error && hookEntries.length === 0 && (
        <div
          className="rounded-lg p-8 text-center"
          style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-base)" }}
        >
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>No hooks configured.</p>
        </div>
      )}

      {!loading && !error && hookEntries.length > 0 && (
        <div className="flex flex-col gap-3">
          {hookEntries.map(([event, commands]) => (
            <div
              key={event}
              className="rounded-lg p-4"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-base)" }}
            >
              <div className="font-medium text-sm mb-2" style={{ color: "var(--fg-base)" }}>
                {event}
              </div>
              <div className="flex flex-col gap-1">
                {(commands as HookCommand[]).map((cmd, i) => (
                  <code
                    key={i}
                    className="text-xs px-2 py-1 rounded block"
                    style={{ background: "var(--bg-elevated)", color: "var(--fg-muted)", fontFamily: "monospace" }}
                  >
                    {cmd.command}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
