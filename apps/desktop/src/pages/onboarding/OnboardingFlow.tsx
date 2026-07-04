import { lazy, Suspense } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Button, Card, StatusChip } from "@harness-kit/ui";
import type { SprawlReveal } from "./onboarding-data";

const MonacoEditor = lazy(() => import("../../components/plugin-explorer/MonacoEditor"));

export type OnboardingStep = "scan" | "reveal" | "preview" | "confirm";

export interface OnboardingFlowProps {
  step: OnboardingStep;
  /** Elapsed scan time in seconds, shown once the scan completes. */
  scanSeconds: number | null;
  scanError: string | null;
  reveal: SprawlReveal | null;
  harnessYaml: string | null;
  writing: boolean;
  writeError: string | null;
  onAdvance: () => void;
  onWriteAndFinish: () => void;
  onExploreReadOnly: () => void;
}

/**
 * Full-bleed first-run onboarding wizard (DESIGN.md §6.3). No app sidebar —
 * this is a standalone sequence: scan -> sprawl reveal -> harness.yaml
 * preview -> confirm. Purely presentational; all scan/import data is passed
 * in from OnboardingPage so this can also be rendered against fixture data
 * for Playwright screenshots.
 */
export function OnboardingFlow({
  step,
  scanSeconds,
  scanError,
  reveal,
  harnessYaml,
  writing,
  writeError,
  onAdvance,
  onWriteAndFinish,
  onExploreReadOnly,
}: OnboardingFlowProps) {
  return (
    <div className="hk-onboard-shell">
      <div className="hk-onboard-frame">
        {step === "scan" && <ScanStep scanSeconds={scanSeconds} scanError={scanError} />}
        {step === "reveal" && reveal && <RevealStep reveal={reveal} onAdvance={onAdvance} />}
        {step === "preview" && (
          <PreviewStep harnessYaml={harnessYaml} reveal={reveal} onAdvance={onAdvance} />
        )}
        {step === "confirm" && (
          <ConfirmStep
            reveal={reveal}
            writing={writing}
            writeError={writeError}
            onWriteAndFinish={onWriteAndFinish}
            onExploreReadOnly={onExploreReadOnly}
          />
        )}
      </div>
    </div>
  );
}

// ── Step 1: Scan progress ──────────────────────────────────────────

function ScanStep({ scanSeconds, scanError }: { scanSeconds: number | null; scanError: string | null }) {
  const done = scanSeconds !== null || scanError !== null;
  return (
    <div className="hk-onboard-scan">
      <div className="hk-onboard-eyebrow" data-pulsing={!done}>
        <Search size={14} strokeWidth={1.7} />
        <span>{done ? "Scan complete" : "Scanning your machine…"}</span>
      </div>
      <h1 className="hk-onboard-scan-title">
        {scanError
          ? "Machine scan hit a snag"
          : done
            ? `Machine scan complete · ${scanSeconds}s`
            : "Reading your existing harness configs"}
      </h1>
      {scanError ? (
        <p className="hk-onboard-scan-sub" data-error="true">
          {scanError}
        </p>
      ) : (
        <p className="hk-onboard-scan-sub">
          Looking for Claude Code, Cursor, Copilot, and other AI coding tool configs already on this machine.
        </p>
      )}
    </div>
  );
}

// ── Step 2: The sprawl reveal ───────────────────────────────────────

function RevealStep({ reveal, onAdvance }: { reveal: SprawlReveal; onAdvance: () => void }) {
  const { stats, convergence, conflicts, isLowHarnessCount } = reveal;

  const headline = isLowHarnessCount
    ? stats.harnessesFound === 0
      ? "No harness configs found yet."
      : `You run ${stats.harnessesFound} harness. Nothing to reconcile yet.`
    : `You run ${stats.harnessesFound} harnesses. `;

  return (
    <div className="hk-onboard-reveal">
      <h1 className="hk-onboard-headline">
        {isLowHarnessCount ? (
          headline
        ) : (
          <>
            {headline}
            <span className="hk-onboard-headline-accent">They don&apos;t agree.</span>
          </>
        )}
      </h1>
      <p className="hk-onboard-lede">
        We read the config you already have — no authoring required.
      </p>

      <div className="hk-onboard-stat-row">
        <Card className="hk-onboard-stat-tile">
          <div className="hk-onboard-stat-value">{stats.harnessesFound}</div>
          <div className="hk-onboard-stat-label">Harnesses found</div>
        </Card>
        <Card className="hk-onboard-stat-tile">
          <div className="hk-onboard-stat-value">{stats.configFiles}</div>
          <div className="hk-onboard-stat-label">Config files</div>
        </Card>
        <Card className="hk-onboard-stat-tile">
          <div className="hk-onboard-stat-value" data-tone="warning">
            {stats.overlappingInstructionSets}
          </div>
          <div className="hk-onboard-stat-label">Overlapping instructions</div>
        </Card>
        <Card className="hk-onboard-stat-tile">
          <div className="hk-onboard-stat-value" data-tone="danger">
            {stats.directConflicts}
          </div>
          <div className="hk-onboard-stat-label">Direct conflicts</div>
        </Card>
      </div>

      <ConvergenceMap convergence={convergence} isLowHarnessCount={isLowHarnessCount} />

      {conflicts.length > 0 ? (
        <div className="hk-onboard-conflicts">
          <div className="hk-onboard-section-label">What disagrees</div>
          <div className="hk-onboard-conflicts-list">
            {conflicts.map((c) => (
              <div className="hk-onboard-conflict-row" key={c.field}>
                <StatusChip variant="warning">Conflict</StatusChip>
                <span className="hk-onboard-conflict-text">{c.description}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        !isLowHarnessCount && (
          <div className="hk-onboard-conflicts">
            <div className="hk-onboard-section-label">What disagrees</div>
            <p className="hk-onboard-conflicts-empty">
              No direct conflicts found — your tools overlap but don&apos;t contradict each other.
            </p>
          </div>
        )
      )}

      <div className="hk-onboard-actions">
        <Button variant="primary" onClick={onAdvance}>
          Preview harness.yaml <ArrowRight size={14} strokeWidth={1.7} />
        </Button>
      </div>
    </div>
  );
}

function ConvergenceMap({
  convergence,
  isLowHarnessCount,
}: {
  convergence: SprawlReveal["convergence"];
  isLowHarnessCount: boolean;
}) {
  const { sources, destination } = convergence;

  if (sources.length === 0) {
    return (
      <div className="hk-onboard-convergence">
        <div className="hk-onboard-section-label">Convergence</div>
        <p className="hk-onboard-conflicts-empty">
          Nothing detected to converge yet — once you install a harness, this map fills in.
        </p>
      </div>
    );
  }

  return (
    <div className="hk-onboard-convergence">
      <div className="hk-onboard-section-label">
        {isLowHarnessCount ? "What we found" : "Converging into one source of truth"}
      </div>
      <div className="hk-onboard-convergence-row">
        <div className="hk-onboard-convergence-sources">
          {sources.map((s) => (
            <Card key={s.adapter} className="hk-onboard-source-chip">
              <span className="hk-onboard-source-monogram">{s.monogram}</span>
              <span className="hk-onboard-source-name">{s.name}</span>
              <span className="hk-onboard-source-meta">
                {s.fileCount} file{s.fileCount === 1 ? "" : "s"}
                {s.conflictCount > 0 && (
                  <span className="hk-onboard-source-drift" data-tone="warning">
                    {" "}
                    · {s.conflictCount} drift
                  </span>
                )}
              </span>
            </Card>
          ))}
        </div>
        {!isLowHarnessCount && <div className="hk-onboard-convergence-lines" aria-hidden="true" />}
        <Card className="hk-onboard-destination-card" padding="md">
          <div className="hk-onboard-destination-title">harness.yaml</div>
          <div className="hk-onboard-destination-counts">
            <span>
              <strong>{destination.pluginCount}</strong> plugins
            </span>
            <span>
              <strong>{destination.mcpServerCount}</strong> mcp servers
            </span>
            <span>
              <strong>{destination.skillCount}</strong> skills
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Step 3: harness.yaml preview ────────────────────────────────────

function PreviewStep({
  harnessYaml,
  reveal,
  onAdvance,
}: {
  harnessYaml: string | null;
  reveal: SprawlReveal | null;
  onAdvance: () => void;
}) {
  return (
    <div className="hk-onboard-preview">
      <div className="hk-onboard-section-label">Synthesized from your existing configs</div>
      <h1 className="hk-onboard-preview-title">harness.yaml</h1>
      <p className="hk-onboard-lede">
        Every value below carries provenance back to the file it came from
        {reveal && reveal.convergence.sources.length > 0
          ? ` — ${reveal.convergence.sources.map((s) => s.name).join(", ")}.`
          : "."}
      </p>
      <Card className="hk-onboard-editor-card" padding="none">
        <Suspense fallback={<div className="hk-onboard-editor-loading">Loading preview…</div>}>
          <div className="hk-onboard-editor-wrap">
            <MonacoEditor
              filePath="harness.yaml"
              content={harnessYaml ?? ""}
              onChange={() => {}}
              onSave={() => {}}
              readOnly
            />
          </div>
        </Suspense>
      </Card>
      <div className="hk-onboard-actions">
        <Button variant="primary" onClick={onAdvance}>
          Continue <ArrowRight size={14} strokeWidth={1.7} />
        </Button>
      </div>
    </div>
  );
}

// ── Step 4: Confirm ──────────────────────────────────────────────────

function ConfirmStep({
  reveal,
  writing,
  writeError,
  onWriteAndFinish,
  onExploreReadOnly,
}: {
  reveal: SprawlReveal | null;
  writing: boolean;
  writeError: string | null;
  onWriteAndFinish: () => void;
  onExploreReadOnly: () => void;
}) {
  return (
    <div className="hk-onboard-confirm">
      <h1 className="hk-onboard-confirm-title">Ready when you are</h1>
      <p className="hk-onboard-lede">
        {reveal && reveal.stats.harnessesFound > 0
          ? `Writing harness.yaml gives you one source of truth for ${reveal.stats.harnessesFound === 1 ? "the harness" : "all " + reveal.stats.harnessesFound + " harnesses"} we found. You can change every value afterward.`
          : "Writing harness.yaml gives you a starting point. You can change every value afterward."}
      </p>

      {writeError && <div className="hk-page-error">{writeError}</div>}

      <div className="hk-onboard-actions hk-onboard-actions-confirm">
        <Button variant="primary" onClick={onWriteAndFinish} disabled={writing}>
          {writing ? "Writing…" : "Write harness.yaml"}
        </Button>
        <Button variant="ghost" onClick={onExploreReadOnly} disabled={writing}>
          Explore read-only
        </Button>
      </div>
      <p className="hk-onboard-confirm-note">Nothing is written until you confirm.</p>
    </div>
  );
}
