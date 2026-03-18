import { useEffect, useMemo, useState } from "react";
import { readHarnessFile } from "../../lib/tauri";
import { parseHarness, validateHarnessYaml } from "@harness-kit/core";
import type { HarnessConfig, ValidationResult } from "@harness-kit/core";
import ValidationBanner from "./harness-file/ValidationBanner";
import MetadataSection from "./harness-file/MetadataSection";
import PluginsSection from "./harness-file/PluginsSection";
import McpServersSection from "./harness-file/McpServersSection";
import EnvSection from "./harness-file/EnvSection";
import InstructionsSection from "./harness-file/InstructionsSection";
import PermissionsSection from "./harness-file/PermissionsSection";
import ExtendsSection from "./harness-file/ExtendsSection";

const EXAMPLE_YAML = `version: "1"
metadata:
  name: my-harness
  description: My personal harness configuration.
plugins:
  - name: research
    source: harnessprotocol/harness-kit`;

export default function HarnessFilePage() {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [found, setFound] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [view, setView] = useState<"formatted" | "raw">("formatted");

  useEffect(() => {
    readHarnessFile()
      .then((result) => {
        setFound(result.found);
        setContent(result.content);
        setFilePath(result.path);
      })
      .catch((e) => setFetchError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const parsed = useMemo<{ config: HarnessConfig; parseError: string | null }>(() => {
    if (!content) return { config: {} as HarnessConfig, parseError: null };
    try {
      const { config } = parseHarness(content);
      return { config, parseError: null };
    } catch (e) {
      return { config: {} as HarnessConfig, parseError: String(e) };
    }
  }, [content]);

  const validation = useMemo<ValidationResult | null>(() => {
    if (!content || parsed.parseError) return null;
    try {
      return validateHarnessYaml(content);
    } catch {
      return null;
    }
  }, [content, parsed.parseError]);

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

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
            Harness File
          </h1>
          <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
            The single source of truth for your AI assistant configuration.
          </p>
        </div>

        {found && filePath && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, marginLeft: "16px" }}>
            <code style={{ fontSize: "11px", color: "var(--fg-subtle)", fontFamily: "ui-monospace, monospace" }}>
              {filePath}
            </code>
            <div style={{
              display: "flex",
              gap: "2px",
              background: "var(--bg-base)",
              border: "1px solid var(--border-base)",
              borderRadius: "6px",
              padding: "2px",
            }}>
              <button onClick={() => setView("formatted")} style={tabBtn(view === "formatted")}>
                Formatted
              </button>
              <button onClick={() => setView("raw")} style={tabBtn(view === "raw")}>
                Raw
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
      )}

      {/* Fetch error */}
      {fetchError && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "13px",
          color: "var(--danger)",
        }}>
          {fetchError}
        </div>
      )}

      {/* Empty state */}
      {!loading && !fetchError && !found && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "32px 24px",
          textAlign: "center",
          maxWidth: "540px",
        }}>
          <div style={{ fontSize: "28px", marginBottom: "12px" }}>🧰</div>
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--fg-base)", margin: "0 0 6px" }}>
            No harness.yaml found
          </h2>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: "0 0 16px", lineHeight: "1.5" }}>
            A <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px" }}>harness.yaml</code> file
            is the single source of truth for your AI assistant configuration. It declares plugins, MCP servers,
            environment variables, instructions, and permissions — all in one portable file.
          </p>
          <p style={{ fontSize: "12px", color: "var(--fg-subtle)", margin: "0 0 12px" }}>
            Place it at <code style={{ fontFamily: "ui-monospace, monospace" }}>~/.claude/harness.yaml</code> or <code style={{ fontFamily: "ui-monospace, monospace" }}>~/harness.yaml</code>
          </p>
          <pre style={{
            textAlign: "left",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-base)",
            borderRadius: "6px",
            padding: "12px 14px",
            fontSize: "11px",
            fontFamily: "ui-monospace, monospace",
            color: "var(--fg-muted)",
            margin: "0 auto",
            lineHeight: "1.6",
            whiteSpace: "pre-wrap",
          }}>
            {EXAMPLE_YAML}
          </pre>
        </div>
      )}

      {/* Found — content */}
      {!loading && !fetchError && found && content && (
        <>
          {/* Parse error */}
          {parsed.parseError && (
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-base)",
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "13px",
              color: "var(--danger)",
              marginBottom: "16px",
            }}>
              {parsed.parseError}
            </div>
          )}

          {view === "formatted" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Validation banner */}
              {validation && <ValidationBanner result={validation} />}

              {/* Sections — only render when data is present */}
              {parsed.config.metadata && (
                <MetadataSection metadata={parsed.config.metadata} />
              )}
              {parsed.config.plugins && parsed.config.plugins.length > 0 && (
                <PluginsSection plugins={parsed.config.plugins} />
              )}
              {parsed.config["mcp-servers"] && Object.keys(parsed.config["mcp-servers"]).length > 0 && (
                <McpServersSection servers={parsed.config["mcp-servers"]} />
              )}
              {parsed.config.env && parsed.config.env.length > 0 && (
                <EnvSection env={parsed.config.env} />
              )}
              {parsed.config.instructions && (
                <InstructionsSection instructions={parsed.config.instructions} />
              )}
              {parsed.config.permissions && (
                <PermissionsSection permissions={parsed.config.permissions} />
              )}
              {parsed.config.extends && parsed.config.extends.length > 0 && (
                <ExtendsSection extends_={parsed.config.extends} />
              )}
            </div>
          ) : (
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-base)",
              borderRadius: "8px",
              padding: "14px 16px",
              overflowX: "auto",
            }}>
              <pre style={{
                margin: 0,
                fontFamily: "ui-monospace, monospace",
                fontSize: "11px",
                lineHeight: "1.6",
                color: "var(--fg-muted)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {content}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
