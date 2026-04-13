import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ClaudeMcpNetwork, ClaudeMcpServer, ClaudeMcpStdio } from "../../lib/mcp-types";
import { isNetworkServer } from "../../lib/mcp-types";
import KeyValueEditor, { type KeyValuePair } from "./KeyValueEditor";

interface McpServerFormProps {
  open: boolean;
  mode: "add" | "edit";
  initialName?: string;
  initialServer?: ClaudeMcpServer;
  onSave: (name: string, server: ClaudeMcpServer) => void;
  onCancel: () => void;
}

const fieldLabel = (text: string) => (
  <div
    style={{
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "var(--fg-subtle)",
      marginBottom: "4px",
      marginTop: "12px",
    }}
  >
    {text}
  </div>
);

const tabBtn = (active: boolean): React.CSSProperties => ({
  fontSize: "10px",
  fontWeight: active ? 600 : 400,
  padding: "3px 8px",
  borderRadius: "4px",
  border: "none",
  background: active ? "var(--bg-elevated)" : "transparent",
  color: active ? "var(--fg-base)" : "var(--fg-subtle)",
  cursor: "pointer",
  boxShadow: active ? "var(--shadow-sm)" : "none",
  transition: "all 0.1s",
});

export default function McpServerForm({
  open,
  mode,
  initialName,
  initialServer,
  onSave,
  onCancel,
}: McpServerFormProps) {
  const [name, setName] = useState(initialName ?? "");
  const [transport, setTransport] = useState<"stdio" | "network">(
    initialServer ? (isNetworkServer(initialServer) ? "network" : "stdio") : "stdio",
  );
  const [command, setCommand] = useState(
    initialServer && !isNetworkServer(initialServer) ? initialServer.command : "",
  );
  const [argsText, setArgsText] = useState(
    initialServer && !isNetworkServer(initialServer) ? (initialServer.args ?? []).join("\n") : "",
  );
  const [envPairs, setEnvPairs] = useState<KeyValuePair[]>(
    initialServer && !isNetworkServer(initialServer) && initialServer.env
      ? Object.entries(initialServer.env).map(([k, v]) => ({ key: k, value: v }))
      : [],
  );
  const [url, setUrl] = useState(
    initialServer && isNetworkServer(initialServer) ? initialServer.url : "",
  );
  const [headerPairs, setHeaderPairs] = useState<KeyValuePair[]>(
    initialServer && isNetworkServer(initialServer) && initialServer.headers
      ? Object.entries(initialServer.headers).map(([k, v]) => ({ key: k, value: v }))
      : [],
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    const isNet = initialServer ? isNetworkServer(initialServer) : false;
    setTransport(isNet ? "network" : "stdio");
    if (initialServer && !isNet && !isNetworkServer(initialServer)) {
      setCommand((initialServer as ClaudeMcpStdio).command ?? "");
      setArgsText(((initialServer as ClaudeMcpStdio).args ?? []).join("\n"));
      setEnvPairs(
        Object.entries((initialServer as ClaudeMcpStdio).env ?? {}).map(([key, value]) => ({
          key,
          value,
        })),
      );
    } else {
      setCommand("");
      setArgsText("");
      setEnvPairs([]);
    }
    if (initialServer && isNet) {
      setUrl((initialServer as ClaudeMcpNetwork).url ?? "");
      setHeaderPairs(
        Object.entries((initialServer as ClaudeMcpNetwork).headers ?? {}).map(([key, value]) => ({
          key,
          value,
        })),
      );
    } else {
      setUrl("");
      setHeaderPairs([]);
    }
  }, [open, initialName, initialServer]);

  const nameHasSpaces = name.includes(" ");
  const isValid =
    name.trim().length > 0 &&
    !nameHasSpaces &&
    (transport === "stdio" ? command.trim().length > 0 : url.trim().length > 0);

  function handleTransportChange(next: "stdio" | "network") {
    setTransport(next);
    if (next === "network") {
      setCommand("");
      setArgsText("");
      setEnvPairs([]);
    } else {
      setUrl("");
      setHeaderPairs([]);
    }
  }

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    let server: ClaudeMcpServer;
    if (transport === "stdio") {
      if (!command.trim()) return;
      const args = argsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const env: Record<string, string> = {};
      for (const { key, value } of envPairs) {
        if (key.trim()) env[key.trim()] = value;
      }
      const s: ClaudeMcpStdio = { command: command.trim() };
      if (args.length) s.args = args;
      if (Object.keys(env).length) s.env = env;
      server = s;
    } else {
      if (!url.trim()) return;
      const headers: Record<string, string> = {};
      for (const { key, value } of headerPairs) {
        if (key.trim()) headers[key.trim()] = value;
      }
      const s: ClaudeMcpNetwork = { url: url.trim() };
      if (Object.keys(headers).length) s.headers = headers;
      server = s;
    }

    onSave(trimmedName, server);
  }

  if (!open) return null;

  return createPortal(
    <div className="confirm-overlay" onPointerDown={onCancel}>
      <div
        className="confirm-card"
        style={{ width: "480px", maxHeight: "80vh", overflowY: "auto" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="confirm-title">{mode === "add" ? "Add MCP Server" : "Edit MCP Server"}</div>

        {/* Server name */}
        {fieldLabel("Server name")}
        <input
          className="form-input"
          style={{ fontFamily: "ui-monospace, monospace" }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-server"
          disabled={mode === "edit"}
          spellCheck={false}
          autoFocus={mode === "add"}
        />
        {nameHasSpaces && (
          <div style={{ fontSize: "11px", color: "var(--danger)", marginTop: "4px" }}>
            Server name cannot contain spaces.
          </div>
        )}

        {/* Transport toggle */}
        {fieldLabel("Transport")}
        <div
          style={{
            display: "inline-flex",
            gap: "2px",
            background: "var(--bg-base)",
            border: "1px solid var(--border-base)",
            borderRadius: "6px",
            padding: "2px",
          }}
        >
          <button
            type="button"
            onClick={() => handleTransportChange("stdio")}
            style={tabBtn(transport === "stdio")}
          >
            Command (stdio)
          </button>
          <button
            type="button"
            onClick={() => handleTransportChange("network")}
            style={tabBtn(transport === "network")}
          >
            URL (network)
          </button>
        </div>

        {/* Stdio fields */}
        {transport === "stdio" && (
          <>
            {fieldLabel("Command")}
            <input
              className="form-input"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npx"
              spellCheck={false}
            />

            {fieldLabel("Arguments")}
            <textarea
              className="form-input"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem"}
              spellCheck={false}
              style={{ height: "80px", resize: "vertical", fontFamily: "ui-monospace, monospace" }}
            />
            <div style={{ fontSize: "11px", color: "var(--fg-subtle)", marginTop: "3px" }}>
              One argument per line
            </div>

            {fieldLabel("Environment variables")}
            <KeyValueEditor pairs={envPairs} onChange={setEnvPairs} keyPlaceholder="ENV_VAR" />
          </>
        )}

        {/* Network fields */}
        {transport === "network" && (
          <>
            {fieldLabel("URL")}
            <input
              className="form-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              spellCheck={false}
            />

            {fieldLabel("Headers")}
            <KeyValueEditor
              pairs={headerPairs}
              onChange={setHeaderPairs}
              keyPlaceholder="Header-Name"
            />
          </>
        )}

        {/* Actions */}
        <div className="confirm-actions" style={{ marginTop: "20px" }}>
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!isValid}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
