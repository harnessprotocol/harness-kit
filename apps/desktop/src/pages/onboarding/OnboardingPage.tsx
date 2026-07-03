import { useCallback, useEffect, useRef, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { importMachine } from "@harness-kit/core";
import type { ImportProjectResult } from "@harness-kit/core";
import { TauriFsProvider } from "../../lib/harness-fs";
import { writeHarnessFile, grantProjectScope } from "../../lib/tauri";
import { getCurrentProjectDir } from "../../lib/project-dir";
import { OnboardingFlow, type OnboardingStep } from "./OnboardingFlow";
import { buildSprawlReveal, type SprawlReveal } from "./onboarding-data";

export interface OnboardingPageProps {
  /** Called once the user has confirmed (write or explore read-only) — dismisses the wizard. */
  onFinish: () => void;
}

/**
 * Data-fetching wrapper for the first-run onboarding wizard (DESIGN.md
 * §6.3). Runs the real `importMachine()` scan over the Tauri FsProvider —
 * global config roots (home dir) plus the user's current project dir when
 * one is tracked (same scoping convention as FleetPage) — and feeds the
 * result to the presentational `OnboardingFlow`. Split the same way
 * FleetPage/FleetView is split so the flow can be screenshot-tested with
 * fixture data with no live backend.
 */
export default function OnboardingPage({ onFinish }: OnboardingPageProps) {
  const [step, setStep] = useState<OnboardingStep>("scan");
  const [scanSeconds, setScanSeconds] = useState<number | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportProjectResult | null>(null);
  const [reveal, setReveal] = useState<SprawlReveal | null>(null);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    startedAt.current = Date.now();

    async function runScan() {
      try {
        const home = await homeDir();
        const projectDir = getCurrentProjectDir();
        // Scan the global config root first — importProject's synthesizer
        // merges every adapter fragment it finds under a single FsProvider
        // root, so the project dir (when tracked) is scanned as a second,
        // separate pass and its findings are merged in below. This mirrors
        // Fleet's "Global + tracked project" scoping (DESIGN.md §6.3 Fleet)
        // rather than inventing a new convention for onboarding.
        const globalResult = await importMachine({ fs: new TauriFsProvider(home) });

        let combined = globalResult;
        if (projectDir && projectDir !== home) {
          try {
            // The static Tauri FS capability only lists known harness config
            // roots under $HOME — an arbitrary project dir needs its runtime
            // scope granted first (same requirement as FleetPage).
            await grantProjectScope(projectDir);
            const projectResult = await importMachine({ fs: new TauriFsProvider(projectDir) });
            combined = mergeImportResults(globalResult, projectResult);
          } catch {
            // A stale/deleted project dir, or a scope grant failure, shouldn't
            // take down the whole scan — fall back to the global-only result.
          }
        }

        if (cancelled) return;
        const elapsed = Math.max(0.1, (Date.now() - startedAt.current) / 1000);
        setScanSeconds(Math.round(elapsed * 10) / 10);
        setResult(combined);
        setReveal(buildSprawlReveal(combined));
      } catch (err) {
        if (!cancelled) setScanError(String(err));
      }
    }

    runScan();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-advance from the scan step once it completes (success or error) —
  // the error is still shown, just on the reveal-adjacent step so the user
  // isn't stuck on a permanent progress screen.
  useEffect(() => {
    if (step !== "scan") return;
    if (scanSeconds === null && scanError === null) return;
    const t = setTimeout(() => setStep("reveal"), scanError ? 0 : 500);
    return () => clearTimeout(t);
  }, [step, scanSeconds, scanError]);

  const handleAdvance = useCallback(() => {
    setStep((s) => (s === "reveal" ? "preview" : s === "preview" ? "confirm" : s));
  }, []);

  const handleWriteAndFinish = useCallback(async () => {
    if (!result) return;
    setWriting(true);
    setWriteError(null);
    try {
      await writeHarnessFile(result.harnessYaml);
      onFinish();
    } catch (err) {
      setWriteError(String(err));
    } finally {
      setWriting(false);
    }
  }, [result, onFinish]);

  const handleExploreReadOnly = useCallback(() => {
    // Nothing is written — see DESIGN.md §6.3 CTA copy. Just dismiss.
    onFinish();
  }, [onFinish]);

  return (
    <OnboardingFlow
      step={step}
      scanSeconds={scanSeconds}
      scanError={scanError}
      reveal={reveal}
      harnessYaml={result?.harnessYaml ?? null}
      writing={writing}
      writeError={writeError}
      onAdvance={handleAdvance}
      onWriteAndFinish={handleWriteAndFinish}
      onExploreReadOnly={handleExploreReadOnly}
    />
  );
}

/**
 * Merge two importMachine() results (global scope + project scope) into one
 * for display purposes: union the per-adapter findings (dedupe by file) and
 * concatenate provenance conflicts. The synthesized harnessYaml/harnessConfig
 * from the global pass is kept as the write target — this mirrors "global
 * config is the source of truth, project just adds visibility into what's
 * also configured there" rather than silently picking one scope's YAML over
 * the other.
 */
function mergeImportResults(
  a: ImportProjectResult,
  b: ImportProjectResult,
): ImportProjectResult {
  const adaptersById = new Map(a.findings.adapters.map((s) => [s.adapter, s]));
  for (const summary of b.findings.adapters) {
    const existing = adaptersById.get(summary.adapter);
    if (!existing) {
      adaptersById.set(summary.adapter, summary);
      continue;
    }
    const seenFiles = new Set(existing.found.map((f) => f.file));
    const mergedFound = [...existing.found, ...summary.found.filter((f) => !seenFiles.has(f.file))];
    const seenSkipped = new Set(existing.skipped.map((s) => s.file));
    const mergedSkipped = [...existing.skipped, ...summary.skipped.filter((s) => !seenSkipped.has(s.file))];
    adaptersById.set(summary.adapter, {
      ...existing,
      detected: existing.detected || summary.detected,
      found: mergedFound,
      skipped: mergedSkipped,
      warnings: [...new Set([...existing.warnings, ...summary.warnings])],
    });
  }

  return {
    ...a,
    findings: { adapters: [...adaptersById.values()] },
    provenance: {
      entries: [...a.provenance.entries, ...b.provenance.entries],
      conflicts: [...a.provenance.conflicts, ...b.provenance.conflicts],
    },
  };
}
