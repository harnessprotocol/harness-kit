import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SURFACES } from "@harness-kit/core";
import type { SurfaceDescriptor } from "@harness-kit/core";
import type { MarketplacePlugin } from "@harness-kit/marketplace-data";
import { InstallCard } from "../components/InstallTo";
import {
  buildCatalogInstallPrompt,
  identityFromInstallCommand,
  installTargets,
  planCatalogInstall,
} from "../../../lib/marketplace/install-to";

const toast = vi.fn();
let project: string | null = null;

// A registry of three: a native installer, a surface with a plugin store but
// no installer, and a surface that lists plugins as not-applicable.
const base = SURFACES.find((s) => s.id === "claude-code") as SurfaceDescriptor;
const REGISTRY: SurfaceDescriptor[] = [
  base,
  {
    ...base,
    id: "cursor",
    label: "Cursor",
    pluginInstall: undefined,
    detect: [{ scope: "user", path: ".cursor-missing" }],
  },
  { ...base, id: "pi", label: "Pi", notApplicable: ["plugin"] },
];

vi.mock("@tauri-apps/api/path", () => ({ homeDir: async () => "/home/test" }));
vi.mock("../../../lib/definitions", () => ({
  resolveDesktopDefinitions: async () => ({ surfaces: REGISTRY }),
}));
vi.mock("../../../lib/harness-fs", () => ({
  TauriFsProvider: class {
    joinPath(...parts: string[]) {
      return parts.join("/");
    }
    async exists(path: string) {
      return !path.includes("missing");
    }
  },
}));
vi.mock("../../../lib/project-dir", () => ({
  useProjectDir: () => [project, () => {}],
}));
vi.mock("../../../components/ToastProvider", () => ({ useToast: () => toast }));

const plugin = {
  name: "Research",
  slug: "research",
  installCommand: "/plugin install research@harness-kit",
} as MarketplacePlugin;

const writeText = vi.fn(async () => {});

beforeEach(() => {
  project = null;
  toast.mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

describe("install command copy", () => {
  it("copies the catalog install command and toasts", async () => {
    render(<InstallCard plugin={plugin} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy install command" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(plugin.installCommand));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Install command copied" })),
    );
  });
});

describe("Install to picker", () => {
  it("lists surfaces with a plugin store, drops not-applicable ones, marks undetected", async () => {
    render(<InstallCard plugin={plugin} />);
    const select = (await screen.findByLabelText("Surface")) as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
        "Claude Code",
        "Cursor (not detected)",
      ]),
    );
  });

  it("offers project scope only with a project selected", async () => {
    const { unmount } = render(<InstallCard plugin={plugin} />);
    await screen.findByLabelText("Surface");
    expect(screen.queryByLabelText("Scope")).toBeNull();
    unmount();
    project = "/work/app";
    render(<InstallCard plugin={plugin} />);
    expect(await screen.findByLabelText("Scope")).toBeInTheDocument();
  });

  it("supported surface: CLI, prompt and a disabled Apply that says why", async () => {
    render(<InstallCard plugin={plugin} />);
    const cli = await screen.findByTestId("install-cli");
    expect(cli.textContent).toContain("claude plugin install research@harness-kit");
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByTestId("apply-blocked").textContent).toMatch(/can't run .*installer yet/);

    fireEvent.click(screen.getByRole("button", { name: "Copy CLI command" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(cli.textContent));
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("research@harness-kit")),
    );
  });

  it("unsupported surface: no CLI, Apply disabled with the reason, prompt still copies", async () => {
    render(<InstallCard plugin={plugin} />);
    const select = (await screen.findByLabelText("Surface")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "cursor" } });
    await waitFor(() => expect(screen.queryByTestId("install-cli")).toBeNull());
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy CLI command" })).toBeDisabled();
    expect(screen.getByTestId("apply-blocked").textContent).toMatch(/no plugin installer/);
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
  });
});

describe("install-to helpers", () => {
  it("parses the identity and filters targets", () => {
    expect(identityFromInstallCommand("/plugin install a@b")).toBe("a@b");
    expect(identityFromInstallCommand("npm i foo")).toBeNull();
    expect(installTargets(REGISTRY).map((s) => s.id)).toEqual(["claude-code", "cursor"]);
  });

  it("plans a project-scope install only with a project root", () => {
    const view = planCatalogInstall({
      surface: base,
      identity: "a@b",
      scope: "project",
      projectRoot: null,
      registry: REGISTRY,
      label: "Claude Code",
    });
    expect(view.cli).toBeNull();
    expect(view.applyBlockedReason).toMatch(/project directory/);
  });

  it("builds the prompt", () => {
    const text = buildCatalogInstallPrompt({
      identity: "a@b",
      surfaceLabel: "Claude Code",
      scope: "user",
      invocation: "claude plugin install a@b",
    });
    expect(text).toContain("Install the plugin `a@b` on Claude Code at user scope");
    expect(text).toContain("claude plugin install a@b");
    expect(text).toContain("Never hand-edit the install record");
    expect(
      buildCatalogInstallPrompt({ identity: "a@b", surfaceLabel: "X", scope: "user", invocation: null }),
    ).not.toContain("installer invocation");
  });
});
