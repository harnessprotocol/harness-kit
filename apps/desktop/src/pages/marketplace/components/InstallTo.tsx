import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { Button, Card } from "@harness-kit/ui";
import type { SurfaceDescriptor, SurfaceId, SurfaceScope } from "@harness-kit/core";
import type { MarketplacePlugin } from "@harness-kit/marketplace-data";
import { resolveDesktopDefinitions } from "../../../lib/definitions";
import { TauriFsProvider } from "../../../lib/harness-fs";
import { useProjectDir } from "../../../lib/project-dir";
import { surfaceLabel } from "../../../lib/surface-labels";
import { useToast } from "../../../components/ToastProvider";
import { detectDesktopPlatform } from "../../machine/machine-data";
import {
  detectSurfaces,
  identityFromInstallCommand,
  installTargets,
  planCatalogInstall,
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
export function InstallCard({ plugin }: { plugin: MarketplacePlugin }) {
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
      <InstallTo plugin={plugin} copy={copy} />
    </Card>
  );
}

function InstallTo({
  plugin,
  copy,
}: {
  plugin: MarketplacePlugin;
  copy: (text: string, label: string) => Promise<void>;
}) {
  const [project] = useProjectDir();
  const [registry, setRegistry] = useState<SurfaceDescriptor[] | null>(null);
  const [detected, setDetected] = useState<Set<SurfaceId> | null>(null);
  const [chosen, setChosen] = useState<SurfaceId | null>(null);
  const [chosenScope, setChosenScope] = useState<SurfaceScope>("user");
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
              {view.applyBlockedReason !== null && (
                <p style={{ fontSize: 12, margin: 0 }} data-testid="apply-blocked">
                  {view.applyBlockedReason}
                </p>
              )}
              {view.cli !== null && (
                <code style={{ ...CODE, flex: "none" }} data-testid="install-cli">
                  {view.cli}
                </code>
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button variant="primary" size="sm" disabled={view.applyBlockedReason !== null}>
                  Apply
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
