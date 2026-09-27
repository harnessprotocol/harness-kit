import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ToastItem } from "@harness-kit/ui";
import {
  buildDriftScopes,
  collectDrift,
  driftItemKey,
  summarizeDrift,
  type DriftSummary,
  type ScopedDriftItem,
} from "./drift-data";
import { isRepairable } from "./classification";
import { FixPreviewModal } from "./FixPreviewModal";
import { DriftView } from "./DriftView";
import {
  acknowledgeDriftItem,
  migrateDriftAcknowledgements,
  unacknowledgeDriftItem,
  getAcknowledgedDriftItems,
} from "../../lib/tauri";
import { errorDetails } from "../../lib/error-details";
import { appDataDir, join as joinPath } from "@tauri-apps/api/path";
import { buildDesktopPortabilitySnapshot, type DesktopPortabilitySnapshot } from "../fleet/portability-data";
import { useProjectDir } from "../../lib/project-dir";

export type { DriftSummary };

export interface DriftPageProps {
  /** Rendered inside the Machine view (AC-18) rather than as a page. */
  embedded?: boolean;
  /**
   * Called after each successful scan and on every acknowledgement change.
   * Never before the first scan lands, and a failed scan does not report, so
   * a caller holding no summary knows Drift has not scanned.
   */
  onSummary?: (summary: DriftSummary) => void;
}

export default function DriftPage({ embedded = false, onSummary }: DriftPageProps = {}) {
  const [searchParams] = useSearchParams();
  const harnessFilter = searchParams.get("harness");
  // The title bar's project (AC-17); a change rescans.
  const [projectDir] = useProjectDir();

  const [entries, setEntries] = useState<ScopedDriftItem[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixTarget, setFixTarget] = useState<ScopedDriftItem[] | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [portability, setPortability] = useState<DesktopPortabilitySnapshot | null>(null);
  const [scanned, setScanned] = useState(false);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // Only the latest scan lands: a project change can start one while another runs.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const scopes = await buildDriftScopes(projectDir);
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
      if (seq !== loadSeq.current) return;
      setEntries(collected);
      setPortability(portabilitySnapshot);
      setAcknowledged(
        new Set(ackRows.map((a) => [a.scopeRoot, a.adapter, a.path, a.harnessName, a.slot].join("::"))),
      );
      setScanned(true);
    } catch (err) {
      if (seq === loadSeq.current) setError(errorDetails(err));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [projectDir]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!scanned || !onSummary) return;
    onSummary(summarizeDrift(entries, acknowledged));
  }, [scanned, entries, acknowledged, onSummary]);

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
      pushToast({ title: "Couldn't acknowledge", message: errorDetails(err), variant: "danger" });
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
      pushToast({ title: "Couldn't update", message: errorDetails(err), variant: "danger" });
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
