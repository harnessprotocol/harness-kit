import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ToastItem } from "@harness-kit/ui";
import { buildDriftScopes, collectDrift, driftItemKey, type ScopedDriftItem } from "./drift-data";
import { isRepairable } from "./classification";
import { FixPreviewModal } from "./FixPreviewModal";
import { DriftView } from "./DriftView";
import {
  acknowledgeDriftItem,
  unacknowledgeDriftItem,
  getAcknowledgedDriftItems,
} from "../../lib/tauri";

export default function DriftPage() {
  const [searchParams] = useSearchParams();
  const harnessFilter = searchParams.get("harness");

  const [entries, setEntries] = useState<ScopedDriftItem[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixTarget, setFixTarget] = useState<ScopedDriftItem[] | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

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
      const [collected, ackRows] = await Promise.all([
        collectDrift(scopes),
        getAcknowledgedDriftItems().catch(() => []),
      ]);
      setEntries(collected);
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
