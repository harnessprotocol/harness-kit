import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useChat } from "../../context/ChatContext";
import ServerConnect from "./ServerConnect";
import ChatLobby from "./ChatLobby";
import ChatRoom from "./ChatRoom";

const PANEL_WIDTH = 340;

const variants = {
  hidden: { x: PANEL_WIDTH },
  visible: { x: 0 },
};

export default function ChatPanel() {
  const { isOpen, setOpen, state } = useChat();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, setOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="chat-panel"
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={variants}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: PANEL_WIDTH,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-sidebar)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderLeft: "1px solid var(--border-base)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {/* Panel header */}
          <div
            style={{
              flexShrink: 0,
              height: "38px",
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              borderBottom: "1px solid var(--separator)",
              gap: "6px",
            }}
          >
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--fg-base)",
                flex: 1,
              }}
            >
              Chat
            </span>
            {state.status !== "disconnected" && state.status !== "connecting" && (
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: state.status === "in_room" ? "var(--success)" : "var(--fg-subtle)",
                  flexShrink: 0,
                }}
              />
            )}
          </div>

          {/* Content */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            {state.status === "disconnected" && <ServerConnect />}

            {state.status === "connecting" && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  color: "var(--fg-subtle)",
                }}
              >
                Connecting…
              </div>
            )}

            {state.status === "connected" && <ChatLobby />}

            {state.status === "in_room" && <ChatRoom />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
