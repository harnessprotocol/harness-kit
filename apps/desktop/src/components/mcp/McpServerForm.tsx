import { useEffect, useState, type ReactNode } from "react";
import { Button, Input, Modal, Select } from "@harness-kit/ui";
import type { ClaudeMcpServer, ClaudeMcpStdio, ClaudeMcpNetwork } from "../../lib/mcp-types";
import { inferTransport, isNetworkServer } from "../../lib/mcp-types";
import KeyValueEditor, { type KeyValuePair } from "./KeyValueEditor";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

type ServerType = "stdio" | "http" | "sse";

interface McpServerFormProps {
  open: boolean;
  mode: "add" | "edit";
  initialName?: string;
  initialServer?: ClaudeMcpServer;
  /** Names already in the file; an add may not reuse one. */
  existingNames?: readonly string[];
  saving?: boolean;
  /** A save failure, shown inside the dialog so the input is not lost. */
  error?: ReactNode;
  onSave: (name: string, server: ClaudeMcpServer) => void;
  onCancel: () => void;
}

function toPairs(record: Record<string, string> | undefined): KeyValuePair[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ id: crypto.randomUUID(), key, value }));
}

function fromPairs(pairs: KeyValuePair[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of pairs) if (key.trim()) out[key.trim()] = value;
  return out;
}

export default function McpServerForm({
  open,
  mode,
  initialName,
  initialServer,
  existingNames = [],
  saving = false,
  error,
  onSave,
  onCancel,
}: McpServerFormProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ServerType>("stdio");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [envPairs, setEnvPairs] = useState<KeyValuePair[]>([]);
  const [url, setUrl] = useState("");
  const [headerPairs, setHeaderPairs] = useState<KeyValuePair[]>([]);
  const [submitted, setSubmitted] = useState(false);

  // Reset every time the dialog opens, so an edit never shows a previous
  // server's values.
  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setName(initialName ?? "");
    setType(initialServer ? inferTransport(initialServer) : "stdio");
    const stdio = initialServer && !isNetworkServer(initialServer) ? initialServer : undefined;
    const network = initialServer && isNetworkServer(initialServer) ? initialServer : undefined;
    setCommand(stdio?.command ?? "");
    setArgsText((stdio?.args ?? []).join("\n"));
    setEnvPairs(toPairs(stdio?.env));
    setUrl(network?.url ?? "");
    setHeaderPairs(toPairs(network?.headers));
  }, [open, initialName, initialServer]);

  const trimmedName = name.trim();
  const nameError = !trimmedName
    ? "Enter a name for this server."
    : /\s/.test(trimmedName)
      ? "Server names can't contain spaces."
      : mode === "add" && existingNames.includes(trimmedName)
        ? `A server named ${trimmedName} already exists.`
        : null;
  const commandError = type === "stdio" && !command.trim() ? "Enter the command that starts the server." : null;
  const urlError =
    type === "stdio"
      ? null
      : !url.trim()
        ? "Enter the server's URL."
        : !/^https?:\/\//i.test(url.trim())
          ? "The URL must start with http:// or https://."
          : null;
  const valid = !nameError && !commandError && !urlError;

  function handleSave() {
    setSubmitted(true);
    if (!valid) return;
    let server: ClaudeMcpServer;
    if (type === "stdio") {
      const args = argsText.split("\n").map((s) => s.trim()).filter(Boolean);
      const env = fromPairs(envPairs);
      const stdio: ClaudeMcpStdio = { type: "stdio", command: command.trim() };
      if (args.length) stdio.args = args;
      if (Object.keys(env).length) stdio.env = env;
      server = stdio;
    } else {
      const headers = fromPairs(headerPairs);
      const network: ClaudeMcpNetwork = { type, url: url.trim() };
      if (Object.keys(headers).length) network.headers = headers;
      server = network;
    }
    onSave(trimmedName, server);
  }

  const show = (message: string | null) => (submitted ? message : null);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={mode === "add" ? "Add MCP server" : `Edit ${initialName ?? "MCP server"}`}
      footer={
        <>
          <Button type="button" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="button" size="sm" variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => { e.preventDefault(); handleSave(); }}
        style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 420 }}
        noValidate
      >
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-server"
          disabled={mode === "edit"}
          spellCheck={false}
          autoFocus={mode === "add"}
          style={{ fontFamily: MONO }}
          error={Boolean(show(nameError))}
          helperText={show(nameError) ?? undefined}
        />

        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as ServerType)}
          options={[
            { value: "stdio", label: "Command (stdio)" },
            { value: "http", label: "HTTP" },
            { value: "sse", label: "SSE" },
          ]}
        />

        {type === "stdio" ? (
          <>
            <Input
              label="Command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npx"
              spellCheck={false}
              style={{ fontFamily: MONO }}
              error={Boolean(show(commandError))}
              helperText={show(commandError) ?? undefined}
            />
            <div className="hk-field">
              <label className="hk-label" htmlFor="mcp-args">Arguments</label>
              <textarea
                id="mcp-args"
                className="hk-input"
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder={"-y\n@modelcontextprotocol/server-filesystem"}
                spellCheck={false}
                style={{ height: 80, resize: "vertical", fontFamily: MONO }}
              />
              <div className="hk-helper-text">One argument per line.</div>
            </div>
            <div className="hk-field">
              <span className="hk-label">Environment</span>
              <KeyValueEditor pairs={envPairs} onChange={setEnvPairs} rowLabel="Environment variable" keyPlaceholder="ENV_VAR" />
            </div>
          </>
        ) : (
          <>
            <Input
              label="URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              spellCheck={false}
              style={{ fontFamily: MONO }}
              error={Boolean(show(urlError))}
              helperText={show(urlError) ?? undefined}
            />
            <div className="hk-field">
              <span className="hk-label">Headers</span>
              <KeyValueEditor pairs={headerPairs} onChange={setHeaderPairs} rowLabel="Header" keyPlaceholder="Header-Name" />
            </div>
          </>
        )}

        {error}
        {/* Enter in a field submits. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
