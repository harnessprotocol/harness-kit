import { useId, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { Button, Modal } from "@harness-kit/ui";
import { buildProfilePrompt, buildProfileShare } from "@harness-kit/core";
import type { HarnessConfig } from "@harness-kit/core";
import { saveShareFile } from "../../lib/tauri";
import { errorDetails } from "../../lib/error-details";
import { useToast } from "../../components/ToastProvider";

type ShareKind = "harness-yaml" | "agent-prompt";

const TABS: Array<{ kind: ShareKind; label: string; hint: string; fileLabel: string }> = [
  {
    kind: "harness-yaml",
    label: "harness.yaml",
    hint: "The profile with detected secrets replaced by variable references. Read it before you send it.",
    fileLabel: "harness.yaml",
  },
  {
    kind: "agent-prompt",
    label: "Agent prompt",
    hint: "A prompt that has another agent set this profile up on its machine.",
    fileLabel: "agent prompt",
  },
];

const tabStyle = (active: boolean): CSSProperties => ({
  fontSize: "13px",
  fontWeight: active ? 600 : 400,
  padding: "5px 12px",
  borderRadius: "6px",
  background: active ? "var(--bg-surface)" : "transparent",
  color: active ? "var(--fg-base)" : "var(--fg-subtle)",
  boxShadow: active ? "var(--shadow-sm)" : "none",
  cursor: "pointer",
});

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  config: HarnessConfig;
}

/** The Share sheet (AC-25): the sanitized harness.yaml and the agent prompt, each to copy or save. */
export default function ShareSheet({ open, onClose, config }: ShareSheetProps) {
  const toast = useToast();
  const [kind, setKind] = useState<ShareKind>("harness-yaml");
  const [saving, setSaving] = useState(false);
  const tabsId = useId();

  const share = useMemo(() => (open ? buildProfileShare(config) : null), [open, config]);
  const prompt = useMemo(() => (open ? buildProfilePrompt(config) : ""), [open, config]);
  if (!share) return null;

  const text = kind === "harness-yaml" ? share.yaml : prompt;
  const tab = TABS.find((t) => t.kind === kind)!;
  const name = config.metadata?.name?.trim() || "harness";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `Copied the ${tab.fileLabel}`, variant: "success" });
    } catch (e) {
      toast({ title: "Couldn't copy to the clipboard", message: errorDetails(e), variant: "danger" });
    }
  }

  async function save() {
    setSaving(true);
    try {
      const path = await saveShareFile(kind, name, text);
      // null: the user cancelled the dialog. Nothing to report.
      if (path !== null) toast({ title: `Saved the ${tab.fileLabel}`, message: path, variant: "success" });
    } catch (e) {
      toast({ title: `Couldn't save the ${tab.fileLabel}`, message: errorDetails(e), variant: "danger" });
    } finally {
      setSaving(false);
    }
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = TABS[(TABS.findIndex((t) => t.kind === kind) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setKind(next.kind);
    document.getElementById(`${tabsId}-${next.kind}`)?.focus();
  }

  return (
    <Modal open={open} onClose={onClose} title="Share this profile">
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div
          role="tablist"
          aria-label="What to share"
          style={{ display: "inline-flex", gap: "2px", padding: "2px", borderRadius: "8px", background: "var(--bg-base)", alignSelf: "flex-start" }}
        >
          {TABS.map((t) => (
            <button
              key={t.kind}
              id={`${tabsId}-${t.kind}`}
              type="button"
              role="tab"
              aria-selected={kind === t.kind}
              aria-controls={`${tabsId}-panel`}
              tabIndex={kind === t.kind ? 0 : -1}
              className="hk-reset-btn"
              onClick={() => setKind(t.kind)}
              onKeyDown={onTabKeyDown}
              style={tabStyle(kind === t.kind)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${kind}`} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>{tab.hint}</p>

          <pre
            tabIndex={0}
            aria-label={`${tab.fileLabel} to share`}
            style={{
              margin: 0,
              maxHeight: "280px",
              overflow: "auto",
              padding: "10px 12px",
              borderRadius: "8px",
              background: "var(--bg-base)",
              color: "var(--fg-base)",
              fontFamily: "ui-monospace, monospace",
              fontSize: "11px",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {text}
          </pre>

          <div data-testid="share-findings" style={{ fontSize: "13px", color: "var(--fg-muted)" }}>
            {share.findings.length === 0 ? (
              <span>No secret values were detected. Detection is heuristic, so read it before sending.</span>
            ) : (
              <>
                <span>
                  {share.findings.length === 1 ? "1 secret was replaced:" : `${share.findings.length} secrets were replaced:`}
                </span>
                <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
                  {share.findings.map((f) => (
                    <li key={`${f.path}-${f.variable}`}>
                      <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px" }}>{f.variable}</code>
                      <span> for {f.path}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <Button variant="primary" onClick={() => void copy()}>
              Copy
            </Button>
            <Button variant="ghost" onClick={() => void save()} disabled={saving}>
              Save file…
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
