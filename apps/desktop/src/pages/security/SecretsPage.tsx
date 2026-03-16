import { useEffect, useState } from "react";
import {
  listRequiredEnv, setKeychainSecret, deleteKeychainSecret,
  readEnvConfig, writeEnvConfig,
} from "../../lib/tauri";
import type { KeychainSecretInfo, EnvConfigEntry } from "@harness-kit/shared";

function StatusBadge({ isSet }: { isSet: boolean }) {
  return (
    <span style={{
      fontSize: "10px", fontWeight: 500, padding: "1px 7px",
      borderRadius: "4px",
      background: isSet ? "rgba(22,163,74,0.1)" : "rgba(217,119,6,0.1)",
      color: isSet ? "#16a34a" : "#d97706",
      border: `1px solid ${isSet ? "rgba(22,163,74,0.25)" : "rgba(217,119,6,0.25)"}`,
    }}>
      {isSet ? "Set" : "Missing"}
    </span>
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
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-base)",
          borderRadius: "8px", padding: "10px 14px", fontSize: "13px",
          color: "var(--danger)", marginBottom: "16px",
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: "8px", border: "none", background: "none",
              color: "var(--fg-muted)", cursor: "pointer", fontSize: "11px",
            }}
          >
            dismiss
          </button>
        </div>
      )}

      {/* Secrets Vault */}
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-base)",
        borderRadius: "8px", marginBottom: "16px", overflow: "hidden",
      }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--separator)" }}>
          <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-subtle)", margin: 0 }}>
            Secrets Vault
          </p>
        </div>

        {secrets.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>
              No plugins require secrets.
            </p>
            <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: "4px 0 0" }}>
              Install plugins from the Marketplace to see their secret requirements.
            </p>
          </div>
        ) : (
          <div>
            {/* Header row */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 2fr 1fr 80px 120px",
              padding: "6px 16px", borderBottom: "1px solid var(--separator)",
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
                  <button
                    onClick={() => { setModalSecret(secret.name); setSecretValue(""); }}
                    style={{
                      fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                      border: "1px solid var(--border-base)", background: "transparent",
                      color: "var(--accent-text)", cursor: "pointer",
                    }}
                  >
                    {secret.isSet ? "Update" : "Set"}
                  </button>
                  {secret.isSet && (
                    <button
                      onClick={() => handleDeleteSecret(secret.name)}
                      style={{
                        fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                        border: "1px solid var(--border-base)", background: "transparent",
                        color: "var(--danger)", cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Set secret modal */}
      {modalSecret && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100,
        }}>
          <div style={{
            background: "var(--bg-elevated)", border: "1px solid var(--border-base)",
            borderRadius: "10px", padding: "20px", width: "380px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)", margin: "0 0 12px" }}>
              Set secret: {modalSecret}
            </p>
            <input
              type="password"
              value={secretValue}
              onChange={(e) => setSecretValue(e.target.value)}
              placeholder="Enter secret value"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSetSecret(); }}
              style={{
                width: "100%", fontSize: "13px", padding: "8px 10px",
                borderRadius: "6px", border: "1px solid var(--border-base)",
                background: "var(--bg-base)", color: "var(--fg-base)",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "14px", justifyContent: "flex-end" }}>
              <button
                onClick={() => { setModalSecret(null); setSecretValue(""); }}
                style={{
                  fontSize: "12px", padding: "6px 14px", borderRadius: "6px",
                  border: "1px solid var(--border-base)", background: "transparent",
                  color: "var(--fg-muted)", cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSetSecret}
                disabled={!secretValue || savingSecret}
                style={{
                  fontSize: "12px", fontWeight: 500, padding: "6px 14px",
                  borderRadius: "6px", border: "none",
                  background: secretValue ? "var(--accent)" : "var(--bg-surface)",
                  color: secretValue ? "#fff" : "var(--fg-subtle)",
                  cursor: secretValue ? "pointer" : "default",
                  opacity: savingSecret ? 0.6 : 1,
                }}
              >
                {savingSecret ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Environment Config */}
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-base)",
        borderRadius: "8px", overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--separator)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-subtle)", margin: 0 }}>
            Environment Config
          </p>
          {envDirty && (
            <button
              onClick={handleSaveEnv}
              style={{
                fontSize: "11px", fontWeight: 500, padding: "3px 10px",
                borderRadius: "5px", border: "none",
                background: "var(--accent)", color: "#fff", cursor: "pointer",
              }}
            >
              Save All
            </button>
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
              padding: "6px 16px", borderBottom: "1px solid var(--separator)",
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
      </div>
    </div>
  );
}
