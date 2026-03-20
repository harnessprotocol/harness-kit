import { useCallback, useEffect, useRef, useState } from "react";
import { compile, detectPlatforms, parseHarness } from "@harness-kit/core";
import type { CompileResult, DetectedPlatform, TargetPlatform } from "@harness-kit/core";
import {
  readHarnessFile,
  syncCreateBackup,
  syncFileExists,
  syncListBackups,
  syncWriteFiles,
} from "../../lib/tauri";
import type { BackupManifest } from "../../lib/tauri";
import { SyncFsProvider } from "../../lib/sync-fs";
import SyncPreview from "./sync/SyncPreview";
import BackupHistory from "./sync/BackupHistory";

const ALL_PLATFORMS: TargetPlatform[] = ["claude-code", "cursor", "copilot"];
const PLATFORM_LABELS: Record<TargetPlatform, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  copilot: "Copilot",
};
const RECENT_DIRS_KEY = "harness-kit-sync-recent-dirs";
const MAX_RECENT = 10;

type Phase = "idle" | "previewing" | "previewed" | "applying" | "applied";

function getRecentDirs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_DIRS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecentDir(dir: string) {
  const dirs = getRecentDirs().filter((d) => d !== dir);
  dirs.unshift(dir);
  try {
    localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(dirs.slice(0, MAX_RECENT)));
  } catch {}
}

export default function SyncPage() {
  const [projectDir, setProjectDir] = useState("");
  const [recentDirs] = useState<string[]>(getRecentDirs);
  const [dirValid, setDirValid] = useState(false);
  const [dirChecking, setDirChecking] = useState(false);

  const [detectedPlatforms, setDetectedPlatforms] = useState<DetectedPlatform[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<Set<TargetPlatform>>(new Set());

  const [harnessContent, setHarnessContent] = useState<string | null>(null);
  const [harnessPath, setHarnessPath] = useState<string | null>(null);
  const [harnessName, setHarnessName] = useState("default");

  const [phase, setPhase] = useState<Phase>("idle");
  const [previewResult, setPreviewResult] = useState<CompileResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [appliedBackupId, setAppliedBackupId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const [backups, setBackups] = useState<BackupManifest[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load harness file once on mount
  useEffect(() => {
    readHarnessFile()
      .then((result) => {
        if (result.found && result.content) {
          setHarnessContent(result.content);
          setHarnessPath(result.path);
          try {
            const { config } = parseHarness(result.content);
            if (config.metadata?.name) setHarnessName(config.metadata.name);
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Load backups on mount
  useEffect(() => {
    syncListBackups().then(setBackups).catch(() => {});
  }, []);

  // Debounced directory validation + platform detection
  const handleDirChange = useCallback((dir: string) => {
    setProjectDir(dir);
    setDirValid(false);
    setDetectedPlatforms([]);
    setSelectedTargets(new Set());
    setPhase("idle");
    setPreviewResult(null);
    setPreviewError(null);

    if (!dir.trim()) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setDirChecking(true);
      try {
        const exists = await syncFileExists(dir, ".");
        if (!exists) {
          setDirValid(false);
          return;
        }
        setDirValid(true);
        saveRecentDir(dir);

        const fs = new SyncFsProvider(dir);
        const detected = await detectPlatforms(fs);
        setDetectedPlatforms(detected);
        setSelectedTargets(new Set(detected.map((d) => d.platform)));
      } catch {
        setDirValid(false);
      } finally {
        setDirChecking(false);
      }
    }, 300);
  }, []);

  async function openDirectoryPicker() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: "Select project directory" });
      if (selected && typeof selected === "string") {
        handleDirChange(selected);
      }
    } catch {}
  }

  function toggleTarget(platform: TargetPlatform) {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  async function handlePreview() {
    if (!harnessContent || selectedTargets.size === 0 || !dirValid) return;
    setPhase("previewing");
    setPreviewError(null);
    try {
      const fs = new SyncFsProvider(projectDir);
      const targets = [...selectedTargets];
      const result = await compile(harnessContent, targets, fs, { dryRun: true });
      setPreviewResult(result);
      setPhase("previewed");
    } catch (e) {
      setPreviewError(String(e));
      setPhase("idle");
    }
  }

  async function handleApply() {
    if (!previewResult || !harnessContent) return;
    setPhase("applying");
    setApplyError(null);
    try {
      // Collect paths that will be overwritten for backup
      const overwritePaths = previewResult.files
        .filter((f) => f.action === "update")
        .map((f) => f.path);

      const backup = await syncCreateBackup(
        projectDir,
        harnessName,
        [...selectedTargets],
        overwritePaths,
      );
      setAppliedBackupId(backup.id);

      // Write all non-skipped files
      const writes = previewResult.files
        .filter((f) => f.action === "create" || f.action === "update")
        .map((f) => ({ relativePath: f.path, content: f.content }));

      await syncWriteFiles(projectDir, writes);

      setPhase("applied");

      // Refresh backup list
      const updated = await syncListBackups();
      setBackups(updated);
    } catch (e) {
      setApplyError(String(e));
      setPhase("previewed");
    }
  }

  function handleReset() {
    setPhase("idle");
    setPreviewResult(null);
    setPreviewError(null);
    setAppliedBackupId(null);
    setApplyError(null);
  }

  async function refreshBackups() {
    const updated = await syncListBackups().catch(() => [] as BackupManifest[]);
    setBackups(updated);
  }

  const canPreview = dirValid && selectedTargets.size > 0 && !!harnessContent && phase === "idle";

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px", maxWidth: "780px" }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
          Sync
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          Compile your harness.yaml to platform-native config files.
        </p>
      </div>

      {/* No harness file warning */}
      {!harnessContent && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "12px 14px",
          fontSize: "12px",
          color: "var(--fg-muted)",
        }}>
          No <code style={{ fontFamily: "ui-monospace, monospace" }}>harness.yaml</code> found.
          Place one at <code style={{ fontFamily: "ui-monospace, monospace" }}>~/.claude/harness.yaml</code> or{" "}
          <code style={{ fontFamily: "ui-monospace, monospace" }}>~/harness.yaml</code> to use Sync.
        </div>
      )}

      {/* Setup form */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-base)",
        borderRadius: "8px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}>
        {/* Harness source */}
        {harnessPath && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
              Harness Source
            </label>
            <code style={{ fontSize: "11px", color: "var(--fg-muted)", fontFamily: "ui-monospace, monospace" }}>
              {harnessPath}
            </code>
          </div>
        )}

        {/* Project directory */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            Project Directory
          </label>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              type="text"
              value={projectDir}
              onChange={(e) => handleDirChange(e.target.value)}
              placeholder="/Users/you/repos/my-project"
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid var(--border-base)",
                background: "var(--bg-elevated)",
                color: "var(--fg-base)",
                fontSize: "12px",
                fontFamily: "ui-monospace, monospace",
                outline: "none",
              }}
            />
            <button
              onClick={openDirectoryPicker}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-base)",
                background: "var(--bg-elevated)",
                color: "var(--fg-base)",
                fontSize: "12px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Browse…
            </button>
          </div>

          {/* Recent dirs */}
          {recentDirs.length > 0 && !projectDir && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {recentDirs.slice(0, 5).map((d) => (
                <button
                  key={d}
                  onClick={() => handleDirChange(d)}
                  style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    border: "1px solid var(--border-base)",
                    background: "var(--bg-elevated)",
                    color: "var(--fg-subtle)",
                    fontSize: "10px",
                    fontFamily: "ui-monospace, monospace",
                    cursor: "pointer",
                    maxWidth: "220px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          {projectDir && !dirChecking && (
            <span style={{ fontSize: "11px", color: dirValid ? "var(--success, #22c55e)" : "var(--danger)" }}>
              {dirValid ? "Directory found" : "Directory not found"}
            </span>
          )}
          {dirChecking && (
            <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>Checking…</span>
          )}
        </div>

        {/* Platform targets */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            Target Platforms
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {ALL_PLATFORMS.map((platform) => {
              const detected = detectedPlatforms.find((d) => d.platform === platform);
              const checked = selectedTargets.has(platform);
              return (
                <label
                  key={platform}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "12px",
                    color: "var(--fg-base)",
                    cursor: "pointer",
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: `1px solid ${checked ? "var(--accent)" : "var(--border-base)"}`,
                    background: checked ? "var(--accent-light, var(--bg-elevated))" : "var(--bg-elevated)",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTarget(platform)}
                    style={{ margin: 0, accentColor: "var(--accent)" }}
                  />
                  {PLATFORM_LABELS[platform]}
                  {detected && (
                    <span style={{ fontSize: "9px", color: "var(--fg-subtle)", marginLeft: "2px" }}>
                      detected
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Preview button */}
        <div>
          <button
            onClick={handlePreview}
            disabled={!canPreview}
            style={{
              padding: "7px 16px",
              borderRadius: "6px",
              border: "none",
              background: canPreview ? "var(--accent)" : "var(--bg-elevated)",
              color: canPreview ? "var(--accent-text, #fff)" : "var(--fg-subtle)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: canPreview ? "pointer" : "not-allowed",
            }}
          >
            {phase === "previewing" ? "Previewing…" : "Preview Changes"}
          </button>
        </div>
      </div>

      {/* Preview error */}
      {previewError && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "12px",
          color: "var(--danger)",
        }}>
          {previewError}
        </div>
      )}

      {/* Preview panel */}
      {(phase === "previewed" || phase === "applying") && previewResult && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)", margin: 0 }}>
              Preview
            </h2>
          </div>
          <SyncPreview
            result={previewResult}
            applying={phase === "applying"}
            onApply={handleApply}
          />
          {applyError && (
            <p style={{ fontSize: "12px", color: "var(--danger)", margin: 0 }}>{applyError}</p>
          )}
        </div>
      )}

      {/* Success banner */}
      {phase === "applied" && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--success, #22c55e)" }}>
              Sync complete
            </span>
            {appliedBackupId && (
              <span style={{ fontSize: "11px", color: "var(--fg-subtle)", fontFamily: "ui-monospace, monospace" }}>
                Backup ID: {appliedBackupId}
              </span>
            )}
          </div>
          <button
            onClick={handleReset}
            style={{
              padding: "5px 12px",
              borderRadius: "6px",
              border: "1px solid var(--border-base)",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Sync again
          </button>
        </div>
      )}

      {/* Backup history */}
      {dirValid && (
        <BackupHistory
          backups={backups}
          projectDir={projectDir}
          onRestored={refreshBackups}
        />
      )}
    </div>
  );
}
