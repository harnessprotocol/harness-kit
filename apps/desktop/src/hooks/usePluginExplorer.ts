import { useState, useCallback, useEffect, useRef } from "react";
import type { InstalledPlugin, FileTreeNode } from "@harness-kit/shared";
import {
  readPluginTree, readPluginFile, writePluginFile,
  exportPluginAsZip, exportPluginToFolder,
  readFileHistory, pushFileHistory, type HistoryEntry,
} from "../lib/tauri";
import { isCriticalFile } from "../lib/criticalFiles";
import { getConfirmSave } from "../lib/preferences";
import { errorDetails } from "../lib/error-details";

export interface PluginExplorerState {
  tree: FileTreeNode | null;
  loading: boolean;
  /** The file tree couldn't be read, raw, for an ErrorNotice's Details (AC-20). */
  treeError: string | null;
  /** What failed, in plain words; set whenever `treeError` is. */
  treeErrorTitle: string | null;
  /** Reads the file tree again. */
  reloadTree: () => void;
  /** The selected file couldn't be read, raw (AC-20). */
  error: string | null;
  /** What failed, in plain words; set whenever `error` is. */
  errorTitle: string | null;
  /** Reads the selected file again. */
  reloadFile: () => void;
  /** The last save failed, raw. The edits stay in the editor. */
  saveError: string | null;
  /** What failed, in plain words; set whenever `saveError` is. */
  saveErrorTitle: string | null;
  selectedPath: string | null;
  fileContent: string | null;
  fileLoading: boolean;
  dirty: boolean;
  saving: boolean;
  savedRecently: boolean;
  selectFile: (path: string) => void;
  updateContent: (content: string) => void;
  saveFile: () => Promise<void>;
  revertFile: () => void;
  exportAsZip: () => Promise<void>;
  exportToFolder: () => Promise<void>;
  confirmState: "idle" | "pending" | "critical";
  requestSave: () => void;
  confirmSave: () => void;
  cancelSave: () => void;
  historyEntries: HistoryEntry[];
  historyLoading: boolean;
  restoreVersion: (content: string) => void;
}

/** The file's name for a notice title: the last path segment. */
function fileLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function usePluginExplorer(plugin: InstalledPlugin | null, open: boolean): PluginExplorerState {
  const pluginName = plugin?.name ?? "";
  const [tree, setTree] = useState<FileTreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeErrorTitle, setTreeErrorTitle] = useState<string | null>(null);
  const [treeKey, setTreeKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorTitle, setSaveErrorTitle] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmState, setConfirmState] = useState<"idle" | "pending" | "critical">("idle");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const dirty = fileContent !== null && originalContent !== null && fileContent !== originalContent;
  const currentPathRef = useRef<string | null>(null);
  const fileContentRef = useRef<string | null>(null);
  const originalContentRef = useRef<string | null>(null);

  // Keep refs in sync with state for use in callbacks
  useEffect(() => { fileContentRef.current = fileContent; }, [fileContent]);
  useEffect(() => { originalContentRef.current = originalContent; }, [originalContent]);

  // Load tree when opened
  useEffect(() => {
    if (!open || !plugin?.source) {
      setTree(null);
      setSelectedPath(null);
      setFileContent(null);
      setOriginalContent(null);
      setTreeError(null);
      setError(null);
      setSaveError(null);
      return;
    }
    setLoading(true);
    setTreeError(null);
    readPluginTree(plugin.source)
      .then(setTree)
      .catch((e) => {
        setTree(null);
        setTreeErrorTitle(`Couldn't read the files in ${pluginName || "this plugin"}`);
        setTreeError(errorDetails(e));
      })
      .finally(() => setLoading(false));
  }, [open, plugin?.source, treeKey]);

  const reloadTree = useCallback(() => setTreeKey((k) => k + 1), []);

  // Save current file before switching — uses refs to avoid stale closure
  const saveCurrent = useCallback(async () => {
    const content = fileContentRef.current;
    const original = originalContentRef.current;
    if (currentPathRef.current && content !== null && original !== null && content !== original) {
      try {
        setSaving(true);
        await writePluginFile(currentPathRef.current, content);
        setOriginalContent(content);
      } catch {
        // Silent fail on auto-save; user can retry manually
      } finally {
        setSaving(false);
      }
    }
  }, []);

  const selectFile = useCallback(async (path: string) => {
    // Auto-save dirty file before switching
    await saveCurrent();

    setSelectedPath(path);
    currentPathRef.current = path;
    setFileLoading(true);
    setError(null);
    setSaveError(null);
    try {
      const content = await readPluginFile(path);
      setFileContent(content);
      setOriginalContent(content);
    } catch (e) {
      setFileContent(null);
      setOriginalContent(null);
      setErrorTitle(`Couldn't read ${fileLabel(path)}`);
      setError(errorDetails(e));
    } finally {
      setFileLoading(false);
    }
  }, [saveCurrent]);

  // Only reachable from a failed read, so there are no edits to lose.
  const reloadFile = useCallback(() => {
    if (currentPathRef.current) void selectFile(currentPathRef.current);
  }, [selectFile]);

  // Load history when file changes
  useEffect(() => {
    if (!selectedPath || !pluginName) {
      setHistoryEntries([]);
      return;
    }
    setHistoryLoading(true);
    readFileHistory(pluginName, selectedPath)
      .then(setHistoryEntries)
      .catch(() => setHistoryEntries([]))
      .finally(() => setHistoryLoading(false));
  }, [selectedPath, pluginName]);

  const updateContent = useCallback((content: string) => {
    setFileContent(content);
  }, []);

  const saveFile = useCallback(async () => {
    if (!selectedPath || fileContent === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Push previous content to history before overwriting
      if (originalContent !== null && pluginName) {
        await pushFileHistory(pluginName, selectedPath, originalContent).catch(() => {});
      }
      await writePluginFile(selectedPath, fileContent);
      setOriginalContent(fileContent);
      setSavedRecently(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedRecently(false), 2000);
      // Refresh history
      if (pluginName) {
        readFileHistory(pluginName, selectedPath)
          .then(setHistoryEntries)
          .catch(() => {});
      }
    } catch (e) {
      setSaveErrorTitle(`Couldn't save ${fileLabel(selectedPath)}`);
      setSaveError(errorDetails(e));
    } finally {
      setSaving(false);
    }
  }, [selectedPath, fileContent, originalContent, pluginName]);

  const requestSave = useCallback(() => {
    if (!selectedPath || fileContent === null || !dirty) return;
    const critical = isCriticalFile(selectedPath);
    if (critical) {
      setConfirmState("critical");
    } else if (getConfirmSave()) {
      setConfirmState("pending");
    } else {
      saveFile();
    }
  }, [selectedPath, fileContent, dirty, saveFile]);

  const confirmSave = useCallback(() => {
    setConfirmState("idle");
    saveFile();
  }, [saveFile]);

  const cancelSave = useCallback(() => {
    setConfirmState("idle");
  }, []);

  const restoreVersion = useCallback((content: string) => {
    setFileContent(content);
  }, []);

  const revertFile = useCallback(() => {
    if (originalContent !== null) {
      setFileContent(originalContent);
    }
  }, [originalContent]);

  const exportAsZip = useCallback(async () => {
    if (!plugin?.source) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const savePath = await save({
        defaultPath: `${plugin.name}.zip`,
        title: "Export plugin as zip",
      });
      if (savePath) await exportPluginAsZip(plugin.source, savePath);
    } catch { /* cancelled */ }
  }, [plugin?.source, plugin?.name]);

  const exportToFolder = useCallback(async () => {
    if (!plugin?.source) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dest = await open({ directory: true, title: "Export plugin to folder" });
      if (dest) await exportPluginToFolder(plugin.source, dest as string);
    } catch { /* cancelled */ }
  }, [plugin?.source]);

  // Clean up savedRecently timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return {
    tree, loading, treeError, treeErrorTitle, reloadTree,
    error, errorTitle, reloadFile, saveError, saveErrorTitle,
    selectedPath, fileContent, fileLoading,
    dirty, saving, savedRecently,
    confirmState, requestSave, confirmSave, cancelSave,
    historyEntries, historyLoading, restoreVersion,
    selectFile, updateContent, saveFile, revertFile,
    exportAsZip, exportToFolder,
  };
}
