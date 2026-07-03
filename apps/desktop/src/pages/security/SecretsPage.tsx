import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button, Card, EmptyState, Input, Modal, StatusChip } from "@harness-kit/ui";
import {
  listRequiredEnv, setKeychainSecret, deleteKeychainSecret,
  readEnvConfig, writeEnvConfig,
} from "../../lib/tauri";
import type { KeychainSecretInfo, EnvConfigEntry } from "@harness-kit/shared";

function StatusBadge({ isSet }: { isSet: boolean }) {
  return (
    <StatusChip variant={isSet ? "success" : "warning"}>
      {isSet ? "Set" : "Missing"}
    </StatusChip>
  );
}

export default function SecretsPage() {
  const [secrets, setSecrets] = useState<KeychainSecretInfo[]>([]);
  const [envConfig, setEnvConfig] = useState<EnvConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalSecret, setModalSecret] = useState<string | null>(null);
  const [secretValue, setSecretValue] = useState("");
  const [savingSecret, setSavingSecret] = useState(false);
  const [envDirty, setEnvDirty] = useState(false);

  useEffect(() => {
    Promise.all([
      listRequiredEnv(),
      readEnvConfig(),
    ])
      .then(([secretList, envList]) => {
        setSecrets(secretList);
        setEnvConfig(envList);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!modalSecret) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setModalSecret(null);
        setSecretValue("");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalSecret]);

  async function handleSetSecret() {
    if (!modalSecret || !secretValue) return;
    setSavingSecret(true);
    try {
      await setKeychainSecret(modalSecret, secretValue);
      setSecrets((prev) =>
        prev.map((s) =>
          s.name === modalSecret ? { ...s, isSet: true } : s,
        ),
      );
      setModalSecret(null);
      setSecretValue("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingSecret(false);
    }
  }

  async function handleDeleteSecret(name: string) {
    try {
      await deleteKeychainSecret(name);
      setSecrets((prev) =>
        prev.map((s) =>
          s.name === name ? { ...s, isSet: false } : s,
        ),
      );
    } catch (e) {
      setError(String(e));
    }
  }

  function updateEnvValue(index: number, value: string) {
    setEnvConfig((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], value };
      return next;
    });
    setEnvDirty(true);
  }

  async function handleSaveEnv() {
    try {
      await writeEnvConfig(envConfig);
      setEnvDirty(false);
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "20px 24px" }}>
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
          Secrets
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          Manage API keys and environment configuration. Secrets are stored in macOS Keychain.
        </p>
      </div>

      {error && (
        <Card padding="sm" style={{ fontSize: "13px", color: "var(--danger)", marginBottom: "16px" }}>
          {error}
          <button
            className="hk-reset-btn"
            onClick={() => setError(null)}
            style={{ marginLeft: "8px", color: "var(--fg-muted)", cursor: "pointer", fontSize: "11px" }}
          >
            dismiss
          </button>
        </Card>
      )}

      {/* Secrets Vault */}
      <Card padding="none" style={{ marginBottom: "16px", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-subtle)", margin: 0 }}>
            Secrets Vault
          </p>
        </div>

        {secrets.length === 0 ? (
          <EmptyState
            icon={<KeyRound size={28} strokeWidth={1.5} />}
            title="No plugins require secrets"
            description="Install plugins from the Marketplace to see their secret requirements."
          />
        ) : (
          <div>
            {/* Header row */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 2fr 1fr 80px 120px",
              padding: "6px 16px", borderBottom: "1px solid var(--border-subtle)",
              fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.05em", color: "var(--fg-subtle)",
            }}>
              <span>Name</span>
              <span>Description</span>
              <span>Plugin</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {secrets.map((secret) => (
              <div
                key={secret.name}
                className="row-list-item"
                style={{
                  display: "grid", gridTemplateColumns: "1fr 2fr 1fr 80px 120px",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 500, fontFamily: "ui-monospace, monospace", color: "var(--fg-base)" }}>
                  {secret.name}
                </span>
                <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>
                  {secret.description}
                </span>
                <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                  {secret.pluginName ?? "-"}
                </span>
                <StatusBadge isSet={secret.isSet} />
                <div style={{ display: "flex", gap: "6px" }}>
                  <Button variant="ghost" size="sm" onClick={() => { setModalSecret(secret.name); setSecretValue(""); }}>
                    {secret.isSet ? "Update" : "Set"}
                  </Button>
                  {secret.isSet && (
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteSecret(secret.name)} style={{ color: "var(--danger)" }}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Set secret modal */}
      <Modal
        open={!!modalSecret}
        onClose={() => { setModalSecret(null); setSecretValue(""); }}
        title={`Set secret: ${modalSecret ?? ""}`}
        footer={
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => { setModalSecret(null); setSecretValue(""); }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSetSecret} disabled={!secretValue || savingSecret}>
              {savingSecret ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <Input
          type="password"
          value={secretValue}
          onChange={(e) => setSecretValue(e.target.value)}
          placeholder="Enter secret value"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") handleSetSecret(); }}
        />
      </Modal>

      {/* Environment Config */}
      <Card padding="none" style={{ overflow: "hidden" }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-subtle)", margin: 0 }}>
            Environment Config
          </p>
          {envDirty && (
            <Button variant="primary" size="sm" onClick={handleSaveEnv}>
              Save All
            </Button>
          )}
        </div>

        {envConfig.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>
              No environment variables configured.
            </p>
            <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: "4px 0 0" }}>
              Non-sensitive config is stored in ~/.harness-kit/env.json
            </p>
          </div>
        ) : (
          <div>
            {/* Header row */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr 1.5fr",
              padding: "6px 16px", borderBottom: "1px solid var(--border-subtle)",
              fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.05em", color: "var(--fg-subtle)",
            }}>
              <span>Name</span>
              <span>Description</span>
              <span>Plugin</span>
              <span>Value</span>
            </div>

            {envConfig.map((entry, index) => (
              <div
                key={entry.name}
                className="row-list-item"
                style={{
                  display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr 1.5fr",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 500, fontFamily: "ui-monospace, monospace", color: "var(--fg-base)" }}>
                  {entry.name}
                </span>
                <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>
                  {entry.description}
                </span>
                <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                  {entry.pluginName ?? "-"}
                </span>
                <input
                  value={entry.value}
                  onChange={(e) => updateEnvValue(index, e.target.value)}
                  onBlur={() => { if (envDirty) handleSaveEnv(); }}
                  style={{
                    fontSize: "11px", padding: "3px 6px", borderRadius: "4px",
                    border: "1px solid var(--border-base)",
                    background: "var(--bg-base)", color: "var(--fg-base)",
                    width: "100%",
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
