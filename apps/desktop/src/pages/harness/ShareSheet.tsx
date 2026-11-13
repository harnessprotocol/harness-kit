import { Component, useId, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { Button, ErrorNotice, Modal } from "@harness-kit/ui";
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
export default function ShareSheet(props: ShareSheetProps) {
  return (
    <ShareBoundary resetKey={props.config} onClose={props.onClose} open={props.open}>
      <ShareSheetInner {...props} />
    </ShareBoundary>
  );
}

/** A render error in the sheet must not unmount the page and its unsaved buffer. */
class ShareBoundary extends Component<
  { resetKey: unknown; open: boolean; onClose: () => void; children: ReactNode },
  { failed: boolean; key: unknown }
> {
  state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: { resetKey: unknown }, state: { failed: boolean; key: unknown }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  componentDidCatch(error: unknown) {
    console.error("[ShareSheet]", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Modal open={this.props.open} onClose={this.props.onClose} title="Share this profile">
        <ErrorNotice title="Couldn't build the share" details="Your YAML is untouched. Fix it in the editor and try again." />
      </Modal>
    );
  }
}

function ShareSheetInner({ open, onClose, config }: ShareSheetProps) {
  const toast = useToast();
  const [kind, setKind] = useState<ShareKind>("harness-yaml");
  const [saving, setSaving] = useState(false);
  const tabsId = useId();

  const built = useMemo(() => {
    if (!open) return null;
    try {
      return { share: buildProfileShare(config), prompt: buildProfilePrompt(config), error: null };
    } catch (e) {
      return { share: null, prompt: "", error: errorDetails(e) };
    }
  }, [open, config]);
  if (!built) return null;
  if (!built.share) {
    return (
      <Modal open={open} onClose={onClose} title="Share this profile">
        <ErrorNotice title="Couldn't build the share" details={built.error ?? undefined} />
      </Modal>
    );
  }
  const share = built.share;
  const prompt = built.prompt;

  const text = kind === "harness-yaml" ? share.yaml : prompt;
  const tab = TABS.find((t) => t.kind === kind)!;
  const rawName = config.metadata?.name as unknown;
  const name = (typeof rawName === "string" || typeof rawName === "number" ? String(rawName).trim() : "") || "harness";

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
