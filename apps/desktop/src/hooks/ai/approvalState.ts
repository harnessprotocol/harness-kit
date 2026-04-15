/**
 * Promise-based approval state for write-tool gating.
 *
 * Usage:
 *   const { requestApproval, resolve, resolveAll } = useApprovalState();
 *
 *   // In dispatch:
 *   const approved = await requestApproval(rowId, summary);
 *
 *   // In WriteApprovalRow:
 *   resolve(rowId, true);   // user clicked Approve
 *   resolve(rowId, false);  // user clicked Deny
 *
 *   // On unmount or cancel:
 *   resolveAll(false);
 */

import { useRef, useCallback } from 'react';

interface PendingApproval {
  resolve: (approved: boolean) => void;
}

export function useApprovalState() {
  const pending = useRef<Map<string, PendingApproval>>(new Map());

  const requestApproval = useCallback((rowId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      pending.current.set(rowId, { resolve });
    });
  }, []);

  const resolve = useCallback((rowId: string, approved: boolean) => {
    const entry = pending.current.get(rowId);
    if (entry) {
      entry.resolve(approved);
      pending.current.delete(rowId);
    }
  }, []);

  const resolveAll = useCallback((approved: boolean) => {
    for (const entry of pending.current.values()) {
      entry.resolve(approved);
    }
    pending.current.clear();
  }, []);

  return { requestApproval, resolve, resolveAll };
}

export type ApprovalState = ReturnType<typeof useApprovalState>;
