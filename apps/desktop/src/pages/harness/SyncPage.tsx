import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wrench, Pencil, Check, X as XIcon } from "lucide-react";
import { Button, Card, EmptyState, Input } from "@harness-kit/ui";
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

const ALL_PLATFORMS: TargetPlatform[] = [
  "claude-code", "cursor", "copilot", "codex", "opencode", "windsurf", "gemini", "junie",
];
const PLATFORM_LABELS: Record<TargetPlatform, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  copilot: "Copilot",
  codex: "Codex",
  opencode: "OpenCode",
  windsurf: "Windsurf",
  gemini: "Gemini CLI",
  junie: "Junie",
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

// ── Main page ─────────────────────────────────────────────────

export default function SyncPage() {
  const navigate = useNavigate();
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

          <Button variant="ghost" size="sm" onClick={() => navigate("/harness/file")}>
            <Pencil size={12} strokeWidth={1.7} style={{ marginRight: 5 }} />
            Edit harness.yaml
          </Button>
        </div>

        {/* No harness.yaml — empty state */}
        {!harnessLoading && !harnessContent && (
          <EmptyState
            icon={<Wrench size={28} strokeWidth={1.5} />}
            title="No harness.yaml found"
            description="Create your harness.yaml first, then come back to sync it to your projects."
            action={
              <Button variant="primary" onClick={() => navigate("/harness/file")}>
                Create harness.yaml
              </Button>
            }
          />
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
                <div style={{ flex: 1 }}>
                  <Input
                    type="text"
                    value={projectDir}
                    onChange={(e) => handleDirChange(e.target.value)}
                    placeholder="~/repos/my-project"
                    style={{ fontFamily: "ui-monospace, monospace" }}
                  />
                </div>
                <Button variant="ghost" onClick={openDirectoryPicker}>
                  Browse…
                </Button>
              </div>

              {/* Status / recent */}
              {projectDir && !dirChecking && (
                <p style={{
                  margin: "5px 0 0", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px",
                  color: dirValid ? "var(--success)" : "var(--danger)",
                }}>
                  {dirValid ? <Check size={11} strokeWidth={2} /> : <XIcon size={11} strokeWidth={2} />}
                  {dirValid ? "Directory found" : "Directory not found"}
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
                      className="hk-reset-btn"
                      onClick={() => handleDirChange(d)}
                      style={{
                        padding: "2px 8px", borderRadius: "4px",
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
                      className="hk-reset-btn"
                      onClick={() => toggleTarget(platform)}
                      style={{
                        display: "flex", alignItems: "center", gap: "5px",
                        padding: "5px 12px", borderRadius: "6px",
                        background: checked ? "var(--accent-light)" : "var(--bg-elevated)",
                        color: checked ? "var(--accent-text)" : "var(--fg-subtle)",
                        fontSize: "12px", fontWeight: checked ? 600 : 400, cursor: "pointer",
                        transition: "background-color 0.15s ease-out",
                      }}
                    >
                      <span style={{
                        width: "6px", height: "6px", borderRadius: "50%",
                        background: checked ? "var(--accent)" : "var(--border-strong)",
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
              <Button variant="primary" onClick={handlePreview} disabled={!canPreview}>
                {phase === "previewing" ? "Previewing…" : "Preview Changes"}
              </Button>
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
              <p style={{ margin: "0 0 2px", fontSize: "13px", fontWeight: 600, color: "var(--success)" }}>
                Sync complete
              </p>
              {appliedBackupId && (
                <code style={{ fontSize: "10px", color: "var(--fg-subtle)", fontFamily: "ui-monospace, monospace" }}>
                  backup: {appliedBackupId}
                </code>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Sync again
              </Button>
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
