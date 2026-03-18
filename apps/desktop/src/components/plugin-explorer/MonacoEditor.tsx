import { useRef, useEffect, useCallback } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

const EXT_TO_LANGUAGE: Record<string, string> = {
  md: "markdown",
  py: "python",
  sh: "shell",
  bash: "shell",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  html: "html",
  htm: "html",
  css: "css",
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  jsx: "javascriptreact",
  rs: "rust",
  go: "go",
  toml: "ini",
  xml: "xml",
  sql: "sql",
  dockerfile: "dockerfile",
};

function detectLanguage(filePath: string): string {
  const name = filePath.split("/").pop() || "";
  const lower = name.toLowerCase();

  // Special filenames
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";

  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "plaintext";
  const ext = name.slice(dot + 1).toLowerCase();
  return EXT_TO_LANGUAGE[ext] || "plaintext";
}

function getMonacoTheme(): string {
  return document.documentElement.classList.contains("dark") ? "vs-dark" : "vs";
}

interface MonacoEditorProps {
  filePath: string;
  content: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

export default function MonacoEditor({ filePath, content, onChange, onSave }: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const themeRef = useRef(getMonacoTheme());

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Register Cmd+S save action
    editor.addAction({
      id: "harness-kit-save",
      label: "Save File",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => onSave(),
    });

    // Set initial theme
    monaco.editor.setTheme(getMonacoTheme());
  }, [onSave]);

  // Watch for dark/light mode changes via MutationObserver
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const newTheme = getMonacoTheme();
      if (newTheme !== themeRef.current) {
        themeRef.current = newTheme;
        import("monaco-editor").then((monaco) => {
          monaco.editor.setTheme(newTheme);
        }).catch(() => {});
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const language = detectLanguage(filePath);

  return (
    <Editor
      height="100%"
      language={language}
      value={content}
      theme={getMonacoTheme()}
      onChange={(value) => onChange(value ?? "")}
      onMount={handleMount}
      loading={
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "100%", color: "var(--fg-subtle)", fontSize: "12px",
        }}>
          Loading editor...
        </div>
      }
      options={{
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
        minimap: { enabled: false },
        lineNumbers: "on",
        wordWrap: "on",
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: "line",
        padding: { top: 8 },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
        },
      }}
    />
  );
}
