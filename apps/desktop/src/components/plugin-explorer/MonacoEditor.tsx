import { useRef, useEffect, useCallback } from "react";
import Editor, { loader, type OnMount, type Monaco } from "@monaco-editor/react";
import * as monacoEditor from "monaco-editor";

// @monaco-editor/react defaults to fetching its AMD loader from the jsdelivr CDN
// at runtime. Tauri's CSP (script-src 'self') blocks that cross-origin <script>
// tag, so the editor would hang forever on "Loading editor...". Pointing the
// loader at the already-bundled monaco-editor package avoids the CDN entirely.
loader.config({ monaco: monacoEditor });

// Monaco loads language workers via `new Worker(new URL(..., import.meta.url), { type: 'module' })`.
// Tauri's WKWebView rejects these module worker imports with "Importing a module script failed."
// Setting MonacoEnvironment before the editor mounts redirects worker creation to a no-op blob
// worker, which satisfies Monaco's protocol without triggering the WebView restriction.
// Basic tokenization (YAML, JSON, Markdown) still works via Monaco's synchronous tokenizers.
if (!window.MonacoEnvironment) {
  window.MonacoEnvironment = {
    getWorker(_moduleId: string, _label: string): Worker {
      const blob = new Blob(["self.onmessage=function(){};"], { type: "application/javascript" });
      return new Worker(URL.createObjectURL(blob));
    },
  };
}
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
  /**
   * When omitted at mount, no Cmd+S action is registered, so the keystroke bubbles
   * to the page's own window listener (Monaco swallows any chord that resolves to
   * a registered action, even one that no-ops). When provided, the latest handler
   * is called: @monaco-editor/react captures onMount once, so the action reads
   * through a ref rather than the closure from the first render.
   */
  onSave?: () => void;
  readOnly?: boolean;
}

export default function MonacoEditor({ filePath, content, onChange, onSave, readOnly = false }: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const themeRef = useRef(getMonacoTheme());

  // @monaco-editor/react stores onMount in a ref at first render and never refreshes
  // it, so the Cmd+S action would otherwise call the onSave from the first render
  // for the life of the mount. Route the action through a ref that tracks the latest.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Only register when a handler exists at mount. Monaco's keybinding service
    // calls preventDefault + stopPropagation for any chord that resolves to an
    // action, so a no-op action would swallow Cmd+S before it reaches the page's
    // window listener (HarnessFilePage relies on that listener).
    if (onSaveRef.current) {
      editor.addAction({
        id: "harness-kit-save",
        label: "Save File",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => onSaveRef.current?.(),
      });
    }

    // Set initial theme
    monaco.editor.setTheme(getMonacoTheme());
  }, []);

  // Watch for dark/light mode changes via MutationObserver
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const newTheme = getMonacoTheme();
      if (newTheme !== themeRef.current) {
        themeRef.current = newTheme;
        if (monacoRef.current) {
          monacoRef.current.editor.setTheme(newTheme);
        }
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
        readOnly,
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
