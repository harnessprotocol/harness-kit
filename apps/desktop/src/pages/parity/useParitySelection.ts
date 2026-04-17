import { useState, useCallback } from "react";
import type { Capability } from "./capability-catalog";
import { isSelectable } from "./capability-catalog";
import type { TargetPlatform } from "@harness-kit/core";

/** Stable key for a selected cell: "targetId::capabilityId" */
export type SelectionKey = `${TargetPlatform}::${string}`;

export function makeKey(targetId: TargetPlatform, capId: string): SelectionKey {
  return `${targetId}::${capId}` as SelectionKey;
}

export interface ParitySelectionHandle {
  selected: ReadonlySet<SelectionKey>;
  toggle: (targetId: TargetPlatform, capId: string) => void;
  /** Add all missing + selectable cells for the given capability across
   *  the provided installed targets. */
  addMissingForCap: (
    cap: Capability,
    installedTargets: TargetPlatform[],
    probedFiles: Record<string, "detected" | "missing" | "not_applicable">,
  ) => void;
  clear: () => void;
  list: () => SelectionKey[];
}

export function useParitySelection(): ParitySelectionHandle {
  const [selected, setSelected] = useState<Set<SelectionKey>>(new Set());

  const toggle = useCallback(
    (targetId: TargetPlatform, capId: string) => {
      const key = makeKey(targetId, capId);
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [],
  );

  const addMissingForCap = useCallback(
    (
      cap: Capability,
      installedTargets: TargetPlatform[],
      probedFiles: Record<string, "detected" | "missing" | "not_applicable">,
    ) => {
      if (!isSelectable(cap)) return;
      setSelected((prev) => {
        const next = new Set(prev);
        for (const targetId of installedTargets) {
          const sup = cap.support[targetId];
          if (!sup?.supported) continue;
          const fileState = probedFiles[`${targetId}::${cap.id}`];
          if (fileState === "missing") {
            next.add(makeKey(targetId, cap.id));
          }
        }
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => setSelected(new Set()), []);

  const list = useCallback(
    () => Array.from(selected),
    [selected],
  );

  return { selected, toggle, addMissingForCap, clear, list };
}
