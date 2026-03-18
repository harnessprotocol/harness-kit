import { useState, useCallback, useEffect, useRef } from "react";
import type { InstalledPlugin, FileTreeNode } from "@harness-kit/shared";
import {
  readPluginTree, readPluginFile, writePluginFile,
  exportPluginAsZip, exportPluginToFolder,
} from "../lib/tauri";

export interface PluginExplorerState {
  tree: FileTreeNode | null;
  loading: boolean;
  error: string | null;
  selectedPath: string | null;
  fileContent: string | null;
  fileLoading: boolean;
  dirty: boolean;
  saving: boolean;
  selectFile: (path: string) => void;
  updateContent: (content: string) => void;
  saveFile: () => Promise<void>;
  exportAsZip: () => Promise<void>;
  exportToFolder: () => Promise<void>;
}

export function usePluginExplorer(plugin: InstalledPlugin | null, open: boolean): PluginExplorerState {
  const [tree, setTree] = useState<FileTreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    readPluginTree(plugin.source)
      .then(setTree)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open, plugin?.source]);

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
    try {
      const content = await readPluginFile(path);
      setFileContent(content);
      setOriginalContent(content);
    } catch (e) {
      setFileContent(null);
      setOriginalContent(null);
      setError(String(e));
    } finally {
      setFileLoading(false);
    }
  }, [saveCurrent]);

  const updateContent = useCallback((content: string) => {
    setFileContent(content);
  }, []);

  const saveFile = useCallback(async () => {
    if (!selectedPath || fileContent === null) return;
    setSaving(true);
    try {
      await writePluginFile(selectedPath, fileContent);
      setOriginalContent(fileContent);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [selectedPath, fileContent]);

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

  return {
    tree, loading, error,
    selectedPath, fileContent, fileLoading,
    dirty, saving,
    selectFile, updateContent, saveFile,
    exportAsZip, exportToFolder,
  };
}
