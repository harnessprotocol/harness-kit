import { useState, useCallback, useEffect, useRef } from "react";
import { readClaudeMd, writeConfigFile } from "../lib/tauri";
import { errorDetails } from "../lib/error-details";

export interface FileEditorState {
  content: string | null;
  originalContent: string | null;
  loading: boolean;
  saving: boolean;
  savedRecently: boolean;
  /** A failed load, raw, for an ErrorNotice's Details (AC-20). There is no
   *  content to show, so the notice replaces the editor and offers Reload. */
  error: string | null;
  /** What failed, in plain words; set whenever `error` is. */
  errorTitle?: string | null;
  /** A failed save, raw. The editor stays up with the unsaved content and the
   *  notice offers "Retry save"; Reload would throw the edits away. */
  saveError?: string | null;
  /** What failed, in plain words; set whenever `saveError` is. */
  saveErrorTitle?: string | null;
  isDirty: boolean;
  updateContent: (content: string) => void;
  saveFile: () => Promise<void>;
  revertFile: () => void;
  reload: () => void;
}

/** The file's name for a notice title: the last path segment. */
function fileLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function useFileEditor(filePath: string | null): FileEditorState {
  const [content, setContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorTitle, setSaveErrorTitle] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The file on screen now, read when a save settles.
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

  const isDirty = content !== null && originalContent !== null && content !== originalContent;

  useEffect(() => {
    setSaveError(null);
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
      .catch((e) => {
        setErrorTitle(`Couldn't read ${fileLabel(filePath)}`);
        setError(errorDetails(e));
      })
      .finally(() => setLoading(false));
  }, [filePath, reloadKey]);

  const updateContent = useCallback((c: string) => {
    setContent(c);
  }, []);

  const saveFile = useCallback(async () => {
    if (!filePath || content === null) return;
    setSaving(true);
    setSaveError(null);
    // A save that settles after the editor moved to another file belongs to
    // the old file: its outcome must not land on the new one.
    const stillCurrent = () => filePathRef.current === filePath;
    try {
      await writeConfigFile(filePath, content);
      if (!stillCurrent()) return;
      setOriginalContent(content);
      setSavedRecently(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedRecently(false), 2000);
    } catch (e) {
      if (!stillCurrent()) return;
      setSaveErrorTitle(`Couldn't save ${fileLabel(filePath)}`);
      setSaveError(errorDetails(e));
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
    errorTitle,
    saveError,
    saveErrorTitle,
    isDirty,
    updateContent,
    saveFile,
    revertFile,
    reload,
  };
}
