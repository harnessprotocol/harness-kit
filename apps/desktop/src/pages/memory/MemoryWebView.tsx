import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { MembrainOffline } from "../../components/memory/MembrainOffline";
import { useMembrainServerReady } from "../../hooks/useMembrainServerReady";
import { MEMBRAIN_SERVER_BASE, syncMembrainTheme } from "../../lib/membrain-api";
import { getMembrainEnabled } from "../../lib/preferences";
import MemoryLabsPreview from "./MemoryLabsPreview";

export default function MemoryWebView() {
  const location = useLocation();
  // Track enabled state locally so Enable button re-renders immediately
  const [enabled, setEnabled] = useState(getMembrainEnabled);

  const serverState = useMembrainServerReady();
  const { ready, timedOut } = serverState;

  // Sync HK palette to membrain whenever the server comes up
  useEffect(() => {
    if (ready) syncMembrainTheme();
  }, [ready]);

  // Labs gate — show teaser until the user explicitly opts in
  if (!enabled) {
    return <MemoryLabsPreview onEnable={() => setEnabled(true)} />;
  }

  if (timedOut) {
    return <MembrainOffline serverState={serverState} />;
  }

  if (!ready) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--fg-subtle)",
          fontSize: 13,
        }}
      >
        Connecting to membrain...
      </div>
    );
  }

  // Strip /memory prefix to get the membrain SvelteKit path.
  // Validate against known routes to prevent path injection.
  const ALLOWED_PREFIXES = [
    "/",
    "/graph",
    "/explore",
    "/entities",
    "/knowledge",
    "/context",
    "/trace",
    "/settings",
  ];
  const rawPath = location.pathname.replace(/^\/memory/, "") || "/";
  const path = ALLOWED_PREFIXES.some((p) => rawPath === p || rawPath.startsWith(p + "/"))
    ? rawPath
    : "/";
  const src = `${MEMBRAIN_SERVER_BASE}${path}`;

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <iframe
        key={src}
        src={src}
        sandbox="allow-scripts allow-same-origin allow-forms"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
        }}
        title="membrain"
      />
    </div>
  );
}
