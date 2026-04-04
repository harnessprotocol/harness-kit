import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import {
  listInstalledPlugins, checkPluginUpdates, uninstallPlugin,
  importPluginFromPath, importPluginFromZip,
  exportPluginAsZip, exportPluginToFolder,
} from "../../lib/tauri";
import type { InstalledPlugin, PluginUpdateInfo } from "@harness-kit/shared";
import ContextMenu, { type ContextMenuItem } from "../../components/ContextMenu";
import PluginFilters from "./plugins/PluginFilters";
import PluginRow from "./plugins/PluginRow";
import ImportOverlay from "./plugins/ImportOverlay";
import ImportBanner, { type ImportStatus } from "./plugins/ImportBanner";
import UninstallDialog from "./plugins/UninstallDialog";
import { useChat } from "../../context/ChatContext";
import { emitChatShare } from "../../lib/chat-events";

export default function PluginsPage() {
  const navigate = useNavigate();
  const { state: chatState } = useChat();
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [updates, setUpdates] = useState<Record<string, PluginUpdateInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; plugin: InstalledPlugin } | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  // Import state
  const [dragCount, setDragCount] = useState(0);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);

  // Uninstall state
  const [uninstallTarget, setUninstallTarget] = useState<InstalledPlugin | null>(null);

  const loadPlugins = useCallback(() => {
    listInstalledPlugins()
      .then(setPlugins)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));

    checkPluginUpdates()
      .then((infos) => {
        const map: Record<string, PluginUpdateInfo> = {};
        for (const info of infos) map[info.name] = info;
        setUpdates(map);
      })
      .catch(() => {}); // updates are best-effort
  }, []);

  useEffect(loadPlugins, [loadPlugins]);

  // Derived data
  const categories = useMemo(
    () => [...new Set(plugins.map((p) => p.category).filter(Boolean) as string[])].sort(),
    [plugins],
  );

  const filtered = useMemo(() => {
    let result = plugins;
    if (category) {
      result = result.filter((p) => p.category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q)) ||
          (p.category?.toLowerCase().includes(q)) ||
          p.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [plugins, search, category]);

  const hasUpdates = Object.keys(updates).length > 0;

  // ── Drag-and-drop ────────────────────────────────────────

  const dragRef = useRef(0);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragRef.current++;
    setDragCount(dragRef.current);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragRef.current--;
    setDragCount(dragRef.current);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragRef.current = 0;
    setDragCount(0);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    const path = (file as File & { path?: string }).path;
    if (!path) return;

    const isZip = path.endsWith(".zip");
    const name = path.split("/").pop() || "plugin";

    setImportStatus({ state: "importing", name });
    try {
      if (isZip) {
        await importPluginFromZip(path);
      } else {
        await importPluginFromPath(path);
      }
      setImportStatus({ state: "success", name });
      loadPlugins();
      if (chatState.status === "in_room") {
        emitChatShare({ action: "plugin_installed", target: name, detail: null, diff: null, pullable: false });
      }
    } catch (err) {
      setImportStatus({ state: "error", message: String(err) });
    }
  }

  // ── Import from folder picker ────────────────────────────

  async function handleImportFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: "Select plugin folder" });
      if (!selected) return;

      const path = typeof selected === "string" ? selected : selected;
      const name = path.split("/").pop() || "plugin";

      setImportStatus({ state: "importing", name });
      try {
        await importPluginFromPath(path);
        setImportStatus({ state: "success", name });
        loadPlugins();
        if (chatState.status === "in_room") {
          emitChatShare({ action: "plugin_installed", target: name, detail: null, diff: null, pullable: false });
        }
      } catch (err) {
        setImportStatus({ state: "error", message: String(err) });
      }
    } catch {
      // Dialog plugin not available or cancelled
    }
  }

  // ── Uninstall ────────────────────────────────────────────

  async function handleUninstall() {
    if (!uninstallTarget) return;
    const pluginName = uninstallTarget.name;
    try {
      await uninstallPlugin(pluginName);
      setUninstallTarget(null);
      loadPlugins();
      if (chatState.status === "in_room") {
        emitChatShare({ action: "plugin_uninstalled", target: pluginName, detail: null, diff: null, pullable: false });
      }
    } catch (err) {
      setError(String(err));
      setUninstallTarget(null);
    }
  }

  // ── Context menu builder ─────────────────────────────────

  function buildContextMenuItems(plugin: InstalledPlugin): ContextMenuItem[] {
    return [
      { label: "Copy name", onClick: () => navigator.clipboard.writeText(plugin.name) },
      {
        label: "Open in Finder",
        onClick: async () => {
          if (plugin.source) {
            const { open } = await import("@tauri-apps/plugin-shell");
            open(plugin.source);
          }
        },
      },
      { separator: true },
      {
        label: "Export as zip...",
        onClick: async () => {
          if (!plugin.source) return;
          try {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const savePath = await save({
              defaultPath: `${plugin.name}.zip`,
              title: "Export plugin as zip",
            });
            if (savePath) await exportPluginAsZip(plugin.source, savePath);
          } catch { /* cancelled */ }
        },
      },
      {
        label: "Export to folder...",
        onClick: async () => {
          if (!plugin.source) return;
          try {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const dest = await open({ directory: true, title: "Export plugin to folder" });
            if (dest) await exportPluginToFolder(plugin.source, dest as string);
          } catch { /* cancelled */ }
        },
      },
      { separator: true },
      { label: "Uninstall", danger: true, onClick: () => setUninstallTarget(plugin) },
    ];
  }

  // ── Render ───────────────────────────────────────────────

  return (
    <div
      style={{ padding: "20px 24px", height: "100%", display: "flex", flexDirection: "column" }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
            Installed Plugins
          </h1>
          <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
            Plugins in your <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>~/.claude/</code> environment.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleImportFolder}
            style={{
              fontSize: "12px", fontWeight: 500, padding: "5px 12px",
              borderRadius: "6px", border: "1px solid var(--accent)",
              background: "rgba(91,80,232,0.08)", color: "var(--accent-text)",
              cursor: "pointer",
            }}
          >
            Import Plugin
          </button>
          {hasUpdates && (
            <button
              disabled
              title="Run /plugin update in Claude Code to apply updates"
              style={{
                fontSize: "12px", fontWeight: 500, padding: "5px 12px",
                borderRadius: "6px", border: "1px solid var(--border-base)",
                background: "var(--bg-elevated)", color: "var(--fg-muted)",
                cursor: "not-allowed", opacity: 0.7,
              }}
            >
              Update All ({Object.keys(updates).length})
            </button>
          )}
        </div>
      </div>

      {/* Import banner */}
      <ImportBanner status={importStatus} onDismiss={() => setImportStatus(null)} />

      {loading && (
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
      )}

      {error && (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-base)",
          borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "var(--danger)",
          marginBottom: "12px",
        }}>
          {error}
        </div>
      )}

      {!loading && !error && plugins.length === 0 && (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-base)",
          borderRadius: "8px", padding: "40px 16px", textAlign: "center",
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: "var(--fg-subtle)", marginBottom: "10px" }}>
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M17.5 14v7M14 17.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: "0 0 4px" }}>No plugins installed.</p>
          <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: "0 0 12px" }}>
            Install via <code style={{ fontFamily: "ui-monospace, monospace" }}>/plugin install</code> in Claude Code, or drag a plugin folder here.
          </p>
          <button
            onClick={() => navigate("/marketplace")}
            style={{
              fontSize: "11px", color: "var(--accent-text)", background: "none",
              border: "none", cursor: "pointer", fontWeight: 500, padding: 0,
            }}
          >
            Browse Marketplace →
          </button>
        </div>
      )}

      {!loading && !error && plugins.length > 0 && (
        <>
          <PluginFilters
            search={search}
            onSearchChange={setSearch}
            category={category}
            onCategoryChange={setCategory}
            categories={categories}
            total={plugins.length}
            filtered={filtered.length}
          />

          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border-base)",
            borderRadius: "8px", overflow: "hidden", flex: 1,
          }}>
            <AnimatePresence mode="popLayout">
              {filtered.map((plugin, i) => (
                <PluginRow
                  key={plugin.name}
                  plugin={plugin}
                  update={updates[plugin.name]}
                  index={i}
                  isLast={i === filtered.length - 1}
                  onClick={() => navigate(`/harness/plugins/${encodeURIComponent(plugin.name)}`)}
                  onContextMenu={(e) => {
                    setContextMenu({ x: e.clientX, y: e.clientY, plugin });
                  }}
                />
              ))}
            </AnimatePresence>

            {filtered.length === 0 && (
              <div style={{
                padding: "20px", textAlign: "center",
                fontSize: "12px", color: "var(--fg-subtle)",
              }}>
                No plugins match your filter.
              </div>
            )}
          </div>
        </>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems(contextMenu.plugin)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Drag overlay */}
      <ImportOverlay visible={dragCount > 0} />

      {/* Uninstall dialog */}
      <UninstallDialog
        open={!!uninstallTarget}
        pluginName={uninstallTarget?.name ?? ""}
        onConfirm={handleUninstall}
        onClose={() => setUninstallTarget(null)}
      />

    </div>
  );
}
