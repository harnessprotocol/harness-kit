import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Blocks } from "lucide-react";
import { Button, Card, EmptyState } from "@harness-kit/ui";
import {
  listInstalledPlugins, checkPluginUpdates, uninstallPlugin,
  importPluginFromPath, importPluginFromZip,
  exportPluginAsZip, exportPluginToFolder,
  isTauriRuntimeAvailable,
} from "../../lib/tauri";
import type { InstalledPlugin, PluginUpdateInfo } from "@harness-kit/shared";
import ContextMenu, { type ContextMenuItem } from "../../components/ContextMenu";
import PluginFilters from "./plugins/PluginFilters";
import PluginRow from "./plugins/PluginRow";
import ImportOverlay from "./plugins/ImportOverlay";
import ImportBanner, { type ImportStatus } from "./plugins/ImportBanner";
import UninstallDialog from "./plugins/UninstallDialog";

const PREVIEW_PLUGINS: InstalledPlugin[] = [
  {
    name: "research",
    version: "0.3.0",
    description: "Index source material and synthesize reusable project research.",
    marketplace: "harness-kit",
    source: "browser-preview://plugins/research",
    category: "Knowledge",
    tags: ["research", "memory"],
    component_counts: { skills: 1, agents: 0, scripts: 2 },
  },
  {
    name: "harness-share",
    version: "0.3.0",
    description: "Compile and sync harness.yaml across AI tool configurations.",
    marketplace: "harness-kit",
    source: "browser-preview://plugins/harness-share",
    category: "Configure",
    tags: ["sync", "configuration"],
    component_counts: { skills: 4, agents: 0, scripts: 3 },
  },
];

const DESKTOP_RUNTIME_MESSAGE = "Browser preview mode: plugin filesystem actions require the Harness Kit desktop runtime.";

export default function PluginsPage() {
  const navigate = useNavigate();
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [updates, setUpdates] = useState<Record<string, PluginUpdateInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const [tauriAvailable] = useState(isTauriRuntimeAvailable);
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
    if (!tauriAvailable) {
      setPlugins(PREVIEW_PLUGINS);
      setUpdates({});
      setError(null);
      setRuntimeNotice(DESKTOP_RUNTIME_MESSAGE);
      setLoading(false);
      return;
    }

    setLoading(true);
    setRuntimeNotice(null);
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
  }, [tauriAvailable]);

  useEffect(loadPlugins, [loadPlugins]);

  function showDesktopOnlyNotice() {
    setRuntimeNotice(DESKTOP_RUNTIME_MESSAGE);
  }

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

    if (!tauriAvailable) {
      showDesktopOnlyNotice();
      return;
    }

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
    } catch (err) {
      setImportStatus({ state: "error", message: String(err) });
    }
  }

  // ── Import from folder picker ────────────────────────────

  async function handleImportFolder() {
    if (!tauriAvailable) {
      showDesktopOnlyNotice();
      return;
    }

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
    if (!tauriAvailable) {
      setUninstallTarget(null);
      showDesktopOnlyNotice();
      return;
    }

    const pluginName = uninstallTarget.name;
    try {
      await uninstallPlugin(pluginName);
      setUninstallTarget(null);
      loadPlugins();
    } catch (err) {
      setError(String(err));
      setUninstallTarget(null);
    }
  }

  // ── Context menu builder ─────────────────────────────────

  function buildContextMenuItems(plugin: InstalledPlugin): ContextMenuItem[] {
    if (!tauriAvailable) {
      return [
        { label: "Copy name", onClick: () => navigator.clipboard.writeText(plugin.name) },
        { separator: true },
        { label: "Desktop runtime required", onClick: showDesktopOnlyNotice },
      ];
    }

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
      className="hk-page"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Page header */}
      <div className="hk-page-head">
        <div>
          <h1 className="hk-page-title">Installed Plugins</h1>
          <p className="hk-page-subtitle">
            Plugins in your <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>~/.claude/</code> environment.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button
            variant="ghost"
            onClick={handleImportFolder}
            disabled={!tauriAvailable}
            title={tauriAvailable ? "Import a plugin folder" : DESKTOP_RUNTIME_MESSAGE}
          >
            Import Plugin
          </Button>
          {hasUpdates && (
            <Button variant="ghost" disabled title="Run /plugin update in Claude Code to apply updates">
              Update All ({Object.keys(updates).length})
            </Button>
          )}
        </div>
      </div>

      {/* Import banner */}
      <ImportBanner status={importStatus} onDismiss={() => setImportStatus(null)} />

      {runtimeNotice && (
        <Card padding="sm" style={{ background: "var(--accent-light)", fontSize: "12px", color: "var(--fg-muted)", marginBottom: "12px" }}>
          {runtimeNotice}
        </Card>
      )}

      {loading && (
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
      )}

      {error && (
        <Card padding="sm" style={{ fontSize: "13px", color: "var(--danger)", marginBottom: "12px" }}>
          {error}
        </Card>
      )}

      {!loading && !error && plugins.length === 0 && (
        <EmptyState
          icon={<Blocks size={28} strokeWidth={1.5} />}
          title="No plugins installed"
          description="Install via /plugin install in Claude Code, or drag a plugin folder here."
          action={
            <Button variant="primary" onClick={() => navigate("/marketplace")}>
              Browse Marketplace
            </Button>
          }
        />
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

          <Card padding="none" style={{ overflow: "hidden", flex: 1 }}>
            <AnimatePresence mode="popLayout">
              {filtered.map((plugin, i) => (
                <PluginRow
                  key={plugin.name}
                  plugin={plugin}
                  update={updates[plugin.name]}
                  index={i}
                  isLast={i === filtered.length - 1}
                  onClick={() => {
                    if (!tauriAvailable) {
                      showDesktopOnlyNotice();
                      return;
                    }
                    navigate(`/harness/plugins/${encodeURIComponent(plugin.name)}`);
                  }}
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
          </Card>
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
