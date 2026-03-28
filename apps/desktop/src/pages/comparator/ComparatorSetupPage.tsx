import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { detectHarnesses, checkGitRepo, getComparisonSetup } from "../../lib/tauri";
import HarnessSelector, { type SelectedHarness } from "../../components/comparator/HarnessSelector";
import type { HarnessInfo, GitRepoInfo } from "@harness-kit/shared";

function getDefaultModel(h: HarnessInfo): string {
  return h.defaultModel ?? h.models?.[0] ?? "";
}

export default function ComparatorSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([]);
  const [selected, setSelected] = useState<SelectedHarness[]>([]);
  const [prompt, setPrompt] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Git state
  const [gitInfo, setGitInfo] = useState<GitRepoInfo | null>(null);
  const [pinToCommit, setPinToCommit] = useState(true);
  const [gitChecking, setGitChecking] = useState(false);

  // Replay state
  const replayFrom = (location.state as { replayFrom?: string } | null)?.replayFrom;
  const [replayDate, setReplayDate] = useState<string | null>(null);

  const runDetection = useCallback(async () => {
    try {
      const h = await detectHarnesses();
      setHarnesses(h);
      return h;
    } catch (e) {
      setError(String(e));
      return [];
    }
  }, []);

  useEffect(() => {
    runDetection()
      .then((h) => {
        const first = h.find((x) => x.available && x.authenticated);
        if (first) {
          setSelected([{ harnessId: first.id, model: getDefaultModel(first) }]);
        }
      })
      .finally(() => setLoading(false));
  }, [runDetection]);

  // Handle replay pre-fill
  useEffect(() => {
    if (!replayFrom) return;
    getComparisonSetup(replayFrom)
      .then((setup) => {
        setPrompt(setup.prompt);
        setWorkingDir(setup.workingDir);
        setSelected(
          setup.panels.map((p) => {
            const h = harnesses.find((x) => x.id === p.harnessId);
            return {
              harnessId: p.harnessId,
              model: p.model || (h ? getDefaultModel(h) : ""),
            };
          }),
        );
        setReplayDate(new Date().toLocaleDateString());
      })
      .catch((e) => console.error("Failed to load replay:", e));
  }, [replayFrom, harnesses]);

  // Check git repo when working directory changes
  useEffect(() => {
    if (!workingDir.trim()) {
      setGitInfo(null);
      return;
    }
    const timeout = setTimeout(() => {
      setGitChecking(true);
      checkGitRepo(workingDir.trim())
        .then(setGitInfo)
        .catch(() => setGitInfo(null))
        .finally(() => setGitChecking(false));
    }, 500); // debounce
    return () => clearTimeout(timeout);
  }, [workingDir]);

  const handleToggle = useCallback(
    (harnessId: string) => {
      setSelected((prev) => {
        const exists = prev.find((s) => s.harnessId === harnessId);
        if (exists) return prev.filter((s) => s.harnessId !== harnessId);
        if (prev.length >= 4) return prev;
        const h = harnesses.find((x) => x.id === harnessId);
        return [...prev, { harnessId, model: h ? getDefaultModel(h) : "" }];
      });
    },
    [harnesses],
  );

  const handleModelChange = useCallback((harnessId: string, model: string) => {
    setSelected((prev) =>
      prev.map((s) => (s.harnessId === harnessId ? { ...s, model } : s)),
    );
  }, []);

  const handleRun = () => {
    if (!prompt.trim() || selected.length === 0) return;
    const comparisonId = crypto.randomUUID();
    const pinnedCommit =
      gitInfo?.isGitRepo && pinToCommit ? gitInfo.currentCommit : null;
    navigate(`/comparator/run/${comparisonId}`, {
      state: {
        prompt: prompt.trim(),
        workingDir: workingDir.trim(),
        selected,
        pinnedCommit,
      },
    });
  };

  const handleRedetect = useCallback(async () => {
    setDetecting(true);
    setError(null);
    try {
      const h = await runDetection();
      // Remove any selected harnesses that are no longer available/authenticated
      setSelected((prev) =>
        prev.filter((s) => {
          const info = h.find((x) => x.id === s.harnessId);
          return info?.available && info?.authenticated;
        }),
      );
    } finally {
      setDetecting(false);
    }
  }, [runDetection]);

  const canRun = prompt.trim().length > 0 && selected.length > 0;

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Header */}
      <h1 className="text-title" style={{ margin: "0 0 4px" }}>
        New Comparison
      </h1>
      <p className="text-caption" style={{ margin: "0 0 24px" }}>
        Run the same prompt across multiple AI tools and compare results side by side.
      </p>

      {/* Replay banner */}
      {replayFrom && replayDate && (
        <div
          style={{
            padding: "8px 12px",
            marginBottom: "16px",
            borderRadius: "6px",
            background: "var(--accent-light)",
            color: "var(--accent-text)",
            fontSize: "12px",
          }}
        >
          Replaying comparison from {replayDate}
        </div>
      )}

      {/* Two-column form grid */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 2fr) minmax(300px, 3fr)", gap: "32px", alignItems: "start" }}>
        {/* Left: Harness selector + Working directory */}
        <div>
          {/* Harness selector */}
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <label className="text-label">
                Select Tools (1-4)
              </label>
              {!loading && (
                <button
                  className="btn"
                  onClick={handleRedetect}
                  disabled={detecting}
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    opacity: detecting ? 0.6 : 1,
                  }}
                >
                  {detecting ? "Detecting..." : "Re-detect"}
                </button>
              )}
            </div>
            {(loading || detecting) && <p className="text-caption">Detecting available tools...</p>}
            {error && <p style={{ color: "var(--danger)", fontSize: "12px" }}>{error}</p>}
            {!loading && <HarnessSelector harnesses={harnesses} selected={selected} onToggle={handleToggle} onModelChange={handleModelChange} />}
          </div>

          {/* Working directory */}
          <div style={{ marginBottom: "24px" }}>
            <label className="text-label" style={{ display: "block", marginBottom: "8px" }}>
              Working Directory
            </label>
            <input
              type="text"
              className="form-input"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder="/path/to/project"
            />
            <p className="text-caption" style={{ marginTop: "4px" }}>
              Optional. The directory each tool runs in.
            </p>

            {/* Git info */}
            {gitChecking && (
              <p className="text-caption" style={{ marginTop: "6px" }}>
                Checking git status...
              </p>
            )}
            {gitInfo && !gitChecking && (
              <div style={{ marginTop: "8px" }}>
                {gitInfo.isGitRepo ? (
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-base)",
                      fontSize: "11px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ color: "var(--success)", fontWeight: 600 }}>Git repo</span>
                      {gitInfo.branch && (
                        <span style={{ color: "var(--fg-muted)" }}>
                          branch: <code style={{ fontFamily: "ui-monospace, monospace" }}>{gitInfo.branch}</code>
                        </span>
                      )}
                      {gitInfo.currentCommit && (
                        <span style={{ color: "var(--fg-subtle)", fontFamily: "ui-monospace, monospace" }}>
                          {gitInfo.currentCommit.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "pointer",
                        color: "var(--fg-muted)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={pinToCommit}
                        onChange={(e) => setPinToCommit(e.target.checked)}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      Pin to current commit (each tool runs in an isolated worktree)
                    </label>
                  </div>
                ) : (
                  <p style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                    Not a git repo — tools will share the working directory.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Prompt + Run button */}
        <div>
          {/* Prompt */}
          <div style={{ marginBottom: "24px" }}>
            <label className="text-label" style={{ display: "block", marginBottom: "8px" }}>
              Prompt
            </label>
            <textarea
              className="form-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey && canRun) handleRun();
              }}
              placeholder="Enter the prompt to send to each tool..."
              rows={6}
            />
            <p className="text-caption" style={{ marginTop: "4px" }}>
              Cmd+Enter to run
            </p>
          </div>

          {/* Run button */}
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={!canRun}
            style={{ fontSize: "13px", padding: "8px 24px", borderRadius: "8px" }}
          >
            Run Comparison
          </button>
        </div>
      </div>
    </div>
  );
}
