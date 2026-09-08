import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ToastItem } from "@harness-kit/ui";
import { buildDriftScopes, collectDrift, driftItemKey, type ScopedDriftItem } from "./drift-data";
import { isRepairable } from "./classification";
import { FixPreviewModal } from "./FixPreviewModal";
import { DriftView } from "./DriftView";
import {
  acknowledgeDriftItem,
  migrateDriftAcknowledgements,
  unacknowledgeDriftItem,
  getAcknowledgedDriftItems,
} from "../../lib/tauri";
import { appDataDir, join as joinPath } from "@tauri-apps/api/path";
import { buildDesktopPortabilitySnapshot, type DesktopPortabilitySnapshot } from "../fleet/portability-data";

export default function DriftPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [searchParams] = useSearchParams();
  const harnessFilter = searchParams.get("harness");

  const [entries, setEntries] = useState<ScopedDriftItem[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixTarget, setFixTarget] = useState<ScopedDriftItem[] | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [portability, setPortability] = useState<DesktopPortabilitySnapshot | null>(null);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const scopes = await buildDriftScopes();
      const home = scopes.find((scope) => scope.kind === "global")?.root;
      const project = scopes.find((scope) => scope.kind === "project")?.root;
      // AC-37: acknowledgements moved to the shared harness.db. Copy anything
      // the desktop's own database still holds BEFORE reading, so a user who
      // acknowledged items before the move does not see them all resurface.
      // Idempotent, never deletes the source, and a failure here must not
      // stop drift from rendering — worst case some items reappear.
      await appDataDir()
        .then((dir) => joinPath(dir, "comparator.db"))
        .then((legacy) => migrateDriftAcknowledgements(legacy))
        .catch(() => 0);
      const [collected, ackRows, portabilitySnapshot] = await Promise.all([
        collectDrift(scopes),
        getAcknowledgedDriftItems().catch(() => []),
        home ? buildDesktopPortabilitySnapshot(home, project) : Promise.resolve(null),
      ]);
      setEntries(collected);
      setPortability(portabilitySnapshot);
      setAcknowledged(
        new Set(ackRows.map((a) => [a.scopeRoot, a.adapter, a.path, a.harnessName, a.slot].join("::"))),
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (harnessFilter ? entries.filter((e) => e.item.adapter === harnessFilter) : entries),
    [entries, harnessFilter],
  );

  async function handleAcknowledge(entry: ScopedDriftItem) {
    const key = driftItemKey(entry.scope, entry.item);
    try {
      await acknowledgeDriftItem({
        scopeRoot: entry.scope.root,
        adapter: entry.item.adapter,
        path: entry.item.path,
        harnessName: entry.item.harnessName,
        slot: entry.item.slot,
      });
      setAcknowledged((prev) => new Set(prev).add(key));
      pushToast({ title: "Acknowledged", message: entry.item.path, variant: "info" });
    } catch (err) {
      pushToast({ title: "Couldn't acknowledge", message: String(err), variant: "danger" });
    }
  }

  async function handleUnacknowledge(entry: ScopedDriftItem) {
    const key = driftItemKey(entry.scope, entry.item);
    try {
      await unacknowledgeDriftItem({
        scopeRoot: entry.scope.root,
        adapter: entry.item.adapter,
        path: entry.item.path,
        harnessName: entry.item.harnessName,
        slot: entry.item.slot,
      });
      setAcknowledged((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } catch (err) {
      pushToast({ title: "Couldn't update", message: String(err), variant: "danger" });
    }
  }

  function handleFixApplied() {
    pushToast({ title: "Fix applied", message: "Re-scanning…", variant: "success" });
    load();
  }

  return (
    <>
      <DriftView
      embedded={embedded}
             entries={entries}
        filteredEntries={filtered}
        acknowledged={acknowledged}
        loading={loading}
        error={error}
        harnessFilter={harnessFilter}
        showAcknowledged={showAcknowledged}
        toasts={toasts}
        onToggleShowAcknowledged={() => setShowAcknowledged((v) => !v)}
        onFixAll={() => setFixTarget(filtered.filter((e) => isRepairable(e.item.class)))}
        onFixOne={(entry) => setFixTarget([entry])}
        onAcknowledge={handleAcknowledge}
        onUnacknowledge={handleUnacknowledge}
        onRescan={load}
        onDismissToast={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        portability={portability}
      />

      <FixPreviewModal
        open={fixTarget !== null}
        targets={fixTarget ?? []}
        onClose={() => setFixTarget(null)}
        onApplied={handleFixApplied}
      />
    </>
  );
}
