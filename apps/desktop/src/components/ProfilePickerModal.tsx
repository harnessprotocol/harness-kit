import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PROFILES } from "../lib/profiles";
import type { HarnessProfile } from "../lib/profiles";

interface ProfilePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (profile: HarnessProfile) => void;
}

export default function ProfilePickerModal({ open, onClose, onSelect }: ProfilePickerModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="profile-picker-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <motion.div
            key="profile-picker-modal"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(90%, 680px)",
              maxHeight: "82%",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-base)",
              borderRadius: "12px",
              zIndex: 210,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              borderBottom: "1px solid var(--border-base)",
              flexShrink: 0,
            }}>
              <div>
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--fg-base)" }}>
                  Choose a profile
                </p>
                <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--fg-muted)" }}>
                  Pre-configured harness.yaml for different roles. Opens in the editor for customization.
                </p>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: "24px", height: "24px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: "6px", border: "none",
                  background: "transparent", color: "var(--fg-subtle)",
                  cursor: "pointer", fontSize: "14px", flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>

            {/* Grid */}
            <div style={{
              overflowY: "auto",
              padding: "14px 16px",
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "10px",
            }}>
              {PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => onSelect(profile)}
                  onMouseEnter={() => setHovered(profile.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    padding: "14px",
                    borderRadius: "8px",
                    border: `1px solid ${hovered === profile.id ? "var(--accent)" : "var(--border-base)"}`,
                    background: hovered === profile.id ? "var(--bg-elevated)" : "var(--bg-base)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 0.1s, background 0.1s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "20px", lineHeight: 1 }}>{profile.icon}</span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)" }}>
                      {profile.name}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "11px", color: "var(--fg-muted)", lineHeight: "1.5" }}>
                    {profile.description}
                  </p>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {profile.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontSize: "9px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.3px",
                          background: "var(--bg-elevated)",
                          color: "var(--fg-subtle)",
                          border: "1px solid var(--border-base)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
