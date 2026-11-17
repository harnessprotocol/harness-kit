import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { Button, Card } from "@harness-kit/ui";
import type { SurfaceDescriptor, SurfaceId, SurfaceScope } from "@harness-kit/core";
import type { MarketplacePlugin } from "@harness-kit/marketplace-data";
import { resolveDesktopDefinitions } from "../../../lib/definitions";
import { TauriFsProvider } from "../../../lib/harness-fs";
import { TauriProcessRunner } from "../../../lib/process-runner";
import { grantProjectDir, useProjectDir } from "../../../lib/project-dir";
import { surfaceLabel } from "../../../lib/surface-labels";
import { useToast } from "../../../components/ToastProvider";
import { detectDesktopPlatform } from "../../machine/machine-data";
import {
  applyCatalogInstall,
  detectSurfaces,
  identityFromInstallCommand,
  installTargets,
  planCatalogInstall,
  readKnownMarketplaces,
  supportsProjectScope,
} from "../../../lib/marketplace/install-to";

const HEADING = {
  fontSize: "10px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--fg-subtle)",
  margin: "0 0 6px",
} as const;

const CODE = {
  display: "block",
  flex: 1,
  minWidth: 0,
  background: "var(--bg-base)",
  borderRadius: "5px",
  padding: "7px 9px",
  fontSize: "10px",
  fontFamily: "ui-monospace, monospace",
  color: "var(--accent-text)",
  wordBreak: "break-all",
} as const;

/**
 * The detail pane's Install card: the catalog's install command with a copy
 * control, and "Install to …" with a surface picker that yields the same
 * three actions as the Machine drawer (AC-27).
 */
export function InstallCard({
  plugin,
  marketplaceName,
  marketplaceSource,
}: {
  plugin: MarketplacePlugin;
  marketplaceName: string;
  marketplaceSource: string;
}) {
  const toast = useToast();
  const copy = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: `${label} copied`, variant: "success" });
      } catch (error) {
        toast({
          title: `Couldn't copy the ${label.toLowerCase()}`,
          message: error instanceof Error ? error.message : String(error),
          variant: "warning",
        });
      }
    },
    [toast],
  );

  return (
    <Card padding="sm" style={{ marginBottom: "16px" }}>
      <p style={HEADING}>Install</p>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <code style={CODE}>{plugin.installCommand}</code>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Copy install command"
          onClick={() => void copy(plugin.installCommand, "Install command")}
        >
          Copy
        </Button>
      </div>
      <InstallTo
        plugin={plugin}
        marketplaceName={marketplaceName}
        marketplaceSource={marketplaceSource}
        copy={copy}
      />
    </Card>
  );
}

function InstallTo({
  plugin,
  marketplaceName,
  marketplaceSource,
  copy,
}: {
  plugin: MarketplacePlugin;
  marketplaceName: string;
  marketplaceSource: string;
  copy: (text: string, label: string) => Promise<void>;
}) {
  const [project] = useProjectDir();
  const [registry, setRegistry] = useState<SurfaceDescriptor[] | null>(null);
  const [detected, setDetected] = useState<Set<SurfaceId> | null>(null);
  const [chosen, setChosen] = useState<SurfaceId | null>(null);
  const [chosenScope, setChosenScope] = useState<SurfaceScope>("user");
  const [applying, setApplying] = useState(false);
  const toast = useToast();
  const surfaceId = useId();
  const scopeId = useId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { surfaces } = await resolveDesktopDefinitions();
      if (cancelled) return;
      setRegistry(surfaces);
      try {
        const home = await homeDir();
        const found = await detectSurfaces(new TauriFsProvider(home), installTargets(surfaces), {
          home,
          project,
          platform: detectDesktopPlatform(),
        });
        if (!cancelled) setDetected(found);
      } catch {
        // Detection is a hint; without it every surface stays listed, unmarked.
      }
    })().catch(() => {
      if (!cancelled) setRegistry([]);
    });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const targets = useMemo(() => (registry ? installTargets(registry) : []), [registry]);
  const surface = targets.find((item) => item.id === chosen) ?? targets[0];
  const identity = identityFromInstallCommand(plugin.installCommand);
  const projectOffered = project !== null && surface !== undefined && supportsProjectScope(surface);
  const scope: SurfaceScope = projectOffered ? chosenScope : "user";

  const view = useMemo(() => {
    if (!registry || !surface || identity === null) return null;
    return planCatalogInstall({
      surface,
      identity,
      scope,
      projectRoot: scope === "project" ? project : null,
      registry,
      label: surfaceLabel(surface.id),
    });
  }, [registry, surface, identity, scope, project]);

  // AC-9: Apply is enabled only when the native installer's binary is on PATH.
  // Pending probes leave Apply as planned (the broker re-checks at Apply time);
  // a result for a binary that is no longer the current one is ignored.
  const binary =
    view?.plan.kind === "native" && view.plan.plan.supported ? view.plan.plan.binary : null;
  const [probe, setProbe] = useState<{ binary: string; found: boolean } | null>(null);
  useEffect(() => {
    if (binary === null) return;
    let stale = false;
    new TauriProcessRunner()
      .which(binary)
      .then(
        (found) => found !== null,
        () => false,
      )
      .then((found) => {
        if (!stale) setProbe({ binary, found });
      });
    return () => {
      stale = true;
    };
  }, [binary]);
  const missingBinary = binary !== null && probe?.binary === binary && !probe.found;
  const blockedReason = missingBinary
    ? `${binary} is not installed or not on PATH. Copy the CLI command or the agent prompt instead.`
    : (view?.applyBlockedReason ?? null);

  const apply = async () => {
    if (!view || !surface || applying || blockedReason !== null) return;
    const label = surfaceLabel(surface.id);
    setApplying(true);
    try {
      if (scope === "project" && project !== null && !(await grantProjectDir(project))) {
        toast({
          title: `Couldn't install ${plugin.name} on ${label}`,
          message: "Reopen the project folder, then try again.",
          variant: "warning",
        });
        return;
      }
      const home = await homeDir();
      const fs = new TauriFsProvider(home);
      const outcome = await applyCatalogInstall({
        view,
        surface,
        plugin,
        marketplaceName,
        marketplaceSource,
        runner: new TauriProcessRunner(),
        fs,
        home,
        now: new Date().toISOString(),
        readKnownMarketplaces: () => readKnownMarketplaces(fs, home),
      });
      if (outcome.status !== "refused" && outcome.status !== "failed") {
        const note = outcome.details?.note;
        toast({
          title: `Installed ${plugin.name} on ${label}`,
          ...(typeof note === "string" ? { message: note } : {}),
          variant: "success",
        });
      } else {
        toast({
          title: `Couldn't install ${plugin.name} on ${label}`,
          message:
            outcome.reason +
            ("files" in outcome && Array.isArray(outcome.files) && outcome.files.length > 0
              ? `\nAlready written: ${outcome.files.join(", ")}`
              : ""),
          variant: "warning",
        });
      }
    } catch (error) {
      toast({
        title: `Couldn't install ${plugin.name} on ${label}`,
        message: error instanceof Error ? error.message : String(error),
        variant: "warning",
      });
    } finally {
      setApplying(false);
    }
  };

  const optionLabel = (item: SurfaceDescriptor) =>
    `${surfaceLabel(item.id)}${detected !== null && !detected.has(item.id) ? " (not detected)" : ""}`;

  return (
    <div
      role="group"
      aria-label="Install to"
      style={{ display: "grid", gap: 10, marginTop: 14 }}
    >
      <p style={{ ...HEADING, margin: 0 }}>Install to…</p>
      {registry === null ? (
        <p style={{ fontSize: 12, margin: 0 }}>Reading the surface registry…</p>
      ) : targets.length === 0 ? (
        <p style={{ fontSize: 12, margin: 0 }}>No surface here can receive a plugin.</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "minmax(0, 1fr) auto" }}>
            <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <label className="hk-label" htmlFor={surfaceId}>
                Surface
              </label>
              <select
                id={surfaceId}
                className="hk-select"
                style={{ minWidth: 0 }}
                value={surface?.id ?? ""}
                onChange={(event) => setChosen(event.target.value as SurfaceId)}
              >
                {targets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {optionLabel(item)}
                  </option>
                ))}
              </select>
            </div>
            {projectOffered && (
              <div style={{ display: "grid", gap: 4 }}>
                <label className="hk-label" htmlFor={scopeId}>
                  Scope
                </label>
                <select
                  id={scopeId}
                  className="hk-select"
                  value={scope}
                  onChange={(event) => setChosenScope(event.target.value as SurfaceScope)}
                >
                  <option value="user">User</option>
                  <option value="project">This project</option>
                </select>
              </div>
            )}
          </div>

          {identity === null && (
            <p style={{ fontSize: 12, margin: 0 }}>
              This plugin&apos;s install command has no name@marketplace identity, so no
              installer command can be built.
            </p>
          )}

          {view && (
            <>
              {blockedReason !== null && (
                <p style={{ fontSize: 12, margin: 0 }} data-testid="apply-blocked">
                  {blockedReason}
                </p>
              )}
              {view.cli !== null && (
                <code style={{ ...CODE, flex: "none" }} data-testid="install-cli">
                  {view.cli}
                </code>
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={blockedReason !== null || applying}
                  onClick={() => void apply()}
                >
                  {applying ? "Installing…" : "Apply"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={view.cli === null}
                  onClick={() => view.cli !== null && void copy(view.cli, "CLI command")}
                >
                  Copy CLI command
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void copy(view.prompt, "Agent prompt")}
                >
                  Copy prompt
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
