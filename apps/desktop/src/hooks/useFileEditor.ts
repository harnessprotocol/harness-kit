import { useCallback, useEffect, useRef, useState } from "react";
import { readClaudeMd, writeConfigFile } from "../lib/tauri";

export interface FileEditorState {
  content: string | null;
  originalContent: string | null;
  loading: boolean;
  saving: boolean;
  savedRecently: boolean;
  error: string | null;
  isDirty: boolean;
  updateContent: (content: string) => void;
  saveFile: () => Promise<void>;
  revertFile: () => void;
  reload: () => void;
}

export function useFileEditor(filePath: string | null): FileEditorState {
  const [content, setContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = content !== null && originalContent !== null && content !== originalContent;

  useEffect(() => {
    if (!filePath) {
      setContent(null);
      setOriginalContent(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    readClaudeMd(filePath)
      .then((c) => {
        setContent(c);
        setOriginalContent(c);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [filePath, reloadKey]);

  const updateContent = useCallback((c: string) => {
    setContent(c);
  }, []);

  const saveFile = useCallback(async () => {
    if (!filePath || content === null) return;
    setSaving(true);
    try {
      await writeConfigFile(filePath, content);
      setOriginalContent(content);
      setSavedRecently(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedRecently(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [filePath, content]);

  const revertFile = useCallback(() => {
    if (originalContent !== null) setContent(originalContent);
  }, [originalContent]);

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return {
    content,
    originalContent,
    loading,
    saving,
    savedRecently,
    error,
    isDirty,
    updateContent,
    saveFile,
    revertFile,
    reload,
  };
}
