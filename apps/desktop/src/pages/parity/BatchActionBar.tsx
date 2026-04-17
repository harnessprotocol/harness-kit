import { useState } from "react";
import type { TargetPlatform } from "@harness-kit/core";
import type { SelectionKey } from "./useParitySelection";
import type { Capability } from "./capability-catalog";
import type { HarnessInfo } from "@harness-kit/shared";
import { CAPABILITIES } from "./capability-catalog";
import { syncWriteFiles } from "../../lib/tauri";

interface Props {
  selected: ReadonlySet<SelectionKey>;
  harnesses: HarnessInfo[];
  projectDir: string;
  onClear: () => void;
  onCompileSuccess: () => void;
}

interface CompileItem {
  targetId: TargetPlatform;
  cap: Capability;
  path: string;
}

function getDefaultContent(cap: Capability, targetId: TargetPlatform): string {
  const path = cap.support[targetId]?.path ?? "";
  if (cap.id === "instructions-file") {
    if (targetId === "claude-code") {
      return "# Instructions\n\n## Commands\n\n<!-- build, test, dev commands -->\n\n## Architecture\n\n<!-- entry points and key files -->\n\n## Gotchas\n\n<!-- non-obvious patterns -->\n";
    }
    return "# Instructions\n\n<!-- Add your AI coding agent instructions here -->\n";
  }
  if (cap.id === "mcp-config") {
    return JSON.stringify({ mcpServers: {} }, null, 2) + "\n";
  }
  if (cap.id === "settings-file" && path.endsWith(".json")) {
    return JSON.stringify({ permissions: { allow: [], deny: [] } }, null, 2) + "\n";
  }
  return "";
}

export function BatchActionBar({
  selected,
  harnesses,
  projectDir,
  onClear,
  onCompileSuccess,
}: Props) {
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = selected.size > 0;

  const involvedTargetIds = new Set<string>();
  selected.forEach((key) => involvedTargetIds.add(key.split("::")[0]));
  const involvedNames = harnesses
    .filter((h) => involvedTargetIds.has(h.id))
    .map((h) => h.name)
    .join(" · ");

  async function handleCompile() {
    setCompiling(true);
    setError(null);

    const items: CompileItem[] = [];
    selected.forEach((key) => {
      const [tid, capId] = key.split("::");
      const cap = CAPABILITIES.find((c) => c.id === capId);
      if (!cap) return;
      const path = cap.support[tid as TargetPlatform]?.path;
      if (!path) return;
      items.push({ targetId: tid as TargetPlatform, cap, path });
    });

    try {
      await syncWriteFiles(
        projectDir,
        items.map((item) => ({
          relativePath: item.path,
          content: getDefaultContent(item.cap, item.targetId),
        })),
      );
      onCompileSuccess();
    } catch (e) {
      setError(String(e));
    } finally {
      setCompiling(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: `translate(-50%, ${visible ? "0" : "100px"})`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 14px 10px 16px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        borderRadius: 10,
        boxShadow: "var(--shadow-lg)",
        zIndex: 20,
        transition: "transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Count + targets */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            background: "var(--accent)",
            color: "white",
            padding: "2px 9px",
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {selected.size}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-base)" }}>
          cells queued
        </span>
      </div>

      {/* Separator */}
      <div style={{ width: 1, background: "var(--border-base)", alignSelf: "stretch" }} />

      <span
        style={{
          fontSize: 11,
          color: "var(--fg-muted)",
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {involvedNames}
      </span>

      {/* Separator */}
      <div style={{ width: 1, background: "var(--border-base)", alignSelf: "stretch" }} />

      {error && (
        <span style={{ fontSize: 11, color: "var(--danger)" }}>{error}</span>
      )}

      <button
        onClick={onClear}
        disabled={compiling}
        style={{
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 500,
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid var(--border-base)",
          background: "transparent",
          color: "var(--fg-muted)",
          cursor: compiling ? "not-allowed" : "pointer",
          opacity: compiling ? 0.5 : 1,
        }}
      >
        Clear
      </button>

      <button
        onClick={handleCompile}
        disabled={compiling}
        style={{
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 500,
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid var(--accent)",
          background: "var(--accent)",
          color: "white",
          cursor: compiling ? "not-allowed" : "pointer",
          opacity: compiling ? 0.7 : 1,
        }}
      >
        {compiling ? "Compiling…" : "Compile selected"}
      </button>
    </div>
  );
}
