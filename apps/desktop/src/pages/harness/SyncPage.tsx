import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wrench, Pencil, Check, X as XIcon } from "lucide-react";
import { Button, Card, EmptyState, ErrorNotice } from "@harness-kit/ui";
import { COMPILE_SURFACE_IDS, compile, detectPlatforms, isCompileSurface, parseHarness } from "@harness-kit/core";
import type { CompileResult, DetectedPlatform, SurfaceId } from "@harness-kit/core";
import { surfaceLabel } from "../../lib/surface-labels";
import {
  readHarnessFile,
  syncCreateBackup,
  syncFileExists,
  syncListBackups,
  syncWriteFiles,
} from "../../lib/tauri";
import type { BackupManifest } from "../../lib/tauri";
import { SyncFsProvider } from "../../lib/sync-fs";
import { grantProjectDir, useProjectDir } from "../../lib/project-dir";
import SyncPreview from "./sync/SyncPreview";
import { useRegisterCommands } from "../../lib/commands";
import { errorDetails } from "../../lib/error-details";
import BackupHistory from "./sync/BackupHistory";

const ALL_PLATFORMS: readonly SurfaceId[] = COMPILE_SURFACE_IDS;

type Phase = "idle" | "previewing" | "previewed" | "applying" | "applied";

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
  // A failed read is not "no harness.yaml": it gets its own notice, never the
  // empty state's "Create harness.yaml".
  const [harnessError, setHarnessError] = useState<string | null>(null);

  // Project dir: the title bar's project (AC-17, lib/project-dir.ts)
  const [currentProject] = useProjectDir();
  const projectDir = currentProject ?? "";
  const [dirValid, setDirValid] = useState(false);
  const [dirChecking, setDirChecking] = useState(false);

  // Platforms
  const [detectedPlatforms, setDetectedPlatforms] = useState<DetectedPlatform[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<Set<SurfaceId>>(new Set());

  // Sync flow
  const [phase, setPhase] = useState<Phase>("idle");
  // A preview holds the targets it was compiled for, so the backup that Apply
  // takes names exactly the surfaces whose files it writes.
  const [preview, setPreview] = useState<{ result: CompileResult; targets: SurfaceId[] } | null>(null);
  const previewResult = preview?.result ?? null;
  // Bumped whenever a preview's inputs change, so a compile still in flight
  // for the old inputs is dropped instead of shown.
  const previewGeneration = useRef(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [appliedBackupId, setAppliedBackupId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Backups
  const [backups, setBackups] = useState<BackupManifest[]>([]);

  // Load harness file
  const loadHarness = useCallback(() => {
    setHarnessLoading(true);
    setHarnessError(null);
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
      .catch((e) => {
        setHarnessContent(null);
        setHarnessPath(null);
        setHarnessError(errorDetails(e));
      })
      .finally(() => setHarnessLoading(false));
  }, []);

  useEffect(() => { loadHarness(); }, [loadHarness]);
  useEffect(() => { syncListBackups().then(setBackups).catch(() => {}); }, []);

  // Validate the project and detect its platforms whenever it changes. The
  // grant comes first: the sync bridge refuses a directory not granted this
  // session, so Compile must not depend on another page having granted it.
  useEffect(() => {
    let cancelled = false;
    previewGeneration.current += 1;
    setDirValid(false);
    setDetectedPlatforms([]);
    setSelectedTargets(new Set());
    setPhase("idle");
    setPreview(null);
    setPreviewError(null);
    if (!projectDir) {
      setDirChecking(false);
      return;
    }
    setDirChecking(true);
    (async () => {
      try {
        await grantProjectDir(projectDir);
        const exists = await syncFileExists(projectDir, ".");
        if (cancelled || !exists) return;
        setDirValid(true);
        const fs = new SyncFsProvider(projectDir);
        const detected = await detectPlatforms(fs);
        if (cancelled) return;
        setDetectedPlatforms(detected);
        // Detection can report surfaces that aren't compile targets (e.g. pi).
        // The chip UI only renders COMPILE_SURFACE_IDS, so an unfiltered seed
        // would put an invisible, untoggleable target into the set — and
        // compile() throws for non-compile surfaces (adapterIdForTarget guard),
        // so Preview would fail with an error the user can't clear from the
        // chips. Seed the selection with compile surfaces only.
        setSelectedTargets(new Set(detected.map((d) => d.platform).filter(isCompileSurface)));
      } catch {
        if (!cancelled) setDirValid(false);
      } finally {
        if (!cancelled) setDirChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectDir]);

  function toggleTarget(platform: SurfaceId) {
    // A preview stands for the surfaces it was compiled for. Changing them
    // drops it: Apply goes away and "Preview Changes" is needed again.
    if (phase === "previewed") {
      previewGeneration.current += 1;
      setPhase("idle");
      setPreview(null);
      setApplyError(null);
    }
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform); else next.add(platform);
      return next;
    });
  }

  async function handlePreview() {
    if (!harnessContent || selectedTargets.size === 0 || !dirValid) return;
    const generation = previewGeneration.current;
    const targets = [...selectedTargets];
    setPhase("previewing");
    setPreviewError(null);
    try {
      const fs = new SyncFsProvider(projectDir);
      const result = await compile(harnessContent, targets, fs, { dryRun: true });
      if (generation !== previewGeneration.current) return;
      setPreview({ result, targets });
      setPhase("previewed");
    } catch (e) {
      if (generation !== previewGeneration.current) return;
      setPreviewError(errorDetails(e));
      setPhase("idle");
    }
  }

  async function handleApply() {
    if (!preview || !harnessContent) return;
    const { result, targets } = preview;
    setPhase("applying");
    setApplyError(null);
    try {
      const overwritePaths = result.files.filter((f) => f.action === "update").map((f) => f.path);
      const backup = await syncCreateBackup(projectDir, harnessName, targets, overwritePaths);
      setAppliedBackupId(backup.id);
      const writes = result.files
        .filter((f) => f.action === "create" || f.action === "update")
        .map((f) => ({ relativePath: f.path, content: f.content }));
      await syncWriteFiles(projectDir, writes);
      setPhase("applied");
      const updated = await syncListBackups();
      setBackups(updated);
    } catch (e) {
      setApplyError(errorDetails(e));
      setPhase("previewed");
    }
  }

  function handleReset() {
    setPhase("idle");
    setPreview(null);
    setPreviewError(null);
    setAppliedBackupId(null);
    setApplyError(null);
  }

  const canPreview = dirValid && selectedTargets.size > 0 && !!harnessContent && phase === "idle";

  // ⌘K (spec AC-21): Preview and Apply, offered when their buttons are on
  // screen and disabled when those are.
  const writeCount = previewResult
    ? previewResult.files.filter((f) => f.action === "create" || f.action === "update").length
    : 0;
  const applyShown = (phase === "previewed" || phase === "applying") && writeCount > 0;
  useRegisterCommands(
    [
      ...(harnessContent
        ? [
            {
              id: "compile.preview",
              title: "Preview compile changes",
              group: "Compile to project",
              keywords: ["compile", "sync", "dry run"],
              disabled: !canPreview,
              run: handlePreview,
            },
          ]
        : []),
      ...(applyShown
        ? [
            {
              id: "compile.apply",
              title: `Apply ${writeCount} compiled file${writeCount !== 1 ? "s" : ""}`,
              group: "Compile to project",
              keywords: ["compile", "sync", "write"],
              disabled: phase === "applying",
              run: handleApply,
            },
          ]
        : []),
    ],
    [!!harnessContent, canPreview, applyShown, writeCount, phase],
  );

  return (
    <>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "720px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
              Compile to project
            </h1>
            <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
              Compile harness.yaml into each surface's native config files.
            </p>
          </div>

          <Button variant="ghost" size="sm" onClick={() => navigate("/harness/file")}>
            <Pencil size={12} strokeWidth={1.7} style={{ marginRight: 5 }} />
            Edit harness.yaml
          </Button>
        </div>

        {/* harness.yaml couldn't be read */}
        {!harnessLoading && harnessError && (
          <ErrorNotice
            title="Couldn't read harness.yaml"
            details={harnessError}
            action={{ label: "Retry", onClick: loadHarness }}
          />
        )}

        {/* No harness.yaml — empty state */}
        {!harnessLoading && !harnessError && !harnessContent && (
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
              {/* Read-only: the title bar's Project menu is the one place to choose it. */}
              <div
                data-testid="compile-project-dir"
                title={projectDir || undefined}
                style={{
                  minWidth: 0, padding: "7px 10px", borderRadius: "6px",
                  background: "var(--bg-elevated)", fontSize: "12px",
                  fontFamily: projectDir ? "ui-monospace, monospace" : undefined,
                  color: projectDir ? "var(--fg-base)" : "var(--fg-subtle)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {projectDir || "No project chosen. Choose one from the Project menu in the title bar."}
              </div>

              {/* Status */}
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
            </div>

            {/* Platform targets */}
            <div>
              <SectionLabel>Surfaces</SectionLabel>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {ALL_PLATFORMS.map((platform) => {
                  const detected = detectedPlatforms.find((d) => d.platform === platform);
                  const checked = selectedTargets.has(platform);
                  return (
                    <button
                      key={platform}
                      className="hk-reset-btn"
                      aria-pressed={checked}
                      // Locked while a compile or write is in flight: the
                      // result must match the surfaces it was started for.
                      disabled={phase === "previewing" || phase === "applying"}
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
                      {surfaceLabel(platform)}
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
          <ErrorNotice
            title="Couldn't preview the compiled files"
            details={previewError}
            action={{ label: "Retry", onClick: () => void handlePreview() }}
          />
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
              <div style={{ marginTop: "8px" }}>
                <ErrorNotice
                  title="Couldn't write the compiled files"
                  details={applyError}
                  action={{ label: "Retry", onClick: () => void handleApply() }}
                />
              </div>
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
