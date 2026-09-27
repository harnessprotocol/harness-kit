import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Blocks } from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Button, Card, EmptyState, ErrorNotice } from "@harness-kit/ui";
import {
  listInstalledPlugins, checkPluginUpdates, uninstallPlugin,
  exportPluginAsZip, exportPluginToFolder,
  isTauriRuntimeAvailable,
} from "../../lib/tauri";
import type { InstalledPlugin, PluginUpdateInfo } from "@harness-kit/shared";
import ContextMenu, { type ContextMenuItem } from "../../components/ContextMenu";
import PluginFilters from "./plugins/PluginFilters";
import PluginRow from "./plugins/PluginRow";
import ImportOverlay from "./plugins/ImportOverlay";
import ImportBanner from "./plugins/ImportBanner";
import { dismissImportStatus, enqueueImports, onPluginsImported, useImportQueue } from "./plugins/import-queue";
import UninstallDialog from "./plugins/UninstallDialog";
import { useRegisterCommands } from "../../lib/commands";
import { errorDetails } from "../../lib/error-details";

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
  // A failed load replaces the list; a failed uninstall sits above it.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uninstallError, setUninstallError] = useState<{ pluginName: string; details: string } | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const [tauriAvailable] = useState(isTauriRuntimeAvailable);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; plugin: InstalledPlugin } | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  // Import state
  const [dropActive, setDropActive] = useState(false);
  // One queue for the app session (see import-queue): leaving the page
  // mid-batch and dropping the same folder on return joins the running batch.
  const { importing, status: importStatus } = useImportQueue();

  // Uninstall state
  const [uninstallTarget, setUninstallTarget] = useState<InstalledPlugin | null>(null);

  const loadPlugins = useCallback(() => {
    if (!tauriAvailable) {
      setPlugins(PREVIEW_PLUGINS);
      setUpdates({});
      setLoadError(null);
      setRuntimeNotice(DESKTOP_RUNTIME_MESSAGE);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setRuntimeNotice(null);
    listInstalledPlugins()
      .then(setPlugins)
      .catch((e) => setLoadError(errorDetails(e)))
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
  // A batch that finishes while the page is mounted refreshes the list; one
  // that finishes while it is away is picked up by the load on return.
  useEffect(() => onPluginsImported(loadPlugins), [loadPlugins]);

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

  // ── Import ───────────────────────────────────────────────
  // One import path, enqueueImports, shared by the folder picker and a native drop.

  // ── Drag-and-drop ────────────────────────────────────────
  // Tauri's native layer owns file drops (dragDropEnabled defaults to true), so
  // HTML5 drop events never carry paths. Listen to the webview's drag-drop
  // event instead, only while this page is mounted.

  useEffect(() => {
    if (!tauriAvailable) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    // Safety nets for an overlay left up by a lost "leave" event. A drag from
    // Finder starts while this window is unfocused, so blur rarely fires
    // mid-drag; it only helps when focus moves away after the fact. Escape is
    // the user's own way out.
    const hide = () => setDropActive(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("blur", hide);
    window.addEventListener("keydown", onKeyDown);

    const cleanup = () => {
      disposed = true;
      window.removeEventListener("blur", hide);
      window.removeEventListener("keydown", onKeyDown);
      unlisten?.();
    };

    // getCurrentWebview() reads the window metadata Tauri injects and throws
    // synchronously when it is missing (a partial runtime, the e2e bridge).
    // Treat that like a rejected listen: no drop import, the picker still works.
    let listening: Promise<() => void>;
    try {
      listening = getCurrentWebview().onDragDropEvent((event) => {
        if (disposed) return;
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setDropActive(true);
        } else if (payload.type === "leave") {
          setDropActive(false);
        } else if (payload.type === "drop") {
          setDropActive(false);
          if (payload.paths.length > 0) void enqueueImports(payload.paths);
        }
      });
    } catch (err) {
      console.warn("Plugins: could not listen for drag-and-drop", err);
      return cleanup;
    }
    listening
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((err) => {
        // No listener means no overlay and no drop import; the picker still works.
        console.warn("Plugins: could not listen for drag-and-drop", err);
      });

    return cleanup;
  }, [tauriAvailable]);

  // ── Import from folder picker ────────────────────────────

  async function handleImportFolder() {
    if (!tauriAvailable) {
      showDesktopOnlyNotice();
      return;
    }

    let selected: string | null;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      selected = await open({ directory: true, title: "Select plugin folder" });
    } catch {
      return; // Dialog plugin not available or cancelled
    }
    if (!selected) return;
    await enqueueImports([selected]);
  }

  // ⌘K (spec AC-21): Import Plugin, disabled when the button is.
  useRegisterCommands(
    [
      {
        id: "plugins.import",
        title: "Import plugin from folder…",
        group: "Plugins",
        keywords: ["import plugin", "folder", "add"],
        disabled: !tauriAvailable || importing,
        run: handleImportFolder,
      },
    ],
    [tauriAvailable, importing],
  );

  // ── Uninstall ────────────────────────────────────────────

  async function handleUninstall() {
    if (!uninstallTarget) return;
    if (!tauriAvailable) {
      setUninstallTarget(null);
      showDesktopOnlyNotice();
      return;
    }

    const pluginName = uninstallTarget.name;
    setUninstallTarget(null);
    await runUninstall(pluginName);
  }

  // Also the failure notice's Retry: the user already confirmed this uninstall.
  async function runUninstall(pluginName: string) {
    setUninstallError(null);
    try {
      await uninstallPlugin(pluginName);
      loadPlugins();
    } catch (err) {
      setUninstallError({ pluginName, details: errorDetails(err) });
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
    >
      {/* Page header */}
      <div className="hk-page-head">
        <div>
          <h1 className="hk-page-title">Plugins · Claude Code</h1>
          <p className="hk-page-subtitle">
            Plugins in your <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>~/.claude/</code> environment.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button
            variant="ghost"
            onClick={handleImportFolder}
            disabled={!tauriAvailable || importing}
            title={
              !tauriAvailable ? DESKTOP_RUNTIME_MESSAGE
                : importing ? "An import is running"
                  : "Import a plugin folder"
            }
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
      <ImportBanner status={importStatus} onDismiss={dismissImportStatus} />

      {runtimeNotice && (
        <Card padding="sm" style={{ background: "var(--accent-light)", fontSize: "12px", color: "var(--fg-muted)", marginBottom: "12px" }}>
          {runtimeNotice}
        </Card>
      )}

      {loading && (
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
      )}

      {loadError && (
        <ErrorNotice
          title="Couldn't load installed plugins"
          details={loadError}
          action={{ label: "Retry", onClick: loadPlugins }}
        />
      )}

      {uninstallError && (
        <ErrorNotice
          title={`Couldn't uninstall ${uninstallError.pluginName}`}
          details={uninstallError.details}
          action={{ label: "Retry uninstall", onClick: () => void runUninstall(uninstallError.pluginName) }}
        />
      )}

      {!loading && !loadError && plugins.length === 0 && (
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

      {!loading && !loadError && plugins.length > 0 && (
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
      <ImportOverlay visible={dropActive} />

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
