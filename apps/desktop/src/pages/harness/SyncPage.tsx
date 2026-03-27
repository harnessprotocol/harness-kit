import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useChat } from "../../context/ChatContext";
import { emitChatShare } from "../../lib/chat-events";
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
  try { return JSON.parse(localStorage.getItem(RECENT_DIRS_KEY) ?? "[]"); } catch { return []; }
}
function saveRecentDir(dir: string) {
  const dirs = getRecentDirs().filter((d) => d !== dir);
  dirs.unshift(dir);
  try { localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(dirs.slice(0, MAX_RECENT))); } catch {}
}

// ── Small helpers ─────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-base)",
      borderRadius: "8px",
      padding: "14px 16px",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function SyncPage() {
  // Harness file state
  const [harnessContent, setHarnessContent] = useState<string | null>(null);
  const [harnessPath, setHarnessPath] = useState<string | null>(null);
  const [harnessName, setHarnessName] = useState("default");
  const [harnessDescription, setHarnessDescription] = useState<string | null>(null);
  const [harnessLoading, setHarnessLoading] = useState(true);

  // Project dir
  const [projectDir, setProjectDir] = useState("");
  const [recentDirs] = useState<string[]>(getRecentDirs);
  const [dirValid, setDirValid] = useState(false);
  const [dirChecking, setDirChecking] = useState(false);

  // Platforms
  const [detectedPlatforms, setDetectedPlatforms] = useState<DetectedPlatform[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<Set<TargetPlatform>>(new Set());

  // Sync flow
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewResult, setPreviewResult] = useState<CompileResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [appliedBackupId, setAppliedBackupId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Backups
  const [backups, setBackups] = useState<BackupManifest[]>([]);

  // Chat share
  const { state: chatState } = useChat();
  const [sharedToRoom, setSharedToRoom] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load harness file
  const loadHarness = useCallback(() => {
    setHarnessLoading(true);
    readHarnessFile()
      .then((result) => {
        if (result.found && result.content) {
          setHarnessContent(result.content);
          setHarnessPath(result.path);
          try {
            const { config } = parseHarness(result.content);
            setHarnessName(config.metadata?.name ?? "default");
            setHarnessDescription(config.metadata?.description ?? null);
          } catch {}
        } else {
          setHarnessContent(null);
          setHarnessPath(null);
        }
      })
      .catch(() => {})
      .finally(() => setHarnessLoading(false));
  }, []);

  useEffect(() => { loadHarness(); }, [loadHarness]);
  useEffect(() => { syncListBackups().then(setBackups).catch(() => {}); }, []);

  // Debounced dir validation + platform detection
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
        if (!exists) { setDirValid(false); return; }
        setDirValid(true);
        saveRecentDir(dir);
        const fs = new SyncFsProvider(dir);
        const detected = await detectPlatforms(fs);
        setDetectedPlatforms(detected);
        setSelectedTargets(new Set(detected.map((d) => d.platform)));
      } catch { setDirValid(false); }
      finally { setDirChecking(false); }
    }, 300);
  }, []);

  async function openDirectoryPicker() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: "Select project directory" });
      if (selected && typeof selected === "string") handleDirChange(selected);
    } catch {}
  }

  function toggleTarget(platform: TargetPlatform) {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform); else next.add(platform);
      return next;
    });
  }

  async function handlePreview() {
    if (!harnessContent || selectedTargets.size === 0 || !dirValid) return;
    setPhase("previewing");
    setPreviewError(null);
    try {
      const fs = new SyncFsProvider(projectDir);
      const result = await compile(harnessContent, [...selectedTargets], fs, { dryRun: true });
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
      const overwritePaths = previewResult.files.filter((f) => f.action === "update").map((f) => f.path);
      const backup = await syncCreateBackup(projectDir, harnessName, [...selectedTargets], overwritePaths);
      setAppliedBackupId(backup.id);
      const writes = previewResult.files
        .filter((f) => f.action === "create" || f.action === "update")
        .map((f) => ({ relativePath: f.path, content: f.content }));
      await syncWriteFiles(projectDir, writes);
      setPhase("applied");
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
    setSharedToRoom(false);
  }

  const canPreview = dirValid && selectedTargets.size > 0 && !!harnessContent && phase === "idle";

  return (
    <>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "720px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
              Sync
            </h1>
            <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
              Compile your harness.yaml to platform-native config files.
            </p>
          </div>

          <Link
            to="/harness/file"
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "5px 11px", borderRadius: "6px",
              border: "1px solid var(--border-base)",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)", fontSize: "11px", fontWeight: 500,
              cursor: "pointer", textDecoration: "none", flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            Edit harness.yaml
          </Link>
        </div>

        {/* No harness.yaml — empty state */}
        {!harnessLoading && !harnessContent && (
          <Card>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "16px 0 8px", textAlign: "center" }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "10px",
                background: "var(--bg-elevated)", border: "1px solid var(--border-base)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "20px",
              }}>
                🧰
              </div>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)", margin: 0 }}>
                No harness.yaml found
              </p>
              <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: 0, maxWidth: "400px", lineHeight: "1.5" }}>
                Create your harness.yaml first, then come back to sync it to your projects.
              </p>
              <Link
                to="/harness/file"
                style={{
                  padding: "7px 14px", borderRadius: "6px",
                  border: "none",
                  background: "var(--accent)", color: "var(--accent-text, #fff)",
                  fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  textDecoration: "none", marginTop: "4px",
                }}
              >
                Create harness.yaml
              </Link>
            </div>
          </Card>
        )}

        {/* Harness source card */}
        {harnessContent && harnessPath && (
          <Card style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SectionLabel>Harness Source</SectionLabel>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg-base)" }}>{harnessName}</span>
                {harnessDescription && (
                  <span style={{ fontSize: "12px", color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {harnessDescription}
                  </span>
                )}
              </div>
              <code style={{ fontSize: "10px", color: "var(--fg-subtle)", fontFamily: "ui-monospace, monospace" }}>
                {harnessPath}
              </code>
            </div>
          </Card>
        )}

        {/* Setup form — only shown when harness is loaded */}
        {harnessContent && (
          <Card style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Project directory */}
            <div>
              <SectionLabel>Project Directory</SectionLabel>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  value={projectDir}
                  onChange={(e) => handleDirChange(e.target.value)}
                  placeholder="~/repos/my-project"
                  style={{
                    flex: 1, padding: "6px 10px", borderRadius: "6px",
                    border: `1px solid ${dirValid ? "var(--accent)" : "var(--border-base)"}`,
                    background: "var(--bg-elevated)", color: "var(--fg-base)",
                    fontSize: "12px", fontFamily: "ui-monospace, monospace", outline: "none",
                  }}
                />
                <button
                  onClick={openDirectoryPicker}
                  style={{
                    padding: "6px 12px", borderRadius: "6px",
                    border: "1px solid var(--border-base)",
                    background: "var(--bg-elevated)", color: "var(--fg-base)",
                    fontSize: "12px", cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Browse…
                </button>
              </div>

              {/* Status / recent */}
              {projectDir && !dirChecking && (
                <p style={{ margin: "5px 0 0", fontSize: "11px", color: dirValid ? "var(--accent)" : "var(--danger)" }}>
                  {dirValid ? "✓ Directory found" : "✗ Directory not found"}
                </p>
              )}
              {dirChecking && (
                <p style={{ margin: "5px 0 0", fontSize: "11px", color: "var(--fg-subtle)" }}>Checking…</p>
              )}
              {!projectDir && recentDirs.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                  {recentDirs.slice(0, 5).map((d) => (
                    <button
                      key={d}
                      onClick={() => handleDirChange(d)}
                      style={{
                        padding: "2px 8px", borderRadius: "4px",
                        border: "1px solid var(--border-base)",
                        background: "var(--bg-elevated)", color: "var(--fg-subtle)",
                        fontSize: "10px", fontFamily: "ui-monospace, monospace", cursor: "pointer",
                        maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Platform targets */}
            <div>
              <SectionLabel>Target Platforms</SectionLabel>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {ALL_PLATFORMS.map((platform) => {
                  const detected = detectedPlatforms.find((d) => d.platform === platform);
                  const checked = selectedTargets.has(platform);
                  return (
                    <button
                      key={platform}
                      onClick={() => toggleTarget(platform)}
                      style={{
                        display: "flex", alignItems: "center", gap: "5px",
                        padding: "5px 12px", borderRadius: "6px",
                        border: `1px solid ${checked ? "var(--accent)" : "var(--border-base)"}`,
                        background: checked ? "var(--accent-light, #1a1a2e)" : "var(--bg-elevated)",
                        color: checked ? "var(--accent)" : "var(--fg-subtle)",
                        fontSize: "12px", fontWeight: checked ? 600 : 400, cursor: "pointer",
                        transition: "all 0.1s",
                      }}
                    >
                      <span style={{
                        width: "6px", height: "6px", borderRadius: "50%",
                        background: checked ? "var(--accent)" : "var(--border-base)",
                        flexShrink: 0,
                      }} />
                      {PLATFORM_LABELS[platform]}
                      {detected && (
                        <span style={{ fontSize: "9px", opacity: 0.7 }}>detected</span>
                      )}
                    </button>
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
                  padding: "7px 18px", borderRadius: "6px", border: "none",
                  background: canPreview ? "var(--accent)" : "var(--bg-elevated)",
                  color: canPreview ? "var(--accent-text, #fff)" : "var(--fg-subtle)",
                  fontSize: "12px", fontWeight: 600,
                  cursor: canPreview ? "pointer" : "not-allowed",
                  transition: "all 0.1s",
                }}
              >
                {phase === "previewing" ? "Previewing…" : "Preview Changes"}
              </button>
            </div>
          </Card>
        )}

        {/* Preview error */}
        {previewError && (
          <Card>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--danger)" }}>{previewError}</p>
          </Card>
        )}

        {/* Preview panel */}
        {(phase === "previewed" || phase === "applying") && previewResult && (
          <div>
            <SectionLabel>Preview</SectionLabel>
            <SyncPreview
              result={previewResult}
              applying={phase === "applying"}
              onApply={handleApply}
            />
            {applyError && (
              <p style={{ fontSize: "12px", color: "var(--danger)", margin: "8px 0 0" }}>{applyError}</p>
            )}
          </div>
        )}

        {/* Success banner */}
        {phase === "applied" && (
          <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: "0 0 2px", fontSize: "13px", fontWeight: 600, color: "var(--accent)" }}>
                Sync complete
              </p>
              {appliedBackupId && (
                <code style={{ fontSize: "10px", color: "var(--fg-subtle)", fontFamily: "ui-monospace, monospace" }}>
                  backup: {appliedBackupId}
                </code>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              {chatState.status === "in_room" && (
                <button
                  onClick={() => {
                    const fileCount = previewResult?.files.filter((f) => f.action === "create" || f.action === "update").length ?? 0;
                    emitChatShare({
                      action: "sync_applied",
                      target: harnessName,
                      detail: `${fileCount} file${fileCount !== 1 ? "s" : ""} synced`,
                      diff: null,
                      pullable: true,
                    });
                    setSharedToRoom(true);
                    setTimeout(() => setSharedToRoom(false), 2000);
                  }}
                  style={{
                    padding: "5px 12px", borderRadius: "6px",
                    border: "1px solid var(--accent)",
                    background: sharedToRoom ? "var(--accent)" : "transparent",
                    color: sharedToRoom ? "var(--accent-text, #fff)" : "var(--accent)",
                    fontSize: "12px", cursor: "pointer", fontWeight: 500,
                    transition: "all 0.15s",
                  }}
                >
                  {sharedToRoom ? "Shared!" : "Share sync to Room"}
                </button>
              )}
              <button
                onClick={handleReset}
                style={{
                  padding: "5px 12px", borderRadius: "6px",
                  border: "1px solid var(--border-base)",
                  background: "var(--bg-elevated)", color: "var(--fg-base)",
                  fontSize: "12px", cursor: "pointer",
                }}
              >
                Sync again
              </button>
            </div>
          </Card>
        )}

        {/* Backup history */}
        {dirValid && (
          <BackupHistory
            backups={backups}
            projectDir={projectDir}
            onRestored={() => syncListBackups().then(setBackups).catch(() => {})}
          />
        )}

      </div>

    </>
  );
}
