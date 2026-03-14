import { useEffect, useState } from "react";
import { listInstalledPlugins } from "../../lib/tauri";
import type { InstalledPlugin } from "@harness-kit/shared";

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInstalledPlugins()
      .then(setPlugins)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--fg-base)" }}>
          Installed Plugins
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--fg-muted)" }}>
          Plugins installed in your <code style={{ fontFamily: "monospace" }}>~/.claude/</code> environment.
        </p>
      </div>

      {loading && (
        <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>
          Loading plugins…
        </p>
      )}

      {error && (
        <div
          className="rounded-lg p-4 text-sm"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-base)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      {!loading && !error && plugins.length === 0 && (
        <div
          className="rounded-lg p-8 text-center"
          style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-base)" }}
        >
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            No plugins installed yet.
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--fg-subtle)" }}>
            Install plugins from the Marketplace or via <code>/plugin install</code> in Claude Code.
          </p>
        </div>
      )}

      {!loading && !error && plugins.length > 0 && (
        <div className="flex flex-col gap-2">
          {plugins.map((plugin) => (
            <div
              key={plugin.name}
              className="flex items-center justify-between rounded-lg px-4 py-3"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-base)",
              }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm" style={{ color: "var(--fg-base)" }}>
                    {plugin.name}
                  </span>
                  {plugin.marketplace && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: "var(--accent-light)", color: "var(--accent-fg)" }}
                    >
                      {plugin.marketplace}
                    </span>
                  )}
                </div>
                {plugin.description && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted)" }}>
                    {plugin.description}
                  </p>
                )}
              </div>
              <span className="text-xs font-mono" style={{ color: "var(--fg-subtle)" }}>
                {plugin.version}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
